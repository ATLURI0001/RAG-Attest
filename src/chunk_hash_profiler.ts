export function profileChunkHash(chunks: string[], rounds = 100): { totalMs: number; hashed: number } {
  const start = performance.now();
  let acc = 0;
  for (let r = 0; r < rounds; r++) {
    for (const c of chunks) {
      acc = (acc * 31 + c.length) | 0;
    }
  }
  void acc;
  return { totalMs: Math.max(0, performance.now() - start), hashed: chunks.length * rounds };
}
