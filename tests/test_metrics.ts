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

  console.log('  Testing Okapi BM25 ranking across corpus...');
  const corpus = [
    'AES-256-GCM encryption is strictly required.',
    'Weather forecast predicts sunny conditions tomorrow.',
    'Encryption keys must be rotated every 30 days.'
  ];
  const bm25Scores = EdgeMetricsEngine.computeBM25('encryption keys', corpus);
  if (bm25Scores.length !== 3) {
    throw new Error(`Expected 3 BM25 scores, got ${bm25Scores.length}`);
  }
  // Document 2 (index 2) contains both "encryption" and "keys", so it should score highest
  if (bm25Scores[2] <= bm25Scores[0] || bm25Scores[2] <= bm25Scores[1]) {
    throw new Error(`Expected document 2 to rank highest in BM25, scores: ${JSON.stringify(bm25Scores)}`);
  }
  if (bm25Scores[1] !== 0.0) {
    throw new Error(`Expected document 1 with zero query terms to score 0.0, got ${bm25Scores[1]}`);
  }

  console.log('  Testing Mean Reciprocal Rank (MRR)...');
  const mrr1 = EdgeMetricsEngine.computeMRR(['doc1', 'doc2', 'doc3'], ['doc1']);
  if (mrr1 !== 1.0) throw new Error(`Expected MRR 1.0, got ${mrr1}`);

  const mrr2 = EdgeMetricsEngine.computeMRR(['doc1', 'doc2', 'doc3'], ['doc2']);
  if (mrr2 !== 0.5) throw new Error(`Expected MRR 0.5, got ${mrr2}`);

  const mrr0 = EdgeMetricsEngine.computeMRR(['doc1', 'doc2'], ['doc99']);
  if (mrr0 !== 0.0) throw new Error(`Expected MRR 0.0, got ${mrr0}`);

  console.log('  Testing NDCG@K ranking...');
  const ndcgIdeal = EdgeMetricsEngine.computeNDCGAtK([3, 2, 1, 0]);
  if (ndcgIdeal !== 1.0) throw new Error(`Expected ideal NDCG 1.0, got ${ndcgIdeal}`);

  const ndcgSuboptimal = EdgeMetricsEngine.computeNDCGAtK([1, 3, 2, 0]);
  if (ndcgSuboptimal >= 1.0 || ndcgSuboptimal <= 0.5) {
    throw new Error(`Expected suboptimal NDCG between 0.5 and 1.0, got ${ndcgSuboptimal}`);
  }

  console.log('  ✓ Mathematical Metrics Engine tests PASSED');
  return true;
}
