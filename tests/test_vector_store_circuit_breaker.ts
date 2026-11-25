import assert from 'node:assert/strict';
import {
  VectorStoreCircuitBreaker,
} from '../src/core/vector_store_circuit_breaker.ts';

export async function runVectorStoreCircuitBreakerTests(): Promise<boolean> {
  console.log('  Testing VectorStoreCircuitBreaker & Offline Fallback...');

  const localDocs = [
    { id: 'doc1', text: 'Quarterly financial report with revenue and margin metrics' },
    { id: 'doc2', text: 'Kubernetes cluster deployment guidelines and pod security' },
    { id: 'doc3', text: 'Vector embeddings and cosine distance indexing performance' },
  ];

  const breaker = new VectorStoreCircuitBreaker({
    failureThreshold: 2,
    recoveryTimeoutMs: 500,
    maxQueryTimeoutMs: 50,
  });

  // 1. Successful remote vector search in CLOSED state
  {
    const res = await breaker.executeSearch('financial report', localDocs, async () => {
      return [{ id: 'doc1', text: 'Quarterly financial report', score: 0.95 }];
    });

    assert.equal(res.isDegraded, false);
    assert.equal(res.circuitState, 'CLOSED');
    assert.equal(res.results.length, 1);
    assert.equal(res.results[0].id, 'doc1');
  }

  // 2. Intercept remote failure and switch to local lexical fallback
  {
    const res = await breaker.executeSearch('Kubernetes pod', localDocs, async () => {
      throw new Error('Connection refused: remote vector store unreachable');
    });

    assert.equal(res.isDegraded, true);
    assert.equal(res.tripReason, 'CONNECTION_ERROR');
    assert.ok(res.results.length >= 1);
    assert.equal(res.results[0].id, 'doc2');
  }

  // 3. Trip circuit to OPEN on consecutive failures
  {
    const t0 = 10000;
    // Reset and force 2 failures
    breaker.reset();
    await breaker.executeSearch('test', localDocs, async () => { throw new Error('fail 1'); }, t0);
    assert.equal(breaker.getState(t0), 'CLOSED');

    await breaker.executeSearch('test', localDocs, async () => { throw new Error('fail 2'); }, t0);
    assert.equal(breaker.getState(t0), 'OPEN');

    // Next call should fast-path without invoking remote function
    let called = false;
    const fastRes = await breaker.executeSearch('revenue', localDocs, async () => {
      called = true;
      return [];
    }, t0 + 10);

    assert.equal(called, false);
    assert.equal(fastRes.isDegraded, true);
    assert.equal(fastRes.tripReason, 'CONSECUTIVE_FAILURES');
    assert.equal(fastRes.results[0].id, 'doc1');
  }

  // 4. Transition from OPEN to HALF_OPEN after recovery window and reset on success
  {
    const t0 = 10000;
    const t1 = t0 + 600; // > 500ms recoveryTimeoutMs
    assert.equal(breaker.getState(t1), 'HALF_OPEN');

    const healthyRes = await breaker.executeSearch('financial', localDocs, async () => {
      return [{ id: 'doc1', text: 'Quarterly financial report', score: 0.99 }];
    }, t1);

    assert.equal(healthyRes.isDegraded, false);
    assert.equal(healthyRes.circuitState, 'CLOSED');
    assert.equal(breaker.getState(t1), 'CLOSED');
  }

  console.log('  ✓ VectorStoreCircuitBreaker tests PASSED');
  return true;
}
