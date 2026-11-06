/**
 * AEGIS-EDGE: Sovereign Edge RAG Evaluation Engine
 * RAG-L High-Level Facade & Compiler
 */

import { Lexer } from './lexer.ts';
import { Parser } from './parser.ts';
import type { ProgramNode, PipelinePolicyNode } from './ast.ts';
import { PolicyVirtualMachine, type MetricContext } from './vm.ts';
import type { EvaluationResult, PolicyAttestationReport } from '../core/types.ts';

export class RagLCompiler {
  /**
   * Parse and compile RAG-L source into an executable AST.
   */
  static compile(source: string): ProgramNode {
    const lexer = new Lexer(source);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens);
    return parser.parse();
  }

  /**
   * Attest an evaluation result against a compiled policy program or policy node.
   */
  static attest(
    programOrPolicy: ProgramNode | PipelinePolicyNode,
    result: EvaluationResult,
    targetPipelineName?: string
  ): PolicyAttestationReport {
    let policy: PipelinePolicyNode;

    if (programOrPolicy.type === 'Program') {
      const prog = programOrPolicy as ProgramNode;
      if (prog.policies.length === 0) {
        throw new Error('No pipeline policies found in RAG-L program');
      }
      if (targetPipelineName) {
        const found = prog.policies.find(p => p.name === targetPipelineName);
        if (!found) {
          throw new Error(`Pipeline policy '${targetPipelineName}' not found`);
        }
        policy = found;
      } else {
        policy = prog.policies[0];
      }
    } else {
      policy = programOrPolicy as PipelinePolicyNode;
    }

    const ctx = PolicyVirtualMachine.extractContext(result);
    return PolicyVirtualMachine.executePolicy(policy, ctx);
  }
}

export * from './tokens.ts';
export * from './ast.ts';
export * from './lexer.ts';
export * from './parser.ts';
export * from './vm.ts';
