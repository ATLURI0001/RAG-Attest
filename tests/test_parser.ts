/**
 * AEGIS-EDGE Test Suite: RAG-L Parser & AST Tests
 */

import { RagLCompiler } from '../src/dsl/index.ts';

export function runParserTests(): boolean {
  console.log('  Testing RAG-L Recursive Descent Parser...');

  const dsl = `
    evaluate pipeline "critical_edge" with budget { latency_ms: 250, tokens: 64 } {
      assert (groundedness >= 0.80 && answer_relevance >= 0.75) fail_with "Quality degraded" severity critical;
      assert context_precision >= 0.70 severity warning;
      penalize semantic_drift > 0.40 by 0.25 fail_with "High drift";
      hallucination_guard strict <= 0.15;
    }
  `;

  const ast = RagLCompiler.compile(dsl);
  if (!ast || ast.policies.length !== 1) {
    throw new Error('Expected 1 policy in compiled AST');
  }

  const p = ast.policies[0];
  if (p.name !== 'critical_edge') {
    throw new Error(`Expected policy name 'critical_edge', got '${p.name}'`);
  }

  if (!p.budget || p.budget.limits['latency_ms'] !== 250) {
    throw new Error('Budget block limits failed parsing');
  }

  if (p.statements.length !== 4) {
    throw new Error(`Expected 4 policy statements, got ${p.statements.length}`);
  }

  console.log('  ✓ Parser & AST tests PASSED');
  return true;
}
