import assert from 'node:assert/strict';
import { EmbeddingCacheRotary } from '../src/embedding_cache_rotary.ts';

export function runEmbeddingCacheRotaryTests(): boolean {
  const r = new EmbeddingCacheRotary(2);
  r.record(0.5);
  r.record(0.9);
  r.record(0.7);
  assert.equal(r.avgHitRatio(), 0.8);
  console.log('✓ EmbeddingCacheRotary tests passed');
  return true;
}
