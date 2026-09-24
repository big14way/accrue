#!/usr/bin/env python3
"""
Config-driven product demo video builder.
  python3 build_demo.py config.json [--only s1,s2] [--out name.mp4]

Pipeline: brand PNGs (Pillow) → narration per scene (edge-tts) → animated composites (ffmpeg)
→ crossfaded cut with loudness-normalised audio. See SKILL.md for the config schema.
"""
import json, os, subprocess, sys, math, argparse, hashlib
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ap = argparse.ArgumentParser()
ap.add_argument('config'); ap.add_argument('--only', default=None); ap.add_argument('--out', default=None)
ap.add_argument('--fresh', action='store_true', help='re-synthesise narration even if cached')
args = ap.parse_args()
CFG = json.load(open(args.config))
BASE = os.path.dirname(os.path.abspath(args.config))
def P(p): return p if os.path.isabs(p) else os.path.join(BASE, p)

CLIPS = P(CFG.get('clips_dir', '.'))
OUT = P(CFG.get('work_dir', '.demo-build')); os.makedirs(OUT, exist_ok=True)
FINAL = P(args.out or CFG.get('output', 'demo.mp4'))
W, H, FPS = CFG.get('width', 1920), CFG.get('height', 1080), CFG.get('fps', 30)
B = CFG['brand']
PAPER, PAPER_DEEP, INK, INK_SOFT, INK_FAINT = B['paper'], B['paper_deep'], B['ink'], B['ink_soft'], B['ink_faint']
ACCENT, ACCENT_SOFT, WHITE = B['accent'], B.get('accent_soft', '#C9CCFF'), '#FFFFFF'
CARD = B.get('card', B['accent'])
F_DISPLAY, F_BOLD, F_SEMI = P(B['fonts']['display']), P(B['fonts']['bold']), P(B['fonts']['semi'])
LOGO = P(B['logo']) if B.get('logo') else None
LOGO_INV = P(B['logo_inverse']) if B.get('logo_inverse') else LOGO
NAME, DOMAIN = B['name'], B.get('domain', '')
VOICE, RATE = CFG.get('voice', 'en-US-AndrewMultilingualNeural'), CFG.get('voice_rate', '-4%')
XFADE = CFG.get('crossfade', 0.5)
LEAD = 0.35
SFX = {}

def font(p, s): return ImageFont.truetype(p, s)
def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode: print(' '.join(cmd)[:400]); print(r.stderr[-3000:]); sys.exit(1)
def dur_of(p):
    return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p]).decode().strip())
def snap(d): return math.ceil(d * FPS) / FPS

def spaced(draw, xy, text, fnt, fill, tracking=0):
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=fnt, fill=fill); x += draw.textlength(ch, font=fnt) + tracking
    return x
def spaced_w(draw, text, fnt, tracking=0): return sum(draw.textlength(c, font=fnt) + tracking for c in text)

def wrap(draw, text, fnt, maxw):
    words, lines, cur = text.split(), [], ''
    for w in words:
        t = (cur + ' ' + w).strip()
        if draw.textlength(t, font=fnt) <= maxw: cur = t
        else: lines.append(cur); cur = w
    if cur: lines.append(cur)
    return lines

def wordmark(im, x, y, size=34, on_accent=False):
    d = ImageDraw.Draw(im)
    if LOGO:
        lg = Image.open(LOGO_INV if on_accent else LOGO).convert('RGBA').resize((size, size), Image.LANCZOS)
        im.alpha_composite(lg, (int(x), int(y))) if im.mode == 'RGBA' else im.paste(lg, (int(x), int(y)), lg)
        x += size + int(size * 0.4)
    spaced(d, (x, y - int(size * 0.12)), NAME.upper(), font(F_DISPLAY, int(size * 1.18)), WHITE if on_accent else INK, tracking=2)

def render_bg(path):
    im = Image.new('RGB', (W, H), PAPER); d = ImageDraw.Draw(im)
    for x in range(120, W - 120, 22): d.ellipse((x, H - 72, x + 8, H - 64), fill=PAPER_DEEP)
    wordmark(im, 120, 64)
    if DOMAIN:
        f = font(F_DISPLAY, 24); t = DOMAIN.upper()
        spaced(d, (W - 120 - spaced_w(d, t, f, 2), H - 52), t, f, INK_FAINT, tracking=2)
    im.save(path)


def cover(img, w, h):
    iw, ih = img.size; r = max(w / iw, h / ih)
    im = img.resize((int(iw * r) + 1, int(ih * r) + 1), Image.LANCZOS)
    x, y = (im.width - w) // 2, (im.height - h) // 2
    return im.crop((x, y, x + w, y + h))

def photo_bg(path, w, h, dark=0.32):
    im = cover(Image.open(P(path)).convert('RGB'), w, h)
    im = Image.blend(im, Image.new('RGB', (w, h), PAPER), 1 - dark)  # darken towards the paper colour
    return im

def paste_panel(base, path, box, radius=28):
    x0, y0, x1, y1 = box; w, h = x1 - x0, y1 - y0
    im = cover(Image.open(P(path)).convert('RGB'), w, h).convert('RGBA')
    # soft vignette so text never fights the photo
    grad = Image.new('L', (w, h), 0); gd = ImageDraw.Draw(grad)
    for i in range(h): gd.line((0, i, w, i), fill=int(70 * i / h))
    im.alpha_composite(Image.merge('RGBA', (Image.new('L', (w, h), 0), Image.new('L', (w, h), 0), Image.new('L', (w, h), 0), grad)))
    m = Image.new('L', (w, h), 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, w - 1, h - 1), radius=radius, fill=255)
    base.paste(im.convert('RGB'), (x0, y0), m)
    ImageDraw.Draw(base).rounded_rectangle(box, radius=radius, outline=PAPER_DEEP, width=2)

def arrow(d, a, b, color, width=4, head=14):
    d.line((a, b), fill=color, width=width)
    dx, dy = b[0] - a[0], b[1] - a[1]; L = math.hypot(dx, dy) or 1; ux, uy = dx / L, dy / L
    px, py = -uy, ux
    d.polygon([b, (b[0] - ux * head + px * head * 0.55, b[1] - uy * head + py * head * 0.55), (b[0] - ux * head - px * head * 0.55, b[1] - uy * head - py * head * 0.55)], fill=color)

def draw_flow(base, box):
    """How the money moves: client → escrow (earning) → provider, pool advance, evaluator verdict."""
    x0, y0, x1, y1 = box; d = ImageDraw.Draw(base)
    d.rounded_rectangle(box, radius=28, fill=PAPER_DEEP)
    ft, fs, fl = font(F_BOLD, 26), font(F_SEMI, 20), font(F_DISPLAY, 18)
    def bx(rect, title, sub=None, accent=False):
        r = (x0 + rect[0], y0 + rect[1], x0 + rect[2], y0 + rect[3])
        d.rounded_rectangle(r, radius=16, fill=PAPER, outline=ACCENT if accent else INK_FAINT, width=2)
        d.text((r[0] + 18, r[1] + 14), title, font=ft, fill=INK)
        if sub: d.text((r[0] + 18, r[1] + 50), sub, font=fs, fill=INK_SOFT)
        return r
    c = bx((36, 36, 300, 126), 'Client agent', 'funds the job')
    e = bx((36, 250, 404, 360), 'Accrue escrow', 'budget earns in an ERC-4626 vault', accent=True)
    pr = bx((462, 250, 674, 360), 'Provider agent', 'paid on proof')
    po = bx((36, 500, 300, 600), 'Advance pool', 'priced from ERC-8004')
    ev = bx((346, 500, 674, 600), 'Evaluator', 'Chainlink CRE · committee')
    def lab(pt, text, anchor='la'):
        d.text(pt, text, font=fl, fill=ACCENT, anchor=anchor)
    arrow(d, (c[0] + 130, c[3]), (c[0] + 130, e[1]), ACCENT); lab((c[0] + 146, (c[3] + e[1]) // 2), 'funds, yield from block 1', 'lm')
    arrow(d, (e[2], (e[1] + e[3]) // 2), (pr[0], (pr[1] + pr[3]) // 2), ACCENT); lab(((e[2] + pr[0]) // 2, e[1] - 16), 'pays on proof', 'mm')
    arrow(d, (po[0] + 130, po[1]), (po[0] + 130, e[3]), ACCENT_SOFT); lab((po[0] + 146, e[3] + 32), 'repaid first at completion', 'lm')
    mx, my = (po[2] + pr[0] + 60) // 2, (po[1] + 20 + pr[3]) // 2
    arrow(d, (po[2], po[1] + 20), (pr[0] + 60, pr[3]), ACCENT_SOFT); lab((mx - 14, my + 14), 'advance now', 'rm')
    arrow(d, (ev[0] + 120, ev[1]), (e[2] - 60, e[3]), ACCENT); lab((ev[0] + 132, ev[1] - 30), 'verdict, bound to the hash', 'lm')
    d.rounded_rectangle(box, radius=28, outline=INK_FAINT, width=2)

def draw_ecosystem(base, box):
    x0, y0, x1, y1 = box; d = ImageDraw.Draw(base)
    d.rounded_rectangle(box, radius=28, fill=PAPER_DEEP)
    ft, fs = font(F_BOLD, 26), font(F_SEMI, 20)
    def bx(rect, title, sub=None, accent=False):
        r = (x0 + rect[0], y0 + rect[1], x0 + rect[2], y0 + rect[3])
        d.rounded_rectangle(r, radius=16, fill=PAPER, outline=ACCENT if accent else INK_FAINT, width=2)
        d.text((r[0] + 18, r[1] + 14), title, font=ft, fill=INK)
        if sub: d.text((r[0] + 18, r[1] + 50), sub, font=fs, fill=INK_SOFT)
        return r
    m1 = bx((36, 36, 336, 116), 'Data marketplace', 'price feeds, reports')
    m2 = bx((374, 36, 674, 116), 'Compute marketplace', 'inference, batch jobs')
    a = bx((150, 250, 560, 360), 'Accrue on Monad', 'one escrow, one credit file, one verdict', accent=True)
    o1 = bx((36, 520, 236, 620), 'Yield', 'on every idle budget')
    o2 = bx((256, 520, 456, 620), 'Credit', 'priced on history')
    o3 = bx((476, 520, 674, 620), 'Reputation', 'written on chain')
    arrow(d, ((m1[0] + m1[2]) // 2, m1[3]), (a[0] + 90, a[1]), ACCENT_SOFT)
    arrow(d, ((m2[0] + m2[2]) // 2, m2[3]), (a[2] - 90, a[1]), ACCENT_SOFT)
    for o in (o1, o2, o3): arrow(d, ((a[0] + a[2]) // 2, a[3]), ((o[0] + o[2]) // 2, o[1]), ACCENT)
    d.text((x0 + 36, y0 + 660), 'Every job a marketplace hosts feeds all three back to the ecosystem.', font=fs, fill=INK_SOFT)
    d.rounded_rectangle(box, radius=28, outline=INK_FAINT, width=2)

def render_caption_wide(path, step, head, sub):
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    x, y = 120, 118
    if step: spaced(d, (x, y - 4), step, font(F_DISPLAY, 56), ACCENT, tracking=-2); x += 96
    fh = font(F_BOLD, 46)
    for line in wrap(d, head, fh, 1560)[:1]: d.text((x, y), line, font=fh, fill=INK); y += 54
    y += 4; fs = font(F_SEMI, 26)
    for line in wrap(d, sub, fs, 1560)[:2]: d.text((x, y), line, font=fs, fill=INK_SOFT); y += 34
    im.save(path)

def render_caption(path, step, head, sub):
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    x, y = 120, 300
    if step: spaced(d, (x, y), step, font(F_DISPLAY, 150), ACCENT, tracking=-4); y += 170
    d.rounded_rectangle((x, y, x + 96, y + 6), radius=3, fill=INK); y += 36
    fh = font(F_BOLD, 66)
    for line in wrap(d, head, fh, 780): d.text((x, y), line, font=fh, fill=INK); y += 78
    y += 14; fs = font(F_SEMI, 30)
    for line in wrap(d, sub, fs, 760): d.text((x, y), line, font=fs, fill=INK_SOFT); y += 40
    im.save(path)

def render_slide(sc):
    """Full-width statement scene: label + headline (static base) and bullets (separate layers, staggered)."""
    base = Image.new('RGB', (W, H), PAPER); d = ImageDraw.Draw(base)
    for x in range(120, W - 120, 22): d.ellipse((x, H - 72, x + 8, H - 64), fill=PAPER_DEEP)
    wordmark(base, 120, 64)
    if DOMAIN:
        f = font(F_DISPLAY, 24); t = DOMAIN.upper(); spaced(d, (W - 120 - spaced_w(d, t, f, 2), H - 52), t, f, INK_FAINT, tracking=2)
    visual = sc.get('image') or sc.get('diagram')
    panel = (1090, 170, 1800, 920)
    if sc.get('image'): paste_panel(base, sc['image'], panel)
    elif sc.get('diagram') == 'flow': draw_flow(base, panel)
    elif sc.get('diagram') == 'ecosystem': draw_ecosystem(base, panel)
    textw = 900 if visual else 1500
    y = 200 if visual else 220
    if sc.get('label'): spaced(d, (120, y), sc['label'].upper(), font(F_DISPLAY, 30), ACCENT, tracking=4); y += 56
    fh = font(F_BOLD, 66 if visual else 84)
    for line in wrap(d, sc['head'], fh, textw): d.text((120, y), line, font=fh, fill=INK); y += (78 if visual else 98)
    y += 36 if visual else 44
    bp = os.path.join(OUT, sc['id'] + '_base.png'); base.save(bp)
    layers = []
    cols = sc.get('columns', 1); colw = (textw - (cols - 1) * (40 if visual else 60)) / cols
    fb = font(F_SEMI, (30 if cols > 1 else 34) if visual else (40 if cols == 1 else 36)); fk = font(F_DISPLAY, 24 if visual else 26)
    rh = sc.get('row_h', 120); tops = None
    if visual:  # row height follows the wrapped text; single column stacks each bullet by its own height
        lh = 42; heights = []
        for b in sc['bullets']:
            k, v = (b.get('k', ''), b['v']) if isinstance(b, dict) else ('', b)
            heights.append((38 if k else 0) + lh * len(wrap(d, v, fb, colw - 40)) + 18)
        rh = max(heights) + 4
        if cols == 1:
            tops = []; acc = 0
            for hgt in heights: tops.append(acc); acc += hgt
    for i, b in enumerate(sc['bullets']):
        im = Image.new('RGBA', (W, H), (0, 0, 0, 0)); dd = ImageDraw.Draw(im)
        c, r = i % cols, i // cols
        x = 120 + c * (colw + (40 if visual else 60)); yy = y + (tops[i] if tops else r * rh)
        if isinstance(b, dict):
            k, v = b.get('k', ''), b['v']
        else: k, v = '', b
        # accent tick
        dd.rounded_rectangle((x, yy + 14, x + 14, yy + 28), radius=3, fill=ACCENT)
        tx = x + 40
        if k: spaced(dd, (tx, yy), k.upper(), fk, ACCENT, tracking=3); yy2 = yy + 38
        else: yy2 = yy
        for line in wrap(dd, v, fb, colw - 40): dd.text((tx, yy2), line, font=fb, fill=INK if k else INK_SOFT); yy2 += (42 if visual else 48)
        lp = os.path.join(OUT, f"{sc['id']}_b{i}.png"); im.save(lp); layers.append(lp)
    return bp, layers

def render_title(sc, path):
    im = photo_bg(sc['image'], W, H, dark=0.42) if sc.get('image') else Image.new('RGB', (W, H), CARD); d = ImageDraw.Draw(im)
    f = font(F_DISPLAY, 190); t = NAME.upper(); tw = spaced_w(d, t, f, 6)
    s = 150 if LOGO else 0; total = s + (40 if LOGO else 0) + tw; x0 = (W - total) / 2; y0 = H / 2 - 150
    if LOGO:
        lg = Image.open(LOGO_INV).convert('RGBA').resize((s, s), Image.LANCZOS); im.paste(lg, (int(x0), int(y0 + 30)), lg)
    spaced(d, (x0 + s + (40 if LOGO else 0), y0 - 10), t, f, WHITE, tracking=6)
    fs = font(F_SEMI, 44); sub = sc.get('tagline', ''); yy = y0 + 250
    for line in wrap(d, sub, fs, 1500): d.text(((W - d.textlength(line, font=fs)) / 2, yy), line, font=fs, fill=WHITE); yy += 56
    if sc.get('tag'):
        ft = font(F_DISPLAY, 26); tag = sc['tag'].upper()
        spaced(d, ((W - spaced_w(d, tag, ft, 3)) / 2, H - 120), tag, ft, ACCENT_SOFT, tracking=3)
    im.save(path)

def render_end(sc, path):
    im = photo_bg(sc['image'], W, H, dark=0.3) if sc.get('image') else Image.new('RGB', (W, H), CARD); d = ImageDraw.Draw(im)
    wordmark(im, 120, 64, on_accent=True)
    fh = font(F_BOLD, 84); y = 300
    for l in sc['lines']: d.text((120, y), l, font=fh, fill=WHITE); y += 100
    fm = font(F_DISPLAY, 40); y += 50
    for k, v in sc.get('links', []):
        spaced(d, (120, y + 8), k.upper(), font(F_DISPLAY, 24), ACCENT_SOFT, tracking=3); d.text((360, y), v, font=fm, fill=WHITE); y += 62
    if sc.get('footer'): d.text((120, H - 110), sc['footer'], font=font(F_SEMI, 28), fill=ACCENT_SOFT)
    im.save(path)

def rounded_mask(path, w, h, r):
    m = Image.new('L', (w, h), 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, w - 1, h - 1), radius=r, fill=255); m.save(path)
def shadow(path, w, h, r, pad=90):
    im = Image.new('RGBA', (w + 2 * pad, h + 2 * pad), (0, 0, 0, 0))
    ImageDraw.Draw(im).rounded_rectangle((pad, pad + 28, pad + w, pad + h + 28), radius=r, fill=(20, 22, 42, 110))
    im.filter(ImageFilter.GaussianBlur(34)).save(path)

TEMPO = CFG.get('voice_tempo', 1.0)
def tts(text, sid):
    h = hashlib.md5((VOICE + str(RATE) + str(TEMPO) + text).encode()).hexdigest()[:10]
    if 'Neural' in VOICE:
        path = os.path.join(OUT, f'{sid}_{h}.mp3')
        for attempt in range(3):  # a build interrupted mid-synthesis leaves an empty or truncated file
            if args.fresh or not os.path.exists(path) or os.path.getsize(path) < 1000:
                if os.path.exists(path): os.remove(path)
                run(['edge-tts', '--voice', VOICE, f'--rate={RATE}', '--text', text, '--write-media', path])
            try: return path, dur_of(path)
            except subprocess.CalledProcessError: os.remove(path)
        sys.exit(f'narration for {sid} could not be synthesised')
    path = os.path.join(OUT, f'{sid}_{h}.wav')
    if args.fresh or not os.path.exists(path):
        aiff = path[:-4] + '.aiff'
        run(['say', '-v', VOICE, '-r', str(RATE), '-o', aiff, text])
        run(['ffmpeg', '-y', '-v', 'error', '-i', aiff, '-af', f'atempo={TEMPO},aformat=sample_rates=44100:channel_layouts=stereo', path])
    return path, dur_of(path)

def enc(out, dur, inputs, vf, af):
    run(['ffmpeg', '-y', '-v', 'error', *inputs, '-filter_complex', vf + ';' + af, '-map', '[v]', '-map', '[a]', '-r', str(FPS),
         '-c:v', 'libx264', '-crf', '17', '-preset', 'medium', '-c:a', 'aac', '-b:a', '192k', '-t', str(dur), out])
def img_in(path, dur): return ['-framerate', str(FPS), '-loop', '1', '-t', str(dur), '-i', path]
def audio_f(idx, dur): return f"[{idx}:a]adelay={int(LEAD*1000)}|{int(LEAD*1000)},apad,atrim=0:{dur}[a]"
EASE = "(1-pow(1-min(t/0.7\\,1)\\,3))"

def build_scene(sc):
    out = os.path.join(OUT, sc['id'] + '.mp4')
    vo, vo_len = tts(sc['vo'], sc['id'])
    kind = sc['kind']
    if kind in ('title', 'end'):
        bg = os.path.join(OUT, sc['id'] + '_bg.png'); (render_title if kind == 'title' else render_end)(sc, bg)
        dur = snap(vo_len + LEAD + sc.get('hold', 0.6 if kind == 'title' else 1.3))
        zoom = f"scale=iw*1.06:ih*1.06,zoompan=z='1.06-0.06*min(on/({dur}*{FPS})\\,1)':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=1:s={W}x{H}:fps={FPS}"
        enc(out, dur, img_in(bg, dur) + ['-i', vo], f"[0:v]{zoom},fade=t=in:st=0:d=0.6,trim=duration={dur},format=yuv420p[v]", audio_f(1, dur))
        return out, dur
    if kind == 'slide':
        base, layers = render_slide(sc)
        dur = snap(vo_len + LEAD + sc.get('hold', 0.45))
        n = len(layers); span = max(dur - 2.5, 1.0)
        starts = [0.9 + i * min(1.6, span / max(n, 1)) for i in range(n)]
        inputs = img_in(base, dur)
        for l in layers: inputs += img_in(l, dur)
        inputs += ['-i', vo]
        vf = ''; prev = '[0:v]'
        for i, st in enumerate(starts):
            vf += f"[{i+1}:v]format=rgba,fade=t=in:st={st:.2f}:d=0.5:alpha=1[l{i}];"
            vf += f"{prev}[l{i}]overlay=x=0:y='22*(1-(1-pow(1-min(max(t-{st:.2f}\\,0)/0.5\\,1)\\,3)))':shortest=0[o{i}];"
            prev = f'[o{i}]'
        vf += f"{prev}trim=duration={dur},format=yuv420p[v]"
        enc(out, dur, inputs, vf, audio_f(n + 1, dur))
        return out, dur

    # device scenes: phone / laptop
    bg = os.path.join(OUT, 'bg.png'); render_bg(bg)
    cap = os.path.join(OUT, sc['id'] + '_cap.png'); render_caption(cap, sc.get('step', ''), sc['head'], sc['sub'])
    src = os.path.join(CLIPS, sc['src'])
    cuts = sc['cut'] if isinstance(sc['cut'][0], (list, tuple)) else [sc['cut']]
    clip_len = sum(b - a for a, b in cuts)
    speed = max(1.0, min(sc.get('max_speed', 1.5), clip_len / (vo_len + 1.2)))
    dur = snap(max(clip_len / speed, vo_len + LEAD + 0.35))
    wide = sc.get('layout') == 'wide'
    dh = sc.get('device_h', 740 if wide else 940)
    if wide: render_caption_wide(cap, sc.get('step', ''), sc['head'], sc['sub'])
    if kind == 'phone':
        sw, sh = subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', src]).decode().strip().split(',')
        dw = int(round(int(sw) * dh / int(sh))); dw -= dw % 2; pre = f"scale={dw}:{dh}"; radius = 44
    else:
        cw, ch, cx, cy = sc['crop']; dw = int(round(cw * dh / ch)); dw -= dw % 2
        pre = f"crop={cw}:{ch}:{cx}:{cy},scale={dw}:{dh}"; radius = 22
    mask = os.path.join(OUT, f'mask_{dw}x{dh}.png'); rounded_mask(mask, dw, dh, radius)
    shd = os.path.join(OUT, f'shadow_{dw}x{dh}.png'); shadow(shd, dw, dh, radius)
    pad = 90; dx, dy = W - 170 - dw, (H - dh) // 2 - 10
    if wide: dx, dy = (W - dw) // 2, H - dh - 44
    slide = f"70*(1-{EASE})"
    vf = (''.join(f"[1:v]trim=start={a}:end={b},setpts=PTS-STARTPTS[c{i}];" for i, (a, b) in enumerate(cuts))
          + ''.join(f"[c{i}]" for i in range(len(cuts))) + f"concat=n={len(cuts)}:v=1:a=0,setpts=PTS/{speed},fps={FPS},{pre},format=rgba[dv];"
          f"[dv][2:v]alphamerge,fade=t=in:st=0:d=0.7:alpha=1,tpad=stop_mode=clone:stop_duration=60[dev];"
          f"[3:v]format=rgba,fade=t=in:st=0:d=0.7:alpha=1[shd];"
          f"[4:v]format=rgba,fade=t=in:st=0.25:d=0.6:alpha=1[cap];"
          f"[0:v][shd]overlay=x='{dx - pad}+{slide}':y={dy - pad}:shortest=0[b1];"
          f"[b1][dev]overlay=x='{dx}+{slide}':y={dy}:shortest=0[b2];"
          f"[b2][cap]overlay=x=0:y='26*(1-(1-pow(1-min(max(t-0.25\\,0)/0.6\\,1)\\,3)))':shortest=0,trim=duration={dur},format=yuv420p[v]")
    inputs = img_in(bg, dur) + ['-i', src] + img_in(mask, dur) + img_in(shd, dur) + img_in(cap, dur) + ['-i', vo]
    enc(out, dur, inputs, vf, audio_f(5, dur))
    cj = src + '.clicks.json'
    if os.path.exists(cj):
        acc = 0.0; times = []
        for a, b in cuts:
            for c in json.load(open(cj)):
                if a <= c < b: times.append((acc + (c - a)) / speed)
            acc += b - a
        SFX[sc['id']] = [t for t in times if t < dur - 0.2]
    return out, dur

def main():
    scenes = CFG['scenes']
    if args.only: keep = set(args.only.split(',')); scenes = [s for s in scenes if s['id'] in keep]
    parts = []
    for sc in scenes:
        p, d = build_scene(sc); parts.append((p, d)); print(f"{sc['id']:>4} {sc['kind']:<7} {d:5.1f}s")
    inputs = []; vf = []; af = []
    for p, _ in parts: inputs += ['-i', p]
    off = 0.0; pv, pa = '[0:v]', '[0:a]'
    for i in range(1, len(parts)):
        off += parts[i - 1][1] - XFADE
        vf.append(f"{pv}[{i}:v]xfade=transition=fade:duration={XFADE}:offset={off:.3f}[v{i}]")
        af.append(f"{pa}[{i}:a]acrossfade=d={XFADE}:c1=tri:c2=tri[a{i}]")
        pv, pa = f'[v{i}]', f'[a{i}]'
    fc = ';'.join(vf + af + [f"{pa}loudnorm=I=-16:TP=-1.5:LRA=11[aout]"])
    run(['ffmpeg', '-y', '-v', 'error', *inputs, '-filter_complex', fc, '-map', pv, '-map', '[aout]',
         '-c:v', 'libx264', '-crf', '18', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-c:a', 'aac', '-b:a', '192k', FINAL])
    # click sounds on top of the mixed narration
    click = CFG.get('sfx_click')
    clicks = []
    off = 0.0
    for i, (sc, (_, d)) in enumerate(zip(scenes, parts)):
        clicks += [off + t for t in SFX.get(sc['id'], [])]
        off += d - XFADE
    json.dump({'scenes': [{'id': sc['id'], 'dur': d} for sc, (_, d) in zip(scenes, parts)], 'clicks': clicks}, open(os.path.join(OUT, 'timeline.json'), 'w'), indent=1)
    if click and clicks:
        tmp = FINAL + '.sfx.mp4'
        n = len(clicks)
        fc = ''.join(f"[1:a]adelay={int(t*1000)}|{int(t*1000)},volume={CFG.get('sfx_gain', 0.5)}[c{i}];" for i, t in enumerate(clicks))
        fc += '[0:a]' + ''.join(f'[c{i}]' for i in range(n)) + f"amix=inputs={n+1}:normalize=0:duration=first[a]"
        run(['ffmpeg', '-y', '-v', 'error', '-i', FINAL, '-i', P(click), '-filter_complex', fc, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', tmp])
        os.replace(tmp, FINAL)
        print(f"   {n} click sounds mixed")
    print(f"→ {FINAL}  {dur_of(FINAL):.1f}s")

if __name__ == '__main__':
    main()
