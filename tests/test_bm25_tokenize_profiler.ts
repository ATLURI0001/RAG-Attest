import assert from 'node:assert/strict';
import { benchmarkBm25Tokenize } from '../src/bm25_tokenize_profiler.ts';

export function runBm25TokenizeProfilerTests(): boolean {
  const res = benchmarkBm25Tokenize('Retrieval augmented generation edge verifier', 100);
  assert.ok(res.opsPerSec > 0);
  console.log('✓ Bm25TokenizeProfiler tests passed');
  return true;
}
