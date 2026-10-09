/* ==========================================================================
   level.js
   Turns raw level data (a list of objects) into something the physics can
   search quickly. Also keeps the list of built-in levels.
   ========================================================================== */
(function (root) {
  'use strict';
  var PD = root.PD;

  PD.LEVELS = [];   // Built-in levels, filled by the files in /levels.

  // Each file in /levels calls this once to add itself to the game.
  PD.registerLevel = function (data) { PD.LEVELS.push(data); };

  // A brand new empty level, used by the editor.
  PD.blankLevel = function () {
    return {
      id: 'c' + Date.now().toString(36),
      name: 'My Level',
      author: 'You',
      difficulty: 'Custom',
      stars: 0,
      speed: 1,
      mode: 'cube',
      mini: false,
      bg: PD.BG_COLORS[0],
      blockColor: '#7c5cff',
      song: { id: 'custom', bpm: 125, seed: 7, root: 45, scale: 'minor' },
      objects: []
    };
  };

  /* Get a level ready to play.
     The big idea: sort every object into "columns" (one per block of width),
     so the physics only looks at the few objects near the player instead of
     checking the whole level 240 times a second. */
  PD.prepareLevel = function (data) {
    var objs = [], cols = new Map(), maxX = 0, coins = 0;
    for (var i = 0; i < data.objects.length; i++) {
      var src = data.objects[i];
      var type = PD.TYPES[src.t];
      if (!type) continue;                       // Skip unknown object types.
      var o = { t: src.t, x: src.x, y: src.y, r: src.r || 0, w: src.w || 1, h: src.h || 1,
                id: objs.length, type: type, cat: type.cat };
      o.box = PD.hitbox(o);
      if (o.cat === 'coin') o.coinIndex = coins++;
      objs.push(o);
      maxX = Math.max(maxX, o.x + o.w);
      // Add the object to every column its hitbox touches.
      var c0 = Math.floor(o.box.x0), c1 = Math.floor(o.box.x1 - 1e-6);
      if (o.cat === 'deco') { c0 = o.x; c1 = o.x; }
      for (var c = c0; c <= c1; c++) {
        var list = cols.get(c);
        if (!list) { list = []; cols.set(c, list); }
        list.push(o);
      }
    }
    return {
      data: data,
      objs: objs,
      cols: cols,
      coinCount: coins,
      // The finish line sits a little after the last object.
      length: Math.max(30, maxX + 12)
    };
  };

  /* Clean up level data that came from outside the game (an import).
     Anything strange is dropped or clamped, so a broken or sneaky file
     cannot crash the game. Returns null if it is not a level at all. */
  PD.sanitizeLevel = function (raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.objects)) return null;
    var lv = PD.blankLevel();
    function num(v, lo, hi, dflt) { v = Number(v); return isFinite(v) ? PD.clamp(v, lo, hi) : dflt; }
    function color(v, dflt) { return /^#[0-9a-fA-F]{6}$/.test(v) ? v : dflt; }
    lv.name = String(raw.name || 'Imported Level').slice(0, 24);
    lv.speed = Math.round(num(raw.speed, 0, 4, 1));
    lv.mode = PD.MODES.indexOf(raw.mode) >= 0 ? raw.mode : 'cube';
    lv.mini = !!raw.mini;
    lv.bg = color(raw.bg, lv.bg);
    lv.blockColor = color(raw.blockColor, lv.blockColor);
    var s = raw.song || {};
    lv.song = { id: 'custom', bpm: Math.round(num(s.bpm, 70, 190, 125)), seed: Math.round(num(s.seed, 1, 999, 7)),
                root: Math.round(num(s.root, 36, 57, 45)), scale: /^(minor|major|dorian)$/.test(s.scale) ? s.scale : 'minor' };
    raw.objects.slice(0, 6000).forEach(function (o) {
      if (!o || !PD.TYPES[o.t]) return;
      var c = { t: o.t, x: Math.round(num(o.x, 0, 20000, 0)), y: Math.round(num(o.y, 0, 40, 0)) };
      var r = Math.round(num(o.r, 0, 3, 0)), w = Math.round(num(o.w, 1, 400, 1)), h = Math.round(num(o.h, 1, 40, 1));
      if (r) c.r = r;
      if (w > 1) c.w = w;
      if (h > 1) c.h = h;
      lv.objects.push(c);
    });
    return lv;
  };
})(typeof window !== 'undefined' ? window : globalThis);
