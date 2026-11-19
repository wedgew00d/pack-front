// 自動対戦。使い方: node test/bot.js [回数] [smart|naive]
// naive: 買えるものを買って空きに詰めるだけ。smart: 補助を武器の隣に置こうとする。
const path = require('path');
require(path.join(__dirname, '../js/data.js'));
require(path.join(__dirname, '../js/sim.js'));
const S = globalThis.SIM, ITEMS = globalThis.ITEMS;
const N = +process.argv[2] || 300, MODE = process.argv[3] || 'naive';

function mergeAll(r) {
  let again = true;
  while (again) {
    again = false;
    for (const a of r.items) for (const b of r.items) if (S.canMerge(a, b)) { S.merge(r, a.id, b.id); again = true; break; }
  }
}
function place(r, i) {
  const key = r.shop[i].key, d = ITEMS[key];
  let best = null, bs = -1;
  for (let rot = 0; rot < 4; rot++) for (let y = 0; y < S.BH; y++) for (let x = 0; x < S.BW; x++) {
    if (!S.fits(r, key, rot, 'bag', x, y)) continue;
    let sc = 0;
    if (MODE === 'smart') {   // 置いた場合のリンク数で採点
      const it = S.addItem(r, key, 1, 'bag', x, y, rot); sc = S.computeBuild(r).links.length; r.items.pop(); r.nid--;
    }
    if (sc > bs) { bs = sc; best = { x, y, rot }; }
    if (MODE !== 'smart') return best;
  }
  return best;
}
function prep(r) {
  for (let guard = 0; guard < 40; guard++) {
    let acted = false;
    for (let i = 0; i < 4; i++) {
      const s = r.shop[i]; if (s.sold || r.coin < ITEMS[s.key].cost) continue;
      const dup = r.items.find(it => it.key === s.key && it.lv === 1);
      if (dup) { S.buyMerge(r, i, dup.id); mergeAll(r); acted = true; continue; }
      const p = place(r, i);
      if (p) { S.buy(r, i, 'bag', p.x, p.y, p.rot); acted = true; }
      else if (S.expandCost(r) != null && r.coin >= S.expandCost(r) + ITEMS[s.key].cost) { S.expand(r); acted = true; }
    }
    if (!acted) { if (r.coin >= 6 && r.rerolls < r.wave * 3) { S.reroll(r); continue; } break; }
  }
}
const reach = new Array(S.LAST + 2).fill(0), hpAt = [], dur = [];
for (let n = 0; n < N; n++) {
  const r = S.newRun(1000 + n * 7919);
  while (!r.over && !r.won) {
    prep(r);
    const B = S.newBattle(r); let g = 0;
    while (!B.done && g++ < 60 * 400) S.step(B, 1 / 60);
    if (!B.done) { console.log('終わらない戦闘 wave', r.wave); B.win = false; B.done = true; }
    const w = r.wave; (dur[w] = dur[w] || []).push(B.t); (hpAt[w] = hpAt[w] || []).push(B.hp / B.maxHp);
    S.finishWave(r, B);
  }
  reach[r.won ? S.LAST + 1 : r.wave]++;
}
const avg = a => a ? (a.reduce((x, y) => x + y, 0) / a.length) : 0;
console.log(`mode=${MODE} N=${N}`);
for (let w = 1; w <= S.LAST; w++) console.log(`wave ${String(w).padStart(2)}: ここで敗北 ${String(reach[w]).padStart(4)}  平均時間 ${avg(dur[w]).toFixed(1)}s  残り耐久 ${(avg(hpAt[w]) * 100).toFixed(0)}%  挑戦 ${dur[w] ? dur[w].length : 0}`);
console.log(`クリア: ${reach[S.LAST + 1]} (${(reach[S.LAST + 1] / N * 100).toFixed(1)}%)`);
