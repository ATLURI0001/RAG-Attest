/**
 * AEGIS-EDGE Test Suite: Policy Virtual Machine Tests
 */

import { PolicyVirtualMachine } from '../src/dsl/vm.ts';
import { RagLCompiler } from '../src/dsl/index.ts';
import type { EvaluationResult } from '../src/core/types.ts';

export function runVmTests(): boolean {
  console.log('  Testing Policy Virtual Machine Attestation...');

  const dsl = `
    evaluate pipeline "sla_guard" with budget { latency_ms: 300 } {
      assert groundedness >= 0.80 fail_with "Hallucination Detected";
      assert answer_relevance >= 0.70;
      penalize semantic_drift > 0.40 by 0.15 fail_with "Divergent Answer";
      hallucination_guard strict <= 0.20;
    }
  `;

  const policy = RagLCompiler.compile(dsl);

  const mockPassingResult: EvaluationResult = {
    id: 'eval-1',
    payloadId: 'payload-1',
    timestamp: new Date().toISOString(),
    triad: { contextPrecision: 0.95, groundedness: 0.92, answerRelevance: 0.88 },
    extended: {
      contextRecall: 0.90,
      semanticDrift: 0.15,
      hallucinationRisk: 0.05,
      contradictionEntropy: 0.0,
      brevityIndex: 0.85,
      lexicalDiversity: 0.80
    },
    claims: [
      {
        id: 'c1',
        claimText: 'Sample claim',
        status: 'ENTAILED',
        confidence: 0.92,
        bestMatchingChunkId: 'chunk-1',
        matchScore: 0.88,
        overlapKeywords: ['sample'],
        negationDetected: false
      }
    ],
    efficiency: {
      latencyMs: 140,
      evalComputeTimeMs: 1.5,
      memoryFootprintKb: 8000,
      edgeBudgetCompliance: true
    },
    overallScore: 0.94,
    status: 'OPTIMAL'
  };

  const passingReport = RagLCompiler.attest(policy, mockPassingResult);
  if (passingReport.verdict !== 'PASSED' || passingReport.violations.length !== 0) {
    throw new Error(`Expected PASSED report, got ${passingReport.verdict} with ${passingReport.violations.length} violations`);
  }

  // Test failing violation
  const mockFailingResult: EvaluationResult = {
    ...mockPassingResult,
    triad: { contextPrecision: 0.95, groundedness: 0.40, answerRelevance: 0.88 },
    extended: {
      ...mockPassingResult.extended,
      hallucinationRisk: 0.65
    },
    efficiency: {
      ...mockPassingResult.efficiency,
      latencyMs: 450 // Exceeds budget of 300
    }
  };

  const failingReport = RagLCompiler.attest(policy, mockFailingResult);
  if (failingReport.verdict !== 'FAILED' || failingReport.violations.length < 2) {
    throw new Error(`Expected FAILED report with violations, got ${failingReport.verdict}`);
  }

  console.log('  ✓ Policy Virtual Machine tests PASSED');
  return true;
}
