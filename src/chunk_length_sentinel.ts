export class ChunkLengthSentinel {
  private readonly maxLen: number;
  private violations = 0;

  constructor(maxLen = 2048) {
    this.maxLen = maxLen;
  }

  check(chunk: string): boolean {
    if (chunk.length > this.maxLen) {
      this.violations++;
      return false;
    }
    return true;
  }

  violationCount(): number {
    return this.violations;
  }
}
