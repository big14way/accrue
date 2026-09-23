# D4 — Verdicts are bound to the submitted hash and to authorised sources

Ran 2026-09-23T08:43:24.673Z — **PASS**

| Step | Result | Detail | Tx |
|---|---|---|---|
| client creates job | ✓ | jobId 5 | [0xc169e697…](https://testnet.monadexplorer.com/tx/0xc169e6975c6ee51af4628f3d5d887af4b3687adc089ff2c75e410ffcdff91341) |
| provider quotes | ✓ |  | [0x67f20d28…](https://testnet.monadexplorer.com/tx/0x67f20d2859ee379d1dc112582731b3b40f3bb3b6d11cba4720190766f182c14b) |
| client funds | ✓ |  | [0x2b4cfabe…](https://testnet.monadexplorer.com/tx/0x2b4cfabe16e4865a3c98e6206f564b07cd6633728345919b45c1b1607ea76461) |
| provider submits REAL hash | ✓ |  | [0x6f1ec7fc…](https://testnet.monadexplorer.com/tx/0x6f1ec7fcf883874bb37b793bd0a8e1b79e18797e41dc212dd6c7279e17012437) |
| committee attests OK for a DIFFERENT hash | ✓ | refused on chain: The attested deliverable (0xbb2c68…346c) does not match what the provider submitted (0x43d303…ed59). [DeliverableMismatch] |  |
| non-member tries to attest | ✓ | refused: The caller is not on the evaluator committee. [NotMember] |  |
| non-forwarder tries to deliver a CRE report | ✓ | refused: Only the Chainlink CRE forwarder can deliver reports. [NotForwarder] |  |
| honest attestation for the real hash by 0x254334 | ✓ |  | [0xb7592c06…](https://testnet.monadexplorer.com/tx/0xb7592c0624c4c8d3ed74e78ef56b80c4ac74bf32e9cdde7864cb27144be8fa6b) |
| job completed only through the correct hash | ✓ | status Completed |  |

- **jobId**: 5
