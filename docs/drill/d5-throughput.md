# D5 — 20 jobs funded and settled back to back on Monad

Ran 2026-09-23T07:37:45.590Z — **PASS**

| Step | Result | Detail | Tx |
|---|---|---|---|
| 20 jobs created, funded, submitted, attested | ✓ | 20/20 Completed; 141 txs; 262.0 s active chain time (407.0 s span, 1 idle gap of 145 s excluded); blocks 64955202→64956551 (1349 blocks); total gas 39387648 |  |

- **jobs**: 20
- **jobIds**: 24–43
- **txCount**: 141
- **wallClockMs**: 262000
- **spanMs**: 407000
- **idleGaps**: `[{"afterBlock":"64956064","seconds":145}]`
- **txPerSecond**: 0.54
- **blocksSpanned**: 1349
- **fundingBlocks**: 372
- **totalGas**: 39387648
- **avgGasPerTx**: 279345
- **gasByActor**: `{"client":{"txs":81,"gas":"15800128"},"provider":{"txs":40,"gas":"7583916"},"attestor":{"txs":20,"gas":"16003604"}}`
- **budgetEach**: 10 tUSD
- **poolAfter**: `{"totalAssets":"99460000000","cash":"99460000000","outstandingPrincipal":"0","totalBonds":"0","realisedInterest":"0","totalShortfall":"540000000","advancesCount":2,"defaultsCount":2,"utilisationBps":0,"cap":"1000000000","shareSupply":"100000000000","sharePrice":0.9946}`

Measured from the chain after the run: every transaction the client, provider and attestor wallets sent between the
first job's creation (block 64955202) and the last settlement (block 64956551); gas is what Monad charged (the gas
limit); time is block timestamps. The run was interrupted once — the attestor wallet ran out of MON after 18
settlements and was refuelled — so the idle gap is listed above and excluded from the throughput figure. Transactions
are sent one after another, each waiting for its receipt, so the figure is the RPC round trip, not the chain's limit.
