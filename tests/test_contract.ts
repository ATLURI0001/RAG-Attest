/**
 * AEGIS-EDGE Ingress Contract, AST Bound & Sanitizer Tests
 */

import {
  validateRagPayloadContract,
  sanitizeRagText,
  checkAstDepthBounds,
  DEFAULT_CONTRACT_LIMITS,
} from '../src/core/contract.ts';

export function runContractTests(): boolean {
  console.log('  Testing RagPayload Contract, AST Depth Bound & Sanitizer...');

  // Test 1: Sanitize text with zero-width characters and control chars
  const dirtyText = 'Valid Text\u0000\u0008\u200BWith\u00A0Whitespace\uFEFFAnd\r\nBreaks';
  const cleanText = sanitizeRagText(dirtyText);
  if (cleanText.includes('\u0000') || cleanText.includes('\u200B') || cleanText.includes('\uFEFF')) {
    throw new Error('Sanitizer failed to strip null or zero-width unicode artifacts');
  }
  if (!cleanText.includes('Valid Text') || !cleanText.includes('With Whitespace')) {
    throw new Error('Sanitizer mangled legitimate text contents');
  }

  // Test 2: Reject non-object or null root payload
  const nullRes = validateRagPayloadContract(null);
  if (nullRes.valid || nullRes.errors.length === 0) {
    throw new Error('Contract validation should reject null root payload');
  }

  // Test 3: Validate well-formed payload
  const validPayload = {
    id: 'req_edge_001',
    query: 'What is the speed of light in vacuum?',
    retrievedChunks: [
      { id: 'c1', text: 'The speed of light in vacuum is approximately 299,792,458 meters per second.', rank: 1, score: 0.98 },
    ],
    generatedAnswer: 'The speed of light in vacuum is exactly 299,792,458 m/s.',
    latencyMs: 12.5,
    metadata: {
      source: 'physics-index',
      cached: false,
    },
  };

  const passRes = validateRagPayloadContract(validPayload);
  if (!passRes.valid || !passRes.sanitized) {
    throw new Error(`Valid payload failed validation: ${JSON.stringify(passRes.errors)}`);
  }
  if (passRes.sanitized.id !== 'req_edge_001' || passRes.sanitized.retrievedChunks.length !== 1) {
    throw new Error('Sanitized payload missing fields');
  }

  // Test 4: Reject missing query or invalid chunk structure
  const invalidPayload = {
    id: 'req_002',
    query: '',
    retrievedChunks: [
      { id: '', text: 123 }, // Invalid chunk
    ],
    generatedAnswer: 'Something',
  };
  const failRes = validateRagPayloadContract(invalidPayload);
  if (failRes.valid) {
    throw new Error('Contract validator failed to catch empty query and invalid chunk');
  }
  const hasQueryErr = failRes.errors.some(e => e.field === 'query');
  const hasChunkErr = failRes.errors.some(e => e.field.startsWith('retrievedChunks'));
  if (!hasQueryErr || !hasChunkErr) {
    throw new Error('Missing specific field validation errors for query or chunks');
  }

  // Test 5: AST Depth and Node Bound Checker
  const shallowAst = {
    type: 'BinaryOp',
    op: 'AND',
    left: { type: 'Comparison', metric: 'groundedness', op: '>=', threshold: 0.8 },
    right: { type: 'Comparison', metric: 'answerRelevance', op: '>=', threshold: 0.75 },
  };

  const shallowBound = checkAstDepthBounds(shallowAst, 10, 100);
  if (!shallowBound.valid || shallowBound.depth > 3) {
    throw new Error(`Shallow AST bound check failed: depth=${shallowBound.depth}`);
  }

  // Test 6: Deep nested AST exceeding safety budget
  let deepAst: any = { type: 'Literal', value: 1 };
  for (let i = 0; i < 40; i++) {
    deepAst = { type: 'UnaryOp', op: 'NOT', arg: deepAst };
  }

  const deepBound = checkAstDepthBounds(deepAst, 32, 1000);
  if (deepBound.valid) {
    throw new Error('AST depth checker failed to trip on depth > 32');
  }

  console.log('    ✔ RagPayload contract, sanitizer, and AST bound checks verified.');
  return true;
}
