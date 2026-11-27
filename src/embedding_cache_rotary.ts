export class EmbeddingCacheRotary {
  private readonly hits: number[] = [];
  private readonly cap: number;

  constructor(cap = 32) {
    this.cap = cap;
  }

  record(hitRatio: number): void {
    if (hitRatio < 0 || hitRatio > 1) throw new Error('hitRatio must be in [0, 1]');
    if (this.hits.length >= this.cap) this.hits.shift();
    this.hits.push(hitRatio);
  }

  avgHitRatio(): number {
    if (!this.hits.length) return 0;
    return this.hits.reduce((a, b) => a + b, 0) / this.hits.length;
  }
}
