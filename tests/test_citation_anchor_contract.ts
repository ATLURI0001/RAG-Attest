import assert from 'node:assert/strict';
import { validateCitationAnchor } from '../src/citation_anchor_contract.ts';

export function runCitationAnchorContractTests(): boolean {
  validateCitationAnchor({ docId: 'doc-1', startOffset: 0, endOffset: 10 });
  assert.throws(() => validateCitationAnchor({ docId: '', startOffset: 0, endOffset: 10 }));
  assert.throws(() => validateCitationAnchor({ docId: 'doc-1', startOffset: 10, endOffset: 5 }));
  console.log('✓ CitationAnchorContract tests passed');
  return true;
}
