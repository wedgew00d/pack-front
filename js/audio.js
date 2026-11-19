// 音。すべて Web Audio の合成で、音声ファイルは使わない。
// 音を組む関数は「音声コンテキスト」を引数に取るので、同じ関数を OfflineAudioContext に渡して音量を測れる（AUDIO.measure）。
(function () {
  'use strict';
  const BGM_K = 0.13, SE_K = 0.8;                 // つまみ1.0のときの実際の倍率。下の測定で決めた値
  const BPM = 112, STEP = 60 / BPM / 4;           // 1ステップ = 16分音符
  const A = { ctx: null, g: null, vol: { bgm: 0.5, se: 0.6 }, mode: 'off', level: 0 };
  try { const v = JSON.parse(localStorage.getItem('packfront.vol') || 'null'); if (v && v.bgm >= 0 && v.se >= 0) A.vol = { bgm: +v.bgm, se: +v.se }; } catch (e) { }

  // ---------- 音の部品 ----------
  function build(ctx) {
    const out = ctx.createDynamicsCompressor(); out.threshold.value = -12; out.knee.value = 8; out.ratio.value = 5; out.attack.value = 0.003; out.release.value = 0.15; out.connect(ctx.destination);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 85; hp.connect(out);   // 鳴りつづける重低音を出さない
    const bgm = ctx.createGain(), se = ctx.createGain(); bgm.connect(hp); se.connect(out);
    const L = { pad: ctx.createGain(), beat: ctx.createGain() }; L.pad.connect(bgm); L.beat.connect(bgm); L.pad.gain.value = 0; L.beat.gain.value = 0;
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return { ctx, out, bgm, se, L, nb };
  }
  function env(ctx, t, dur, vol, att) { const g = ctx.createGain(); att = att || 0.004; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + att); g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(att + 0.01, dur)); return g; }
  // 音程のある音。f1 を渡すと音程が動く。lp はローパスの周波数
  function tone(g, dest, o) {
    const ctx = g.ctx, t = o.t, os = ctx.createOscillator(), e = env(ctx, t, o.dur, o.vol, o.att); os.type = o.type || 'sine';
    os.frequency.setValueAtTime(o.f0, t); if (o.f1) os.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur);
    if (o.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; os.connect(f); f.connect(e); } else os.connect(e);
    e.connect(dest); os.start(t); os.stop(t + o.dur + 0.05);
  }
  // ノイズ。type はフィルタの種類、f0→f1 でフィルタが動く
  function noise(g, dest, o) {
    const ctx = g.ctx, t = o.t, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), e = env(ctx, t, o.dur, o.vol, o.att); s.buffer = g.nb; s.loop = true;
    f.type = o.type || 'bandpass'; f.Q.value = o.q || 0.9; f.frequency.setValueAtTime(o.f0, t); if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur);
    s.connect(f); f.connect(e); e.connect(dest); s.start(t, Math.random() * 1.5); s.stop(t + o.dur + 0.05);
  }

  // ---------- BGM ----------
  // 4小節で一巡する進行（Dm → B♭ → C → A）。pad は準備中の静かな層、beat は戦闘中の拍の層。
  const PROG = [[146.83, 174.61, 220.0], [116.54, 146.83, 174.61], [130.81, 164.81, 196.0], [110.0, 138.59, 164.81]];
  const BASS = [1, 0, 1, 1, 0, 1, 1, 0], ARP = [0, 1, 2, 1, 2, 1, 0, 2, 1, 2, 0, 1, 2, 0, 1, 2];
  function step(g, n, t, level) {
    const s = n % 16, bar = Math.floor(n / 16), ch = PROG[bar % 4], P = g.L.pad, Bt = g.L.beat;
    if (s === 0) {                                   // 持続和音（1小節ぶん）
      for (const f of ch) tone(g, P, { t, f0: f, dur: STEP * 17, vol: 0.16, att: 0.5, type: 'sawtooth', lp: 620 });
      tone(g, P, { t, f0: ch[0] * 2, dur: STEP * 17, vol: 0.07, att: 0.8 });
    }
    if (s % 8 === 4 && Math.random() < 0.75) tone(g, P, { t, f0: ch[(Math.random() * 3) | 0] * 4, dur: 0.9, vol: 0.06, type: 'triangle' });   // まばらな高音
    // ここから拍の層
    if (s % 4 === 0) tone(g, Bt, { t, f0: 150, f1: 58, dur: 0.13, vol: 0.45 });                                // キック
    if (s === 4 || s === 12) noise(g, Bt, { t, f0: 1900, dur: 0.11, vol: 0.2, q: 0.8 });                       // スネア
    if (s % 4 === 2) noise(g, Bt, { t, type: 'highpass', f0: 7000, dur: 0.035, vol: 0.1 });                    // ハイハット
    else if (s % 2 === 1 && level >= 1) noise(g, Bt, { t, type: 'highpass', f0: 8000, dur: 0.02, vol: 0.04 });
    if (s % 2 === 0 && BASS[(s / 2) | 0]) tone(g, Bt, { t, f0: ch[0], dur: STEP * 1.6, vol: 0.3, type: 'sawtooth', lp: 480 });   // ベース（8分）
    if (level >= 1) tone(g, Bt, { t, f0: ch[ARP[s]] * (s % 8 < 4 ? 2 : 4), dur: STEP * 0.9, vol: 0.075, type: 'square', lp: 2200 });   // 分散和音（中盤から）
    if (level >= 2) {                                // ボス戦：頭の和音の突きと、小節末のタム
      if (s === 0 || s === 10) for (const f of ch) tone(g, Bt, { t, f0: f * 2, dur: 0.28, vol: 0.085, type: 'sawtooth', lp: 1500 });
      if (s >= 14 && bar % 2 === 1) tone(g, Bt, { t, f0: s === 14 ? 200 : 150, f1: 90, dur: 0.12, vol: 0.3 });
    }
  }
  const MIX = { off: [0, 0], title: [0.8, 0], prep: [1, 0], battle: [0.45, 1] };   // [pad, beat]
  let nextT = 0, stepN = 0, timer = null;
  function pump() {
    const g = A.g; if (!g || g.ctx.state !== 'running') return; const now = g.ctx.currentTime;
    if (nextT < now) { nextT = now + 0.05; stepN = Math.ceil(stepN / 16) * 16; }      // 止まっていた分は飛ばし、小節の頭から
    while (nextT < now + 1.2) { step(g, stepN++, nextT, A.level); nextT += STEP; }
  }
  function applyMix(fast) { const g = A.g; if (!g) return; const m = MIX[A.mode] || MIX.off, t = g.ctx.currentTime; g.L.pad.gain.setTargetAtTime(m[0], t, fast ? 0.05 : 0.35); g.L.beat.gain.setTargetAtTime(m[1], t, fast ? 0.05 : 0.25); }
  function applyVol() { const g = A.g; if (!g) return; const t = g.ctx.currentTime; g.bgm.gain.setTargetAtTime(A.vol.bgm * BGM_K, t, 0.03); g.se.gain.setTargetAtTime(A.vol.se * SE_K, t, 0.03); }

  // ---------- 効果音 ----------
  const SE = {
    shot_pistol(g, d, t) { noise(g, d, { t, f0: 2400, f1: 900, dur: 0.09, vol: 0.3 }); tone(g, d, { t, f0: 520, f1: 150, dur: 0.07, vol: 0.16, type: 'square' }); },
    shot_smg(g, d, t) { noise(g, d, { t, f0: 3200, f1: 1500, dur: 0.045, vol: 0.13 }); tone(g, d, { t, f0: 720, f1: 300, dur: 0.035, vol: 0.06, type: 'square' }); },
    shot_shotgun(g, d, t) { noise(g, d, { t, type: 'lowpass', f0: 2800, f1: 450, dur: 0.24, vol: 0.32 }); tone(g, d, { t, f0: 170, f1: 60, dur: 0.16, vol: 0.25 }); },
    shot_rifle(g, d, t) { noise(g, d, { t, f0: 4200, f1: 1100, dur: 0.15, vol: 0.36 }); tone(g, d, { t, f0: 950, f1: 110, dur: 0.12, vol: 0.18, type: 'sawtooth' }); noise(g, d, { t: t + 0.03, type: 'lowpass', f0: 900, dur: 0.4, vol: 0.09 }); },
    shot_launcher(g, d, t) { tone(g, d, { t, f0: 230, f1: 70, dur: 0.17, vol: 0.38 }); noise(g, d, { t, f0: 650, dur: 0.12, vol: 0.18 }); },
    flame(g, d, t) { noise(g, d, { t, f0: 800, f1: 1500, dur: 0.3, vol: 0.15, att: 0.06, q: 0.6 }); },
    zap(g, d, t) { tone(g, d, { t, f0: 1900, f1: 180, dur: 0.14, vol: 0.11, type: 'sawtooth' }); tone(g, d, { t: t + 0.03, f0: 2600, f1: 500, dur: 0.1, vol: 0.07, type: 'square' }); noise(g, d, { t, type: 'highpass', f0: 5000, dur: 0.1, vol: 0.09 }); },
    slash(g, d, t) { noise(g, d, { t, f0: 5200, f1: 1400, dur: 0.1, vol: 0.26, q: 2 }); },
    crit(g, d, t) { tone(g, d, { t, f0: 1760, dur: 0.12, vol: 0.08 }); tone(g, d, { t, f0: 2637, dur: 0.1, vol: 0.05 }); },
    die(g, d, t) { noise(g, d, { t, type: 'lowpass', f0: 1900, f1: 200, dur: 0.28, vol: 0.2 }); tone(g, d, { t, f0: 190, f1: 50, dur: 0.22, vol: 0.2 }); },
    boom(g, d, t) { noise(g, d, { t, type: 'lowpass', f0: 2400, f1: 150, dur: 0.45, vol: 0.32 }); tone(g, d, { t, f0: 130, f1: 38, dur: 0.4, vol: 0.3 }); },
    die_big(g, d, t) { for (let i = 0; i < 5; i++) { const u = t + i * 0.14; noise(g, d, { t: u, type: 'lowpass', f0: 2600, f1: 110, dur: 0.75, vol: 0.45 }); tone(g, d, { t: u, f0: 120 - i * 8, f1: 32, dur: 0.6, vol: 0.42 }); } },
    wall(g, d, t) { tone(g, d, { t, f0: 115, f1: 45, dur: 0.2, vol: 0.33 }); noise(g, d, { t, f0: 2600, dur: 0.08, vol: 0.16, q: 6 }); },
    click(g, d, t) { tone(g, d, { t, f0: 880, dur: 0.035, vol: 0.13 }); },
    pick(g, d, t) { tone(g, d, { t, f0: 660, f1: 780, dur: 0.045, vol: 0.14 }); },
    place(g, d, t) { tone(g, d, { t, f0: 300, f1: 170, dur: 0.07, vol: 0.2, type: 'triangle' }); noise(g, d, { t, type: 'lowpass', f0: 1300, dur: 0.04, vol: 0.09 }); },
    bad(g, d, t) { tone(g, d, { t, f0: 150, f1: 110, dur: 0.15, vol: 0.11, type: 'square', lp: 900 }); },
    rotate(g, d, t) { noise(g, d, { t, f0: 1800, f1: 3200, dur: 0.07, vol: 0.3, q: 3 }); },
    buy(g, d, t) { tone(g, d, { t, f0: 1318, dur: 0.09, vol: 0.12 }); tone(g, d, { t: t + 0.07, f0: 1976, dur: 0.2, vol: 0.12 }); },
    sell(g, d, t) { tone(g, d, { t, f0: 1976, dur: 0.09, vol: 0.11 }); tone(g, d, { t: t + 0.07, f0: 1318, dur: 0.18, vol: 0.11 }); },
    merge(g, d, t) { [784, 988, 1175, 1568].forEach((f, i) => tone(g, d, { t: t + i * 0.055, f0: f, dur: 0.2, vol: 0.12, type: 'triangle' })); noise(g, d, { t, type: 'highpass', f0: 8000, dur: 0.25, vol: 0.04 }); },
    reroll(g, d, t) { for (let i = 0; i < 4; i++) noise(g, d, { t: t + i * 0.04, f0: 1400 + i * 500, dur: 0.04, vol: 0.24, q: 4 }); },
    expand(g, d, t) { tone(g, d, { t, f0: 196, f1: 392, dur: 0.28, vol: 0.12, type: 'sawtooth', lp: 1100 }); tone(g, d, { t: t + 0.12, f0: 784, dur: 0.22, vol: 0.09 }); },
    go(g, d, t) { tone(g, d, { t, f0: 196, dur: 0.24, vol: 0.2, type: 'sawtooth', lp: 1300, att: 0.02 }); tone(g, d, { t: t + 0.2, f0: 233.1, dur: 0.42, vol: 0.2, type: 'sawtooth', lp: 1300, att: 0.02 }); },
    clear(g, d, t) { [587.3, 740, 880, 1174.7].forEach((f, i) => tone(g, d, { t: t + i * 0.1, f0: f, dur: i === 3 ? 0.7 : 0.3, vol: 0.14, type: 'triangle' })); },
    over(g, d, t) { [293.7, 277.2, 220, 146.8].forEach((f, i) => tone(g, d, { t: t + i * 0.3, f0: f, dur: i === 3 ? 1.2 : 0.5, vol: 0.15, type: 'sawtooth', lp: 900, att: 0.02 })); },
    win(g, d, t) { [587.3, 740, 880, 1174.7, 1480].forEach((f, i) => tone(g, d, { t: t + i * 0.11, f0: f, dur: 0.35, vol: 0.13, type: 'triangle' })); [587.3, 740, 880, 1174.7].forEach(f => tone(g, d, { t: t + 0.62, f0: f, dur: 1.6, vol: 0.09, type: 'triangle', att: 0.02 })); }
  };
  // 同じ音が重なりすぎないよう、種類ごとに最短の間隔を決める（秒）
  const GAP = { shot_smg: 0.055, shot_pistol: 0.05, shot_shotgun: 0.08, shot_rifle: 0.08, shot_launcher: 0.08, flame: 0.2, zap: 0.09, slash: 0.07, crit: 0.09, die: 0.06, boom: 0.09, wall: 0.1 };
  const lastAt = {};

  // ---------- 外から使う部分 ----------
  A.init = function () {            // 最初の操作（「はじめる」）で呼ぶ
    if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume().catch(() => { }); return; }
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    try { A.ctx = new C(); A.g = build(A.ctx); } catch (e) { A.ctx = A.g = null; return; }
    A.g.bgm.gain.value = A.vol.bgm * BGM_K; A.g.se.gain.value = A.vol.se * SE_K; applyMix(true);
    timer = setInterval(pump, 200); pump();
    document.addEventListener('visibilitychange', () => { if (!A.ctx) return; if (document.hidden) A.ctx.suspend().catch(() => { }); else A.ctx.resume().catch(() => { }); });
  };
  A.music = function (mode, level) { A.mode = mode; A.level = level || 0; applyMix(false); };
  A.se = function (name) {
    const g = A.g; if (!g || g.ctx.state !== 'running' || !SE[name]) return; const t = g.ctx.currentTime;
    if (GAP[name] && t - (lastAt[name] || -9) < GAP[name]) return; lastAt[name] = t; SE[name](g, g.se, t + 0.005);
  };
  A.setVol = function (kind, v) { A.vol[kind] = Math.max(0, Math.min(1, v)); applyVol(); try { localStorage.setItem('packfront.vol', JSON.stringify(A.vol)); } catch (e) { } };
  // 耳で聴けない代わりの測定。BGM なら mode と秒数、効果音なら名前を渡す。つまみは既定値で測る。
  A.measure = function (what, seconds, level) {
    const sr = 44100, isSe = !!SE[what], len = isSe ? 2.2 : seconds, ctx = new OfflineAudioContext(1, Math.ceil(sr * len), sr), g = build(ctx);
    g.bgm.gain.value = 0.5 * BGM_K; g.se.gain.value = 0.6 * SE_K;
    if (isSe) SE[what](g, g.se, 0.05);
    else { const m = MIX[what]; g.L.pad.gain.value = m[0]; g.L.beat.gain.value = m[1]; for (let n = 0, t = 0.05; t < len; n++, t += STEP) step(g, n, t, level || 0); }
    return ctx.startRendering().then(buf => {
      const d = buf.getChannelData(0); let pk = 0, sq = 0, lowSq = 0, lp = 0; const a = 1 - Math.exp(-2 * Math.PI * 80 / sr);
      for (let i = 0; i < d.length; i++) { const v = d[i]; pk = Math.max(pk, Math.abs(v)); sq += v * v; lp += a * (v - lp); lowSq += lp * lp; }
      const db = x => +(20 * Math.log10(Math.max(x, 1e-9))).toFixed(1);
      return { peakDb: db(pk), rmsDb: db(Math.sqrt(sq / d.length)), lowPct: +(100 * lowSq / Math.max(sq, 1e-12)).toFixed(1) };
    });
  };
  A.names = Object.keys(SE);
  window.AUDIO = A;
})();
