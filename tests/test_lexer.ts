/**
 * AEGIS-EDGE Test Suite: Lexer & Tokenizer Tests
 */

import { Lexer } from '../src/dsl/lexer.ts';
import { TokenType } from '../src/dsl/tokens.ts';
import { FastTokenizer } from '../src/core/tokenizer.ts';

export function runLexerTests(): boolean {
  console.log('  Testing FastTokenizer...');
  const text = 'The Edge Device operates at 128MB RAM, however it cannot exceed 50ms latency.';
  const tokens = FastTokenizer.tokenize(text, true);
  if (!tokens.includes('edge') || !tokens.includes('device') || !tokens.includes('operates')) {
    throw new Error('FastTokenizer failed keyword extraction');
  }

  const claims = FastTokenizer.extractClaims('Edge nodes require 64MB RAM. Furthermore, latency must be sub-50ms.');
  if (claims.length < 2) {
    throw new Error(`Expected at least 2 decomposed claims, got ${claims.length}`);
  }

  console.log('  Testing RAG-L Lexer...');
  const dslSrc = `
    evaluate pipeline "test_iot" with budget { latency_ms: 200 } {
      assert groundedness >= 0.85 fail_with "Unsafe";
      penalize semantic_drift > 0.30 by 0.2;
      hallucination_guard strict <= 0.15;
    }
  `;

  const lexer = new Lexer(dslSrc);
  const lexTokens = lexer.tokenize();

  const types = lexTokens.map(t => t.type);
  if (!types.includes(TokenType.EVALUATE) || !types.includes(TokenType.PIPELINE) || !types.includes(TokenType.ASSERT)) {
    throw new Error('RAG-L Lexer missed core keywords');
  }

  console.log('  ✓ Lexer & Tokenizer tests PASSED');
  return true;
}
