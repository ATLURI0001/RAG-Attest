export function assertNoBidiControlChars(text: string): void {
  if (/[\u202A-\u202E\u2066-\u2069]/.test(text)) {
    throw new Error('Unicode sentinel violation: bidirectional override control character detected');
  }
}
