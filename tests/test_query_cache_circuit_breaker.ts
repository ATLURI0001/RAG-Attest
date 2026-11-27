import assert from 'node:assert/strict';
import { QueryCacheCircuitBreaker } from '../src/query_cache_circuit_breaker.ts';

export function runQueryCacheCircuitBreakerTests(): boolean {
  const cb = new QueryCacheCircuitBreaker(2);
  for (let i = 0; i < 2; i++) {
    try { cb.call(() => { throw new Error('miss'); }); } catch {}
  }
  try { cb.call(() => 'x'); assert.fail('should throw'); }
  catch (e: any) { assert.match(e.message, /cache circuit open/); }
  return true;
}
