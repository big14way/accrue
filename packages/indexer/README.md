# Accrue indexer (Envio HyperIndex)

Indexes the escrow, SLA hook, evaluator, advance pool and reputation hook on Monad testnet
(config synced from `docs/deployments/monad-testnet.json` by `node sync-addresses.mjs`).

```bash
export ENVIO_API_TOKEN=…            # app.envio.dev/api-tokens (HyperSync)
pnpm codegen
pnpm dev                             # Postgres + Hasura in Docker on :8080, then indexes from the deploy block
```

If something else already listens on 8080, run Hasura yourself on another port and start the
indexer against it:

```bash
docker run -d --name envio-hasura -p 8085:8080 \
  -e HASURA_GRAPHQL_DATABASE_URL=postgres://postgres:testing@host.docker.internal:5433/envio-dev \
  -e HASURA_GRAPHQL_ADMIN_SECRET=testing -e HASURA_GRAPHQL_UNAUTHORIZED_ROLE=public \
  -e HASURA_GRAPHQL_ENABLE_CONSOLE=true -e HASURA_GRAPHQL_STRINGIFY_NUMERIC_TYPES=true \
  hasura/graphql-engine:v2.43.0
HASURA_GRAPHQL_ENDPOINT=http://localhost:8085/v1/metadata ENVIO_PG_PORT=5433 pnpm start
```

GraphQL: `http://localhost:8085/v1/graphql` (set `NEXT_PUBLIC_ENVIO_GRAPHQL` in the console to it).

Example:

```graphql
{ GlobalStats { jobs funded completed rejected yieldRealised attestationsCRE attestationsCommittee }
  PoolStats { deposits outstandingPrincipal realisedInterest totalShortfall advances defaults }
  Job(limit: 5, order_by: {createdAt: desc}) { id status budget verdictReason verdictSource } }
```

Entities: `Job`, `JobEvent`, `Lien`, `Provider`, `Attestation`, `PoolSnapshot`, `PoolStats`,
`GlobalStats`, `Feedback` (see `schema.graphql`).
