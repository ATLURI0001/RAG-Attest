/**
 * AEGIS-EDGE: Sovereign Edge RAG Evaluation Engine
 * RAG-L (Retrieval-Augmented Generation Language) Lexer
 */

import { TokenType, type Token } from './tokens.ts';

const KEYWORDS: Record<string, TokenType> = {
  evaluate: TokenType.EVALUATE,
  pipeline: TokenType.PIPELINE,
  with: TokenType.WITH,
  budget: TokenType.BUDGET,
  assert: TokenType.ASSERT,
  invariant: TokenType.INVARIANT,
  penalize: TokenType.PENALIZE,
  reward: TokenType.REWARD,
  fail_with: TokenType.FAIL_WITH,
  severity: TokenType.SEVERITY,
  if: TokenType.IF,
  and: TokenType.AND,
  or: TokenType.OR,
  not: TokenType.NOT,
  verify: TokenType.VERIFY,
  claims_in: TokenType.CLAIMS_IN,
  strictly_entailed: TokenType.STRICTLY_ENTAILED,
  hallucination_guard: TokenType.HALLUCINATION_GUARD,
  true: TokenType.BOOLEAN,
  false: TokenType.BOOLEAN,

  // Builtin metrics
  context_precision: TokenType.CONTEXT_PRECISION,
  groundedness: TokenType.GROUNDEDNESS,
  answer_relevance: TokenType.ANSWER_RELEVANCE,
  context_recall: TokenType.CONTEXT_RECALL,
  semantic_drift: TokenType.SEMANTIC_DRIFT,
  hallucination_risk: TokenType.HALLUCINATION_RISK,
  contradiction_entropy: TokenType.CONTRADICTION_ENTROPY,
  latency_ms: TokenType.LATENCY_MS,
  ttft_ms: TokenType.TTFT_MS,
  brevity_index: TokenType.BREVITY_INDEX
};

export class Lexer {
  private src: string;
  private pos: number = 0;
  private line: number = 1;
  private col: number = 1;

  constructor(src: string) {
    this.src = src;
  }

  tokenize(): Token[] {
    const tokens: Token[] = [];

    while (this.pos < this.src.length) {
      const ch = this.src[this.pos];

      // Whitespace
      if (ch === ' ' || ch === '\t' || ch === '\r') {
        this.advance();
        continue;
      }

      // Newlines
      if (ch === '\n') {
        this.line++;
        this.col = 1;
        this.pos++;
        continue;
      }

      // Single-line comment
      if (ch === '/' && this.peek(1) === '/') {
        this.skipLineComment();
        continue;
      }

      // Multi-line comment
      if (ch === '/' && this.peek(1) === '*') {
        this.skipBlockComment();
        continue;
      }

      // Multi-character operators
      if (ch === '>' && this.peek(1) === '=') {
        tokens.push(this.makeToken(TokenType.GTE, '>=', 2));
        continue;
      }
      if (ch === '<' && this.peek(1) === '=') {
        tokens.push(this.makeToken(TokenType.LTE, '<=', 2));
        continue;
      }
      if (ch === '=' && this.peek(1) === '=') {
        tokens.push(this.makeToken(TokenType.EQ, '==', 2));
        continue;
      }
      if (ch === '!' && this.peek(1) === '=') {
        tokens.push(this.makeToken(TokenType.NEQ, '!=', 2));
        continue;
      }
      if (ch === '&' && this.peek(1) === '&') {
        tokens.push(this.makeToken(TokenType.AND, '&&', 2));
        continue;
      }
      if (ch === '|' && this.peek(1) === '|') {
        tokens.push(this.makeToken(TokenType.OR, '||', 2));
        continue;
      }

      // Single-character operators & delimiters
      if (ch === '>') { tokens.push(this.makeToken(TokenType.GT, '>', 1)); continue; }
      if (ch === '<') { tokens.push(this.makeToken(TokenType.LT, '<', 1)); continue; }
      if (ch === '=') { tokens.push(this.makeToken(TokenType.ASSIGN, '=', 1)); continue; }
      if (ch === '+') { tokens.push(this.makeToken(TokenType.PLUS, '+', 1)); continue; }
      if (ch === '-') { tokens.push(this.makeToken(TokenType.MINUS, '-', 1)); continue; }
      if (ch === '*') { tokens.push(this.makeToken(TokenType.STAR, '*', 1)); continue; }
      if (ch === '/') { tokens.push(this.makeToken(TokenType.SLASH, '/', 1)); continue; }
      if (ch === '(') { tokens.push(this.makeToken(TokenType.LPAREN, '(', 1)); continue; }
      if (ch === ')') { tokens.push(this.makeToken(TokenType.RPAREN, ')', 1)); continue; }
      if (ch === '{') { tokens.push(this.makeToken(TokenType.LBRACE, '{', 1)); continue; }
      if (ch === '}') { tokens.push(this.makeToken(TokenType.RBRACE, '}', 1)); continue; }
      if (ch === ',') { tokens.push(this.makeToken(TokenType.COMMA, ',', 1)); continue; }
      if (ch === ':') { tokens.push(this.makeToken(TokenType.COLON, ':', 1)); continue; }
      if (ch === ';') { tokens.push(this.makeToken(TokenType.SEMICOLON, ';', 1)); continue; }

      // Strings
      if (ch === '"' || ch === '\'') {
        tokens.push(this.readString(ch));
        continue;
      }

      // Numbers
      if (this.isDigit(ch) || (ch === '.' && this.isDigit(this.peek(1)))) {
        tokens.push(this.readNumber());
        continue;
      }

      // Identifiers & Keywords
      if (this.isAlpha(ch) || ch === '_') {
        tokens.push(this.readIdentifier());
        continue;
      }

      throw new Error(`[RAG-L Lexer Error] Unexpected token '${ch}' at line ${this.line}, col ${this.col}`);
    }

    tokens.push({
      type: TokenType.EOF,
      value: '',
      line: this.line,
      col: this.col
    });

    return tokens;
  }

  private advance(count: number = 1): void {
    this.pos += count;
    this.col += count;
  }

  private peek(offset: number = 0): string {
    const idx = this.pos + offset;
    return idx < this.src.length ? this.src[idx] : '';
  }

  private makeToken(type: TokenType, value: string, length: number): Token {
    const token: Token = {
      type,
      value,
      line: this.line,
      col: this.col
    };
    this.advance(length);
    return token;
  }

  private isDigit(ch: string): boolean {
    return ch >= '0' && ch <= '9';
  }

  private isAlpha(ch: string): boolean {
    return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z');
  }

  private isAlphaNumeric(ch: string): boolean {
    return this.isAlpha(ch) || this.isDigit(ch) || ch === '_';
  }

  private skipLineComment(): void {
    while (this.pos < this.src.length && this.src[this.pos] !== '\n') {
      this.advance();
    }
  }

  private skipBlockComment(): void {
    this.advance(2); // skip /*
    while (this.pos < this.src.length) {
      if (this.src[this.pos] === '*' && this.peek(1) === '/') {
        this.advance(2);
        return;
      }
      if (this.src[this.pos] === '\n') {
        this.line++;
        this.col = 1;
        this.pos++;
      } else {
        this.advance();
      }
    }
    throw new Error(`[RAG-L Lexer Error] Unterminated block comment at line ${this.line}`);
  }

  private readString(quote: string): Token {
    const startLine = this.line;
    const startCol = this.col;
    this.advance(); // skip quote
    let str = '';

    while (this.pos < this.src.length && this.src[this.pos] !== quote) {
      if (this.src[this.pos] === '\\') {
        this.advance();
        const esc = this.src[this.pos];
        if (esc === 'n') str += '\n';
        else if (esc === 't') str += '\t';
        else if (esc === 'r') str += '\r';
        else str += esc;
        this.advance();
      } else {
        str += this.src[this.pos];
        this.advance();
      }
    }

    if (this.pos >= this.src.length) {
      throw new Error(`[RAG-L Lexer Error] Unterminated string literal starting at line ${startLine}, col ${startCol}`);
    }

    this.advance(); // skip closing quote
    return {
      type: TokenType.STRING,
      value: str,
      line: startLine,
      col: startCol
    };
  }

  private readNumber(): Token {
    const startCol = this.col;
    let numStr = '';
    let hasDot = false;

    while (this.pos < this.src.length) {
      const ch = this.src[this.pos];
      if (this.isDigit(ch)) {
        numStr += ch;
        this.advance();
      } else if (ch === '.' && !hasDot && this.isDigit(this.peek(1))) {
        hasDot = true;
        numStr += ch;
        this.advance();
      } else {
        break;
      }
    }

    // Optional duration suffix (e.g. 500ms)
    if (this.peek(0) === 'm' && this.peek(1) === 's') {
      this.advance(2);
    }

    return {
      type: TokenType.NUMBER,
      value: numStr,
      line: this.line,
      col: startCol
    };
  }

  private readIdentifier(): Token {
    const startCol = this.col;
    let id = '';

    while (this.pos < this.src.length && this.isAlphaNumeric(this.src[this.pos])) {
      id += this.src[this.pos];
      this.advance();
    }

    const lower = id.toLowerCase();
    const kwType = KEYWORDS[lower];

    return {
      type: kwType || TokenType.IDENTIFIER,
      value: id,
      line: this.line,
      col: startCol
    };
  }
}
