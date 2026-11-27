import assert from 'node:assert/strict';

// aegis-rag-edge: embedding drift sentinel
export function validateEmbeddingDrift(cosine: number): void {
  if (cosine < -1 || cosine > 1) {
    throw new RangeError(`cosine similarity must be in [-1, 1], got ${cosine}`);
  }
  if (cosine < 0.5) {
    throw new Error(`embedding drift detected: cosine=${cosine}`);
  }
}
