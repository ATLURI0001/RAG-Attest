import assert from 'node:assert/strict';
import { ChunkDedupRotary } from '../src/chunk_dedup_rotary.ts';

export function runChunkDedupRotaryTests(): boolean {
  console.log('[AEGIS-EDGE] Running ChunkDedupRotary tests...');

  const rotary = new ChunkDedupRotary(4);
  rotary.record({ docId: 'd1', totalChunks: 10, dedupedChunks: 2, savedBytes: 1024, durationMicros: 40 });
  rotary.record({ docId: 'd2', totalChunks: 10, dedupedChunks: 4, savedBytes: 2048, durationMicros: 60 });

  const summary = rotary.getSummary();
  assert.equal(summary.sampleCount, 2);
  assert.equal(summary.dedupRatioPct, 30);
  assert.equal(summary.totalSavedBytes, 3072);
  assert.ok(summary.p50Micros > 0);

  console.log('✓ ChunkDedupRotary tests passed successfully.');
  return true;
}
