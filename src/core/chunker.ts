/**
 * Semantic Boundary-Aware Text Chunker & Context Compressor for Aegis RAG Edge.
 * Provides sentence-boundary windowing, token overlap slicing, offset provenance tracking,
 * and Jaccard similarity deduplication.
 */

import { createHash } from 'node:crypto';

export interface ChunkSpec {
  chunkIndex: number;
  text: string;
  tokenCount: number;
  startOffset: number;
  endOffset: number;
  sha256Prefix: string;
}

export interface ChunkerOptions {
  maxTokensPerChunk?: number;
  overlapTokens?: number;
  dedupThreshold?: number;
}

const COMMON_ABBREVIATIONS = new Set([
  'dr.',
  'mr.',
  'mrs.',
  'ms.',
  'prof.',
  'inc.',
  'ltd.',
  'corp.',
  'u.s.',
  'u.k.',
  'e.g.',
  'i.e.',
]);

/**
 * Splits text into grammatical sentence units while protecting standard abbreviations.
 */
export function splitSentences(text: string): { text: string; start: number; end: number }[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  // Split on sentence terminators followed by whitespace and an uppercase character
  const rawParts = text.split(/(?<=[.!?])\s+(?=[A-Z])/);
  const merged: string[] = [];

  for (const p of rawParts) {
    if (!p) continue;
    if (merged.length > 0) {
      const lastToken = merged[merged.length - 1].trim().split(/\s+/).pop()?.toLowerCase();
      if (lastToken && COMMON_ABBREVIATIONS.has(lastToken)) {
        merged[merged.length - 1] += ' ' + p;
        continue;
      }
    }
    merged.push(p);
  }

  const result: { text: string; start: number; end: number }[] = [];
  let searchIdx = 0;

  for (const s of merged) {
    const sTrim = s.trim();
    if (!sTrim) continue;
    const start = text.indexOf(sTrim, searchIdx);
    const end = start !== -1 ? start + sTrim.length : searchIdx + sTrim.length;
    searchIdx = end;
    result.push({ text: sTrim, start, end });
  }

  return result;
}

/**
 * Fast whitespace token counter approximating subword token count.
 */
export function estimateTokens(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;
  // Standard heuristic: 1 word ~ 1.33 subword tokens
  return Math.ceil(words.length * 1.33);
}

/**
 * Computes token-level Jaccard similarity between two texts.
 */
export function computeJaccardSimilarity(textA: string, textB: string): number {
  const tokensA = new Set(textA.toLowerCase().split(/\s+/).filter(Boolean));
  const tokensB = new Set(textB.toLowerCase().split(/\s+/).filter(Boolean));

  if (tokensA.size === 0 && tokensB.size === 0) return 1.0;
  if (tokensA.size === 0 || tokensB.size === 0) return 0.0;

  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }

  const union = tokensA.size + tokensB.size - intersection;
  return union > 0 ? intersection / union : 0.0;
}

/**
 * Partitions a document into semantic overlapping chunks with deduplication.
 */
export function chunkDocument(text: string, options: ChunkerOptions = {}): ChunkSpec[] {
  const maxTokens = Math.max(16, options.maxTokensPerChunk || 256);
  const overlap = Math.min(Math.floor(maxTokens / 2), Math.max(0, options.overlapTokens ?? 32));
  const dedupThreshold = options.dedupThreshold ?? 0.85;

  const sentences = splitSentences(text);
  if (sentences.length === 0) return [];

  const rawChunks: { text: string; start: number; end: number }[] = [];

  let currentSentences: { text: string; start: number; end: number }[] = [];
  let currentTokens = 0;

  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    const sTokens = estimateTokens(s.text);

    if (currentTokens + sTokens > maxTokens && currentSentences.length > 0) {
      // Finalize current chunk
      const chunkText = currentSentences.map((x) => x.text).join(' ');
      rawChunks.push({
        text: chunkText,
        start: currentSentences[0].start,
        end: currentSentences[currentSentences.length - 1].end,
      });

      // Compute overlapping trailing sentences for next chunk
      const overlapSentences: { text: string; start: number; end: number }[] = [];
      let accumulatedOverlap = 0;

      for (let j = currentSentences.length - 1; j >= 0; j--) {
        const item = currentSentences[j];
        const tok = estimateTokens(item.text);
        if (accumulatedOverlap + tok <= overlap) {
          overlapSentences.unshift(item);
          accumulatedOverlap += tok;
        } else {
          break;
        }
      }

      currentSentences = overlapSentences;
      currentTokens = accumulatedOverlap;
    }

    currentSentences.push(s);
    currentTokens += sTokens;
  }

  if (currentSentences.length > 0) {
    const chunkText = currentSentences.map((x) => x.text).join(' ');
    rawChunks.push({
      text: chunkText,
      start: currentSentences[0].start,
      end: currentSentences[currentSentences.length - 1].end,
    });
  }

  // Deduplication pass
  const deduped: ChunkSpec[] = [];
  let chunkIdx = 0;

  for (const rc of rawChunks) {
    let isRedundant = false;
    for (const existing of deduped) {
      const sim = computeJaccardSimilarity(rc.text, existing.text);
      if (sim >= dedupThreshold) {
        isRedundant = true;
        break;
      }
    }

    if (!isRedundant) {
      const hashPrefix = createHash('sha256').update(rc.text).digest('hex').slice(0, 12);
      deduped.push({
        chunkIndex: chunkIdx++,
        text: rc.text,
        tokenCount: estimateTokens(rc.text),
        startOffset: rc.start,
        endOffset: rc.end,
        sha256Prefix: hashPrefix,
      });
    }
  }

  return deduped;
}
