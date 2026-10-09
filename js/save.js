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
      icon: { design: 0, c1: 0, c2: 1 },  // Chosen cube face and the two color numbers.
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
    return data;
  };

  S.write = function () {
    try { root.localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* Storage is full or blocked. */ }
  };

  S.get = function () { return data; };

  S.reset = function () { data = fresh(); S.write(); };

  // Progress record for one level, created the first time it is asked for.
  S.level = function (id) {
    if (!data.progress[id]) data.progress[id] = { normal: 0, practice: 0, attempts: 0, jumps: 0, coins: [], done: false };
    return data.progress[id];
  };

  /* Called when a run ends. Returns true if it was a new best.
     mode is "normal" or "practice". coins is a list of coin numbers picked up. */
  S.report = function (id, mode, percent, coins) {
    var p = S.level(id), best = percent > p[mode];
    if (best) p[mode] = percent;
    if (mode === 'normal' && percent >= 100) {
      p.done = true;
      (coins || []).forEach(function (c) { if (p.coins.indexOf(c) < 0) p.coins.push(c); });
    }
    S.write();
    return best;
  };

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

  // The icon in the shape the drawing code wants: { design, c1, c2 } with real colors.
  S.icon = function () {
    return { design: data.icon.design, c1: PD.ICON_COLORS[data.icon.c1], c2: PD.ICON_COLORS[data.icon.c2] };
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
