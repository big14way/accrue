import {
  type Account,
  type Address,
  type Chain,
  type Hash,
  type Hex,
  type PublicClient,
  type Transport,
  type WalletClient,
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  encodeAbiParameters,
  fallback,
  formatUnits,
  http,
  keccak256,
  parseUnits,
  stringToBytes,
  stringToHex,
  toBytes,
  toHex,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import {
  accrueEscrowAbi,
  sLAHookAbi,
  evaluatorAbi,
  advancePoolAbi,
  creditScorerAbi,
  reputationHookAbi,
  mockYieldVaultAbi,
  erc20Abi,
  erc8004IdentityAbi,
  erc8004ReputationAbi,
  erc4626Abi,
} from "./abis/index.js";
import { CHAINS, ERC8004, RPC_FALLBACKS, explorerTx } from "./chains.js";
import type { Deployment } from "./deployment.js";
import { explainRevert } from "./errors.js";

export const JOB_STATUS = ["Open", "Funded", "Submitted", "Completed", "Rejected", "Expired"] as const;
export type JobStatusName = (typeof JOB_STATUS)[number];

export interface AccrueConfig {
  deployment: Deployment;
  /** Defaults to the chain in the deployment. */
  chain?: Chain;
  rpcUrl?: string;
  /** A viem account or a 0x-prefixed private key. Optional for read-only use. */
  account?: Account | Hex;
  /** An existing viem/wagmi WalletClient (browser wallets, Privy). Takes precedence over `account`. */
  walletClient?: WalletClient;
  transport?: Transport;
}

export interface JobView {
  id: bigint;
  status: JobStatusName;
  client: Address;
  provider: Address;
  providerAgentId: bigint;
  evaluator: Address;
  hook: Address;
  budget: bigint;
  budgetFormatted: string;
  expiredAt: number;
  submittedAt: number;
  deliverable: Hex;
  payoutReceiver: Address;
  payoutLock: Address;
  vaultShares: bigint;
  yieldPolicy: { toClientBps: number; toProviderBps: number; toProtocolBps: number };
  description: string;
  settlement: {
    principal: bigint;
    yieldAmount: bigint;
    toClient: bigint;
    toProvider: bigint;
    toProtocol: bigint;
  };
  terms?: { deadline: number; minFreshnessBlock: bigint; deliverableCommitment: Hex; deliverableURI: string };
  submission?: { freshnessBlock: bigint; submittedAt: number; deliverable: Hex };
  lien?: {
    open: boolean;
    provider: Address;
    principal: bigint;
    bond: bigint;
    startBlock: bigint;
    rateWadPerBlock: bigint;
    interestDue: bigint;
    amountDue: bigint;
  };
}

export interface CreateJobParams {
  provider: Address;
  providerAgentId?: bigint;
  description: string;
  /** Unix seconds. */
  expiresAt: number;
  /** Unix seconds; must be <= expiresAt. */
  deadline: number;
  minFreshnessBlock?: bigint;
  /** Where the evaluator re-fetches the deliverable; `{jobId}` is substituted. */
  deliverableURI: string;
  /** Hash of the schema/spec the deliverable must satisfy (any 32 bytes). */
  deliverableCommitment?: Hex;
  yieldPolicy?: { toClientBps: number; toProviderBps: number; toProtocolBps: number };
  /** "standard" (SLA + reputation), "compliant" (adds credential gate), or a hook address. */
  hook?: "standard" | "compliant" | Address;
  evaluator?: Address;
}

export interface TxReceiptSummary {
  hash: Hash;
  blockNumber: bigint;
  gasUsed: bigint;
  status: "success" | "reverted";
  explorer: string;
}

/** Canonical deliverable hash: keccak256 of the UTF-8 bytes of the canonical response body. */
export function hashDeliverable(content: string | Uint8Array): Hex {
  return keccak256(typeof content === "string" ? stringToBytes(content) : content);
}

export function encodeFreshness(block: bigint): Hex {
  return encodeAbiParameters([{ type: "uint64" }], [block]);
}

export function reasonBytes(reason: string): Hex {
  const bytes = toBytes(reason);
  if (bytes.length > 32) throw new Error("reason must be <= 32 bytes");
  return toHex(bytes, { size: 32 });
}

export class Accrue {
  readonly chain: Chain;
  readonly deployment: Deployment;
  readonly publicClient: PublicClient;
  readonly walletClient?: WalletClient;
  readonly account?: Account;
  decimals = 6;

  constructor(cfg: AccrueConfig) {
    this.deployment = cfg.deployment;
    this.chain = cfg.chain ?? CHAINS[cfg.deployment.chainId];
    if (!this.chain) throw new Error(`unknown chain ${cfg.deployment.chainId}`);
    const transport =
      cfg.transport ??
      (cfg.rpcUrl
        ? http(cfg.rpcUrl)
        : fallback(
            (RPC_FALLBACKS[this.chain.id] ?? [this.chain.rpcUrls.default.http[0]]).map((u) => http(u, { timeout: 15_000 })),
            { rank: false },
          ));
    this.publicClient = createPublicClient({ chain: this.chain, transport });
    if (cfg.walletClient) {
      this.walletClient = cfg.walletClient;
      this.account = cfg.walletClient.account ?? undefined;
    } else if (cfg.account) {
      this.account = typeof cfg.account === "string" ? privateKeyToAccount(cfg.account) : cfg.account;
      this.walletClient = createWalletClient({ chain: this.chain, transport, account: this.account });
    }
  }

  get address(): Address | undefined {
    return this.account?.address;
  }

  // ───────────────────────────── Reads ─────────────────────────────

  async tokenInfo(): Promise<{ address: Address; symbol: string; decimals: number }> {
    const [symbol, decimals] = await Promise.all([
      this.publicClient.readContract({ address: this.deployment.token, abi: erc20Abi, functionName: "symbol" }),
      this.publicClient.readContract({ address: this.deployment.token, abi: erc20Abi, functionName: "decimals" }),
    ]);
    this.decimals = decimals;
    return { address: this.deployment.token, symbol, decimals };
  }

  async jobCount(): Promise<bigint> {
    return this.publicClient.readContract({ address: this.deployment.escrow, abi: accrueEscrowAbi, functionName: "jobCounter" });
  }

  async getJob(jobId: bigint): Promise<JobView> {
    const d = this.deployment;
    const [job, settlement, lock, hasTerms, lien] = await Promise.all([
      this.publicClient.readContract({ address: d.escrow, abi: accrueEscrowAbi, functionName: "getJob", args: [jobId] }),
      this.publicClient.readContract({ address: d.escrow, abi: accrueEscrowAbi, functionName: "previewSettlement", args: [jobId] }),
      this.publicClient.readContract({ address: d.escrow, abi: accrueEscrowAbi, functionName: "payoutLock", args: [jobId] }),
      this.publicClient.readContract({ address: d.slaHook, abi: sLAHookAbi, functionName: "hasTerms", args: [jobId] }),
      this.publicClient.readContract({ address: d.advancePool, abi: advancePoolAbi, functionName: "lien", args: [jobId] }),
    ]);
    if (job.client === zeroAddress) throw new Error(`job ${jobId} does not exist`);
    const view: JobView = {
      id: jobId,
      status: JOB_STATUS[job.status] ?? "Open",
      client: job.client,
      provider: job.provider,
      providerAgentId: job.providerAgentId,
      evaluator: job.evaluator,
      hook: job.hook,
      budget: job.budget,
      budgetFormatted: formatUnits(job.budget, this.decimals),
      expiredAt: Number(job.expiredAt),
      submittedAt: Number(job.submittedAt),
      deliverable: job.deliverable,
      payoutReceiver: job.payoutReceiver,
      payoutLock: lock,
      vaultShares: job.vaultShares,
      yieldPolicy: {
        toClientBps: job.yieldPolicy.toClientBps,
        toProviderBps: job.yieldPolicy.toProviderBps,
        toProtocolBps: job.yieldPolicy.toProtocolBps,
      },
      description: job.description,
      settlement: {
        principal: settlement[0],
        yieldAmount: settlement[1],
        toClient: settlement[2],
        toProvider: settlement[3],
        toProtocol: settlement[4],
      },
    };
    if (hasTerms) {
      const [t, s] = await Promise.all([
        this.publicClient.readContract({ address: d.slaHook, abi: sLAHookAbi, functionName: "terms", args: [jobId] }),
        this.publicClient.readContract({ address: d.slaHook, abi: sLAHookAbi, functionName: "submission", args: [jobId] }),
      ]);
      view.terms = {
        deadline: Number(t.deadline),
        minFreshnessBlock: t.minFreshnessBlock,
        deliverableCommitment: t.deliverableCommitment,
        deliverableURI: t.deliverableURI,
      };
      if (s.submittedAt !== 0) {
        view.submission = { freshnessBlock: s.freshnessBlock, submittedAt: Number(s.submittedAt), deliverable: s.deliverable };
      }
    }
    if (lien.open || lien.principal > 0n) {
      const [interestDue, amountDue] = await Promise.all([
        this.publicClient.readContract({ address: d.advancePool, abi: advancePoolAbi, functionName: "interestDue", args: [jobId] }),
        this.publicClient.readContract({ address: d.advancePool, abi: advancePoolAbi, functionName: "amountDue", args: [jobId] }),
      ]);
      view.lien = {
        open: lien.open,
        provider: lien.provider,
        principal: lien.principal,
        bond: lien.bond,
        startBlock: lien.startBlock,
        rateWadPerBlock: lien.rateWadPerBlock,
        interestDue,
        amountDue,
      };
    }
    return view;
  }

  async listJobs(from = 1n, to?: bigint): Promise<JobView[]> {
    const last = to ?? (await this.jobCount());
    const out: JobView[] = [];
    for (let i = from; i <= last; i++) out.push(await this.getJob(i));
    return out;
  }

  async quote(agentId: bigint) {
    const [maxAdvanceBps, rateWadPerBlock, bondBps] = await this.publicClient.readContract({
      address: this.deployment.creditScorer,
      abi: creditScorerAbi,
      functionName: "quote",
      args: [agentId],
    });
    const aprBps = (rateWadPerBlock * 78_840_000n * 10_000n) / 10n ** 18n;
    return { maxAdvanceBps: Number(maxAdvanceBps), rateWadPerBlock, bondBps: Number(bondBps), aprBps: Number(aprBps) };
  }

  async explainScore(agentId: bigint) {
    const s = await this.publicClient.readContract({
      address: this.deployment.creditScorer,
      abi: creditScorerAbi,
      functionName: "explain",
      args: [agentId],
    });
    return {
      onTime: Number(s.onTime),
      late: Number(s.late),
      rejected: Number(s.rejected),
      repaid: Number(s.repaid),
      defaults: Number(s.defaults),
      maxAdvanceBps: Number(s.maxAdvanceBps),
      aprBps: Number(s.aprBps),
      rateWadPerBlock: s.rateWadPerBlock,
      bondBps: Number(s.bondBps),
      formula: {
        maxAdvance: "min(80 %, 20 % + 5 %·onTime + 2 %·late − 15 %·rejected − 30 %·defaults)",
        apr: "max(6 %, 30 % − 2 %·onTime + 5 %·rejected + 10 %·defaults), charged per 400 ms block",
        bond: "clamp(50 % − 5 %·onTime + 10 %·rejected, 10 %, 100 %) of the advance",
      },
    };
  }

  async maxAdvance(jobId: bigint): Promise<bigint> {
    return this.publicClient.readContract({ address: this.deployment.advancePool, abi: advancePoolAbi, functionName: "maxAdvance", args: [jobId] });
  }

  async poolStats() {
    const d = this.deployment;
    const [totalAssets, cash, outstanding, bonds, interest, shortfall, advances, defaults, util, cap, supply] = await Promise.all([
      this.publicClient.readContract({ address: d.advancePool, abi: advancePoolAbi, functionName: "totalAssets" }),
      this.publicClient.readContract({ address: d.advancePool, abi: advancePoolAbi, functionName: "cash" }),
      this.publicClient.readContract({ address: d.advancePool, abi: advancePoolAbi, functionName: "outstandingPrincipal" }),
      this.publicClient.readContract({ address: d.advancePool, abi: advancePoolAbi, functionName: "totalBonds" }),
      this.publicClient.readContract({ address: d.advancePool, abi: advancePoolAbi, functionName: "realisedInterest" }),
      this.publicClient.readContract({ address: d.advancePool, abi: advancePoolAbi, functionName: "totalShortfall" }),
      this.publicClient.readContract({ address: d.advancePool, abi: advancePoolAbi, functionName: "advancesCount" }),
      this.publicClient.readContract({ address: d.advancePool, abi: advancePoolAbi, functionName: "defaultsCount" }),
      this.publicClient.readContract({ address: d.advancePool, abi: advancePoolAbi, functionName: "utilisationBps" }),
      this.publicClient.readContract({ address: d.advancePool, abi: advancePoolAbi, functionName: "maxOutstanding" }),
      this.publicClient.readContract({ address: d.advancePool, abi: advancePoolAbi, functionName: "totalSupply" }),
    ]);
    return {
      totalAssets,
      cash,
      outstandingPrincipal: outstanding,
      totalBonds: bonds,
      realisedInterest: interest,
      totalShortfall: shortfall,
      advancesCount: Number(advances),
      defaultsCount: Number(defaults),
      utilisationBps: Number(util),
      cap,
      shareSupply: supply,
      sharePrice: supply === 0n ? 1 : Number(totalAssets) / Number(supply),
    };
  }

  async vaultStats() {
    const d = this.deployment;
    if (d.vault === zeroAddress) return undefined;
    const [totalAssets, escrowShares] = await Promise.all([
      this.publicClient.readContract({ address: d.vault, abi: erc4626Abi, functionName: "totalAssets" }),
      this.publicClient.readContract({ address: d.vault, abi: erc4626Abi, functionName: "balanceOf", args: [d.escrow] }),
    ]);
    const escrowAssets = await this.publicClient.readContract({ address: d.vault, abi: erc4626Abi, functionName: "previewRedeem", args: [escrowShares] });
    let ratePerBlockWad: bigint | undefined;
    try {
      ratePerBlockWad = await this.publicClient.readContract({ address: d.vault, abi: mockYieldVaultAbi, functionName: "ratePerBlockWad" });
    } catch {
      /* not the mock */
    }
    return { totalAssets, escrowShares, escrowAssets, ratePerBlockWad };
  }

  async balance(address: Address): Promise<bigint> {
    return this.publicClient.readContract({ address: this.deployment.token, abi: erc20Abi, functionName: "balanceOf", args: [address] });
  }

  async agentOwner(agentId: bigint): Promise<Address | undefined> {
    const reg = ERC8004[this.chain.id]?.identity ?? this.deployment.erc8004Identity;
    try {
      return await this.publicClient.readContract({ address: reg, abi: erc8004IdentityAbi, functionName: "ownerOf", args: [agentId] });
    } catch {
      return undefined;
    }
  }

  async reputationSummary(agentId: bigint, tag2 = "") {
    const reg = this.deployment.erc8004Reputation;
    const [count, value, decimals] = await this.publicClient.readContract({
      address: reg,
      abi: erc8004ReputationAbi,
      functionName: "getSummary",
      args: [agentId, [this.deployment.reputationHook], "accrue:sla", tag2],
    });
    return { count: Number(count), mean: Number(value) / 10 ** Number(decimals) };
  }

  // ───────────────────────────── Writes ─────────────────────────────

  private wallet(): WalletClient & { account: Account } {
    if (!this.walletClient || !this.account) throw new Error("no account configured for writes");
    return this.walletClient as WalletClient & { account: Account };
  }

  private async send(tx: Promise<Hash>): Promise<TxReceiptSummary> {
    let hash: Hash;
    try {
      hash = await tx;
    } catch (e) {
      const ex = explainRevert(e, this.decimals);
      if (ex) throw new AccrueRevert(ex.name, ex.args, ex.sentence, e);
      throw e;
    }
    const r = await this.publicClient.waitForTransactionReceipt({ hash });
    return { hash, blockNumber: r.blockNumber, gasUsed: r.gasUsed, status: r.status, explorer: explorerTx(this.chain.id, hash) };
  }

  async ensureAllowance(spender: Address, amount: bigint): Promise<TxReceiptSummary | undefined> {
    const w = this.wallet();
    const current = await this.publicClient.readContract({ address: this.deployment.token, abi: erc20Abi, functionName: "allowance", args: [w.account.address, spender] });
    if (current >= amount) return undefined;
    return this.send(w.writeContract({ address: this.deployment.token, abi: erc20Abi, functionName: "approve", args: [spender, amount], chain: this.chain, account: w.account }));
  }

  /** Client: create a job, set its yield policy and commit SLA terms. Three transactions. */
  async createJob(p: CreateJobParams): Promise<{ jobId: bigint; txs: TxReceiptSummary[] }> {
    const w = this.wallet();
    const d = this.deployment;
    const hook = p.hook === "compliant" ? d.compliantRouter : p.hook && p.hook !== "standard" ? p.hook : d.router;
    const txs: TxReceiptSummary[] = [];
    const created = await this.send(
      w.writeContract({
        address: d.escrow,
        abi: accrueEscrowAbi,
        functionName: "createJob",
        args: [p.provider, p.evaluator ?? d.evaluator, p.expiresAt, p.description, hook, p.providerAgentId ?? 0n],
        chain: this.chain,
        account: w.account,
      }),
    );
    txs.push(created);
    const receipt = await this.publicClient.getTransactionReceipt({ hash: created.hash });
    let jobId: bigint | undefined;
    for (const log of receipt.logs) {
      try {
        const ev = decodeEventLog({ abi: accrueEscrowAbi, data: log.data, topics: log.topics });
        if (ev.eventName === "JobCreated") jobId = (ev.args as { jobId: bigint }).jobId;
      } catch {
        /* other logs */
      }
    }
    if (jobId === undefined) throw new Error("JobCreated event not found");
    if (p.yieldPolicy && p.yieldPolicy.toClientBps !== 10_000) {
      txs.push(
        await this.send(
          w.writeContract({
            address: d.escrow,
            abi: accrueEscrowAbi,
            functionName: "setYieldPolicy",
            args: [jobId, p.yieldPolicy.toClientBps, p.yieldPolicy.toProviderBps, p.yieldPolicy.toProtocolBps],
            chain: this.chain,
            account: w.account,
          }),
        ),
      );
    }
    txs.push(
      await this.send(
        w.writeContract({
          address: d.slaHook,
          abi: sLAHookAbi,
          functionName: "commitTerms",
          args: [
            jobId,
            {
              deadline: p.deadline,
              minFreshnessBlock: p.minFreshnessBlock ?? 0n,
              deliverableCommitment: p.deliverableCommitment ?? keccak256(stringToHex(p.description)),
              deliverableURI: p.deliverableURI,
            },
          ],
          chain: this.chain,
          account: w.account,
        }),
      ),
    );
    return { jobId, txs };
  }

  /** Provider: quote a budget for an Open job. */
  async setBudget(jobId: bigint, amount: bigint): Promise<TxReceiptSummary> {
    const w = this.wallet();
    return this.send(
      w.writeContract({ address: this.deployment.escrow, abi: accrueEscrowAbi, functionName: "setBudget", args: [jobId, this.deployment.token, amount, "0x"], chain: this.chain, account: w.account }),
    );
  }

  /** Client: approve (if needed) and fund. Budget goes straight into the yield vault. */
  async fund(jobId: bigint): Promise<{ approve?: TxReceiptSummary; fund: TxReceiptSummary }> {
    const w = this.wallet();
    const job = await this.publicClient.readContract({ address: this.deployment.escrow, abi: accrueEscrowAbi, functionName: "getJob", args: [jobId] });
    const approve = await this.ensureAllowance(this.deployment.escrow, job.budget);
    const fund = await this.send(
      w.writeContract({ address: this.deployment.escrow, abi: accrueEscrowAbi, functionName: "fund", args: [jobId, this.deployment.token, job.budget, "0x"], chain: this.chain, account: w.account }),
    );
    return { approve, fund };
  }

  /** Provider: submit a deliverable hash with the block its data was observed at. */
  async submit(jobId: bigint, deliverable: Hex, freshnessBlock: bigint): Promise<TxReceiptSummary> {
    const w = this.wallet();
    return this.send(
      w.writeContract({ address: this.deployment.escrow, abi: accrueEscrowAbi, functionName: "submit", args: [jobId, deliverable, encodeFreshness(freshnessBlock)], chain: this.chain, account: w.account }),
    );
  }

  /** Provider: route the job's payout through the pool (prerequisite for an advance). */
  async routePayoutToPool(jobId: bigint): Promise<TxReceiptSummary> {
    const w = this.wallet();
    return this.send(
      w.writeContract({ address: this.deployment.escrow, abi: accrueEscrowAbi, functionName: "setPayoutReceiver", args: [jobId, this.deployment.advancePool], chain: this.chain, account: w.account }),
    );
  }

  /** Provider: borrow against a funded job. Posts the bond (approve if needed). */
  async advance(jobId: bigint, amount: bigint): Promise<{ route?: TxReceiptSummary; bondApprove?: TxReceiptSummary; advance: TxReceiptSummary }> {
    const w = this.wallet();
    const job = await this.publicClient.readContract({ address: this.deployment.escrow, abi: accrueEscrowAbi, functionName: "getJob", args: [jobId] });
    let route: TxReceiptSummary | undefined;
    if (job.payoutReceiver.toLowerCase() !== this.deployment.advancePool.toLowerCase()) route = await this.routePayoutToPool(jobId);
    const q = await this.quote(job.providerAgentId);
    const bond = (amount * BigInt(q.bondBps)) / 10_000n;
    const bondApprove = bond > 0n ? await this.ensureAllowance(this.deployment.advancePool, bond) : undefined;
    const adv = await this.send(
      w.writeContract({ address: this.deployment.advancePool, abi: advancePoolAbi, functionName: "advance", args: [jobId, amount], chain: this.chain, account: w.account }),
    );
    return { route, bondApprove, advance: adv };
  }

  /** Committee member: attest a verdict. Finalises the job once the threshold is reached. */
  async attest(jobId: bigint, deliverable: Hex, ok: boolean, reason: string): Promise<TxReceiptSummary> {
    const w = this.wallet();
    return this.send(
      w.writeContract({ address: this.deployment.evaluator, abi: evaluatorAbi, functionName: "attest", args: [jobId, deliverable, ok, reasonBytes(reason)], chain: this.chain, account: w.account }),
    );
  }

  /** Anyone: refund a funded job whose SLA deadline passed with no submission. */
  async enforceDeadline(jobId: bigint): Promise<TxReceiptSummary> {
    const w = this.wallet();
    return this.send(w.writeContract({ address: this.deployment.evaluator, abi: evaluatorAbi, functionName: "enforceDeadline", args: [jobId], chain: this.chain, account: w.account }));
  }

  /** Anyone: expire a job past its expiry (never hookable). */
  async claimRefund(jobId: bigint): Promise<TxReceiptSummary> {
    const w = this.wallet();
    return this.send(w.writeContract({ address: this.deployment.escrow, abi: accrueEscrowAbi, functionName: "claimRefund", args: [jobId], chain: this.chain, account: w.account }));
  }

  /** Anyone: settle a lien whose job was rejected or expired. */
  async resolveLien(jobId: bigint): Promise<TxReceiptSummary> {
    const w = this.wallet();
    return this.send(w.writeContract({ address: this.deployment.advancePool, abi: advancePoolAbi, functionName: "resolve", args: [jobId], chain: this.chain, account: w.account }));
  }

  /** Lender: deposit into the advance pool. */
  async lend(amount: bigint): Promise<{ approve?: TxReceiptSummary; deposit: TxReceiptSummary }> {
    const w = this.wallet();
    const approve = await this.ensureAllowance(this.deployment.advancePool, amount);
    const deposit = await this.send(
      w.writeContract({ address: this.deployment.advancePool, abi: advancePoolAbi, functionName: "deposit", args: [amount, w.account.address], chain: this.chain, account: w.account }),
    );
    return { approve, deposit };
  }

  /** Lender: withdraw assets (capped by pool cash). */
  async redeem(amount: bigint): Promise<TxReceiptSummary> {
    const w = this.wallet();
    return this.send(
      w.writeContract({ address: this.deployment.advancePool, abi: advancePoolAbi, functionName: "withdraw", args: [amount, w.account.address, w.account.address], chain: this.chain, account: w.account }),
    );
  }

  /** Register the signer as an ERC-8004 agent. Returns the agentId. */
  async registerAgent(agentURI: string): Promise<{ agentId: bigint; tx: TxReceiptSummary }> {
    const w = this.wallet();
    const reg = this.deployment.erc8004Identity !== zeroAddress ? this.deployment.erc8004Identity : ERC8004[this.chain.id].identity;
    const tx = await this.send(w.writeContract({ address: reg, abi: erc8004IdentityAbi, functionName: "register", args: [agentURI], chain: this.chain, account: w.account }));
    const receipt = await this.publicClient.getTransactionReceipt({ hash: tx.hash });
    for (const log of receipt.logs) {
      try {
        const ev = decodeEventLog({ abi: erc8004IdentityAbi, data: log.data, topics: log.topics });
        if (ev.eventName === "Registered") return { agentId: (ev.args as { agentId: bigint }).agentId, tx };
      } catch {
        /* other logs */
      }
    }
    throw new Error("Registered event not found");
  }

  /** Mock-only helpers (testnet): mint test USD, top up the vault reserve. */
  async mintTestUsd(to: Address, amount: bigint): Promise<TxReceiptSummary> {
    const w = this.wallet();
    const abi = [{ type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] }] as const;
    return this.send(w.writeContract({ address: this.deployment.token, abi, functionName: "mint", args: [to, amount], chain: this.chain, account: w.account }));
  }

  async fundVaultReserve(amount: bigint): Promise<{ approve?: TxReceiptSummary; fund: TxReceiptSummary }> {
    const w = this.wallet();
    const approve = await this.ensureAllowance(this.deployment.vault, amount);
    const fund = await this.send(w.writeContract({ address: this.deployment.vault, abi: mockYieldVaultAbi, functionName: "fundReserve", args: [amount], chain: this.chain, account: w.account }));
    return { approve, fund };
  }

  // ───────────────────────────── Explain ─────────────────────────────

  /** Decodes every Accrue event in a transaction into readable lines, or the revert reason. */
  async explainTx(hash: Hash): Promise<{ status: "success" | "reverted"; lines: string[]; explorer: string }> {
    const receipt = await this.publicClient.getTransactionReceipt({ hash });
    const lines: string[] = [];
    if (receipt.status === "reverted") {
      const tx = await this.publicClient.getTransaction({ hash });
      try {
        await this.publicClient.call({ to: tx.to ?? undefined, data: tx.input, account: tx.from, blockNumber: receipt.blockNumber });
        lines.push("Transaction reverted (reason not reproducible at this block).");
      } catch (e) {
        const ex = explainRevert(e, this.decimals);
        lines.push(ex ? `Refused: ${ex.sentence} [${ex.name}]` : `Reverted: ${(e as Error).message.split("\n")[0]}`);
      }
      return { status: "reverted", lines, explorer: explorerTx(this.chain.id, hash) };
    }
    const abis = [accrueEscrowAbi, sLAHookAbi, evaluatorAbi, advancePoolAbi, reputationHookAbi, erc8004ReputationAbi] as const;
    for (const log of receipt.logs) {
      for (const abi of abis) {
        try {
          const ev = decodeEventLog({ abi, data: log.data, topics: log.topics });
          lines.push(this.describeEvent(ev.eventName, ev.args as Record<string, unknown>));
          break;
        } catch {
          /* try next abi */
        }
      }
    }
    return { status: "success", lines, explorer: explorerTx(this.chain.id, hash) };
  }

  private describeEvent(name: string, a: Record<string, unknown>): string {
    const f = (v: unknown) => formatUnits(BigInt(v as string), this.decimals);
    switch (name) {
      case "JobCreated":
        return `Job #${a.jobId} created by ${a.client} for provider ${a.provider}.`;
      case "BudgetSet":
        return `Job #${a.jobId} budget set to ${f(a.amount)}.`;
      case "JobFunded":
        return `Job #${a.jobId} funded with ${f(a.amount)} by ${a.client}.`;
      case "YieldDeposited":
        return `Budget deposited into vault ${a.vault} (${a.shares} shares).`;
      case "TermsCommitted":
        return `SLA terms committed: deadline ${new Date(Number(a.deadline) * 1000).toISOString()}, min freshness block ${a.minFreshnessBlock}.`;
      case "JobSubmitted":
        return `Provider submitted deliverable ${String(a.deliverable).slice(0, 10)}… for job #${a.jobId}.`;
      case "SubmissionAccepted":
        return `SLA check passed: data from block ${a.freshnessBlock}.`;
      case "YieldRealised":
        return `Yield realised: ${f(a.yieldAmount)} (client ${f(a.toClient)}, provider ${f(a.toProvider)}, protocol ${f(a.toProtocol)}); principal ${f(a.principal)}.`;
      case "PaymentReleased":
        return `Paid ${f(a.amount)} to ${a.recipient}.`;
      case "Refunded":
        return `Refunded ${f(a.amount)} to ${a.client}.`;
      case "JobCompleted":
        return `Job #${a.jobId} completed by evaluator ${a.evaluator}.`;
      case "JobRejected":
        return `Job #${a.jobId} rejected by ${a.rejector}.`;
      case "JobExpired":
        return `Job #${a.jobId} expired.`;
      case "Attested":
        return `Evaluator verdict ${a.ok ? "OK" : "REJECT"} via ${a.source === 0 ? "Chainlink CRE" : "committee"}.`;
      case "Vote":
        return `Committee vote ${a.count} recorded by ${a.member}.`;
      case "DeadlineEnforced":
        return `Deadline enforced: job #${a.jobId} missed ${new Date(Number(a.deadline) * 1000).toISOString()}.`;
      case "Advanced":
        return `Advance of ${f(a.amount)} paid to ${a.provider} (bond ${f(a.bond)}, limit ${Number(a.maxAdvanceBps) / 100} % of budget).`;
      case "Repaid":
        return `Advance repaid: principal ${f(a.principal)}, interest ${f(a.interest)}; ${f(a.forwarded)} forwarded to provider.`;
      case "Defaulted":
        return `Advance defaulted: seized bond ${f(a.seizedBond)}, principal shortfall ${f(a.principalShortfall)}.`;
      case "Forwarded":
        return `Pool forwarded ${f(a.amount)} to ${a.provider} (no lien).`;
      case "FeedbackWritten":
        return `ERC-8004 feedback written for agent #${a.agentId}: ${a.value} (${a.tag2}).`;
      case "FeedbackSkipped":
        return `ERC-8004 feedback skipped for job #${a.jobId}.`;
      case "CreditFeedback":
        return `ERC-8004 credit feedback for agent #${a.agentId}: ${a.tag2}.`;
      case "NewFeedback":
        return `Reputation registry recorded feedback ${a.value} for agent #${a.agentId} (${a.tag1}/${a.tag2}).`;
      case "PayoutReceiverSet":
        return `Payout for job #${a.jobId} routed to ${a.payoutReceiver}.`;
      case "PayoutReceiverLocked":
        return `Payout route locked by ${a.locker}.`;
      case "PayoutReceiverUnlocked":
        return `Payout route unlocked.`;
      default:
        return `${name}`;
    }
  }
}

export class AccrueRevert extends Error {
  constructor(
    public readonly errorName: string,
    public readonly args: readonly unknown[],
    public readonly sentence: string,
    public readonly cause?: unknown,
  ) {
    super(sentence);
    this.name = "AccrueRevert";
  }
}

export function parseUsd(amount: string | number, decimals = 6): bigint {
  return parseUnits(String(amount), decimals);
}

export function formatUsd(amount: bigint, decimals = 6): string {
  return formatUnits(amount, decimals);
}
