/**
 * Document Chunk Deduplication Ratio & Ingestion Savings Telemetry Rotary.
 * 
 * Tracks chunk hash collision rates, redundant bytes eliminated during RAG ingestion,
 * and deduplication processing latency quantiles.
 */

export interface ChunkDedupSample {
  docId: string;
  totalChunks: number;
  dedupedChunks: number;
  savedBytes: number;
  durationMicros: number;
}

export interface ChunkDedupSummary {
  sampleCount: number;
  dedupRatioPct: number;
  totalSavedBytes: number;
  p50Micros: number;
}

export class ChunkDedupRotary {
  private readonly capacity: number;
  private readonly buffer: (ChunkDedupSample | undefined)[];
  private head = 0;
  private count = 0;

  constructor(capacity = 500) {
    this.capacity = Math.max(1, capacity);
    this.buffer = new Array(this.capacity);
  }

  public record(sample: ChunkDedupSample): void {
    this.buffer[this.head] = sample;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count++;
    }
  }

  public getSummary(): ChunkDedupSummary {
    if (this.count === 0) {
      return { sampleCount: 0, dedupRatioPct: 0, totalSavedBytes: 0, p50Micros: 0 };
    }

    let totalChunks = 0;
    let totalDeduped = 0;
    let totalSaved = 0;
    const latencies: number[] = [];

    for (let i = 0; i < this.count; i++) {
      const s = this.buffer[i]!;
      totalChunks += s.totalChunks;
      totalDeduped += s.dedupedChunks;
      totalSaved += s.savedBytes;
      latencies.push(s.durationMicros);
    }

    latencies.sort((a, b) => a - b);
    const ratio = totalChunks > 0 ? (totalDeduped / totalChunks) * 100 : 0;

    return {
      sampleCount: this.count,
      dedupRatioPct: Number(ratio.toFixed(2)),
      totalSavedBytes: totalSaved,
      p50Micros: latencies[Math.floor(this.count * 0.5)],
    };
  }
}
