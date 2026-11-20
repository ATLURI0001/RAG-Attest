/**
 * AEGIS-EDGE EdgeTelemetry Unit Test Suite
 */

import { EdgeTelemetry } from '../src/edge/telemetry.ts';

export function runTelemetryTests(): boolean {
  console.log('  Testing EdgeTelemetry Profiler & Hardware Snapshot...');

  // 1. Initial snapshot check
  const snap1 = EdgeTelemetry.getResourceSnapshot();
  if (snap1.memoryRssMb <= 0 || snap1.memoryHeapUsedMb <= 0) {
    throw new Error('Expected positive memory RSS and heap values');
  }
  if (typeof snap1.nodeVersion !== 'string' || !snap1.nodeVersion.startsWith('v')) {
    throw new Error('Expected valid nodeVersion in snapshot');
  }
  if (snap1.uptimeSeconds < 0) {
    throw new Error('Expected non-negative uptimeSeconds');
  }

  // 2. Compute a synthetic workload to trigger CPU consumption
  let sum = 0;
  for (let i = 0; i < 2_000_000; i++) {
    sum += Math.sqrt(i);
  }

  const snap2 = EdgeTelemetry.getResourceSnapshot();
  if (snap2.cpuUsagePct < 0 || snap2.cpuUsagePct > 100) {
    throw new Error(`cpuUsagePct out of bounds [0, 100]: got ${snap2.cpuUsagePct}`);
  }

  return true;
}
