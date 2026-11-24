import assert from 'node:assert';
import {
  SemanticCacheTelemetryRotary,
  DEFAULT_CACHE_TELEMETRY_CONFIG,
} from '../src/core/cache_telemetry.ts';

export function runCacheTelemetryTests(): boolean {
  console.log('  Testing SemanticCacheTelemetryRotary & Cache Efficiency Metrics...');

  // 1. Empty snapshot
  const rotary = new SemanticCacheTelemetryRotary();
  const emptySnap = rotary.snapshot();
  assert.strictEqual(emptySnap.totalLookups, 0);
  assert.strictEqual(emptySnap.hitRatioPct, 0.0);
  assert.strictEqual(emptySnap.totalTokensSaved, 0);
  assert.strictEqual(emptySnap.slaBreached, false);

  // 2. Input validation
  assert.throws(() => {
    rotary.recordLookup({ queryId: '', isHit: true, matchType: 'EXACT', latencyMs: 5 });
  }, /Lookup event must contain a valid queryId/);

  // 3. Nominal recording: exact hits, semantic hits, and misses
  rotary.recordLookup({
    queryId: 'q1',
    isHit: true,
    matchType: 'EXACT',
    latencyMs: 1.2,
    tokensSaved: 150,
  });

  rotary.recordLookup({
    queryId: 'q2',
    isHit: true,
    matchType: 'SEMANTIC',
    similarityScore: 0.94,
    latencyMs: 3.5,
    tokensSaved: 200,
  });

  rotary.recordLookup({
    queryId: 'q3',
    isHit: false,
    matchType: 'MISS',
    latencyMs: 12.0,
    tokensSaved: 0,
  });

  rotary.recordEviction(2);

  const snap = rotary.snapshot();
  assert.strictEqual(snap.totalLookups, 3);
  assert.strictEqual(snap.exactHits, 1);
  assert.strictEqual(snap.semanticHits, 1);
  assert.strictEqual(snap.totalHits, 2);
  assert.strictEqual(snap.misses, 1);
  assert.strictEqual(snap.hitRatioPct, 66.67);
  assert.strictEqual(snap.totalTokensSaved, 350);
  assert.strictEqual(snap.evictionsCount, 2);
  assert.strictEqual(snap.slaBreached, false);

  // 4. SLA Breach on low hit ratio
  rotary.reset();
  const strictRotary = new SemanticCacheTelemetryRotary({ minHitRatioPct: 80.0 });
  // Record 10 lookups: 2 hits, 8 misses -> 20% hit ratio < 80% SLA
  for (let i = 0; i < 2; i++) {
    strictRotary.recordLookup({ queryId: `hit-${i}`, isHit: true, matchType: 'EXACT', latencyMs: 1.0 });
  }
  for (let i = 0; i < 8; i++) {
    strictRotary.recordLookup({ queryId: `miss-${i}`, isHit: false, matchType: 'MISS', latencyMs: 15.0 });
  }

  const breachedSnap = strictRotary.snapshot();
  assert.strictEqual(breachedSnap.totalLookups, 10);
  assert.strictEqual(breachedSnap.hitRatioPct, 20.0);
  assert.strictEqual(breachedSnap.slaBreached, true);
  assert.ok(breachedSnap.breachReason?.includes('below SLA threshold'));

  // 5. Prometheus format output
  const prom = rotary.formatPrometheus();
  assert.ok(prom.includes('aegis_cache_lookups_total'));
  assert.ok(prom.includes('aegis_cache_hit_ratio_pct'));
  assert.ok(prom.includes('aegis_cache_tokens_saved_total'));

  console.log('  ✓ SemanticCacheTelemetryRotary tests PASSED');
  return true;
}
