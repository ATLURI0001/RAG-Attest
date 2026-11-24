/**
 * Semantic Context & Vector Cache Telemetry Rotary.
 * 
 * Provides high-throughput sliding-window telemetry for edge RAG semantic caches,
 * tracking exact vs semantic cosine hit ratios, token savings, lookup latency percentiles,
 * cache evictions, and SLA degradation alarms.
 */

export type CacheMatchType = 'EXACT' | 'SEMANTIC' | 'MISS';

export interface CacheLookupEvent {
  queryId: string;
  isHit: boolean;
  matchType: CacheMatchType;
  similarityScore?: number; // 0.0 to 1.0 (for semantic matches)
  latencyMs: number;
  tokensSaved?: number;
  timestamp?: number;
}

export interface CacheTelemetryConfig {
  windowSize: number;
  minHitRatioPct: number; // e.g. 50%
  maxP99LatencyMs: number; // e.g. 15.0ms
}

export const DEFAULT_CACHE_TELEMETRY_CONFIG: CacheTelemetryConfig = {
  windowSize: 1000,
  minHitRatioPct: 40.0,
  maxP99LatencyMs: 25.0,
};

export interface CacheTelemetrySnapshot {
  totalLookups: number;
  exactHits: number;
  semanticHits: number;
  totalHits: number;
  misses: number;
  hitRatioPct: number;
  totalTokensSaved: number;
  evictionsCount: number;
  meanLatencyMs: number;
  p50LatencyMs: number;
  p90LatencyMs: number;
  p99LatencyMs: number;
  slaBreached: boolean;
  breachReason?: string;
}

export class SemanticCacheTelemetryRotary {
  private config: CacheTelemetryConfig;
  private events: CacheLookupEvent[] = [];
  private evictionsCount: number = 0;

  constructor(customConfig?: Partial<CacheTelemetryConfig>) {
    this.config = { ...DEFAULT_CACHE_TELEMETRY_CONFIG, ...customConfig };
  }

  /**
   * Records a cache lookup operation.
   */
  public recordLookup(event: CacheLookupEvent): void {
    if (!event || !event.queryId) {
      throw new Error('Lookup event must contain a valid queryId');
    }

    const cleanEvent: CacheLookupEvent = {
      queryId: String(event.queryId).trim(),
      isHit: Boolean(event.isHit),
      matchType: event.matchType || (event.isHit ? 'EXACT' : 'MISS'),
      similarityScore:
        event.similarityScore !== undefined
          ? Math.max(0.0, Math.min(1.0, Number(event.similarityScore) || 0.0))
          : undefined,
      latencyMs: Math.max(0.001, Number(event.latencyMs) || 0.001),
      tokensSaved: Math.max(0, Math.floor(Number(event.tokensSaved) || 0)),
      timestamp: event.timestamp || Date.now(),
    };

    this.events.push(cleanEvent);
    if (this.events.length > this.config.windowSize) {
      this.events.shift();
    }
  }

  /**
   * Records a cache eviction event (TTL, LRU, or memory pressure).
   */
  public recordEviction(count: number = 1): void {
    this.evictionsCount += Math.max(1, Math.floor(count));
  }

  /**
   * Computes an aggregated telemetry snapshot across the active sliding window.
   */
  public snapshot(): CacheTelemetrySnapshot {
    const n = this.events.length;
    if (n === 0) {
      return {
        totalLookups: 0,
        exactHits: 0,
        semanticHits: 0,
        totalHits: 0,
        misses: 0,
        hitRatioPct: 0.0,
        totalTokensSaved: 0,
        evictionsCount: this.evictionsCount,
        meanLatencyMs: 0.0,
        p50LatencyMs: 0.0,
        p90LatencyMs: 0.0,
        p99LatencyMs: 0.0,
        slaBreached: false,
      };
    }

    let exactHits = 0;
    let semanticHits = 0;
    let misses = 0;
    let tokensSaved = 0;
    let sumLatencyMs = 0;
    const latencies: number[] = [];

    for (let i = 0; i < n; i++) {
      const ev = this.events[i];
      latencies.push(ev.latencyMs);
      sumLatencyMs += ev.latencyMs;
      tokensSaved += ev.tokensSaved || 0;

      if (!ev.isHit || ev.matchType === 'MISS') {
        misses++;
      } else if (ev.matchType === 'SEMANTIC') {
        semanticHits++;
      } else {
        exactHits++;
      }
    }

    const totalHits = exactHits + semanticHits;
    const hitRatioPct = Number(((totalHits / n) * 100.0).toFixed(2));
    const meanLatencyMs = Number((sumLatencyMs / n).toFixed(3));

    latencies.sort((a, b) => a - b);
    const p50 = Number(latencies[Math.floor(n * 0.50)].toFixed(3));
    const p90 = Number(latencies[Math.floor(n * 0.90)].toFixed(3));
    const p99 = Number(latencies[Math.floor(n * 0.99)].toFixed(3));

    let slaBreached = false;
    let breachReason: string | undefined;

    // Minimum samples required before triggering hit-ratio SLA
    if (n >= 10 && hitRatioPct < this.config.minHitRatioPct) {
      slaBreached = true;
      breachReason = `Cache hit ratio ${hitRatioPct}% below SLA threshold ${this.config.minHitRatioPct}%`;
    } else if (p99 > this.config.maxP99LatencyMs) {
      slaBreached = true;
      breachReason = `P99 lookup latency ${p99}ms exceeds SLA limit ${this.config.maxP99LatencyMs}ms`;
    }

    return {
      totalLookups: n,
      exactHits,
      semanticHits,
      totalHits,
      misses,
      hitRatioPct,
      totalTokensSaved: tokensSaved,
      evictionsCount: this.evictionsCount,
      meanLatencyMs,
      p50LatencyMs: p50,
      p90LatencyMs: p90,
      p99LatencyMs: p99,
      slaBreached,
      breachReason,
    };
  }

  /**
   * Formats metrics for Prometheus scraping exposition.
   */
  public formatPrometheus(): string {
    const snap = this.snapshot();
    return [
      '# HELP aegis_cache_lookups_total Total semantic cache lookup queries evaluated',
      '# TYPE aegis_cache_lookups_total counter',
      `aegis_cache_lookups_total ${snap.totalLookups}`,
      '# HELP aegis_cache_hits_total Total cache hits partitioned by match type',
      '# TYPE aegis_cache_hits_total counter',
      `aegis_cache_hits_total{type="exact"} ${snap.exactHits}`,
      `aegis_cache_hits_total{type="semantic"} ${snap.semanticHits}`,
      '# HELP aegis_cache_hit_ratio_pct Real-time cache hit percentage',
      '# TYPE aegis_cache_hit_ratio_pct gauge',
      `aegis_cache_hit_ratio_pct ${snap.hitRatioPct}`,
      '# HELP aegis_cache_tokens_saved_total Total prompt/completion tokens saved via cache hits',
      '# TYPE aegis_cache_tokens_saved_total counter',
      `aegis_cache_tokens_saved_total ${snap.totalTokensSaved}`,
      '# HELP aegis_cache_evictions_total Total entries evicted from cache',
      '# TYPE aegis_cache_evictions_total counter',
      `aegis_cache_evictions_total ${snap.evictionsCount}`,
      '# HELP aegis_cache_latency_p99_ms 99th percentile lookup latency in milliseconds',
      '# TYPE aegis_cache_latency_p99_ms gauge',
      `aegis_cache_latency_p99_ms ${snap.p99LatencyMs}`,
    ].join('\n');
  }

  /**
   * Resets all internal buffers and state.
   */
  public reset(): void {
    this.events = [];
    this.evictionsCount = 0;
  }
}
