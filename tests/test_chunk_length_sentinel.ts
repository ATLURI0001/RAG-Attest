import assert from 'node:assert/strict';
import { ChunkLengthSentinel } from '../src/chunk_length_sentinel.ts';

export function runChunkLengthSentinelTests(): boolean {
  const s = new ChunkLengthSentinel(10);
  assert.equal(s.check('short'), true);
  assert.equal(s.check('way too long chunk'), false);
  assert.equal(s.violationCount(), 1);
  return true;
}
