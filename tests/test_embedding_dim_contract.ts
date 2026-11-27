import assert from 'node:assert/strict';
import { validateEmbeddingDimContract } from '../src/embedding_dim_contract.ts';

export function runEmbeddingDimContractTests(): boolean {
  assert.equal(validateEmbeddingDimContract([1, 2, 3], 3), true);
  assert.equal(validateEmbeddingDimContract([1, 2], 3), false);
  return true;
}
