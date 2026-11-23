import assert from 'node:assert';
import {
  RetrievalTelemetryProfiler,
  DEFAULT_RETRIEVAL_CONFIG,
} from '../src/core/retrieval_telemetry.ts';

export function runRetrievalTelemetryTests(): boolean {
  console.log('  Testing RetrievalTelemetryProfiler & Context Degradation Diagnostic...');

  // 1. Empty state
  const profiler = new RetrievalTelemetryProfiler();
  const emptyReport = profiler.diagnose();
  assert.strictEqual(emptyReport.totalQueries, 0);
  assert.strictEqual(emptyReport.status, 'HEALTHY');
  assert.strictEqual(emptyReport.hitRateAtK, 0);
  assert.strictEqual(emptyReport.recommendations.length, 0);

  // 2. Query recording and parameter validation
  assert.throws(() => profiler.recordQuery('', 10, [0.8]), /queryId must be a non-empty string/);
  
  // Clamping negative latency and out-of-range scores
  const rec1 = profiler.recordQuery('q1', -15, [-0.5, 0.85, 1.5]);
  assert.strictEqual(rec1.latencyMs, 0);
  assert.strictEqual(rec1.chunks.length, 3);
  assert.strictEqual(rec1.chunks[0].relevanceScore, 0.0);
  assert.strictEqual(rec1.chunks[0].isRelevant, false);
  assert.strictEqual(rec1.chunks[1].relevanceScore, 0.85);
  assert.strictEqual(rec1.chunks[1].isRelevant, true);
  assert.strictEqual(rec1.chunks[2].relevanceScore, 1.0);
  assert.strictEqual(rec1.chunks[2].isRelevant, true);

  // 3. Healthy retrieval evaluation
  profiler.reset();
  profiler.recordQuery('q1', 12.5, [0.95, 0.88, 0.82]);
  profiler.recordQuery('q2', 15.0, [0.91, 0.84, 0.78]);

  const healthyReport = profiler.diagnose();
  assert.strictEqual(healthyReport.totalQueries, 2);
  assert.strictEqual(healthyReport.hitRateAtK, 1.0);
  assert.strictEqual(healthyReport.mrr, 1.0);
  assert.strictEqual(healthyReport.noiseRatio, 0.0);
  assert.strictEqual(healthyReport.status, 'HEALTHY');
  assert.strictEqual(healthyReport.recommendations.length, 0);

  // 4. Degraded noisy context evaluation
  profiler.reset();
  // Query with 2 high relevance chunks and 2 sub-threshold chunks (50% noise, but mean relevance 0.79 >= 0.65)
  profiler.recordQuery('q_noisy_1', 20.0, [0.95, 0.90, 0.66, 0.66]);
  profiler.recordQuery('q_noisy_2', 22.0, [0.94, 0.88, 0.65, 0.65]);
  const noisyReport = profiler.diagnose();
  assert.strictEqual(noisyReport.status, 'DEGRADED_NOISY_CONTEXT');
  assert.ok(noisyReport.noiseRatio > DEFAULT_RETRIEVAL_CONFIG.maxNoiseRatioWarning);
  assert.ok(noisyReport.recommendations.some(r => r.includes('Context noise ratio')));

  // 5. Degraded low similarity evaluation
  const lowSimProfiler = new RetrievalTelemetryProfiler({
    relevanceThreshold: 0.50,
    minAvgRelevance: 0.70,
    maxNoiseRatioWarning: 0.60,
  });
  lowSimProfiler.recordQuery('q_low_1', 18.0, [0.55, 0.52, 0.51]);
  lowSimProfiler.recordQuery('q_low_2', 19.0, [0.58, 0.54, 0.52]);
  const lowSimReport = lowSimProfiler.diagnose();
  assert.strictEqual(lowSimReport.status, 'DEGRADED_LOW_SIMILARITY');
  assert.ok(lowSimReport.recommendations.some(r => r.includes('Mean chunk relevance')));

  // 6. Critical retrieval failure evaluation (HitRate@K < 40%)
  profiler.reset();
  // 3 out of 4 queries with zero relevant chunks
  profiler.recordQuery('q_miss_1', 10.0, [0.30, 0.20]);
  profiler.recordQuery('q_miss_2', 11.0, [0.40, 0.25]);
  profiler.recordQuery('q_miss_3', 12.0, [0.35, 0.15]);
  profiler.recordQuery('q_hit_4', 15.0, [0.92, 0.80]);
  const criticalReport = profiler.diagnose();
  assert.strictEqual(criticalReport.hitRateAtK, 0.25);
  assert.strictEqual(criticalReport.status, 'CRITICAL_RETRIEVAL_FAILURE');
  assert.ok(criticalReport.recommendations.some(r => r.includes('HitRate@K is critically low')));

  // 7. MRR calculation with reciprocal ranks
  profiler.reset();
  // q1: first hit at rank 1 -> RR = 1.0
  profiler.recordQuery('q1', 10.0, [0.85, 0.50]);
  // q2: first hit at rank 2 -> RR = 0.5
  profiler.recordQuery('q2', 12.0, [0.50, 0.88]);
  // Expected MRR = (1.0 + 0.5) / 2 = 0.75
  const mrrReport = profiler.diagnose();
  assert.strictEqual(mrrReport.mrr, 0.75);

  // 8. Ring buffer history capacity limit
  const cappedProfiler = new RetrievalTelemetryProfiler({ maxHistorySize: 3 });
  cappedProfiler.recordQuery('q1', 10, [0.8]);
  cappedProfiler.recordQuery('q2', 10, [0.8]);
  cappedProfiler.recordQuery('q3', 10, [0.8]);
  cappedProfiler.recordQuery('q4', 10, [0.8]);
  assert.strictEqual(cappedProfiler.getHistoryLength(), 3);

  console.log('    ✓ All RetrievalTelemetryProfiler tests passed!');
  return true;
}

if (process.argv[1]?.endsWith('test_retrieval_telemetry.ts')) {
  runRetrievalTelemetryTests();
}
