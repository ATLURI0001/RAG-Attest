import assert from 'node:assert/strict';
import { EmbeddingApiCircuitBreaker } from '../src/embedding_api_circuit_breaker.ts';

export function runEmbeddingApiCircuitBreakerTests(): boolean {
  console.log('[AEGIS-EDGE] Running EmbeddingApiCircuitBreaker tests...');
  const cb = new EmbeddingApiCircuitBreaker(2, 100);
  const fail = () => { throw new Error('timeout'); };

  cb.embed('hello', fail, 1000);
  cb.embed('world', fail, 1010);
  assert.equal(cb.getState(), 'OPEN');

  const fb = cb.embed('test', () => [1, 2, 3], 1050);
  assert.equal(fb.fallback, true);

  const rec = cb.embed('test', () => [1, 2, 3], 1200);
  assert.equal(rec.fallback, false);
  assert.equal(cb.getState(), 'CLOSED');

  console.log('✓ EmbeddingApiCircuitBreaker tests passed successfully.');
  return true;
}
