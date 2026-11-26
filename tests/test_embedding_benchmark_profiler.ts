import assert from 'node:assert/strict';
import { EmbeddingBenchmarkProfiler } from '../src/embedding_benchmark_profiler.ts';

export function runEmbeddingBenchmarkProfilerTests(): boolean {
  console.log('[AEGIS-EDGE] Running EmbeddingBenchmarkProfiler tests...');

  // Test 1: Cosine similarity calculation correctness
  const v1 = new Float32Array([1, 0, 0]);
  const v2 = new Float32Array([1, 0, 0]);
  const v3 = new Float32Array([0, 1, 0]);

  const simIdentical = EmbeddingBenchmarkProfiler.cosineSimilarity(v1, v2);
  assert.ok(Math.abs(simIdentical - 1.0) < 1e-5, 'Identical vectors must have similarity 1.0');

  const simOrthogonal = EmbeddingBenchmarkProfiler.cosineSimilarity(v1, v3);
  assert.ok(Math.abs(simOrthogonal - 0.0) < 1e-5, 'Orthogonal vectors must have similarity 0.0');

  // Test 2: Benchmark run metrics & quantiles
  const profiler = new EmbeddingBenchmarkProfiler();
  const result = profiler.runBenchmark(128, 50, 10);

  assert.equal(result.dimension, 128);
  assert.equal(result.batchSize, 50);
  assert.equal(result.totalComparisons, 500);
  assert.ok(result.p50Microseconds >= 0, 'P50 latency must be non-negative');
  assert.ok(result.p90Microseconds >= result.p50Microseconds, 'P90 must be >= P50');
  assert.ok(result.p99Microseconds >= result.p90Microseconds, 'P99 must be >= P90');
  assert.ok(result.throughputVectorsPerSec > 0, 'Throughput must be positive');

  console.log('✓ EmbeddingBenchmarkProfiler tests passed successfully.');
  return true;
}
