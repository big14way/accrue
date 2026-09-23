# D1 — Stale delivery refused on chain, deadline miss auto-refunded

Ran 2026-09-23T08:42:17.982Z — **PASS**

| Step | Result | Detail | Tx |
|---|---|---|---|
| client creates job with minFreshnessBlock = latest and a 90 s deadline | ✓ | jobId 2 | [0xc86bd49e…](https://testnet.monadexplorer.com/tx/0xc86bd49e8057c8e3377833a277ace369ec7b9ddf99cfa8a0994adea0e0fffb6d) |
| provider quotes budget | ✓ |  | [0x713855a9…](https://testnet.monadexplorer.com/tx/0x713855a967635941f7485d7496600b06df2fb95ea343161f04828093145f51a0) |
| client funds → budget goes into the yield vault | ✓ |  | [0xbda32875…](https://testnet.monadexplorer.com/tx/0xbda328753efae3237fb0766210e786ede18f7919359d2afece03a68a209f5066) |
| provider submits data from block 64969930 (< committed 64969950) | ✓ | refused on chain: Stale data: the job requires data from block 64969950 or later, but the delivery is from block 64969930. [StaleData] |  |
| job is still Funded; nothing moved | ✓ | status Funded, escrow shares 999999976 |  |
| anyone enforces the deadline → reject → refund in one tx | ✓ | block 64970293 | [0x3be39abd…](https://testnet.monadexplorer.com/tx/0x3be39abd8edc151c139e11c36cb86f5b741b1b5fd2c968f0f938515e64bf8f8d) |
| client refunded principal + accrued yield | ✓ | status Rejected; client balance 9000 → 9000.000278 AUSD; yield preview before settle 0.000275 |  |

- **jobId**: 2
- **escrow**: 0x44F29EEF182180B8ae93dc6765f20eC9B3Ee7366
- **budget**: 1000 AUSD
