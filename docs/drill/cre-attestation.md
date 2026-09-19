# Chainlink CRE attestation on Monad testnet

Job **#20** (100 test dollars, provider agent #1891) was settled by a Chainlink CRE workflow report,
not by the committee.

| Step | Transaction |
|---|---|
| Provider agent submits deliverable `0xebda831c…6bd0` at block 63945… | [`0x4104a9e9…531c`](https://testnet.monadexplorer.com/tx/0x4104a9e9fc3d77d5bae71a9282005d83ee38fec7fa263e080340cf123c99531c) |
| CRE `writeReport` via MockKeystoneForwarder, 600k gas → receiver call starved, `ReportProcessed(success=false)`, job untouched | [`0x3093c4f1…e42b`](https://testnet.monadexplorer.com/tx/0x3093c4f1fb8fbca7056a5434e09e7afca5d8747a33f4ea0f4e76d2d88bdde42b) |
| CRE `writeReport` via MockKeystoneForwarder, 2M gas → `Evaluator.onReport` → `complete()`; job **Completed** | [`0x9b2c91cb…a100`](https://testnet.monadexplorer.com/tx/0x9b2c91cb8f9a431721e94c37105cbce2df1d2d3e88c85e4d4728fff15a0da100) |

Workflow: `packages/evaluator/cre/accrue-evaluator/main.ts`. Trigger: `JobSubmitted` log on the escrow.
Inside the simulator the workflow read the job and SLA terms from chain, re-fetched
`http://localhost:4020/report/jobs/20/deliverable?block=…` with identical-body consensus, hashed it,
matched the on-chain deliverable, and signed `(jobId, deliverable, ok=true, "cre:verified")`.

Command used (CRE CLI v1.35.0, `--broadcast` uses the mock forwarder `0xB9F7…d192` on `monad-testnet`):

```
cre workflow simulate packages/evaluator/cre/accrue-evaluator -R packages/evaluator/cre \
  --target staging-settings --trigger-index 0 \
  --evm-tx-hash 0x4104a9e9fc3d77d5bae71a9282005d83ee38fec7fa263e080340cf123c99531c --evm-event-index 1 \
  --non-interactive --broadcast -e packages/evaluator/cre/.env   # CRE_ETH_PRIVATE_KEY
```

Lesson recorded: the forwarder swallows receiver reverts, so the report's `gasLimit` must cover the
whole settlement (hooks, vault redeem, pool repayment); 2,000,000 is now the staging default.
Production deployment of the workflow needs CRE Early Access (`cre account access`).
