export interface CitationAnchor {
  docId: string;
  startOffset: number;
  endOffset: number;
}

export function validateCitationAnchor(anchor: CitationAnchor): void {
  if (!anchor.docId) throw new Error('Contract violation: docId is required');
  if (anchor.startOffset < 0 || anchor.endOffset <= anchor.startOffset) {
    throw new Error('Contract violation: invalid citation offsets');
  }
}
