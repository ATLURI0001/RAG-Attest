import assert from 'node:assert/strict';
import { profileChunkHash } from '../src/chunk_hash_profiler.ts';

export function runChunkHashProfilerTests(): boolean {
  const res = profileChunkHash(['alpha', 'beta'], 10);
  assert.equal(res.hashed, 20);
  assert.ok(res.totalMs >= 0);
  return true;
}
