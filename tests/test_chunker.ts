import assert from 'node:assert/strict';
import {
  splitSentences,
  estimateTokens,
  computeJaccardSimilarity,
  chunkDocument,
} from '../src/core/chunker.ts';

export function runChunkerTests(): boolean {
  console.log('  Testing Semantic Boundary-Aware Chunker & Context Compressor...');

  // 1. splitSentences protecting abbreviations
  const text = 'Dr. Smith traveled to the U.S. for research. The study concluded on Monday. Results were statistically significant!';
  const sentences = splitSentences(text);
  assert.equal(sentences.length, 3);
  assert.equal(sentences[0].text, 'Dr. Smith traveled to the U.S. for research.');
  assert.equal(sentences[1].text, 'The study concluded on Monday.');
  assert.equal(sentences[2].text, 'Results were statistically significant!');

  // 2. Token estimation
  assert.equal(estimateTokens(''), 0);
  assert.equal(estimateTokens('hello world'), 3); // 2 words * 1.33 = 2.66 -> 3

  // 3. Jaccard similarity
  assert.equal(computeJaccardSimilarity('', ''), 1.0);
  assert.equal(computeJaccardSimilarity('cat dog', 'dog cat'), 1.0);
  assert.equal(computeJaccardSimilarity('alpha beta', 'gamma delta'), 0.0);
  const jaccard = computeJaccardSimilarity('apple banana cherry', 'banana cherry date');
  assert.equal(jaccard, 2 / 4); // intersection {banana, cherry} / union {apple, banana, cherry, date}

  // 4. Document chunking with overlap & offset tracking
  const doc = 'First sentence is here. Second sentence continues the narrative. Third sentence provides detailed analysis. Fourth sentence gives concluding remarks.';
  const chunks = chunkDocument(doc, { maxTokensPerChunk: 10, overlapTokens: 4, dedupThreshold: 0.9 });

  assert.ok(chunks.length >= 2);
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    assert.equal(c.chunkIndex, i);
    assert.ok(c.tokenCount > 0);
    assert.ok(c.sha256Prefix.length === 12);
    assert.ok(c.startOffset >= 0);
    assert.ok(c.endOffset > c.startOffset);
  }

  // 5. Deduplication of identical/near-identical chunks
  const redundantDoc = 'Consistent sentence alpha. Consistent sentence alpha. Unique sentence beta.';
  const dedupedChunks = chunkDocument(redundantDoc, { maxTokensPerChunk: 50, dedupThreshold: 0.8 });
  assert.ok(dedupedChunks.length === 1);

  console.log('    ✔ Semantic chunker, overlap slicing, and deduplication verified.');
  return true;
}
