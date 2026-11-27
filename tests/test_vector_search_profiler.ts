import assert from 'node:assert/strict';
import { VectorSearchProfiler } from '../src/vector_search_profiler.ts';

export function runVectorSearchProfilerTests(): boolean {
  const p = new VectorSearchProfiler();
  p.record(10);
  p.record(20);
  assert.equal(p.avgMs(), 15);
  return true;
}
