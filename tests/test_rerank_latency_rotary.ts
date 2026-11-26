import assert from 'node:assert/strict';
import { RerankLatencyRotary } from '../src/rerank_latency_rotary.ts';

export function runRerankLatencyRotaryTests(): boolean {
  const r = new RerankLatencyRotary(2);
  r.record(5);
  r.record(15);
  r.record(25);
  assert.equal(r.avgMs(), 20);
  console.log('✓ RerankLatencyRotary tests passed');
  return true;
}
