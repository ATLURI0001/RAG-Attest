import assert from 'node:assert';
import {
  VectorEmbeddingContract,
  EmbeddingContractError,
  DEFAULT_EMBEDDING_LIMITS,
} from '../src/core/embedding_contract.ts';

export function runEmbeddingContractTests(): boolean {
  console.log('  Testing VectorEmbeddingContract & Dimensionality Invariants...');

  const contract = new VectorEmbeddingContract();

  // 1. Success case: Valid 4-dim unit vector
  const rawVec = [0.5, 0.5, 0.5, 0.5]; // norm = sqrt(4 * 0.25) = 1.0
  const res = contract.validate(rawVec, { expectedDimensions: 4, requireUnitNorm: true });
  assert.strictEqual(res.valid, true);
  assert.strictEqual(res.summary.dimensions, 4);
  assert.ok(Math.abs(res.summary.l2Norm - 1.0) < 1e-4);
  assert.strictEqual(res.summary.isUnitNorm, true);
  assert.strictEqual(res.normalized, false);

  // 2. Type assertion: Float32Array input
  const f32Input = new Float32Array([0.0, 1.0, 0.0]);
  const f32Res = contract.validate(f32Input, { expectedDimensions: 3 });
  assert.strictEqual(f32Res.valid, true);
  assert.strictEqual(f32Res.summary.dimensions, 3);
  assert.strictEqual(f32Res.summary.sparsity, 2 / 3);

  // 3. Dimensionality mismatch error
  assert.throws(
    () => contract.validate([1, 2, 3], { expectedDimensions: 4 }),
    (err: any) => err instanceof EmbeddingContractError && err.code === 'DIMENSION_MISMATCH'
  );

  // 4. Non-finite values (NaN / Infinity)
  assert.throws(
    () => contract.validate([1.0, NaN, 0.5]),
    (err: any) => err instanceof EmbeddingContractError && err.code === 'NON_FINITE_VALUE' && err.index === 1
  );
  assert.throws(
    () => contract.validate([1.0, Infinity, 0.5]),
    (err: any) => err instanceof EmbeddingContractError && err.code === 'NON_FINITE_VALUE' && err.index === 1
  );

  // 5. Zero-magnitude vector error
  assert.throws(
    () => contract.validate([0.0, 0.0, 0.0]),
    (err: any) => err instanceof EmbeddingContractError && err.code === 'ZERO_MAGNITUDE_VECTOR'
  );

  // 6. Unit norm enforcement and automatic projection
  const unnormVec = [3.0, 4.0]; // L2 norm = 5.0
  assert.throws(
    () => contract.validate(unnormVec, { requireUnitNorm: true, normalizeIfUnnormalized: false }),
    (err: any) => err instanceof EmbeddingContractError && err.code === 'UNNORMALIZED_VECTOR'
  );

  const normRes = contract.validate(unnormVec, { requireUnitNorm: true, normalizeIfUnnormalized: true });
  assert.strictEqual(normRes.normalized, true);
  assert.ok(Math.abs(normRes.vector[0] - 0.6) < 1e-4);
  assert.ok(Math.abs(normRes.vector[1] - 0.8) < 1e-4);
  assert.ok(Math.abs(normRes.summary.l2Norm - 1.0) < 1e-4);

  // 7. Batch validation: Uniform dimensionality & size
  const validBatch = [
    [0.6, 0.8],
    [1.0, 0.0],
    [0.0, -1.0],
  ];
  const batchRes = contract.validateBatch(validBatch);
  assert.strictEqual(batchRes.valid, true);
  assert.strictEqual(batchRes.batchSize, 3);
  assert.strictEqual(batchRes.dimensions, 2);

  // 8. Batch validation error: Mismatched dimensions across batch
  const mixedBatch = [
    [1.0, 2.0],
    [1.0, 2.0, 3.0],
  ];
  assert.throws(
    () => contract.validateBatch(mixedBatch),
    (err: any) => err instanceof EmbeddingContractError && err.code === 'DIMENSION_MISMATCH' && err.index === 1
  );

  // 9. Batch size limit error
  const customContract = new VectorEmbeddingContract({ maxBatchSize: 2 });
  assert.throws(
    () => customContract.validateBatch(validBatch),
    (err: any) => err instanceof EmbeddingContractError && err.code === 'BATCH_SIZE_EXCEEDED'
  );

  console.log('    ✓ VectorEmbeddingContract invariants and bounds verified.');
  return true;
}
