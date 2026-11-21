/**
 * Dynamic Prompt Injection Defense & Context Jailbreak Guard
 *
 * Implements lexical boundary filtering, zero-width evasion sanitization,
 * imperative instruction override detection, and cryptographic context encapsulation.
 */

import { createHash } from 'node:crypto';

// Zero-width and bidirectional Unicode control characters used for evasion
const INVISIBLE_UNICODE_REGEX = /[\u200B-\u200D\uFEFF\u200E\u200F\u202A-\u202E\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

// Chat template boundary escape sequences
const BOUNDARY_ESCAPE_PATTERNS = [
  { name: 'CHAT_ML_DELIMITER', regex: /<\|(?:im_start|im_end|endoftext|system|user|assistant)\|>/i, risk: 0.9 },
  { name: 'LLAMA_INSTRUCTION_TAG', regex: /\[\/?(?:INST|SYS)\]/i, risk: 0.85 },
  { name: 'ROLE_PREFIX_INJECTION', regex: /(?:^|\n)\s*(?:System|Human|Assistant|Developer|User):\s+/i, risk: 0.75 },
  { name: 'DOUBLE_ANGLE_SYS', regex: /<<\/?SYS>>/i, risk: 0.85 },
];

// Malicious imperative overrides
const INSTRUCTION_OVERRIDE_PATTERNS = [
  { name: 'IGNORE_PREVIOUS', regex: /ignore\s+(?:all\s+)?(?:previous|prior|above)\s+(?:instructions|prompts|rules|commands)/i, risk: 1.0 },
  { name: 'DISREGARD_SYSTEM', regex: /disregard\s+(?:the\s+)?(?:system\s+)?(?:prompt|instructions|rules|guidelines)/i, risk: 1.0 },
  { name: 'JAILBREAK_MODE', regex: /(?:you\s+are\s+now\s+in|switch\s+to|enable)\s+(?:DAN|developer|jailbreak|unrestricted|god)\s+mode/i, risk: 0.95 },
  { name: 'SECRET_EXFILTRATION', regex: /(?:print|reveal|output|display|show)\s+(?:your\s+)?(?:full\s+)?(?:system\s+prompt|initial\s+instructions|hidden\s+rules)/i, risk: 0.9 },
  { name: 'OVERRIDE_SAFETY', regex: /(?:bypass|disable|override)\s+(?:all\s+)?(?:safety|content|ethical)\s+(?:filters|protocols|restrictions)/i, risk: 0.95 },
];

export interface GuardEvaluationResult {
  isSafe: boolean;
  riskScore: number; // [0.0, 1.0]
  flaggedPatterns: string[];
  sanitizedText: string;
}

export interface EncapsulatedChunk {
  chunkId: string;
  sanitizedContent: string;
  contentHash: string;
  xmlBlock: string;
}

/**
 * Strips zero-width unicode artifacts and normalizes whitespace.
 */
export function stripInvisibleUnicode(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }
  return text.replace(INVISIBLE_UNICODE_REGEX, '');
}

/**
 * Scans untrusted prompt or context text for injection and jailbreak patterns.
 */
export function evaluateContextSecurity(rawText: string, riskThreshold: number = 0.7): GuardEvaluationResult {
  const cleaned = stripInvisibleUnicode(rawText);
  const flagged = [];
  let maxRisk = 0.0;

  // 1. Boundary escape checking
  for (const item of BOUNDARY_ESCAPE_PATTERNS) {
    if (item.regex.test(cleaned)) {
      flagged.push(item.name);
      if (item.risk > maxRisk) {
        maxRisk = item.risk;
      }
    }
  }

  // 2. Instruction override checking
  for (const item of INSTRUCTION_OVERRIDE_PATTERNS) {
    if (item.regex.test(cleaned)) {
      flagged.push(item.name);
      if (item.risk > maxRisk) {
        maxRisk = item.risk;
      }
    }
  }

  // Sanitize text by neutralizing boundary markers if flagged
  let sanitized = cleaned;
  if (flagged.length > 0) {
    for (const item of BOUNDARY_ESCAPE_PATTERNS) {
      sanitized = sanitized.replace(item.regex, (match) => `[DEFUSED:${match.replace(/[^a-zA-Z0-9]/g, '')}]`);
    }
  }

  return {
    isSafe: maxRisk < riskThreshold,
    riskScore: Number(maxRisk.toFixed(2)),
    flaggedPatterns: flagged,
    sanitizedText: sanitized,
  };
}

/**
 * Encapsulates a retrieved context chunk inside an authenticated XML-style delimiter block.
 */
export function encapsulateRetrievedChunk(chunkId: string, content: string): EncapsulatedChunk {
  const sanitized = stripInvisibleUnicode(content);
  const hash = createHash('sha256').update(sanitized, 'utf8').digest('hex').slice(0, 16);

  const xmlBlock = [
    `<retrieved_context id="${chunkId}" sha256_prefix="${hash}">`,
    sanitized.trim(),
    `</retrieved_context>`,
  ].join('\n');

  return {
    chunkId,
    sanitizedContent: sanitized,
    contentHash: hash,
    xmlBlock,
  };
}
