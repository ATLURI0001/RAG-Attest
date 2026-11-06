/**
 * AEGIS-EDGE: Sovereign Edge RAG Evaluation Engine
 * Master Coordinator & Pipeline Evaluator
 */

import type {
  RagPayload,
  EvaluationResult,
  EvaluationBatchSummary,
  PolicyAttestationReport
} from '../core/types.ts';
import { EdgeMetricsEngine } from '../core/metrics.ts';
import { EdgeStorage } from './storage.ts';
import { EdgeTelemetry } from './telemetry.ts';
import { RagLCompiler } from '../dsl/index.ts';
import type { ProgramNode, PipelinePolicyNode } from '../dsl/ast.ts';

export interface EvaluatorOptions {
  storageDir?: string;
  defaultPolicy?: string | ProgramNode | PipelinePolicyNode;
  maxLatencyBudgetMs?: number;
}

export class AegisEdgeEvaluator {
  private storage: EdgeStorage;
  private defaultPolicy?: ProgramNode | PipelinePolicyNode;
  private maxLatencyBudgetMs: number;
  private eventListeners: Array<(res: EvaluationResult) => void> = [];

  constructor(options: EvaluatorOptions = {}) {
    this.storage = new EdgeStorage(options.storageDir || './data/wal');
    this.maxLatencyBudgetMs = options.maxLatencyBudgetMs || 500;

    if (typeof options.defaultPolicy === 'string') {
      this.defaultPolicy = RagLCompiler.compile(options.defaultPolicy);
    } else if (options.defaultPolicy) {
      this.defaultPolicy = options.defaultPolicy;
    }
  }

  /**
   * Subscribe to live evaluation events (used by SSE & WebSockets).
   */
  onEvaluation(listener: (res: EvaluationResult) => void): () => void {
    this.eventListeners.push(listener);
    return () => {
      this.eventListeners = this.eventListeners.filter(l => l !== listener);
    };
  }

  /**
   * Evaluate a single RAG transaction payload with edge metrics and policy attestation.
   */
  evaluate(
    payload: RagPayload,
    customPolicy?: string | ProgramNode | PipelinePolicyNode
  ): EvaluationResult {
    const startTime = performance.now();

    // 1. Compute deterministic metrics
    const { triad, extended, claims } = EdgeMetricsEngine.computeAll(payload);

    // 2. Measure evaluation overhead & efficiency
    const evalDurationMs = performance.now() - startTime;
    const latency = payload.latencyMs || 0;
    const tokens = payload.tokensGenerated || 0;
    const throughput = latency > 0 && tokens > 0 ? (tokens / latency) * 1000 : undefined;
    const mem = process.memoryUsage();

    const edgeBudgetCompliance = latency <= this.maxLatencyBudgetMs;

    // 3. Compute Harmonized Overall Score
    // Weightings: 35% Groundedness, 35% Answer Relevance, 20% Context Precision, 10% Brevity/Diversity
    const compositeScore = (
      0.35 * triad.groundedness +
      0.35 * triad.answerRelevance +
      0.20 * triad.contextPrecision +
      0.10 * extended.brevityIndex
    ) - (0.30 * extended.hallucinationRisk);

    const overallScore = Math.max(0.0, Math.min(1.0, Math.round(compositeScore * 1000) / 1000));

    // Determine operational safety status
    let status: 'OPTIMAL' | 'ACCEPTABLE' | 'DEGRADED' | 'UNSAFE';
    if (extended.hallucinationRisk > 0.45 || triad.groundedness < 0.40) {
      status = 'UNSAFE';
    } else if (overallScore < 0.65 || !edgeBudgetCompliance) {
      status = 'DEGRADED';
    } else if (overallScore >= 0.85) {
      status = 'OPTIMAL';
    } else {
      status = 'ACCEPTABLE';
    }

    const evaluationId = `eval-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;

    let result: EvaluationResult = {
      id: evaluationId,
      payloadId: payload.id,
      timestamp: new Date().toISOString(),
      triad,
      extended,
      claims,
      efficiency: {
        latencyMs: latency,
        ttftMs: payload.ttftMs,
        tokensGenerated: tokens,
        throughputTokensSec: throughput ? Math.round(throughput * 10) / 10 : undefined,
        evalComputeTimeMs: Math.round(evalDurationMs * 100) / 100,
        memoryFootprintKb: Math.round(mem.heapUsed / 1024),
        edgeBudgetCompliance
      },
      overallScore,
      status
    };

    // 4. Policy Attestation (RAG-L Domain Specific Language)
    let policyToRun = customPolicy ? (
      typeof customPolicy === 'string' ? RagLCompiler.compile(customPolicy) : customPolicy
    ) : this.defaultPolicy;

    if (policyToRun) {
      try {
        const attestation = RagLCompiler.attest(policyToRun, result);
        result.attestation = attestation;
        if (attestation.verdict === 'FAILED') {
          result.status = 'UNSAFE';
        } else if (attestation.verdict === 'DEGRADED' && result.status === 'OPTIMAL') {
          result.status = 'DEGRADED';
        }
      } catch (err: any) {
        console.warn('[Aegis Evaluator] Policy attestation error:', err.message);
      }
    }

    // 5. Append to embedded WAL
    this.storage.append(result);

    // 6. Broadcast to live edge subscribers
    for (const listener of this.eventListeners) {
      try {
        listener(result);
      } catch (err) {
        console.error('[Aegis Evaluator] Listener dispatch error:', err);
      }
    }

    return result;
  }

  /**
   * Evaluate a batch of transactions and return summary with percentiles.
   */
  evaluateBatch(
    payloads: RagPayload[],
    policy?: string | ProgramNode | PipelinePolicyNode
  ): EvaluationBatchSummary {
    for (const p of payloads) {
      this.evaluate(p, policy);
    }
    return this.storage.getSummary();
  }

  /**
   * Retrieve recent history and metrics from embedded storage.
   */
  getSummary(): EvaluationBatchSummary {
    return this.storage.getSummary();
  }

  getRecent(limit: number = 50): EvaluationResult[] {
    return this.storage.getRecent(limit);
  }
}
