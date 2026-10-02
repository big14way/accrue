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

## Second run: job #11 on the AUSD deployment (2 Oct 2026)

The workflow config (`config.staging.json`) now points at the AUSD deployment. Job **#11** (100 AUSD, provider
agent #1891) was posted and funded by the client, quoted and delivered by the provider agent, and settled by a CRE
report. The evaluator daemon was not running, so nothing else could settle it.

| Step | Transaction |
|---|---|
| Client posts the job (create, terms, yield policy) | [`0x0b0cf8fb…20e8`](https://testnet.monadexplorer.com/tx/0x0b0cf8fb20667132c1878cd61f73b5d92f813b07ab6851095e027d11a64720e8) |
| Provider agent quotes 100 AUSD | [`0x2bbbe104…d66c`](https://testnet.monadexplorer.com/tx/0x2bbbe104c23cf9181d9caf43cdefeb395312aaf855f2076d2834848f0ff8d66c) |
| Client funds, budget into the vault | [`0xa06a9365…9c27`](https://testnet.monadexplorer.com/tx/0xa06a93658b23c499b359def9cd9a37ced1b2a83a5a7764882015056ef22f9c27) |
| Provider agent submits deliverable `0xb5b4f6ea…7213` | [`0xd9b17059…ac0`](https://testnet.monadexplorer.com/tx/0xd9b170593f0666f0288ba6f1ec82cc5864bdccc0fcf7ce3daf14411563717ac0) |
| CRE `writeReport` through the forwarder, `Evaluator.onReport`, job **Completed** | [`0xa5bdb5c8…8eb7`](https://testnet.monadexplorer.com/tx/0xa5bdb5c8d0eede1902f04050ded42a016eaf7ede12a40cae1fe7484267418eb7) |

Workflow log: `JobSubmitted #11 deliverable 0xb5b4f6ea…7213`, then `fetched 0xb5b4f6ea…7213 vs submitted 0xb5b4f6ea…7213 → cre:verified`,
then `writeReport 0xa5bdb5c8…8eb7`. Envio indexed the attestation with `source=CRE`.

Command (CRE CLI v1.35.0 resolves the workflow path relative to the CRE project folder):

```
cd packages/evaluator/cre
cre workflow simulate accrue-evaluator --target staging-settings --trigger-index 0 \
  --evm-tx-hash 0xd9b170593f0666f0288ba6f1ec82cc5864bdccc0fcf7ce3daf14411563717ac0 --evm-event-index 1 \
  --non-interactive --broadcast -e .env   # CRE_ETH_PRIVATE_KEY
```

## Third run: job #12, posted from a Privy wallet (2 Oct 2026)

A person signed in to the live console with Privy (embedded wallet `0xE1bF30CD95a81305e99af707F6cE944A6296e26d`) posted job **#12**
(create, yield policy, terms: [`0x04cc1efc…cda6`](https://testnet.monadexplorer.com/tx/0x04cc1efc1442abb87a80d30396b21801fa905e779400d73d5a08b3c69d60cda6),
[`0xc6829137…b1ce`](https://testnet.monadexplorer.com/tx/0xc68291371ecec627277bf53b9c9d4b67b0943852a02988ddacbf0e1cfd07b1ce),
[`0xb83e975f…d3d0`](https://testnet.monadexplorer.com/tx/0xb83e975f8ae894a9709f10d61a89a83f75e13ab893502b7ea087715c6c09d3d0)).
The provider agent quoted 50 AUSD ([`0x58bdbba9…ede8`](https://testnet.monadexplorer.com/tx/0x58bdbba94a57e7216f0718f052a4ea4a1ac57564d55af32aa50bc4c23011ede8)),
the Privy wallet funded it ([`0x8ed4e9ec…3bd5`](https://testnet.monadexplorer.com/tx/0x8ed4e9ec351a496cbbc3e3f21503b97660f63c090e7b8fdc0678f97c2aa93bd5)),
the agent delivered ([`0xeb8cd95e…9da6`](https://testnet.monadexplorer.com/tx/0xeb8cd95e6bf9379cad7d2c3ada21f4dc51174a31f3bc58d4f69c6f8be6bd9da6)),
and the workflow verified the body (`cre:verified`) and settled it with report
[`0x516133bf…e2b3`](https://testnet.monadexplorer.com/tx/0x516133bf5e41af7418cfd2c7efd0e6ce0522a2e6e85eb85a7dda7df5ec64e2b3).
