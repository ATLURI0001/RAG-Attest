/**
 * @file retrieval_telemetry.ts
 * Real-time RAG retrieval quality telemetry profiler and context relevance diagnostic.
 */

export interface RetrievedChunkTelemetry {
  chunkId: string;
  relevanceScore: number; // e.g. cosine similarity [0.0, 1.0]
  rank: number;           // 1-based rank
  isRelevant: boolean;    // Evaluated against relevance threshold
}

export interface RetrievalQueryRecord {
  queryId: string;
  latencyMs: number;
  topK: number;
  chunks: RetrievedChunkTelemetry[];
  timestamp: number;
}

export type RetrievalHealthStatus =
  | 'HEALTHY'
  | 'DEGRADED_NOISY_CONTEXT'
  | 'DEGRADED_LOW_SIMILARITY'
  | 'CRITICAL_RETRIEVAL_FAILURE';

export interface RetrievalDiagnosticReport {
  totalQueries: number;
  averageLatencyMs: number;
  meanRelevance: number;
  minRelevance: number;
  hitRateAtK: number;     // Fraction of queries with at least one relevant chunk
  mrr: number;            // Mean Reciprocal Rank
  noiseRatio: number;     // Fraction of retrieved chunks deemed noisy/irrelevant
  status: RetrievalHealthStatus;
  recommendations: string[];
}

export interface RetrievalTelemetryConfig {
  relevanceThreshold: number;   // default 0.70
  maxNoiseRatioWarning: number; // default 0.35 (35% noise)
  minAvgRelevance: number;      // default 0.65
  maxHistorySize: number;       // default 500
}

export const DEFAULT_RETRIEVAL_CONFIG: RetrievalTelemetryConfig = {
  relevanceThreshold: 0.70,
  maxNoiseRatioWarning: 0.35,
  minAvgRelevance: 0.65,
  maxHistorySize: 500,
};

export class RetrievalTelemetryProfiler {
  private config: RetrievalTelemetryConfig;
  private history: RetrievalQueryRecord[] = [];

  constructor(config: Partial<RetrievalTelemetryConfig> = {}) {
    this.config = {
      ...DEFAULT_RETRIEVAL_CONFIG,
      ...config,
    };
  }

  /**
   * Records a retrieval event for a single query.
   */
  public recordQuery(
    queryId: string,
    latencyMs: number,
    scores: number[],
    timestamp: number = Date.now()
  ): RetrievalQueryRecord {
    if (!queryId || typeof queryId !== 'string') {
      throw new TypeError('queryId must be a non-empty string');
    }

    const cleanLatency = Number.isFinite(latencyMs) && latencyMs >= 0 ? latencyMs : 0;
    const chunks: RetrievedChunkTelemetry[] = (scores || []).map((score, idx) => {
      const cleanScore = Number.isFinite(score) ? Math.max(0.0, Math.min(1.0, score)) : 0.0;
      return {
        chunkId: `chunk-${idx + 1}`,
        relevanceScore: Number(cleanScore.toFixed(4)),
        rank: idx + 1,
        isRelevant: cleanScore >= this.config.relevanceThreshold,
      };
    });

    const record: RetrievalQueryRecord = {
      queryId,
      latencyMs: Number(cleanLatency.toFixed(2)),
      topK: chunks.length,
      chunks,
      timestamp,
    };

    this.history.push(record);
    if (this.history.length > this.config.maxHistorySize) {
      this.history.shift();
    }

    return record;
  }

  /**
   * Evaluates aggregate telemetry against configured SLA thresholds and emits diagnostic report.
   */
  public diagnose(): RetrievalDiagnosticReport {
    if (this.history.length === 0) {
      return {
        totalQueries: 0,
        averageLatencyMs: 0,
        meanRelevance: 0,
        minRelevance: 0,
        hitRateAtK: 0,
        mrr: 0,
        noiseRatio: 0,
        status: 'HEALTHY',
        recommendations: [],
      };
    }

    let totalLatency = 0;
    let totalChunks = 0;
    let noisyChunks = 0;
    let sumRelevance = 0;
    let minRelevance = 1.0;
    let queriesWithHits = 0;
    let sumReciprocalRank = 0;

    for (const record of this.history) {
      totalLatency += record.latencyMs;

      let firstHitRank = 0;
      for (const chunk of record.chunks) {
        totalChunks++;
        sumRelevance += chunk.relevanceScore;
        if (chunk.relevanceScore < minRelevance) {
          minRelevance = chunk.relevanceScore;
        }

        if (chunk.isRelevant) {
          if (firstHitRank === 0) {
            firstHitRank = chunk.rank;
          }
        } else {
          noisyChunks++;
        }
      }

      if (firstHitRank > 0) {
        queriesWithHits++;
        sumReciprocalRank += 1.0 / firstHitRank;
      }
    }

    const totalQueries = this.history.length;
    const averageLatencyMs = Number((totalLatency / totalQueries).toFixed(2));
    const meanRelevance = totalChunks > 0 ? Number((sumRelevance / totalChunks).toFixed(4)) : 0;
    const noiseRatio = totalChunks > 0 ? Number((noisyChunks / totalChunks).toFixed(4)) : 0;
    const hitRateAtK = Number((queriesWithHits / totalQueries).toFixed(4));
    const mrr = Number((sumReciprocalRank / totalQueries).toFixed(4));

    const recommendations: string[] = [];
    let status: RetrievalHealthStatus = 'HEALTHY';

    if (hitRateAtK < 0.40) {
      status = 'CRITICAL_RETRIEVAL_FAILURE';
      recommendations.push(
        `HitRate@K is critically low (${(hitRateAtK * 100).toFixed(1)}%). Fall back to hybrid BM25 + dense retrieval or trigger query rewriting.`
      );
    } else if (meanRelevance < this.config.minAvgRelevance) {
      status = 'DEGRADED_LOW_SIMILARITY';
      recommendations.push(
        `Mean chunk relevance (${meanRelevance}) is below target (${this.config.minAvgRelevance}). Re-index corpus with higher-dimensional embeddings.`
      );
    } else if (noiseRatio > this.config.maxNoiseRatioWarning) {
      status = 'DEGRADED_NOISY_CONTEXT';
      recommendations.push(
        `Context noise ratio (${(noiseRatio * 100).toFixed(1)}%) breaches ceiling (${(this.config.maxNoiseRatioWarning * 100).toFixed(1)}%). Enable semantic chunk pruning or increase MMR diversity penalty.`
      );
    }

    return {
      totalQueries,
      averageLatencyMs,
      meanRelevance,
      minRelevance: Number(minRelevance.toFixed(4)),
      hitRateAtK,
      mrr,
      noiseRatio,
      status,
      recommendations,
    };
  }

  public getHistoryLength(): number {
    return this.history.length;
  }

  public reset(): void {
    this.history = [];
  }
}
