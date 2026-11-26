/**
 * Vector Embedding Dot-Product & Cosine Similarity Benchmark Profiler.
 * 
 * Measures high-dimensional vector similarity scoring throughput,
 * SIMD-like batch dot product performance, and latency percentiles.
 */

export interface VectorBenchmarkResult {
  dimension: number;
  batchSize: number;
  totalComparisons: number;
  p50Microseconds: number;
  p90Microseconds: number;
  p99Microseconds: number;
  throughputVectorsPerSec: number;
}

export class EmbeddingBenchmarkProfiler {
  /**
   * Computes cosine similarity between two Float32Array vectors.
   */
  public static cosineSimilarity(a: Float32Array, b: Float32Array): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    const len = a.length;

    for (let i = 0; i < len; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Executes a benchmark run comparing a query vector against a candidate matrix.
   */
  public runBenchmark(
    dimension: number,
    candidateCount: number,
    iterations: number = 20
  ): VectorBenchmarkResult {
    // Generate synthetic normalized vectors
    const query = new Float32Array(dimension);
    for (let i = 0; i < dimension; i++) query[i] = (i % 10) * 0.1;

    const candidates: Float32Array[] = [];
    for (let c = 0; c < candidateCount; c++) {
      const vec = new Float32Array(dimension);
      for (let i = 0; i < dimension; i++) {
        vec[i] = ((c + i) % 10) * 0.1;
      }
      candidates.push(vec);
    }

    const latenciesMicros: number[] = [];

    for (let iter = 0; iter < iterations; iter++) {
      const start = performance.now();
      for (let c = 0; c < candidateCount; c++) {
        EmbeddingBenchmarkProfiler.cosineSimilarity(query, candidates[c]);
      }
      const elapsedMicros = (performance.now() - start) * 1000;
      latenciesMicros.push(elapsedMicros);
    }

    latenciesMicros.sort((a, b) => a - b);
    const p50 = latenciesMicros[Math.floor(latenciesMicros.length * 0.5)];
    const p90 = latenciesMicros[Math.floor(latenciesMicros.length * 0.9)];
    const p99 = latenciesMicros[Math.floor(latenciesMicros.length * 0.99)];

    const avgElapsedSec = (latenciesMicros.reduce((acc, v) => acc + v, 0) / latenciesMicros.length) / 1_000_000;
    const throughput = avgElapsedSec > 0 ? (candidateCount / avgElapsedSec) : 0;

    return {
      dimension,
      batchSize: candidateCount,
      totalComparisons: candidateCount * iterations,
      p50Microseconds: Number(p50.toFixed(2)),
      p90Microseconds: Number(p90.toFixed(2)),
      p99Microseconds: Number(p99.toFixed(2)),
      throughputVectorsPerSec: Math.round(throughput),
    };
  }
}
