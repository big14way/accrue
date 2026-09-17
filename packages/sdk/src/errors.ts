import { type Abi, BaseError, ContractFunctionRevertedError, decodeErrorResult, formatUnits } from "viem";
import { accrueEscrowAbi, sLAHookAbi, evaluatorAbi, advancePoolAbi, complianceHookAbi, hookRouterAbi } from "./abis/index.js";

export const ALL_ERROR_ABIS: Abi = [
  ...accrueEscrowAbi,
  ...sLAHookAbi,
  ...evaluatorAbi,
  ...advancePoolAbi,
  ...complianceHookAbi,
  ...hookRouterAbi,
].filter((x) => x.type === "error") as unknown as Abi;

const SENTENCES: Record<string, (args: readonly unknown[], decimals: number) => string> = {
  // Escrow
  InvalidJob: () => "That job id does not exist.",
  WrongStatus: () => "The job is not in a state that allows this action.",
  Unauthorized: () => "The caller is not allowed to perform this action on this job.",
  ExpiryTooShort: () => "The job must expire at least 5 minutes in the future.",
  ProviderNotSet: () => "The job has no provider yet.",
  BudgetMismatch: () => "The budget you expected does not match the budget the provider set.",
  PaymentTokenMismatch: () => "The token you expected is not the escrow's payment token.",
  PaymentTokenNotAllowed: () => "This escrow only accepts its configured payment token.",
  ZeroBudget: () => "A job cannot be funded with a zero budget.",
  GracePeriodActive: () => "The evaluator still has its grace period to finalise this submitted job.",
  InvalidYieldPolicy: () => "Yield policy shares must add up to 100 %.",
  PayoutLocked: () => "The payout route is locked by a lender until the advance is repaid.",
  NotLocker: () => "Only the contract that locked the payout route can unlock it.",
  ReceiverMustBeContract: () => "Only a contract receiver can lock the payout route.",
  InvalidHook: () => "The hook address does not implement IERC8183Hook.",
  InvalidReceiver: () => "That payout receiver would strand funds.",
  // SLA
  TermsNotCommitted: (a) => `SLA terms were never committed for job ${a[0]}.`,
  DeadlinePassed: (a) => `The SLA deadline (${ts(a[0])}) has passed; it is now ${ts(a[1])}.`,
  DeadlineAfterExpiry: (a) => `The SLA deadline (${ts(a[0])}) cannot be after the escrow expiry (${ts(a[1])}).`,
  DeadlineInPast: (a) => `The SLA deadline (${ts(a[0])}) is already in the past.`,
  EmptyDeliverable: () => "The deliverable hash cannot be empty.",
  StaleData: (a) => `Stale data: the job requires data from block ${a[0]} or later, but the delivery is from block ${a[1]}.`,
  FutureBlock: (a) => `The declared freshness block ${a[0]} is in the future (current block ${a[1]}).`,
  NotClient: () => "Only the job's client can commit SLA terms.",
  JobNotOpen: () => "SLA terms can only be committed while the job is Open.",
  NotTrustedCaller: () => "This hook only accepts callbacks from its escrow or router.",
  NotEscrow: () => "Only the escrow may call this.",
  // Evaluator
  NotForwarder: () => "Only the Chainlink CRE forwarder can deliver reports.",
  WrongWorkflowOwner: (a) => `Report came from an unexpected workflow owner (${a[0]}).`,
  NotMember: () => "The caller is not on the evaluator committee.",
  AlreadyVoted: () => "This committee member already voted on this verdict.",
  NotSubmitted: (a) => `Job ${a[0]} is not in the Submitted state.`,
  DeliverableMismatch: (a) => `The attested deliverable (${short(a[1])}) does not match what the provider submitted (${short(a[0])}).`,
  DeadlineNotPassed: (a) => `The SLA deadline for job ${a[0]} has not passed yet.`,
  // Pool
  NotProvider: () => "Only the job's provider can borrow against it.",
  JobNotFunded: () => "Advances are only available against Funded jobs.",
  LienExists: () => "There is already an open advance on this job.",
  NoLien: () => "There is no open advance on this job.",
  PayoutNotRouted: () => "Route the job's payout to the pool first (setPayoutReceiver).",
  PayoutAlreadyLocked: () => "The payout route is already locked by another receiver.",
  ExceedsCreditLimit: (a, d) => `Requested ${fmt(a[0], d)} exceeds this provider's credit limit of ${fmt(a[1], d)} on this job.`,
  InsufficientLiquidity: (a, d) => `The pool has ${fmt(a[1], d)} available; ${fmt(a[0], d)} was requested.`,
  PoolCapReached: (a, d) => `The pool's outstanding cap leaves ${fmt(a[1], d)} of headroom; ${fmt(a[0], d)} was requested.`,
  JobNotTerminal: () => "The job must be Rejected or Expired before its lien can be resolved.",
  ZeroAmount: () => "Amount must be greater than zero.",
  // Compliance
  NotVerified: (a) => `${a[0]} does not hold a valid tier-${a[1]} credential.`,
};

function ts(v: unknown): string {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : String(v);
}
function short(v: unknown): string {
  const s = String(v);
  return s.length > 12 ? `${s.slice(0, 8)}…${s.slice(-4)}` : s;
}
function fmt(v: unknown, decimals: number): string {
  try {
    return `${formatUnits(BigInt(v as string), decimals)} USD`;
  } catch {
    return String(v);
  }
}

export interface ExplainedError {
  name: string;
  args: readonly unknown[];
  sentence: string;
}

/** Turns a typed revert (from a viem error or raw revert data) into a human sentence. */
export function explainRevert(errOrData: unknown, decimals = 6): ExplainedError | undefined {
  let data: `0x${string}` | undefined;
  if (typeof errOrData === "string" && errOrData.startsWith("0x")) data = errOrData as `0x${string}`;
  if (errOrData instanceof BaseError) {
    const revert = errOrData.walk((e) => e instanceof ContractFunctionRevertedError) as
      | ContractFunctionRevertedError
      | undefined;
    if (revert?.data) {
      const name = revert.data.errorName;
      const args = (revert.data.args ?? []) as readonly unknown[];
      const f = SENTENCES[name];
      return { name, args, sentence: f ? f(args, decimals) : `${name}(${args.map(String).join(", ")})` };
    }
    data = revert?.raw;
  }
  if (!data) return undefined;
  try {
    const decoded = decodeErrorResult({ abi: ALL_ERROR_ABIS, data });
    const args = (decoded.args ?? []) as readonly unknown[];
    const f = SENTENCES[decoded.errorName];
    return {
      name: decoded.errorName,
      args,
      sentence: f ? f(args, decimals) : `${decoded.errorName}(${args.map(String).join(", ")})`,
    };
  } catch {
    return undefined;
  }
}
