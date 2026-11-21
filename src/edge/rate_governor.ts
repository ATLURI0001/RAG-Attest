/**
 * AEGIS-EDGE: Sovereign Edge RAG Evaluation Engine
 * Multi-Tenant Ingress Evaluation Rate Governor & Token Meter
 */

export interface TenantQuotaConfig {
  maxRequestsBurst: number;
  requestsRefillPerSec: number;
  maxTokensBurst: number;
  tokensRefillPerSec: number;
  idleTtlMs: number;
}

export const DEFAULT_TENANT_QUOTA: TenantQuotaConfig = {
  maxRequestsBurst: 30,
  requestsRefillPerSec: 10,
  maxTokensBurst: 100000,
  tokensRefillPerSec: 25000,
  idleTtlMs: 300000, // 5 minutes
};

export interface GovernorTelemetry {
  allowedRequests: number;
  throttledRequests: number;
  allowedTokens: number;
  throttledTokens: number;
  activeTenants: number;
  evictedTenants: number;
}

interface TenantBucketState {
  tenantId: string;
  requestTokens: number;
  tokenBudget: number;
  lastRefillMs: number;
  config: TenantQuotaConfig;
}

export class EdgeRateGovernor {
  private buckets = new Map<string, TenantBucketState>();
  private defaultQuota: TenantQuotaConfig;
  private telemetry: GovernorTelemetry = {
    allowedRequests: 0,
    throttledRequests: 0,
    allowedTokens: 0,
    throttledTokens: 0,
    activeTenants: 0,
    evictedTenants: 0,
  };

  constructor(defaultQuota: Partial<TenantQuotaConfig> = {}) {
    this.defaultQuota = { ...DEFAULT_TENANT_QUOTA, ...defaultQuota };
  }

  private getOrCreateBucket(tenantId: string): TenantBucketState {
    let bucket = this.buckets.get(tenantId);
    const now = Date.now();

    if (!bucket) {
      bucket = {
        tenantId,
        requestTokens: this.defaultQuota.maxRequestsBurst,
        tokenBudget: this.defaultQuota.maxTokensBurst,
        lastRefillMs: now,
        config: { ...this.defaultQuota },
      };
      this.buckets.set(tenantId, bucket);
    } else {
      // Refill tokens
      const elapsedSec = (now - bucket.lastRefillMs) / 1000.0;
      if (elapsedSec > 0) {
        bucket.requestTokens = Math.min(
          bucket.config.maxRequestsBurst,
          bucket.requestTokens + elapsedSec * bucket.config.requestsRefillPerSec
        );
        bucket.tokenBudget = Math.min(
          bucket.config.maxTokensBurst,
          bucket.tokenBudget + elapsedSec * bucket.config.tokensRefillPerSec
        );
        bucket.lastRefillMs = now;
      }
    }

    return bucket;
  }

  /**
   * Attempts to acquire execution allowance for an incoming RAG payload evaluation.
   * Checks both request burst capacity and text token payload consumption.
   */
  public tryAcquire(tenantId: string, estimatedTokens: number = 500): { allowed: boolean; reason?: string } {
    if (!tenantId || typeof tenantId !== 'string') {
      return { allowed: false, reason: 'Invalid tenantId' };
    }

    const bucket = this.getOrCreateBucket(tenantId);

    // Check request quota
    if (bucket.requestTokens < 1.0) {
      this.telemetry.throttledRequests++;
      return { allowed: false, reason: 'Request rate limit exceeded' };
    }

    // Check token budget
    if (bucket.tokenBudget < estimatedTokens) {
      this.telemetry.throttledTokens++;
      return { allowed: false, reason: 'Evaluation token budget exceeded' };
    }

    // Deduct tokens
    bucket.requestTokens -= 1.0;
    bucket.tokenBudget -= estimatedTokens;

    this.telemetry.allowedRequests++;
    this.telemetry.allowedTokens += estimatedTokens;

    return { allowed: true };
  }

  /**
   * Evicts idle tenant buckets that have not been refilled or active within their TTL.
   */
  public evictIdleTenants(nowMs: number = Date.now()): number {
    let evicted = 0;
    for (const [id, bucket] of this.buckets.entries()) {
      if (nowMs - bucket.lastRefillMs > bucket.config.idleTtlMs) {
        this.buckets.delete(id);
        evicted++;
      }
    }
    this.telemetry.evictedTenants += evicted;
    return evicted;
  }

  public getTelemetry(): GovernorTelemetry {
    return {
      ...this.telemetry,
      activeTenants: this.buckets.size,
    };
  }

  public reset(): void {
    this.buckets.clear();
    this.telemetry = {
      allowedRequests: 0,
      throttledRequests: 0,
      allowedTokens: 0,
      throttledTokens: 0,
      activeTenants: 0,
      evictedTenants: 0,
    };
  }
}
