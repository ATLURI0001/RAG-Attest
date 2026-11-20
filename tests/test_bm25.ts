/**
 * AEGIS-EDGE Test Suite: BM25 Inverted Index & Reciprocal Rank Fusion (RRF)
 */

import { BM25InvertedIndex, reciprocalRankFusion } from '../src/core/bm25.ts';
import type { RetrievedChunk } from '../src/core/types.ts';

export function runBm25Tests(): boolean {
  console.log('  Testing BM25 Inverted Index & Incremental Eviction...');
  const index = new BM25InvertedIndex({ k1: 1.5, b: 0.75 });

  const corpus: RetrievedChunk[] = [
    { id: 'd1', text: 'AES-256-GCM encryption is mandated for sovereign edge telemetry traffic.' },
    { id: 'd2', text: 'Mutual TLS authentication with hardware TPM attestation protects edge nodes.' },
    { id: 'd3', text: 'Encryption keys rotate every twenty-four hours via envelope encryption.' },
    { id: 'd4', text: 'Unrelated thermal fan curve tuning for chassis airflow.' }
  ];

  const count = index.addDocuments(corpus);
  if (count !== 4) {
    throw new Error(`Expected 4 indexed docs, got ${count}`);
  }

  const hits = index.search('AES-256-GCM encryption edge traffic', 3);
  if (hits.length === 0 || hits[0].chunk.id !== 'd1') {
    throw new Error(`Expected d1 ranked #1 for encryption query, got ${JSON.stringify(hits.map(h => h.chunk.id))}`);
  }
  if (hits[0].score <= hits[1].score) {
    throw new Error('Expected strictly higher BM25 score for primary matching chunk');
  }

  // Test document replacement & deletion pruning empty postings
  index.addDocument({ id: 'd4', text: 'Updated thermal cooling specification.' });
  const removed = index.removeDocument('d4');
  if (!removed) {
    throw new Error('Expected removeDocument to return true for existing doc');
  }
  const stats = index.getIndexStats();
  if (stats.docCount !== 3) {
    throw new Error(`Expected docCount=3 after removal, got ${stats.docCount}`);
  }
  if (index.search('thermal cooling', 3).length !== 0) {
    throw new Error('Removed document terms must be pruned from postings');
  }

  console.log('  Testing Hybrid Reciprocal Rank Fusion (RRF)...');
  const sparseRanking: RetrievedChunk[] = [corpus[0], corpus[2], corpus[1]]; // d1 (#1), d3 (#2), d2 (#3)
  const denseRanking: RetrievedChunk[] = [corpus[1], corpus[0]]; // d2 (#1), d1 (#2)

  // d1 appears high in both (#1 sparse + #2 dense) -> must beat single-list items
  const fused = reciprocalRankFusion({ sparse: sparseRanking, dense: denseRanking }, 60);
  if (fused.length !== 3) {
    throw new Error(`Expected 3 fused candidates, got ${fused.length}`);
  }
  if (fused[0].id !== 'd1') {
    throw new Error(`Expected d1 at top of RRF fusion, got ${fused[0].id}`);
  }
  if (fused[0].sourceRanks.sparse !== 1 || fused[0].sourceRanks.dense !== 2) {
    throw new Error(`Unexpected RRF rank provenance: ${JSON.stringify(fused[0].sourceRanks)}`);
  }

  // Weighted fusion favoring dense retrieval
  const weighted = reciprocalRankFusion(
    { sparse: sparseRanking, dense: denseRanking },
    60,
    { sparse: 0.2, dense: 2.0 }
  );
  if (weighted[0].id !== 'd2') {
    throw new Error(`Expected dense-weighted RRF to rank d2 #1, got ${weighted[0].id}`);
  }

  console.log('  ✓ BM25 Inverted Index & RRF Fusion tests PASSED');
  return true;
}
