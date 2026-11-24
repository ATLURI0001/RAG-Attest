/**
 * aegis-rag-edge - Vector Embedding Ingress Contract & Dimensionality Invariant Guard
 *
 * Enforces strict boundary verification and mathematical invariants on neural vector embeddings
 * entering the edge vector store and RAG retrieval pipelines.
 *
 * Invariants:
 * 1. Dimensionality bound enforcement (e.g. 384, 768, 1024, 1536, 3072 dims).
 * 2. Strict floating-point finite number assertion (rejects NaN, +Infinity, -Infinity).
 * 3. Magnitude & L2-norm verification (detects zero-norm degenerate vectors causing division by zero).
 * 4. Automatic unit-norm normalization (Float32Array projection) when requested.
 * 5. Batch consistency verification (guarantees identical dimensions across all vectors in a batch).
 */

export interface EmbeddingContractLimits {
  minDimensions: number;
  maxDimensions: number;
  maxBatchSize: number;
  normTolerance: number;
  zeroNormEpsilon: number;
}

export const DEFAULT_EMBEDDING_LIMITS: EmbeddingContractLimits = {
  minDimensions: 1,
  maxDimensions: 16384,
  maxBatchSize: 1024,
  normTolerance: 1e-3,
  zeroNormEpsilon: 1e-7,
};

export class EmbeddingContractError extends Error {
  code: string;
  index?: number;
  dimension?: number;

  constructor(code: string, message: string, meta?: { index?: number; dimension?: number }) {
    super(`[${code}] ${message}`);
    this.name = 'EmbeddingContractError';
    this.code = code;
    this.index = meta?.index;
    this.dimension = meta?.dimension;
  }
}

export interface VectorSummary {
  dimensions: number;
  l2Norm: number;
  l1Norm: number;
  min: number;
  max: number;
  mean: number;
  variance: number;
  sparsity: number; // percentage of exact zeros
  isUnitNorm: boolean;
}

export interface EmbeddingValidationOptions {
  expectedDimensions?: number;
  requireUnitNorm?: boolean;
  normalizeIfUnnormalized?: boolean;
  limits?: Partial<EmbeddingContractLimits>;
}

export interface EmbeddingValidationResult {
  valid: boolean;
  vector: Float32Array;
  summary: VectorSummary;
  normalized: boolean;
}

export interface BatchValidationResult {
  valid: boolean;
  vectors: Float32Array[];
  dimensions: number;
  batchSize: number;
  summaries: VectorSummary[];
}

export class VectorEmbeddingContract {
  private limits: EmbeddingContractLimits;

  constructor(customLimits?: Partial<EmbeddingContractLimits>) {
    this.limits = { ...DEFAULT_EMBEDDING_LIMITS, ...customLimits };
  }

  /**
   * Validates a single vector embedding against mathematical invariants and dimensionality constraints.
   */
  public validate(
    rawVector: number[] | Float32Array | Float64Array | unknown,
    options?: EmbeddingValidationOptions
  ): EmbeddingValidationResult {
    if (!rawVector || (!Array.isArray(rawVector) && !ArrayBuffer.isView(rawVector))) {
      throw new EmbeddingContractError(
        'INVALID_TYPE',
        'Embedding vector must be an Array or TypedArray (Float32Array/Float64Array).'
      );
    }

    const vector = rawVector as number[] | Float32Array;
    const dims = vector.length;

    if (dims === 0) {
      throw new EmbeddingContractError('EMPTY_VECTOR', 'Embedding vector has zero dimensions.');
    }

    const minDims = options?.limits?.minDimensions ?? this.limits.minDimensions;
    const maxDims = options?.limits?.maxDimensions ?? this.limits.maxDimensions;

    if (dims < minDims) {
      throw new EmbeddingContractError(
        'BELOW_MIN_DIMENSIONS',
        `Vector dimension ${dims} is below minimum allowed ${minDims}.`,
        { dimension: dims }
      );
    }

    if (dims > maxDims) {
      throw new EmbeddingContractError(
        'EXCEEDS_MAX_DIMENSIONS',
        `Vector dimension ${dims} exceeds maximum allowed ${maxDims}.`,
        { dimension: dims }
      );
    }

    if (options?.expectedDimensions !== undefined && dims !== options.expectedDimensions) {
      throw new EmbeddingContractError(
        'DIMENSION_MISMATCH',
        `Expected vector of dimension ${options.expectedDimensions}, got ${dims}.`,
        { dimension: dims }
      );
    }

    let sumSquares = 0;
    let sumAbs = 0;
    let sumVal = 0;
    let zeroCount = 0;
    let minVal = Infinity;
    let maxVal = -Infinity;

    // Fast contiguous Float32 buffer
    const outputBuffer = new Float32Array(dims);

    for (let i = 0; i < dims; i++) {
      const val = Number(vector[i]);

      if (!Number.isFinite(val)) {
        throw new EmbeddingContractError(
          'NON_FINITE_VALUE',
          `Non-finite floating-point value (${val}) encountered at vector index ${i}.`,
          { index: i }
        );
      }

      outputBuffer[i] = val;
      sumSquares += val * val;
      sumAbs += Math.abs(val);
      sumVal += val;

      if (val === 0) {
        zeroCount++;
      }
      if (val < minVal) minVal = val;
      if (val > maxVal) maxVal = val;
    }

    const l2Norm = Math.sqrt(sumSquares);
    const zeroEpsilon = options?.limits?.zeroNormEpsilon ?? this.limits.zeroNormEpsilon;

    if (l2Norm < zeroEpsilon) {
      throw new EmbeddingContractError(
        'ZERO_MAGNITUDE_VECTOR',
        `Vector has zero or near-zero Euclidean norm (${l2Norm.toExponential(4)}), which prevents cosine similarity evaluation.`
      );
    }

    const mean = sumVal / dims;
    let varSum = 0;
    for (let i = 0; i < dims; i++) {
      const diff = outputBuffer[i] - mean;
      varSum += diff * diff;
    }
    const variance = varSum / dims;

    const normTolerance = options?.limits?.normTolerance ?? this.limits.normTolerance;
    const isUnitNorm = Math.abs(l2Norm - 1.0) <= normTolerance;

    let normalizedBuffer = outputBuffer;
    let wasNormalized = false;

    if (options?.requireUnitNorm && !isUnitNorm) {
      if (options?.normalizeIfUnnormalized) {
        normalizedBuffer = new Float32Array(dims);
        const invNorm = 1.0 / l2Norm;
        for (let i = 0; i < dims; i++) {
          normalizedBuffer[i] = outputBuffer[i] * invNorm;
        }
        wasNormalized = true;
      } else {
        throw new EmbeddingContractError(
          'UNNORMALIZED_VECTOR',
          `Vector requires unit L2 norm, but computed L2 norm is ${l2Norm.toFixed(6)} (diff > ${normTolerance}).`
        );
      }
    }

    const summary: VectorSummary = {
      dimensions: dims,
      l2Norm: wasNormalized ? 1.0 : l2Norm,
      l1Norm: sumAbs,
      min: minVal,
      max: maxVal,
      mean,
      variance,
      sparsity: zeroCount / dims,
      isUnitNorm: wasNormalized ? true : isUnitNorm,
    };

    return {
      valid: true,
      vector: normalizedBuffer,
      summary,
      normalized: wasNormalized,
    };
  }

  /**
   * Validates a batch of vectors, asserting uniform dimensionality and size constraints.
   */
  public validateBatch(
    batch: (number[] | Float32Array | Float64Array | unknown)[],
    options?: EmbeddingValidationOptions
  ): BatchValidationResult {
    if (!Array.isArray(batch)) {
      throw new EmbeddingContractError('INVALID_BATCH', 'Batch input must be an array of vectors.');
    }

    if (batch.length === 0) {
      throw new EmbeddingContractError('EMPTY_BATCH', 'Embedding batch cannot be empty.');
    }

    const maxBatchSize = options?.limits?.maxBatchSize ?? this.limits.maxBatchSize;
    if (batch.length > maxBatchSize) {
      throw new EmbeddingContractError(
        'BATCH_SIZE_EXCEEDED',
        `Batch size ${batch.length} exceeds maximum allowed size ${maxBatchSize}.`
      );
    }

    // Validate first vector to determine uniform dimensionality
    const firstResult = this.validate(batch[0], options);
    const expectedDims = options?.expectedDimensions ?? firstResult.summary.dimensions;

    const validatedVectors: Float32Array[] = [firstResult.vector];
    const summaries: VectorSummary[] = [firstResult.summary];

    const itemOptions: EmbeddingValidationOptions = {
      ...options,
      expectedDimensions: expectedDims,
    };

    for (let b = 1; b < batch.length; b++) {
      try {
        const itemResult = this.validate(batch[b], itemOptions);
        validatedVectors.push(itemResult.vector);
        summaries.push(itemResult.summary);
      } catch (err) {
        if (err instanceof EmbeddingContractError) {
          throw new EmbeddingContractError(
            err.code,
            `Batch item at index ${b} failed validation: ${err.message}`,
            { index: b, dimension: err.dimension }
          );
        }
        throw err;
      }
    }

    return {
      valid: true,
      vectors: validatedVectors,
      dimensions: expectedDims,
      batchSize: batch.length,
      summaries,
    };
  }
}
