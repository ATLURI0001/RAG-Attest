/**
 * AEGIS-EDGE Test Suite: Mathematical Metrics Engine Tests
 */

import { EdgeMetricsEngine } from '../src/core/metrics.ts';
import type { RetrievedChunk, RagPayload } from '../src/core/types.ts';

export function runMetricsTests(): boolean {
  console.log('  Testing Context Precision (DCG Ranking)...');
  const query = 'What encryption algorithm is mandated?';
  const relevantChunks: RetrievedChunk[] = [
    { id: 'c1', text: 'AES-256-GCM encryption algorithm is strictly mandated for all edge traffic.' },
    { id: 'c2', text: 'Unrelated network buffer parameters are configured in sysctl.' }
  ];

  const precisionHigh = EdgeMetricsEngine.evaluateContextPrecision(query, relevantChunks);
  if (precisionHigh < 0.7) {
    throw new Error(`Expected high context precision, got ${precisionHigh}`);
  }

  console.log('  Testing Groundedness & Claim Verification...');
  const answerGrounded = 'AES-256-GCM encryption algorithm is mandated for all edge traffic.';
  const evalGrounded = EdgeMetricsEngine.evaluateGroundednessAndClaims(answerGrounded, relevantChunks);

  if (evalGrounded.groundedness < 0.8) {
    throw new Error(`Expected groundedness >= 0.8, got ${evalGrounded.groundedness}`);
  }
  if (evalGrounded.claims.length === 0 || evalGrounded.claims[0].status !== 'ENTAILED') {
    throw new Error('Grounded claim was not marked ENTAILED');
  }

  console.log('  Testing Contradiction & Hallucination Detection...');
  const answerContradicted = 'AES-256-GCM is not mandated and unencrypted HTTP is used.';
  const evalContradicted = EdgeMetricsEngine.evaluateGroundednessAndClaims(answerContradicted, relevantChunks);

  if (evalContradicted.claims[0].status !== 'CONTRADICTED' && evalContradicted.groundedness > 0.3) {
    throw new Error(`Contradiction failed detection, groundedness was ${evalContradicted.groundedness}`);
  }

  console.log('  Testing Full Payload Harmonized Evaluation...');
  const payload: RagPayload = {
    id: 'test-1',
    query,
    retrievedChunks: relevantChunks,
    generatedAnswer: answerGrounded,
    latencyMs: 120,
    tokensGenerated: 12
  };

  const fullMetrics = EdgeMetricsEngine.computeAll(payload);
  if (fullMetrics.triad.groundedness < 0.8 || fullMetrics.triad.answerRelevance < 0.7) {
    throw new Error('Full payload metrics calculation failed sanity bounds');
  }

  console.log('  Testing Short/Numeric Claims & Ngram Edge Guards...');
  const numericChunks: RetrievedChunk[] = [
    { id: 'c-num', text: 'The maximum retry threshold is 42 attempts.' }
  ];
  const shortNumericEval = EdgeMetricsEngine.evaluateGroundednessAndClaims('42.', numericChunks);
  if (shortNumericEval.claims.length === 0 || shortNumericEval.claims[0].status !== 'ENTAILED') {
    throw new Error(`Short numeric claim "42." failed grounding check: ${JSON.stringify(shortNumericEval)}`);
  }

  const badNgramInput = EdgeMetricsEngine.evaluateGroundednessAndClaims('Simple claim.', null as unknown as RetrievedChunk[]);
  if (badNgramInput.groundedness !== 0) {
    throw new Error('Null chunks must yield 0 groundedness without throwing');
  }

  // Verify evaluateContextPrecision and evaluateContextRecall with malformed/null chunks
  const malformedChunks = [null, { id: 'c-empty' }, { id: 'c-valid', text: 'AES-256 encryption' }] as unknown as RetrievedChunk[];
  const precWithMalformed = EdgeMetricsEngine.evaluateContextPrecision('encryption', malformedChunks);
  if (typeof precWithMalformed !== 'number' || isNaN(precWithMalformed)) {
    throw new Error('Context precision failed on malformed chunk list');
  }

  const recallWithMalformed = EdgeMetricsEngine.evaluateContextRecall('encryption', malformedChunks);
  if (typeof recallWithMalformed !== 'number' || isNaN(recallWithMalformed)) {
    throw new Error('Context recall failed on malformed chunk list');
  }

  console.log('  Testing Similarity Clamping and Null Payload Guards...');
  // Cosine similarity guards
  if (EdgeMetricsEngine.cosineSimilarity(null as unknown as Map<string, number>, new Map()) !== 0.0) {
    throw new Error('cosineSimilarity must return 0.0 for null inputs');
  }
  const m1 = new Map([['term', 2]]);
  const m2 = new Map([['term', 3]]);
  const cosVal = EdgeMetricsEngine.cosineSimilarity(m1, m2);
  if (cosVal < 0.999 || cosVal > 1.0) {
    throw new Error(`cosineSimilarity must clamp to [0.0, 1.0], got ${cosVal}`);
  }

  // Jaccard similarity guards
  if (EdgeMetricsEngine.jaccardSimilarity(null as unknown as Set<string>, new Set()) !== 0.0) {
    throw new Error('jaccardSimilarity must return 0.0 for null inputs');
  }
  if (EdgeMetricsEngine.jaccardSimilarity(new Set(), new Set()) !== 1.0) {
    throw new Error('jaccardSimilarity for empty sets must be 1.0');
  }

  // LCS ratio guards
  if (EdgeMetricsEngine.lcsRatio(null as unknown as string[], []) !== 0.0) {
    throw new Error('lcsRatio must return 0.0 for null inputs');
  }
  if (EdgeMetricsEngine.lcsRatio(['a', 'b'], ['a', 'b']) !== 1.0) {
    throw new Error('lcsRatio for identical tokens must be 1.0');
  }

  // computeAll with null or malformed payload
  const nullPayloadMetrics = EdgeMetricsEngine.computeAll(null as unknown as RagPayload);
  if (typeof nullPayloadMetrics?.triad?.groundedness !== 'number') {
    throw new Error('computeAll must safely handle null payload');
  }

  console.log('  Testing F1 Overlap & Coverage Ratio Metrics...');
  const f1Exact = EdgeMetricsEngine.evaluateF1Overlap('AES-256 encryption mandated', 'AES-256 encryption mandated');
  if (f1Exact.f1 !== 1.0 || f1Exact.precision !== 1.0 || f1Exact.recall !== 1.0) {
    throw new Error(`Expected perfect F1 (1.0), got ${JSON.stringify(f1Exact)}`);
  }

  const f1Partial = EdgeMetricsEngine.evaluateF1Overlap('AES-256 encryption mandated for all edge traffic', 'AES-256 encryption required');
  if (f1Partial.f1 <= 0.0 || f1Partial.f1 >= 1.0) {
    throw new Error(`Expected partial F1 in (0, 1), got ${f1Partial.f1}`);
  }

  const f1Empty = EdgeMetricsEngine.evaluateF1Overlap('', 'candidate answer');
  if (f1Empty.f1 !== 0.0) {
    throw new Error('F1 with empty reference must be 0.0');
  }

  const coverageVal = EdgeMetricsEngine.evaluateCoverageRatio('AES-256 encryption mandated', [
    { id: 'c1', text: 'AES-256 is the mandated standard.' }
  ]);
  if (coverageVal < 0.6) {
    throw new Error(`Expected high coverage ratio, got ${coverageVal}`);
  }

  const coverageEmpty = EdgeMetricsEngine.evaluateCoverageRatio('some query', []);
  if (coverageEmpty !== 0.0) {
    throw new Error('Empty chunks coverage ratio must be 0.0');
  }

  console.log('  Testing Reciprocal Rank, MAP, HitRate@K, and Noise Ratio...');
  const rankedChunks: RetrievedChunk[] = [
    { id: 'c1', text: 'Unrelated network buffer configuration.' },
    { id: 'c2', text: 'AES-256 encryption algorithm is mandated for edge systems.' },
    { id: 'c3', text: 'System temperature monitoring thresholds.' }
  ];

  // First relevant chunk is at rank 2 -> RR should be 1/2 = 0.5
  const rr = EdgeMetricsEngine.evaluateReciprocalRank('AES-256 encryption mandated', rankedChunks, 0.25);
  if (rr !== 0.5) {
    throw new Error(`Expected Reciprocal Rank 0.5, got ${rr}`);
  }

  // HitRate@1 should be 0.0, HitRate@2 should be 1.0
  const hit1 = EdgeMetricsEngine.evaluateHitRateAtK('AES-256 encryption mandated', rankedChunks, 1, 0.25);
  if (hit1 !== 0.0) {
    throw new Error(`Expected HitRate@1 to be 0.0, got ${hit1}`);
  }
  const hit2 = EdgeMetricsEngine.evaluateHitRateAtK('AES-256 encryption mandated', rankedChunks, 2, 0.25);
  if (hit2 !== 1.0) {
    throw new Error(`Expected HitRate@2 to be 1.0, got ${hit2}`);
  }

  // Noise ratio: 1 out of 3 is relevant -> noise ratio should be 2/3 ≈ 0.667
  const noise = EdgeMetricsEngine.evaluateNoiseRatio('AES-256 encryption mandated', rankedChunks, 0.25);
  if (noise < 0.6 || noise > 0.7) {
    throw new Error(`Expected noise ratio ~0.667, got ${noise}`);
  }

  // MAP computation
  const ap = EdgeMetricsEngine.evaluateAveragePrecision('AES-256 encryption mandated', rankedChunks, 0.25);
  if (ap !== 0.5) {
    throw new Error(`Expected Average Precision 0.5, got ${ap}`);
  }

  // Edge cases
  if (EdgeMetricsEngine.evaluateReciprocalRank('', []) !== 0.0) {
    throw new Error('Empty Reciprocal Rank must be 0.0');
  }
  if (EdgeMetricsEngine.evaluateNoiseRatio('', []) !== 0.0) {
    throw new Error('Empty Noise Ratio must be 0.0');
  }

  console.log('  ✓ Mathematical Metrics Engine tests PASSED');
  return true;
}
