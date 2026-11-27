import assert from 'node:assert/strict';

// aegis-rag-edge: query cache circuit breaker
export class QueryCacheCircuitBreaker {
  #fails = 0;
  #max: number;
  #open = false;
  constructor(max = 3) { this.#max = max; }
  call(fn: () => unknown) {
    if (this.#open) throw new Error('cache circuit open');
    try { const r = fn(); this.#fails = 0; return r; }
    catch (e) { if (++this.#fails >= this.#max) this.#open = true; throw e; }
  }
}
