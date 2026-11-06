#!/usr/bin/env node
/**
 * AEGIS-EDGE: Sovereign Edge RAG Evaluation Engine
 * Unified Command Line Interface & Edge Runner
 */

import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { AegisEdgeEvaluator } from '../edge/engine.ts';
import { EdgeHttpServer } from '../server/http_server.ts';
import { RagLCompiler } from '../dsl/index.ts';
import type { RagPayload, EvaluationResult } from '../core/types.ts';

// ANSI terminal color codes
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  purple: '\x1b[35m',
  gray: '\x1b[90m'
};

function printBanner(): void {
  console.log(`
${C.cyan}${C.bold}========================================================================${C.reset}
${C.cyan}${C.bold}   AEGIS-EDGE // SOVEREIGN RAG EVALUATION & ATTESTATION ENGINE          ${C.reset}
${C.gray}   Zero-Cloud Native Edge Runtime  |  RAG-L Domain Specific Language    ${C.reset}
${C.cyan}${C.bold}========================================================================${C.reset}
`);
}

function renderMeter(val: number, width: number = 24): string {
  const filled = Math.round(val * width);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  const color = val >= 0.8 ? C.green : val >= 0.6 ? C.yellow : C.red;
  return `${color}${bar}${C.reset} ${(val * 100).toFixed(1)}%`;
}

function printEvaluationResult(res: EvaluationResult): void {
  console.log(`${C.bold}Evaluation Run ID:${C.reset}    ${C.cyan}${res.id}${C.reset} (${res.timestamp})`);
  console.log(`${C.bold}Operational Status:${C.reset}   ${getStatusBadge(res.status)} | Overall Score: ${res.overallScore.toFixed(3)}`);
  console.log(`\n${C.bold}--- RAG TRIAD METRICS ---${C.reset}`);
  console.log(`  Context Precision:  ${renderMeter(res.triad.contextPrecision)}`);
  console.log(`  Groundedness:       ${renderMeter(res.triad.groundedness)}`);
  console.log(`  Answer Relevance:   ${renderMeter(res.triad.answerRelevance)}`);

  console.log(`\n${C.bold}--- EXTENDED INFORMATION METRICS ---${C.reset}`);
  console.log(`  Context Recall:     ${renderMeter(res.extended.contextRecall)}`);
  console.log(`  Brevity Index:      ${renderMeter(res.extended.brevityIndex)}`);
  console.log(`  Semantic Drift:     ${res.extended.semanticDrift.toFixed(3)} (lower is better)`);
  console.log(`  Hallucination Risk: ${res.extended.hallucinationRisk > 0.3 ? C.red : C.green}${res.extended.hallucinationRisk.toFixed(3)}${C.reset}`);
  console.log(`  Contradiction Entr: ${res.extended.contradictionEntropy.toFixed(3)}`);

  console.log(`\n${C.bold}--- ATOMIC CLAIM ATTRIBUTIONS (${res.claims.length} claims extracted) ---${C.reset}`);
  for (const c of res.claims) {
    const badge = c.status === 'ENTAILED'
      ? `${C.green}[ENTAILED]${C.reset}`
      : c.status === 'CONTRADICTED'
        ? `${C.red}${C.bold}[CONTRADICTED]${C.reset}`
        : `${C.yellow}[UNGROUNDED]${C.reset}`;

    console.log(`  ${badge} "${c.claimText}"`);
    if (c.bestMatchingChunkId) {
      console.log(`    ${C.gray}↳ Best match chunk: ${c.bestMatchingChunkId} (score: ${c.matchScore}, confidence: ${c.confidence})${C.reset}`);
    }
  }

  console.log(`\n${C.bold}--- EDGE RESOURCE FOOTPRINT ---${C.reset}`);
  console.log(`  Payload Latency:    ${res.efficiency.latencyMs} ms`);
  console.log(`  Evaluation Latency: ${res.efficiency.evalComputeTimeMs} ms`);
  console.log(`  Memory Heap Used:   ${res.efficiency.memoryFootprintKb} KB`);
  console.log(`  Budget Compliance:  ${res.efficiency.edgeBudgetCompliance ? `${C.green}PASSED${C.reset}` : `${C.red}EXCEEDED${C.reset}`}`);

  if (res.attestation) {
    console.log(`\n${C.bold}--- RAG-L POLICY ATTESTATION [${res.attestation.policyName}] ---${C.reset}`);
    const vColor = res.attestation.verdict === 'PASSED' ? C.green : res.attestation.verdict === 'DEGRADED' ? C.yellow : C.red;
    console.log(`  Verdict:            ${vColor}${res.attestation.verdict}${C.reset} (compliance: ${(res.attestation.complianceScore * 100).toFixed(1)}%)`);
    if (res.attestation.violations.length > 0) {
      console.log(`  Violations Logged:`);
      for (const v of res.attestation.violations) {
        console.log(`    ${C.red}✖ [${v.severity}] Line ${v.line || '?'}: ${v.message}${C.reset}`);
      }
    }
  }
  console.log('');
}

function getStatusBadge(status: string): string {
  switch (status) {
    case 'OPTIMAL': return `${C.green}${C.bold}[OPTIMAL]${C.reset}`;
    case 'ACCEPTABLE': return `${C.cyan}[ACCEPTABLE]${C.reset}`;
    case 'DEGRADED': return `${C.yellow}[DEGRADED]${C.reset}`;
    case 'UNSAFE': return `${C.red}${C.bold}[UNSAFE]${C.reset}`;
    default: return status;
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] || 'demo';

  printBanner();

  if (command === 'serve') {
    const port = parseInt(args[1] || '8420', 10);
    const evaluator = new AegisEdgeEvaluator();
    const server = new EdgeHttpServer(evaluator, port);
    const activePort = await server.start();
    console.log(`${C.green}✓ Edge Daemon listening on http://localhost:${activePort}${C.reset}`);
    console.log(`${C.cyan}✓ Embedded Web Cockpit: http://localhost:${activePort}/${C.reset}`);
    console.log(`${C.gray}  Endpoints: /health, /api/evaluate, /api/batch, /api/events (SSE)${C.reset}\n`);
    return;
  }

  if (command === 'eval' || command === 'demo') {
    console.log(`${C.cyan}Running Edge Evaluation Pipeline Demo...${C.reset}\n`);

    const evaluator = new AegisEdgeEvaluator();
    const samplePayload: RagPayload = {
      id: 'tx-query-101',
      query: 'What is the maximum token context length for edge micro-nodes in offline mode?',
      retrievedChunks: [
        {
          id: 'chunk-1',
          text: 'In offline edge environments, micro-nodes are constrained to a maximum token context length of 4096 tokens.'
        },
        {
          id: 'chunk-2',
          text: 'Memory allocations on battery-backed IoT gateways limit model context windows to 4096 tokens.'
        }
      ],
      generatedAnswer: 'Edge micro-nodes support a maximum token context length of 4096 tokens in offline environments.',
      groundTruth: 'The maximum token context length is 4096 tokens for offline edge nodes.',
      latencyMs: 185,
      ttftMs: 32,
      tokensGenerated: 16
    };

    const policySrc = `
evaluate pipeline "edge_production_guard" with budget { latency_ms: 300 } {
  assert groundedness >= 0.75 fail_with "Response contains ungrounded claims";
  assert context_precision >= 0.70 severity warning;
  assert answer_relevance >= 0.75;
  penalize semantic_drift > 0.45 by 0.10 fail_with "Semantic drift outside safe margin";
  hallucination_guard strict <= 0.20;
}
    `;

    const result = evaluator.evaluate(samplePayload, policySrc);
    printEvaluationResult(result);
    return;
  }

  if (command === 'benchmark') {
    console.log(`${C.cyan}Executing Automated Multi-Scenario Benchmark Suite...${C.reset}\n`);
    const evaluator = new AegisEdgeEvaluator();

    const testSuite: RagPayload[] = [
      {
        id: 'bench-case-1-optimal',
        query: 'What is the default baud rate for edge telemetry sensors?',
        retrievedChunks: [
          { id: 'c1', text: 'Telemetry sensors communicate over RS-485 serial with a default baud rate of 115200 bps.' },
          { id: 'c2', text: 'Sensor gateways require serial parity none and 115200 baud.' }
        ],
        generatedAnswer: 'The default baud rate for edge telemetry sensors is 115200 bps over RS-485 serial.',
        latencyMs: 95,
        tokensGenerated: 14
      },
      {
        id: 'bench-case-2-hallucinated',
        query: 'What protocol secures wireless telemetry in the field?',
        retrievedChunks: [
          { id: 'c1', text: 'Field devices utilize WPA3-Enterprise with TLS 1.3 certificates for radio security.' }
        ],
        generatedAnswer: 'Field devices use unencrypted plain HTTP over open telnet ports with zero password verification.',
        latencyMs: 420,
        tokensGenerated: 18
      },
      {
        id: 'bench-case-3-unrelated-retrieval',
        query: 'How often are firmware updates flashed to microcontrollers?',
        retrievedChunks: [
          { id: 'c1', text: 'The cafeteria menu offers soup and sandwiches on Tuesdays and Thursdays.' }
        ],
        generatedAnswer: 'Firmware updates are scheduled every Tuesday during low-traffic windows.',
        latencyMs: 210,
        tokensGenerated: 12
      }
    ];

    const policySrc = `
evaluate pipeline "benchmark_guard" with budget { latency_ms: 250 } {
  assert groundedness >= 0.70 fail_with "Unsafe hallucination";
  assert context_precision >= 0.60;
  assert answer_relevance >= 0.60;
  hallucination_guard strict <= 0.25;
}
    `;

    for (const testCase of testSuite) {
      console.log(`${C.bold}Testing Scenario:${C.reset} ${testCase.id}`);
      const res = evaluator.evaluate(testCase, policySrc);
      printEvaluationResult(res);
      console.log('------------------------------------------------------------------------\n');
    }

    const summary = evaluator.getSummary();
    console.log(`${C.cyan}${C.bold}=== BENCHMARK SUITE SUMMARY ===${C.reset}`);
    console.log(`  Total Evaluated:       ${summary.totalCount}`);
    console.log(`  Average Triad Precision:   ${summary.averageTriad.contextPrecision.toFixed(3)}`);
    console.log(`  Average Triad Grounded:    ${summary.averageTriad.groundedness.toFixed(3)}`);
    console.log(`  Average Triad Relevance:   ${summary.averageTriad.answerRelevance.toFixed(3)}`);
    console.log(`  Hallucination Rate:        ${(summary.hallucinationRate * 100).toFixed(1)}%`);
    console.log(`  Latency Percentiles (ms):  p50=${summary.latencyPercentiles.p50} | p95=${summary.latencyPercentiles.p95} | p99=${summary.latencyPercentiles.p99}`);
    console.log(`  Entailed Claims Ratio:     ${(summary.entailedClaimsRatio * 100).toFixed(1)}%\n`);
    return;
  }

  if (command === 'check-policy') {
    const filePath = args[1];
    if (!filePath || !fs.existsSync(filePath)) {
      console.error(`${C.red}Error: File not found: ${filePath}${C.reset}`);
      process.exit(1);
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    try {
      const ast = RagLCompiler.compile(content);
      console.log(`${C.green}✓ RAG-L Policy is syntactically valid!${C.reset}`);
      console.log(`  Found ${ast.policies.length} pipeline policy definitions:`);
      for (const p of ast.policies) {
        console.log(`    - Policy: "${p.name}" (${p.statements.length} rules, budget: ${JSON.stringify(p.budget?.limits || {})})`);
      }
    } catch (err: any) {
      console.error(`${C.red}✖ RAG-L Compilation Failed:${C.reset}`);
      console.error(err.message);
      process.exit(1);
    }
    return;
  }

  if (command === 'native-bench') {
    const nativeBin = path.join(process.cwd(), 'bin', 'aegis-native.exe');
    if (!fs.existsSync(nativeBin)) {
      console.error(`${C.red}Native binary not found at ${nativeBin}. Run 'zig build-exe src/native/main.zig' first.${C.reset}`);
      process.exit(1);
    }
    console.log(`${C.cyan}Spawning Zig native evaluation kernel...${C.reset}\n`);
    const output = execFileSync(nativeBin, [], { encoding: 'utf-8' });
    console.log(output);
    return;
  }

  console.log(`Unknown command: ${command}`);
  console.log(`Available commands: serve, eval, demo, benchmark, check-policy <file>, native-bench`);
}

main().catch(err => {
  console.error(`${C.red}Fatal CLI Error:${C.reset}`, err);
  process.exit(1);
});
