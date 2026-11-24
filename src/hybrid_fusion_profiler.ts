/**
 * Hybrid Vector & Lexical Reciprocal Rank Fusion (RRF) Benchmark Profiler.
 *
 * Implements weighted Reciprocal Rank Fusion combining dense semantic embeddings
 * and sparse lexical BM25 rankings, calculates inter-rank concordance, and provides
 * latency benchmarking with percentile profiling.
 */

export interface RankedDoc {
  id: string;
  score: number;
}

export interface RRFOptions {
  k?: number;
  denseWeight?: number;
  sparseWeight?: number;
  topK?: number;
}

export interface FusedResult {
  id: string;
  rrfScore: number;
  denseRank: number | null;
  sparseRank: number | null;
}

export interface BenchmarkProfileResult {
  iterations: number;
  totalDurationMs: number;
  opsPerSecond: number;
  p50Ms: number;
  p90Ms: number;
  p99Ms: number;
  fusedDocumentCount: number;
}

/**
 * Computes weighted Reciprocal Rank Fusion across dense and sparse ranked document sets.
 * Formula: RRF(d) = w_dense / (k + rank_dense(d)) + w_sparse / (k + rank_sparse(d))
 */
export function computeRRF(
  denseList: RankedDoc[],
  sparseList: RankedDoc[],
  options: RRFOptions = {}
): FusedResult[] {
  const k = typeof options.k === 'number' && options.k > 0 ? options.k : 60;
  const denseWeight = typeof options.denseWeight === 'number' && options.denseWeight >= 0 ? options.denseWeight : 1.0;
  const sparseWeight = typeof options.sparseWeight === 'number' && options.sparseWeight >= 0 ? options.sparseWeight : 1.0;
  const topK = typeof options.topK === 'number' && options.topK > 0 ? options.topK : 50;

  const docMap = new Map<string, { rrfScore: number; denseRank: number | null; sparseRank: number | null }>();

  // Process dense ranking (1-based ranks)
  for (let i = 0; i < denseList.length; i++) {
    const doc = denseList[i];
    if (!doc || !doc.id) continue;
    const rank = i + 1;
    const contribution = denseWeight / (k + rank);

    if (!docMap.has(doc.id)) {
      docMap.set(doc.id, { rrfScore: contribution, denseRank: rank, sparseRank: null });
    } else {
      const entry = docMap.get(doc.id)!;
      entry.rrfScore += contribution;
      entry.denseRank = rank;
    }
  }

  // Process sparse ranking
  for (let i = 0; i < sparseList.length; i++) {
    const doc = sparseList[i];
    if (!doc || !doc.id) continue;
    const rank = i + 1;
    const contribution = sparseWeight / (k + rank);

    if (!docMap.has(doc.id)) {
      docMap.set(doc.id, { rrfScore: contribution, denseRank: null, sparseRank: rank });
    } else {
      const entry = docMap.get(doc.id)!;
      entry.rrfScore += contribution;
      entry.sparseRank = rank;
    }
  }

  // Sort descending by RRF score
  const results: FusedResult[] = [];
  for (const [id, data] of docMap.entries()) {
    results.push({
      id,
      rrfScore: Number(data.rrfScore.toFixed(6)),
      denseRank: data.denseRank,
      sparseRank: data.sparseRank,
    });
  }

  results.sort((a, b) => b.rrfScore - a.rrfScore);
  return results.slice(0, topK);
}

/**
 * Calculates rank concordance / overlap ratio between dense and sparse results.
 * Returns ratio in [0, 1] of shared documents in top-K.
 */
export function calculateRankConcordance(
  denseList: RankedDoc[],
  sparseList: RankedDoc[],
  topK: number = 20
): number {
  if (denseList.length === 0 || sparseList.length === 0 || topK <= 0) return 0.0;

  const denseTop = new Set(denseList.slice(0, topK).map((d) => d.id));
  const sparseTop = new Set(sparseList.slice(0, topK).map((d) => d.id));

  let shared = 0;
  for (const id of denseTop) {
    if (sparseTop.has(id)) shared++;
  }

  return Number((shared / Math.max(1, Math.min(denseTop.size, sparseTop.size))).toFixed(4));
}

/**
 * Micro-benchmark profiler for hybrid fusion execution.
 */
export class HybridFusionProfiler {
  public benchmarkFusion(
    denseList: RankedDoc[],
    sparseList: RankedDoc[],
    iterations: number = 1000,
    options: RRFOptions = {}
  ): BenchmarkProfileResult {
    if (iterations <= 0) {
      throw new RangeError('iterations must be strictly positive');
    }

    const latencies: number[] = [];
    let lastFusedCount = 0;

    const startTotal = performance.now();
    for (let i = 0; i < iterations; i++) {
      const t0 = performance.now();
      const fused = computeRRF(denseList, sparseList, options);
      const t1 = performance.now();
      latencies.push(t1 - t0);
      lastFusedCount = fused.length;
    }
    const endTotal = performance.now();
    const totalDurationMs = Math.max(0.001, endTotal - startTotal);

    latencies.sort((a, b) => a - b);
    const p50Ms = latencies[Math.floor(latencies.length * 0.5)] ?? 0;
    const p90Ms = latencies[Math.floor(latencies.length * 0.9)] ?? 0;
    const p99Ms = latencies[Math.floor(latencies.length * 0.99)] ?? 0;

    return {
      iterations,
      totalDurationMs,
      opsPerSecond: Number(((iterations / totalDurationMs) * 1000).toFixed(1)),
      p50Ms: Number(p50Ms.toFixed(4)),
      p90Ms: Number(p90Ms.toFixed(4)),
      p99Ms: Number(p99Ms.toFixed(4)),
      fusedDocumentCount: lastFusedCount,
    };
  }
}
