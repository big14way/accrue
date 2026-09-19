# D1 — Stale delivery refused on chain, deadline miss auto-refunded

Ran 2026-09-19T16:30:25.280Z — **PASS**

| Step | Result | Detail | Tx |
|---|---|---|---|
| client creates job with minFreshnessBlock = latest and a 90 s deadline | ✓ | jobId 1 | [0x788fbe81…](https://testnet.monadexplorer.com/tx/0x788fbe815776a6d73efd3aece0d947a788c739257a95ed8c70a683018d111f12) |
| provider quotes budget | ✓ |  | [0xf026bc30…](https://testnet.monadexplorer.com/tx/0xf026bc308776bb5f9f4b16ef769f8086577369d7cb16eb149058a3440a656645) |
| client funds → budget goes into the yield vault | ✓ |  | [0xb62c581d…](https://testnet.monadexplorer.com/tx/0xb62c581dde5b88902dca7b166d725c689469ac4dc5045ba9867290322b1a2da3) |
| provider submits data from block 63930112 (< committed 63930132) | ✓ | refused on chain: Stale data: the job requires data from block 63930132 or later, but the delivery is from block 63930112. [StaleData] |  |
| job is still Funded; nothing moved | ✓ | status Funded, escrow shares 1000000000 |  |
| anyone enforces the deadline → reject → refund in one tx | ✓ | block 63930515 | [0x6d2b0e0a…](https://testnet.monadexplorer.com/tx/0x6d2b0e0abfc9b4a2b34f49e4c0f6e675174acb97137f7efea5620524a11d2442) |
| client refunded principal + accrued yield | ✓ | status Rejected; client balance 100000 → 100000.000288 tUSD; yield preview before settle 0.000281 |  |

- **jobId**: 1
- **escrow**: 0xF39D05c6DBf186c2c1DC17392C642394F54DC171
- **budget**: 1000 tUSD
