export function assertContextWithinBudget(totalTokens: number, maxBudget = 8192): void {
  if (totalTokens < 0 || totalTokens > maxBudget) {
    throw new Error(`Context truncation sentinel: ${totalTokens} tokens exceeds budget ${maxBudget}`);
  }
}
