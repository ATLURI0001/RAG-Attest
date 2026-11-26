/**
 * Embedding Model API Timeout & Sparse Fallback Circuit Breaker.
 */
export class EmbeddingApiCircuitBreaker {
  private failures = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private tripTime = 0;
  private readonly threshold: number;
  private readonly cooldownMs: number;

  constructor(threshold = 3, cooldownMs = 1000) {
    this.threshold = threshold;
    this.cooldownMs = cooldownMs;
  }

  public embed(text: string, remoteFn: (t: string) => number[], now = Date.now()): { vector: number[]; fallback: boolean } {
    if (this.state === 'OPEN') {
      if (now - this.tripTime >= this.cooldownMs) {
        this.state = 'HALF_OPEN';
      } else {
        return { vector: [text.length % 10, 0.0, 1.0], fallback: true };
      }
    }

    try {
      const vec = remoteFn(text);
      this.state = 'CLOSED';
      this.failures = 0;
      return { vector: vec, fallback: false };
    } catch {
      this.failures++;
      if (this.state === 'HALF_OPEN' || this.failures >= this.threshold) {
        this.state = 'OPEN';
        this.tripTime = now;
      }
      return { vector: [text.length % 10, 0.0, 1.0], fallback: true };
    }
  }

  public getState(): string {
    return this.state;
  }
}
