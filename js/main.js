// 画面と操作。ルールは sim.js にあり、ここでは数値を決めない。
(function () {
  'use strict';
  const S = window.SIM, ITEMS = window.ITEMS, EN = window.ENEMIES, ORDER = window.ENEMY_ORDER;
  const $ = id => document.getElementById(id);
  const AU = window.AUDIO || { init() { }, music() { }, se() { }, setVol() { }, vol: { bgm: 0, se: 0 } };
  const SHOT = { pistol: 'shot_pistol', smg: 'shot_smg', shotgun: 'shot_shotgun', rifle: 'shot_rifle', launcher: 'shot_launcher', flamer: 'flame', tesla: 'zap', knife: 'slash' };
  const cv = $('cv'), ui = $('ui'); let ctx = cv.getContext('2d', { alpha: false });
  const FONT = '"Hiragino Kaku Gothic ProN","Noto Sans JP","Yu Gothic","Meiryo",sans-serif';
  const DEBUG = location.hash === '#debug';
  const TOUCH = matchMedia('(pointer:coarse)').matches;

  // 配置（単位は u。画面は 9 × 16）
  const CELL = 0.84, BAGX = (9 - S.BW * CELL) / 2, BAGY = 9.85, BENX = (9 - S.NW * CELL) / 2, BENY = 5.55, FY = 1.0, WALLY = FY + S.LINE;
  const CARDW = 2.05, CARDH = 2.55, CARDY = 2.35, cardX = i => 0.25 + i * (CARDW + 0.1);

  let W, H, dpr, u, ox, oy, last = 0, time = 0;
  let run = null, B = null, mode = 'title', paused = false, speed = 1, build = null;
  let sel = null, drag = null, banner = null, shake = 0, simDt = 0, lastDraw = -1e9;
  const parts = [], fxs = [], sps = [], MAXP = TOUCH ? 700 : 1600, MAXS = TOUCH ? 150 : 380;

  // ---------- 画像（あるものだけ使う。無ければコードの絵のまま） ----------
  const IMG = { items: {}, enemies: {}, white: {}, bg: {} }, warm = [];   // warm: 一度も描いていない画像。タイトル表示中に1回ずつ描いて、初回の引っかかりを先に済ませる
  const ESC = { walker: 1.7, runner: 1.8, brute: 1.55, shield: 1.7, flyer: 1.9, boss: 1.4 };   // 当たり半径に対する絵の大きさ
  // 読みこんだら先に展開（decode）しておく。初めて描く瞬間に展開が走ると引っかかるため
  function loadImg(group, key, path, then) { const im = new Image(); im.onload = () => { (im.decode ? im.decode() : Promise.resolve()).catch(() => { }).then(() => { IMG[group][key] = im; warm.push(im); if (then) then(im); }); }; im.onerror = () => { }; im.src = path; }
  for (const k in ITEMS) loadImg('items', k, 'assets/items/' + k + '.webp');
  for (const k of ORDER) loadImg('enemies', k, 'assets/enemies/' + k + '.webp', im => {   // 被弾の白飛ばし用に、白い影絵を作っておく
    const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d');
    x.drawImage(im, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); IMG.white[k] = c;
  });
  IMG.anim = {}; IMG.animWhite = {};
  const AFPS = { walker: 6, runner: 12, brute: 4, shield: 5, flyer: 5, boss: 3.5 }, ASC = 1.08;   // 歩行アニメの毎秒コマ数と、静止画に対する拡大率
  function whiteOf(im) { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); return c; }
  for (const k of ORDER) loadImg('anim', k, 'assets/enemies_anim/' + k + '.webp', im => { IMG.animWhite[k] = whiteOf(im); });
  IMG.fx = {};
  const SHEET = { flame: [4, 1], explosion_small: [4, 1], explosion_big: [3, 3], debris: [4, 1] };   // 連番の 列×行
  const wcol = fs => Object.keys(ITEMS).filter(k => fs.indexOf(ITEMS[k].fire) >= 0).map(k => ITEMS[k].c), ecol = ORDER.map(k => EN[k].c);
  const WARM = { bullet: wcol(['bullet', 'pellets']), muzzle: wcol(['bullet', 'pellets', 'shell']), spark: wcol(['bullet', 'pellets', 'shell', 'flame', 'melee', 'chain']).concat('#ff5a4d'), crit: ['#ffe9a0'],
    shockwave: ecol.concat(wcol(['shell'])), slash: wcol(['melee']), bolt: wcol(['chain']), smoke: ['#565c68'] };   // 戦闘中に初めて作ると引っかかるので、使う色の版を読みこみ時に作っておく
  for (const k of ['bullet', 'muzzle', 'spark', 'crit', 'shockwave', 'bolt', 'slash', 'smoke', 'flame', 'explosion_small', 'explosion_big', 'debris']) loadImg('fx', k, 'assets/fx/' + k + '.webp', () => (WARM[k] || []).forEach(c => tint(k, c)));
  const tints = {};
  function tint(k, c) {   // 白い絵に色を付けた版を作って使い回す。芯は白を少し残す
    const id = k + c; if (tints[id]) return tints[id]; const im = IMG.fx[k], t = document.createElement('canvas'); t.width = im.width; t.height = im.height; const x = t.getContext('2d');
    x.drawImage(im, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = c; x.fillRect(0, 0, t.width, t.height); x.globalCompositeOperation = 'lighter'; x.globalAlpha = 0.4; x.drawImage(im, 0, 0);
    if (window.createImageBitmap) createImageBitmap(t).then(b => { tints[id] = b; }).catch(() => { });
    return (tints[id] = t);
  }
  loadImg('bg', 'ground', 'assets/bg/ground.webp'); loadImg('bg', 'wall', 'assets/bg/wall.webp');

  // ---------- 基本 ----------
  function resize() {
    W = innerWidth; H = innerHeight; dpr = Math.min(window.devicePixelRatio || 1, 2);
    u = Math.min(W / 9, H / 16); ox = (W - 9 * u) / 2; oy = (H - 16 * u) / 2;
    cv.width = Math.round(9 * u * dpr); cv.height = Math.round(16 * u * dpr);       // 画面全体ではなく、遊ぶ列（9×16）だけを描く
    cv.style.left = ox + 'px'; cv.style.top = oy + 'px'; cv.style.width = 9 * u + 'px'; cv.style.height = 16 * u + 'px';
    for (const k in itemCache) delete itemCache[k]; groundCache = null;
    ui.style.left = ox + 'px'; ui.style.top = oy + 'px';
    document.documentElement.style.setProperty('--u', u + 'px');
  }
  const setU = () => ctx.setTransform(dpr * u, 0, 0, dpr * u, 0, 0);
  function txt(s, x, y, size, col, align, weight) {
    ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = (weight || 700) + ' ' + (size * u) + 'px ' + FONT; ctx.fillStyle = col; ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(s, x * u, y * u); ctx.restore();
  }
  function toast(s) { const t = $('toast'); t.textContent = s; t.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), 1800); }
  let bestV = -1;
  function best(v) {   // 読むのは最初の1回だけ。書くのは記録が伸びたときだけで、コマの外へ回す（保存は同期処理で、引っかかりの元になる）
    if (bestV < 0) { try { bestV = +(localStorage.getItem('packfront.best') || 0); } catch (e) { bestV = 0; } }
    if (v != null && v > bestV) { bestV = v; (window.requestIdleCallback || setTimeout)(() => { try { localStorage.setItem('packfront.best', String(bestV)); } catch (e) { } }); }
    return bestV;
  }

  // ---------- アイテムの絵 ----------
  const L = (a, b, c, d) => { ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke(); };
  const R = (x, y, w, h, f) => { ctx.beginPath(); ctx.rect(x, y, w, h); f ? ctx.fill() : ctx.stroke(); };
  const C = (x, y, r, f) => { ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); f ? ctx.fill() : ctx.stroke(); };
  const P = (p, f) => { ctx.beginPath(); ctx.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]); ctx.closePath(); f ? ctx.fill() : ctx.stroke(); };
  const ICON = {
    pistol() { R(-0.68, -0.26, 1.3, 0.22, 1); P([-0.66, -0.04, -0.3, -0.04, -0.42, 0.34, -0.74, 0.34], 1); L(-0.2, 0.02, -0.12, 0.14); },
    knife() { P([0.36, -0.36, -0.02, 0.14, -0.15, 0.0], 1); ctx.lineWidth = 0.13; L(-0.12, 0.1, -0.32, 0.32); },
    smg() { R(-0.8, -0.72, 1.45, 0.28, 1); R(0.65, -0.64, 0.25, 0.12, 1); R(-0.66, -0.44, 0.3, 1.12, 1); P([-0.1, -0.44, 0.12, -0.44, 0.04, -0.14, -0.14, -0.14], 1); },
    shotgun() { ctx.lineWidth = 0.09; L(-0.4, -0.16, 1.3, -0.16); L(-0.4, 0.0, 1.3, 0.0); P([-1.32, 0.22, -0.4, -0.22, -0.4, 0.08, -1.32, 0.36], 1); R(0.15, 0.06, 0.55, 0.14, 1); },
    rifle() { ctx.lineWidth = 0.08; L(-0.2, -0.04, 1.8, -0.04); R(-1.0, -0.16, 1.2, 0.24, 1); P([-1.82, -0.1, -1.0, -0.16, -1.0, 0.08, -1.82, 0.3], 1); R(-0.55, -0.38, 0.85, 0.13, 1); L(0.9, 0.0, 0.75, 0.3); L(0.9, 0.0, 1.05, 0.3); },
    launcher() { ctx.lineWidth = 0.1; C(0, 0, 0.6); C(0, 0, 0.27, 1); for (let i = 0; i < 6; i++) { const a = i * 1.0472; L(Math.cos(a) * 0.42, Math.sin(a) * 0.42, Math.cos(a) * 0.5, Math.sin(a) * 0.5); } },
    flamer() { ctx.lineWidth = 0.13; L(-0.9, -0.5, 0.95, -0.5); P([0.95, -0.7, 1.36, -0.5, 0.95, -0.3], 1); ctx.lineWidth = 0.08; C(-1.0, 0.45, 0.33); ctx.beginPath(); ctx.moveTo(-1.0, 0.12); ctx.quadraticCurveTo(-1.0, -0.5, -0.5, -0.5); ctx.stroke(); C(-1.0, 0.45, 0.1, 1); },
    tesla() { R(-1.2, 0.36, 2.4, 0.26, 1); ctx.lineWidth = 0.1; L(0, 0.36, 0, -0.42); C(0, -0.6, 0.2, 1); ctx.lineWidth = 0.055; P([-0.2, -0.5, -0.5, -0.1, -0.35, 0.0, -0.8, 0.34, -0.35, 0.0, -0.5, -0.1], 0); P([0.2, -0.5, 0.5, -0.1, 0.35, 0.0, 0.8, 0.34, 0.35, 0.0, 0.5, -0.1], 0); },
    ammo() { R(-0.3, -0.02, 0.6, 0.32, 1); ctx.lineWidth = 0.11; L(-0.18, -0.1, -0.18, -0.3); L(0, -0.1, 0, -0.3); L(0.18, -0.1, 0.18, -0.3); },
    scope() { C(0, 0, 0.28); L(-0.4, 0, 0.4, 0); L(0, -0.4, 0, 0.4); C(0, 0, 0.06, 1); },
    powder() { R(-0.78, -0.28, 0.72, 0.56); L(-0.78, -0.1, -0.06, -0.1); L(-0.78, 0.1, -0.06, 0.1); for (let i = 0; i < 4; i++) { const a = i * 0.7854; L(0.45 - Math.cos(a) * 0.28, -Math.sin(a) * 0.28, 0.45 + Math.cos(a) * 0.28, Math.sin(a) * 0.28); } },
    cryo() { for (let i = 0; i < 3; i++) { const a = i * 1.0472 + 0.5236; L(-Math.cos(a) * 0.32, -Math.sin(a) * 0.32, Math.cos(a) * 0.32, Math.sin(a) * 0.32); } C(0, 0, 0.08, 1); },
    medkit() { R(-0.1, -0.3, 0.2, 0.6, 1); R(-0.3, -0.1, 0.6, 0.2, 1); },
    plate() { R(-0.8, -0.3, 1.6, 0.6); C(-0.62, -0.14, 0.05, 1); C(0.62, -0.14, 0.05, 1); C(-0.62, 0.14, 0.05, 1); C(0.62, 0.14, 0.05, 1); L(-0.3, 0.3, 0.3, -0.3); },
    purse() { C(0, 0, 0.3); C(0, 0, 0.15, 1); }
  };
  const itemCache = {}; let groundCache = null;
  function drawItem(key, lv, rot, px, py, cs, a) {   // 一度描いた絵を取っておき、以後は1回の貼りつけで済ませる
    const P = u * dpr, c = itemCanvas(key, lv, rot, cs);
    if (a != null && a !== 1) { const ga = ctx.globalAlpha; ctx.globalAlpha = ga * a; ctx.drawImage(c, px, py, c.width / P, c.height / P); ctx.globalAlpha = ga; }
    else ctx.drawImage(c, px, py, c.width / P, c.height / P);
  }
  function itemCanvas(key, lv, rot, cs) {
    const P = u * dpr, sh = S.cellsOf(key, rot), id = key + '|' + lv + '|' + rot + '|' + Math.round(cs * P) + '|' + (IMG.items[key] ? 1 : 0);
    let c = itemCache[id];
    if (!c) {
      c = itemCache[id] = document.createElement('canvas'); c.width = Math.ceil(sh.w * cs * P); c.height = Math.ceil(sh.h * cs * P);
      const real = ctx; ctx = c.getContext('2d'); ctx.setTransform(P, 0, 0, P, 0, 0); paintItem(key, lv, rot, 0, 0, cs, 1); ctx = real;
    }
    return c;
  }
  const shopCs = key => { const sh = S.cellsOf(key, 0); return Math.min(0.56, 1.8 / sh.w, 1.25 / sh.h); };
  function paintItem(key, lv, rot, px, py, cs, a) {
    const d = ITEMS[key], sh = S.cellsOf(key, rot), set = new Set(sh.cells.map(c => c[0] + c[1] * 8)), g = cs * 0.06, e = cs * 0.012;
    const has = (x, y) => x >= 0 && set.has(x + y * 8);
    ctx.save(); ctx.globalAlpha = a == null ? 1 : a;
    ctx.beginPath();
    for (const [x, y] of sh.cells) {
      const x0 = px + x * cs + (has(x - 1, y) ? -e : g), x1 = px + (x + 1) * cs - (has(x + 1, y) ? -e : g);
      const y0 = py + y * cs + (has(x, y - 1) ? -e : g), y1 = py + (y + 1) * cs - (has(x, y + 1) ? -e : g);
      ctx.rect(x0, y0, x1 - x0, y1 - y0);
    }
    const gr = ctx.createLinearGradient(0, py, 0, py + sh.h * cs);
    if (d.kind === 'w') { gr.addColorStop(0, '#2c3854'); gr.addColorStop(1, '#161c2b'); } else { gr.addColorStop(0, '#3b3324'); gr.addColorStop(1, '#1d1811'); }
    ctx.fillStyle = gr; ctx.fill();
    ctx.globalAlpha *= 0.12; ctx.fillStyle = d.c; ctx.fill(); ctx.globalAlpha /= 0.12;
    ctx.beginPath();
    for (const [x, y] of sh.cells) {
      const x0 = px + x * cs + g, x1 = px + (x + 1) * cs - g, y0 = py + y * cs + g, y1 = py + (y + 1) * cs - g;
      const l = has(x - 1, y), r = has(x + 1, y), t = has(x, y - 1), b = has(x, y + 1);
      if (!t) { ctx.moveTo(l ? x0 - 2 * g : x0, y0); ctx.lineTo(r ? x1 + 2 * g : x1, y0); }
      if (!b) { ctx.moveTo(l ? x0 - 2 * g : x0, y1); ctx.lineTo(r ? x1 + 2 * g : x1, y1); }
      if (!l) { ctx.moveTo(x0, t ? y0 - 2 * g : y0); ctx.lineTo(x0, b ? y1 + 2 * g : y1); }
      if (!r) { ctx.moveTo(x1, t ? y0 - 2 * g : y0); ctx.lineTo(x1, b ? y1 + 2 * g : y1); }
    }
    const im = IMG.items[key];
    ctx.strokeStyle = d.c; ctx.lineWidth = cs * (im ? 0.035 : 0.045); ctx.lineCap = 'square'; if (im) ctx.globalAlpha *= 0.7; ctx.stroke(); if (im) ctx.globalAlpha /= 0.7;
    ctx.save();
    ctx.translate(px + sh.w * cs / 2, py + sh.h * cs / 2); ctx.rotate(rot * Math.PI / 2);
    if (im) { const b = S.cellsOf(key, 0); ctx.drawImage(im, -b.w * cs / 2, -b.h * cs / 2, b.w * cs, b.h * cs); }
    else { ctx.scale(cs, cs); ctx.strokeStyle = d.c; ctx.fillStyle = d.c; ctx.lineWidth = 0.075; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ICON[key](); }
    ctx.restore();
    if (lv > 1) {
      let c0 = sh.cells[0]; for (const c of sh.cells) if (c[1] < c0[1] || (c[1] === c0[1] && c[0] < c0[0])) c0 = c;
      ctx.fillStyle = '#ffe08a';
      for (let i = 0; i < lv; i++) { const x = px + c0[0] * cs + cs * (0.2 + i * 0.17), y = py + c0[1] * cs + cs * 0.2, r = cs * 0.075; P([x, y - r, x + r, y, x, y + r, x - r, y], 1); }
    }
    ctx.restore();
  }

  const glows = {};
  function glowOf(c) {   // 敵の足元の光。毎フレーム作らず、色ごとに1枚作って使い回す
    if (glows[c]) return glows[c]; const t = document.createElement('canvas'); t.width = t.height = 96; const x = t.getContext('2d'), g = x.createRadialGradient(48, 48, 0, 48, 48, 48);
    g.addColorStop(0, c + '66'); g.addColorStop(0.6, c + '22'); g.addColorStop(1, c + '00'); x.fillStyle = g; x.fillRect(0, 0, 96, 96); return (glows[c] = t);
  }
  // ---------- 敵の絵 ----------
  function poly(n, r, rot) { ctx.beginPath(); for (let i = 0; i < n; i++) { const a = rot + i * 6.2832 / n; i ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); }
  function enemyShape(type, r, t) {
    if (type === 'walker') poly(6, r, 0.5236);
    else if (type === 'runner') { ctx.beginPath(); ctx.moveTo(0, r * 1.35); ctx.lineTo(-r, -r); ctx.lineTo(0, -r * 0.45); ctx.lineTo(r, -r); ctx.closePath(); }
    else if (type === 'brute') poly(8, r, 0.3927);
    else if (type === 'shield') { ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.2832); }
    else if (type === 'flyer') { const f = Math.sin(t * 14) * 0.25; ctx.beginPath(); ctx.moveTo(0, r); ctx.lineTo(r * 1.5, -r * (0.2 + f)); ctx.lineTo(r * 0.4, -r * 0.2); ctx.lineTo(0, -r); ctx.lineTo(-r * 0.4, -r * 0.2); ctx.lineTo(-r * 1.5, -r * (0.2 + f)); ctx.closePath(); }
    else poly(10, r, t * 0.3);
  }
  function drawEnemy(type, x, y, r, c, o) {
    o = o || {}; const t = time + (o.ph || 0);
    ctx.save(); ctx.translate(x, y); ctx.lineJoin = 'round';
    const an = IMG.anim[type], im = an || IMG.enemies[type];
    if (im) {
      const s = r * 2 * ESC[type] * (an ? ASC : 1), ga = ctx.globalAlpha, fw = an ? an.height : 0, fi = an ? (Math.floor(o.f == null ? 1 : o.f) % 4 + 4) % 4 : 0;
      if (o.lunge) ctx.translate(0, o.lunge);
      const gl = glowOf(c), gs = s * 1.24; ctx.drawImage(gl, -gs / 2, -gs / 2, gs, gs);
      if (an) ctx.drawImage(an, fi * fw, 0, fw, fw, -s / 2, -s / 2, s, s); else ctx.drawImage(im, -s / 2, -s / 2, s, s);
      const wh = an ? IMG.animWhite[type] : IMG.white[type];
      if (o.hit > 0 && wh) { ctx.globalAlpha = ga * Math.min(1, o.hit) * 0.7; if (an) ctx.drawImage(wh, fi * fw, 0, fw, fw, -s / 2, -s / 2, s, s); else ctx.drawImage(wh, -s / 2, -s / 2, s, s); ctx.globalAlpha = ga; }
      if (o.slow) { ctx.strokeStyle = '#9be7ff'; ctx.lineWidth = 0.035; C(0, 0, r + 0.12); }
      if (o.atk > 0) { ctx.strokeStyle = '#ff5a4d'; ctx.lineWidth = 0.06; ctx.beginPath(); ctx.arc(0, 0, r + 0.12, -1.5708, -1.5708 + 6.2832 * Math.min(1, o.atk)); ctx.stroke(); }
      if (o.hp != null && o.hp < 1) { const w = r * 1.8, yy = -s / 2 - 0.06; ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(-w / 2, yy, w, 0.07); ctx.fillStyle = c; ctx.fillRect(-w / 2, yy, w * Math.max(0, o.hp), 0.07); }
      ctx.restore(); return;
    }
    enemyShape(type, r, t); ctx.fillStyle = '#170f15'; ctx.fill(); ctx.strokeStyle = c; ctx.lineWidth = 0.055; ctx.stroke();
    ctx.fillStyle = c;
    if (type === 'brute') { ctx.globalAlpha = 0.35; poly(4, r * 0.62, 0.7854); ctx.fill(); ctx.globalAlpha = 1; C(0, r * 0.25, r * 0.16, 1); }
    else if (type === 'shield') { ctx.lineWidth = 0.11; ctx.beginPath(); ctx.arc(0, 0, r + 0.07, 0.5, 2.64); ctx.stroke(); C(0, 0, r * 0.25, 1); }
    else if (type === 'boss') {
      ctx.lineWidth = 0.07;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(0, 0, r * 0.68, t * -1.2 + i * 2.094, t * -1.2 + i * 2.094 + 1.2); ctx.stroke(); }
      C(0, 0, r * (0.25 + 0.04 * Math.sin(t * 5)), 1);
    } else C(0, r * 0.15, r * 0.24, 1);
    if (o.slow) { ctx.strokeStyle = '#9be7ff'; ctx.lineWidth = 0.035; ctx.globalAlpha = 0.8; C(0, 0, r + 0.12); ctx.globalAlpha = 1; }
    if (o.atk > 0) { ctx.strokeStyle = '#ff5a4d'; ctx.lineWidth = 0.05; ctx.beginPath(); ctx.arc(0, 0, r + 0.1, -1.5708, -1.5708 + 6.2832 * Math.min(1, o.atk)); ctx.stroke(); }
    if (o.hit > 0) { enemyShape(type, r, t); ctx.globalAlpha = Math.min(1, o.hit) * 0.75; ctx.fillStyle = '#fff'; ctx.fill(); ctx.globalAlpha = 1; }
    if (o.hp != null && o.hp < 1) { const w = r * 1.8; ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(-w / 2, -r - 0.2, w, 0.07); ctx.fillStyle = c; ctx.fillRect(-w / 2, -r - 0.2, w * Math.max(0, o.hp), 0.07); }
    ctx.restore();
  }

  // ---------- 演出 ----------
  function spark(x, y, n, c, sp, life, size) {
    for (let i = 0; i < n && parts.length < MAXP; i++) { const a = Math.random() * 6.2832, v = sp * (0.3 + Math.random() * 0.7); parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, c, s: size || 0.035 }); }
  }
  // 画像の演出。s0→s1 は大きさ（u）、k は連番の名前、frame を指定すると連番の1コマだけ使う
  function sp(o) { if (sps.length < MAXS) sps.push(Object.assign({ t: 0, vx: 0, vy: 0, rot: 0, vr: 0, a: 1, add: true, s1: o.s0, frame: -1, delay: 0 }, o)); }
  const rnd = Math.random;
  function consume(ev) {
    const F = IMG.fx;
    for (const e of ev) {
      const y = e.y != null ? FY + e.y : WALLY;
      if (e.k === 'hit') {
        if (e.crit) AU.se('crit');
        spark(e.x, y, e.crit ? 6 : 2, e.crit ? '#fff3b0' : e.c, e.crit ? 4 : 2.4, 0.25, e.crit ? 0.05 : 0.03);
        if (F.spark) sp({ im: tint('spark', e.c), x: e.x, y, s0: 0.5, s1: 1.0, max: 0.15, rot: rnd() * 6.28, a: 1 });
        if (e.crit && F.crit) sp({ im: tint('crit', '#ffe9a0'), x: e.x, y, s0: 0.5, s1: 1.5, max: 0.24, rot: rnd() * 0.8 - 0.4 });
      } else if (e.k === 'die') {
        const big = e.r >= 0.9; AU.se(big ? 'die_big' : 'die');
        spark(e.x, y, TOUCH ? 6 : 12, e.c, 3.6, 0.5, 0.04);
        if (F.explosion_small && F.explosion_big) {
          const k = big ? 'explosion_big' : 'explosion_small';
          sp({ im: F[k], k, x: e.x, y, s0: e.r * 3.4, s1: e.r * 5.2, max: big ? 1.0 : 0.5, rot: rnd() * 6.28, add: false, fade: 1 });
          if (big) for (let i = 1; i < 7; i++) sp({ im: F.explosion_big, k: 'explosion_big', x: e.x + (rnd() - 0.5) * 2.4, y: y + (rnd() - 0.5) * 2.4, s0: 1.6, s1: 3 + rnd() * 1.5, max: 0.8, rot: rnd() * 6.28, add: false, fade: 1, delay: i * 0.13 });
        } else fxs.push({ k: 'ring', x: e.x, y, r: e.r * 2.2, t: 0, max: 0.3, c: e.c });
        if (F.shockwave) sp({ im: tint('shockwave', e.c), x: e.x, y, s0: e.r * 1.2, s1: e.r * (big ? 9 : 5.5), max: big ? 0.6 : 0.34, a: 0.85 });
        if (F.debris) for (let i = 0, n = big ? 12 : TOUCH ? 2 : 3; i < n; i++) { const a = rnd() * 6.28, v = 1.6 + rnd() * 3.2; sp({ im: F.debris, k: 'debris', frame: (rnd() * 4) | 0, x: e.x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, s0: Math.min(0.5, e.r * 1.1), s1: Math.min(0.4, e.r * 0.8), max: 0.55 + rnd() * 0.3, rot: a, vr: (rnd() - 0.5) * 16, add: false, fade: 1, drag: 2.2 }); }
        if (F.smoke) sp({ im: tint('smoke', '#565c68'), x: e.x, y, vy: -0.35, s0: e.r * 2.2, s1: e.r * 4.4, max: 0.9, a: 0.3, rot: rnd() * 6.28, add: false });
      } else if (e.k === 'boom') {
        AU.se('boom');
        spark(e.x, y, TOUCH ? 8 : 18, '#ffd9a0', 5, 0.45, 0.045);
        if (F.explosion_big) sp({ im: F.explosion_big, k: 'explosion_big', x: e.x, y, s0: e.r * 1.9, s1: e.r * 2.9, max: 0.6, rot: rnd() * 6.28, add: false, fade: 1 });
        else fxs.push({ k: 'ring', x: e.x, y, r: e.r, t: 0, max: 0.35, c: e.c, fill: 1 });
        if (F.shockwave) sp({ im: tint('shockwave', e.c), x: e.x, y, s0: e.r * 0.8, s1: e.r * 2.8, max: 0.3, a: 0.9 });
      } else if (e.k === 'bolt') fxs.push({ k: 'bolt', pts: e.pts, t: 0, max: 0.18, c: e.c, seed: rnd() * 100 });
      else if (e.k === 'slash') { if (F.slash) sp({ im: tint('slash', e.c), x: e.x, y: y + 0.05, s0: 1.0, s1: 1.5, max: 0.17, rot: rnd() * 1.4 - 1.2 }); else fxs.push({ k: 'slash', x: e.x, y, t: 0, max: 0.14, c: e.c }); }
      else if (e.k === 'wall') { shake = 1; AU.se('wall'); spark(e.x, WALLY, 6, '#ff5a4d', 3, 0.35, 0.04); if (F.spark) sp({ im: tint('spark', '#ff5a4d'), x: e.x, y: WALLY, s0: 0.6, s1: 1.3, max: 0.2, rot: rnd() * 6.28 }); }
      else if (e.k === 'flame') {
        if (F.flame) for (let i = 0; i < 2; i++) { const a = e.a + (rnd() - 0.5) * 0.75, v = e.range / 0.4 * (0.75 + rnd() * 0.35); sp({ im: F.flame, k: 'flame', frame: (rnd() * 4) | 0, x: e.x, y: WALLY, vx: Math.cos(a) * v, vy: Math.sin(a) * v, s0: 0.3, s1: 1.25, max: 0.4, rot: a + 1.57, vr: (rnd() - 0.5) * 3, a: 0.85 }); }
        else for (let i = 0; i < 3 && parts.length < MAXP; i++) { const a = e.a + (rnd() - 0.5) * 0.8, v = e.range / 0.38 * (0.7 + rnd() * 0.4); parts.push({ x: e.x, y: WALLY, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.38, max: 0.38, c: 'flame', s: 0.07 }); }
      } else if (e.k === 'fire') {
        AU.se(SHOT[e.key]);
        if (F.muzzle && (e.f === 'bullet' || e.f === 'pellets' || e.f === 'shell')) { const z = e.q ? 0.42 : e.f === 'bullet' ? 0.7 : 0.95; sp({ im: tint('muzzle', e.c), x: e.x, y: WALLY + 0.05, s0: z, s1: z * 1.25, max: 0.075, rot: -1.5708, left: 1 }); }
        else fxs.push({ k: 'muzzle', x: e.x, y: WALLY, t: 0, max: 0.07, c: e.c });
      }
    }
  }
  function updateFx(dt) {
    for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.life -= dt; if (p.life <= 0) { parts[i] = parts[parts.length - 1]; parts.pop(); continue; } p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - 2.5 * dt; p.vy *= 1 - 2.5 * dt; }
    for (let i = sps.length - 1; i >= 0; i--) {
      const q = sps[i]; if (q.delay > 0) { q.delay -= dt; continue; }
      q.t += dt; if (q.t >= q.max) { sps[i] = sps[sps.length - 1]; sps.pop(); continue; }
      q.x += q.vx * dt; q.y += q.vy * dt; if (q.drag) { q.vx *= 1 - q.drag * dt; q.vy *= 1 - q.drag * dt; }
    }
    for (let i = fxs.length - 1; i >= 0; i--) { fxs[i].t += dt; if (fxs[i].t >= fxs[i].max) fxs.splice(i, 1); }
    shake = Math.max(0, shake - dt * 5);
    if (banner) { banner.t += dt; if (banner.t > 2.2) banner = null; }
  }
  function drawSprites(add) {
    for (const q of sps) {
      if (q.add !== add || q.delay > 0) continue;
      const k = q.t / q.max, size = q.s0 + (q.s1 - q.s0) * (1 - (1 - k) * (1 - k)), al = q.a * (q.fade ? Math.min(1, (1 - k) * 2.5) : 1 - k), sh = SHEET[q.k];
      ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot + q.vr * q.t);
      if (!sh) { const h = size * q.im.height / q.im.width; ctx.globalAlpha = al; ctx.drawImage(q.im, q.left ? 0 : -size / 2, -h / 2, size, h); }
      else {
        const n = sh[0] * sh[1], fw = q.im.width / sh[0], fh = q.im.height / sh[1], f = q.frame >= 0 ? q.frame : Math.min(n - 1, k * n), i = Math.floor(f), fr = q.frame >= 0 ? 0 : f - i;
        ctx.globalAlpha = al * (1 - fr); ctx.drawImage(q.im, (i % sh[0]) * fw, Math.floor(i / sh[0]) * fh, fw, fh, -size / 2, -size / 2, size, size);
        if (fr > 0.01 && i + 1 < n) { ctx.globalAlpha = al * fr; ctx.drawImage(q.im, ((i + 1) % sh[0]) * fw, Math.floor((i + 1) / sh[0]) * fh, fw, fh, -size / 2, -size / 2, size, size); }
      }
      ctx.restore();
    }
  }
  function drawFx() {
    ctx.save(); drawSprites(false); ctx.globalCompositeOperation = 'lighter'; drawSprites(true);
    for (const p of parts) {
      const k = p.life / p.max;
      if (p.c === 'flame') { ctx.fillStyle = k > 0.6 ? '#fff0a0' : k > 0.3 ? '#ff9a2e' : '#c8321a'; ctx.globalAlpha = k * 0.7; const s = p.s * (2.2 - k); ctx.fillRect(p.x - s, p.y - s, s * 2, s * 2); }
      else { ctx.fillStyle = p.c; ctx.globalAlpha = k; ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s); }
    }
    for (const f of fxs) {
      const k = f.t / f.max; ctx.globalAlpha = 1 - k; ctx.strokeStyle = f.c; ctx.fillStyle = f.c;
      if (f.k === 'ring') { const r = f.r * (0.3 + 0.7 * (1 - (1 - k) * (1 - k))); ctx.lineWidth = 0.06 * (1 - k) + 0.01; C(f.x, f.y, r); if (f.fill) { ctx.globalAlpha = (1 - k) * 0.25; C(f.x, f.y, r, 1); } }
      else if (f.k === 'bolt' && IMG.fx.bolt) {
        const im = tint('bolt', f.c), flip = Math.floor(f.t * 40) % 2 ? 1 : -1;
        for (let i = 1; i < f.pts.length; i++) {
          const ax = f.pts[i - 1][0], ay = i === 1 ? WALLY : FY + f.pts[i - 1][1], bx = f.pts[i][0], by = FY + f.pts[i][1], len = Math.hypot(bx - ax, by - ay), th = Math.min(0.7, 0.3 + len * 0.12);
          ctx.save(); ctx.translate(ax, ay); ctx.rotate(Math.atan2(by - ay, bx - ax)); ctx.scale(1, i % 2 ? flip : -flip); ctx.drawImage(im, 0, -th / 2, len, th); ctx.drawImage(im, 0, -th / 2, len, th); ctx.restore();
        }
      } else if (f.k === 'bolt') {
        for (let pass = 0; pass < 2; pass++) {
          ctx.lineWidth = pass ? 0.025 : 0.07; ctx.strokeStyle = pass ? '#fff' : f.c; ctx.beginPath(); ctx.moveTo(f.pts[0][0], WALLY);
          for (let i = 1; i < f.pts.length; i++) {
            const ax = f.pts[i - 1][0], ay = i === 1 ? WALLY : FY + f.pts[i - 1][1], bx = f.pts[i][0], by = FY + f.pts[i][1];
            for (let j = 1; j <= 4; j++) { const q = j / 4, jit = j < 4 ? Math.sin(f.seed + i * 7 + j * 13 + Math.floor(f.t * 60)) * 0.16 : 0; ctx.lineTo(ax + (bx - ax) * q + jit, ay + (by - ay) * q + jit); }
          }
          ctx.stroke();
        }
      } else if (f.k === 'slash') { ctx.lineWidth = 0.07; ctx.beginPath(); ctx.arc(f.x, f.y + 0.2, 0.55, -2.4 + k * 1.2, -0.7 + k * 1.2); ctx.stroke(); }
      else if (f.k === 'muzzle') C(f.x, f.y, 0.1 * (1 - k) + 0.03, 1);
    }
    ctx.restore();
  }

  // ---------- 画面 ----------
  function drawField() {
    ctx.save(); ctx.beginPath(); ctx.rect(0, FY, 9, 7.65); ctx.clip();
    const g = ctx.createLinearGradient(0, FY, 0, WALLY); g.addColorStop(0, '#05070b'); g.addColorStop(0.5, '#0d121c'); g.addColorStop(1, '#151d2c');
    ctx.fillStyle = g; ctx.fillRect(0, FY, 9, 7.65);
    if (IMG.bg.ground) {
      if (!groundCache) {   // 地面＋暗幕＋奥の霧を、画面の解像度で1枚に合成しておく
        const P = u * dpr, t = groundCache = document.createElement('canvas'); t.width = Math.round(9 * P); t.height = Math.round(S.LINE * P); const x = t.getContext('2d');
        x.drawImage(IMG.bg.ground, 0, 0, t.width, t.height); x.fillStyle = 'rgba(5,7,12,.38)'; x.fillRect(0, 0, t.width, t.height);
        const f = x.createLinearGradient(0, 0, 0, 2.6 * P); f.addColorStop(0, 'rgba(3,4,8,.92)'); f.addColorStop(1, 'rgba(3,4,8,0)'); x.fillStyle = f; x.fillRect(0, 0, t.width, 2.6 * P);
      }
      ctx.drawImage(groundCache, 0, FY, 9, S.LINE);
      ctx.restore(); return;
    }
    ctx.strokeStyle = 'rgba(111,227,255,.07)'; ctx.lineWidth = 0.02;
    for (let i = 1; i < 6; i++) L(i * 1.5, FY, i * 1.5, WALLY);
    const sc = mode === 'battle' && !paused ? (time * 0.4) % 1.2 : 0;
    for (let y = FY - 1.2 + sc; y < WALLY; y += 1.2) L(0, y, 9, y);
    ctx.restore();
  }
  function drawWall() {
    const hit = B && mode === 'battle' ? B.wallHit : 0, sx = shake ? Math.sin(time * 90) * 0.04 * shake : 0;
    ctx.save(); ctx.translate(sx, 0);
    if (IMG.bg.wall) {
      ctx.fillStyle = '#0b0e14'; ctx.fillRect(-0.1, WALLY, 9.2, 0.52); ctx.drawImage(IMG.bg.wall, 0, WALLY - 0.135, 9, 0.656);
      if (hit > 0.02) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = hit * 0.45; ctx.fillStyle = '#ff3a2a'; ctx.fillRect(0, WALLY - 0.05, 9, 0.57); }
      ctx.restore(); return;
    }
    ctx.fillStyle = '#1b2231'; ctx.fillRect(0, WALLY, 9, 0.42);
    ctx.fillStyle = hit > 0.05 ? `rgba(255,${Math.round(90 + 90 * (1 - hit))},77,1)` : '#ffb347'; ctx.fillRect(0, WALLY, 9, 0.06);
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.18 + hit * 0.3; ctx.fillRect(0, WALLY - 0.08, 9, 0.22); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#0d1119'; for (let i = 0; i < 12; i++) P([i * 0.8 - 0.2, WALLY + 0.14, i * 0.8 + 0.2, WALLY + 0.14, i * 0.8 + 0.5, WALLY + 0.42, i * 0.8 + 0.1, WALLY + 0.42], 1);
    ctx.restore();
  }
  function drawHud() {
    const inB = mode === 'battle' || mode === 'clear';
    txt('WAVE', 0.25, 0.36, 0.2, '#7f8aa0'); txt((mode === 'clear' ? run.wave - 1 : run.wave) + ' / ' + S.LAST, 0.25, 0.68, 0.36, '#fff', 'left', 900);
    const maxHp = inB ? B.maxHp : build.maxHp, hp = inB ? B.hp : Math.min(run.hp, build.maxHp), k = Math.max(0, hp / maxHp);
    ctx.fillStyle = '#141925'; ctx.fillRect(2.1, 0.42, 3.9, 0.28);
    ctx.fillStyle = k > 0.5 ? '#7be08a' : k > 0.25 ? '#ffb347' : '#ff5a4d'; ctx.fillRect(2.1, 0.42, 3.9 * k, 0.28);
    ctx.strokeStyle = '#3a4560'; ctx.lineWidth = 0.025; ctx.strokeRect(2.1, 0.42, 3.9, 0.28);
    txt('防壁 ' + Math.ceil(hp) + ' / ' + maxHp, 4.05, 0.57, 0.2, '#fff', 'center');
    ctx.fillStyle = '#ffe08a'; P([6.55, 0.56, 6.72, 0.39, 6.89, 0.56, 6.72, 0.73], 1);
    txt(String(run.coin), 7.02, 0.57, 0.38, '#ffe08a', 'left', 900);
  }
  function gridOf(where) { return where === 'bag' ? [BAGX, BAGY] : [BENX, BENY]; }
  function drawBag() {
    const battle = mode === 'battle' || mode === 'clear';
    const next = S.EXP[run.exp + 1], nox = next ? (S.BW - next[0]) >> 1 : 0, noy = next ? (S.BH - next[1]) >> 1 : 0;
    for (let y = 0; y < S.BH; y++) for (let x = 0; x < S.BW; x++) {
      const px = BAGX + x * CELL, py = BAGY + y * CELL;
      if (S.active(run, x, y)) { ctx.fillStyle = '#141a26'; ctx.fillRect(px + 0.03, py + 0.03, CELL - 0.06, CELL - 0.06); ctx.strokeStyle = '#2a3346'; ctx.lineWidth = 0.02; ctx.strokeRect(px + 0.03, py + 0.03, CELL - 0.06, CELL - 0.06); }
      else if (!battle && next && x >= nox && x < nox + next[0] && y >= noy && y < noy + next[1]) { ctx.strokeStyle = 'rgba(255,179,71,.35)'; ctx.lineWidth = 0.02; ctx.setLineDash([0.08, 0.08]); ctx.strokeRect(px + 0.08, py + 0.08, CELL - 0.16, CELL - 0.16); ctx.setLineDash([]); }
    }
    const wmap = new Map(); if (battle) for (const w of B.weapons) wmap.set(w.id, w);
    for (const it of run.items) {
      if (it.where !== 'bag') continue;
      const dragging = drag && drag.started && drag.id === it.id;
      drawItem(it.key, it.lv, it.rot, BAGX + it.x * CELL, BAGY + it.y * CELL, CELL, dragging ? 0.22 : 1);
      const w = wmap.get(it.id);
      if (w) {
        const sh = S.cellsOf(it.key, it.rot), k = Math.max(0, Math.min(1, w.t / w.cd));
        const top = BAGY + it.y * CELL, bot = top + sh.h * CELL * k;
        for (const [cx, cy] of sh.cells) {   // マスごとに塗る（切り抜きを使わない）
          const X = BAGX + (it.x + cx) * CELL, Y = BAGY + (it.y + cy) * CELL, hh = Math.min(Y + CELL, bot) - Y;
          if (w.cd > 0.35 && hh > 0) { ctx.fillStyle = 'rgba(5,7,12,.5)'; ctx.fillRect(X, Y, CELL, hh); }
          if (w.flash > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = w.flash * (w.cd > 0.35 ? 0.45 : 0.18); ctx.fillStyle = w.d.c; ctx.fillRect(X, Y, CELL, CELL); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
        }
      }
    }
    for (const l of build.links) {   // 隣接効果の印
      const x = BAGX + l.x * CELL, y = BAGY + l.y * CELL, r = 0.1 + 0.015 * Math.sin(time * 4 + l.x + l.y);
      ctx.fillStyle = '#0b0e14'; P([x, y - r - 0.03, x + r + 0.03, y, x, y + r + 0.03, x - r - 0.03, y], 1);
      ctx.fillStyle = l.c; P([x, y - r, x + r, y, x, y + r, x - r, y], 1);
    }
    if (sel && sel.t === 'item' && sel.it.where === 'bag' && !(drag && drag.started)) outline(sel.it, BAGX, BAGY);
  }
  function outline(it, X0, Y0) {
    const sh = S.cellsOf(it.key, it.rot); ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.035; ctx.globalAlpha = 0.6 + 0.3 * Math.sin(time * 6);
    for (const [cx, cy] of sh.cells) ctx.strokeRect(X0 + (it.x + cx) * CELL + 0.02, Y0 + (it.y + cy) * CELL + 0.02, CELL - 0.04, CELL - 0.04);
    ctx.globalAlpha = 1;
  }
  function drawPrep() {
    // 次のウェーブ
    ctx.fillStyle = 'rgba(8,10,16,.55)'; ctx.fillRect(0, FY, 9, 7.2);
    txt('NEXT WAVE', 0.3, 1.32, 0.2, '#7f8aa0');
    const c = window.WAVES[run.wave - 1]; let x = 0.45;
    ORDER.forEach((n, i) => { if (!c[i]) return; const d = EN[n], r = IMG.enemies[n] ? 0.26 / ESC[n] * 1.5 : Math.min(d.r, 0.3) * 0.75; drawEnemy(n, x + 0.1, 1.78, r, d.c); txt('×' + c[i], x + 0.42, 1.8, 0.24, '#dfe6f3'); x += 1.42; });
    txt('SHOP', 0.3, 2.2, 0.2, '#7f8aa0');
    // ショップ
    run.shop.forEach((s, i) => {
      const d = ITEMS[s.key], X = cardX(i), on = sel && sel.t === 'shop' && sel.i === i, can = run.coin >= d.cost;
      ctx.fillStyle = s.sold ? 'rgba(20,24,34,.5)' : '#161c29'; ctx.fillRect(X, CARDY, CARDW, CARDH);
      ctx.strokeStyle = on ? '#fff' : s.sold ? '#222838' : '#34405a'; ctx.lineWidth = on ? 0.04 : 0.025; ctx.strokeRect(X, CARDY, CARDW, CARDH);
      if (s.sold) { txt('SOLD', X + CARDW / 2, CARDY + CARDH / 2, 0.26, '#3d465a', 'center'); return; }
      const sh = S.cellsOf(s.key, 0), cs = shopCs(s.key);
      if (!(drag && drag.started && drag.src === 'shop' && drag.i === i)) drawItem(s.key, 1, 0, X + (CARDW - sh.w * cs) / 2, CARDY + 0.2 + (1.3 - sh.h * cs) / 2, cs, can ? 1 : 0.55);
      txt(d.name, X + CARDW / 2, CARDY + 1.78, d.name.length > 6 ? 0.2 : 0.24, '#dfe6f3', 'center');
      const pc = can ? '#ffe08a' : '#ff6b5e', px = X + CARDW / 2 - 0.22, py = CARDY + 2.2;
      ctx.fillStyle = pc; P([px, py - 0.1, px + 0.1, py, px, py + 0.1, px - 0.1, py], 1); txt(String(d.cost), px + 0.2, py + 0.01, 0.3, pc, 'left', 900);
    });
    // 待機スペース
    txt('待機スペース（ここに置いた物は働かない）', 0.3, BENY - 0.24, 0.2, '#7f8aa0');
    for (let y = 0; y < S.NH; y++) for (let x = 0; x < S.NW; x++) { ctx.fillStyle = 'rgba(20,26,38,.7)'; ctx.fillRect(BENX + x * CELL + 0.03, BENY + y * CELL + 0.03, CELL - 0.06, CELL - 0.06); }
    for (const it of run.items) if (it.where === 'bench') drawItem(it.key, it.lv, it.rot, BENX + it.x * CELL, BENY + it.y * CELL, CELL, drag && drag.started && drag.id === it.id ? 0.22 : 0.85);
    if (sel && sel.t === 'item' && sel.it.where === 'bench' && !(drag && drag.started)) outline(sel.it, BENX, BENY);
  }
  function drawBattle() {
    ctx.save(); ctx.beginPath(); ctx.rect(0, FY, 9, 7.65); ctx.clip();
    for (const e of B.enemies) {
      const a = Math.min(1, (B.t - e.born) * 3), atk = e.atWall ? 1 - e.atkT / e.atkI : 0;
      if (e._a == null) e._a = e.ph;
      if (!e.atWall) e._a += simDt * AFPS[e.type] * (e.slowT > 0 ? 1 - e.slowF : 1);          // 歩いている間だけコマを進める。減速中は遅く
      const lunge = e.atWall ? (atk > 0.82 ? (atk - 0.82) / 0.18 * 0.12 : atk < 0.12 ? (1 - atk / 0.12) * 0.12 : 0) : 0;   // 殴る直前に前へ出て、殴った後に戻る
      ctx.globalAlpha = a; drawEnemy(e.type, e.x, FY + e.y, e.r, e.d.c, { hit: e.hit, hp: e.hp / e.maxHp, slow: e.slowT > 0, ph: e.ph, atk, f: e.atWall ? 1 : e._a, lunge }); ctx.globalAlpha = 1;
    }
    ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (const s of B.shots) {
      const y = FY + s.y, n = 0.34 / s.sp;
      if (s.k === 'b' && IMG.fx.bullet) { ctx.save(); ctx.translate(s.x, y); ctx.rotate(Math.atan2(s.vy, s.vx)); const z = s.sp > 20 ? 1.5 : 0.75; ctx.drawImage(tint('bullet', s.w.d.c), -z + 0.06, -0.085, z, 0.17); ctx.restore(); }
      else if (s.k === 'b') { ctx.strokeStyle = s.w.d.c; ctx.lineWidth = 0.07; L(s.x, y, s.x - s.vx * n, y - s.vy * n); ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.025; L(s.x, y, s.x - s.vx * n * 0.5, y - s.vy * n * 0.5); }
      else { ctx.fillStyle = s.w.d.c; C(s.x, y, 0.11, 1); ctx.strokeStyle = s.w.d.c; ctx.globalAlpha = 0.4; ctx.lineWidth = 0.06; L(s.x, y, s.x - s.vx * 0.06, y - s.vy * 0.06); ctx.globalAlpha = 1; }
    }
    ctx.restore();
    const left = B.queue.length - B.qi + B.enemies.length;
    txt('残り ' + left, 8.75, 1.3, 0.22, '#7f8aa0', 'right');
  }
  function drawBanner() {
    if (!banner) return; const k = banner.t, a = k < 0.2 ? k / 0.2 : k > 1.8 ? (2.2 - k) / 0.4 : 1;
    ctx.globalAlpha = a * 0.85; ctx.fillStyle = '#0b0e14'; ctx.fillRect(0, 4.1, 9, 1.3); ctx.fillStyle = '#ffb347'; ctx.fillRect(0, 4.1, 9, 0.04); ctx.fillRect(0, 5.36, 9, 0.04); ctx.globalAlpha = 1;
    ctx.save(); ctx.globalAlpha = a; txt(banner.a, 4.5, 4.58, 0.5, '#fff', 'center', 900); txt(banner.b, 4.5, 5.08, 0.26, '#ffe08a', 'center'); ctx.restore();
  }

  // ---------- ドラッグ ----------
  function dropInfo() {
    const d = drag, sh = S.cellsOf(d.key, d.rot), lift = d.touch ? 1.0 : 0;
    const tlx = d.px - d.gx, tly = d.py - d.gy - lift, cy = tly + sh.h * CELL / 2;
    let where = null;
    if (cy > BAGY - 0.45) where = 'bag'; else if (cy > BENY - 0.4 && cy < BENY + S.NH * CELL + 0.4) where = 'bench';
    const o = { tlx, tly, where, ok: false, merge: null, gx: 0, gy: 0 };
    if (!where) return o;
    const [X0, Y0] = gridOf(where); o.gx = Math.round((tlx - X0) / CELL); o.gy = Math.round((tly - Y0) / CELL);
    o.ok = S.fits(run, d.key, d.rot, where, o.gx, o.gy, d.id);
    if (!o.ok) {
      const occ = S.occupancy(run, where, d.id), cnt = new Map();
      for (const [cx, cy2] of sh.cells) { const it = occ.get((o.gx + cx) + (o.gy + cy2) * 32); if (it && it.key === d.key && it.lv === d.lv && it.lv < 3) cnt.set(it, (cnt.get(it) || 0) + 1); }
      let bv = 0; for (const [it, n] of cnt) if (n > bv) { bv = n; o.merge = it; }
    }
    return o;
  }
  function drawDrag() {
    if (!drag || !drag.started) return; const o = dropInfo(), sh = S.cellsOf(drag.key, drag.rot);
    if (o.where) {
      const [X0, Y0] = gridOf(o.where);
      if (o.merge) { const m = S.cellsOf(o.merge.key, o.merge.rot); ctx.fillStyle = 'rgba(255,224,138,.35)'; for (const [cx, cy] of m.cells) ctx.fillRect(X0 + (o.merge.x + cx) * CELL, Y0 + (o.merge.y + cy) * CELL, CELL, CELL); }
      else { ctx.fillStyle = o.ok ? 'rgba(123,224,138,.3)' : 'rgba(255,90,77,.28)'; for (const [cx, cy] of sh.cells) ctx.fillRect(X0 + (o.gx + cx) * CELL + 0.03, Y0 + (o.gy + cy) * CELL + 0.03, CELL - 0.06, CELL - 0.06); }
    }
    drawItem(drag.key, drag.lv, drag.rot, o.tlx, o.tly, CELL, 0.92);
    if (o.merge) txt('合成 → Lv' + (drag.lv + 1), o.tlx + sh.w * CELL / 2, o.tly - 0.22, 0.24, '#ffe08a', 'center', 900);
  }
  function pt(e) { return { x: (e.clientX - ox) / u, y: (e.clientY - oy) / u }; }
  function hitAt(x, y) {
    for (const where of ['bag', 'bench']) {
      if (where === 'bench' && mode !== 'prep') continue;
      const [X0, Y0] = gridOf(where), gx = Math.floor((x - X0) / CELL), gy = Math.floor((y - Y0) / CELL);
      if (gx < 0 || gy < 0 || gx >= 16) continue;
      const it = S.occupancy(run, where).get(gx + gy * 32); if (it) return { t: 'item', it };
    }
    if (mode === 'prep' && y >= CARDY && y <= CARDY + CARDH) for (let i = 0; i < 4; i++) if (x >= cardX(i) && x <= cardX(i) + CARDW && !run.shop[i].sold) return { t: 'shop', i };
    return null;
  }
  function rotateDrag() { if (!drag || !drag.started) return; AU.se('rotate'); drag.rot = (drag.rot + 1) & 3; const sh = S.cellsOf(drag.key, drag.rot); drag.gx = sh.w * CELL / 2; drag.gy = sh.h * CELL / 2; }
  cv.addEventListener('pointerdown', e => {
    if (mode !== 'prep' && mode !== 'battle') return;
    if (drag) { if (e.pointerId !== drag.pid) rotateDrag(); return; }
    if (e.button === 2) return;
    const p = pt(e), h = hitAt(p.x, p.y); sel = h; updateInfo(); if (!h || mode !== 'prep') return;
    drag = { pid: e.pointerId, sx: p.x, sy: p.y, px: p.x, py: p.y, started: false, touch: e.pointerType !== 'mouse', src: h.t };
    if (h.t === 'item') { const it = h.it, [X0, Y0] = gridOf(it.where); Object.assign(drag, { id: it.id, key: it.key, lv: it.lv, rot: it.rot, gx: p.x - (X0 + it.x * CELL), gy: p.y - (Y0 + it.y * CELL) }); }
    else { const k = run.shop[h.i].key, sh = S.cellsOf(k, 0); Object.assign(drag, { i: h.i, id: -1, key: k, lv: 1, rot: 0, gx: sh.w * CELL / 2, gy: sh.h * CELL / 2 }); }
    try { cv.setPointerCapture(e.pointerId); } catch (err) { }
  });
  cv.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.pid) return; const p = pt(e); drag.px = p.x; drag.py = p.y;
    if (!drag.started && Math.hypot(p.x - drag.sx, p.y - drag.sy) > 0.18) {
      if (drag.src === 'shop' && run.coin < ITEMS[drag.key].cost) { toast('コインが足りない'); drag = null; return; }
      drag.started = true; AU.se('pick');
    }
  });
  function endDrag(e) {
    if (!drag || e.pointerId !== drag.pid) return; const d = drag;
    if (d.started && e.type === 'pointerup') {
      const o = dropInfo(); let done = false;
      if (o.ok) done = d.src === 'item' ? S.move(run, d.id, o.where, o.gx, o.gy, d.rot) : !!S.buy(run, d.i, o.where, o.gx, o.gy, d.rot);
      else if (o.merge) { done = d.src === 'item' ? S.merge(run, d.id, o.merge.id) : S.buyMerge(run, d.i, o.merge.id); if (done) { const [X0, Y0] = gridOf(o.merge.where); spark(X0 + (o.merge.x + 0.5) * CELL, Y0 + (o.merge.y + 0.5) * CELL, 22, '#ffe08a', 3, 0.5, 0.045); sel = { t: 'item', it: o.merge }; } }
      if (done && d.src === 'shop' && !o.merge) sel = { t: 'item', it: run.items[run.items.length - 1] };
      AU.se(!done ? 'bad' : o.merge && !o.ok ? 'merge' : d.src === 'shop' ? 'buy' : 'place');
      if (done) changed();
    }
    drag = null; updateInfo();
  }
  cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);
  cv.addEventListener('contextmenu', e => { e.preventDefault(); rotateDrag(); });
  cv.addEventListener('wheel', e => { if (drag && drag.started) { e.preventDefault(); rotateDrag(); } }, { passive: false });
  addEventListener('keydown', e => { if (e.key === 'r' || e.key === 'R') { if (drag && drag.started) rotateDrag(); else rotateSel(); } else if (e.key === 'Escape') togglePause(); });

  // ---------- 操作 ----------
  function changed() { build = S.computeBuild(run); if (sel && sel.t === 'item' && run.items.indexOf(sel.it) < 0) sel = null; updateInfo(); updateBar(); }
  function rotateSel() {
    if (!sel || sel.t !== 'item' || mode !== 'prep') return; const it = sel.it, nr = (it.rot + 1) & 3, a = S.cellsOf(it.key, it.rot), b = S.cellsOf(it.key, nr);
    const bx = it.x + Math.round((a.w - b.w) / 2), by = it.y + Math.round((a.h - b.h) / 2);
    for (const o of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1], [2, 0], [-2, 0], [0, 2], [0, -2]]) if (S.move(run, it.id, it.where, bx + o[0], by + o[1], nr)) { AU.se('rotate'); changed(); return; }
    const p = S.firstFit(run, it.key, nr, 'bench', it.id);
    if (p && S.move(run, it.id, 'bench', p.x, p.y, nr)) { toast('入らないので待機スペースへ移した'); changed(); return; }
    AU.se('bad'); toast('回転できる場所がない');
  }
  function descOf(key, lv) {
    const d = ITEMS[key], s = S.LV_S[lv - 1];
    return d.desc.replace('{v}', Math.round(d.v * s * 100)).replace('{r}', (d.v * s).toFixed(1)).replace('{p}', Math.round(d.v * s)).replace('{l}', lv).replace('{c}', S.PURSE[lv - 1]);
  }
  function updateInfo() {
    const n = $('iName'), ds = $('iDesc'), rot = $('bRot'), sl = $('bSell'), by = $('bBuy'); rot.style.display = sl.style.display = by.style.display = 'none';
    if (!sel) { n.textContent = mode === 'battle' ? '戦闘中' : 'アイテムを選ぶ'; ds.textContent = mode === 'battle' ? 'バッグの配置は次の準備まで変えられない。' : (TOUCH ? 'ドラッグで移動。ドラッグ中に別の指でタップすると回転。' : 'ドラッグで移動。ドラッグ中に R キーか右クリックで回転。'); return; }
    const key = sel.t === 'item' ? sel.it.key : run.shop[sel.i].key, lv = sel.t === 'item' ? sel.it.lv : 1, d = ITEMS[key];
    n.innerHTML = d.name + '<small>Lv' + lv + (d.kind === 'w' ? ' 武器' : ' 補助') + '</small>';
    let s = descOf(key, lv);
    if (d.kind === 'w') {
      const w = sel.t === 'item' && build ? build.weapons.find(x => x.id === sel.it.id) : null;
      const dmg = w ? w.dmg : d.dmg * S.LV_W[lv - 1], cd = w ? w.cd : d.cd;
      s = '<em>威力 ' + (+dmg.toFixed(1)) + ' / 間隔 ' + cd.toFixed(2) + '秒' + (w && w.crit ? ' / 会心 ' + Math.round(w.crit * 100) + '%' : '') + (w && w.slow ? ' / 減速 ' + Math.round(w.slow * 100) + '%' : '') + '</em>　' + s;
    }
    ds.innerHTML = s;
    if (mode !== 'prep') return;
    if (sel.t === 'item') { rot.style.display = ''; sl.style.display = ''; sl.innerHTML = '売却<i>◆' + S.sellValue(sel.it) + '</i>'; }
    else { by.style.display = ''; by.innerHTML = '購入<i>◆' + d.cost + '</i>'; by.disabled = run.coin < d.cost; }
  }
  function updateBar() {
    const prep = mode === 'prep'; $('bReroll').style.display = $('bExpand').style.display = $('bGo').style.display = prep ? '' : 'none'; $('bSpeed').style.display = mode === 'battle' ? '' : 'none';
    $('bar').style.display = $('info').style.display = $('bPause').style.display = (prep || mode === 'battle') ? '' : 'none';
    if (!run) return;
    $('bReroll').innerHTML = '入替<i>◆' + S.rerollCost(run) + '</i>'; $('bReroll').disabled = run.coin < S.rerollCost(run);
    const ec = S.expandCost(run); $('bExpand').innerHTML = ec == null ? 'バッグ最大' : '拡張<i>◆' + ec + '</i>'; $('bExpand').disabled = ec == null || run.coin < ec;
    $('bSpeed').textContent = '速度 ×' + speed;
  }
  $('bRot').onclick = rotateSel;
  $('bSell').onclick = () => { if (sel && sel.t === 'item' && mode === 'prep') { if (run.items.filter(i => i.where === 'bag').length <= 1 && sel.it.where === 'bag') { toast('最後の1つは売れない'); return; } S.sell(run, sel.it.id); AU.se('sell'); sel = null; changed(); } };
  $('bBuy').onclick = () => {
    if (!sel || sel.t !== 'shop') return; const k = run.shop[sel.i].key, p = S.firstFit(run, k, 0, 'bench');
    if (!p) { toast('待機スペースがいっぱい'); return; }
    const it = S.buy(run, sel.i, 'bench', p.x, p.y, 0); if (it) { AU.se('buy'); sel = { t: 'item', it }; changed(); }
  };
  $('bReroll').onclick = () => { if (S.reroll(run)) { AU.se('reroll'); if (sel && sel.t === 'shop') sel = null; changed(); } };
  $('bExpand').onclick = () => { if (S.expand(run)) { AU.se('expand'); changed(); } };
  $('bGo').onclick = go;
  $('bSpeed').onclick = () => { speed = speed % 3 + 1; AU.se('click'); updateBar(); };
  $('bPause').onclick = togglePause;

  function start() { AU.init(); AU.se('click'); AU.music('prep'); run = S.newRun((Date.now() ^ (Math.random() * 1e9)) >>> 0); B = null; mode = 'prep'; paused = false; sel = null; drag = null; parts.length = fxs.length = sps.length = 0; banner = null; menu(null); changed(); }
  function toTitle() { AU.se('click'); AU.music('title'); run = null; B = null; build = null; mode = 'title'; paused = false; sel = null; drag = null; parts.length = fxs.length = sps.length = 0; banner = null; updateBar(); menu('title'); }
  function go() {
    if (mode !== 'prep') return;
    if (run.items.some(i => i.where === 'bench')) toast('待機スペースの物は戦闘に参加しない');
    AU.se('go'); AU.music('battle', run.wave >= S.LAST ? 2 : run.wave >= 4 ? 1 : 0);
    drag = null; sel = null; B = S.newBattle(run); mode = 'battle'; updateInfo(); updateBar();
  }
  function endBattle() {
    const wave = run.wave, reward = S.finishWave(run, B);
    if (run.over) { best(wave - 1); mode = 'over'; AU.music('title'); AU.se('over'); menu('over'); }
    else if (run.won) { best(S.LAST); mode = 'win'; AU.music('title'); AU.se('win'); menu('win'); }
    else {
      AU.music('prep'); AU.se('clear');
      banner = { t: 0, a: 'WAVE ' + wave + ' CLEAR', b: '報酬 ◆' + reward + '　防壁 +' + S.T.healOnClear }; mode = 'clear'; clearT = 0;
      todo = [() => best(wave), () => { build = S.computeBuild(run); }].concat(run.shop.map(sp0 => () => itemCanvas(sp0.key, 1, 0, shopCs(sp0.key))));
      return;
    }
    updateBar();
  }
  let clearT = 0, todo = [];
  function clearTick(dt) {   // 戦場を映したまま、1コマに1つだけ用意を進め、終わったら準備画面へ
    clearT += dt; if (todo.length) { todo.shift()(); return; }
    if (clearT > 0.9) { mode = 'prep'; changed(); }
  }
  function togglePause() { if (mode !== 'prep' && mode !== 'battle') return; paused = !paused; AU.se('click'); menu(paused ? 'pause' : null); }
  function menu(kind) {
    const m = $('menu'), p = $('panel'); if (!kind) { m.classList.add('off'); return; } m.classList.remove('off'); m.classList.toggle('title', kind === 'title');
    const volH = '<div class="vol"><label>BGM<input type="range" id="vB" min="0" max="100" step="5"></label><label>SE<input type="range" id="vS" min="0" max="100" step="5"></label></div>';
    const b = best(), rec = b ? '<p>これまでの最高：ウェーブ <b>' + b + '</b> 突破</p>' : '';
    if (kind === 'title') p.innerHTML = '<h1>背嚢戦線<span>PACK FRONT</span></h1><p>バッグに詰めた物だけが戦う。<br>詰め方を考えて、' + S.LAST + '波の襲撃から防壁を守れ。</p>' +
      '<div class="how"><ol><li>ショップの品を<b>ドラッグしてバッグへ</b>入れると購入。</li><li><b>補助</b>は<b>隣の武器</b>を強化する（◆印が付く）。</li><li>同じ物を<b>重ねると合成</b>してLvが上がる（Lv3まで）。</li><li>回転は' + (TOUCH ? 'ドラッグ中に<b>別の指でタップ</b>' : 'ドラッグ中に<b>Rキーか右クリック</b>') + '。</li><li><b>出撃</b>を押すと戦闘は自動で進む。</li></ol></div>' + rec + volH + '<button class="pri" id="mStart">はじめる</button>';
    else if (kind === 'pause') p.innerHTML = '<h2>中断中</h2>' + volH + '<button class="pri" id="mResume">つづける</button><button id="mStart">最初から</button><button id="mTitle">タイトルに戻る</button><p>「最初から」と「タイトルに戻る」は、今の進行が消える。</p>';
    else if (kind === 'over') p.innerHTML = '<h2>防壁、陥落</h2><p>到達ウェーブ</p><div class="big">' + run.wave + ' / ' + S.LAST + '</div>' + rec + '<button class="pri" id="mStart">もう一度</button><button id="mTitle">タイトルに戻る</button>';
    else p.innerHTML = '<h2>防衛成功</h2><p>全 ' + S.LAST + ' 波を退けた。<br>残った防壁の耐久</p><div class="big">' + Math.ceil(run.hp) + '</div><button class="pri" id="mStart">もう一度</button><button id="mTitle">タイトルに戻る</button>';
    const s = $('mStart'); if (s) s.onclick = start; const r = $('mResume'); if (r) r.onclick = togglePause; const tt = $('mTitle'); if (tt) tt.onclick = toTitle;
    const vB = $('vB'), vS = $('vS');
    if (vB) { vB.value = Math.round(AU.vol.bgm * 100); vB.oninput = () => AU.setVol('bgm', vB.value / 100); vS.value = Math.round(AU.vol.se * 100); vS.oninput = () => { AU.setVol('se', vS.value / 100); AU.se('click'); }; }
  }

  const PERF = { maxJs: 0, t: 0, n: 0, all: 0, sim: 0, field: 0, bag: 0, fx: 0, worst: 0, last: null };
  const warmTxt = [['WAVE NEXT SHOP SOLD CLEAR 0123456789 / ×', 0.2, 700], ['0123456789 / ×', 0.24, 700], ['0123456789 /', 0.36, 900], ['0123456789', 0.3, 900], ['0123456789', 0.38, 900], ['WAVE CLEAR 0123456789', 0.5, 900],
    ['待機スペース（ここに置いた物は働かない）残り', 0.2, 700], ['防壁 0123456789 /', 0.2, 700], ['残り 0123456789', 0.22, 700], ['報酬 ◆ 防壁 + 0123456789', 0.26, 700], ['合成 → Lv 23', 0.24, 900]];
  for (const k in ITEMS) warmTxt.push([ITEMS[k].name, ITEMS[k].name.length > 6 ? 0.2 : 0.24, 700]);
  // ---------- 毎フレーム ----------
  function frame(now) {
    const t0 = performance.now(), dt = Math.min(0.05, (now - last) / 1000 || 0); last = now; time += dt;
    simDt = mode === 'battle' && !paused ? dt * speed : 0;
    if (mode === 'battle' && !paused) {
      let acc = dt * speed;
      while (acc > 1e-6 && !B.done) { const h = Math.min(acc, 1 / 60); S.step(B, h); acc -= h; consume(B.ev); B.ev.length = 0; }
      if (B.done) endBattle();
    }
    if (mode === 'clear') clearTick(dt);
    if (!paused) updateFx(dt);
    // 動きの少ない画面は描く回数を減らす（端末の発熱と電池を抑える）。戦闘中とドラッグ中だけ毎コマ描く
    const busy = (mode === 'battle' && !paused) || (drag && drag.started) || banner || parts.length || sps.length;
    const gap = busy ? 0 : (mode === 'prep' && !paused) ? 48 : 240;
    if (now - lastDraw < gap) { requestAnimationFrame(frame); return; }
    lastDraw = now;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (let i = 0; i < 3 && warm.length; i++) { try { ctx.drawImage(warm.shift(), 0, 0, 2, 2); } catch (e) { } }   // 直後の塗りつぶしで隠れる
    if (!warm.length) for (let i = 0; i < 4 && warmTxt.length; i++) { const w = warmTxt.shift(); txt(w[0], 0.1, 0.5, w[1], '#000', 'left', w[2]); }   // 文字も同じく先に一度描く（日本語の字形の用意が初回だけ重い）
    ctx.fillStyle = '#0b0e14'; ctx.fillRect(0, 0, cv.width, cv.height);
    setU(); ctx.fillStyle = '#0e121b'; ctx.fillRect(0, 0, 9, 16);
    drawField();
    const t1 = performance.now();
    if (run) {
      if (mode === 'battle' || mode === 'clear' || mode === 'over' || mode === 'win') drawBattle(); else if (mode === 'prep') drawPrep();
      const t2 = performance.now(); drawWall(); drawBag(); drawHud(); const t3 = performance.now(); drawFx(); const t4 = performance.now(); drawDrag(); drawBanner();
      PERF.field += t2 - t1; PERF.bag += t3 - t2; PERF.fx += t4 - t3;
    } else drawWall();
    PERF.sim += t1 - t0 - 0; { const ft = performance.now() - t0; PERF.all += ft; if (ft > PERF.maxJs) PERF.maxJs = ft; } PERF.n++; PERF.worst = Math.max(PERF.worst, dt * 1000);
    if (now - PERF.t > 1000) {
      const n = PERF.n || 1; PERF.last = { fps: Math.round(n * 1000 / (now - PERF.t)), all: +(PERF.all / n).toFixed(2), simBg: +(PERF.sim / n).toFixed(2), field: +(PERF.field / n).toFixed(2), bag: +(PERF.bag / n).toFixed(2), fx: +(PERF.fx / n).toFixed(2), worstGap: Math.round(PERF.worst), enemies: B ? B.enemies.length : 0, shots: B ? B.shots.length : 0, sprites: sps.length, parts: parts.length, tints: Object.keys(tints).length };
      if (DEBUG) { const L = PERF.last; $('perf').textContent = L.fps + 'fps  1コマ' + L.all + 'ms（計算と背景' + L.simBg + ' 敵と弾' + L.field + ' バッグ' + L.bag + ' 演出' + L.fx + '）最長' + L.worstGap + 'ms  敵' + L.enemies + ' 弾' + L.shots + ' 演出' + L.sprites + ' 粒' + L.parts; }
      PERF.t = now; PERF.n = PERF.all = PERF.sim = PERF.field = PERF.bag = PERF.fx = PERF.worst = 0;
    }
    requestAnimationFrame(frame);
  }

  // ---------- 確認用 ----------
  if (DEBUG) {
    const d = $('dbg'); d.style.display = 'flex';
    const add = (t, f) => { const b = document.createElement('button'); b.textContent = t; b.onclick = () => { f(); if (mode === 'prep') changed(); }; d.appendChild(b); };
    const pf = document.createElement('div'); pf.id = 'perf'; pf.style.cssText = 'width:100%;font-size:calc(var(--u)*.19);color:#9fe;background:rgba(0,0,0,.6);padding:2px 4px;pointer-events:none'; d.appendChild(pf);
    add('コイン+20', () => { run.coin += 20; });
    add('この波に勝つ', () => { if (B && mode === 'battle') { B.enemies = []; B.qi = B.queue.length; } });
    add('防壁全快', () => { run.hp = 999; if (B) B.hp = B.maxHp; });
    add('次の波へ', () => { if (mode === 'prep' && run.wave < S.LAST) { run.wave++; S.rollShop(run); } });
    add('最終波へ', () => { if (mode === 'prep') { run.wave = S.LAST; S.rollShop(run); } });
  }
  window.PACK = {
    S, start, go, changed, get perf() { return PERF.last; }, get maxJs() { const v = PERF.maxJs; PERF.maxJs = 0; return +v.toFixed(2); }, get run() { return run; }, get B() { return B; }, get mode() { return mode; },
    set speed(v) { speed = v; }, step(n) { for (let i = 0; i < n && B && !B.done; i++) { S.step(B, 1 / 60); B.ev.length = 0; } },
    cell(where, x, y) { const g = gridOf(where); return { x: ox + (g[0] + (x + 0.5) * CELL) * u, y: oy + (g[1] + (y + 0.5) * CELL) * u }; },
    card(i) { return { x: ox + (cardX(i) + CARDW / 2) * u, y: oy + (CARDY + 0.85) * u }; }
  };

  setTimeout(() => {   // ルールの計算を一度空回しして、最初の戦闘の出だしを軽くする
    try { const r = S.newRun(7); r.exp = 6; r.wave = 6; Object.keys(ITEMS).forEach((k, i) => { const q = S.firstFit(r, k, i % 2, 'bag'); if (q) S.addItem(r, k, 1, 'bag', q.x, q.y, i % 2); }); const b = S.newBattle(r); for (let i = 0; i < 900 && !b.done; i++) { S.step(b, 1 / 60); b.ev.length = 0; } } catch (e) { }
  }, 400);
  addEventListener('resize', () => { resize(); lastDraw = -1e9; }); resize(); updateBar(); menu('title'); requestAnimationFrame(frame);
})();
