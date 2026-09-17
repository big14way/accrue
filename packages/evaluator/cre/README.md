# Accrue evaluator — Chainlink CRE workflow

The evaluator for every Accrue job is the `Evaluator` contract. Its primary ingress is this
Chainlink CRE workflow: triggered by `JobSubmitted`, it re-fetches the deliverable at the
provider's declared freshness block inside the DON (identical-body consensus across nodes),
hashes it, compares with the on-chain submission, and writes a signed report through the
`KeystoneForwarder` to `Evaluator.onReport`, which completes or rejects the job in the same
transaction.

```
cre login                          # once
cd packages/evaluator/cre
cre workflow simulate accrue-evaluator --target staging-settings              # dry run
cre workflow simulate accrue-evaluator --target staging-settings --broadcast  # real tx via MockKeystoneForwarder
```

Fill `accrue-evaluator/config.staging.json` from `docs/deployments/monad-testnet.json`
(`escrow`, `slaHook`, `evaluator`). The Evaluator contract is deployed with the **mock**
forwarder (`0xB9F7…d192`) for simulation; a production deployment uses the production forwarder
(`0xF834…4482`) and requires CRE Early Access.

Forwarder addresses: see `docs/verify.md` §4.
