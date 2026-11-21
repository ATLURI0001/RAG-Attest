/**
 * AEGIS-EDGE Token Entropy & Loop Detection Tests
 */

import { TokenEntropyGuard } from '../src/core/entropy.ts';

export function runEntropyTests(): boolean {
  console.log('  Testing TokenEntropyGuard & Lexical Diversity...');

  // Test 1: Empty and degenerate payloads
  const emptyRes = TokenEntropyGuard.analyze('');
  if (emptyRes.tokenCount !== 0 || emptyRes.perplexity !== 1.0) {
    throw new Error('Failed to handle empty input cleanly');
  }

  // Test 2: Natural diverse language
  const naturalText =
    'The quick brown fox jumps over the lazy dog in the middle of a sunlit forest clearing.';
  const naturalProfile = TokenEntropyGuard.analyze(naturalText);
  if (naturalProfile.tokenCount <= 0 || naturalProfile.shannonEntropy <= 0) {
    throw new Error('Failed to compute Shannon entropy on natural text');
  }
  if (naturalProfile.isDegenerateLoop) {
    throw new Error('False positive degenerate loop detected on natural text');
  }

  // Test 3: Severe repetitive loop collapse (temperature collapse anomaly)
  const loopText =
    'repeat this sentence repeat this sentence repeat this sentence repeat this sentence repeat this sentence';
  const loopProfile = TokenEntropyGuard.analyze(loopText, { loopThreshold: 0.5 });
  if (!loopProfile.isDegenerateLoop) {
    throw new Error('Failed to detect obvious degenerate token loop');
  }
  if (loopProfile.repetitionIndex <= 0.5) {
    throw new Error(`Repetition index too low: ${loopProfile.repetitionIndex}`);
  }

  // Test 4: Helper isLooping
  if (!TokenEntropyGuard.isLooping(loopText, 0.5)) {
    throw new Error('isLooping helper returned false for looping sequence');
  }
  if (TokenEntropyGuard.isLooping(naturalText)) {
    throw new Error('isLooping helper returned true for natural text');
  }

  // Test 5: Perplexity calculation verification: PPL = 2^H
  const calcPpl = Math.round(Math.pow(2, naturalProfile.shannonEntropy) * 1e2) / 1e2;
  if (Math.abs(calcPpl - naturalProfile.perplexity) > 0.05) {
    throw new Error(`Perplexity mismatch: ${calcPpl} vs ${naturalProfile.perplexity}`);
  }

  console.log('  ✓ TokenEntropyGuard tests PASSED');
  return true;
}

if (import.meta.url.endsWith(process.argv[1] || '')) {
  runEntropyTests();
}
