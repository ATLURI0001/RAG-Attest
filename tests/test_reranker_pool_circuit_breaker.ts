import assert from 'node:assert/strict';
import { RerankerPoolCircuitBreaker } from '../src/reranker_pool_circuit_breaker.ts';

export function runRerankerPoolCircuitBreakerTests(): boolean {
  const cb = new RerankerPoolCircuitBreaker(2, 5000);
  assert.throws(() => cb.call(() => { throw new Error('503'); }));
  assert.throws(() => cb.call(() => { throw new Error('503'); }));
  assert.throws(() => cb.call(() => 'ok'), /circuit open/);
  console.log('✓ RerankerPoolCircuitBreaker tests passed');
  return true;
}
