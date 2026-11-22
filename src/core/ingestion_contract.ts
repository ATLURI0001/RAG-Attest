/**
 * aegis-rag-edge - Document Ingestion Ingress Contract & Metadata Sanitizer
 *
 * Enforces strict boundary verification on documents entering the vector store and RAG pipeline.
 * Strips invisible injection characters (bidi overrides, null bytes, ANSI escapes), validates
 * metadata types against prototype pollution, and computes cryptographic SHA-256 digests.
 */

import { createHash } from 'node:crypto';

export interface IngestionDocumentInput {
  id: string;
  content: string;
  contentType?: string;
  metadata?: Record<string, any>;
}

export interface SanitizedIngestionDocument {
  id: string;
  content: string;
  contentType: string;
  metadata: Record<string, string | number | boolean | string[]>;
  contentLength: number;
  contentHashSha256: string;
  sanitizedAt: string;
}

export class IngestionContractError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(`[${code}] ${message}`);
    this.name = 'IngestionContractError';
    this.code = code;
  }
}

const DOCUMENT_ID_REGEX = /^[a-zA-Z0-9_\-\.]{1,128}$/;
const METADATA_KEY_REGEX = /^[a-z0-9_\.]{1,64}$/;

const ALLOWED_CONTENT_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/html',
  'text/csv',
  'application/json',
  'application/pdf',
]);

const FORBIDDEN_METADATA_KEYS = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);

// Strip dangerous control sequences: null bytes, ANSI escapes, bidi overrides (U+202A - U+202E, U+2066 - U+2069)
const ANSI_REGEX = /\x1B\[[0-9;]*[a-zA-Z]/g;
const BIDI_REGEX = /[\u202A-\u202E\u2066-\u2069]/g;
const NULL_BYTE_REGEX = /\x00/g;

/**
 * Sanitizes and normalizes document text content
 */
export function sanitizeDocumentContent(content: string, minLength: number = 5, maxLength: number = 10_000_000): string {
  if (content === null || content === undefined || typeof content !== 'string') {
    throw new IngestionContractError('ERR_INVALID_CONTENT_LENGTH', 'Document content must be a valid string');
  }

  // Strip null bytes, ANSI escapes, and bidi override controls
  let clean = content
    .replace(NULL_BYTE_REGEX, '')
    .replace(ANSI_REGEX, '')
    .replace(BIDI_REGEX, '')
    .trim();

  if (clean.length < minLength || clean.length > maxLength) {
    throw new IngestionContractError(
      'ERR_INVALID_CONTENT_LENGTH',
      `Document content length (${clean.length}) must be between ${minLength} and ${maxLength} characters`
    );
  }

  return clean;
}

/**
 * Validates document ID against format and length constraints
 */
export function validateDocumentId(id: string): string {
  if (!id || typeof id !== 'string') {
    throw new IngestionContractError('ERR_INVALID_DOCUMENT_ID', 'Document id must be a non-empty string');
  }

  const clean = id.trim();
  if (!DOCUMENT_ID_REGEX.test(clean)) {
    throw new IngestionContractError(
      'ERR_INVALID_DOCUMENT_ID',
      `Document id "${clean}" contains invalid characters or breaches 128-char limit`
    );
  }

  return clean;
}

/**
 * Validates and normalizes MIME content type
 */
export function validateContentType(contentType?: string): string {
  if (!contentType) {
    return 'text/plain';
  }

  const clean = contentType.trim().toLowerCase();
  if (!ALLOWED_CONTENT_TYPES.has(clean)) {
    throw new IngestionContractError(
      'ERR_UNSUPPORTED_CONTENT_TYPE',
      `Unsupported content-type: "${contentType}". Supported: ${Array.from(ALLOWED_CONTENT_TYPES).join(', ')}`
    );
  }

  return clean;
}

/**
 * Validates metadata key-value pairs against prototype pollution and malformed schemas
 */
export function sanitizeDocumentMetadata(metadata?: Record<string, any>): Record<string, string | number | boolean | string[]> {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }

  const sanitized: Record<string, string | number | boolean | string[]> = {};

  for (const [rawKey, rawVal] of Object.entries(metadata)) {
    const key = rawKey.trim().toLowerCase();

    if (FORBIDDEN_METADATA_KEYS.has(key)) {
      throw new IngestionContractError(
        'ERR_FORBIDDEN_METADATA_KEY',
        `Forbidden metadata key detected (prototype pollution vector): "${rawKey}"`
      );
    }

    if (!METADATA_KEY_REGEX.test(key)) {
      throw new IngestionContractError(
        'ERR_FORBIDDEN_METADATA_KEY',
        `Metadata key "${key}" contains invalid characters or exceeds 64 characters`
      );
    }

    if (rawVal === null || rawVal === undefined) {
      continue;
    }

    // Type validation
    const valType = typeof rawVal;
    if (valType === 'string') {
      sanitized[key] = rawVal.replace(NULL_BYTE_REGEX, '').trim();
    } else if (valType === 'number') {
      if (!Number.isFinite(rawVal)) {
        throw new IngestionContractError(
          'ERR_MALFORMED_METADATA_VALUE',
          `Metadata key "${key}" contains non-finite number`
        );
      }
      sanitized[key] = rawVal;
    } else if (valType === 'boolean') {
      sanitized[key] = rawVal;
    } else if (Array.isArray(rawVal)) {
      if (rawVal.length > 50) {
        throw new IngestionContractError(
          'ERR_MALFORMED_METADATA_VALUE',
          `Metadata key "${key}" array length exceeds 50 elements`
        );
      }
      sanitized[key] = rawVal.map(item => String(item).replace(NULL_BYTE_REGEX, '').trim());
    } else {
      throw new IngestionContractError(
        'ERR_MALFORMED_METADATA_VALUE',
        `Metadata key "${key}" has unsupported value type: ${valType}`
      );
    }
  }

  return sanitized;
}

/**
 * Validates and normalizes complete ingestion document payload
 */
export function validateAndSanitizeIngestionDocument(doc: IngestionDocumentInput): SanitizedIngestionDocument {
  const id = validateDocumentId(doc.id);
  const content = sanitizeDocumentContent(doc.content);
  const contentType = validateContentType(doc.contentType);
  const metadata = sanitizeDocumentMetadata(doc.metadata);

  const hash = createHash('sha256').update(content, 'utf8').digest('hex');

  return {
    id,
    content,
    contentType,
    metadata,
    contentLength: content.length,
    contentHashSha256: hash,
    sanitizedAt: new Date().toISOString(),
  };
}
