import assert from 'node:assert/strict';
import {
  RerankerCircuitBreaker,
} from '../src/core/reranker_circuit_breaker.ts';

export async function runRerankerCircuitBreakerTests(): Promise<boolean> {
  console.log('  Testing RerankerCircuitBreaker & Pass-Through Fallback...');

  const candidates = [
    { id: 'c1', text: 'Overview of transformer architecture', initialScore: 0.72 },
    { id: 'c2', text: 'Cross-encoder scoring and cross-attention', initialScore: 0.91 },
    { id: 'c3', text: 'Quantized embedding lookup at the edge', initialScore: 0.65 },
  ];

  const breaker = new RerankerCircuitBreaker({
    failureThreshold: 2,
    recoveryTimeoutMs: 200,
    maxRerankTimeoutMs: 50,
  });

  // 1. Normal successful rerank
  {
    const res = await breaker.executeRerank('cross-attention', candidates, async () => {
      return [
        { id: 'c2', text: 'Cross-encoder scoring and cross-attention', finalScore: 0.98, rank: 1 },
        { id: 'c1', text: 'Overview of transformer architecture', finalScore: 0.60, rank: 2 },
      ];
    });

    assert.equal(res.isDegraded, false);
    assert.equal(res.circuitState, 'CLOSED');
    assert.equal(res.results.length, 2);
    assert.equal(res.results[0].id, 'c2');
  }

  // 2. Timeout triggers fallback pass-through
  {
    const res = await breaker.executeRerank('slow query', candidates, async () => {
      // Simulate slow reranker exceeding 50ms
      await new Promise((r) => setTimeout(r, 80));
      return [];
    });

    assert.equal(res.isDegraded, true);
    assert.equal(res.tripReason, 'TIMEOUT');
    assert.equal(res.results.length, 3);
    assert.equal(res.results[0].id, 'c2'); // initialScore 0.91 highest
    assert.equal(res.results[1].id, 'c1'); // initialScore 0.72
    assert.equal(res.results[2].id, 'c3'); // initialScore 0.65
  }

  // 3. Consecutive failure trips to OPEN state
  {
    breaker.reset();
    const t0 = 1000;

    // Fail 1
    const r1 = await breaker.executeRerank('f1', candidates, async () => { throw new Error('Rerank API down'); }, t0);
    assert.equal(r1.isDegraded, true);
    assert.equal(breaker.getState(t0), 'CLOSED');

    // Fail 2 -> trips circuit to OPEN
    const r2 = await breaker.executeRerank('f2', candidates, async () => { throw new Error('Rerank API down'); }, t0);
    assert.equal(r2.isDegraded, true);
    assert.equal(breaker.getState(t0), 'OPEN');

    // Fast-reject during OPEN
    const r3 = await breaker.executeRerank('f3', candidates, async () => { return []; }, t0 + 10);
    assert.equal(r3.isDegraded, true);
    assert.equal(r3.tripReason, 'CIRCUIT_OPEN');
  }

  // 4. Recovery lifecycle: OPEN -> HALF_OPEN -> CLOSED
  {
    const tOpen = 2000;
    breaker.reset();
    await breaker.executeRerank('f1', candidates, async () => { throw new Error('err'); }, tOpen);
    await breaker.executeRerank('f2', candidates, async () => { throw new Error('err'); }, tOpen);
    assert.equal(breaker.getState(tOpen), 'OPEN');

    // After recovery timeout (200ms)
    const tHalf = tOpen + 250;
    assert.equal(breaker.getState(tHalf), 'HALF_OPEN');

    // Successful probe closes the circuit
    const rSuccess = await breaker.executeRerank(
      'probe',
      candidates,
      async () => [{ id: 'c1', text: 'text', finalScore: 0.9, rank: 1 }],
      tHalf
    );
    assert.equal(rSuccess.isDegraded, false);
    assert.equal(breaker.getState(tHalf), 'CLOSED');
  }

  console.log('  ✓ RerankerCircuitBreaker tests PASSED');
  return true;
}
