/**
 * Reranker Score Calibration & Ranking Monotonicity Contract.
 * 
 * Enforces strict normalized score boundaries [0.0, 1.0], non-NaN invariants,
 * duplicate chunk ID deduplication, and deterministic descending ranking order.
 */

export interface ScoredDocumentChunk {
  docId: string;
  score: number;
  contentHash?: string;
}

export interface RerankerContractResult {
  valid: boolean;
  sanitizedChunks: ScoredDocumentChunk[];
  errors: string[];
}

export class RerankerScoreContract {
  public static validateAndEnforce(
    chunks: ScoredDocumentChunk[],
    maxTopK: number = 50
  ): RerankerContractResult {
    const errors: string[] = [];
    const seenIds = new Set<string>();
    const sanitized: ScoredDocumentChunk[] = [];

    if (!Array.isArray(chunks)) {
      return { valid: false, sanitizedChunks: [], errors: ['ERR_INVALID_CHUNK_ARRAY'] };
    }

    for (const chunk of chunks) {
      if (!chunk.docId || typeof chunk.docId !== 'string') {
        errors.push('ERR_MISSING_DOC_ID');
        continue;
      }

      if (seenIds.has(chunk.docId)) {
        errors.push(`ERR_DUPLICATE_DOC_ID: ${chunk.docId}`);
        continue;
      }
      seenIds.add(chunk.docId);

      if (!Number.isFinite(chunk.score) || chunk.score < 0.0 || chunk.score > 1.0) {
        errors.push(`ERR_SCORE_OUT_OF_BOUNDS: Doc '${chunk.docId}' score ${chunk.score} outside [0.0, 1.0]`);
        continue;
      }

      sanitized.push(chunk);
    }

    // Verify descending monotonicity
    for (let i = 1; i < sanitized.length; i++) {
      if (sanitized[i].score > sanitized[i - 1].score) {
        errors.push(
          `ERR_MONOTONICITY_VIOLATION: Index ${i} (${sanitized[i].score}) > Index ${i - 1} (${sanitized[i - 1].score})`
        );
      }
    }

    if (sanitized.length > maxTopK) {
      errors.push(`ERR_TOPK_CAPACITY_EXCEEDED: Received ${sanitized.length} > max ${maxTopK}`);
    }

    return {
      valid: errors.length === 0,
      sanitizedChunks: sanitized.slice(0, maxTopK),
      errors,
    };
  }
}
