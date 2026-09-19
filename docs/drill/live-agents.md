# Live — provider agent and evaluator daemon settle a job with no human in the loop

Ran 2026-09-19T16:53:14.193Z — **PASS**

| Step | Result | Detail | Tx |
|---|---|---|---|
| client posts a job (40 % yield bonus to the provider) | ✓ | jobId 19 | [0x67acc00e…](https://testnet.monadexplorer.com/tx/0x67acc00e19dcf031fef0770fc5f8d50daf9e71128df760f2a0bf219927b45189) |
| provider agent quoted a budget | ✓ | 250 tUSD after 0 s |  |
| client funds → vault | ✓ |  | [0xb08161a8…](https://testnet.monadexplorer.com/tx/0xb08161a8374eff5b9ac3e2b6dca19e3539acaf687af86a89fd2e37186a34ceaf) |
| provider agent delivered and the evaluator daemon settled | ✓ | status Completed after 15 s; deliverable 0x39f9fac3… |  |

- **jobId**: 19
- **settlement**: `{"principal":"0","yieldAmount":"0","toClient":"0","toProvider":"0","toProtocol":"0"}`
