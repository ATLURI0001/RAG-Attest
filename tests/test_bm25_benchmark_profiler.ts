import assert from 'node:assert/strict';
import {
  BM25BenchmarkProfiler,
  type BM25WorkloadSpec,
} from '../src/bm25_benchmark_profiler.ts';

export function runBM25BenchmarkProfilerTests(): boolean {
  console.log('  Testing BM25 Inverted Index & Lexical Scoring Benchmark Profiler...');

  const profiler = new BM25BenchmarkProfiler();

  // 1. Synthetic Corpus Generation
  const corpus = profiler.generateSyntheticCorpus(50, 20);
  assert.equal(corpus.length, 50);
  assert.equal(corpus[0].id, 'doc-0');
  assert.ok(corpus[0].text.length > 0);

  // 2. Profile Workload
  const spec: BM25WorkloadSpec = {
    name: 'Corpus-50Doc',
    documentCount: 50,
    tokensPerDoc: 15,
    queryTokenCount: 5,
    topK: 5,
  };

  const report = profiler.profileWorkload(spec, 10, 2);
  assert.equal(report.documentCount, 50);
  assert.equal(report.iterations, 10);
  assert.equal(report.topK, 5);
  assert.ok(report.p50Ms >= 0);
  assert.ok(report.p90Ms >= report.p50Ms);
  assert.ok(report.maxMs >= report.p90Ms);
  assert.ok(report.throughputQps > 0);

  // 3. Generate Markdown Comparison Matrix
  const markdown = profiler.generateMarkdownMatrix([report]);
  assert.ok(markdown.includes('| Workload | Documents | Top-K |'));
  assert.ok(markdown.includes('| Corpus-50Doc | 50 | 5 |'));

  // 4. Input Bounds Guard
  assert.throws(
    () => profiler.profileWorkload({ ...spec, documentCount: 0 }),
    /documentCount must be positive/
  );

  assert.throws(
    () => profiler.profileWorkload(spec, 0),
    /iterations must be >= 1/
  );

  console.log('  ✓ BM25 Benchmark Profiler tests PASSED');
  return true;
}
