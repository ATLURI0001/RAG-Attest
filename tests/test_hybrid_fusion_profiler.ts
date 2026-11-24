import assert from 'node:assert/strict';
import {
  computeRRF,
  calculateRankConcordance,
  HybridFusionProfiler,
  type RankedDoc,
} from '../src/hybrid_fusion_profiler.ts';

export function runHybridFusionProfilerTests(): boolean {
  console.log('  Testing Hybrid Vector & Lexical Reciprocal Rank Fusion Profiler...');

  // 1. Basic RRF Computation
  const dense: RankedDoc[] = [
    { id: 'doc-1', score: 0.95 },
    { id: 'doc-2', score: 0.85 },
    { id: 'doc-3', score: 0.75 },
  ];
  const sparse: RankedDoc[] = [
    { id: 'doc-2', score: 14.5 },
    { id: 'doc-4', score: 11.2 },
    { id: 'doc-1', score: 9.8 },
  ];

  const fused = computeRRF(dense, sparse, { k: 60 });
  assert.equal(fused.length, 4);

  // doc-1: 1/(60+1) + 1/(60+3) = 1/61 + 1/63 = 0.016393 + 0.015873 = 0.032266
  // doc-2: 1/(60+2) + 1/(60+1) = 1/62 + 1/61 = 0.016129 + 0.016393 = 0.032522
  // doc-2 should rank first
  assert.equal(fused[0]?.id, 'doc-2');
  assert.equal(fused[1]?.id, 'doc-1');
  assert.equal(fused[0]?.denseRank, 2);
  assert.equal(fused[0]?.sparseRank, 1);

  // 2. Weights & TopK
  const weighted = computeRRF(dense, sparse, { denseWeight: 2.0, sparseWeight: 0.5, topK: 2 });
  assert.equal(weighted.length, 2);

  // 3. Concordance
  const identicalConcordance = calculateRankConcordance(dense, dense, 3);
  assert.equal(identicalConcordance, 1.0);

  const disjointSparse: RankedDoc[] = [
    { id: 'doc-X', score: 10 },
    { id: 'doc-Y', score: 8 },
  ];
  const disjointConcordance = calculateRankConcordance(dense, disjointSparse, 2);
  assert.equal(disjointConcordance, 0.0);

  const partialConcordance = calculateRankConcordance(dense, sparse, 2);
  assert.ok(partialConcordance > 0.0 && partialConcordance <= 1.0);

  // 4. Profiler Execution
  const profiler = new HybridFusionProfiler();
  const denseLarge: RankedDoc[] = Array.from({ length: 50 }, (_, i) => ({ id: `d-${i}`, score: 1 - i * 0.01 }));
  const sparseLarge: RankedDoc[] = Array.from({ length: 50 }, (_, i) => ({ id: `d-${49 - i}`, score: 20 - i * 0.2 }));

  const report = profiler.benchmarkFusion(denseLarge, sparseLarge, 200, { topK: 25 });
  assert.equal(report.iterations, 200);
  assert.ok(report.totalDurationMs > 0);
  assert.ok(report.opsPerSecond > 0);
  assert.ok(report.p50Ms >= 0);
  assert.ok(report.p90Ms >= report.p50Ms);
  assert.ok(report.p99Ms >= report.p90Ms);
  assert.equal(report.fusedDocumentCount, 25);

  assert.throws(() => profiler.benchmarkFusion(dense, sparse, 0), RangeError);

  console.log('  ✓ HybridFusionProfiler & RRF benchmark tests PASSED');
  return true;
}
