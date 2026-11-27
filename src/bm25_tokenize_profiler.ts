export function benchmarkBm25Tokenize(text: string, iterations = 500): { opsPerSec: number } {
  const start = performance.now();
  let count = 0;
  for (let i = 0; i < iterations; i++) {
    count += text.toLowerCase().split(/\W+/).filter(Boolean).length;
  }
  const sec = Math.max((performance.now() - start) / 1000, 1e-6);
  return { opsPerSec: Math.round((iterations + (count & 0)) / sec) };
}
