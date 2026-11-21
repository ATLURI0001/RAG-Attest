/**
 * AEGIS-EDGE Rate Governor & Token Meter Tests
 */

import { EdgeRateGovernor } from '../src/edge/rate_governor.ts';

export function runRateGovernorTests(): boolean {
  console.log('  Testing EdgeRateGovernor & Multi-Tenant Token Metering...');

  const governor = new EdgeRateGovernor({
    maxRequestsBurst: 3,
    requestsRefillPerSec: 10,
    maxTokensBurst: 2000,
    tokensRefillPerSec: 1000,
    idleTtlMs: 50,
  });

  // Test 1: Basic allowance within burst limits
  const r1 = governor.tryAcquire('tenant_alpha', 500);
  const r2 = governor.tryAcquire('tenant_alpha', 500);
  const r3 = governor.tryAcquire('tenant_alpha', 500);
  if (!r1.allowed || !r2.allowed || !r3.allowed) {
    throw new Error('Valid burst requests should be allowed');
  }

  // Test 2: Request capacity exhaustion
  const r4 = governor.tryAcquire('tenant_alpha', 100);
  if (r4.allowed) {
    throw new Error('4th request should be throttled due to request burst exhaustion');
  }

  // Test 3: Tenant isolation - tenant_beta should have its own full bucket
  const rb1 = governor.tryAcquire('tenant_beta', 1000);
  if (!rb1.allowed) {
    throw new Error('Tenant beta should have independent quota allocation');
  }

  // Test 4: Token budget exhaustion
  const rb2 = governor.tryAcquire('tenant_beta', 1500); // 1000 + 1500 > 2000 burst
  if (rb2.allowed) {
    throw new Error('Request exceeding token budget should be throttled');
  }

  // Test 5: Idle eviction
  const t0 = Date.now();
  const evictedImmediate = governor.evictIdleTenants(t0);
  if (evictedImmediate !== 0) {
    throw new Error('Immediate eviction should not remove active tenants');
  }

  const evictedAfterTtl = governor.evictIdleTenants(t0 + 100); // 100ms > 50ms TTL
  if (evictedAfterTtl !== 2) {
    throw new Error(`Expected 2 tenants evicted after TTL, got ${evictedAfterTtl}`);
  }

  const tel = governor.getTelemetry();
  if (tel.activeTenants !== 0 || tel.evictedTenants !== 2) {
    throw new Error('Telemetry active or evicted tenant count mismatch');
  }

  console.log('    ✔ EdgeRateGovernor multi-tenant rate and token metering verified.');
  return true;
}
