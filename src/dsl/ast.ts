/**
 * AEGIS-EDGE: Sovereign Edge RAG Evaluation Engine
 * RAG-L (Retrieval-Augmented Generation Language) Abstract Syntax Tree
 */

export interface SourceLocation {
  line: number;
  col: number;
}

export interface ASTNode {
  type: string;
  loc: SourceLocation;
}

export interface ExpressionNode extends ASTNode {}

export interface LiteralNode extends ExpressionNode {
  type: 'Literal';
  value: number | string | boolean;
  raw: string;
}

export interface MetricReferenceNode extends ExpressionNode {
  type: 'MetricReference';
  name: string;
}

export interface BinaryExpressionNode extends ExpressionNode {
  type: 'BinaryExpression';
  operator: string;
  left: ExpressionNode;
  right: ExpressionNode;
}

export interface UnaryExpressionNode extends ExpressionNode {
  type: 'UnaryExpression';
  operator: string;
  argument: ExpressionNode;
}

export interface FunctionCallNode extends ExpressionNode {
  type: 'FunctionCall';
  name: string;
  args: ExpressionNode[];
}

export interface BudgetBlockNode extends ASTNode {
  type: 'BudgetBlock';
  limits: Record<string, number>;
}

export interface AssertStatementNode extends ASTNode {
  type: 'AssertStatement';
  condition: ExpressionNode;
  failMessage?: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
}

export interface InvariantStatementNode extends ASTNode {
  type: 'InvariantStatement';
  condition: ExpressionNode;
  failMessage?: string;
}

export interface PenalizeStatementNode extends ASTNode {
  type: 'PenalizeStatement';
  condition: ExpressionNode;
  penalty: number;
  reason?: string;
}

export interface HallucinationGuardNode extends ASTNode {
  type: 'HallucinationGuard';
  strictness: 'STRICT' | 'BALANCED' | 'PERMISSIVE';
  maxRiskThreshold: number;
}

export type PolicyStatement =
  | AssertStatementNode
  | InvariantStatementNode
  | PenalizeStatementNode
  | HallucinationGuardNode;

export interface PipelinePolicyNode extends ASTNode {
  type: 'PipelinePolicy';
  name: string;
  budget?: BudgetBlockNode;
  statements: PolicyStatement[];
}

export interface ProgramNode extends ASTNode {
  type: 'Program';
  policies: PipelinePolicyNode[];
}
