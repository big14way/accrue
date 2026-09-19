# D2 — On-time delivery settles three legs in one transaction

Ran 2026-09-19T16:31:55.595Z — **PASS**

| Step | Result | Detail | Tx |
|---|---|---|---|
| client creates job (yield policy 50/40/10 client/provider/protocol) | ✓ | jobId 2 | [0x95b11789…](https://testnet.monadexplorer.com/tx/0x95b11789c6f4d63ce160bcc3cd4951e4de9fb530d48d3d2893e07de2a03698aa) |
| provider quotes budget | ✓ |  | [0x48451721…](https://testnet.monadexplorer.com/tx/0x4845172102c1c60852e2ed8ead0c1612f62af664b935e8ce01619a859463e982) |
| client funds → vault | ✓ |  | [0x1f97fc04…](https://testnet.monadexplorer.com/tx/0x1f97fc043bc01b3325e2ba26ba29c579a00bd60f7be59783d2aab3d6017cb73d) |
| yield accrued while funded | ✓ | 0.001749 tUSD on 10000 |  |
| provider submits fresh deliverable | ✓ |  | [0xe5bbfd9e…](https://testnet.monadexplorer.com/tx/0xe5bbfd9efe24410b71740b1ca060c97ddff594007460c0137dd7524f80259a39) |
| committee member 0x254334 attests OK | ✓ |  | [0xcaa8d73f…](https://testnet.monadexplorer.com/tx/0xcaa8d73ff2a1ce24f31fedc03cd5dfbd84777f71601b8e72163717de96c48dc1) |
| one tx: provider paid principal + 40 % of yield, client 50 %, protocol 10 % | ✓ | provider +10000.0008, client +0.001, treasury +0.0002 tUSD |  |
| decoded settlement events | ✓ | Committee vote 1 recorded by 0x254334Ca01a8ebD58D1a34d6cb939142978D9B7F. · Transfer · Transfer · Withdraw · Yield realised: 0.002 (client 0.001, provider 0.0008, protocol 0.0002); principal 10000. · Transfer · Transfer · Transfer · Paid 10000.0008 to 0x862599685b69a22D7108C8641679bfc2E12C879E. · Job #2 completed by evaluator 0x2d3a77a7A026d7ce1547fd8eE706309eAC404943. · Reputation registry recorded feedback 100 for agent #1891 (accrue:sla/on-time). · ERC-8004 feedback written for agent #1891: 100 (on-time). · Evaluator verdict OK via committee. | [0xcaa8d73f…](https://testnet.monadexplorer.com/tx/0xcaa8d73ff2a1ce24f31fedc03cd5dfbd84777f71601b8e72163717de96c48dc1) |

- **jobId**: 2
- **budget**: 10000 tUSD
