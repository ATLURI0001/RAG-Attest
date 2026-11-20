/**
 * AEGIS-EDGE: Sovereign Edge RAG Evaluation Engine
 * Cross-Attention & Maximal Marginal Relevance (MMR) Context Reranker
 */

export interface RerankCandidate {
  id: string;
  text: string;
  embedding: number[];
  initialScore?: number;
}

export interface RerankOptions {
  queryEmbedding: number[];
  candidates: RerankCandidate[];
  topK?: number;
  diversityLambda?: number; // 0.0: max diversity, 1.0: pure relevance
  minSimilarityThreshold?: number; // Noise cutoff threshold
  applyPositionalDecay?: boolean;
  decayLambda?: number;
}

export interface RankedItem {
  id: string;
  text: string;
  rerankScore: number;
  relevanceScore: number;
  diversityPenalty: number;
  selectedRank: number;
}

export interface RerankResult {
  rankedChunks: RankedItem[];
  discardedCount: number;
  avgRelevance: number;
  processingTimeMs: number;
}

/**
 * Computes cosine similarity between two dense numerical embedding vectors.
 */
export function cosineSimilarity(v1: number[], v2: number[]): number {
  if (!Array.isArray(v1) || !Array.isArray(v2)) {
    throw new TypeError('Both embedding vectors must be arrays');
  }
  if (v1.length === 0 || v2.length === 0) {
    throw new RangeError('Embedding vectors cannot be empty');
  }
  if (v1.length !== v2.length) {
    throw new RangeError(`Vector dimension mismatch: ${v1.length} vs ${v2.length}`);
  }

  let dotProduct = 0.0;
  let norm1Sq = 0.0;
  let norm2Sq = 0.0;

  for (let i = 0; i < v1.length; i++) {
    const a = v1[i];
    const b = v2[i];
    if (typeof a !== 'number' || !Number.isFinite(a) || typeof b !== 'number' || !Number.isFinite(b)) {
      throw new TypeError(`Embedding vector elements must be finite numbers at index ${i}`);
    }
    dotProduct += a * b;
    norm1Sq += a * a;
    norm2Sq += b * b;
  }

  const normProduct = Math.sqrt(norm1Sq) * Math.sqrt(norm2Sq);
  if (normProduct < 1e-12) {
    return 0.0;
  }

  const sim = dotProduct / normProduct;
  return Math.min(1.0, Math.max(-1.0, sim));
}

/**
 * Calculate positional decay multiplier based on rank index (0-indexed).
 */
export function calculatePositionalDecay(
  rank: number,
  lambda: number = 0.05,
  method: 'exponential' | 'logarithmic' = 'exponential'
): number {
  if (rank < 0) return 1.0;
  if (method === 'logarithmic') {
    return 1.0 / Math.log2(rank + 2.0);
  }
  return Math.exp(-lambda * rank);
}

/**
 * Performs Maximal Marginal Relevance (MMR) reranking over retrieved candidate chunks.
 *
 * MMR Formula:
 *   Argmax_{d_i in R \ S} [ lambda * Sim(d_i, q) - (1 - lambda) * max_{d_j in S} Sim(d_i, d_j) ]
 */
export function rerankWithMMR(options: RerankOptions): RerankResult {
  const startTime = performance.now();
  const {
    queryEmbedding,
    candidates,
    topK = 5,
    diversityLambda = 0.7,
    minSimilarityThreshold = 0.0,
    applyPositionalDecay = false,
    decayLambda = 0.05,
  } = options;

  if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0) {
    throw new TypeError('queryEmbedding must be a non-empty array of numbers');
  }
  if (!Array.isArray(candidates)) {
    throw new TypeError('candidates must be an array');
  }

  const lambda = Math.min(1.0, Math.max(0.0, diversityLambda));

  // Step 1: Compute initial query similarities and filter noise below threshold
  const pool: Array<{
    candidate: RerankCandidate;
    querySim: number;
  }> = [];

  let discardedCount = 0;
  for (const candidate of candidates) {
    const sim = cosineSimilarity(queryEmbedding, candidate.embedding);
    if (sim < minSimilarityThreshold) {
      discardedCount++;
    } else {
      pool.push({ candidate, querySim: sim });
    }
  }

  const selected: RankedItem[] = [];
  const selectedEmbeddings: number[][] = [];
  const effectiveTopK = Math.min(topK, pool.length);

  // Step 2: Iteratively select candidates maximizing MMR objective
  while (selected.length < effectiveTopK && pool.length > 0) {
    let bestIndex = -1;
    let bestMmrScore = -Infinity;
    let bestMaxInterSim = 0.0;
    let bestQuerySim = 0.0;

    for (let i = 0; i < pool.length; i++) {
      const { candidate, querySim } = pool[i];

      // Max similarity with already selected chunks
      let maxInterSim = 0.0;
      if (selectedEmbeddings.length > 0) {
        for (const selEmb of selectedEmbeddings) {
          const interSim = cosineSimilarity(candidate.embedding, selEmb);
          if (interSim > maxInterSim) {
            maxInterSim = interSim;
          }
        }
      }

      // MMR objective score
      let mmrScore = lambda * querySim - (1.0 - lambda) * maxInterSim;

      // Optional positional decay
      if (applyPositionalDecay) {
        const decay = calculatePositionalDecay(selected.length, decayLambda);
        mmrScore *= decay;
      }

      if (mmrScore > bestMmrScore) {
        bestMmrScore = mmrScore;
        bestIndex = i;
        bestMaxInterSim = maxInterSim;
        bestQuerySim = querySim;
      }
    }

    if (bestIndex === -1) break;

    const chosen = pool.splice(bestIndex, 1)[0];
    selectedEmbeddings.push(chosen.candidate.embedding);

    selected.push({
      id: chosen.candidate.id,
      text: chosen.candidate.text,
      rerankScore: Math.min(1.0, Math.max(0.0, bestMmrScore)),
      relevanceScore: Math.min(1.0, Math.max(0.0, bestQuerySim)),
      diversityPenalty: Math.min(1.0, Math.max(0.0, bestMaxInterSim)),
      selectedRank: selected.length,
    });
  }

  const totalRel = selected.reduce((sum, item) => sum + item.relevanceScore, 0);
  const avgRelevance = selected.length > 0 ? totalRel / selected.length : 0.0;
  const processingTimeMs = Math.round((performance.now() - startTime) * 1000) / 1000;

  return {
    rankedChunks: selected,
    discardedCount,
    avgRelevance,
    processingTimeMs,
  };
}
