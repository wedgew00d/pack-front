// ルール本体。画面に依存しない。ゲーム（main.js）と自動対戦（test/bot.js）の両方がこれを読む。
(function (G) {
  'use strict';
  const ITEMS = G.ITEMS, EN = G.ENEMIES, WAVES = G.WAVES, ORDER = G.ENEMY_ORDER;
  const BW = 7, BH = 6, NW = 10, NH = 3, LINE = 7.2, FW = 9, LAST = WAVES.length;
  const EXP = [[4, 3], [5, 3], [5, 4], [6, 4], [6, 5], [7, 5], [7, 6]];
  const EXP_COST = [4, 5, 6, 8, 10, 12];
  const LV_W = [1, 1.8, 3.2], LV_S = [1, 1.6, 2.4], PURSE = [2, 3, 5];
  const T = {   // 調整値
    startCoin: 8, baseHp: 100, waveCoin: 6, waveCoinPer: 1, healOnClear: 15,
    hpA: 0.2, hpB: 0.03, atkInt: 1.7, atkWind: 1.0, critMul: 2.5, bulletSpd: 14
  };

  function mkRng(seed) {
    let s = (seed >>> 0) || 1;
    return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }

  // ---------- 形 ----------
  const cache = {};
  function cellsOf(key, rot) {
    rot &= 3; const k = key + rot; if (cache[k]) return cache[k];
    const sh = ITEMS[key].shape; let c = [], h = sh.length, w = sh[0].length;
    sh.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] === '#') c.push([x, y]); });
    for (let i = 0; i < rot; i++) { c = c.map(([x, y]) => [h - 1 - y, x]); const t = w; w = h; h = t; }
    return (cache[k] = { cells: c, w, h });
  }

  // ---------- ラン（1プレイ）の状態 ----------
  function newRun(seed) {
    const r = { rnd: mkRng(seed), wave: 1, coin: T.startCoin, hp: T.baseHp, exp: 0, items: [], shop: [], nid: 1, won: false, over: false, rerolls: 0 };
    addItem(r, 'pistol', 1, 'bag', 2, 2, 0);
    rollShop(r);
    return r;
  }
  function addItem(r, key, lv, where, x, y, rot) {
    const it = { id: r.nid++, key, lv, where, x, y, rot }; r.items.push(it); return it;
  }
  function active(r, x, y) {
    const e = EXP[r.exp], ox = (BW - e[0]) >> 1, oy = (BH - e[1]) >> 1;
    return x >= ox && x < ox + e[0] && y >= oy && y < oy + e[1];
  }
  function occupancy(r, where, ignoreId) {
    const m = new Map();
    for (const it of r.items) {
      if (it.where !== where || it.id === ignoreId) continue;
      for (const [cx, cy] of cellsOf(it.key, it.rot).cells) m.set((it.x + cx) + (it.y + cy) * 32, it);
    }
    return m;
  }
  function fits(r, key, rot, where, x, y, ignoreId, occ) {
    occ = occ || occupancy(r, where, ignoreId);
    for (const [cx, cy] of cellsOf(key, rot).cells) {
      const X = x + cx, Y = y + cy;
      if (where === 'bag') { if (!active(r, X, Y)) return false; }
      else if (X < 0 || Y < 0 || X >= NW || Y >= NH) return false;
      if (occ.has(X + Y * 32)) return false;
    }
    return true;
  }
  function firstFit(r, key, rot, where, ignoreId) {
    const occ = occupancy(r, where, ignoreId), w = where === 'bag' ? BW : NW, h = where === 'bag' ? BH : NH;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (fits(r, key, rot, where, x, y, ignoreId, occ)) return { x, y };
    return null;
  }
  function byId(r, id) { return r.items.find(i => i.id === id); }
  function move(r, id, where, x, y, rot) {
    const it = byId(r, id); if (!it || !fits(r, it.key, rot, where, x, y, id)) return false;
    it.where = where; it.x = x; it.y = y; it.rot = rot; return true;
  }
  function canMerge(a, b) { return a && b && a.id !== b.id && a.key === b.key && a.lv === b.lv && a.lv < 3; }
  function merge(r, srcId, dstId) {
    const a = byId(r, srcId), b = byId(r, dstId); if (!canMerge(a, b)) return false;
    b.lv++; r.items.splice(r.items.indexOf(a), 1); return true;
  }
  function sellValue(it) { return Math.max(1, Math.floor(ITEMS[it.key].cost * Math.pow(2, it.lv - 1) / 2)); }
  function sell(r, id) {
    const it = byId(r, id); if (!it) return false;
    r.coin += sellValue(it); r.items.splice(r.items.indexOf(it), 1); return true;
  }

  // ---------- ショップ ----------
  function tierFor(w) { return w <= 1 ? 1 : w === 2 ? 2 : 3; }
  function rollShop(r) {
    const pool = [], t = tierFor(r.wave); let sum = 0;
    for (const k in ITEMS) { const d = ITEMS[k]; if (d.tier <= t) { const wg = d.kind === 'w' ? 3 : 2; pool.push([k, wg]); sum += wg; } }
    r.shop = [];
    for (let i = 0; i < 4; i++) {
      let v = r.rnd() * sum, key = pool[0][0];
      for (const p of pool) { v -= p[1]; if (v <= 0) { key = p[0]; break; } }
      r.shop.push({ key, sold: false });
    }
  }
  function buy(r, i, where, x, y, rot) {
    const s = r.shop[i]; if (!s || s.sold) return null; const d = ITEMS[s.key];
    if (r.coin < d.cost || !fits(r, s.key, rot, where, x, y)) return null;
    r.coin -= d.cost; s.sold = true; return addItem(r, s.key, 1, where, x, y, rot);
  }
  function buyMerge(r, i, dstId) {
    const s = r.shop[i], b = byId(r, dstId); if (!s || s.sold || !b) return false;
    if (b.key !== s.key || b.lv !== 1 || r.coin < ITEMS[s.key].cost) return false;
    r.coin -= ITEMS[s.key].cost; s.sold = true; b.lv = 2; return true;
  }
  function rerollCost() { return 1; }
  function reroll(r) { if (r.coin < rerollCost()) return false; r.coin -= rerollCost(); r.rerolls++; rollShop(r); return true; }
  function expandCost(r) { return r.exp < EXP_COST.length ? EXP_COST[r.exp] : null; }
  function expand(r) { const c = expandCost(r); if (c == null || r.coin < c) return false; r.coin -= c; r.exp++; return true; }

  // ---------- バッグの中身 → 戦闘用の数値 ----------
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  function computeBuild(r) {
    const occ = occupancy(r, 'bag'), mods = new Map(), links = [];
    const out = { weapons: [], maxHp: T.baseHp, regen: 0, armor: 0, coin: 0, links, mods };
    const mod = id => { let m = mods.get(id); if (!m) mods.set(id, m = { rate: 0, dmg: 0, crit: 0, slow: 0 }); return m; };
    for (const it of r.items) {
      if (it.where !== 'bag') continue; const d = ITEMS[it.key]; if (d.kind !== 's') continue;
      const s = LV_S[it.lv - 1];
      if (d.glob === 'regen') out.regen += d.v * s;
      else if (d.glob === 'plate') { out.maxHp += Math.round(d.v * s); out.armor += it.lv; }
      else if (d.glob === 'coin') out.coin += PURSE[it.lv - 1];
      if (!d.adj) continue;
      const seen = new Set();
      for (const [cx, cy] of cellsOf(it.key, it.rot).cells) for (const [dx, dy] of DIRS) {
        const X = it.x + cx, Y = it.y + cy, n = occ.get((X + dx) + (Y + dy) * 32);
        if (!n || n.id === it.id || seen.has(n.id) || ITEMS[n.key].kind !== 'w') continue;
        seen.add(n.id); const m = mod(n.id), v = d.v * s;
        if (d.adj === 'slow') m.slow = Math.min(0.7, Math.max(m.slow, v)); else m[d.adj] += v;
        links.push({ x: X + 0.5 + dx * 0.5, y: Y + 0.5 + dy * 0.5, c: d.c, from: it.id, to: n.id });
      }
    }
    for (const it of r.items) {
      if (it.where !== 'bag') continue; const d = ITEMS[it.key]; if (d.kind !== 'w') continue;
      const m = mods.get(it.id) || { rate: 0, dmg: 0, crit: 0, slow: 0 }, sh = cellsOf(it.key, it.rot);
      let cx = 0; for (const c of sh.cells) cx += it.x + c[0] + 0.5; cx /= sh.cells.length;
      out.weapons.push({ id: it.id, key: it.key, lv: it.lv, d, dmg: d.dmg * LV_W[it.lv - 1] * (1 + m.dmg), cd: d.cd / (1 + m.rate),
        crit: Math.min(1, m.crit), slow: m.slow, ox: 0.9 + (cx / BW) * 7.2 });
    }
    return out;
  }

  // ---------- ウェーブ ----------
  function hpMul(w) { return 1 + T.hpA * (w - 1) + T.hpB * (w - 1) * (w - 1); }
  function waveSpawns(w, rnd) {
    const c = WAVES[w - 1], D = 13 + w * 1.5, q = [];
    ORDER.forEach((n, i) => {
      for (let k = 0; k < c[i]; k++) {
        const t = n === 'boss' ? 3 : n === 'brute' ? D * (0.3 + 0.7 * rnd()) : D * rnd();
        q.push({ t, type: n, x: n === 'boss' ? FW / 2 : 0.7 + rnd() * (FW - 1.4) });
      }
    });
    q.sort((a, b) => a.t - b.t); return q;
  }
  function spawn(B, type, x, y) {
    const d = EN[type], hp = d.hp * hpMul(B.wave);
    B.enemies.push({ type, d, x, y: y == null ? -0.6 : y, x0: x, hp, maxHp: hp, r: d.r, slowT: 0, slowF: 0, atkT: T.atkWind, atkI: d.atk || T.atkInt, atWall: false, ph: B.rnd() * 6.28, hit: 0, born: B.t });
  }
  function newBattle(r) {
    const b = computeBuild(r), rnd = r.rnd;
    return { t: 0, wave: r.wave, rnd, build: b, enemies: [], shots: [], ev: [], queue: waveSpawns(r.wave, rnd), qi: 0,
      weapons: b.weapons.map(w => Object.assign({}, w, { t: w.cd * (0.2 + 0.8 * rnd()), flash: 0 })),
      maxHp: b.maxHp, hp: Math.min(r.hp, b.maxHp), regen: b.regen, armor: b.armor, kills: 0, total: 0, done: false, win: false, bossT: 0, wallHit: 0 };
  }

  function damage(B, e, dmg, w, ignoreArmor) {
    if (e.hp <= 0) return;
    const crit = w.crit > 0 && B.rnd() < w.crit; let d = dmg * (crit ? T.critMul : 1);
    if (!ignoreArmor && e.d.armor) d = Math.max(d - e.d.armor, d * 0.15);
    e.hp -= d; e.hit = 1;
    if (w.slow) { e.slowT = 1.5; e.slowF = Math.max(e.slowF, w.slow); }
    B.ev.push({ k: 'hit', x: e.x, y: e.y, c: w.d.c, crit });
  }
  function pick(B, mode, ox, range) {
    let best = null, bv = -1e9;
    for (const e of B.enemies) {
      if (e.hp <= 0 || e.y < -0.3) continue;
      if (range && Math.hypot(e.x - ox, e.y - LINE) > range + e.r) continue;
      const v = mode === 'strong' ? e.hp + e.y * 0.01 : e.y;
      if (v > bv) { bv = v; best = e; }
    }
    return best;
  }
  function fire(B, w) {
    const d = w.d, ox = w.ox, oy = LINE;
    if (d.fire === 'bullet') {
      const e = pick(B, d.target || 'near', ox); if (!e) return false;
      const sp = d.spd || T.bulletSpd, a = Math.atan2(e.y - oy, e.x - ox) + (d.spread ? (B.rnd() - 0.5) * 2 * d.spread : 0);
      B.shots.push({ k: 'b', x: ox, y: oy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, sp, w, dmg: w.dmg, pierce: d.pierce || 0, life: 1.4, hits: [] });
    } else if (d.fire === 'pellets') {
      const e = pick(B, 'near', ox, d.range); if (!e) return false;
      const base = Math.atan2(e.y - oy, e.x - ox), sp = T.bulletSpd;
      for (let i = 0; i < d.n; i++) {
        const a = base + (i / (d.n - 1) - 0.5) * 0.6 + (B.rnd() - 0.5) * 0.06;
        B.shots.push({ k: 'b', x: ox, y: oy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, sp, w, dmg: w.dmg, pierce: 0, life: (d.range + 0.5) / sp, hits: [] });
      }
    } else if (d.fire === 'shell') {
      const e = pick(B, 'near', ox); if (!e) return false;
      const dist = Math.hypot(e.x - ox, e.y - oy), sp = 8;
      B.shots.push({ k: 's', x: ox, y: oy, vx: (e.x - ox) / dist * sp, vy: (e.y - oy) / dist * sp, sp, w, dmg: w.dmg, life: dist / sp });
    } else if (d.fire === 'flame') {
      const e = pick(B, 'near', ox, d.range); if (!e) return false;
      const a = Math.atan2(e.y - oy, e.x - ox);
      for (const t of B.enemies) {
        if (t.hp <= 0) continue; const dist = Math.hypot(t.x - ox, t.y - oy); if (dist > d.range + t.r) continue;
        let da = Math.abs(Math.atan2(t.y - oy, t.x - ox) - a); if (da > Math.PI) da = 6.2832 - da;
        if (da < 0.45 || dist < 0.8) damage(B, t, w.dmg, w, true);
      }
      B.ev.push({ k: 'flame', x: ox, y: oy, a, range: d.range });
    } else if (d.fire === 'melee') {
      const c = []; for (const t of B.enemies) if (t.hp > 0 && t.y > LINE - 1.5 - t.r && Math.abs(t.x - ox) < 2.2 + t.r) c.push(t);
      if (!c.length) return false; c.sort((a, b) => b.y - a.y);
      for (let i = 0; i < Math.min(c.length, 1 + w.lv); i++) damage(B, c[i], w.dmg, w, false);
      B.ev.push({ k: 'slash', x: c[0].x, y: c[0].y, c: d.c });
    } else if (d.fire === 'chain') {
      let e = pick(B, 'near', ox); if (!e) return false;
      const pts = [[ox, oy]], done = new Set(); let dm = w.dmg;
      for (let i = 0; i < d.chain + w.lv && e; i++) {
        pts.push([e.x, e.y]); done.add(e); damage(B, e, dm, w, true); dm *= 0.8;
        let nx = null, nd = 2.4; for (const t of B.enemies) { if (t.hp <= 0 || done.has(t) || t.y < -0.3) continue; const dd = Math.hypot(t.x - e.x, t.y - e.y); if (dd < nd) { nd = dd; nx = t; } }
        e = nx;
      }
      B.ev.push({ k: 'bolt', pts, c: d.c });
    }
    B.ev.push({ k: 'fire', id: w.id, key: w.key, x: ox, c: d.c, f: d.fire, q: w.cd < 0.3 });
    return true;
  }

  function step(B, dt) {
    if (B.done) return;
    B.t += dt;
    while (B.qi < B.queue.length && B.queue[B.qi].t <= B.t) { const q = B.queue[B.qi++]; spawn(B, q.type, q.x); }
    if (B.regen && B.hp > 0) B.hp = Math.min(B.maxHp, B.hp + B.regen * dt);
    B.wallHit = Math.max(0, B.wallHit - dt * 3);

    for (const e of B.enemies) {
      if (e.hp <= 0) continue;
      e.hit = Math.max(0, e.hit - dt * 6);
      let sp = e.d.spd; if (e.slowT > 0) { e.slowT -= dt; sp *= 1 - e.slowF; if (e.slowT <= 0) e.slowF = 0; }
      if (e.y < LINE - e.r) {
        e.y = Math.min(LINE - e.r, e.y + sp * dt);
        if (e.type === 'flyer') e.x = Math.max(0.4, Math.min(FW - 0.4, e.x0 + Math.sin(B.t * 2.2 + e.ph) * 1.1));
      } else {
        e.atWall = true; e.atkT -= dt;
        if (e.atkT <= 0) { e.atkT = e.atkI; B.hp -= Math.max(1, e.d.dmg - B.armor); B.wallHit = 1; B.ev.push({ k: 'wall', x: e.x }); }
      }
      if (e.type === 'boss') { B.bossT += dt; if (B.bossT > 4.5) { B.bossT = 0; spawn(B, 'walker', e.x - 1.3, e.y); spawn(B, 'runner', e.x + 1.3, e.y); } }
    }

    for (const w of B.weapons) {
      w.flash = Math.max(0, w.flash - dt * 5);
      w.t -= dt;
      if (w.t <= 0) { if (fire(B, w)) { w.t += w.cd; if (w.t < -w.cd) w.t = 0; w.flash = 1; } else w.t = 0; }
    }

    for (const s of B.shots) {
      const n = Math.max(1, Math.ceil(s.sp * dt / 0.2)), h = dt / n;
      for (let i = 0; i < n && s.life > 0; i++) {
        s.x += s.vx * h; s.y += s.vy * h; s.life -= h;
        if (s.k === 'b') {
          for (const e of B.enemies) {
            if (e.hp <= 0 || s.hits.indexOf(e) >= 0) continue;
            if (Math.hypot(e.x - s.x, e.y - s.y) < e.r + 0.1) { damage(B, e, s.dmg, s.w, false); s.hits.push(e); if (s.pierce-- <= 0) { s.life = 0; break; } }
          }
          if (s.y < -1 || s.x < -1 || s.x > FW + 1) s.life = 0;
        } else if (s.life <= 0) {
          const R = s.w.d.aoe;
          for (const e of B.enemies) if (e.hp > 0 && Math.hypot(e.x - s.x, e.y - s.y) < R + e.r) damage(B, e, s.dmg, s.w, false);
          B.ev.push({ k: 'boom', x: s.x, y: s.y, r: R, c: s.w.d.c });
        }
      }
    }
    B.shots = B.shots.filter(s => s.life > 0);

    let alive = 0;
    for (const e of B.enemies) { if (e.hp <= 0) { B.kills++; B.ev.push({ k: 'die', x: e.x, y: e.y, r: e.r, c: e.d.c }); } else alive++; }
    if (alive !== B.enemies.length) B.enemies = B.enemies.filter(e => e.hp > 0);

    if (B.hp <= 0) { B.hp = 0; B.done = true; B.win = false; }
    else if (B.qi >= B.queue.length && alive === 0) { B.done = true; B.win = true; }
  }

  // 戦闘の結果をランに反映する。戻り値は報酬コイン（敗北なら 0）。
  function finishWave(r, B) {
    if (!B.win) { r.over = true; r.hp = 0; return 0; }
    const reward = T.waveCoin + T.waveCoinPer * r.wave + B.build.coin;
    r.coin += reward; r.hp = Math.min(B.maxHp, B.hp + T.healOnClear);
    if (r.wave >= LAST) { r.won = true; return reward; }
    r.wave++; rollShop(r); return reward;
  }

  G.SIM = { BW, BH, NW, NH, LINE, FW, LAST, EXP, LV_W, LV_S, PURSE, T, mkRng, cellsOf, newRun, addItem, active, occupancy, fits, firstFit, byId, move,
    canMerge, merge, sell, sellValue, rollShop, buy, buyMerge, reroll, rerollCost, expand, expandCost, computeBuild, hpMul, waveSpawns, newBattle, step, finishWave };
})(typeof window !== 'undefined' ? window : globalThis);
