import assert from 'node:assert';
import {
  validateAndSanitizeIngestionDocument,
  sanitizeDocumentContent,
  validateDocumentId,
  validateContentType,
  sanitizeDocumentMetadata,
  IngestionContractError,
} from '../src/core/ingestion_contract.ts';

export function runIngestionContractTests(): boolean {
  console.log('  Testing IngestionContract & Metadata Sanitizer...');

  // 1. Success case
  const doc = validateAndSanitizeIngestionDocument({
    id: 'doc-1234.v1',
    content: 'This is high-confidence enterprise documentation content.',
    contentType: 'text/markdown',
    metadata: {
      'source.category': 'security',
      'version': 2,
      'is_published': true,
      'tags': ['rag', 'vector', 'audit'],
    },
  });

  assert.strictEqual(doc.id, 'doc-1234.v1');
  assert.strictEqual(doc.contentType, 'text/markdown');
  assert.strictEqual(doc.metadata['source.category'], 'security');
  assert.strictEqual(doc.metadata['version'], 2);
  assert.strictEqual(doc.metadata['is_published'], true);
  assert.strictEqual(doc.contentHashSha256.length, 64);
  assert.strictEqual(typeof doc.sanitizedAt, 'string');

  // 2. Document ID validation
  assert.throws(() => validateDocumentId(''), /ERR_INVALID_DOCUMENT_ID/);
  assert.throws(() => validateDocumentId('doc/path/traversal'), /ERR_INVALID_DOCUMENT_ID/);
  assert.throws(() => validateDocumentId('has spaces'), /ERR_INVALID_DOCUMENT_ID/);
  assert.throws(() => validateDocumentId('a'.repeat(129)), /ERR_INVALID_DOCUMENT_ID/);

  // 3. Content sanitization and bounds
  assert.throws(() => sanitizeDocumentContent('tiny', 5), /ERR_INVALID_CONTENT_LENGTH/);

  // Strips null bytes, ANSI escapes, bidi overrides
  const dirtyContent = 'Valid \x00text with \x1B[31mANSI\x1B[0m and \u202Eoverride\u202C characters.';
  const cleanContent = sanitizeDocumentContent(dirtyContent);
  assert.ok(!cleanContent.includes('\x00'));
  assert.ok(!cleanContent.includes('\x1B'));
  assert.ok(!cleanContent.includes('\u202E'));

  // 4. Content Type validation
  assert.strictEqual(validateContentType('text/markdown'), 'text/markdown');
  assert.strictEqual(validateContentType(), 'text/plain');
  assert.throws(() => validateContentType('image/jpeg'), /ERR_UNSUPPORTED_CONTENT_TYPE/);

  // 5. Prototype pollution prevention
  assert.throws(() => sanitizeDocumentMetadata(JSON.parse('{"__proto__": {"admin": true}}')), /ERR_FORBIDDEN_METADATA_KEY/);
  assert.throws(() => sanitizeDocumentMetadata({ 'constructor': 'evil' }), /ERR_FORBIDDEN_METADATA_KEY/);
  assert.throws(() => sanitizeDocumentMetadata({ 'prototype': 'evil' }), /ERR_FORBIDDEN_METADATA_KEY/);

  // 6. Metadata schema validation
  assert.throws(() => sanitizeDocumentMetadata({ 'INVALID-KEY!': 123 }), /ERR_FORBIDDEN_METADATA_KEY/);
  assert.throws(() => sanitizeDocumentMetadata({ 'valid.key': NaN }), /ERR_MALFORMED_METADATA_VALUE/);
  assert.throws(() => sanitizeDocumentMetadata({ 'valid.key': { nested: 'not allowed' } }), /ERR_MALFORMED_METADATA_VALUE/);

  console.log('    ✔ Ingestion contract, content cleaner, and metadata sanitizer verified.');
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runIngestionContractTests();
}
