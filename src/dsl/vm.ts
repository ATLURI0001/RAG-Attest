/**
 * AEGIS-EDGE: Sovereign Edge RAG Evaluation Engine
 * RAG-L High-Speed Evaluation Virtual Machine
 */

import type {
  PipelinePolicyNode,
  ExpressionNode,
  BinaryExpressionNode,
  UnaryExpressionNode,
  MetricReferenceNode,
  LiteralNode,
  FunctionCallNode,
  AssertStatementNode,
  InvariantStatementNode,
  PenalizeStatementNode,
  HallucinationGuardNode
} from './ast.ts';
import type {
  PolicyAttestationReport,
  PolicyViolation,
  PolicyVerdict,
  EvaluationResult
} from '../core/types.ts';

export interface MetricContext {
  [metric: string]: number | string | boolean;
}

export class PolicyVirtualMachine {
  /**
   * Convert an EvaluationResult into a flat key-value context for RAG-L evaluation.
   */
  static extractContext(result: EvaluationResult): MetricContext {
    return {
      context_precision: result.triad.contextPrecision,
      groundedness: result.triad.groundedness,
      answer_relevance: result.triad.answerRelevance,
      context_recall: result.extended.contextRecall,
      semantic_drift: result.extended.semanticDrift,
      hallucination_risk: result.extended.hallucinationRisk,
      contradiction_entropy: result.extended.contradictionEntropy,
      brevity_index: result.extended.brevityIndex,
      lexical_diversity: result.extended.lexicalDiversity,
      latency_ms: result.efficiency.latencyMs,
      ttft_ms: result.efficiency.ttftMs || 0,
      tokens_generated: result.efficiency.tokensGenerated || 0,
      overall_score: result.overallScore,
      claim_count: result.claims.length,
      entailed_claims: result.claims.filter(c => c.status === 'ENTAILED').length,
      contradicted_claims: result.claims.filter(c => c.status === 'CONTRADICTED').length,
      ungrounded_claims: result.claims.filter(c => c.status === 'UNGROUNDED').length
    };
  }

  /**
   * Execute a single PipelinePolicy against a metric context.
   */
  static executePolicy(policy: PipelinePolicyNode, ctx: MetricContext): PolicyAttestationReport {
    const violations: PolicyViolation[] = [];
    let passedCount = 0;
    let failedCount = 0;
    let penaltiesDeducted = 0;

    // Check Budget limits first if declared
    if (policy.budget) {
      for (const [budgetKey, limitVal] of Object.entries(policy.budget.limits)) {
        const measured = ctx[budgetKey];
        if (typeof measured === 'number' && measured > limitVal) {
          violations.push({
            ruleName: `budget_${budgetKey}`,
            assertion: `${budgetKey} <= ${limitVal}`,
            measuredValue: measured,
            expectedCondition: `<= ${limitVal}`,
            severity: 'CRITICAL',
            message: `Edge budget violation: ${budgetKey} was ${measured}, exceeding limit of ${limitVal}`,
            line: policy.budget.loc.line
          });
          failedCount++;
        } else {
          passedCount++;
        }
      }
    }

    // Execute Statements
    for (const stmt of policy.statements) {
      if (stmt.type === 'AssertStatement') {
        const assertStmt = stmt as AssertStatementNode;
        const pass = this.evalExpression(assertStmt.condition, ctx);
        if (pass) {
          passedCount++;
        } else {
          failedCount++;
          violations.push({
            ruleName: 'assertion',
            assertion: this.prettyPrintExpr(assertStmt.condition),
            measuredValue: this.evalExpressionValue(assertStmt.condition, ctx),
            expectedCondition: 'true',
            severity: assertStmt.severity,
            message: assertStmt.failMessage || `Assertion failed: ${this.prettyPrintExpr(assertStmt.condition)}`,
            line: assertStmt.loc.line
          });
        }
      } else if (stmt.type === 'InvariantStatement') {
        const invStmt = stmt as InvariantStatementNode;
        const pass = this.evalExpression(invStmt.condition, ctx);
        if (pass) {
          passedCount++;
        } else {
          failedCount++;
          violations.push({
            ruleName: 'invariant',
            assertion: this.prettyPrintExpr(invStmt.condition),
            measuredValue: this.evalExpressionValue(invStmt.condition, ctx),
            expectedCondition: 'true',
            severity: 'CRITICAL',
            message: invStmt.failMessage || `Invariant violated: ${this.prettyPrintExpr(invStmt.condition)}`,
            line: invStmt.loc.line
          });
        }
      } else if (stmt.type === 'PenalizeStatement') {
        const penStmt = stmt as PenalizeStatementNode;
        const shouldPenalize = this.evalExpression(penStmt.condition, ctx);
        if (shouldPenalize) {
          penaltiesDeducted += penStmt.penalty;
          violations.push({
            ruleName: 'penalty',
            assertion: this.prettyPrintExpr(penStmt.condition),
            measuredValue: 'TRIGGERED',
            expectedCondition: 'false',
            severity: 'WARNING',
            message: penStmt.reason || `Penalty applied: -${penStmt.penalty} pts (${this.prettyPrintExpr(penStmt.condition)})`,
            line: penStmt.loc.line
          });
        }
      } else if (stmt.type === 'HallucinationGuard') {
        const guard = stmt as HallucinationGuardNode;
        const risk = Number(ctx.hallucination_risk || 0);
        const ungrounded = Number(ctx.ungrounded_claims || 0);
        const contradicted = Number(ctx.contradicted_claims || 0);

        let violated = false;
        let failReason = '';

        if (guard.strictness === 'STRICT') {
          if (contradicted > 0) {
            violated = true;
            failReason = `Strict Hallucination Guard: Detected ${contradicted} contradicted claim(s)!`;
          } else if (risk > guard.maxRiskThreshold) {
            violated = true;
            failReason = `Strict Hallucination Guard: Hallucination risk (${risk}) exceeded threshold ${guard.maxRiskThreshold}`;
          }
        } else if (guard.strictness === 'BALANCED') {
          if (risk > guard.maxRiskThreshold) {
            violated = true;
            failReason = `Balanced Hallucination Guard: Hallucination risk (${risk}) exceeded threshold ${guard.maxRiskThreshold}`;
          }
        } else {
          if (contradicted > 1 || risk > guard.maxRiskThreshold) {
            violated = true;
            failReason = `Permissive Hallucination Guard: Severe hallucination detected (risk: ${risk})`;
          }
        }

        if (violated) {
          failedCount++;
          violations.push({
            ruleName: 'hallucination_guard',
            assertion: `risk <= ${guard.maxRiskThreshold}`,
            measuredValue: risk,
            expectedCondition: `<= ${guard.maxRiskThreshold}`,
            severity: 'CRITICAL',
            message: failReason,
            line: guard.loc.line
          });
        } else {
          passedCount++;
        }
      }
    }

    const totalRules = passedCount + failedCount;
    const rawCompliance = totalRules > 0 ? passedCount / totalRules : 1.0;
    const complianceScore = Math.max(0.0, Math.min(1.0, rawCompliance - (penaltiesDeducted * 0.1)));

    let verdict: PolicyVerdict = 'PASSED';
    const criticalViolations = violations.filter(v => v.severity === 'CRITICAL');
    const warningViolations = violations.filter(v => v.severity === 'WARNING');

    if (criticalViolations.length > 0) {
      verdict = 'FAILED';
    } else if (warningViolations.length > 0 || complianceScore < 0.85) {
      verdict = 'DEGRADED';
    }

    return {
      policyName: policy.name,
      verdict,
      complianceScore: Math.round(complianceScore * 1000) / 1000,
      violations,
      passedCount,
      failedCount,
      evaluatedAt: new Date().toISOString()
    };
  }

  /**
   * Recursive expression evaluator for RAG-L.
   */
  static evalExpression(node: ExpressionNode, ctx: MetricContext): boolean {
    const val = this.evalRaw(node, ctx);
    return Boolean(val);
  }

  static evalExpressionValue(node: ExpressionNode, ctx: MetricContext): number | string | boolean {
    return this.evalRaw(node, ctx);
  }

  private static evalRaw(node: ExpressionNode, ctx: MetricContext): any {
    switch (node.type) {
      case 'Literal':
        return (node as LiteralNode).value;

      case 'MetricReference': {
        const metricName = (node as MetricReferenceNode).name.toLowerCase();
        if (metricName in ctx) {
          return ctx[metricName];
        }
        return 0;
      }

      case 'UnaryExpression': {
        const unary = node as UnaryExpressionNode;
        const arg = this.evalRaw(unary.argument, ctx);
        if (unary.operator === '!' || unary.operator.toLowerCase() === 'not') {
          return !arg;
        }
        if (unary.operator === '-') {
          return -Number(arg);
        }
        throw new Error(`Unknown unary operator: ${unary.operator}`);
      }

      case 'BinaryExpression': {
        const bin = node as BinaryExpressionNode;
        const left = this.evalRaw(bin.left, ctx);
        const right = this.evalRaw(bin.right, ctx);

        switch (bin.operator) {
          case '>=': return Number(left) >= Number(right);
          case '<=': return Number(left) <= Number(right);
          case '>': return Number(left) > Number(right);
          case '<': return Number(left) < Number(right);
          case '==': return left === right;
          case '!=': return left !== right;
          case '&&': return Boolean(left) && Boolean(right);
          case '||': return Boolean(left) || Boolean(right);
          case '+': return Number(left) + Number(right);
          case '-': return Number(left) - Number(right);
          case '*': return Number(left) * Number(right);
          case '/': return Number(right) !== 0 ? Number(left) / Number(right) : 0;
          default:
            throw new Error(`Unknown binary operator: ${bin.operator}`);
        }
      }

      case 'FunctionCall': {
        const call = node as FunctionCallNode;
        const fnName = call.name.toLowerCase();
        const evalArgs = call.args.map(a => this.evalRaw(a, ctx));

        if (fnName === 'min') {
          return Math.min(...evalArgs.map(Number));
        }
        if (fnName === 'max') {
          return Math.max(...evalArgs.map(Number));
        }
        if (fnName === 'abs') {
          return Math.abs(Number(evalArgs[0]));
        }
        if (fnName === 'round') {
          return Math.round(Number(evalArgs[0]));
        }

        throw new Error(`Unknown function call: ${call.name}`);
      }

      default:
        throw new Error(`Unknown AST node type: ${node.type}`);
    }
  }

  private static prettyPrintExpr(node: ExpressionNode): string {
    switch (node.type) {
      case 'Literal':
        return (node as LiteralNode).raw;
      case 'MetricReference':
        return (node as MetricReferenceNode).name;
      case 'UnaryExpression': {
        const u = node as UnaryExpressionNode;
        return `${u.operator}${this.prettyPrintExpr(u.argument)}`;
      }
      case 'BinaryExpression': {
        const b = node as BinaryExpressionNode;
        return `(${this.prettyPrintExpr(b.left)} ${b.operator} ${this.prettyPrintExpr(b.right)})`;
      }
      case 'FunctionCall': {
        const f = node as FunctionCallNode;
        return `${f.name}(${f.args.map(a => this.prettyPrintExpr(a)).join(', ')})`;
      }
      default:
        return '';
    }
  }
}
