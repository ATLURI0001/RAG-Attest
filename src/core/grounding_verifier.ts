/**
 * Context Grounding Verification Protocol & Citation Anchor Engine for Aegis-RAG-Edge.
 */

export interface ContextChunk {
  id: string;
  text: string;
  source?: string;
}

export type ClaimVerdict = 'FULLY_GROUNDED' | 'PARTIALLY_GROUNDED' | 'UNSUPPORTED';

export interface ClaimVerification {
  sentence: string;
  verdict: ClaimVerdict;
  supportScore: number;
  bestMatchingChunkId?: string;
  citationsFound: string[];
  citationsValid: boolean;
}

export interface GroundingAttestation {
  overallGroundingScore: number;
  totalClaims: number;
  fullyGroundedCount: number;
  partiallyGroundedCount: number;
  unsupportedCount: number;
  claims: ClaimVerification[];
  isCompliant: boolean;
}

export interface GroundingVerifierOptions {
  minSupportThreshold?: number;
  partialThreshold?: number;
  minComplianceScore?: number;
}

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been',
  'in', 'on', 'at', 'to', 'for', 'with', 'by', 'of', 'from', 'this', 'that', 'it',
]);

/**
 * Normalizes string into salient content word tokens.
 */
function tokenizeSalientWords(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  return new Set(words);
}

export class GroundingVerifier {
  private readonly minSupportThreshold: number;
  private readonly partialThreshold: number;
  private readonly minComplianceScore: number;

  constructor(options: GroundingVerifierOptions = {}) {
    this.minSupportThreshold = options.minSupportThreshold ?? 0.65;
    this.partialThreshold = options.partialThreshold ?? 0.35;
    this.minComplianceScore = options.minComplianceScore ?? 0.70;
  }

  /**
   * Evaluates response sentences against context chunks, verifying claim support and citation anchors.
   */
  public verifyResponse(response: string, chunks: ContextChunk[]): GroundingAttestation {
    if (!response || !response.trim()) {
      return {
        overallGroundingScore: 1.0,
        totalClaims: 0,
        fullyGroundedCount: 0,
        partiallyGroundedCount: 0,
        unsupportedCount: 0,
        claims: [],
        isCompliant: true,
      };
    }

    const sentences = this.extractSentences(response);
    const chunkTokensMap = new Map<string, Set<string>>();
    for (const chunk of chunks) {
      chunkTokensMap.set(chunk.id, tokenizeSalientWords(chunk.text));
    }

    const claimResults: ClaimVerification[] = [];
    let fullyGrounded = 0;
    let partiallyGrounded = 0;
    let unsupported = 0;
    let scoreSum = 0;

    for (const sentence of sentences) {
      const claimTokens = tokenizeSalientWords(sentence);
      const citations = this.extractCitationRefs(sentence);

      if (claimTokens.size === 0) {
        // Conversational/filler sentence without verifiable substantive content
        continue;
      }

      let bestScore = 0;
      let bestChunkId: string | undefined;

      // Evaluate against all context chunks
      for (const chunk of chunks) {
        const cTokens = chunkTokensMap.get(chunk.id)!;
        const score = this.calculateLexicalOverlap(claimTokens, cTokens);
        if (score > bestScore) {
          bestScore = score;
          bestChunkId = chunk.id;
        }
      }

      // Check whether explicit citations match actual supporting chunks
      let citationsValid = true;
      if (citations.length > 0) {
        citationsValid = citations.some((c) => {
          const citedChunk = chunks.find((chk) => chk.id === c || chk.id === `chunk_${c}` || chk.id === `[${c}]`);
          if (!citedChunk) return false;
          const cTokens = chunkTokensMap.get(citedChunk.id)!;
          return this.calculateLexicalOverlap(claimTokens, cTokens) >= this.partialThreshold;
        });
      }

      let verdict: ClaimVerdict;
      if (bestScore >= this.minSupportThreshold && citationsValid) {
        verdict = 'FULLY_GROUNDED';
        fullyGrounded++;
      } else if (bestScore >= this.partialThreshold) {
        verdict = 'PARTIALLY_GROUNDED';
        partiallyGrounded++;
      } else {
        verdict = 'UNSUPPORTED';
        unsupported++;
      }

      scoreSum += bestScore;
      claimResults.push({
        sentence,
        verdict,
        supportScore: Math.round(bestScore * 1000) / 1000,
        bestMatchingChunkId: bestChunkId,
        citationsFound: citations,
        citationsValid,
      });
    }

    const total = claimResults.length;
    const overallScore = total > 0 ? scoreSum / total : 1.0;

    return {
      overallGroundingScore: Math.round(overallScore * 1000) / 1000,
      totalClaims: total,
      fullyGroundedCount: fullyGrounded,
      partiallyGroundedCount: partiallyGrounded,
      unsupportedCount: unsupported,
      claims: claimResults,
      isCompliant: overallScore >= this.minComplianceScore && unsupported === 0,
    };
  }

  /**
   * Partitions narrative text into discrete, verifiable claim sentences.
   */
  public extractSentences(text: string): string[] {
    const clean = text.replace(/\[\d+\]/g, '').trim();
    const rawSentences = clean
      .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
      .map((s) => s.trim())
      .filter((s) => s.length > 8);
    return rawSentences.length > 0 ? rawSentences : [text.trim()];
  }

  /**
   * Extracts inline citations such as [1], [chunk_1], or [doc-a].
   */
  public extractCitationRefs(sentence: string): string[] {
    const matches = sentence.match(/\[([a-zA-Z0-9_-]+)\]/g);
    if (!matches) return [];
    return matches.map((m) => m.slice(1, -1));
  }

  /**
   * Computes Jaccard/overlap metric between claim salient tokens and chunk tokens.
   */
  private calculateLexicalOverlap(claimTokens: Set<string>, chunkTokens: Set<string>): number {
    if (claimTokens.size === 0 || chunkTokens.size === 0) return 0;
    let matchCount = 0;
    for (const t of claimTokens) {
      if (chunkTokens.has(t)) {
        matchCount++;
      }
    }
    // Asymmetric recall: what proportion of the claim's content words are justified by the chunk?
    return matchCount / claimTokens.size;
  }
}
