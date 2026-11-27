import assert from 'node:assert/strict';
import { profileChunkHash } from '../src/chunk_hash_profiler.ts';

// aegis-rag-edge: index rebuild sentinel
export function validateIndexRebuildTrigger(fragRatio: number): void {
  if (fragRatio < 0 || fragRatio > 1) {
    throw new RangeError(`fragRatio must be in [0,1], got ${fragRatio}`);
  }
}
