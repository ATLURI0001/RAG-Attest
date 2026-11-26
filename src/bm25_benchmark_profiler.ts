/**
 * BM25 Inverted Index & Lexical Scoring Benchmark Profiler for AEGIS-RAG.
 *
 * Microbenchmarks sparse lexical token scoring, inverted index lookups,
 * BM25 IDF caching, and query latency percentiles across variable corpus scales.
 */

import { BM25InvertedIndex } from './core/bm25.ts';
import type { RetrievedChunk } from './core/types.ts';

export interface BM25WorkloadSpec {
  name: string;
  documentCount: number;
  tokensPerDoc: number;
  queryTokenCount: number;
  topK: number;
}

export interface BM25BenchmarkReport {
  workloadName: string;
  documentCount: number;
  iterations: number;
  topK: number;
  p50Ms: number;
  p90Ms: number;
  p99Ms: number;
  minMs: number;
  maxMs: number;
  avgMs: number;
  throughputQps: number;
}

export class BM25BenchmarkProfiler {
  /**
   * Generate synthetic documents with repeatable pseudo-random vocabulary.
   */
  public generateSyntheticCorpus(docCount: number, tokensPerDoc: number): RetrievedChunk[] {
    const vocab = [
      'retrieval', 'augmented', 'generation', 'vector', 'embedding', 'semantic', 'lexical',
      'bm25', 'scoring', 'corpus', 'inverted', 'index', 'tokenizer', 'relevance', 'ranking',
      'precision', 'recall', 'entropy', 'context', 'grounding', 'chunking', 'attestation',
      'latency', 'throughput', 'deterministic', 'edge', 'memory', 'cache', 'security', 'model'
    ];

    const chunks: RetrievedChunk[] = [];
    for (let i = 0; i < docCount; i++) {
      const words: string[] = [];
      for (let t = 0; t < tokensPerDoc; t++) {
        const wordIdx = (i * 7 + t * 13) % vocab.length;
        words.push(vocab[wordIdx]);
      }
      chunks.push({
        id: `doc-${i}`,
        text: words.join(' '),
        score: 0,
      });
    }
    return chunks;
  }

  /**
   * Run benchmark across a synthetic BM25 workload.
   */
  public profileWorkload(
    spec: BM25WorkloadSpec,
    iterations: number = 25,
    warmupIterations: number = 3
  ): BM25BenchmarkReport {
    if (spec.documentCount <= 0) {
      throw new Error(`documentCount must be positive, got ${spec.documentCount}`);
    }
    if (iterations < 1) {
      throw new Error(`iterations must be >= 1, got ${iterations}`);
    }

    const index = new BM25InvertedIndex();
    const docs = this.generateSyntheticCorpus(spec.documentCount, spec.tokensPerDoc);
    index.addDocuments(docs);

    const query = 'retrieval augmented generation vector ranking context';

    // Warmup
    for (let w = 0; w < warmupIterations; w++) {
      index.search(query, spec.topK);
    }

    const latencies: number[] = [];
    const t0Total = performance.now();

    for (let i = 0; i < iterations; i++) {
      const tStart = performance.now();
      const results = index.search(query, spec.topK);
      const dur = Math.max(0.001, performance.now() - tStart);
      latencies.push(dur);
    }

    const totalDurationMs = Math.max(0.001, performance.now() - t0Total);

    latencies.sort((a, b) => a - b);
    const n = latencies.length;

    const getP = (p: number): number => {
      const idx = Math.min(Math.floor((p / 100) * n), n - 1);
      return Math.round(latencies[idx] * 1000) / 1000;
    };

    const sum = latencies.reduce((acc, v) => acc + v, 0);
    const avg = Math.round((sum / n) * 1000) / 1000;
    const qps = Math.round((iterations / (totalDurationMs / 1000)));

    return {
      workloadName: spec.name,
      documentCount: spec.documentCount,
      iterations,
      topK: spec.topK,
      p50Ms: getP(50),
      p90Ms: getP(90),
      p99Ms: getP(99),
      minMs: Math.round(latencies[0] * 1000) / 1000,
      maxMs: Math.round(latencies[n - 1] * 1000) / 1000,
      avgMs: avg,
      throughputQps: qps,
    };
  }

  /**
   * Format comparative benchmark table in GitHub Markdown.
   */
  public generateMarkdownMatrix(reports: BM25BenchmarkReport[]): string {
    const lines = [
      '| Workload | Documents | Top-K | p50 (ms) | p90 (ms) | p99 (ms) | Max (ms) | Throughput (QPS) |',
      '| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |',
    ];

    for (const r of reports) {
      lines.push(
        `| ${r.workloadName} | ${r.documentCount.toLocaleString()} | ${r.topK} | ${r.p50Ms.toFixed(3)}ms | ${r.p90Ms.toFixed(3)}ms | ${r.p99Ms.toFixed(3)}ms | ${r.maxMs.toFixed(3)}ms | ${r.throughputQps.toLocaleString()} QPS |`
      );
    }

    return lines.join('\n');
  }
}
