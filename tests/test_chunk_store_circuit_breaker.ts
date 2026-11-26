import assert from 'node:assert/strict';
import { ChunkStoreCircuitBreaker } from '../src/chunk_store_circuit_breaker.ts';

export function runChunkStoreCircuitBreakerTests(): boolean {
  const cb = new ChunkStoreCircuitBreaker(2, 5000);
  assert.throws(() => cb.call(() => { throw new Error('io'); }));
  assert.throws(() => cb.call(() => { throw new Error('io'); }));
  assert.throws(() => cb.call(() => 'ok'), /circuit open/);
  console.log('✓ ChunkStoreCircuitBreaker tests passed');
  return true;
}
