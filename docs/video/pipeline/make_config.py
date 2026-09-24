#!/usr/bin/env python3
"""Writes demo.json for build_demo_say.py: the 4-minute pitch + demo cut of Accrue."""
import json, os, subprocess
HERE = os.path.dirname(os.path.abspath(__file__))
CLIPS = os.path.join(HERE, 'rec', 'clips')
FONTS = '/Users/gwill/.claude/skills/demo-video/assets/fonts'
IMG = '/Users/gwill/Developer/acrrue/apps/console/public/img'

def dur(name):
    p = os.path.join(CLIPS, name)
    return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p]).decode().strip())

def lap(id, src, step, head, sub, vo, cut=None, max_speed=1.0):
    d = dur(src)
    crop = [1760, 960, 80, 60] if src.startswith('term_') else [1920, 1080, 0, 0]
    return {"id": id, "kind": "laptop", "layout": "wide", "src": src, "cut": cut or [0.3, round(d - 0.3, 2)], "crop": crop, "max_speed": max_speed, "step": step, "head": head, "sub": sub, "vo": vo}

cfg = {
  "clips_dir": "rec/clips", "work_dir": ".demo-build", "output": "accrue-pitch.mp4",
  "voice": "en-US-AndrewMultilingualNeural", "voice_rate": "+8%", "voice_tempo": 1.0, "crossfade": 0.5,
  "sfx_click": "rec/click.wav", "sfx_gain": 0.6,
  "brand": {
    "name": "Accrue", "domain": "accrue-virid.vercel.app",
    "paper": "#06090c", "paper_deep": "#111820", "ink": "#f2f6f8", "ink_soft": "#aab6c2", "ink_faint": "#5f6b78",
    "accent": "#7ee2b8", "accent_soft": "#bff0dc", "card": "#0b3d2e",
    "fonts": {"display": f"{FONTS}/barlowsc-700.ttf", "bold": f"{FONTS}/barlow-700.ttf", "semi": f"{FONTS}/barlow-600.ttf"}
  },
  "scenes": [
    {"id": "s0", "kind": "title", "image": f"{IMG}/hero.jpg",
     "tagline": "Escrow that earns while it waits. Pays only on verified delivery. Lends against itself.",
     "tag": "Monad Metropolis · Track 1 · Onchain Finance",
     "vo": "This is Accrue: escrow that earns while it waits, pays only on verified delivery, and lends against itself. Built for agents on Monad."},

    {"id": "p1", "kind": "slide", "image": f"{IMG}/vault.jpg", "label": "The problem",
     "head": "A price-feed agent just finished a week of work. Its money is stuck in the past.",
     "bullets": [{"k": "Idle", "v": "1,000 AUSD sat in escrow all week, earning nothing."},
                 {"k": "Waiting", "v": "Paid at settlement, once someone approves."},
                 {"k": "No credit", "v": "Nobody can price its history, so it cannot borrow against finished work."},
                 {"k": "One server", "v": "The marketplace's own server decides the verdict."}],
     "vo": "Meet a price-feed agent on Monad. It just delivered a week of hourly reports to a trading agent. The budget sat idle in escrow all week. It waits for settlement, because someone has to approve. It cannot borrow against finished work, because nobody can price its credit. And a server decides the verdict."},

    {"id": "p2", "kind": "slide", "image": f"{IMG}/flow.jpg", "label": "The market and the gap",
     "head": "The market is already here. The plumbing is not.",
     "bullets": [{"k": "1,900+ agents", "v": "registered in ERC-8004 on Monad testnet today; ours is #1891."},
                 {"k": "Per-call is solved", "v": "Monad's MPP and x402 pay per request. Multi-block jobs still need escrow."},
                 {"k": "Escrow today", "v": "Holds money idle, pays at the end, trusts a server. Lenders want collateral agents don't have."},
                 {"k": "Why now", "v": "ERC-8004 + ERC-8183 standards, Chainlink CRE on Monad, 400 ms blocks."}],
     "vo": "The market is already here: more than nineteen hundred agents are registered in ERC-8004 on Monad testnet today, ours is number 1891. Monad's machine payments protocol settles per-call work. Multi-block jobs still need escrow, and today's escrows hold money idle, pay at the end, and trust a server. What changed this year: the ERC-8004 and ERC-8183 standards, Chainlink CRE on Monad, and four hundred millisecond blocks."},

    {"id": "p3", "kind": "slide", "diagram": "flow", "label": "What Accrue changes",
     "head": "Three changes. Every one enforced by an immutable contract.",
     "bullets": [{"k": "Yield-bearing escrow", "v": "The budget goes into an ERC-4626 vault the moment the job is funded."},
                 {"k": "Receivables advance", "v": "The provider borrows against the job now, priced from its ERC-8004 history."},
                 {"k": "Evaluator is a contract", "v": "The verdict comes from Chainlink CRE or a committee, bound to the submitted hash."}],
     "vo": "Accrue changes all three. The budget earns yield from the block it is funded. The provider borrows against the job today, priced from its own ERC-8004 record. And the verdict comes from a contract fed by Chainlink, not a server. Immutable contracts, no admin key."},

    lap("s1", "landing.webm", "01", "Live on Monad testnet, settling in Agora AUSD", "Job #1 holds 1,000 AUSD. The counter moves with every 400 ms block.",
        "Live on Monad testnet, settling in Agora's AUSD. Job one holds one thousand AUSD, and its yield counter moves with every four hundred millisecond block.", cut=[4.0, 34.0], max_speed=2.0),
    lap("s2", "post.webm", "02", "Post a job in plain English", "Deadline, freshness rule and the provider's completion bonus are committed on chain.",
        "A client describes the work in plain English, sets the deadline and the completion bonus, and funds it. The budget is in the vault before the next block.", cut=[0.8, round(dur("post.webm") - 0.3, 2)], max_speed=2.0),
    lap("s3", "job.webm", "03", "Yield accrues per block, anchored to the contract", "previewSettlement() is re-read every two seconds; the timeline is indexed by Envio.",
        "Every job page shows yield accruing live, anchored to the contract's own settlement preview, with a timeline from Envio HyperIndex on Envio Cloud.", cut=[3.5, round(dur("job.webm") - 0.3, 2)], max_speed=2.0),
    lap("s4", "provider.webm", "04", "Credit priced from ERC-8004 history", "Advance limit, APR per block and bond come from a pure view function anyone can audit.",
        "Credit limit, rate and bond come from the provider's ERC-8004 reputation: on-time work lowers the rate, rejections raise it, a default cuts the limit. A pure view anyone can audit.", cut=[8.5, round(dur("provider.webm") - 0.3, 2)], max_speed=1.5),
    lap("s5", "pool.webm", "05", "An advance, a bad delivery, a priced loss", "Drill 3: bond seized, shortfall recorded, ERC-8004 default written, limit 10 % to 0 %.",
        "Drill three: an advance, a mismatching hash, a rejection. Bond seized, shortfall recorded, ERC-8004 default written, limit cut from ten percent to zero. Risk priced, loss recorded.", cut=[7.2, round(dur("pool.webm") - 0.3, 2)], max_speed=1.8),
    lap("s6", "term_d2.webm", "06", "One transaction settles every leg", "Drill 2 on the AUSD deployment: vault redeemed, pool repaid, provider, client and protocol paid, ERC-8004 written.",
        "Verified delivery settles in one transaction: vault redeemed, pool repaid first, provider paid with its yield bonus, client and protocol paid, outcome written to ERC-8004.", cut=[0.2, round(dur("term_d2.webm") - 0.3, 2)], max_speed=1.8),
    lap("s6b", "explorer_still.mp4", "", "The settlement on the Monad explorer", "One Attest call: 1,000 AUSD out of the vault, 1,000 to the provider, the client's and the protocol's share of the yield.",
        "On the explorer, one call: a thousand AUSD out of the vault, a thousand to the provider, every yield share.", cut=[0, 8.8]),
    lap("s7", "refusals.webm", "07", "Refusals you can link to", "Stale data, missed deadlines and wrong-hash verdicts revert in the caller's own transaction.",
        "Deterministic rules revert in the provider's own transaction: stale data, missed deadline, wrong-hash verdict. Every refusal is a link.", cut=[7.2, round(dur("refusals.webm") - 0.3, 2)], max_speed=1.6),
    lap("s8", "term_d6.webm", "08", "A hostile Claude agent tried to get paid without delivering", "Drill 6 transcript: direct completion, fabricated deliverable and self-attestation all refused on chain.",
        "We gave a Claude agent the provider key and told it to get paid without working. Direct completion, a fabricated deliverable, a self-attestation: every path refused on chain. Its advance became a recorded default; its credit limit fell from fifty-five to forty percent.", cut=[0.2, round(dur("term_d6.webm") - 0.3, 2)], max_speed=2.4),
    lap("s9", "term_cre.webm", "09", "The evaluator is a Chainlink CRE workflow", "Re-fetch inside the DON, consensus on the body, verdict through the Keystone forwarder. Job #20 settled this way.",
        "The evaluator is a contract. A Chainlink CRE workflow re-fetches the deliverable inside the DON, reaches consensus, and delivers the verdict through the Keystone forwarder. Job twenty settled that way.", cut=[0.2, round(dur("term_cre.webm") - 0.3, 2)], max_speed=1.6),

    {"id": "p4", "kind": "slide", "image": f"{IMG}/speed.jpg", "label": "Why Monad", "columns": 2,
     "head": "Per-block interest at 400 ms. A refusal you can link to costs cents.",
     "bullets": [{"k": "Drill 5", "v": "20 jobs funded and settled back to back"}, {"k": "141 transactions", "v": "across 1,349 blocks, 262 s of chain time"},
                 {"k": "39.4 M gas", "v": "about 0.2 MON per full job lifecycle"}, {"k": "ERC-8004 on Monad", "v": "credit history native to the chain"}],
     "vo": "Why Monad: per-block interest at four hundred milliseconds, and refusals you can link to, for cents. Drill five settled twenty jobs back to back, one hundred forty-one transactions, about a fifth of a MON per job. ERC-8004 lives here, so credit history is native."},

    {"id": "p5", "kind": "slide", "image": f"{IMG}/nodes.jpg", "label": "Built on", "columns": 2,
     "head": "Load-bearing integrations, not badges.",
     "bullets": [{"k": "Agora AUSD", "v": "settlement asset"}, {"k": "Chainlink CRE", "v": "the evaluator"},
                 {"k": "Envio HyperIndex", "v": "every history view, on Envio Cloud"}, {"k": "ERC-8004", "v": "identity and reputation"},
                 {"k": "x402 + MPP", "v": "per-call provider payments"}, {"k": "Privy · Nansen · Morpho", "v": "onboarding, labels, mainnet yield"}],
     "vo": "Load-bearing integrations: Agora's AUSD settles, Chainlink CRE evaluates, Envio indexes, ERC-8004 carries reputation, x402 and MPP pay per call, Privy onboards humans, Nansen labels counterparties, and Morpho supplies mainnet yield."},

    {"id": "p6", "kind": "slide", "image": f"{IMG}/ribbons.jpg", "label": "Revenue model and traction",
     "head": "Revenue scales with escrowed volume, not headcount.",
     "bullets": [{"k": "Yield share", "v": "A protocol share of realised yield on every settled job, set in the job's policy. 10 % in the demo."},
                 {"k": "Advance interest", "v": "Accrues to the lending pool today; a spread and an origination fee come on mainnet."},
                 {"k": "Traction", "v": "48 jobs settled across two testnet deployments, 20 of them back to back, one by Chainlink CRE. Every step links to its transaction."}],
     "vo": "Revenue scales with escrowed volume: a protocol share of realised yield on every settled job, ten percent in the demo, advance interest for the pool, and on mainnet a spread and an origination fee. Forty-eight jobs have already settled across two testnet deployments, every step linked to its transaction."},

    {"id": "p7", "kind": "slide", "diagram": "ecosystem", "label": "Track 1 · Onchain Finance & Trading",
     "head": "Undercollateralised credit on onchain history. Yield on idle capital. Settlement only Monad's speed makes viable.",
     "bullets": [{"k": "For the ecosystem", "v": "Any marketplace on Monad plugs in and every job it hosts becomes yield, credit and reputation."}],
     "vo": "Track one asks for onchain finance: undercollateralised credit priced on onchain history, yield on idle capital, settlement only Monad's speed makes viable. Accrue is all three. Plug a marketplace in, and every job it hosts becomes yield, credit and reputation for Monad."},

    {"id": "s99", "kind": "end", "image": f"{IMG}/hero.jpg", "lines": ["Post a job.", "Watch it earn.", "Get paid on proof."],
     "links": [["Console", "accrue-virid.vercel.app"], ["Code", "github.com/big14way/accrue"], ["Drills", "every step links to its transaction"]],
     "footer": "Monad testnet · Agora AUSD · Chainlink CRE · Envio · ERC-8004",
     "vo": "Accrue. Post a job. Watch it earn. Get paid on proof. Console, code and every transaction are in the links."}
  ]
}
out = os.path.join(HERE, 'demo.json')
json.dump(cfg, open(out, 'w'), indent=1)
w = sum(len(s['vo'].split()) for s in cfg['scenes'])
print('wrote', out, 'scenes', len(cfg['scenes']), 'words', w)
