/* ==========================================================================
   save.js
   Remembers your progress in the browser (localStorage), so it is still
   there when you come back. Nothing is sent anywhere.
   ========================================================================== */
(function (root) {
  'use strict';
  var PD = root.PD;
  var KEY = 'popdash.save.v1';

  // What a brand new save looks like.
  function fresh() {
    return {
      progress: {},                       // levelId -> { normal, practice, attempts, jumps, coins: [], done }
      // icon.design is the old single choice (kept so old saves still work).
      // icon.designs holds the choice for each game mode: { cube: 0, ship: 3, ... }
      icon: { design: 0, designs: {}, c1: 0, c2: 1 },
      balls: 0,                           // Blue balls you can spend in the shop.
      owned: {},                          // Icons bought in the shop, like { 'ship:5': true }
      settings: { music: 0.7, sfx: 0.8 },
      custom: []                          // Levels made in the editor.
    };
  }

  var data = fresh();
  var S = PD.Save = {};

  S.load = function () {
    try {
      var raw = root.localStorage && root.localStorage.getItem(KEY);
      if (raw) {
        var got = JSON.parse(raw), base = fresh();
        // Copy saved values over the defaults, so new fields never go missing.
        for (var k in base) if (got[k] != null) base[k] = got[k];
        data = base;
      }
    } catch (e) { data = fresh(); }           // Private windows can block storage. Just play without it.
    // Old saves do not have these fields yet.
    if (!data.icon.designs) data.icon.designs = {};
    if (!data.owned) data.owned = {};
    if (typeof data.balls !== 'number') data.balls = 0;
    return data;
  };

  S.write = function () {
    try { root.localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* Storage is full or blocked. */ }
  };

  S.get = function () { return data; };

  S.reset = function () { data = fresh(); S.write(); };

  // Progress record for one level, created the first time it is asked for.
  S.level = function (id) {
    if (!data.progress[id]) data.progress[id] = { normal: 0, practice: 0, attempts: 0, jumps: 0, coins: [], done: false, ballsGot: 0 };
    return data.progress[id];
  };

  /* Called when a run ends. Returns true if it was a new best.
     mode is "normal" or "practice". coins is a list of coin numbers picked up.
     In normal mode this also hands out blue balls. How many you got this time
     is left in S.lastAward so the game can show it. */
  S.lastAward = 0;
  S.report = function (id, mode, percent, coins) {
    var p = S.level(id), best = percent > p[mode];
    S.lastAward = 0;
    if (best) p[mode] = percent;
    if (mode === 'normal' && percent >= 100) {
      p.done = true;
      (coins || []).forEach(function (c) { if (p.coins.indexOf(c) < 0) p.coins.push(c); });
    }
    if (mode === 'normal') S.lastAward = awardBalls(id, p);   // Practice never gives balls.
    S.write();
    return best;
  };

  /* ---------- Blue balls ---------- */
  // How many balls each difficulty is worth in total. Change these to rebalance.
  S.BALL_POOL = { Easy: 50, Normal: 100, Hard: 150 };

  // Total balls a level can give. Levels made in the editor give none.
  S.ballPool = function (id) {
    for (var i = 0; i < PD.LEVELS.length; i++) {
      if (PD.LEVELS[i].id === id) return S.BALL_POOL[PD.LEVELS[i].difficulty] || 0;
    }
    return 0;
  };

  /* Balls you should own from this level = pool x best percent (rounded down).
     Example: a best of 32% on an Easy level (50 balls) is 16 balls.
     Beating the level (100%) hands over whatever is left, so the total is always the full pool.
     We remember what was already paid out (ballsGot), so nobody is paid twice. */
  function awardBalls(id, p) {
    var pool = S.ballPool(id);
    if (!pool) return 0;
    var target = p.normal >= 100 ? pool : Math.floor(pool * p.normal / 100);
    var got = p.ballsGot || 0, add = Math.max(0, target - got);
    p.ballsGot = got + add;
    data.balls = (data.balls || 0) + add;
    return add;
  }

  S.balls = function () { return data.balls || 0; };

  // Totals shown on the menu and used to unlock icons.
  S.totals = function () {
    var stars = 0, coins = 0;
    PD.LEVELS.forEach(function (lv) {
      var p = data.progress[lv.id];
      if (!p) return;
      if (p.done) stars += lv.stars || 0;
      coins += p.coins.length;
    });
    return { stars: stars, coins: coins };
  };

  /* What you need to unlock each cube face.
     The first four are free. The rest are prizes for stars and coins. */
  S.ICON_RULES = [null, null, null, null, { stars: 2 }, { coins: 2 }, { stars: 7 }, { coins: 5 }, { stars: 15 }, { coins: 9 }];

  S.iconUnlocked = function (i) {
    var rule = S.ICON_RULES[i], t = S.totals();
    if (!rule) return true;
    return (rule.stars == null || t.stars >= rule.stars) && (rule.coins == null || t.coins >= rule.coins);
  };

  /* ---------- Shop and icon choice ---------- */
  // Price in balls for each icon number. The first four are free, so they cost 0.
  S.ICON_PRICES = [0, 0, 0, 0, 15, 20, 30, 40, 50, 60];

  /* You own an icon (for one game mode) if it is free, if you earned it with
     stars or coins, or if you bought it in the shop. */
  S.iconOwned = function (mode, i) {
    return S.iconUnlocked(i) || !!data.owned[mode + ':' + i];
  };

  // Try to buy an icon. Returns { ok: true } or { ok: false, reason, need }.
  S.buyIcon = function (mode, i) {
    if (S.iconOwned(mode, i)) return { ok: false, reason: 'owned' };
    var price = S.ICON_PRICES[i] || 0;
    if (S.balls() < price) return { ok: false, reason: 'poor', need: price - S.balls() };
    data.balls -= price;
    data.owned[mode + ':' + i] = true;
    S.write();
    return { ok: true };
  };

  // The icon number picked for one mode. Falls back to the old single choice, then to icon 0.
  S.iconDesign = function (mode) {
    var d = data.icon.designs[mode];
    if (d == null) d = data.icon.design;
    return S.iconOwned(mode, d) ? d : 0;
  };

  // Pick an icon for one mode. Only icons you own can be picked.
  S.setIconDesign = function (mode, i) {
    if (!S.iconOwned(mode, i)) return false;
    data.icon.designs[mode] = i;
    S.write();
    return true;
  };

  // The icon in the shape the drawing code wants: a design for each mode plus two real colors.
  S.icon = function () {
    var designs = {};
    PD.MODES.forEach(function (m) { designs[m] = S.iconDesign(m); });
    return { design: designs.cube, designs: designs, c1: PD.ICON_COLORS[data.icon.c1], c2: PD.ICON_COLORS[data.icon.c2] };
  };

  // Custom level helpers for the editor.
  S.saveCustom = function (lv) {
    var i = data.custom.findIndex(function (c) { return c.id === lv.id; });
    if (i >= 0) data.custom[i] = lv; else data.custom.push(lv);
    S.write();
  };
  S.deleteCustom = function (id) {
    data.custom = data.custom.filter(function (c) { return c.id !== id; });
    delete data.progress[id];
    S.write();
  };
})(typeof window !== 'undefined' ? window : globalThis);
