/**
 * AEGIS-EDGE: Okapi BM25 Inverted Index & Reciprocal Rank Fusion (RRF) Engine
 * Zero-dependency sparse lexical retrieval and hybrid rank fusion for edge RAG pipelines.
 */

import { FastTokenizer } from './tokenizer.ts';
import type { RetrievedChunk } from './types.ts';

export interface BM25Options {
  k1?: number;
  b?: number;
}

export interface ScoredChunk {
  chunk: RetrievedChunk;
  score: number;
  matchedTerms: string[];
}

export interface FusedResult {
  id: string;
  chunk: RetrievedChunk;
  rrfScore: number;
  sourceRanks: Record<string, number>;
}

export class BM25InvertedIndex {
  private readonly k1: number;
  private readonly b: number;
  private readonly docs = new Map<string, RetrievedChunk>();
  private readonly docLengths = new Map<string, number>();
  private readonly docTerms = new Map<string, Map<string, number>>();
  private readonly postings = new Map<string, Map<string, number>>();
  private totalDocLength = 0;

  constructor(options: BM25Options = {}) {
    this.k1 = typeof options.k1 === 'number' && Number.isFinite(options.k1) && options.k1 >= 0 ? options.k1 : 1.5;
    this.b = typeof options.b === 'number' && Number.isFinite(options.b) ? Math.max(0, Math.min(1, options.b)) : 0.75;
  }

  /**
   * Insert or replace a chunk in the inverted index in O(|tokens|).
   */
  addDocument(chunk: RetrievedChunk): void {
    if (!chunk || typeof chunk.id !== 'string' || !chunk.id.trim()) return;
    if (this.docs.has(chunk.id)) {
      this.removeDocument(chunk.id);
    }

    const text = typeof chunk.text === 'string' ? chunk.text : '';
    const tokens = FastTokenizer.tokenize(text, true);
    const tf = FastTokenizer.termFrequency(tokens);

    this.docs.set(chunk.id, chunk);
    this.docLengths.set(chunk.id, tokens.length);
    this.docTerms.set(chunk.id, tf);
    this.totalDocLength += tokens.length;

    for (const [term, freq] of tf.entries()) {
      let posting = this.postings.get(term);
      if (!posting) {
        posting = new Map<string, number>();
        this.postings.set(term, posting);
      }
      posting.set(chunk.id, freq);
    }
  }

  /**
   * Batch index an array of chunks.
   */
  addDocuments(chunks: RetrievedChunk[]): number {
    if (!Array.isArray(chunks)) return 0;
    let indexed = 0;
    for (const c of chunks) {
      if (c && typeof c.id === 'string' && c.id.trim()) {
        this.addDocument(c);
        indexed++;
      }
    }
    return indexed;
  }

  /**
   * Evict a document and prune empty posting lists to prevent memory leaks.
   */
  removeDocument(id: string): boolean {
    if (!this.docs.has(id)) return false;

    const length = this.docLengths.get(id) || 0;
    const tf = this.docTerms.get(id);
    if (tf) {
      for (const term of tf.keys()) {
        const posting = this.postings.get(term);
        if (posting) {
          posting.delete(id);
          if (posting.size === 0) {
            this.postings.delete(term);
          }
        }
      }
    }

    this.docs.delete(id);
    this.docLengths.delete(id);
    this.docTerms.delete(id);
    this.totalDocLength = Math.max(0, this.totalDocLength - length);
    return true;
  }

  /**
   * Lucene-style strictly positive Robertson-Sparck Jones IDF.
   */
  idf(term: string): number {
    const N = this.docs.size;
    if (N === 0) return 0;
    const df = this.postings.get(term)?.size || 0;
    return Math.log(1 + (N - df + 0.5) / (df + 0.5));
  }

  /**
   * Retrieve top-K documents scored by Okapi BM25 with deterministic tie-breaking.
   */
  search(query: string, topK: number = 10): ScoredChunk[] {
    if (typeof query !== 'string' || !query.trim() || this.docs.size === 0) return [];
    const limit = Math.max(1, Math.floor(Number.isFinite(topK) ? topK : 10));
    const queryTerms = Array.from(new Set(FastTokenizer.tokenize(query, true)));
    if (queryTerms.length === 0) return [];

    const avgdl = this.totalDocLength / this.docs.size || 1;
    const scores = new Map<string, number>();
    const matches = new Map<string, string[]>();

    for (const term of queryTerms) {
      const posting = this.postings.get(term);
      if (!posting) continue;
      const termIdf = this.idf(term);

      for (const [docId, tf] of posting.entries()) {
        const dl = this.docLengths.get(docId) || 0;
        const denom = tf + this.k1 * (1 - this.b + this.b * (dl / avgdl));
        const contrib = denom > 0 ? termIdf * ((tf * (this.k1 + 1)) / denom) : 0;

        scores.set(docId, (scores.get(docId) || 0) + contrib);
        let termList = matches.get(docId);
        if (!termList) {
          termList = [];
          matches.set(docId, termList);
        }
        termList.push(term);
      }
    }

    const results: ScoredChunk[] = [];
    for (const [docId, score] of scores.entries()) {
      const chunk = this.docs.get(docId);
      if (!chunk) continue;
      results.push({
        chunk,
        score: Math.round(score * 10000) / 10000,
        matchedTerms: matches.get(docId) || [],
      });
    }

    results.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.chunk.id.localeCompare(b.chunk.id);
    });

    return results.slice(0, limit);
  }

  getIndexStats(): {
    docCount: number;
    vocabSize: number;
    avgDocLength: number;
    totalPostings: number;
  } {
    let totalPostings = 0;
    for (const p of this.postings.values()) {
      totalPostings += p.size;
    }
    const docCount = this.docs.size;
    return {
      docCount,
      vocabSize: this.postings.size,
      avgDocLength: docCount > 0 ? Math.round((this.totalDocLength / docCount) * 100) / 100 : 0,
      totalPostings,
    };
  }
}

/**
 * Reciprocal Rank Fusion (RRF) across multiple named retrieval pipelines (e.g. BM25 + dense vector).
 */
export function reciprocalRankFusion(
  rankedSources: Record<string, RetrievedChunk[]>,
  k: number = 60,
  weights?: Record<string, number>
): FusedResult[] {
  if (!rankedSources || typeof rankedSources !== 'object') return [];
  const safeK = typeof k === 'number' && Number.isFinite(k) && k > 0 ? k : 60;

  const fused = new Map<string, FusedResult>();

  for (const [sourceName, chunks] of Object.entries(rankedSources)) {
    if (!Array.isArray(chunks)) continue;
    const rawWeight = weights && typeof weights[sourceName] === 'number' ? weights[sourceName] : 1.0;
    const weight = Number.isFinite(rawWeight) && rawWeight >= 0 ? rawWeight : 1.0;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (!chunk || typeof chunk.id !== 'string' || !chunk.id) continue;
      const rank = i + 1;
      const contribution = weight / (safeK + rank);

      let entry = fused.get(chunk.id);
      if (!entry) {
        entry = {
          id: chunk.id,
          chunk,
          rrfScore: 0,
          sourceRanks: {},
        };
        fused.set(chunk.id, entry);
      }
      entry.rrfScore += contribution;
      if (entry.sourceRanks[sourceName] === undefined) {
        entry.sourceRanks[sourceName] = rank;
      }
    }
  }

  const out = Array.from(fused.values()).map((item) => ({
    ...item,
    rrfScore: Math.round(item.rrfScore * 1000000) / 1000000,
  }));

  out.sort((a, b) => {
    if (b.rrfScore !== a.rrfScore) return b.rrfScore - a.rrfScore;
    return a.id.localeCompare(b.id);
  });

  return out;
}
