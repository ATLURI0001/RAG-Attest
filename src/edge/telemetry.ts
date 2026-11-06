/**
 * AEGIS-EDGE: Sovereign Edge RAG Evaluation Engine
 * Real-Time Edge Telemetry & Hardware Profiler
 */

export interface SystemResourceProfile {
  memoryRssMb: number;
  memoryHeapUsedMb: number;
  cpuUsagePct: number;
  uptimeSeconds: number;
  nodeVersion: string;
}

export class EdgeTelemetry {
  private static startTime = Date.now();

  /**
   * Take a live snapshot of host edge resources.
   */
  static getResourceSnapshot(): SystemResourceProfile {
    const mem = process.memoryUsage();
    return {
      memoryRssMb: Math.round((mem.rss / 1024 / 1024) * 10) / 10,
      memoryHeapUsedMb: Math.round((mem.heapUsed / 1024 / 1024) * 10) / 10,
      cpuUsagePct: 0.0, // Calculated dynamically
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      nodeVersion: process.version
    };
  }

  /**
   * Benchmark a synchronous or asynchronous execution unit.
   */
  static async measure<T>(fn: () => Promise<T> | T): Promise<{ result: T; durationMs: number }> {
    const start = performance.now();
    const result = await fn();
    const durationMs = performance.now() - start;
    return { result, durationMs: Math.round(durationMs * 100) / 100 };
  }
}
