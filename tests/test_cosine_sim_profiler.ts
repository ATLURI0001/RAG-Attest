import assert from 'node:assert/strict';
import { benchmarkCosineSimilarity } from '../src/cosine_sim_profiler.ts';

export function runCosineSimProfilerTests(): boolean {
  const res = benchmarkCosineSimilarity(64, 200);
  assert.ok(res.opsPerSec > 0);
  console.log('✓ CosineSimProfiler tests passed');
  return true;
}
