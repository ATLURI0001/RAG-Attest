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
  private static lastCpuUsage: NodeJS.CpuUsage | null = null;
  private static lastCpuTime: number = Date.now();

  /**
   * Take a live snapshot of host edge resources with dynamic CPU usage tracking.
   */
  static getResourceSnapshot(): SystemResourceProfile {
    const mem = process.memoryUsage();
    let cpuPct = 0.0;

    const now = Date.now();
    const currentCpu = process.cpuUsage();
    if (this.lastCpuUsage) {
      const elapsedMs = now - this.lastCpuTime;
      if (elapsedMs > 0) {
        const userDiffMicros = currentCpu.user - this.lastCpuUsage.user;
        const systemDiffMicros = currentCpu.system - this.lastCpuUsage.system;
        const totalDiffMs = (userDiffMicros + systemDiffMicros) / 1000;
        cpuPct = Math.min(100.0, Math.round((totalDiffMs / elapsedMs) * 1000) / 10);
      }
    }
    this.lastCpuUsage = currentCpu;
    this.lastCpuTime = now;

    return {
      memoryRssMb: Math.round((mem.rss / 1024 / 1024) * 10) / 10,
      memoryHeapUsedMb: Math.round((mem.heapUsed / 1024 / 1024) * 10) / 10,
      cpuUsagePct: cpuPct,
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
