export class RerankLatencyRotary {
  private readonly samples: number[] = [];
  private readonly cap: number;

  constructor(cap = 32) {
    this.cap = cap;
  }

  record(ms: number): void {
    if (ms < 0) throw new Error('ms must be non-negative');
    if (this.samples.length >= this.cap) this.samples.shift();
    this.samples.push(ms);
  }

  avgMs(): number {
    if (!this.samples.length) return 0;
    return this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
  }
}
