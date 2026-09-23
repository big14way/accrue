// Records one clip per scene from the live console with a fake cursor, click ripples, smooth scrolls and camera zooms.
//   node record.js [scene,scene]   → clips/<scene>.webm + clips/<scene>.webm.clicks.json
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { drillSchedule, d6Schedule, creSchedule } = require('./schedules');

const BASE = process.env.BASE || 'http://localhost:3000';
const HERE = __dirname;
const RAW = path.join(HERE, 'raw'); const CLIPS = path.join(HERE, 'clips');
fs.mkdirSync(RAW, { recursive: true }); fs.mkdirSync(CLIPS, { recursive: true });
const only = process.argv[2] ? new Set(process.argv[2].split(',')) : null;

const INIT = `
(() => {
  const mk = () => {
    if (document.getElementById('__cur')) return;
    const c = document.createElement('div'); c.id = '__cur';
    c.innerHTML = '<svg width="30" height="36" viewBox="0 0 30 36"><path d="M2 2 L2 27 L8.5 21 L13 32 L18 30 L13.5 19.5 L22 19.5 Z" fill="#fff" stroke="#111" stroke-width="2" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, { position: 'fixed', left: '0px', top: '0px', zIndex: 2147483647, pointerEvents: 'none', transform: 'translate(720px, 520px)', transition: 'transform .7s cubic-bezier(.2,.8,.2,1)', filter: 'drop-shadow(0 2px 6px rgba(0,0,0,.45))' });
    (document.body || document.documentElement).appendChild(c);
    window.__cur = {
      move(x, y, ms) { c.style.transition = 'transform ' + (ms || 700) + 'ms cubic-bezier(.2,.8,.2,1)'; c.style.transform = 'translate(' + x + 'px,' + y + 'px)'; },
      ripple(x, y) { const r = document.createElement('div'); Object.assign(r.style, { position: 'fixed', left: (x - 22) + 'px', top: (y - 22) + 'px', width: '44px', height: '44px', borderRadius: '50%', border: '3px solid #7ee2b8', zIndex: 2147483646, pointerEvents: 'none', animation: '__rip .55s ease-out forwards' }); (document.body || document.documentElement).appendChild(r); setTimeout(() => r.remove(), 600); },
    };
    const st = document.createElement('style'); st.textContent = '@keyframes __rip { from { transform: scale(.4); opacity: .95 } to { transform: scale(1.9); opacity: 0 } } html { scroll-behavior: auto !important; }'; document.head.appendChild(st);
  };
  if (document.body) mk(); else document.addEventListener('DOMContentLoaded', mk);
  window.__zoom = (cx, cy, s, ms) => { const h = document.documentElement; h.style.transition = 'transform ' + (ms || 900) + 'ms cubic-bezier(.25,.8,.25,1)'; h.style.transformOrigin = (cx + window.scrollX) + 'px ' + (cy + window.scrollY) + 'px'; h.style.transform = 'scale(' + s + ')'; };
  window.__unzoom = (ms) => { const h = document.documentElement; h.style.transition = 'transform ' + (ms || 800) + 'ms cubic-bezier(.25,.8,.25,1)'; h.style.transform = 'scale(1)'; };
  window.__scroll = (to, ms) => new Promise(res => { const from = window.scrollY, d = to - from, t0 = performance.now(); const step = (t) => { const p = Math.min((t - t0) / ms, 1), e = 1 - Math.pow(1 - p, 3); window.scrollTo(0, from + d * e); if (p < 1) requestAnimationFrame(step); else res(); }; requestAnimationFrame(step); });
})();`;

async function scene(browser, name, fn) {
  if (only && !only.has(name)) return;
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 2, recordVideo: { dir: RAW, size: { width: 1920, height: 1080 } } });
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  const t0 = Date.now(); const clicks = [];
  let cur = { x: 720, y: 520 };
  const h = {
    page,
    now: () => (Date.now() - t0) / 1000,
    wait: (ms) => page.waitForTimeout(ms),
    goto: async (url, sel) => { await page.goto(url.startsWith('http') || url.startsWith('file') ? url : BASE + url, { waitUntil: 'commit', timeout: 60000 }); if (sel) await page.waitForSelector(sel, { timeout: 60000 }); },
    center: async (sel) => { const b = await page.locator(sel).first().boundingBox(); if (!b) throw new Error('no box for ' + sel); return { x: b.x + b.width / 2, y: b.y + b.height / 2, box: b }; },
    moveTo: async (sel, ms = 700, dx = 0, dy = 0) => { const c = typeof sel === 'string' ? await h.center(sel) : sel; cur = { x: c.x + dx, y: c.y + dy }; await page.evaluate(([x, y, m]) => window.__cur && window.__cur.move(x, y, m), [cur.x, cur.y, ms]); await page.mouse.move(cur.x, cur.y, { steps: 12 }); await page.waitForTimeout(ms + 120); },
    click: async () => { await page.evaluate(([x, y]) => window.__cur && window.__cur.ripple(x, y), [cur.x, cur.y]); clicks.push(+h.now().toFixed(3)); await page.mouse.click(cur.x, cur.y); await page.waitForTimeout(350); },
    zoom: async (sel, s = 1.5, ms = 900, hold = 3000) => { const c = await h.center(sel); await page.evaluate(([x, y, s, m]) => window.__zoom(x, y, s, m), [c.x, c.y, s, ms]); await page.waitForTimeout(ms + hold); },
    unzoom: async (ms = 800) => { await page.evaluate((m) => window.__unzoom(m), ms); await page.waitForTimeout(ms + 200); },
    scrollTo: async (sel, offset = 110, ms = 1400) => { const b = await page.locator(sel).first().boundingBox(); const y = Math.max(0, b.y + (await page.evaluate(() => window.scrollY)) - offset); await page.evaluate(([y, m]) => window.__scroll(y, m), [y, ms]); await page.waitForTimeout(ms + 100); },
    scrollBy: async (dy, ms = 1200) => { const y = await page.evaluate(() => window.scrollY); await page.evaluate(([y, m]) => window.__scroll(y, m), [y + dy, ms]); await page.waitForTimeout(ms + 100); },
    type: async (text, delay = 32) => { await page.keyboard.type(text, { delay }); },
  };
  console.log('▶', name);
  try { await fn(h); } catch (e) { console.log('  ✗', name, e.message.split('\n')[0]); }
  const dur = h.now();
  const v = page.video(); await ctx.close();
  const p = await v.path(); const dest = path.join(CLIPS, name + '.webm'); fs.renameSync(p, dest);
  fs.writeFileSync(dest + '.clicks.json', JSON.stringify(clicks));
  console.log(`  ✓ ${name} ${dur.toFixed(1)}s clicks=${clicks.length}`);
}

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--window-position=0,0', '--window-size=1440,900', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'] });

  await scene(browser, 'landing', async (h) => {
    await h.goto('/', '.hero-card');
    await h.page.waitForSelector('.hero-card .live-dot', { timeout: 20000 }).catch(() => {});
    await h.wait(2500);
    await h.moveTo('.hero-card', 900, 120, 60);
    await h.zoom('.hero-card', 1.45, 900, 5500);
    await h.unzoom(800); await h.wait(600);
    await h.scrollTo('text=The problem', 140, 1500); await h.wait(4200);
    await h.scrollTo('text=01 · Yield-bearing escrow', 150, 1500); await h.wait(4000);
    await h.scrollTo('text=How it works', 120, 1500); await h.wait(4200);
    await h.scrollTo('text=Trust model', 120, 1400); await h.wait(3200);
    await h.scrollTo('text=We attacked it before you could.', 160, 1400); await h.wait(3600);
    await h.scrollTo('text=Why Monad', 120, 1400); await h.wait(3600);
    await h.scrollTo('text=Built on', 120, 1400); await h.wait(4000);
  });

  await scene(browser, 'post', async (h) => {
    await h.goto('/post', 'label:has-text("Description") + input');
    await h.wait(2200);
    await h.moveTo('label:has-text("Provider address") + input', 800); await h.click();
    await h.type('0x862599685b69a22D7108C8641679bfc2E12C879E', 14);
    await h.wait(400);
    await h.moveTo('label:has-text("Description") + input', 700); await h.click();
    await h.page.keyboard.press('Meta+A'); await h.wait(120);
    await h.type('Hourly ETH/USDC mid-price report as canonical JSON', 30);
    await h.wait(700);
    const c = await h.center('input[type=range]');
    await h.moveTo({ x: c.box.x + c.box.width * 0.4, y: c.y }, 800); await h.click(); await h.wait(500);
    await h.moveTo({ x: c.box.x + c.box.width * 0.6, y: c.y }, 600); await h.click(); await h.wait(900);
    await h.moveTo('label:has-text("Deadline") + input', 700); await h.click();
    await h.page.keyboard.press('Meta+A'); await h.type('6', 60); await h.wait(600);
    await h.moveTo('button:has-text("Create job")', 900); await h.wait(1600);
    await h.zoom('label:has-text("In plain English"), h3:has-text("In plain English")', 1.35, 900, 3200).catch(() => {});
    await h.unzoom(700); await h.wait(600);
  });

  await scene(browser, 'job', async (h) => {
    await h.goto('/jobs/1', 'h3:has-text("Yield accruing now"), h3:has-text("Yield realised")');
    await h.wait(2200);
    await h.moveTo('h3:has-text("Yield")', 800, 0, 60);
    await h.zoom('h3:has-text("Yield")', 1.5, 900, 6000);
    await h.unzoom(800); await h.wait(500);
    await h.scrollTo('h3:has-text("Timeline")', 120, 1400); await h.wait(4500);
  });

  await scene(browser, 'provider', async (h) => {
    await h.goto('/providers/0x862599685b69a22D7108C8641679bfc2E12C879E', 'h3:has-text("Credit score")');
    await h.page.waitForSelector('text=on-time completions', { timeout: 30000 }).catch(() => {});
    await h.wait(2000);
    await h.scrollTo('h3:has-text("Advance limit")', 130, 1200); await h.wait(1800);
    await h.scrollTo('h3:has-text("Credit score")', 100, 1200); await h.wait(500);
    const c = await h.center('h3:has-text("Credit score")');
    const n = await h.center('h3:has-text("Nansen")').catch(() => null);
    const ox = c.box.x - 14, right = n ? n.box.x - 22 : 735;
    const s = Math.min(2.1, (1440 - ox) / (right - ox));
    await h.moveTo({ x: c.box.x + 60, y: c.y + 150 }, 700);
    await h.page.evaluate(([x, y, s]) => window.__zoom(x, y, s, 900), [ox, c.y + 200, s]);
    await h.wait(900 + 6000);
    await h.unzoom(800); await h.wait(1000);
  });

  await scene(browser, 'pool', async (h) => {
    await h.goto('/pool', 'h3:has-text("Liens")');
    await h.wait(2500);
    await h.scrollTo('h3:has-text("Liens")', 120, 1400); await h.wait(800);
    await h.moveTo('h3:has-text("Liens")', 700, 60, 90);
    await h.zoom('h3:has-text("Liens")', 1.4, 900, 5500);
    await h.unzoom(800); await h.wait(400);
    await h.scrollBy(420, 1200); await h.wait(3500);
  });

  await scene(browser, 'refusals', async (h) => {
    await h.goto('/refusals', 'h3:has-text("Negative attestations")');
    await h.wait(2500);
    await h.scrollTo('h3:has-text("Negative attestations")', 110, 1300); await h.wait(600);
    await h.moveTo('h3:has-text("Negative attestations")', 700, 80, 100);
    await h.zoom('h3:has-text("Negative attestations")', 1.3, 900, 5500);
    await h.unzoom(800); await h.wait(1800);
  });

  await scene(browser, 'dashboard', async (h) => {
    await h.goto('/dashboard', 'h3:has-text("Recent jobs")');
    await h.wait(3000);
    await h.scrollTo('h3:has-text("Recent jobs")', 110, 1400); await h.wait(4500);
  });

  await scene(browser, 'drills', async (h) => {
    await h.goto('/drills', 'h1');
    await h.wait(2500);
    await h.scrollBy(500, 1600); await h.wait(2500);
    await h.scrollBy(600, 1600); await h.wait(2500);
  });

  await scene(browser, 'explorer', async (h) => {
    await h.goto('https://testnet.monadexplorer.com/tx/0x26520480c944f6b65bf9c6afc14a765c8275ec6853859b9572b38b40fc3ee1a3');
    await h.wait(9000);
    await h.scrollBy(500, 1600); await h.wait(4000);
  });

  await scene(browser, 'contract', async (h) => {
    await h.goto('https://testnet.monadexplorer.com/address/0x44F29EEF182180B8ae93dc6765f20eC9B3Ee7366?tab=Contract');
    await h.wait(9000);
    await h.scrollBy(400, 1500); await h.wait(3000);
  });

  const term = async (name, title, { sched, end }) => scene(browser, name, async (h) => {
    await h.goto('file://' + path.join(HERE, 'term.html'), '#out');
    await h.page.evaluate((t) => window.setTitle(t), title);
    await h.wait(500);
    await h.page.evaluate((s) => { window.play(s); }, sched);
    await h.wait(end * 1000);
  });
  await term('term_d2', 'drill D2 — on-time settlement · Monad testnet', drillSchedule('d2-ontime', 'DRILL_BUDGET_USD=1000 pnpm d2', { scale: 1 }));
  await term('term_d6', 'drill D6 — hostile LLM provider · transcript replay', d6Schedule());
  await term('term_cre', 'Chainlink CRE — evaluator workflow · monad-testnet', creSchedule());

  await browser.close();
})();
