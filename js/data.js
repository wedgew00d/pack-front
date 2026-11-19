// アイテム・敵・ウェーブの定義。ルール本体は sim.js。
(function (G) {
  'use strict';
  // kind: w=武器 / s=補助。shape は '#' がマス。tier はショップに出はじめる段階。
  G.ITEMS = {
    pistol:   { name: 'ハンドガン', kind: 'w', tier: 1, cost: 3, shape: ['##'], c: '#9fc4ff',
                fire: 'bullet', dmg: 9, cd: 0.6, desc: 'いちばん近い敵を撃つ。' },
    knife:    { name: 'ナイフ', kind: 'w', tier: 1, cost: 2, shape: ['#'], c: '#e6e9f2',
                fire: 'melee', dmg: 16, cd: 0.7, desc: '防衛線まで来た敵を斬る。Lvごとに同時に斬れる数+1。' },
    smg:      { name: 'サブマシンガン', kind: 'w', tier: 2, cost: 5, shape: ['##', '#.'], c: '#7fe3d0',
                fire: 'bullet', dmg: 3.2, cd: 0.12, spread: 0.07, desc: '高速連射。装甲のある敵は苦手。' },
    shotgun:  { name: 'ショットガン', kind: 'w', tier: 2, cost: 5, shape: ['###'], c: '#ffb36b',
                fire: 'pellets', dmg: 6, n: 6, cd: 1.5, range: 3.8, desc: '近距離に散弾6発。' },
    rifle:    { name: 'ライフル', kind: 'w', tier: 3, cost: 6, shape: ['####'], c: '#c9a7ff',
                fire: 'bullet', target: 'strong', dmg: 60, cd: 2.2, pierce: 3, spd: 26, desc: '体力の多い敵を狙う貫通弾。' },
    launcher: { name: 'ランチャー', kind: 'w', tier: 3, cost: 6, shape: ['##', '##'], c: '#ff8a7a',
                fire: 'shell', dmg: 26, aoe: 1.15, cd: 2.6, desc: '着弾点で爆発。群れに強い。' },
    flamer:   { name: '火炎放射器', kind: 'w', tier: 3, cost: 6, shape: ['###', '#..'], c: '#ffd166',
                fire: 'flame', dmg: 3, cd: 0.2, range: 3.3, desc: '近距離を扇状に焼く。装甲を無視。' },
    tesla:    { name: 'テスラコイル', kind: 'w', tier: 3, cost: 6, shape: ['.#.', '###'], c: '#8be9ff',
                fire: 'chain', dmg: 12, cd: 1.6, chain: 3, desc: '敵から敵へ連鎖する電撃。装甲を無視。' },

    ammo:   { name: '弾薬箱', kind: 's', tier: 1, cost: 3, shape: ['#'], c: '#f2c14e', adj: 'rate', v: 0.25,
              desc: '隣の武器の連射 +{v}%' },
    scope:  { name: 'スコープ', kind: 's', tier: 2, cost: 4, shape: ['#'], c: '#ff7b9c', adj: 'dmg', v: 0.30,
              desc: '隣の武器の威力 +{v}%' },
    powder: { name: '炸薬', kind: 's', tier: 2, cost: 4, shape: ['##'], c: '#ff9f43', adj: 'crit', v: 0.20,
              desc: '隣の武器に会心 {v}%（威力2.5倍）' },
    cryo:   { name: '冷却剤', kind: 's', tier: 2, cost: 4, shape: ['#'], c: '#9be7ff', adj: 'slow', v: 0.30,
              desc: '隣の武器の攻撃が敵を {v}% 減速' },
    medkit: { name: '修復キット', kind: 's', tier: 1, cost: 4, shape: ['#'], c: '#7be08a', glob: 'regen', v: 0.8,
              desc: '戦闘中、防壁を毎秒 {r} 回復' },
    plate:  { name: '装甲板', kind: 's', tier: 1, cost: 4, shape: ['##'], c: '#aab4c8', glob: 'plate', v: 30,
              desc: '防壁の最大耐久 +{p}、被ダメージ -{l}' },
    purse:  { name: '回収ポーチ', kind: 's', tier: 1, cost: 3, shape: ['#'], c: '#ffe08a', glob: 'coin', v: 0,
              desc: 'ウェーブ報酬 +{c} コイン' }
  };

  G.ENEMIES = {
    walker: { name: '歩行型', hp: 22,   spd: 0.75, dmg: 4,  r: 0.32, armor: 0, c: '#ff6b5e' },
    runner: { name: '疾走型', hp: 12,   spd: 1.7,  dmg: 3,  r: 0.24, armor: 0, c: '#ff5ec4' },
    brute:  { name: '重装型', hp: 130,  spd: 0.42, dmg: 12, r: 0.50, armor: 0, c: '#ff9a3c' },
    shield: { name: '装甲型', hp: 30,   spd: 0.65, dmg: 5,  r: 0.34, armor: 4, c: '#6fd3ff' },
    flyer:  { name: '浮遊型', hp: 16,   spd: 1.1,  dmg: 3,  r: 0.26, armor: 0, c: '#ffe45e' },
    boss:   { name: '統括機', hp: 550, spd: 0.22, dmg: 20, r: 1.0,  armor: 1, atk: 2.2, c: '#ff3b6b' }
  };
  G.ENEMY_ORDER = ['walker', 'runner', 'brute', 'shield', 'flyer', 'boss'];
  // 1行が1ウェーブ。並びは ENEMY_ORDER。
  G.WAVES = [
    [8, 0, 0, 0, 0, 0],
    [10, 4, 0, 0, 0, 0],
    [10, 8, 1, 0, 0, 0],
    [12, 8, 2, 0, 0, 0],
    [12, 8, 2, 6, 0, 0],
    [12, 6, 3, 4, 10, 0],
    [16, 12, 4, 6, 8, 0],
    [18, 14, 5, 8, 12, 0],
    [22, 16, 6, 10, 14, 0],
    [20, 16, 6, 10, 12, 1]
  ];
})(typeof window !== 'undefined' ? window : globalThis);
