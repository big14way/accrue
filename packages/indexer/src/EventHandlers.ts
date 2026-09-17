import { indexer } from "envio";

const STATUS = { Open: "Open", Funded: "Funded", Submitted: "Submitted", Completed: "Completed", Rejected: "Rejected", Expired: "Expired" };

function evId(e: { transaction: { hash: string }; logIndex: number }) {
  return `${e.transaction.hash}-${e.logIndex}`;
}

async function global(context: any, ts: bigint) {
  return (
    (await context.GlobalStats.get("global")) ?? {
      id: "global", jobs: 0, funded: 0, completed: 0, rejected: 0, expired: 0,
      volumeFunded: 0n, yieldRealised: 0n, refunds: 0n, attestationsCRE: 0, attestationsCommittee: 0, updatedAt: ts,
    }
  );
}

async function poolStats(context: any, ts: bigint) {
  return (
    (await context.PoolStats.get("pool")) ?? {
      id: "pool", deposits: 0n, withdrawals: 0n, outstandingPrincipal: 0n, realisedInterest: 0n, totalShortfall: 0n,
      advances: 0, repaid: 0, defaults: 0, updatedAt: ts,
    }
  );
}

async function provider(context: any, address: string, ts: bigint) {
  return (
    (await context.Provider.get(address.toLowerCase())) ?? {
      id: address.toLowerCase(), agentId: 0n, jobs: 0, completed: 0, onTime: 0, late: 0, rejected: 0,
      advances: 0, repaid: 0, defaults: 0, earned: 0n, yieldBonus: 0n, lastSeenAt: ts,
    }
  );
}

function jobEvent(context: any, event: any, jobId: bigint, kind: string, extra: Partial<{ actor: string; amount: bigint; detail: string }> = {}) {
  context.JobEvent.set({
    id: evId(event), job_id: jobId.toString(), kind, actor: extra.actor, amount: extra.amount, detail: extra.detail,
    txHash: event.transaction.hash, blockNumber: BigInt(event.block.number), timestamp: BigInt(event.block.timestamp),
  });
}

// ───────────────────────────── Escrow ─────────────────────────────

indexer.onEvent({ contract: "AccrueEscrow", event: "JobCreated" }, async ({ event, context }) => {
  const ts = BigInt(event.block.timestamp);
  context.Job.set({
    id: event.params.jobId.toString(), chainId: event.chainId, client: event.params.client.toLowerCase(),
    provider: event.params.provider.toLowerCase(), providerAgentId: 0n, evaluator: event.params.evaluator.toLowerCase(),
    hook: event.params.hook.toLowerCase(), status: STATUS.Open, budget: 0n, token: undefined,
    expiredAt: BigInt(event.params.expiredAt), deadline: undefined, minFreshnessBlock: undefined, deliverableURI: undefined,
    deliverableCommitment: undefined, deliverable: undefined, freshnessBlock: undefined, submittedAt: undefined,
    yieldToClientBps: 10000, yieldToProviderBps: 0, yieldToProtocolBps: 0, vaultShares: undefined,
    principalPaid: undefined, yieldRealised: undefined, yieldToClient: undefined, yieldToProvider: undefined, yieldToProtocol: undefined,
    refunded: undefined, paidTo: undefined, payoutReceiver: undefined, payoutLocked: false, verdictOk: undefined,
    verdictReason: undefined, verdictSource: undefined, createdAt: ts, createdTx: event.transaction.hash,
    fundedAt: undefined, settledAt: undefined, settledTx: undefined, lien_id: undefined,
  });
  jobEvent(context, event, event.params.jobId, "created", { actor: event.params.client });
  const g = await global(context, ts);
  context.GlobalStats.set({ ...g, jobs: g.jobs + 1, updatedAt: ts });
  const p = await provider(context, event.params.provider, ts);
  context.Provider.set({ ...p, jobs: p.jobs + 1, lastSeenAt: ts });
});

indexer.onEvent({ contract: "AccrueEscrow", event: "ProviderSet" }, async ({ event, context }) => {
  const job = await context.Job.get(event.params.jobId.toString());
  if (!job) return;
  context.Job.set({ ...job, provider: event.params.provider.toLowerCase(), providerAgentId: event.params.agentId });
  const p = await provider(context, event.params.provider, BigInt(event.block.timestamp));
  context.Provider.set({ ...p, agentId: event.params.agentId, jobs: p.jobs + 1 });
});

indexer.onEvent({ contract: "AccrueEscrow", event: "BudgetSet" }, async ({ event, context }) => {
  const job = await context.Job.get(event.params.jobId.toString());
  if (!job) return;
  context.Job.set({ ...job, budget: event.params.amount, token: event.params.token.toLowerCase() });
  jobEvent(context, event, event.params.jobId, "budget", { amount: event.params.amount });
});

indexer.onEvent({ contract: "AccrueEscrow", event: "YieldPolicySet" }, async ({ event, context }) => {
  const job = await context.Job.get(event.params.jobId.toString());
  if (!job) return;
  context.Job.set({ ...job, yieldToClientBps: Number(event.params.toClientBps), yieldToProviderBps: Number(event.params.toProviderBps), yieldToProtocolBps: Number(event.params.toProtocolBps) });
});

indexer.onEvent({ contract: "AccrueEscrow", event: "JobFunded" }, async ({ event, context }) => {
  const ts = BigInt(event.block.timestamp);
  const job = await context.Job.get(event.params.jobId.toString());
  if (!job) return;
  context.Job.set({ ...job, status: STATUS.Funded, budget: event.params.amount, fundedAt: ts });
  jobEvent(context, event, event.params.jobId, "funded", { actor: event.params.client, amount: event.params.amount });
  const g = await global(context, ts);
  context.GlobalStats.set({ ...g, funded: g.funded + 1, volumeFunded: g.volumeFunded + event.params.amount, updatedAt: ts });
});

indexer.onEvent({ contract: "AccrueEscrow", event: "YieldDeposited" }, async ({ event, context }) => {
  const job = await context.Job.get(event.params.jobId.toString());
  if (!job) return;
  context.Job.set({ ...job, vaultShares: event.params.shares });
});

indexer.onEvent({ contract: "AccrueEscrow", event: "JobSubmitted" }, async ({ event, context }) => {
  const job = await context.Job.get(event.params.jobId.toString());
  if (!job) return;
  context.Job.set({ ...job, status: STATUS.Submitted, deliverable: event.params.deliverable, submittedAt: BigInt(event.block.timestamp) });
  jobEvent(context, event, event.params.jobId, "submitted", { actor: event.params.provider, detail: event.params.deliverable });
});

indexer.onEvent({ contract: "AccrueEscrow", event: "YieldRealised" }, async ({ event, context }) => {
  const ts = BigInt(event.block.timestamp);
  const job = await context.Job.get(event.params.jobId.toString());
  if (!job) return;
  context.Job.set({
    ...job, principalPaid: event.params.principal, yieldRealised: event.params.yieldAmount, yieldToClient: event.params.toClient,
    yieldToProvider: event.params.toProvider, yieldToProtocol: event.params.toProtocol,
  });
  jobEvent(context, event, event.params.jobId, "yield", { amount: event.params.yieldAmount, detail: `client ${event.params.toClient} provider ${event.params.toProvider} protocol ${event.params.toProtocol}` });
  const g = await global(context, ts);
  context.GlobalStats.set({ ...g, yieldRealised: g.yieldRealised + event.params.yieldAmount, updatedAt: ts });
  if (event.params.toProvider > 0n) {
    const p = await provider(context, job.provider, ts);
    context.Provider.set({ ...p, yieldBonus: p.yieldBonus + event.params.toProvider });
  }
});

indexer.onEvent({ contract: "AccrueEscrow", event: "PaymentReleased" }, async ({ event, context }) => {
  const job = await context.Job.get(event.params.jobId.toString());
  if (!job) return;
  context.Job.set({ ...job, paidTo: event.params.recipient.toLowerCase() });
  jobEvent(context, event, event.params.jobId, "paid", { actor: event.params.recipient, amount: event.params.amount });
  const p = await provider(context, job.provider, BigInt(event.block.timestamp));
  context.Provider.set({ ...p, earned: p.earned + event.params.amount });
});

indexer.onEvent({ contract: "AccrueEscrow", event: "Refunded" }, async ({ event, context }) => {
  const ts = BigInt(event.block.timestamp);
  const job = await context.Job.get(event.params.jobId.toString());
  if (!job) return;
  context.Job.set({ ...job, refunded: event.params.amount });
  jobEvent(context, event, event.params.jobId, "refunded", { actor: event.params.client, amount: event.params.amount });
  const g = await global(context, ts);
  context.GlobalStats.set({ ...g, refunds: g.refunds + event.params.amount, updatedAt: ts });
});

indexer.onEvent({ contract: "AccrueEscrow", event: "JobCompleted" }, async ({ event, context }) => {
  const ts = BigInt(event.block.timestamp);
  const job = await context.Job.get(event.params.jobId.toString());
  if (!job) return;
  const late = job.deadline !== undefined && job.submittedAt !== undefined && job.submittedAt > job.deadline;
  context.Job.set({ ...job, status: STATUS.Completed, settledAt: ts, settledTx: event.transaction.hash, payoutLocked: false });
  jobEvent(context, event, event.params.jobId, "completed", { actor: event.params.evaluator, detail: event.params.reason });
  const g = await global(context, ts);
  context.GlobalStats.set({ ...g, completed: g.completed + 1, updatedAt: ts });
  const p = await provider(context, job.provider, ts);
  context.Provider.set({ ...p, completed: p.completed + 1, onTime: p.onTime + (late ? 0 : 1), late: p.late + (late ? 1 : 0), lastSeenAt: ts });
});

indexer.onEvent({ contract: "AccrueEscrow", event: "JobRejected" }, async ({ event, context }) => {
  const ts = BigInt(event.block.timestamp);
  const job = await context.Job.get(event.params.jobId.toString());
  if (!job) return;
  const wasFunded = job.fundedAt !== undefined;
  context.Job.set({ ...job, status: STATUS.Rejected, settledAt: ts, settledTx: event.transaction.hash, payoutLocked: false });
  jobEvent(context, event, event.params.jobId, "rejected", { actor: event.params.rejector, detail: event.params.reason });
  const g = await global(context, ts);
  context.GlobalStats.set({ ...g, rejected: g.rejected + 1, updatedAt: ts });
  if (wasFunded) {
    const p = await provider(context, job.provider, ts);
    context.Provider.set({ ...p, rejected: p.rejected + 1, lastSeenAt: ts });
  }
});

indexer.onEvent({ contract: "AccrueEscrow", event: "JobExpired" }, async ({ event, context }) => {
  const ts = BigInt(event.block.timestamp);
  const job = await context.Job.get(event.params.jobId.toString());
  if (!job) return;
  context.Job.set({ ...job, status: STATUS.Expired, settledAt: ts, settledTx: event.transaction.hash, payoutLocked: false });
  jobEvent(context, event, event.params.jobId, "expired");
  const g = await global(context, ts);
  context.GlobalStats.set({ ...g, expired: g.expired + 1, updatedAt: ts });
});

indexer.onEvent({ contract: "AccrueEscrow", event: "PayoutReceiverSet" }, async ({ event, context }) => {
  const job = await context.Job.get(event.params.jobId.toString());
  if (!job) return;
  context.Job.set({ ...job, payoutReceiver: event.params.payoutReceiver.toLowerCase() });
});

indexer.onEvent({ contract: "AccrueEscrow", event: "PayoutReceiverLocked" }, async ({ event, context }) => {
  const job = await context.Job.get(event.params.jobId.toString());
  if (!job) return;
  context.Job.set({ ...job, payoutLocked: true });
});

indexer.onEvent({ contract: "AccrueEscrow", event: "VaultShortfall" }, async ({ event, context }) => {
  jobEvent(context, event, event.params.jobId, "vault-shortfall", { amount: event.params.expected - event.params.received });
});

// ───────────────────────────── SLA ─────────────────────────────

indexer.onEvent({ contract: "SLAHook", event: "TermsCommitted" }, async ({ event, context }) => {
  const job = await context.Job.get(event.params.jobId.toString());
  if (!job) return;
  context.Job.set({
    ...job, deadline: BigInt(event.params.deadline), minFreshnessBlock: event.params.minFreshnessBlock,
    deliverableURI: event.params.deliverableURI, deliverableCommitment: event.params.deliverableCommitment,
  });
  jobEvent(context, event, event.params.jobId, "terms", { detail: `deadline ${event.params.deadline} minBlock ${event.params.minFreshnessBlock}` });
});

indexer.onEvent({ contract: "SLAHook", event: "SubmissionAccepted" }, async ({ event, context }) => {
  const job = await context.Job.get(event.params.jobId.toString());
  if (!job) return;
  context.Job.set({ ...job, freshnessBlock: event.params.freshnessBlock });
});

// ───────────────────────────── Evaluator ─────────────────────────────

indexer.onEvent({ contract: "Evaluator", event: "Attested" }, async ({ event, context }) => {
  const ts = BigInt(event.block.timestamp);
  const source = Number(event.params.source) === 0 ? "CRE" : "Committee";
  context.Attestation.set({
    id: evId(event), job_id: event.params.jobId.toString(), ok: event.params.ok, reason: event.params.reason, source,
    deliverable: event.params.deliverable, member: undefined, workflowId: undefined, workflowOwner: undefined,
    txHash: event.transaction.hash, timestamp: ts,
  });
  const job = await context.Job.get(event.params.jobId.toString());
  if (job) context.Job.set({ ...job, verdictOk: event.params.ok, verdictReason: event.params.reason, verdictSource: source });
  const g = await global(context, ts);
  context.GlobalStats.set({ ...g, attestationsCRE: g.attestationsCRE + (source === "CRE" ? 1 : 0), attestationsCommittee: g.attestationsCommittee + (source === "Committee" ? 1 : 0), updatedAt: ts });
});

indexer.onEvent({ contract: "Evaluator", event: "Vote" }, async ({ event, context }) => {
  jobEvent(context, event, event.params.jobId, "vote", { actor: event.params.member, detail: `vote ${event.params.count}` });
});

indexer.onEvent({ contract: "Evaluator", event: "DeadlineEnforced" }, async ({ event, context }) => {
  const job = await context.Job.get(event.params.jobId.toString());
  if (job) context.Job.set({ ...job, verdictOk: false, verdictReason: "sla:deadline", verdictSource: "Deadline" });
  jobEvent(context, event, event.params.jobId, "deadline-enforced", { detail: `deadline ${event.params.deadline}` });
});

indexer.onEvent({ contract: "Evaluator", event: "ReportReceived" }, async ({ event, context }) => {
  jobEvent(context, event, event.params.jobId, "cre-report", { actor: event.params.workflowOwner, detail: event.params.workflowId });
});

// ───────────────────────────── Advance pool ─────────────────────────────

indexer.onEvent({ contract: "AdvancePool", event: "Advanced" }, async ({ event, context }) => {
  const ts = BigInt(event.block.timestamp);
  const id = event.params.jobId.toString();
  context.Lien.set({
    id, job_id: id, provider: event.params.provider.toLowerCase(), principal: event.params.amount, bond: event.params.bond,
    rateWadPerBlock: event.params.rateWadPerBlock, maxAdvanceBps: Number(event.params.maxAdvanceBps), openedAt: ts,
    openedBlock: BigInt(event.block.number), closedAt: undefined, outcome: "open", interestRealised: undefined,
    seizedBond: undefined, principalShortfall: undefined, forwarded: undefined,
  });
  const job = await context.Job.get(id);
  if (job) context.Job.set({ ...job, lien_id: id, payoutLocked: true });
  jobEvent(context, event, event.params.jobId, "advanced", { actor: event.params.provider, amount: event.params.amount, detail: `bond ${event.params.bond}` });
  context.PoolSnapshot.set({ id: evId(event), kind: "advance", actor: event.params.provider.toLowerCase(), assets: event.params.amount, shares: undefined, outstandingDelta: event.params.amount, interestDelta: 0n, shortfallDelta: 0n, txHash: event.transaction.hash, timestamp: ts });
  const s = await poolStats(context, ts);
  context.PoolStats.set({ ...s, outstandingPrincipal: s.outstandingPrincipal + event.params.amount, advances: s.advances + 1, updatedAt: ts });
  const p = await provider(context, event.params.provider, ts);
  context.Provider.set({ ...p, advances: p.advances + 1, lastSeenAt: ts });
});

indexer.onEvent({ contract: "AdvancePool", event: "Repaid" }, async ({ event, context }) => {
  const ts = BigInt(event.block.timestamp);
  const id = event.params.jobId.toString();
  const lien = await context.Lien.get(id);
  if (lien) context.Lien.set({ ...lien, closedAt: ts, outcome: "repaid", interestRealised: event.params.interest, forwarded: event.params.forwarded });
  jobEvent(context, event, event.params.jobId, "repaid", { amount: event.params.principal + event.params.interest, detail: `interest ${event.params.interest}` });
  context.PoolSnapshot.set({ id: evId(event), kind: "repaid", actor: event.params.provider.toLowerCase(), assets: event.params.principal + event.params.interest, shares: undefined, outstandingDelta: -event.params.principal, interestDelta: event.params.interest, shortfallDelta: 0n, txHash: event.transaction.hash, timestamp: ts });
  const s = await poolStats(context, ts);
  context.PoolStats.set({ ...s, outstandingPrincipal: s.outstandingPrincipal - event.params.principal, realisedInterest: s.realisedInterest + event.params.interest, repaid: s.repaid + 1, updatedAt: ts });
  const p = await provider(context, event.params.provider, ts);
  context.Provider.set({ ...p, repaid: p.repaid + 1 });
});

indexer.onEvent({ contract: "AdvancePool", event: "Defaulted" }, async ({ event, context }) => {
  const ts = BigInt(event.block.timestamp);
  const id = event.params.jobId.toString();
  const lien = await context.Lien.get(id);
  if (lien) context.Lien.set({ ...lien, closedAt: ts, outcome: "defaulted", seizedBond: event.params.seizedBond, principalShortfall: event.params.principalShortfall });
  jobEvent(context, event, event.params.jobId, "defaulted", { amount: event.params.principalShortfall, detail: `seized bond ${event.params.seizedBond}` });
  const interestRealised = event.params.seizedBond > event.params.principal ? event.params.seizedBond - event.params.principal : 0n;
  context.PoolSnapshot.set({ id: evId(event), kind: "defaulted", actor: event.params.provider.toLowerCase(), assets: event.params.seizedBond, shares: undefined, outstandingDelta: -event.params.principal, interestDelta: interestRealised, shortfallDelta: event.params.principalShortfall, txHash: event.transaction.hash, timestamp: ts });
  const s = await poolStats(context, ts);
  context.PoolStats.set({ ...s, outstandingPrincipal: s.outstandingPrincipal - event.params.principal, realisedInterest: s.realisedInterest + interestRealised, totalShortfall: s.totalShortfall + event.params.principalShortfall, defaults: s.defaults + 1, updatedAt: ts });
  const p = await provider(context, event.params.provider, ts);
  context.Provider.set({ ...p, defaults: p.defaults + 1 });
});

indexer.onEvent({ contract: "AdvancePool", event: "Forwarded" }, async ({ event, context }) => {
  jobEvent(context, event, event.params.jobId, "forwarded", { actor: event.params.provider, amount: event.params.amount });
});

indexer.onEvent({ contract: "AdvancePool", event: "Deposit" }, async ({ event, context }) => {
  const ts = BigInt(event.block.timestamp);
  context.PoolSnapshot.set({ id: evId(event), kind: "deposit", actor: event.params.owner.toLowerCase(), assets: event.params.assets, shares: event.params.shares, outstandingDelta: 0n, interestDelta: 0n, shortfallDelta: 0n, txHash: event.transaction.hash, timestamp: ts });
  const s = await poolStats(context, ts);
  context.PoolStats.set({ ...s, deposits: s.deposits + event.params.assets, updatedAt: ts });
});

indexer.onEvent({ contract: "AdvancePool", event: "Withdraw" }, async ({ event, context }) => {
  const ts = BigInt(event.block.timestamp);
  context.PoolSnapshot.set({ id: evId(event), kind: "withdraw", actor: event.params.owner.toLowerCase(), assets: event.params.assets, shares: event.params.shares, outstandingDelta: 0n, interestDelta: 0n, shortfallDelta: 0n, txHash: event.transaction.hash, timestamp: ts });
  const s = await poolStats(context, ts);
  context.PoolStats.set({ ...s, withdrawals: s.withdrawals + event.params.assets, updatedAt: ts });
});

indexer.onEvent({ contract: "AdvancePool", event: "CreditFeedback" }, async ({ event, context }) => {
  context.Feedback.set({ id: evId(event), job_id: event.params.jobId.toString(), agentId: event.params.agentId, value: event.params.tag2 === "repaid" ? 100n : 0n, tag2: `credit:${event.params.tag2}`, skipped: false, txHash: event.transaction.hash, timestamp: BigInt(event.block.timestamp) });
});

// ───────────────────────────── Reputation ─────────────────────────────

indexer.onEvent({ contract: "ReputationHook", event: "FeedbackWritten" }, async ({ event, context }) => {
  context.Feedback.set({ id: evId(event), job_id: event.params.jobId.toString(), agentId: event.params.agentId, value: event.params.value, tag2: event.params.tag2, skipped: false, txHash: event.transaction.hash, timestamp: BigInt(event.block.timestamp) });
  jobEvent(context, event, event.params.jobId, "reputation", { detail: `${event.params.tag2} → ${event.params.value}` });
});

indexer.onEvent({ contract: "ReputationHook", event: "FeedbackSkipped" }, async ({ event, context }) => {
  context.Feedback.set({ id: evId(event), job_id: event.params.jobId.toString(), agentId: event.params.agentId, value: 0n, tag2: "skipped", skipped: true, txHash: event.transaction.hash, timestamp: BigInt(event.block.timestamp) });
});
