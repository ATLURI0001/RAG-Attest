/**
 * Unit tests for INC-2026-AEGIS-4401 Vector Index Corruption Sentinel
 */

import {
  INDEX_MAGIC,
  CURRENT_INDEX_VERSION,
  HEADER_SIZE_BYTES,
  METRIC_TYPES,
  IndexCorruptionError,
  inspectVectorIndexBuffer,
  safeGetVectorSlice,
  computeIndexChecksum,
} from '../src/index_corruption_sentinel.ts';

function createMockIndexBuffer(options: {
  magic?: number;
  version?: number;
  metricType?: number;
  dimensions?: number;
  vectorCount?: number;
  payloadOffset?: number;
  checksum?: number;
  truncateBytes?: number;
}): Uint8Array {
  const magic = options.magic ?? INDEX_MAGIC;
  const version = options.version ?? CURRENT_INDEX_VERSION;
  const metricType = options.metricType ?? METRIC_TYPES.COSINE;
  const dimensions = options.dimensions ?? 4;
  const vectorCount = options.vectorCount ?? 2;
  const payloadOffset = options.payloadOffset ?? HEADER_SIZE_BYTES;

  const vectorBytes = vectorCount * dimensions * 4;
  const totalSize = payloadOffset + vectorBytes - (options.truncateBytes ?? 0);

  const buf = new Uint8Array(totalSize);
  const view = new DataView(buf.buffer);

  view.setUint32(0, magic, false);
  view.setUint16(4, version, false);
  view.setUint16(6, metricType, false);
  view.setUint32(8, dimensions, false);
  view.setUint32(12, vectorCount, false);
  view.setUint32(16, payloadOffset, false);
  view.setUint32(20, options.checksum ?? 0, false);

  // Fill sample vectors if not truncated past payload
  const f32View = new Float32Array(buf.buffer, payloadOffset, Math.min(vectorCount * dimensions, Math.floor((totalSize - payloadOffset) / 4)));
  for (let i = 0; i < f32View.length; i++) {
    f32View[i] = 1.0 + i * 0.1;
  }

  return buf;
}

export function runIndexCorruptionSentinelTests(): boolean {
  console.log('  Testing Vector Index Corruption Sentinel (INC-2026-AEGIS-4401)...');

  // 1. Valid buffer check
  const validBuf = createMockIndexBuffer({ dimensions: 4, vectorCount: 3 });
  const result = inspectVectorIndexBuffer(validBuf);
  if (!result.valid || result.header.dimensions !== 4 || result.header.vectorCount !== 3) {
    throw new Error('Valid vector index buffer inspection failed');
  }

  // 2. Corrupt magic detection
  const corruptMagic = createMockIndexBuffer({ magic: 0xdeadbeef });
  let caughtMagic = false;
  try {
    inspectVectorIndexBuffer(corruptMagic);
  } catch (err: any) {
    if (err instanceof IndexCorruptionError && err.code === 'ERR_CORRUPT_MAGIC') {
      caughtMagic = true;
    }
  }
  if (!caughtMagic) throw new Error('Failed to intercept corrupt magic bytes');

  // 3. Truncated header detection
  const shortBuf = new Uint8Array(32);
  let caughtHeader = false;
  try {
    inspectVectorIndexBuffer(shortBuf);
  } catch (err: any) {
    if (err instanceof IndexCorruptionError && err.code === 'ERR_TRUNCATED_HEADER') {
      caughtHeader = true;
    }
  }
  if (!caughtHeader) throw new Error('Failed to intercept truncated header');

  // 4. Truncated vector payload detection
  const truncatedPayload = createMockIndexBuffer({ dimensions: 4, vectorCount: 5, truncateBytes: 16 });
  let caughtPayload = false;
  try {
    inspectVectorIndexBuffer(truncatedPayload);
  } catch (err: any) {
    if (err instanceof IndexCorruptionError && err.code === 'ERR_TRUNCATED_VECTOR_PAYLOAD') {
      caughtPayload = true;
    }
  }
  if (!caughtPayload) throw new Error('Failed to intercept truncated vector payload');

  // 5. Safe vector slice extraction and out-of-bounds protection
  const testBuf = createMockIndexBuffer({ dimensions: 4, vectorCount: 2 });
  const slice0 = safeGetVectorSlice(testBuf, 0, 4);
  if (slice0.length !== 4) throw new Error('Vector slice size mismatch');

  let caughtOOB = false;
  try {
    safeGetVectorSlice(testBuf, 10, 4); // Index 10 out of bounds
  } catch (err: any) {
    if (err instanceof IndexCorruptionError && err.code === 'ERR_VECTOR_ACCESS_OUT_OF_BOUNDS') {
      caughtOOB = true;
    }
  }
  if (!caughtOOB) throw new Error('Failed to intercept out of bounds vector slice access');

  // 6. Checksum validation
  const ckBuf = createMockIndexBuffer({ dimensions: 2, vectorCount: 2 });
  const view = new DataView(ckBuf.buffer);
  const ck = computeIndexChecksum(ckBuf, HEADER_SIZE_BYTES, 2 * 2 * 4);
  view.setUint32(20, ck, false);

  const ckResult = inspectVectorIndexBuffer(ckBuf, { verifyChecksum: true });
  if (!ckResult.valid) throw new Error('Checksum verification failed');

  // Mismatched checksum
  view.setUint32(20, 0x12345678, false);
  let caughtChecksum = false;
  try {
    inspectVectorIndexBuffer(ckBuf, { verifyChecksum: true });
  } catch (err: any) {
    if (err instanceof IndexCorruptionError && err.code === 'ERR_CHECKSUM_MISMATCH') {
      caughtChecksum = true;
    }
  }
  if (!caughtChecksum) throw new Error('Failed to intercept checksum mismatch');

  console.log('  ✓ VectorIndexCorruptionSentinel INC-2026-AEGIS-4401 tests PASSED');
  return true;
}
