/**
 * Vector Store Offline & Retrieval Circuit Breaker.
 *
 * Protects RAG retrieval pipelines against remote vector store timeouts, connection refused,
 * and service degradations by falling back to local deterministic lexical search.
 */

export type BreakerState = "CLOSED" | "OPEN" | "HALF_OPEN";

export type BreakerTripReason =
  | "QUERY_TIMEOUT"
  | "CONNECTION_ERROR"
  | "CONSECUTIVE_FAILURES"
  | "REMOTE_STORE_DEGRADED"
  | "UNEXPECTED_EXCEPTION";

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  recoveryTimeoutMs?: number;
  maxQueryTimeoutMs?: number;
}

export interface VectorSearchResult {
  id: string;
  text: string;
  score: number;
}

export interface RetrievalResult {
  results: VectorSearchResult[];
  isDegraded: boolean;
  circuitState: BreakerState;
  tripReason?: BreakerTripReason;
  latencyMs: number;
}

export class VectorStoreCircuitBreaker {
  private state: BreakerState = "CLOSED";
  private failureCount: number = 0;
  private lastStateChangeTime: number = Date.now();
  private readonly failureThreshold: number;
  private readonly recoveryTimeoutMs: number;
  private readonly maxQueryTimeoutMs: number;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = Math.max(1, options.failureThreshold ?? 3);
    this.recoveryTimeoutMs = Math.max(100, options.recoveryTimeoutMs ?? 2000);
    this.maxQueryTimeoutMs = Math.max(10, options.maxQueryTimeoutMs ?? 100);
  }

  public getState(now: number = Date.now()): BreakerState {
    if (this.state === "OPEN") {
      if (now - this.lastStateChangeTime >= this.recoveryTimeoutMs) {
        this.state = "HALF_OPEN";
        this.lastStateChangeTime = now;
      }
    }
    return this.state;
  }

  public getFailureCount(): number {
    return this.failureCount;
  }

  public reset(): void {
    this.state = "CLOSED";
    this.failureCount = 0;
    this.lastStateChangeTime = Date.now();
  }

  /**
   * Simple, robust in-memory local lexical fallback search across cached documents.
   */
  public localLexicalFallback(query: string, localDocs: Array<{ id: string; text: string }>, topK: number = 5): VectorSearchResult[] {
    const terms = query
      .toLowerCase()
      .split(/\W+/)
      .filter((t) => t.length > 1);

    if (terms.length === 0 || localDocs.length === 0) {
      return localDocs.slice(0, topK).map((doc) => ({
        id: doc.id,
        text: doc.text,
        score: 0.1,
      }));
    }

    const scored = localDocs.map((doc) => {
      const docLower = doc.text.toLowerCase();
      let matchCount = 0;
      for (const term of terms) {
        if (docLower.includes(term)) {
          matchCount++;
        }
      }
      const score = matchCount / terms.length;
      return { id: doc.id, text: doc.text, score: Number(score.toFixed(3)) };
    });

    return scored
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  /**
   * Executes a remote vector search function with circuit-breaker protection and automatic fallback.
   */
  public async executeSearch(
    query: string,
    localCacheDocs: Array<{ id: string; text: string }>,
    remoteSearchFn: (q: string) => Promise<VectorSearchResult[]>,
    now: number = Date.now()
  ): Promise<RetrievalResult> {
    const currentState = this.getState(now);

    // Fast short-circuit if OPEN
    if (currentState === "OPEN") {
      const fallbackResults = this.localLexicalFallback(query, localCacheDocs);
      return {
        results: fallbackResults,
        isDegraded: true,
        circuitState: "OPEN",
        tripReason: "CONSECUTIVE_FAILURES",
        latencyMs: 0,
      };
    }

    const startTime = Date.now();
    try {
      const queryPromise = remoteSearchFn(query);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("QUERY_TIMEOUT")), this.maxQueryTimeoutMs);
      });

      const results = await Promise.race([queryPromise, timeoutPromise]);
      const latencyMs = Date.now() - startTime;

      this.recordSuccess();
      return {
        results,
        isDegraded: false,
        circuitState: this.state,
        latencyMs,
      };
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      const isTimeout = err?.message === "QUERY_TIMEOUT";
      const reason: BreakerTripReason = isTimeout ? "QUERY_TIMEOUT" : "CONNECTION_ERROR";

      this.recordFailure(reason, now);
      const fallbackResults = this.localLexicalFallback(query, localCacheDocs);

      return {
        results: fallbackResults,
        isDegraded: true,
        circuitState: this.state,
        tripReason: reason,
        latencyMs,
      };
    }
  }

  private recordSuccess(): void {
    if (this.state === "HALF_OPEN") {
      this.state = "CLOSED";
      this.failureCount = 0;
      this.lastStateChangeTime = Date.now();
    } else {
      this.failureCount = Math.max(0, this.failureCount - 1);
    }
  }

  private recordFailure(reason: BreakerTripReason, now: number): void {
    this.failureCount += 1;
    if (this.state === "HALF_OPEN" || this.failureCount >= this.failureThreshold) {
      this.state = "OPEN";
      this.lastStateChangeTime = now;
    }
  }
}
