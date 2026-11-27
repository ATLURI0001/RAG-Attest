import assert from 'node:assert/strict';
import { RetrieverTimeoutCircuitBreaker } from '../src/retriever_timeout_circuit_breaker.ts';

export function runRetrieverTimeoutCircuitBreakerTests(): boolean {
  const cb = new RetrieverTimeoutCircuitBreaker(2);
  assert.equal(cb.isOpen(), false);
  cb.recordFailure();
  cb.recordFailure();
  assert.equal(cb.isOpen(), true);
  return true;
}
