#!/usr/bin/env python3
"""Writes demo.json for build_demo_say.py from the recorded clips and the narration."""
import json, os, subprocess
HERE = os.path.dirname(os.path.abspath(__file__))
CLIPS = os.path.join(HERE, 'rec', 'clips')
FONTS = '/Users/gwill/.claude/skills/demo-video/assets/fonts'
IMG = '/Users/gwill/Developer/acrrue/apps/console/public/img'

def dur(name):
    p = os.path.join(CLIPS, name)
    return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p]).decode().strip())

def lap(id, src, step, head, sub, vo, cut=None, max_speed=1.0, hold=None):
    d = dur(src)
    crop = [1760, 960, 80, 60] if src.startswith('term_') else [1920, 1080, 0, 0]
    sc = {"id": id, "kind": "laptop", "layout": "wide", "src": src, "cut": cut or [0.3, round(d - 0.2, 2)], "crop": crop, "max_speed": max_speed, "step": step, "head": head, "sub": sub, "vo": vo}
    return sc

cfg = {
  "clips_dir": "rec/clips", "work_dir": ".demo-build", "output": "accrue-pitch.mp4",
  "voice": "en-US-AndrewMultilingualNeural", "voice_rate": "-4%", "voice_tempo": 1.0, "crossfade": 0.5,
  "sfx_click": "rec/click.wav", "sfx_gain": 0.6,
  "brand": {
    "name": "Accrue", "domain": "accrue-virid.vercel.app",
    "paper": "#06090c", "paper_deep": "#111820", "ink": "#f2f6f8", "ink_soft": "#aab6c2", "ink_faint": "#5f6b78",
    "accent": "#7ee2b8", "accent_soft": "#bff0dc", "card": "#0b3d2e",
    "fonts": {"display": f"{FONTS}/barlowsc-700.ttf", "bold": f"{FONTS}/barlow-700.ttf", "semi": f"{FONTS}/barlow-600.ttf"}
  },
  "scenes": [
    {"id": "s0", "kind": "title", "image": f"{IMG}/hero.jpg", "tagline": "Escrow that earns while it waits. Pays only on verified delivery. Lets the provider borrow against it.", "tag": "Monad Metropolis · Track 1 · Onchain Finance",
     "vo": "This is Accrue. Escrow that earns while it waits, pays only on verified delivery, and lets the provider borrow against it. Built on Monad."},
    {"id": "p1", "kind": "slide", "image": f"{IMG}/vault.jpg", "label": "The problem", "head": "Agents are hiring agents. The money is stuck in the past.", "columns": 1, "row_h": 130,
     "bullets": [{"k": "Idle capital", "v": "The budget sits locked in escrow for the whole job, earning nothing."},
                 {"k": "Slow cash", "v": "The provider waits weeks to be paid, because a human has to click approve."},
                 {"k": "One server decides", "v": "Whoever deployed the marketplace decides who gets the money."}],
     "vo": "Picture an agent that just finished a week of work for another agent. The budget sat locked in escrow the whole time, earning nothing. Now it waits weeks to be paid, because somewhere a human has to click approve. And if there is a dispute, one server, run by whoever deployed the marketplace, decides who gets the money. Idle capital. Slow cash. A single point of trust. That is agent commerce today, and it cannot scale."},
    {"id": "p2", "kind": "slide", "diagram": "flow", "label": "What Accrue changes", "head": "Three changes. Every one enforced by an immutable contract.", "columns": 1, "row_h": 130,
     "bullets": [{"k": "Yield-bearing escrow", "v": "The budget goes into an ERC-4626 vault the moment the job is funded."},
                 {"k": "Receivables advance", "v": "The provider borrows against the job now, priced from its ERC-8004 history."},
                 {"k": "Evaluator is a contract", "v": "The verdict comes from Chainlink CRE or a committee, bound to the submitted hash."}],
     "vo": "Accrue changes all three. The budget goes into a yield vault the moment the job is funded. The provider can borrow against the job right now, at a rate priced from its own on-chain track record. And the verdict on delivery comes from a contract fed by Chainlink, not from a server. Every rule is enforced by immutable contracts. No admin key, no pause, no upgrade."},
    lap("s1", "landing.webm", "01", "Live on Monad testnet, settling in Agora AUSD", "Job #1 is funded with 1,000 AUSD. The counter moves every 400 ms block.",
        "placeholder", cut=[4.0, 40.0], max_speed=2.0),
    lap("s2", "post.webm", "02", "Post a job in plain English", "Deadline, freshness rule and the provider's completion bonus are committed on chain.",
        "A client describes the work in plain English, sets the deadline, the freshness rule, and how much of the yield the provider earns as a completion bonus. Funding is one transaction, and the budget is inside the vault before the next block.", cut=[0.8, round(dur("post.webm") - 0.3, 2)], max_speed=1.6),
    lap("s3", "job.webm", "03", "Yield accrues per block, anchored to the contract", "previewSettlement() is re-read every two seconds; the timeline comes from Envio.",
        "Every job page shows the yield accruing in real time, anchored to the contract's own settlement preview, with the full timeline indexed by Envio.", cut=[3.5, round(dur("job.webm") - 0.3, 2)], max_speed=1.6),
    lap("s3b", "envio_still.mp4", "", "History served by Envio HyperIndex", "Hosted on Envio Cloud, synced over HyperSync; the console reads liens, refusals and timelines from it.",
        "Every history view in the console, timelines, liens and refusals, is indexed by Envio HyperIndex and served from Envio Cloud.", cut=[0, 8.8]),
    lap("s4", "provider.webm", "04", "Credit priced from ERC-8004 history", "Advance limit, APR per block and bond come from a pure view function anyone can audit.",
        "The provider's credit limit, interest rate and bond come from its ERC-8004 reputation. On-time deliveries lower the rate. Rejections raise it. A default cuts the limit. The scorer is a pure view function, so anyone can audit the number.", cut=[8.5, round(dur("provider.webm") - 0.3, 2)], max_speed=1.4),
    lap("s5", "pool.webm", "05", "An advance, a bad delivery, a priced loss", "Drill 3: bond seized, shortfall recorded, ERC-8004 default written, limit 10 % to 0 %.",
        "In drill three the provider took an advance, delivered a hash that did not match what it served, and was rejected. Its bond was seized, the shortfall recorded, an ERC-8004 default written, and its advance limit fell from ten percent to zero. Risk is priced, and a loss is a recorded loss.", cut=[7.2, round(dur("pool.webm") - 0.3, 2)], max_speed=1.4),
    lap("s6", "term_d2.webm", "06", "One transaction settles every leg", "Drill 2 on the AUSD deployment: vault redeemed, pool repaid, provider, client and protocol paid, ERC-8004 written.",
        "When delivery is verified, one transaction does everything. The vault is redeemed. The pool is repaid first. The provider receives the principal plus its share of the yield. The client and the protocol receive theirs. And the outcome is written to ERC-8004 in the same block.", cut=[0.2, round(dur("term_d2.webm") - 0.3, 2)], max_speed=1.5),
    lap("s6b", "explorer_still.mp4", "", "The settlement on the Monad explorer", "One Attest call: 1,000 AUSD out of the vault, 1,000 to the provider, the client's and the protocol's share of the yield.",
        "On the explorer that is a single call. One thousand AUSD leaves the vault, one thousand reaches the provider, and the client and the protocol receive their share of the yield, all in the same transaction.", cut=[0, 8.8]),
    lap("s7", "refusals.webm", "07", "Refusals you can link to", "Stale data, missed deadlines, empty hashes and wrong-hash verdicts revert in the caller's own transaction.",
        "Deterministic rules revert in the provider's own transaction: stale data, a missed deadline, an empty hash, a verdict for the wrong hash. Every refusal is a transaction you can link to.", cut=[7.2, round(dur("refusals.webm") - 0.3, 2)], max_speed=1.6),
    lap("s8", "term_d6.webm", "08", "A hostile Claude agent tried to get paid without delivering", "Drill 6 transcript: direct completion, fabricated deliverable and self-attestation all refused on chain.",
        "We handed a Claude agent the provider key and told it to get paid without doing the work. It tried a direct completion, a fabricated deliverable and a self-attestation. Every path was refused on chain. The advance it took became a recorded default, and its credit limit fell from fifty-five to forty percent.", cut=[0.2, round(dur("term_d6.webm") - 0.3, 2)], max_speed=2.0),
    lap("s9", "term_cre.webm", "09", "The evaluator is a Chainlink CRE workflow", "Re-fetch inside the DON, consensus on the body, verdict through the Keystone forwarder. Job #20 settled this way.",
        "The evaluator is a contract. A Chainlink CRE workflow re-fetches the deliverable inside the DON, reaches consensus on the body, and delivers the verdict through the Keystone forwarder. Job twenty was settled exactly that way. A threshold committee is the fallback, and a verdict for any other hash is refused.", cut=[0.2, round(dur("term_cre.webm") - 0.3, 2)], max_speed=1.3),
    {"id": "p3", "kind": "slide", "image": f"{IMG}/speed.jpg", "label": "Why Monad", "head": "Per-block interest at 400 ms. A refusal you can link to costs cents.", "columns": 2, "row_h": 150,
     "bullets": [{"k": "Drill 5", "v": "20 jobs funded and settled back to back"}, {"k": "141 transactions", "v": "across 1,349 blocks, 262 s of chain time"},
                 {"k": "39.4 M gas", "v": "about 0.2 MON per full job lifecycle"}, {"k": "ERC-8004 on Monad", "v": "credit history native to the chain"}],
     "vo": "Why Monad. Per-block interest at four hundred milliseconds, a yield counter that moves on every read, and a refusal you can link to, all for cents. In drill five we funded and settled twenty jobs back to back: one hundred and forty-one transactions across one thousand three hundred and forty-nine blocks, thirty-nine million gas, about a fifth of a MON per job lifecycle. And because ERC-8004 lives on Monad, credit history is native to the chain."},
    {"id": "p4", "kind": "slide", "image": f"{IMG}/nodes.jpg", "label": "Built on", "head": "Load-bearing integrations, not badges.", "columns": 2, "row_h": 110,
     "bullets": [{"k": "Agora AUSD", "v": "settlement asset"}, {"k": "Chainlink CRE", "v": "the evaluator"},
                 {"k": "Envio HyperIndex", "v": "every history view, hosted on Envio Cloud"}, {"k": "ERC-8004", "v": "identity and reputation"},
                 {"k": "x402 + MPP", "v": "per-call provider payments"}, {"k": "Privy · Nansen · Morpho", "v": "human onboarding, counterparty labels, mainnet yield"}],
     "vo": "Load-bearing integrations, not badges. Agora's AUSD is the settlement asset. Chainlink CRE is the evaluator. Envio HyperIndex, hosted on Envio Cloud, feeds every history view in the console. ERC-8004 provides identity and reputation. Providers are paid per call over x402 and Monad's MPP. Privy onboards humans. Nansen labels counterparties. And on mainnet, Morpho vaults are the yield source."},
    {"id": "p5", "kind": "slide", "image": f"{IMG}/flow.jpg", "label": "Revenue model", "head": "Revenue scales with escrowed volume, not headcount.", "columns": 1, "row_h": 130,
     "bullets": [{"k": "Yield share", "v": "A protocol share of realised yield on every settled job, set in the job's yield policy. The demo runs at 10 %."},
                 {"k": "Advance interest", "v": "Accrues to the lending pool today."},
                 {"k": "Next on mainnet", "v": "A spread on advance interest and an origination fee on advances."}],
     "vo": "The business model is simple. The protocol takes a share of the realised yield on every settled job, written into the job's own yield policy. The demo runs at ten percent. Advances earn interest for the lending pool today, and on mainnet a spread on that interest and an origination fee on advances are the next levers. Revenue scales with escrowed volume, not with headcount."},
    {"id": "p6", "kind": "slide", "image": f"{IMG}/ribbons.jpg", "label": "Track 1 · Onchain Finance & Trading", "head": "Undercollateralised credit priced on onchain history. Yield on idle capital. Settlement only Monad's speed makes viable.", "columns": 1, "row_h": 120,
     "bullets": [{"k": "For the ecosystem", "v": "Every agent marketplace on Monad that plugs in becomes a source of yield, credit and reputation."}],
     "vo": "Track one asks for onchain finance: undercollateralised lending priced on onchain credit history, yield on idle capital, and settlement that only Monad's speed makes viable. Accrue is all three. And every agent marketplace on Monad that plugs in becomes a source of yield, credit and reputation for the whole ecosystem."},
    {"id": "s99", "kind": "end", "image": f"{IMG}/hero.jpg", "lines": ["Post a job.", "Watch it earn.", "Get paid on proof."],
     "links": [["Console", "accrue-virid.vercel.app"], ["Code", "github.com/big14way/accrue"], ["Drills", "every step links to its transaction"]],
     "footer": "Monad testnet · Agora AUSD · Chainlink CRE · Envio · ERC-8004",
     "vo": "Accrue. Post a job. Watch it earn. Get paid on proof. The console, the code and every drill transaction are in the links."}
  ]
}

VO = {
 "s0": "This is Accrue. Escrow that earns while it waits, pays only on verified delivery, and lets the provider borrow against it.",
 "p1": "Picture an agent that just finished a week of work for another agent. The budget sat idle in escrow the whole time. Now it waits weeks to be paid, because a human has to click approve. And in a dispute, one server decides who gets the money. Idle capital. Slow cash. One point of trust.",
 "p2": "Accrue changes all three. The budget earns yield from the moment it is funded. The provider borrows against the job today, at a rate priced from its own on-chain record. And the verdict comes from a contract fed by Chainlink, not a server. No admin key.",
 "s1": "Accrue is live on Monad testnet, settling in Agora's AUSD. Job one holds one thousand AUSD, and its yield counter moves with every four hundred millisecond block.",
 "s2": "A client describes the work in plain English, sets the deadline and the provider's completion bonus, and funds it. The budget is in the vault before the next block.",
 "s3": "Every job page shows yield accruing live, anchored to the contract's own settlement preview, with the timeline indexed by Envio.",
 "s3b": "Every history view, timelines, liens and refusals, comes from Envio HyperIndex, hosted on Envio Cloud.",
 "s4": "Credit limit, rate and bond come from the provider's ERC-8004 reputation. On-time work lowers the rate, rejections raise it, a default cuts the limit. The scorer is a pure view anyone can audit.",
 "s5": "In drill three the provider took an advance, delivered a mismatching hash and was rejected. Bond seized, shortfall recorded, an ERC-8004 default written, limit cut from ten percent to zero. A loss is a recorded loss.",
 "s6": "When delivery is verified, one transaction does everything: vault redeemed, pool repaid first, provider paid with its yield bonus, client and protocol paid their share, outcome written to ERC-8004.",
 "s6b": "On the explorer that is one call: a thousand AUSD out of the vault, a thousand to the provider, and every yield share, in one transaction.",
 "s7": "Deterministic rules revert in the provider's own transaction: stale data, a missed deadline, a wrong-hash verdict. Every refusal is a transaction you can link to.",
 "s8": "We gave a Claude agent the provider key and told it to get paid without doing the work. Direct completion, a fabricated deliverable, a self-attestation: every path was refused on chain. Its advance became a recorded default and its credit limit fell from fifty-five to forty percent.",
 "s9": "The evaluator is a contract. A Chainlink CRE workflow re-fetches the deliverable inside the DON, reaches consensus, and delivers the verdict through the Keystone forwarder. Job twenty settled that way. A verdict for any other hash is refused.",
 "p3": "Why Monad. Per-block interest at four hundred milliseconds, and a refusal you can link to for cents. Drill five settled twenty jobs back to back: one hundred forty-one transactions across one thousand three hundred forty-nine blocks, about a fifth of a MON per job. And ERC-8004 lives here, so credit history is native.",
 "p4": "Load-bearing integrations. Agora's AUSD settles. Chainlink CRE evaluates. Envio indexes every history view. ERC-8004 carries identity and reputation. x402 and Monad's MPP pay providers per call. Privy onboards humans, Nansen labels counterparties, and on mainnet Morpho supplies the yield.",
 "p5": "The model is simple. A protocol share of realised yield on every settled job, set in the job's own policy, ten percent in the demo. Advance interest goes to the pool today; a spread and an origination fee come on mainnet. Revenue scales with escrowed volume.",
 "p6": "Track one asks for onchain finance: undercollateralised credit priced on onchain history, yield on idle capital, settlement only Monad's speed makes viable. Accrue is all three, and every marketplace that plugs in feeds yield, credit and reputation back to the ecosystem.",
 "s99": "Accrue. Post a job. Watch it earn. Get paid on proof. Console, code and every drill transaction are in the links.",
}
for sc in cfg["scenes"]:
    if sc["id"] in VO: sc["vo"] = VO[sc["id"]]

out = os.path.join(HERE, 'demo.json')
json.dump(cfg, open(out, 'w'), indent=1)
print('wrote', out, 'scenes', len(cfg['scenes']))
