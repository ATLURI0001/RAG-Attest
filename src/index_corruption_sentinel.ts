/**
 * AEGIS-RAG-EDGE - INC-2026-AEGIS-4401 Vector Index Corruption Sentinel
 *
 * Incident Sentinel for INC-2026-AEGIS-4401: Memory-mapped vector index corruption,
 * truncated header buffers, dimension desyncs, and out-of-bounds vector offset dereferences.
 */

export const INDEX_MAGIC = 0x41454749; // "AEGI" in ASCII big-endian
export const CURRENT_INDEX_VERSION = 1;
export const HEADER_SIZE_BYTES = 64;

export const METRIC_TYPES = Object.freeze({
  COSINE: 1,
  L2: 2,
  DOT_PRODUCT: 3,
});

export class IndexCorruptionError extends Error {
  code: string;
  details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(`[INC-2026-AEGIS-4401][${code}] ${message}`);
    this.name = 'IndexCorruptionError';
    this.code = code;
    this.details = details;
  }
}

export interface IndexHeaderInfo {
  magic: number;
  version: number;
  dimensions: number;
  vectorCount: number;
  metricType: number;
  payloadOffset: number;
  expectedByteLength: number;
  actualByteLength: number;
  checksum: number;
}

export interface IndexValidationResult {
  valid: boolean;
  header: IndexHeaderInfo;
  vectorDataOffset: number;
  warnings: string[];
}

/**
 * Computes a 32-bit CRC-like checksum over index byte payloads.
 */
export function computeIndexChecksum(buffer: Uint8Array, offset: number, length: number): number {
  let crc = 0xffffffff;
  for (let i = 0; i < length; i++) {
    const byte = buffer[offset + i];
    crc ^= byte;
    for (let j = 0; j < 8; j++) {
      if ((crc & 1) !== 0) {
        crc = (crc >>> 1) ^ 0xedb88320;
      } else {
        crc >>>= 1;
      }
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Inspects binary vector index buffer against INC-2026-AEGIS-4401 corruptions.
 */
export function inspectVectorIndexBuffer(
  buffer: Uint8Array,
  options: { maxAllowedDimensions?: number; maxAllowedVectors?: number; verifyChecksum?: boolean } = {}
): IndexValidationResult {
  if (!buffer || !(buffer instanceof Uint8Array)) {
    throw new IndexCorruptionError('ERR_INVALID_BUFFER', 'Input index must be a non-null Uint8Array');
  }

  const maxDims = options.maxAllowedDimensions ?? 4096;
  const maxVecs = options.maxAllowedVectors ?? 1000000;

  if (buffer.length < HEADER_SIZE_BYTES) {
    throw new IndexCorruptionError(
      'ERR_TRUNCATED_HEADER',
      `Buffer size ${buffer.length}B is smaller than minimum required header (${HEADER_SIZE_BYTES}B)`
    );
  }

  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  const magic = view.getUint32(0, false); // Big endian
  if (magic !== INDEX_MAGIC) {
    throw new IndexCorruptionError(
      'ERR_CORRUPT_MAGIC',
      `Magic bytes 0x${magic.toString(16)} do not match expected 'AEGI' (0x${INDEX_MAGIC.toString(16)})`
    );
  }

  const version = view.getUint16(4, false);
  if (version !== CURRENT_INDEX_VERSION) {
    throw new IndexCorruptionError(
      'ERR_UNSUPPORTED_VERSION',
      `Index version ${version} is unsupported (expected ${CURRENT_INDEX_VERSION})`
    );
  }

  const metricType = view.getUint16(6, false);
  if (metricType < 1 || metricType > 3) {
    throw new IndexCorruptionError('ERR_INVALID_METRIC_TYPE', `Unknown metric type ${metricType}`);
  }

  const dimensions = view.getUint32(8, false);
  if (dimensions < 1 || dimensions > maxDims) {
    throw new IndexCorruptionError(
      'ERR_DIMENSION_OUT_OF_BOUNDS',
      `Dimensions ${dimensions} outside allowable range [1..${maxDims}]`
    );
  }

  const vectorCount = view.getUint32(12, false);
  if (vectorCount > maxVecs) {
    throw new IndexCorruptionError(
      'ERR_VECTOR_COUNT_EXCEEDED',
      `Vector count ${vectorCount} exceeds safety ceiling ${maxVecs}`
    );
  }

  const payloadOffset = view.getUint32(16, false);
  if (payloadOffset < HEADER_SIZE_BYTES) {
    throw new IndexCorruptionError(
      'ERR_INVALID_PAYLOAD_OFFSET',
      `Payload offset ${payloadOffset} overlaps header section`
    );
  }

  const storedChecksum = view.getUint32(20, false);

  // Vector payload size = vectorCount * dimensions * 4 bytes (Float32)
  const bytesPerVector = dimensions * 4;
  const totalVectorPayloadBytes = vectorCount * bytesPerVector;
  const expectedByteLength = payloadOffset + totalVectorPayloadBytes;

  if (buffer.length < expectedByteLength) {
    throw new IndexCorruptionError(
      'ERR_TRUNCATED_VECTOR_PAYLOAD',
      `Truncated index file: actual size ${buffer.length}B, expected ${expectedByteLength}B for ${vectorCount} vectors of dim ${dimensions}`,
      { actual: buffer.length, expected: expectedByteLength, vectorCount, dimensions }
    );
  }

  const warnings: string[] = [];
  if (buffer.length > expectedByteLength) {
    warnings.push(`Trailing padding or extraneous data detected (${buffer.length - expectedByteLength} trailing bytes)`);
  }

  if (options.verifyChecksum && storedChecksum !== 0) {
    const computed = computeIndexChecksum(buffer, payloadOffset, totalVectorPayloadBytes);
    if (computed !== storedChecksum) {
      throw new IndexCorruptionError(
        'ERR_CHECKSUM_MISMATCH',
        `Checksum mismatch: stored 0x${storedChecksum.toString(16)}, computed 0x${computed.toString(16)}`
      );
    }
  }

  const header: IndexHeaderInfo = {
    magic,
    version,
    dimensions,
    vectorCount,
    metricType,
    payloadOffset,
    expectedByteLength,
    actualByteLength: buffer.length,
    checksum: storedChecksum,
  };

  return {
    valid: true,
    header,
    vectorDataOffset: payloadOffset,
    warnings,
  };
}

/**
 * Safely extracts a vector slice by index with strict memory-mapped boundary guards.
 */
export function safeGetVectorSlice(
  buffer: Uint8Array,
  vectorIdx: number,
  dimensions: number,
  payloadOffset: number = HEADER_SIZE_BYTES
): Float32Array {
  const bytesPerVector = dimensions * 4;
  const byteOffset = payloadOffset + vectorIdx * bytesPerVector;

  if (byteOffset < 0 || byteOffset + bytesPerVector > buffer.length) {
    throw new IndexCorruptionError(
      'ERR_VECTOR_ACCESS_OUT_OF_BOUNDS',
      `Vector index ${vectorIdx} byte range [${byteOffset}..${byteOffset + bytesPerVector}] extends past buffer length ${buffer.length}`
    );
  }

  // Ensure 4-byte memory alignment
  const sliceBuffer = buffer.buffer.slice(
    buffer.byteOffset + byteOffset,
    buffer.byteOffset + byteOffset + bytesPerVector
  );
  return new Float32Array(sliceBuffer);
}
