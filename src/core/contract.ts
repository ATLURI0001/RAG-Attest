/**
 * AEGIS-EDGE: Sovereign Edge RAG Evaluation Engine
 * Ingress Payload Contract, AST Bound Checker & Content Sanitizer
 */

import type { RagPayload, RetrievedChunk } from './types.ts';

export interface ContractValidationError {
  field: string;
  code: string;
  message: string;
}

export interface ContractValidationResult<T> {
  valid: boolean;
  sanitized?: T;
  errors: ContractValidationError[];
}

export interface AstBoundResult {
  valid: boolean;
  depth: number;
  nodeCount: number;
  error?: string;
}

export interface SanitizerOptions {
  stripControlChars?: boolean;
  normalizeWhitespace?: boolean;
  stripZeroWidth?: boolean;
  maxChars?: number;
}

export interface ContractLimits {
  maxIdLength: number;
  maxQueryLength: number;
  maxAnswerLength: number;
  maxChunks: number;
  maxChunkTextLength: number;
  maxMetadataKeys: number;
  maxMetadataDepth: number;
}

export const DEFAULT_CONTRACT_LIMITS: ContractLimits = {
  maxIdLength: 128,
  maxQueryLength: 4096,
  maxAnswerLength: 32768,
  maxChunks: 100,
  maxChunkTextLength: 32768,
  maxMetadataKeys: 64,
  maxMetadataDepth: 3,
};

const DANGEROUS_PROTO_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Strips dangerous ASCII control characters and zero-width unicode artifacts.
 */
export function sanitizeRagText(input: unknown, options: SanitizerOptions = {}): string {
  if (typeof input !== 'string') {
    return '';
  }

  const {
    stripControlChars = true,
    normalizeWhitespace = true,
    stripZeroWidth = true,
    maxChars = 65536,
  } = options;

  let text = input;

  if (stripZeroWidth) {
    // Strip zero-width space, non-joiner, joiner, BOM, and direction marks
    text = text.replace(/[\u200B-\u200D\uFEFF\u200E\u200F]/g, '');
  }

  if (stripControlChars) {
    // Strip C0 control characters except \t (\u0009), \n (\u000A), \r (\u000D)
    text = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  }

  if (normalizeWhitespace) {
    // Convert non-breaking spaces and normalize CRLF to LF
    text = text.replace(/\u00A0/g, ' ').replace(/\r\n/g, '\n');
  }

  if (text.length > maxChars) {
    text = text.slice(0, maxChars);
  }

  return text;
}

/**
 * Deeply sanitizes metadata preventing prototype pollution and limiting recursion depth.
 */
export function sanitizeMetadata(
  meta: unknown,
  maxKeys: number = 64,
  maxDepth: number = 3,
  currentDepth: number = 0
): Record<string, unknown> | undefined {
  if (meta === null || meta === undefined || typeof meta !== 'object' || Array.isArray(meta)) {
    return undefined;
  }

  if (currentDepth >= maxDepth) {
    return {};
  }

  const result: Record<string, unknown> = {};
  const entries = Object.entries(meta as Record<string, unknown>);
  let keyCount = 0;

  for (const [k, v] of entries) {
    if (keyCount >= maxKeys) break;
    if (DANGEROUS_PROTO_KEYS.has(k)) continue;

    if (v === null || typeof v === 'boolean' || typeof v === 'number' || typeof v === 'string') {
      result[k] = typeof v === 'string' ? sanitizeRagText(v, { maxChars: 1024 }) : v;
      keyCount++;
    } else if (Array.isArray(v)) {
      result[k] = v.slice(0, 32).map(item => (typeof item === 'string' ? sanitizeRagText(item, { maxChars: 512 }) : item));
      keyCount++;
    } else if (typeof v === 'object') {
      const child = sanitizeMetadata(v, maxKeys - keyCount, maxDepth, currentDepth + 1);
      if (child !== undefined) {
        result[k] = child;
        keyCount++;
      }
    }
  }

  return result;
}

/**
 * Validates and sanitizes ingress RagPayload against edge operational contracts.
 */
export function validateRagPayloadContract(
  raw: unknown,
  limits: Partial<ContractLimits> = {}
): ContractValidationResult<RagPayload> {
  const mergedLimits: ContractLimits = { ...DEFAULT_CONTRACT_LIMITS, ...limits };
  const errors: ContractValidationError[] = [];

  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      valid: false,
      errors: [{ field: 'root', code: 'INVALID_OBJECT', message: 'Payload must be a non-null JSON object' }],
    };
  }

  const obj = raw as Record<string, unknown>;

  // Validate ID
  let sanitizedId = '';
  if (typeof obj.id !== 'string' || obj.id.trim().length === 0) {
    errors.push({ field: 'id', code: 'REQUIRED_FIELD', message: 'Payload id is required and must be non-empty' });
  } else if (obj.id.length > mergedLimits.maxIdLength) {
    errors.push({
      field: 'id',
      code: 'LENGTH_EXCEEDED',
      message: `Payload id length ${obj.id.length} exceeds limit ${mergedLimits.maxIdLength}`,
    });
  } else {
    sanitizedId = sanitizeRagText(obj.id.trim(), { maxChars: mergedLimits.maxIdLength });
  }

  // Validate Query
  let sanitizedQuery = '';
  if (typeof obj.query !== 'string' || obj.query.trim().length === 0) {
    errors.push({ field: 'query', code: 'REQUIRED_FIELD', message: 'Query is required and cannot be empty' });
  } else if (obj.query.length > mergedLimits.maxQueryLength) {
    errors.push({
      field: 'query',
      code: 'LENGTH_EXCEEDED',
      message: `Query length ${obj.query.length} exceeds edge budget ${mergedLimits.maxQueryLength}`,
    });
  } else {
    sanitizedQuery = sanitizeRagText(obj.query, { maxChars: mergedLimits.maxQueryLength });
  }

  // Validate Generated Answer
  let sanitizedAnswer = '';
  if (typeof obj.generatedAnswer !== 'string') {
    errors.push({ field: 'generatedAnswer', code: 'REQUIRED_FIELD', message: 'generatedAnswer must be a string' });
  } else if (obj.generatedAnswer.length > mergedLimits.maxAnswerLength) {
    errors.push({
      field: 'generatedAnswer',
      code: 'LENGTH_EXCEEDED',
      message: `generatedAnswer length ${obj.generatedAnswer.length} exceeds limit ${mergedLimits.maxAnswerLength}`,
    });
  } else {
    sanitizedAnswer = sanitizeRagText(obj.generatedAnswer, { maxChars: mergedLimits.maxAnswerLength });
  }

  // Validate Retrieved Chunks
  const sanitizedChunks: RetrievedChunk[] = [];
  if (!Array.isArray(obj.retrievedChunks)) {
    errors.push({
      field: 'retrievedChunks',
      code: 'TYPE_MISMATCH',
      message: 'retrievedChunks must be an array of chunk objects',
    });
  } else if (obj.retrievedChunks.length > mergedLimits.maxChunks) {
    errors.push({
      field: 'retrievedChunks',
      code: 'MAX_CHUNKS_EXCEEDED',
      message: `Retrieved chunks count ${obj.retrievedChunks.length} exceeds maximum limit of ${mergedLimits.maxChunks}`,
    });
  } else {
    for (let i = 0; i < obj.retrievedChunks.length; i++) {
      const chunk = obj.retrievedChunks[i];
      if (chunk === null || typeof chunk !== 'object') {
        errors.push({
          field: `retrievedChunks[${i}]`,
          code: 'INVALID_CHUNK',
          message: `Chunk at index ${i} is not a valid object`,
        });
        continue;
      }

      const cObj = chunk as Record<string, unknown>;
      if (typeof cObj.id !== 'string' || cObj.id.trim().length === 0) {
        errors.push({
          field: `retrievedChunks[${i}].id`,
          code: 'REQUIRED_FIELD',
          message: `Chunk at index ${i} requires a non-empty string id`,
        });
      }
      if (typeof cObj.text !== 'string') {
        errors.push({
          field: `retrievedChunks[${i}].text`,
          code: 'REQUIRED_FIELD',
          message: `Chunk at index ${i} requires string text`,
        });
      }

      if (typeof cObj.id === 'string' && typeof cObj.text === 'string') {
        const sanitizedChunkText = sanitizeRagText(cObj.text, { maxChars: mergedLimits.maxChunkTextLength });
        const sc: RetrievedChunk = {
          id: sanitizeRagText(cObj.id, { maxChars: mergedLimits.maxIdLength }),
          text: sanitizedChunkText,
        };
        if (typeof cObj.rank === 'number' && Number.isInteger(cObj.rank) && cObj.rank >= 0) {
          sc.rank = cObj.rank;
        }
        if (typeof cObj.score === 'number' && Number.isFinite(cObj.score)) {
          sc.score = Math.max(0.0, Math.min(1.0, cObj.score));
        }
        if (typeof cObj.sourceUri === 'string') {
          sc.sourceUri = sanitizeRagText(cObj.sourceUri, { maxChars: 1024 });
        }
        sanitizedChunks.push(sc);
      }
    }
  }

  // Optional ground truth
  let sanitizedGroundTruth: string | undefined = undefined;
  if (obj.groundTruth !== undefined) {
    if (typeof obj.groundTruth !== 'string') {
      errors.push({ field: 'groundTruth', code: 'TYPE_MISMATCH', message: 'groundTruth must be a string if provided' });
    } else {
      sanitizedGroundTruth = sanitizeRagText(obj.groundTruth, { maxChars: mergedLimits.maxAnswerLength });
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const sanitizedPayload: RagPayload = {
    id: sanitizedId,
    query: sanitizedQuery,
    retrievedChunks: sanitizedChunks,
    generatedAnswer: sanitizedAnswer,
    ...(sanitizedGroundTruth !== undefined ? { groundTruth: sanitizedGroundTruth } : {}),
    ...(typeof obj.latencyMs === 'number' && obj.latencyMs >= 0 ? { latencyMs: obj.latencyMs } : {}),
    ...(typeof obj.ttftMs === 'number' && obj.ttftMs >= 0 ? { ttftMs: obj.ttftMs } : {}),
    ...(typeof obj.tokensGenerated === 'number' && obj.tokensGenerated >= 0
      ? { tokensGenerated: obj.tokensGenerated }
      : {}),
    timestamp: typeof obj.timestamp === 'string' ? obj.timestamp : new Date().toISOString(),
    metadata: sanitizeMetadata(obj.metadata, mergedLimits.maxMetadataKeys, mergedLimits.maxMetadataDepth),
  };

  return {
    valid: true,
    sanitized: sanitizedPayload,
    errors: [],
  };
}

/**
 * AST Depth and Node Count Bound Checker
 * Guarantees that evaluation expression trees do not exceed stack safety budgets.
 */
export function checkAstDepthBounds(
  node: unknown,
  maxDepth: number = 32,
  maxNodes: number = 1000
): AstBoundResult {
  let totalNodes = 0;

  function traverse(n: unknown, currentDepth: number): number {
    if (n === null || typeof n !== 'object') {
      return currentDepth;
    }

    totalNodes++;
    if (currentDepth > maxDepth) {
      throw new Error(`AST depth ${currentDepth} exceeded maximum safety threshold of ${maxDepth}`);
    }
    if (totalNodes > maxNodes) {
      throw new Error(`AST node count ${totalNodes} exceeded maximum node budget of ${maxNodes}`);
    }

    let deepest = currentDepth;
    const obj = n as Record<string, unknown>;

    for (const key of Object.keys(obj)) {
      if (DANGEROUS_PROTO_KEYS.has(key)) continue;
      const val = obj[key];
      if (Array.isArray(val)) {
        for (const item of val) {
          deepest = Math.max(deepest, traverse(item, currentDepth + 1));
        }
      } else if (val !== null && typeof val === 'object') {
        deepest = Math.max(deepest, traverse(val, currentDepth + 1));
      }
    }

    return deepest;
  }

  try {
    const depth = traverse(node, 1);
    return {
      valid: true,
      depth,
      nodeCount: totalNodes,
    };
  } catch (err: any) {
    return {
      valid: false,
      depth: maxDepth + 1,
      nodeCount: totalNodes,
      error: err.message,
    };
  }
}
