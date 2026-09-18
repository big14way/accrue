import { ENVIO } from "./config";

export async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T | undefined> {
  if (!ENVIO) return undefined;
  try {
    const res = await fetch(ENVIO, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, variables }), cache: "no-store" });
    const body = await res.json();
    if (body.errors) throw new Error(JSON.stringify(body.errors));
    return body.data as T;
  } catch (e) {
    console.warn("envio unavailable", e);
    return undefined;
  }
}

export const Q_GLOBAL = `{ GlobalStats(where:{id:{_eq:"global"}}) { jobs funded completed rejected expired volumeFunded yieldRealised refunds attestationsCRE attestationsCommittee updatedAt } PoolStats(where:{id:{_eq:"pool"}}) { deposits withdrawals outstandingPrincipal realisedInterest totalShortfall advances repaid defaults updatedAt } }`;
export const Q_JOBS = `query($limit:Int!){ Job(order_by:{createdAt:desc}, limit:$limit){ id status client provider providerAgentId budget deadline expiredAt createdAt fundedAt settledAt settledTx yieldRealised yieldToProvider verdictOk verdictReason verdictSource refunded principalPaid lien_id } }`;
export const Q_JOB = `query($id:String!){ Job(where:{id:{_eq:$id}}){ id status client provider providerAgentId evaluator hook budget token expiredAt deadline minFreshnessBlock deliverableURI deliverable freshnessBlock submittedAt yieldToClientBps yieldToProviderBps yieldToProtocolBps principalPaid yieldRealised yieldToClient yieldToProvider yieldToProtocol refunded paidTo payoutReceiver payoutLocked verdictOk verdictReason verdictSource createdAt createdTx fundedAt settledAt settledTx } JobEvent(where:{job_id:{_eq:$id}}, order_by:{timestamp:asc}){ id kind actor amount detail txHash blockNumber timestamp } Lien(where:{id:{_eq:$id}}){ provider principal bond rateWadPerBlock maxAdvanceBps openedAt outcome interestRealised seizedBond principalShortfall forwarded } Attestation(where:{job_id:{_eq:$id}}){ ok reason source txHash timestamp } Feedback(where:{job_id:{_eq:$id}}){ agentId value tag2 skipped txHash } }`;
export const Q_PROVIDER = `query($id:String!){ Provider(where:{id:{_eq:$id}}){ id agentId jobs completed onTime late rejected advances repaid defaults earned yieldBonus lastSeenAt } Job(where:{provider:{_eq:$id}}, order_by:{createdAt:desc}, limit:50){ id status budget createdAt settledAt verdictReason yieldToProvider } }`;
export const Q_POOL = `{ PoolStats(where:{id:{_eq:"pool"}}){ deposits withdrawals outstandingPrincipal realisedInterest totalShortfall advances repaid defaults updatedAt } PoolSnapshot(order_by:{timestamp:desc}, limit:50){ id kind actor assets shares outstandingDelta interestDelta shortfallDelta txHash timestamp } Lien(order_by:{openedAt:desc}, limit:50){ id provider principal bond rateWadPerBlock maxAdvanceBps openedAt closedAt outcome interestRealised seizedBond principalShortfall } }`;
export const Q_REFUSALS = `{ Job(where:{status:{_in:["Rejected","Expired"]}}, order_by:{settledAt:desc}, limit:50){ id status provider budget verdictReason verdictSource settledTx settledAt refunded } Attestation(where:{ok:{_eq:false}}, order_by:{timestamp:desc}, limit:50){ job_id reason source txHash timestamp } }`;
