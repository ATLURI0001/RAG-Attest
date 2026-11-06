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

  console.log('  ✓ Mathematical Metrics Engine tests PASSED');
  return true;
}
