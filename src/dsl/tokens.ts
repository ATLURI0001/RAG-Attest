/**
 * AEGIS-EDGE: Sovereign Edge RAG Evaluation Engine
 * RAG-L (Retrieval-Augmented Generation Language) Token Definitions
 */

export const TokenType = {
  // Top-Level Declarations
  EVALUATE: 'EVALUATE',
  PIPELINE: 'PIPELINE',
  WITH: 'WITH',
  BUDGET: 'BUDGET',

  // Policy Statements
  ASSERT: 'ASSERT',
  INVARIANT: 'INVARIANT',
  PENALIZE: 'PENALIZE',
  REWARD: 'REWARD',
  FAIL_WITH: 'FAIL_WITH',
  SEVERITY: 'SEVERITY',

  // Conditionals & Logic
  IF: 'IF',
  AND: 'AND',
  OR: 'OR',
  NOT: 'NOT',

  // Quantifiers & Functions
  VERIFY: 'VERIFY',
  CLAIMS_IN: 'CLAIMS_IN',
  STRICTLY_ENTAILED: 'STRICTLY_ENTAILED',
  HALLUCINATION_GUARD: 'HALLUCINATION_GUARD',

  // Metric Identifiers
  CONTEXT_PRECISION: 'context_precision',
  GROUNDEDNESS: 'groundedness',
  ANSWER_RELEVANCE: 'answer_relevance',
  CONTEXT_RECALL: 'context_recall',
  SEMANTIC_DRIFT: 'semantic_drift',
  HALLUCINATION_RISK: 'hallucination_risk',
  CONTRADICTION_ENTROPY: 'contradiction_entropy',
  LATENCY_MS: 'latency_ms',
  TTFT_MS: 'ttft_ms',
  BREVITY_INDEX: 'brevity_index',

  // Literals
  IDENTIFIER: 'IDENTIFIER',
  NUMBER: 'NUMBER',
  STRING: 'STRING',
  BOOLEAN: 'BOOLEAN',

  // Operators & Delimiters
  GTE: '>=',
  LTE: '<=',
  GT: '>',
  LT: '<',
  EQ: '==',
  NEQ: '!=',
  ASSIGN: '=',
  PLUS: '+',
  MINUS: '-',
  STAR: '*',
  SLASH: '/',
  LPAREN: '(',
  RPAREN: ')',
  LBRACE: '{',
  RBRACE: '}',
  COMMA: ',',
  COLON: ':',
  SEMICOLON: ';',

  EOF: 'EOF'
} as const;

export type TokenType = typeof TokenType[keyof typeof TokenType];

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  col: number;
}
