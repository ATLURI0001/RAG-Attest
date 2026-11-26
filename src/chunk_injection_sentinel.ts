export function assertCleanChunk(chunk: string): void {
  const lowered = chunk.toLowerCase();
  const patterns = ['ignore previous instructions', 'system prompt:', '<|im_start|>'];
  for (const p of patterns) {
    if (lowered.includes(p)) {
      throw new Error(`Chunk injection sentinel triggered: detected "${p}"`);
    }
  }
}
