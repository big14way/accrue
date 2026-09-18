# AI usage

Accrue was built with Claude Code (Anthropic) as a pair programmer, driven from a written spec and a research pack that were produced by the team before the build started.

What the model did: wrote the Solidity contracts, tests, deploy script, SDK, providers, evaluator daemon, CRE workflow, Envio indexer, console and drills from the spec; resolved the spec's open questions by reading primary sources (EIPs, reference repos, Monad/Chainlink/Envio docs, on-chain probes with `cast`) and recorded the findings in `docs/verify.md`; fixed its own test failures.

What the team did: wrote the spec and research, made the product and architecture decisions (own ERC-8183 implementation vs the mainnet deployment, evaluator-as-contract, priced-not-eliminated credit risk, no admin keys), reviewed every commit, ran the deployments and drills with their own keys, and recorded the demo.

No code was taken from OpenBook, Baret, Mandate, Cordon or any other hackathon entrant. The ERC-8183 and ERC-8004 reference repositories were read for interface compatibility and are cited, not copied.
