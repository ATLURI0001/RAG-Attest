/**
 * AEGIS-RAG-EDGE: Chunk Reranker Timeout & Pass-Through Fallback Circuit Breaker.
 * 
 * Protects edge retrieval pipelines against high-latency cross-encoder reranking,
 * API timeouts, and service outages by executing automatic pass-through degradation.
 */

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export type TripReason =
  | 'TIMEOUT'
  | 'EXECUTION_ERROR'
  | 'CONSECUTIVE_FAILURES'
  | 'CIRCUIT_OPEN';

export interface RerankerBreakerConfig {
  failureThreshold?: number;
  recoveryTimeoutMs?: number;
  maxRerankTimeoutMs?: number;
}

export interface RerankCandidate {
  id: string;
  text: string;
  initialScore: number;
}

export interface RerankResult {
  id: string;
  text: string;
  finalScore: number;
  rank: number;
}

export interface RerankerExecutionResult {
  results: RerankResult[];
  isDegraded: boolean;
  tripReason?: TripReason;
  circuitState: CircuitState;
  executionLatencyMs: number;
}

export class RerankerCircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount: number = 0;
  private lastStateChangeTime: number = Date.now();

  private readonly failureThreshold: number;
  private readonly recoveryTimeoutMs: number;
  private readonly maxRerankTimeoutMs: number;

  constructor(config: RerankerBreakerConfig = {}) {
    this.failureThreshold = Math.max(1, config.failureThreshold ?? 3);
    this.recoveryTimeoutMs = Math.max(10, config.recoveryTimeoutMs ?? 5000);
    this.maxRerankTimeoutMs = Math.max(5, config.maxRerankTimeoutMs ?? 250);
  }

  public getState(nowMs: number = Date.now()): CircuitState {
    this.evaluateStateTransitions(nowMs);
    return this.state;
  }

  private evaluateStateTransitions(nowMs: number): void {
    if (this.state === 'OPEN') {
      if (nowMs - this.lastStateChangeTime >= this.recoveryTimeoutMs) {
        this.state = 'HALF_OPEN';
        this.lastStateChangeTime = nowMs;
      }
    }
  }

  public async executeRerank(
    query: string,
    candidates: RerankCandidate[],
    remoteRerankFn: (q: string, c: RerankCandidate[]) => Promise<RerankResult[]>,
    nowMs: number = Date.now()
  ): Promise<RerankerExecutionResult> {
    this.evaluateStateTransitions(nowMs);

    // Fast reject when circuit is OPEN
    if (this.state === 'OPEN') {
      return {
        results: this.fallbackPassThrough(candidates),
        isDegraded: true,
        tripReason: 'CIRCUIT_OPEN',
        circuitState: this.state,
        executionLatencyMs: 0.1,
      };
    }

    const startTime = Date.now();

    try {
      // Race reranker against deadline
      const rerankPromise = remoteRerankFn(query, candidates);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          const err = new Error(`Reranker query deadline of ${this.maxRerankTimeoutMs}ms exceeded`);
          (err as any).isTimeout = true;
          reject(err);
        }, this.maxRerankTimeoutMs);
      });

      const res = await Promise.race([rerankPromise, timeoutPromise]);
      const latencyMs = Math.max(0.1, Date.now() - startTime);

      this.onSuccess(nowMs);
      return {
        results: res,
        isDegraded: false,
        circuitState: this.state,
        executionLatencyMs: latencyMs,
      };
    } catch (err: any) {
      const latencyMs = Math.max(0.1, Date.now() - startTime);
      const reason: TripReason = err?.isTimeout ? 'TIMEOUT' : 'EXECUTION_ERROR';
      this.onFailure(nowMs);

      return {
        results: this.fallbackPassThrough(candidates),
        isDegraded: true,
        tripReason: reason,
        circuitState: this.state,
        executionLatencyMs: latencyMs,
      };
    }
  }

  private onSuccess(nowMs: number): void {
    if (this.state === 'HALF_OPEN') {
      this.state = 'CLOSED';
      this.failureCount = 0;
      this.lastStateChangeTime = nowMs;
    } else {
      this.failureCount = Math.max(0, this.failureCount - 1);
    }
  }

  private onFailure(nowMs: number): void {
    this.failureCount++;
    if (this.failureCount >= this.failureThreshold || this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
      this.lastStateChangeTime = nowMs;
    }
  }

  public reset(): void {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.lastStateChangeTime = Date.now();
  }

  /**
   * Deterministic pass-through fallback preserving initial retrieval order.
   */
  public fallbackPassThrough(candidates: RerankCandidate[]): RerankResult[] {
    const sorted = [...candidates].sort((a, b) => b.initialScore - a.initialScore);
    return sorted.map((cand, idx) => ({
      id: cand.id,
      text: cand.text,
      finalScore: cand.initialScore,
      rank: idx + 1,
    }));
  }
}
