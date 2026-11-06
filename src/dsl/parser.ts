/**
 * AEGIS-EDGE: Sovereign Edge RAG Evaluation Engine
 * RAG-L (Retrieval-Augmented Generation Language) Recursive Descent Parser
 */

import { TokenType, type Token } from './tokens.ts';
import type {
  ProgramNode,
  PipelinePolicyNode,
  BudgetBlockNode,
  PolicyStatement,
  AssertStatementNode,
  InvariantStatementNode,
  PenalizeStatementNode,
  HallucinationGuardNode,
  ExpressionNode,
  BinaryExpressionNode,
  UnaryExpressionNode,
  MetricReferenceNode,
  LiteralNode,
  FunctionCallNode,
  SourceLocation
} from './ast.ts';

export class Parser {
  private tokens: Token[];
  private current: number = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): ProgramNode {
    const policies: PipelinePolicyNode[] = [];
    const loc = this.currentLocation();

    while (!this.isAtEnd()) {
      if (this.check(TokenType.EVALUATE)) {
        policies.push(this.parsePipelinePolicy());
      } else {
        throw new Error(
          `[RAG-L Parser Error] Expected 'evaluate pipeline' at line ${this.peek().line}, col ${this.peek().col}`
        );
      }
    }

    return {
      type: 'Program',
      policies,
      loc
    };
  }

  private parsePipelinePolicy(): PipelinePolicyNode {
    const loc = this.currentLocation();
    this.consume(TokenType.EVALUATE, "Expected 'evaluate'");
    this.consume(TokenType.PIPELINE, "Expected 'pipeline' after 'evaluate'");

    let name = 'default';
    if (this.check(TokenType.STRING) || this.check(TokenType.IDENTIFIER)) {
      name = this.advance().value;
    }

    let budget: BudgetBlockNode | undefined;
    if (this.match(TokenType.WITH)) {
      this.consume(TokenType.BUDGET, "Expected 'budget' after 'with'");
      budget = this.parseBudgetBlock();
    }

    this.consume(TokenType.LBRACE, "Expected '{' to start pipeline policy body");

    const statements: PolicyStatement[] = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      statements.push(this.parseStatement());
      // optional semicolon
      this.match(TokenType.SEMICOLON);
    }

    this.consume(TokenType.RBRACE, "Expected '}' to close pipeline policy body");

    return {
      type: 'PipelinePolicy',
      name,
      budget,
      statements,
      loc
    };
  }

  private parseBudgetBlock(): BudgetBlockNode {
    const loc = this.currentLocation();
    this.consume(TokenType.LBRACE, "Expected '{' for budget block");
    const limits: Record<string, number> = {};

    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      const keyToken = this.advance();
      this.consume(TokenType.COLON, "Expected ':' after budget key");
      const valToken = this.consume(TokenType.NUMBER, 'Expected number for budget value');
      limits[keyToken.value] = parseFloat(valToken.value);

      if (this.check(TokenType.COMMA)) {
        this.advance();
      }
    }

    this.consume(TokenType.RBRACE, "Expected '}' to close budget block");
    return {
      type: 'BudgetBlock',
      limits,
      loc
    };
  }

  private parseStatement(): PolicyStatement {
    if (this.match(TokenType.ASSERT)) {
      return this.parseAssertStatement();
    }
    if (this.match(TokenType.INVARIANT)) {
      return this.parseInvariantStatement();
    }
    if (this.match(TokenType.PENALIZE)) {
      return this.parsePenalizeStatement();
    }
    if (this.match(TokenType.HALLUCINATION_GUARD)) {
      return this.parseHallucinationGuard();
    }

    throw new Error(
      `[RAG-L Parser Error] Unknown statement starting with '${this.peek().value}' at line ${this.peek().line}`
    );
  }

  private parseAssertStatement(): AssertStatementNode {
    const loc = this.currentLocation();
    const condition = this.parseExpression();

    let failMessage: string | undefined;
    if (this.match(TokenType.FAIL_WITH)) {
      const msgToken = this.consume(TokenType.STRING, "Expected string after 'fail_with'");
      failMessage = msgToken.value;
    }

    let severity: 'CRITICAL' | 'WARNING' | 'INFO' = 'CRITICAL';
    if (this.match(TokenType.SEVERITY)) {
      const sevToken = this.consume(TokenType.IDENTIFIER, "Expected severity level ('critical', 'warning', 'info')");
      const sevLower = sevToken.value.toUpperCase();
      if (sevLower === 'CRITICAL' || sevLower === 'WARNING' || sevLower === 'INFO') {
        severity = sevLower;
      }
    }

    return {
      type: 'AssertStatement',
      condition,
      failMessage,
      severity,
      loc
    };
  }

  private parseInvariantStatement(): InvariantStatementNode {
    const loc = this.currentLocation();
    const condition = this.parseExpression();

    let failMessage: string | undefined;
    if (this.match(TokenType.FAIL_WITH)) {
      const msgToken = this.consume(TokenType.STRING, "Expected string after 'fail_with'");
      failMessage = msgToken.value;
    }

    return {
      type: 'InvariantStatement',
      condition,
      failMessage,
      loc
    };
  }

  private parsePenalizeStatement(): PenalizeStatementNode {
    const loc = this.currentLocation();
    const condition = this.parseExpression();

    // optional 'by' keyword / identifier
    if (this.check(TokenType.IDENTIFIER) && this.peek().value.toLowerCase() === 'by') {
      this.advance();
    }

    const penaltyToken = this.consume(TokenType.NUMBER, "Expected penalty value number after condition");
    const penalty = parseFloat(penaltyToken.value);

    let reason: string | undefined;
    if (this.match(TokenType.FAIL_WITH)) {
      const rToken = this.consume(TokenType.STRING, "Expected string reason");
      reason = rToken.value;
    }

    return {
      type: 'PenalizeStatement',
      condition,
      penalty,
      reason,
      loc
    };
  }

  private parseHallucinationGuard(): HallucinationGuardNode {
    const loc = this.currentLocation();
    let strictness: 'STRICT' | 'BALANCED' | 'PERMISSIVE' = 'STRICT';
    let maxRiskThreshold = 0.20;

    if (this.check(TokenType.IDENTIFIER)) {
      const id = this.peek().value.toUpperCase();
      if (id === 'STRICT' || id === 'BALANCED' || id === 'PERMISSIVE') {
        this.advance();
        strictness = id as 'STRICT' | 'BALANCED' | 'PERMISSIVE';
        if (strictness === 'BALANCED') maxRiskThreshold = 0.35;
        if (strictness === 'PERMISSIVE') maxRiskThreshold = 0.50;
      }
    }

    if (this.match(TokenType.LTE) || this.match(TokenType.LT)) {
      const num = this.consume(TokenType.NUMBER, 'Expected max risk threshold');
      maxRiskThreshold = parseFloat(num.value);
    }

    return {
      type: 'HallucinationGuard',
      strictness,
      maxRiskThreshold,
      loc
    };
  }

  private parseExpression(): ExpressionNode {
    return this.parseLogicalOr();
  }

  private parseLogicalOr(): ExpressionNode {
    let expr = this.parseLogicalAnd();
    while (this.match(TokenType.OR)) {
      const loc = this.currentLocation();
      const right = this.parseLogicalAnd();
      expr = {
        type: 'BinaryExpression',
        operator: '||',
        left: expr,
        right,
        loc
      } as BinaryExpressionNode;
    }
    return expr;
  }

  private parseLogicalAnd(): ExpressionNode {
    let expr = this.parseEquality();
    while (this.match(TokenType.AND)) {
      const loc = this.currentLocation();
      const right = this.parseEquality();
      expr = {
        type: 'BinaryExpression',
        operator: '&&',
        left: expr,
        right,
        loc
      } as BinaryExpressionNode;
    }
    return expr;
  }

  private parseEquality(): ExpressionNode {
    let expr = this.parseRelational();
    while (this.check(TokenType.EQ) || this.check(TokenType.NEQ)) {
      const op = this.advance().value;
      const loc = this.currentLocation();
      const right = this.parseRelational();
      expr = {
        type: 'BinaryExpression',
        operator: op,
        left: expr,
        right,
        loc
      } as BinaryExpressionNode;
    }
    return expr;
  }

  private parseRelational(): ExpressionNode {
    let expr = this.parseAdditive();
    while (
      this.check(TokenType.GTE) ||
      this.check(TokenType.LTE) ||
      this.check(TokenType.GT) ||
      this.check(TokenType.LT)
    ) {
      const op = this.advance().value;
      const loc = this.currentLocation();
      const right = this.parseAdditive();
      expr = {
        type: 'BinaryExpression',
        operator: op,
        left: expr,
        right,
        loc
      } as BinaryExpressionNode;
    }
    return expr;
  }

  private parseAdditive(): ExpressionNode {
    let expr = this.parseMultiplicative();
    while (this.check(TokenType.PLUS) || this.check(TokenType.MINUS)) {
      const op = this.advance().value;
      const loc = this.currentLocation();
      const right = this.parseMultiplicative();
      expr = {
        type: 'BinaryExpression',
        operator: op,
        left: expr,
        right,
        loc
      } as BinaryExpressionNode;
    }
    return expr;
  }

  private parseMultiplicative(): ExpressionNode {
    let expr = this.parseUnary();
    while (this.check(TokenType.STAR) || this.check(TokenType.SLASH)) {
      const op = this.advance().value;
      const loc = this.currentLocation();
      const right = this.parseUnary();
      expr = {
        type: 'BinaryExpression',
        operator: op,
        left: expr,
        right,
        loc
      } as BinaryExpressionNode;
    }
    return expr;
  }

  private parseUnary(): ExpressionNode {
    if (this.check(TokenType.MINUS) || this.check(TokenType.NOT)) {
      const op = this.advance().value;
      const loc = this.currentLocation();
      const arg = this.parseUnary();
      return {
        type: 'UnaryExpression',
        operator: op,
        argument: arg,
        loc
      } as UnaryExpressionNode;
    }
    return this.parsePrimary();
  }

  private parsePrimary(): ExpressionNode {
    const loc = this.currentLocation();

    // Grouped expression
    if (this.match(TokenType.LPAREN)) {
      const expr = this.parseExpression();
      this.consume(TokenType.RPAREN, "Expected ')' after grouped expression");
      return expr;
    }

    // Literals
    if (this.check(TokenType.NUMBER)) {
      const tok = this.advance();
      return {
        type: 'Literal',
        value: parseFloat(tok.value),
        raw: tok.value,
        loc
      } as LiteralNode;
    }

    if (this.check(TokenType.STRING)) {
      const tok = this.advance();
      return {
        type: 'Literal',
        value: tok.value,
        raw: `"${tok.value}"`,
        loc
      } as LiteralNode;
    }

    if (this.check(TokenType.BOOLEAN)) {
      const tok = this.advance();
      return {
        type: 'Literal',
        value: tok.value.toLowerCase() === 'true',
        raw: tok.value,
        loc
      } as LiteralNode;
    }

    // Builtin Metrics
    if (
      this.check(TokenType.CONTEXT_PRECISION) ||
      this.check(TokenType.GROUNDEDNESS) ||
      this.check(TokenType.ANSWER_RELEVANCE) ||
      this.check(TokenType.CONTEXT_RECALL) ||
      this.check(TokenType.SEMANTIC_DRIFT) ||
      this.check(TokenType.HALLUCINATION_RISK) ||
      this.check(TokenType.CONTRADICTION_ENTROPY) ||
      this.check(TokenType.LATENCY_MS) ||
      this.check(TokenType.TTFT_MS) ||
      this.check(TokenType.BREVITY_INDEX)
    ) {
      const tok = this.advance();
      return {
        type: 'MetricReference',
        name: tok.value,
        loc
      } as MetricReferenceNode;
    }

    // Identifiers or Function Calls
    if (this.check(TokenType.IDENTIFIER)) {
      const tok = this.advance();

      // Check if function call
      if (this.match(TokenType.LPAREN)) {
        const args: ExpressionNode[] = [];
        if (!this.check(TokenType.RPAREN)) {
          do {
            args.push(this.parseExpression());
          } while (this.match(TokenType.COMMA));
        }
        this.consume(TokenType.RPAREN, "Expected ')' after function arguments");
        return {
          type: 'FunctionCall',
          name: tok.value,
          args,
          loc
        } as FunctionCallNode;
      }

      return {
        type: 'MetricReference',
        name: tok.value,
        loc
      } as MetricReferenceNode;
    }

    throw new Error(
      `[RAG-L Parser Error] Unexpected token '${this.peek().value}' at line ${loc.line}, col ${loc.col}`
    );
  }

  private match(...types: TokenType[]): boolean {
    for (const t of types) {
      if (this.check(t)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  private check(type: TokenType): boolean {
    if (this.isAtEnd()) return false;
    return this.peek().type === type;
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.current++;
    return this.previous();
  }

  private isAtEnd(): boolean {
    return this.peek().type === TokenType.EOF;
  }

  private peek(): Token {
    return this.tokens[this.current];
  }

  private previous(): Token {
    return this.tokens[this.current - 1];
  }

  private consume(type: TokenType, errorMsg: string): Token {
    if (this.check(type)) return this.advance();
    const tok = this.peek();
    throw new Error(`[RAG-L Parser Error] ${errorMsg} (got '${tok.value}' at line ${tok.line}, col ${tok.col})`);
  }

  private currentLocation(): SourceLocation {
    const tok = this.peek();
    return { line: tok.line, col: tok.col };
  }
}
