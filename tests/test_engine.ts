/**
 * AEGIS-EDGE Test Suite: Master Evaluator & Storage Engine Tests
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AegisEdgeEvaluator } from '../src/edge/engine.ts';
import { EdgeStorage } from '../src/edge/storage.ts';
import type { RagPayload, EvaluationResult } from '../src/core/types.ts';

export function runEngineTests(): boolean {
  console.log('  Testing AegisEdgeEvaluator & EdgeStorage...');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-test-wal-'));

  try {
    const evaluator = new AegisEdgeEvaluator({
      storageDir: tempDir,
      maxLatencyBudgetMs: 400
    });

    // 1. Test Single Grounded Payload Evaluation
    const groundedPayload: RagPayload = {
      id: 'payload-grounded',
      query: 'What is the speed of light in vacuum?',
      retrievedChunks: [
        {
          id: 'chunk-1',
          text: 'The speed of light in vacuum is exactly 299,792,458 meters per second.'
        }
      ],
      generatedAnswer: 'The speed of light in vacuum is 299,792,458 meters per second.',
      latencyMs: 110,
      tokensGenerated: 16
    };

    let eventDispatched = false;
    let dispatchedId = '';
    const unsubscribe = evaluator.onEvaluation(res => {
      eventDispatched = true;
      dispatchedId = res.id;
    });

    const result = evaluator.evaluate(groundedPayload);

    if (!result.id || result.payloadId !== 'payload-grounded') {
      throw new Error('Evaluation result ID or payloadId mismatch');
    }
    if (result.triad.groundedness < 0.80) {
      throw new Error(`Expected high groundedness, got ${result.triad.groundedness}`);
    }
    if (result.overallScore < 0.70) {
      throw new Error(`Expected overall score >= 0.70, got ${result.overallScore}`);
    }
    if (result.status !== 'OPTIMAL' && result.status !== 'ACCEPTABLE') {
      throw new Error(`Expected OPTIMAL or ACCEPTABLE status, got ${result.status}`);
    }
    if (!eventDispatched || dispatchedId !== result.id) {
      throw new Error('Event listener was not triggered on evaluation');
    }

    // Unsubscribe and verify no more events sent to this listener
    unsubscribe();
    eventDispatched = false;

    // 2. Test Policy Attestation via Evaluator
    const policyDsl = `
      evaluate pipeline "strict_production" with budget { latency_ms: 300 } {
        assert groundedness >= 0.75 fail_with "Low groundedness";
        assert answer_relevance >= 0.70 fail_with "Low relevance";
      }
    `;

    const attestedResult = evaluator.evaluate(groundedPayload, policyDsl);
    if (!attestedResult.attestation || attestedResult.attestation.verdict !== 'PASSED') {
      throw new Error(`Expected PASSED attestation, got ${attestedResult.attestation?.verdict}`);
    }

    // 3. Test Hallucinated / Contradicted Payload
    const hallucinatedPayload: RagPayload = {
      id: 'payload-hallucinated',
      query: 'What is the speed of light in vacuum?',
      retrievedChunks: [
        {
          id: 'chunk-1',
          text: 'The speed of light in vacuum is exactly 299,792,458 meters per second.'
        }
      ],
      generatedAnswer: 'The speed of light was measured at 55 miles per hour by ancient martians.',
      latencyMs: 140,
      tokensGenerated: 18
    };

    const hallucinatedResult = evaluator.evaluate(hallucinatedPayload, policyDsl);
    if (hallucinatedResult.status !== 'UNSAFE') {
      throw new Error(`Expected UNSAFE status for hallucinated answer, got ${hallucinatedResult.status}`);
    }
    if (hallucinatedResult.attestation?.verdict !== 'FAILED') {
      throw new Error(`Expected FAILED policy verdict, got ${hallucinatedResult.attestation?.verdict}`);
    }

    // 4. Test evaluateBatch and getSummary
    evaluator.evaluateBatch([groundedPayload, hallucinatedPayload]);
    const summary = evaluator.getSummary();

    if (summary.totalCount < 3) {
      throw new Error(`Expected totalCount >= 3, got ${summary.totalCount}`);
    }
    if (summary.latencyPercentiles.p50 <= 0 || summary.latencyPercentiles.avg <= 0) {
      throw new Error('Expected valid latency percentiles');
    }

    // 5. Test EdgeStorage RingBuffer Capacity & WAL persistence
    const storageDir = path.join(tempDir, 'capacity-test');
    const storage = new EdgeStorage(storageDir, 3);

    for (let i = 1; i <= 5; i++) {
      const mockResult: EvaluationResult = {
        ...result,
        id: `mock-${i}`,
        payloadId: `p-${i}`
      };
      storage.append(mockResult);
    }

    const recent = storage.getRecent(10);
    if (recent.length !== 3) {
      throw new Error(`Expected ring buffer capacity to constrain to 3, got ${recent.length}`);
    }
    if (recent[0].id !== 'mock-5') {
      throw new Error(`Expected most recent item mock-5, got ${recent[0].id}`);
    }

    // Verify recovery on re-open
    const storageRecovered = new EdgeStorage(storageDir, 3);
    const recoveredRecent = storageRecovered.getRecent(10);
    if (recoveredRecent.length !== 3) {
      throw new Error(`Expected recovered storage to have 3 items, got ${recoveredRecent.length}`);
    }

    console.log('  ✓ AegisEdgeEvaluator & EdgeStorage tests PASSED');
    return true;
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors on temp
    }
  }
}
