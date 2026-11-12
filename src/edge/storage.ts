/**
 * AEGIS-EDGE: Sovereign Edge RAG Evaluation Engine
 * Embedded WAL (Write-Ahead Log) & In-Memory Ring Buffer Storage
 */

import * as fs from 'fs';
import * as path from 'path';
import type { EvaluationResult, EvaluationBatchSummary } from '../core/types.ts';

export class EdgeStorage {
  private logFilePath: string;
  private ringBuffer: EvaluationResult[] = [];
  private capacity: number;

  constructor(baseDir: string = './data', capacity: number = 200) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new Error(`EdgeStorage capacity must be a positive integer, got ${capacity}`);
    }
    this.capacity = capacity;
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }
    this.logFilePath = path.join(baseDir, 'aegis_wal.jsonl');
    this.loadRecentFromLog();
  }

  /**
   * Append an evaluation result to the write-ahead log and ring buffer.
   */
  append(result: EvaluationResult): void {
    // Add to ring buffer
    this.ringBuffer.unshift(result);
    if (this.ringBuffer.length > this.capacity) {
      this.ringBuffer.pop();
    }

    // Persist to WAL (Append-Only JSONL)
    const line = JSON.stringify(result) + '\n';
    try {
      fs.appendFileSync(this.logFilePath, line, 'utf-8');
    } catch (err) {
      console.error('[Aegis Storage Error] Failed to append to WAL:', err);
    }
  }

  /**
   * Retrieve the most recent N evaluation records from memory.
   */
  getRecent(limit: number = 50): EvaluationResult[] {
    if (!Number.isFinite(limit) || limit <= 0) {
      return [];
    }
    return this.ringBuffer.slice(0, Math.floor(limit));
  }

  /**
   * Compute aggregated statistics and latency percentiles over recorded runs.
   */
  getSummary(): EvaluationBatchSummary {
    const list = this.ringBuffer;
    if (list.length === 0) {
      return {
        totalCount: 0,
        averageTriad: { contextPrecision: 0, groundedness: 0, answerRelevance: 0 },
        averageOverall: 0,
        hallucinationRate: 0,
        latencyPercentiles: { p50: 0, p95: 0, p99: 0, min: 0, max: 0, avg: 0 },
        totalClaimsEvaluated: 0,
        entailedClaimsRatio: 0,
        results: []
      };
    }

    let sumPrecision = 0;
    let sumGroundedness = 0;
    let sumRelevance = 0;
    let sumOverall = 0;
    let hallucinatedRuns = 0;
    let totalClaims = 0;
    let entailedClaims = 0;
    const latencies: number[] = [];

    for (const r of list) {
      sumPrecision += r.triad.contextPrecision;
      sumGroundedness += r.triad.groundedness;
      sumRelevance += r.triad.answerRelevance;
      sumOverall += r.overallScore;

      if (r.extended.hallucinationRisk > 0.35 || r.status === 'UNSAFE') {
        hallucinatedRuns++;
      }

      for (const c of r.claims) {
        totalClaims++;
        if (c.status === 'ENTAILED') entailedClaims++;
      }

      latencies.push(r.efficiency.latencyMs);
    }

    latencies.sort((a, b) => a - b);
    const n = latencies.length;
    const p50 = latencies[Math.floor(n * 0.50)] || 0;
    const p95 = latencies[Math.floor(n * 0.95)] || 0;
    const p99 = latencies[Math.floor(n * 0.99)] || 0;
    const min = latencies[0] || 0;
    const max = latencies[n - 1] || 0;
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / n;

    return {
      totalCount: n,
      averageTriad: {
        contextPrecision: Math.round((sumPrecision / n) * 1000) / 1000,
        groundedness: Math.round((sumGroundedness / n) * 1000) / 1000,
        answerRelevance: Math.round((sumRelevance / n) * 1000) / 1000
      },
      averageOverall: Math.round((sumOverall / n) * 1000) / 1000,
      hallucinationRate: Math.round((hallucinatedRuns / n) * 1000) / 1000,
      latencyPercentiles: {
        p50: Math.round(p50),
        p95: Math.round(p95),
        p99: Math.round(p99),
        min: Math.round(min),
        max: Math.round(max),
        avg: Math.round(avgLatency)
      },
      totalClaimsEvaluated: totalClaims,
      entailedClaimsRatio: totalClaims > 0 ? Math.round((entailedClaims / totalClaims) * 1000) / 1000 : 1.0,
      results: list.slice(0, 20)
    };
  }

  private loadRecentFromLog(): void {
    if (!fs.existsSync(this.logFilePath)) return;
    try {
      const data = fs.readFileSync(this.logFilePath, 'utf-8');
      const lines = data.split('\n').filter(l => l.trim().length > 0);
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line) as EvaluationResult;
          if (
            parsed &&
            typeof parsed === 'object' &&
            parsed.triad &&
            parsed.extended &&
            parsed.efficiency &&
            Array.isArray(parsed.claims)
          ) {
            this.ringBuffer.unshift(parsed);
            if (this.ringBuffer.length > this.capacity) {
              this.ringBuffer.pop();
            }
          }
        } catch {
          // ignore corrupted lines
        }
      }
    } catch (err) {
      console.warn('[Aegis Storage] Could not read existing WAL:', err);
    }
  }
}
