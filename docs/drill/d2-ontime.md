# D2 — On-time delivery settles three legs in one transaction

Ran 2026-09-23T08:42:59.969Z — **PASS**

| Step | Result | Detail | Tx |
|---|---|---|---|
| client creates job (yield policy 50/40/10 client/provider/protocol) | ✓ | jobId 3 | [0x21638eaf…](https://testnet.monadexplorer.com/tx/0x21638eaf0db6caca9774843ff0eaa66cf363c5fa49c90aeeb39147e0dc31747a) |
| provider quotes budget | ✓ |  | [0xf0e843ab…](https://testnet.monadexplorer.com/tx/0xf0e843abb5cd24cfe04c6f9248e54b528104e0eb95c716333b2e781252fdaafc) |
| client funds → vault | ✓ |  | [0xba79c3dd…](https://testnet.monadexplorer.com/tx/0xba79c3ddcda210118edb460d01b3ab990505173c043fbc5a7bd00c82c23d9e88) |
| yield accrued while funded | ✓ | 0.000088 AUSD on 1000 |  |
| provider submits fresh deliverable | ✓ |  | [0x64d918ea…](https://testnet.monadexplorer.com/tx/0x64d918eab1e0d1d12cfe491536d508de99df86ae2f09a87a2e9370791de668aa) |
| committee member 0x254334 attests OK | ✓ |  | [0x26520480…](https://testnet.monadexplorer.com/tx/0x26520480c944f6b65bf9c6afc14a765c8275ec6853859b9572b38b40fc3ee1a3) |
| one tx: provider paid principal + 40 % of yield, client 50 %, protocol 10 % | ✓ | provider +1000.000038, client +0.000048, treasury +0.000009 AUSD |  |
| decoded settlement events | ✓ | Committee vote 1 recorded by 0x254334Ca01a8ebD58D1a34d6cb939142978D9B7F. · Transfer · Transfer · Withdraw · Yield realised: 0.000095 (client 0.000048, provider 0.000038, protocol 0.000009); principal 1000. · Transfer · Transfer · Transfer · Paid 1000.000038 to 0x862599685b69a22D7108C8641679bfc2E12C879E. · Job #3 completed by evaluator 0x84d977302De3241b45BbA77A6C27321e5DcA3a2A. · Reputation registry recorded feedback 100 for agent #1891 (accrue:sla/on-time). · ERC-8004 feedback written for agent #1891: 100 (on-time). · Evaluator verdict OK via committee. | [0x26520480…](https://testnet.monadexplorer.com/tx/0x26520480c944f6b65bf9c6afc14a765c8275ec6853859b9572b38b40fc3ee1a3) |

- **jobId**: 3
- **budget**: 1000 AUSD
