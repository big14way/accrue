# D4 — Verdicts are bound to the submitted hash and to authorised sources

Ran 2026-09-19T16:33:25.476Z — **PASS**

| Step | Result | Detail | Tx |
|---|---|---|---|
| client creates job | ✓ | jobId 4 | [0x1ecb9e21…](https://testnet.monadexplorer.com/tx/0x1ecb9e21e7ee4a6fdaf6a7dce8d862a02e26f3c8e39b5a1d15cf5c66656d9af7) |
| provider quotes | ✓ |  | [0x73149182…](https://testnet.monadexplorer.com/tx/0x7314918254c71c18de7649135e9fc272dc138024146f86b4c90a682a0e4cd3c6) |
| client funds | ✓ |  | [0x86329dd8…](https://testnet.monadexplorer.com/tx/0x86329dd845055096c702d46a36dc50608316416cf75e7dc6f28fb28142605907) |
| provider submits REAL hash | ✓ |  | [0x3b362607…](https://testnet.monadexplorer.com/tx/0x3b3626071277b06014c1a5f22e8dc171fd9d2904a41f85391788d3dc092e8a27) |
| committee attests OK for a DIFFERENT hash | ✓ | refused on chain: The attested deliverable (0xbb2c68…346c) does not match what the provider submitted (0x43d303…ed59). [DeliverableMismatch] |  |
| non-member tries to attest | ✓ | refused: The caller is not on the evaluator committee. [NotMember] |  |
| non-forwarder tries to deliver a CRE report | ✓ | refused: Only the Chainlink CRE forwarder can deliver reports. [NotForwarder] |  |
| honest attestation for the real hash by 0x254334 | ✓ |  | [0xffdedf5a…](https://testnet.monadexplorer.com/tx/0xffdedf5aa92e1fd3f77a41c1dd6f2d58a5a785e4f733e33f07a29786bdf0d5a9) |
| job completed only through the correct hash | ✓ | status Completed |  |

- **jobId**: 4
