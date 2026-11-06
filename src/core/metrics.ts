/**
 * AEGIS-EDGE: Sovereign Edge RAG Evaluation Engine
 * Pure Mathematical & Information-Theoretic Edge Evaluation Metrics
 */

import { FastTokenizer } from './tokenizer.ts';
import type {
  RetrievedChunk,
  ClaimVerification,
  RagTriadMetrics,
  ExtendedMetrics,
  RagPayload
} from './types.ts';

export class EdgeMetricsEngine {
  /**
   * Cosine similarity between two term-frequency maps.
   */
  static cosineSimilarity(tf1: Map<string, number>, tf2: Map<string, number>): number {
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (const [term, count] of tf1.entries()) {
      norm1 += count * count;
      if (tf2.has(term)) {
        dotProduct += count * (tf2.get(term) || 0);
      }
    }

    for (const count of tf2.values()) {
      norm2 += count * count;
    }

    if (norm1 === 0 || norm2 === 0) return 0;
    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  /**
   * Jaccard overlap over token sets or n-gram sets.
   */
  static jaccardSimilarity(set1: Set<string>, set2: Set<string>): number {
    if (set1.size === 0 && set2.size === 0) return 1.0;
    if (set1.size === 0 || set2.size === 0) return 0.0;

    let intersection = 0;
    for (const item of set1) {
      if (set2.has(item)) intersection++;
    }

    const union = set1.size + set2.size - intersection;
    return union > 0 ? intersection / union : 0.0;
  }

  /**
   * Longest Common Subsequence ratio between two token sequences.
   */
  static lcsRatio(tokensA: string[], tokensB: string[]): number {
    const m = tokensA.length;
    const n = tokensB.length;
    if (m === 0 || n === 0) return 0;

    // Use single-row DP for edge memory efficiency O(N) space
    let prev = new Array(n + 1).fill(0);
    let curr = new Array(n + 1).fill(0);

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (tokensA[i - 1] === tokensB[j - 1]) {
          curr[j] = prev[j - 1] + 1;
        } else {
          curr[j] = Math.max(prev[j], curr[j - 1]);
        }
      }
      [prev, curr] = [curr, prev];
      curr.fill(0);
    }

    const lcsLen = prev[n];
    return (2 * lcsLen) / (m + n);
  }

  /**
   * Context Precision: Evaluates whether the retrieval mechanism placed
   * relevant information at the top ranks using Discounted Cumulative Gain (DCG).
   */
  static evaluateContextPrecision(query: string, chunks: RetrievedChunk[]): number {
    if (!chunks || chunks.length === 0) return 0.0;

    const queryTokens = new Set(FastTokenizer.tokenize(query, true));
    if (queryTokens.size === 0) return 1.0;

    const relevances: number[] = [];

    for (const chunk of chunks) {
      const chunkTokens = new Set(FastTokenizer.tokenize(chunk.text, true));
      let matches = 0;
      for (const qt of queryTokens) {
        if (chunkTokens.has(qt)) matches++;
      }

      // Relevance score between 0.0 and 1.0 based on keyword recall
      const rel = matches / queryTokens.size;
      relevances.push(rel >= 0.35 ? 1.0 : rel);
    }

    // Compute DCG and Ideal DCG
    let dcg = 0;
    for (let i = 0; i < relevances.length; i++) {
      const rank = i + 1;
      dcg += (Math.pow(2, relevances[i]) - 1) / Math.log2(rank + 1);
    }

    const idealRelevances = [...relevances].sort((a, b) => b - a);
    let idcg = 0;
    for (let i = 0; i < idealRelevances.length; i++) {
      const rank = i + 1;
      idcg += (Math.pow(2, idealRelevances[i]) - 1) / Math.log2(rank + 1);
    }

    if (idcg === 0) {
      // If none was strictly relevant, reward higher ranks that have partial matches
      return Math.min(1.0, relevances[0] || 0.0);
    }

    const ndcg = dcg / idcg;
    return Math.max(0.0, Math.min(1.0, ndcg));
  }

  /**
   * Claim-Level Groundedness & Hallucination Analysis:
   * Deconstructs generated answer into atomic claims, verifies each claim against
   * the retrieved chunks using multi-order n-grams and polarity detection.
   */
  static evaluateGroundednessAndClaims(
    answer: string,
    chunks: RetrievedChunk[]
  ): {
    groundedness: number;
    claims: ClaimVerification[];
    contradictionEntropy: number;
  } {
    const rawClaims = FastTokenizer.extractClaims(answer);
    if (rawClaims.length === 0) {
      return { groundedness: 1.0, claims: [], contradictionEntropy: 0.0 };
    }

    const claims: ClaimVerification[] = [];
    let entailedCount = 0;
    let contradictedCount = 0;

    const chunkData = chunks.map(c => {
      const tokens = FastTokenizer.tokenize(c.text, true);
      return {
        id: c.id,
        text: c.text,
        tokenSet: new Set(tokens),
        bigrams: new Set(FastTokenizer.ngrams(tokens, 2)),
        hasNegation: FastTokenizer.hasNegation(c.text)
      };
    });

    for (let i = 0; i < rawClaims.length; i++) {
      const claimText = rawClaims[i];
      const claimTokens = FastTokenizer.tokenize(claimText, true);
      const claimTokenSet = new Set(claimTokens);
      const claimBigrams = new Set(FastTokenizer.ngrams(claimTokens, 2));
      const claimHasNegation = FastTokenizer.hasNegation(claimText);

      let bestScore = 0.0;
      let bestChunkId: string | null = null;
      let matchingKeywords: string[] = [];
      let contradictionFlag = false;

      for (const cd of chunkData) {
        // Keyword overlap
        const matched: string[] = [];
        for (const ct of claimTokenSet) {
          if (cd.tokenSet.has(ct)) matched.push(ct);
        }

        const unigramScore = claimTokenSet.size > 0 ? matched.length / claimTokenSet.size : 0;
        const bigramScore = this.jaccardSimilarity(claimBigrams, cd.bigrams);

        // Harmonized match score
        const score = 0.65 * unigramScore + 0.35 * bigramScore;

        if (score > bestScore) {
          bestScore = score;
          bestChunkId = cd.id;
          matchingKeywords = matched;

          // Contradiction detection: High keyword overlap but conflicting negation polarity
          if (unigramScore >= 0.55 && claimHasNegation !== cd.hasNegation) {
            contradictionFlag = true;
          } else {
            contradictionFlag = false;
          }
        }
      }

      let status: 'ENTAILED' | 'CONTRADICTED' | 'UNGROUNDED';
      let confidence = bestScore;

      if (contradictionFlag) {
        status = 'CONTRADICTED';
        contradictedCount++;
        confidence = Math.min(0.95, bestScore + 0.2);
      } else if (bestScore >= 0.45) {
        status = 'ENTAILED';
        entailedCount++;
      } else {
        status = 'UNGROUNDED';
      }

      claims.push({
        id: `claim-${i + 1}`,
        claimText,
        status,
        confidence: Math.round(confidence * 100) / 100,
        bestMatchingChunkId: bestChunkId,
        matchScore: Math.round(bestScore * 100) / 100,
        overlapKeywords: matchingKeywords,
        negationDetected: claimHasNegation
      });
    }

    // Groundedness score = ratio of entailed claims, penalized severely by contradictions
    const baseGroundedness = entailedCount / rawClaims.length;
    const contradictionPenalty = (contradictedCount / rawClaims.length) * 0.8;
    const groundedness = Math.max(0.0, Math.min(1.0, baseGroundedness - contradictionPenalty));

    // Information-theoretic Contradiction Entropy
    const pContradicted = contradictedCount / rawClaims.length;
    const contradictionEntropy = pContradicted > 0
      ? -(pContradicted * Math.log2(pContradicted))
      : 0.0;

    return {
      groundedness: Math.round(groundedness * 1000) / 1000,
      claims,
      contradictionEntropy: Math.round(contradictionEntropy * 1000) / 1000
    };
  }

  /**
   * Answer Relevance: Measures how well the generated response directly
   * targets the question asked without non-sequiturs or query detachment.
   */
  static evaluateAnswerRelevance(query: string, answer: string): number {
    const queryTokens = FastTokenizer.tokenize(query, true);
    const answerTokens = FastTokenizer.tokenize(answer, true);

    if (queryTokens.length === 0 || answerTokens.length === 0) return 0.0;

    const queryTf = FastTokenizer.termFrequency(queryTokens);
    const answerTf = FastTokenizer.termFrequency(answerTokens);

    // Cosine similarity in token space
    const cosSim = this.cosineSimilarity(queryTf, answerTf);

    // Key intent term recall: does answer address key terms from the question?
    let intentMatches = 0;
    for (const qt of queryTf.keys()) {
      if (answerTf.has(qt)) intentMatches++;
    }
    const intentRecall = intentMatches / queryTf.size;

    // Harmonize cosine and intent recall
    const relevance = 0.45 * cosSim + 0.55 * intentRecall;

    // Length brevity penalty: extremely short answers to complex questions
    const lengthPenalty = answerTokens.length < 3 ? 0.4 : 1.0;

    return Math.max(0.0, Math.min(1.0, relevance * lengthPenalty));
  }

  /**
   * Context Recall: Evaluates coverage of the expected ground truth or query premises
   * within the retrieved context chunks.
   */
  static evaluateContextRecall(
    query: string,
    chunks: RetrievedChunk[],
    groundTruth?: string
  ): number {
    const referenceText = groundTruth || query;
    const refTokens = new Set(FastTokenizer.tokenize(referenceText, true));

    if (refTokens.size === 0) return 1.0;
    if (!chunks || chunks.length === 0) return 0.0;

    const aggregateChunkTokens = new Set<string>();
    for (const chunk of chunks) {
      const tokens = FastTokenizer.tokenize(chunk.text, true);
      for (const t of tokens) aggregateChunkTokens.add(t);
    }

    let covered = 0;
    for (const rt of refTokens) {
      if (aggregateChunkTokens.has(rt)) covered++;
    }

    return Math.max(0.0, Math.min(1.0, covered / refTokens.size));
  }

  /**
   * Semantic Drift: Measures informational divergence between query intent and answer centroid.
   */
  static evaluateSemanticDrift(query: string, answer: string): number {
    const queryTokens = FastTokenizer.tokenize(query, true);
    const answerTokens = FastTokenizer.tokenize(answer, true);

    if (queryTokens.length === 0 || answerTokens.length === 0) return 1.0;

    const queryTf = FastTokenizer.termFrequency(queryTokens);
    const answerTf = FastTokenizer.termFrequency(answerTokens);
    const cos = this.cosineSimilarity(queryTf, answerTf);

    // Semantic drift is inversely proportional to alignment (drift = 1 - cosine)
    return Math.max(0.0, Math.min(1.0, 1.0 - cos));
  }

  /**
   * Brevity Index: Ratio of informative content to verbose fluff.
   */
  static evaluateBrevityIndex(answer: string): number {
    const rawTokens = FastTokenizer.tokenize(answer, false);
    const filteredTokens = FastTokenizer.tokenize(answer, true);

    if (rawTokens.length === 0) return 1.0;

    // Ratio of content-bearing tokens to total tokens
    const contentDensity = filteredTokens.length / rawTokens.length;

    // Type-Token Ratio (vocabulary diversity)
    const uniqueTokens = new Set(filteredTokens);
    const ttr = filteredTokens.length > 0 ? uniqueTokens.size / filteredTokens.length : 1.0;

    return Math.max(0.0, Math.min(1.0, 0.6 * contentDensity + 0.4 * ttr));
  }

  /**
   * Full edge evaluation computation for a RAG payload.
   */
  static computeAll(payload: RagPayload): {
    triad: RagTriadMetrics;
    extended: ExtendedMetrics;
    claims: ClaimVerification[];
  } {
    const contextPrecision = this.evaluateContextPrecision(payload.query, payload.retrievedChunks);
    const { groundedness, claims, contradictionEntropy } = this.evaluateGroundednessAndClaims(
      payload.generatedAnswer,
      payload.retrievedChunks
    );
    const answerRelevance = this.evaluateAnswerRelevance(payload.query, payload.generatedAnswer);

    const contextRecall = this.evaluateContextRecall(
      payload.query,
      payload.retrievedChunks,
      payload.groundTruth
    );
    const semanticDrift = this.evaluateSemanticDrift(payload.query, payload.generatedAnswer);
    const brevityIndex = this.evaluateBrevityIndex(payload.generatedAnswer);

    // Synthesized Hallucination Risk
    const ungroundedClaims = claims.filter(c => c.status === 'UNGROUNDED').length;
    const contradictedClaims = claims.filter(c => c.status === 'CONTRADICTED').length;
    const totalClaims = Math.max(1, claims.length);

    const rawRisk = (ungroundedClaims * 0.6 + contradictedClaims * 1.0) / totalClaims;
    const hallucinationRisk = Math.max(0.0, Math.min(1.0, rawRisk * (1.0 - 0.5 * groundedness)));

    const rawTokens = FastTokenizer.tokenize(payload.generatedAnswer, false);
    const uniqueSet = new Set(rawTokens);
    const lexicalDiversity = rawTokens.length > 0 ? uniqueSet.size / rawTokens.length : 1.0;

    return {
      triad: {
        contextPrecision: Math.round(contextPrecision * 1000) / 1000,
        groundedness: Math.round(groundedness * 1000) / 1000,
        answerRelevance: Math.round(answerRelevance * 1000) / 1000
      },
      extended: {
        contextRecall: Math.round(contextRecall * 1000) / 1000,
        semanticDrift: Math.round(semanticDrift * 1000) / 1000,
        hallucinationRisk: Math.round(hallucinationRisk * 1000) / 1000,
        contradictionEntropy,
        brevityIndex: Math.round(brevityIndex * 1000) / 1000,
        lexicalDiversity: Math.round(lexicalDiversity * 1000) / 1000
      },
      claims
    };
  }
}
