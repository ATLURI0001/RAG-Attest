import assert from 'node:assert/strict';
import { GroundingVerifier, type ContextChunk } from '../src/core/grounding_verifier.ts';

export function runGroundingVerifierTests() {
  console.log('  Testing Context Grounding Verification Protocol & Citation Anchors...');
  const verifier = new GroundingVerifier();

  const chunks: ContextChunk[] = [
    {
      id: 'chunk_1',
      text: 'The solar photovoltaic array converts sunlight directly into electricity using semiconductor silicon cells.',
    },
    {
      id: 'chunk_2',
      text: 'Lithium iron phosphate (LiFePO4) batteries provide high thermal stability and a cycle life exceeding 3000 charge cycles.',
    },
  ];

  // 1. Fully grounded response with accurate claims
  {
    const response =
      'Solar photovoltaic arrays convert sunlight into electricity using silicon semiconductors. Lithium iron phosphate batteries provide high thermal stability.';
    const attestation = verifier.verifyResponse(response, chunks);

    assert.equal(attestation.isCompliant, true);
    assert.equal(attestation.totalClaims, 2);
    assert.equal(attestation.fullyGroundedCount, 2);
    assert.equal(attestation.unsupportedCount, 0);
    assert.ok(attestation.overallGroundingScore > 0.75);
  }

  // 2. Unsupported hallucinated response
  {
    const hallucination =
      'Quantum entanglement allows warp engines to traverse hyperspace faster than light velocity.';
    const attestation = verifier.verifyResponse(hallucination, chunks);

    assert.equal(attestation.isCompliant, false);
    assert.equal(attestation.unsupportedCount, 1);
    assert.equal(attestation.claims[0].verdict, 'UNSUPPORTED');
  }

  // 3. Citation anchor extraction and validation
  {
    const sentenceWithCitations = 'Solar panels produce power [chunk_1], but cold fusion is practical [chunk_99].';
    const refs = verifier.extractCitationRefs(sentenceWithCitations);
    assert.deepEqual(refs, ['chunk_1', 'chunk_99']);
  }

  // 4. Empty and conversational edge cases
  {
    const emptyAttestation = verifier.verifyResponse('', chunks);
    assert.equal(emptyAttestation.isCompliant, true);
    assert.equal(emptyAttestation.totalClaims, 0);
  }

  console.log('    ✔ Grounding verification, claim classification, and citation anchors verified.');
}
