/**
 * AEGIS-EDGE Test Suite: BM25 Index Compactor & Memory Fragmentation Rotary
 */

import { BM25InvertedIndex } from '../src/core/bm25.ts';
import { IndexCompactorRotary } from '../src/core/index_compactor.ts';
import type { RetrievedChunk } from '../src/core/types.ts';

export function runIndexCompactorTests(): boolean {
  console.log('  Testing IndexCompactorRotary & Fragmentation Mitigation...');

  const index = new BM25InvertedIndex();
  const compactor = new IndexCompactorRotary({
    maxTombstonesRatio: 0.25,
    minCompactionIntervalMs: 50,
  });

  const docs: RetrievedChunk[] = [
    { id: 'c1', text: 'Hardware root of trust ensures tamper-resistant attestation.' },
    { id: 'c2', text: 'TPM quotes signed with Elliptic Curve Digital Signature Algorithm.' },
    { id: 'c3', text: 'Distributed consensus across Byzantine fault tolerant nodes.' },
    { id: 'c4', text: 'Temporary ephemeral chunk to be evicted.' },
    { id: 'c5', text: 'Another transient scratch entry.' },
  ];

  index.addDocuments(docs);
  const statsInit = index.getIndexStats();
  if (statsInit.docCount !== 5) {
    throw new Error(`Expected 5 docs, got ${statsInit.docCount}`);
  }

  // Evict documents (creating tombstones)
  index.removeDocument('c4');
  compactor.recordTombstone();
  index.removeDocument('c5');
  compactor.recordTombstone();

  // Measure search scores with active 3-doc corpus before compaction
  const preHits = index.search('tamper-resistant attestation', 2);
  if (preHits.length === 0 || preHits[0].chunk.id !== 'c1') {
    throw new Error('Pre-compaction search failed');
  }

  // 2 tombstones out of (3 active + 2 tombstones) = 40% > 25% threshold
  if (!compactor.shouldCompact(index.getIndexStats().docCount)) {
    throw new Error('Compactor should trigger when tombstone ratio exceeds 25%');
  }

  // Perform atomic compaction
  const report = compactor.compact(index);
  if (report.status !== 'COMPACTED') {
    throw new Error(`Expected COMPACTED status, got ${report.status}`);
  }
  if (report.beforeDocs !== 3 || report.afterDocs !== 3) {
    throw new Error(`Expected 3 docs preserved, got before=${report.beforeDocs}, after=${report.afterDocs}`);
  }
  if (report.purgedTombstones !== 2) {
    throw new Error(`Expected 2 purged tombstones, got ${report.purgedTombstones}`);
  }
  if (report.freedBytesEstimate <= 0) {
    throw new Error('Expected positive freed bytes estimate');
  }

  // Verify post-compaction search yields identical rank and scores
  const postHits = index.search('tamper-resistant attestation', 2);
  if (postHits.length === 0 || postHits[0].chunk.id !== 'c1') {
    throw new Error('Post-compaction search failed to retrieve c1');
  }
  if (Math.abs(postHits[0].score - preHits[0].score) > 1e-4) {
    throw new Error(`Scores diverge post compaction: pre=${preHits[0].score}, post=${postHits[0].score}`);
  }

  // Test throttle prevention
  const immediateReport = compactor.compact(index);
  if (immediateReport.status !== 'SKIPPED_THROTTLED') {
    throw new Error(`Expected SKIPPED_THROTTLED, got ${immediateReport.status}`);
  }

  console.log('  ✓ IndexCompactorRotary two-phase compaction & invariant tests PASSED');
  return true;
}
