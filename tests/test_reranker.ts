import {
  calculatePositionalDecay,
  cosineSimilarity,
  rerankWithMMR,
  type RerankCandidate,
} from '../src/core/reranker.ts';

export function runRerankerTests(): boolean {
  console.log('  Testing Maximal Marginal Relevance (MMR) Reranker & Cosine Similarity...');

  // 1. Cosine Similarity Tests
  const v1 = [1, 0, 0];
  const v2 = [1, 0, 0];
  const v3 = [0, 1, 0];
  const v4 = [-1, 0, 0];

  const simIdentical = cosineSimilarity(v1, v2);
  if (Math.abs(simIdentical - 1.0) > 1e-6) {
    throw new Error(`Expected identical cosine similarity 1.0, got ${simIdentical}`);
  }

  const simOrthogonal = cosineSimilarity(v1, v3);
  if (Math.abs(simOrthogonal - 0.0) > 1e-6) {
    throw new Error(`Expected orthogonal cosine similarity 0.0, got ${simOrthogonal}`);
  }

  const simOpposite = cosineSimilarity(v1, v4);
  if (Math.abs(simOpposite - (-1.0)) > 1e-6) {
    throw new Error(`Expected opposite cosine similarity -1.0, got ${simOpposite}`);
  }

  // Dimension mismatch
  let caughtMismatch = false;
  try {
    cosineSimilarity([1, 2], [1, 2, 3]);
  } catch (err: any) {
    caughtMismatch = true;
  }
  if (!caughtMismatch) {
    throw new Error('Expected dimension mismatch to throw RangeError');
  }

  // 2. Positional Decay Tests
  const decay0 = calculatePositionalDecay(0, 0.1);
  if (Math.abs(decay0 - 1.0) > 1e-6) {
    throw new Error(`Expected decay at rank 0 to be 1.0, got ${decay0}`);
  }
  const decay1 = calculatePositionalDecay(1, 0.1);
  const decay2 = calculatePositionalDecay(2, 0.1);
  if (decay1 <= decay2 || decay1 >= 1.0) {
    throw new Error(`Expected monotonic decay, got d1=${decay1}, d2=${decay2}`);
  }

  // 3. MMR Reranker Tests
  const query = [1, 1, 0]; // Query oriented in XY quadrant

  const candidates: RerankCandidate[] = [
    { id: 'chunk-1', text: 'Highly relevant primary chunk (X-aligned)', embedding: [1, 0, 0] },
    { id: 'chunk-2', text: 'Duplicate of primary chunk (X-aligned)', embedding: [1, 0, 0] },
    { id: 'chunk-3', text: 'Diverse relevant chunk (Y-aligned)', embedding: [0, 1, 0] },
    { id: 'chunk-4', text: 'Completely irrelevant noise (Z-aligned)', embedding: [0, 0, 1] },
  ];

  // Run MMR with diversity lambda = 0.6 and threshold = 0.2
  const result = rerankWithMMR({
    queryEmbedding: query,
    candidates,
    topK: 3,
    diversityLambda: 0.6,
    minSimilarityThreshold: 0.2,
  });

  // chunk-4 should have been discarded (sim = 0 < threshold 0.2)
  if (result.discardedCount !== 1) {
    throw new Error(`Expected 1 discarded chunk, got ${result.discardedCount}`);
  }

  if (result.rankedChunks.length !== 3) {
    throw new Error(`Expected 3 ranked chunks, got ${result.rankedChunks.length}`);
  }

  // Rank 0 should be chunk-1 (highest query sim)
  if (result.rankedChunks[0].id !== 'chunk-1') {
    throw new Error(`Expected chunk-1 at rank 0, got ${result.rankedChunks[0].id}`);
  }

  // With MMR lambda = 0.6, chunk-3 (diverse) should be preferred over duplicate chunk-2
  if (result.rankedChunks[1].id !== 'chunk-3') {
    throw new Error(`Expected chunk-3 at rank 1 due to diversity penalty on chunk-2, got ${result.rankedChunks[1].id}`);
  }

  console.log('  ✓ MMR Context Reranker tests PASSED');
  return true;
}
