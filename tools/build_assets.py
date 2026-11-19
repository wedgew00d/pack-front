# 生成画像（元のPNG）をゲーム用に整える。使い方: python3 -I tools/build_assets.py <元のassetsフォルダ> <出力先assetsフォルダ>
# アイテム: 余白を切り、1マス128pxの外形（横×縦マス）に収める。敵: 余白を切り正方形に収める。背景: 地面・防壁・題字用に切り分ける。
import sys, os
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
CELL = 128
ITEMS = {'pistol': (2, 1), 'knife': (1, 1), 'smg': (2, 2), 'shotgun': (3, 1), 'rifle': (4, 1), 'launcher': (2, 2), 'flamer': (3, 2), 'tesla': (3, 2),
         'ammo': (1, 1), 'scope': (1, 1), 'powder': (2, 1), 'cryo': (1, 1), 'medkit': (1, 1), 'plate': (2, 1), 'purse': (1, 1)}
ENEMIES = {'walker': 256, 'runner': 256, 'brute': 320, 'shield': 256, 'flyer': 256, 'boss': 448}

def trim(im):
    im = im.convert('RGBA'); a = im.getchannel('A').point(lambda v: 255 if v > 40 else 0); bb = a.getbbox()
    return im.crop(bb) if bb else im

def fit(im, W, H, pad, stretch=0.13):
    iw, ih = W * (1 - 2 * pad), H * (1 - 2 * pad); ar, tr = im.width / im.height, iw / ih
    if abs(ar / tr - 1) <= stretch: w, h = iw, ih           # 比率が近ければ外形いっぱいに合わせる
    elif ar > tr: w, h = iw, iw / ar
    else: w, h = ih * ar, ih
    im = im.resize((max(1, round(w)), max(1, round(h))), Image.LANCZOS)
    out = Image.new('RGBA', (W, H), (0, 0, 0, 0)); out.paste(im, ((W - im.width) // 2, (H - im.height) // 2), im); return out

def save(im, path, q=86):
    os.makedirs(os.path.dirname(path), exist_ok=True); im.save(path, 'WEBP', quality=q, method=6); print(os.path.relpath(path, dst), im.size, os.path.getsize(path) // 1024, 'KB')

for k, (w, h) in ITEMS.items():
    p = os.path.join(src, 'items', k + '.png')
    if os.path.exists(p): save(fit(trim(Image.open(p)), w * CELL, h * CELL, 0.07), os.path.join(dst, 'items', k + '.webp'))
for k, s in ENEMIES.items():
    p = os.path.join(src, 'enemies', k + '.png')
    if os.path.exists(p): save(fit(trim(Image.open(p)), s, s, 0, stretch=0), os.path.join(dst, 'enemies', k + '.webp'))
p = os.path.join(src, 'bg', 'field.png')
if os.path.exists(p):
    im = Image.open(p).convert('RGB'); W, H = im.size; top = round(H * 912 / 1024)      # 下端の約11%が防壁
    cw = round(top * 9 / 7.2); x0 = (W - cw) // 2
    save(im.crop((x0, 0, x0 + cw, top)).resize((900, 720), Image.LANCZOS), os.path.join(dst, 'bg', 'ground.webp'), 80)
    save(im.crop((0, top, W, H)), os.path.join(dst, 'bg', 'wall.webp'), 84)
p = os.path.join(src, 'bg', 'title.png')
if os.path.exists(p): save(Image.open(p).convert('RGB').resize((720, 1080), Image.LANCZOS), os.path.join(dst, 'bg', 'title.webp'), 80)

# ---------- 演出（fx） ----------
# 黒背景の絵は「明るさ→アルファ」に直す。white=True は色を捨てて白にする（色はゲーム側で付ける）。
fx = os.path.join(src, 'fx')
if os.path.isdir(fx):
    import numpy as np
    def lum(im, white):
        a3 = np.asarray(im.convert('RGB')).astype(np.float32); a = a3.max(axis=2); al = np.clip((a - 6) * 255 / 249, 0, 255)
        rgb = np.full_like(a3, 255) if white else np.clip(a3 / np.maximum(a, 1)[..., None] * 255, 0, 255)
        return Image.fromarray(np.dstack([rgb, al]).astype(np.uint8), 'RGBA')
    def bbox(im, th=12): return im.getchannel('A').point(lambda v: 255 if v > th else 0).getbbox()
    def square(im, size, th=12):          # 絵の中心を保ったまま正方形に切って縮める
        b = bbox(im, th); cx, cy = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2; h = max(b[2] - b[0], b[3] - b[1]) / 2 * 1.06
        return im.crop((round(cx - h), round(cy - h), round(cx + h), round(cy + h))).resize((size, size), Image.LANCZOS)
    def cells(im, cols, rows):
        w, h = im.width / cols, im.height / rows
        return [im.crop((round(c * w), round(r * h), round((c + 1) * w), round((r + 1) * h))) for r in range(rows) for c in range(cols)]
    def pack(fr, cols):
        s = fr[0].width; rows = (len(fr) + cols - 1) // cols; out = Image.new('RGBA', (cols * s, rows * s), (0, 0, 0, 0))
        for i, f in enumerate(fr): out.paste(f, ((i % cols) * s, (i // cols) * s))
        return out
    def src_of(n):
        p = os.path.join(fx, n + '.png'); return Image.open(p) if os.path.exists(p) else None
    o = lambda n: os.path.join(dst, 'fx', n + '.webp')
    for n, size in (('spark', 128), ('crit', 160), ('shockwave', 256), ('slash', 256), ('smoke', 160)):
        im = src_of(n)
        if im: save(square(lum(im, True), size), o(n), 88)
    im = src_of('bullet')
    if im: a = lum(im, True); save(a.crop(bbox(a)).resize((192, 24), Image.LANCZOS), o('bullet'), 90)
    im = src_of('muzzle')
    if im: a = lum(im, True); a = a.crop(bbox(a)); save(a.resize((192, round(192 * a.height / a.width)), Image.LANCZOS), o('muzzle'), 88)
    im = src_of('bolt')
    if im:
        a = lum(im, True); b = bbox(a); m = 12; a = a.crop((0, max(0, b[1] - m), a.width, min(a.height, b[3] + m)))
        save(a.resize((512, max(32, round(512 * a.height / a.width))), Image.LANCZOS), o('bolt'), 88)
    im = src_of('flame')
    if im: save(pack([square(c, 128, 24) for c in cells(lum(im, False), 2, 2)], 4), o('flame'), 86)
    im = src_of('explosion_small')
    if im: save(pack([c.resize((176, 176), Image.LANCZOS) for c in cells(lum(im, False), 2, 2)], 4), o('explosion_small'), 84)
    im = src_of('explosion_big')
    if im: save(pack([c.resize((208, 208), Image.LANCZOS) for c in cells(lum(im, False), 3, 3)], 3), o('explosion_big'), 84)
    im = src_of('debris')
    if im: save(pack([fit(trim(c), 96, 96, 0, stretch=0) for c in cells(im.convert('RGBA'), 2, 2)], 4), o('debris'), 88)

# ---------- 敵の移動アニメ（enemies_anim。2×2 の4コマ） ----------
# コマごとに機体の位置がずれて生成されるので、1コマ目に重なる位置を総当たりで探して合わせてから、4コマ共通の枠で切る。
an = os.path.join(src, 'enemies_anim')
if os.path.isdir(an):
    import numpy as np
    ASIZE = {'walker': 224, 'runner': 224, 'brute': 288, 'shield': 224, 'flyer': 224, 'boss': 400}
    def gray(im, k):
        s = im.resize((im.width // k, im.height // k), Image.BILINEAR); a = np.asarray(s).astype(np.float32)
        return a[..., :3].mean(axis=2) * a[..., 3] / 255 + a[..., 3] * 0.5
    def best(a, b, rng, c0=(0, 0)):       # b をずらして a に最も重なる (dx, dy)
        H, W = a.shape; m = rng + max(abs(c0[0]), abs(c0[1])) + 1; bs, bv = c0, 1e18
        for dy in range(c0[1] - rng, c0[1] + rng + 1):
            for dx in range(c0[0] - rng, c0[0] + rng + 1):
                v = np.abs(a[m:H - m, m:W - m] - b[m - dy:H - m - dy, m - dx:W - m - dx]).mean()
                if v < bv: bv, bs = v, (dx, dy)
        return bs
    for k, size in ASIZE.items():
        p = os.path.join(an, k + '.png')
        if not os.path.exists(p): continue
        im = Image.open(p).convert('RGBA'); w, h = im.width // 2, im.height // 2
        fr = [im.crop((c * w, r * h, (c + 1) * w, (r + 1) * h)) for r in range(2) for c in range(2)]
        pad = 80; big = []
        for i, f in enumerate(fr):
            dx = dy = 0
            if i:
                cx, cy = best(gray(fr[0], 8), gray(f, 8), 7); dx, dy = best(gray(fr[0], 2), gray(f, 2), 3, (cx * 4, cy * 4)); dx *= 2; dy *= 2
            c = Image.new('RGBA', (w + pad * 2, h + pad * 2), (0, 0, 0, 0)); c.paste(f, (pad + dx, pad + dy)); big.append(c)
            print('  ', k, 'コマ', i + 1, 'ずれ補正', (dx, dy))
        bbs = [b.getchannel('A').point(lambda v: 255 if v > 40 else 0).getbbox() for b in big]
        x0, y0, x1, y1 = min(b[0] for b in bbs), min(b[1] for b in bbs), max(b[2] for b in bbs), max(b[3] for b in bbs)
        cx, cy, hf = (x0 + x1) / 2, (y0 + y1) / 2, max(x1 - x0, y1 - y0) / 2
        box = (round(cx - hf), round(cy - hf), round(cx + hf), round(cy + hf))
        out = Image.new('RGBA', (size * 4, size), (0, 0, 0, 0))
        for i, b in enumerate(big): out.paste(b.crop(box).resize((size, size), Image.LANCZOS), (i * size, 0))
        save(out, os.path.join(dst, 'enemies_anim', k + '.webp'), 86)
