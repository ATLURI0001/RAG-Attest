import assert from 'node:assert/strict';
import { RerankerScoreContract } from '../src/reranker_score_contract.ts';
import type { ScoredDocumentChunk } from '../src/reranker_score_contract.ts';

export function runRerankerScoreContractTests(): boolean {
  console.log('[AEGIS-EDGE] Running RerankerScoreContract tests...');

  // Valid descending chunks
  const validChunks: ScoredDocumentChunk[] = [
    { docId: 'doc-1', score: 0.95 },
    { docId: 'doc-2', score: 0.82 },
    { docId: 'doc-3', score: 0.45 },
  ];
  const resOk = RerankerScoreContract.validateAndEnforce(validChunks, 10);
  assert.equal(resOk.valid, true);
  assert.equal(resOk.sanitizedChunks.length, 3);

  // Out of bounds / NaN / duplicate / monotonicity violation
  const badChunks: ScoredDocumentChunk[] = [
    { docId: 'doc-1', score: 0.5 },
    { docId: 'doc-2', score: 0.8 }, // monotonicity violation
    { docId: 'doc-2', score: 0.6 }, // duplicate
    { docId: 'doc-3', score: 1.5 }, // out of bounds
  ];
  const resErr = RerankerScoreContract.validateAndEnforce(badChunks, 10);
  assert.equal(resErr.valid, false);
  assert.ok(resErr.errors.some((e) => e.includes('ERR_MONOTONICITY_VIOLATION')));
  assert.ok(resErr.errors.some((e) => e.includes('ERR_DUPLICATE_DOC_ID')));
  assert.ok(resErr.errors.some((e) => e.includes('ERR_SCORE_OUT_OF_BOUNDS')));

  console.log('✓ RerankerScoreContract tests passed successfully.');
  return true;
}
