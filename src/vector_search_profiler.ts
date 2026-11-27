export class VectorSearchProfiler {
  private samples: number[] = [];

  record(ms: number): void {
    this.samples.push(ms);
  }

  avgMs(): number {
    if (!this.samples.length) return 0;
    return this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
  }
}
