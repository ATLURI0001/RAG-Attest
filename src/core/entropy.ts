/**
 * AEGIS-EDGE: Sovereign Edge RAG Evaluation Engine
 * Token Predictive Entropy, Perplexity & Lexical Diversity Profiler
 */

import { FastTokenizer } from './tokenizer.ts';

export interface EntropyProfile {
  shannonEntropy: number;
  normalizedEntropy: number;
  perplexity: number;
  typeTokenRatio: number;
  repetitionIndex: number;
  contentDensity: number;
  tokenCount: number;
  uniqueTokenCount: number;
  isDegenerateLoop: boolean;
  isGibberishAnomaly: boolean;
}

export interface EntropyOptions {
  ngramSize?: number;
  loopThreshold?: number;
  minTokensForAnomaly?: number;
}

const COMMON_STOPWORDS = new Set([
  'the', 'is', 'at', 'which', 'on', 'and', 'a', 'an', 'in', 'to', 'of',
  'for', 'with', 'as', 'by', 'that', 'this', 'it', 'from', 'be', 'are',
  'was', 'were', 'or', 'if', 'then', 'else', 'so', 'can', 'will', 'have'
]);

export class TokenEntropyGuard {
  /**
   * Computes multi-dimensional entropy and lexical diversity metrics over text.
   */
  static analyze(text: string, options: EntropyOptions = {}): EntropyProfile {
    const ngramSize = options.ngramSize ?? 2;
    const loopThreshold = options.loopThreshold ?? 0.65;
    const minTokensForAnomaly = options.minTokensForAnomaly ?? 8;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return {
        shannonEntropy: 0.0,
        normalizedEntropy: 0.0,
        perplexity: 1.0,
        typeTokenRatio: 0.0,
        repetitionIndex: 0.0,
        contentDensity: 0.0,
        tokenCount: 0,
        uniqueTokenCount: 0,
        isDegenerateLoop: false,
        isGibberishAnomaly: false,
      };
    }

    const tokens = FastTokenizer.tokenize(text.toLowerCase());
    const tokenCount = tokens.length;

    if (tokenCount === 0) {
      return {
        shannonEntropy: 0.0,
        normalizedEntropy: 0.0,
        perplexity: 1.0,
        typeTokenRatio: 0.0,
        repetitionIndex: 0.0,
        contentDensity: 0.0,
        tokenCount: 0,
        uniqueTokenCount: 0,
        isDegenerateLoop: false,
        isGibberishAnomaly: false,
      };
    }

    // 1. Unigram frequency distribution & Type-Token Ratio
    const tokenFreq = new Map<string, number>();
    let contentWords = 0;

    for (const t of tokens) {
      tokenFreq.set(t, (tokenFreq.get(t) || 0) + 1);
      if (!COMMON_STOPWORDS.has(t)) {
        contentWords++;
      }
    }

    const uniqueTokens = tokenFreq.size;
    const typeTokenRatio = Math.round((uniqueTokens / tokenCount) * 1e4) / 1e4;
    const contentDensity = Math.round((contentWords / tokenCount) * 1e4) / 1e4;

    // 2. Shannon Entropy & Perplexity: H = -sum(p * log2(p))
    let shannonEntropy = 0.0;
    for (const count of tokenFreq.values()) {
      const p = count / tokenCount;
      shannonEntropy -= p * Math.log2(p);
    }
    shannonEntropy = Math.round(shannonEntropy * 1e4) / 1e4;

    // Normalized entropy: H / log2(N)
    const maxEntropy = uniqueTokens > 1 ? Math.log2(uniqueTokens) : 1.0;
    const normalizedEntropy =
      uniqueTokens > 1 ? Math.round(Math.min(1.0, shannonEntropy / maxEntropy) * 1e4) / 1e4 : 0.0;

    const perplexity = Math.round(Math.pow(2, shannonEntropy) * 1e2) / 1e2;

    // 3. N-gram repetition index for loop detection
    let repetitionIndex = 0.0;
    let isDegenerateLoop = false;

    if (tokenCount >= ngramSize) {
      const ngrams: string[] = [];
      for (let i = 0; i <= tokenCount - ngramSize; i++) {
        ngrams.push(tokens.slice(i, i + ngramSize).join(' '));
      }
      const uniqueNgrams = new Set(ngrams).size;
      repetitionIndex = Math.round((1.0 - uniqueNgrams / ngrams.length) * 1e4) / 1e4;

      if (tokenCount >= minTokensForAnomaly && repetitionIndex >= loopThreshold) {
        isDegenerateLoop = true;
      }
    }

    // 4. Character-level gibberish check (high unigram entropy with very low dictionary hit)
    const isGibberishAnomaly =
      tokenCount >= minTokensForAnomaly &&
      normalizedEntropy > 0.95 &&
      contentDensity < 0.15 &&
      typeTokenRatio > 0.90;

    return {
      shannonEntropy,
      normalizedEntropy,
      perplexity,
      typeTokenRatio,
      repetitionIndex,
      contentDensity,
      tokenCount,
      uniqueTokenCount: uniqueTokens,
      isDegenerateLoop,
      isGibberishAnomaly,
    };
  }

  /**
   * Evaluates if a generation stream exhibits repetitive loop degeneration.
   */
  static isLooping(text: string, loopThreshold: number = 0.65): boolean {
    const profile = this.analyze(text, { loopThreshold });
    return profile.isDegenerateLoop;
  }
}
