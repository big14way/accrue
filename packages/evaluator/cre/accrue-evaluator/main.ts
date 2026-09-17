/**
 * Accrue evaluator — Chainlink CRE workflow.
 *
 * Trigger:  AccrueEscrow.JobSubmitted(jobId, provider, deliverable) on Monad.
 * Steps:    1. read the job + SLA terms from chain (EVM read)
 *           2. re-fetch the deliverable at the declared freshness block (HTTP, DON consensus)
 *           3. keccak256 the body and compare with the submitted hash
 *           4. sign a report (jobId, deliverable, ok, reason) and write it to Evaluator.onReport
 *              through the KeystoneForwarder — which completes or rejects the job atomically.
 *
 * Simulate:  cre workflow simulate accrue-evaluator --target staging-settings --broadcast
 */
import {
  EVMClient,
  HTTPClient,
  Runner,
  bytesToHex,
  encodeCallMsg,
  getNetwork,
  handler,
  hexToBase64,
  consensusIdenticalAggregation,
  type EVMLog,
  type Runtime,
  type NodeRuntime,
} from "@chainlink/cre-sdk";
import {
  decodeAbiParameters,
  decodeFunctionResult,
  encodeAbiParameters,
  encodeFunctionData,
  keccak256,
  parseAbi,
  parseAbiParameters,
  stringToBytes,
  toBytes,
  toHex,
  type Hex,
} from "viem";

type Config = {
  chainSelectorName: string;
  escrowAddress: string;
  slaHookAddress: string;
  evaluatorAddress: string;
  gasLimit: string;
};

const escrowAbi = parseAbi([
  "function getJob(uint256 jobId) view returns ((address client,uint8 status,address provider,uint48 expiredAt,address evaluator,uint48 submittedAt,uint256 budget,address hook,address paymentToken,uint256 providerAgentId,string description,address payoutReceiver,bytes32 deliverable,uint256 vaultShares,(uint16 toClientBps,uint16 toProviderBps,uint16 toProtocolBps) yieldPolicy))",
]);
const slaAbi = parseAbi([
  "function terms(uint256 jobId) view returns ((uint48 deadline,uint64 minFreshnessBlock,bytes32 deliverableCommitment,string deliverableURI))",
  "function submission(uint256 jobId) view returns ((uint64 freshnessBlock,uint48 submittedAt,bytes32 deliverable))",
]);

const JOB_SUBMITTED = keccak256(toBytes("JobSubmitted(uint256,address,bytes32)"));

function reason32(s: string): Hex {
  return toHex(toBytes(s), { size: 32 });
}

const onJobSubmitted = (runtime: Runtime<Config>, log: EVMLog): string => {
  const cfg = runtime.config;
  const network = getNetwork({ chainFamily: "evm", chainSelectorName: cfg.chainSelectorName, isTestnet: cfg.chainSelectorName.includes("testnet") });
  if (!network) throw new Error(`unknown network ${cfg.chainSelectorName}`);
  const evm = new EVMClient(network.chainSelector.selector);

  const jobId = BigInt(bytesToHex(log.topics[1]));
  const submittedHash = bytesToHex(log.data.slice(0, 32)) as Hex;
  runtime.log(`JobSubmitted #${jobId} deliverable ${submittedHash}`);

  // 1. read job + terms
  const jobRes = evm
    .callContract(runtime, {
      call: encodeCallMsg({ from: "0x0000000000000000000000000000000000000000", to: cfg.escrowAddress as Hex, data: encodeFunctionData({ abi: escrowAbi, functionName: "getJob", args: [jobId] }) }),
    })
    .result();
  const job = decodeFunctionResult({ abi: escrowAbi, functionName: "getJob", data: bytesToHex(jobRes.data) as Hex });
  const termsRes = evm
    .callContract(runtime, {
      call: encodeCallMsg({ from: "0x0000000000000000000000000000000000000000", to: cfg.slaHookAddress as Hex, data: encodeFunctionData({ abi: slaAbi, functionName: "terms", args: [jobId] }) }),
    })
    .result();
  const terms = decodeFunctionResult({ abi: slaAbi, functionName: "terms", data: bytesToHex(termsRes.data) as Hex });
  const subRes = evm
    .callContract(runtime, {
      call: encodeCallMsg({ from: "0x0000000000000000000000000000000000000000", to: cfg.slaHookAddress as Hex, data: encodeFunctionData({ abi: slaAbi, functionName: "submission", args: [jobId] }) }),
    })
    .result();
  const sub = decodeFunctionResult({ abi: slaAbi, functionName: "submission", data: bytesToHex(subRes.data) as Hex });

  let ok = false;
  let reason = "cre:no-uri";
  if (job.status === 2 && terms.deliverableURI) {
    const url = terms.deliverableURI.replace("{jobId}", jobId.toString()) + (terms.deliverableURI.includes("?") ? "&" : "?") + `block=${sub.freshnessBlock}`;
    // 2. re-fetch inside the DON; every node must see the identical body
    const http = new HTTPClient();
    const body = runtime
      .runInNodeMode(
        (nodeRuntime: NodeRuntime<Config>) => {
          const res = http.sendRequest(nodeRuntime, { url, method: "GET" }).result();
          return new TextDecoder().decode(res.body);
        },
        consensusIdenticalAggregation<string>(),
      )()
      .result();
    // 3. hash and compare
    const fetched = keccak256(stringToBytes(body));
    ok = fetched.toLowerCase() === job.deliverable.toLowerCase();
    reason = ok ? "cre:verified" : "cre:hash-mismatch";
    runtime.log(`fetched ${fetched} vs submitted ${job.deliverable} → ${reason}`);
  }

  // 4. report → Evaluator.onReport via the forwarder
  const payload = encodeAbiParameters(parseAbiParameters("uint256 jobId, bytes32 deliverable, bool ok, bytes32 reason"), [jobId, job.deliverable, ok, reason32(reason)]);
  const report = runtime.report({ encodedPayload: hexToBase64(payload), encoderName: "evm", signingAlgo: "ecdsa", hashingAlgo: "keccak256" }).result();
  const tx = evm.writeReport(runtime, { receiver: cfg.evaluatorAddress, report, gasConfig: { gasLimit: cfg.gasLimit } }).result();
  const txHash = tx.txHash ? bytesToHex(tx.txHash) : "(simulated)";
  runtime.log(`writeReport ${txHash}`);
  return `job ${jobId}: ${reason} tx ${txHash}`;
};

const initWorkflow = (config: Config) => {
  const network = getNetwork({ chainFamily: "evm", chainSelectorName: config.chainSelectorName, isTestnet: config.chainSelectorName.includes("testnet") });
  if (!network) throw new Error(`unknown network ${config.chainSelectorName}`);
  const evm = new EVMClient(network.chainSelector.selector);
  return [
    handler(
      evm.logTrigger({
        addresses: [hexToBase64(config.escrowAddress as Hex)],
        topics: [{ values: [hexToBase64(JOB_SUBMITTED)] }],
        confidence: "CONFIDENCE_LEVEL_FINALIZED",
      }),
      onJobSubmitted,
    ),
  ];
};

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}

main();
