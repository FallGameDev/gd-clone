/* ==========================================================================
   objects.js
   The shared "dictionary" of the game. Every other file reads from here.
   It holds:
     1. Global constants (speeds, tick rate, corridor height)
     2. The catalog of every object type (blocks, spikes, pads, orbs, portals)
     3. Hitbox helpers that turn an object into a box or circle in the world
   Nothing in this file touches the page, so it also runs in Node for testing.
   ========================================================================== */
(function (root) {
  'use strict';

  // One global namespace so files can share code without a build step.
  var PD = root.PD = root.PD || {};

  PD.GAME_NAME = 'Pop Dash';      // Change this one line to rename the game.
  PD.TICK = 1 / 240;              // Physics runs 240 times per second.
  PD.CEIL = 10;                   // Height of the tunnel used by flying modes.
  PD.KILL_HEIGHT = 45;            // A cube that floats this high is out.

  // Horizontal speeds in blocks per second (slow, normal, fast, faster, fastest).
  PD.SPEEDS = [8.4, 10.4, 12.9, 15.6, 19.2];

  // All seven game modes.
  PD.MODES = ['cube', 'ship', 'ball', 'ufo', 'wave', 'robot', 'spider'];

  // Modes that fly or flip inside a tunnel with a floor and a ceiling.
  PD.CORRIDOR = { ship: true, ball: true, ufo: true, wave: true, spider: true };

  // Modes that can slide along BOTH the top and bottom of a block.
  PD.BOTH_SIDES = { ship: true, ball: true, ufo: true, spider: true };

  // Colors that a background trigger can fade to.
  PD.BG_COLORS = ['#1b1147', '#0d2a5c', '#0b3d3a', '#4a1259',
                  '#5c1230', '#5a3210', '#10204a', '#2a2a3a'];

  // ------------------------------------------------------------------------
  // Object catalog.
  //   cat  : category, decides how the physics treats it
  //   box  : hitbox inside its grid cell as [x0, y0, x1, y1] (0 to 1)
  //   rad  : hitbox radius for round things (orbs, saws, coins)
  //   col  : main color used when drawing
  // ------------------------------------------------------------------------
  var T = PD.TYPES = {};
  function def(id, o) { o.id = id; T[id] = o; }

  // Solid things you can stand on.
  def('block', { name: 'Block',      cat: 'solid', box: [0, 0, 1, 1] });
  def('brick', { name: 'Brick',      cat: 'solid', box: [0, 0, 1, 1] });
  def('slab',  { name: 'Half Slab',  cat: 'solid', box: [0, 0.5, 1, 1] });

  // Things that end your run.
  def('spike',  { name: 'Spike',       cat: 'hazard', box: [0.36, 0.04, 0.64, 0.56] });
  def('spikeS', { name: 'Small Spike', cat: 'hazard', box: [0.36, 0.03, 0.64, 0.30] });
  def('thorn',  { name: 'Thorns',      cat: 'hazard', box: [0.10, 0.00, 0.90, 0.22] });
  def('saw',    { name: 'Saw',         cat: 'hazard', rad: 0.72, draw: 0.95 });
  def('sawL',   { name: 'Big Saw',     cat: 'hazard', rad: 1.30, draw: 1.65 });

  // Jump pads: touch them and they launch you. "v" is the launch power.
  def('padY', { name: 'Yellow Pad', cat: 'pad', box: [0.1, 0, 0.9, 0.25], col: '#ffe14d', v: 27 });
  def('padP', { name: 'Pink Pad',   cat: 'pad', box: [0.1, 0, 0.9, 0.25], col: '#ff6ad5', v: 17 });
  def('padR', { name: 'Red Pad',    cat: 'pad', box: [0.1, 0, 0.9, 0.25], col: '#ff4d5e', v: 34 });
  def('padB', { name: 'Blue Pad',   cat: 'pad', box: [0.1, 0, 0.9, 0.25], col: '#4dd2ff', flip: true });

  // Orbs: tap while touching one.
  def('orbY', { name: 'Yellow Orb', cat: 'orb', rad: 0.62, col: '#ffe14d', v: 19.6 });
  def('orbP', { name: 'Pink Orb',   cat: 'orb', rad: 0.62, col: '#ff6ad5', v: 14 });
  def('orbR', { name: 'Red Orb',    cat: 'orb', rad: 0.62, col: '#ff4d5e', v: 27 });
  def('orbB', { name: 'Blue Orb',   cat: 'orb', rad: 0.62, col: '#4dd2ff', flip: true });
  def('orbG', { name: 'Green Orb',  cat: 'orb', rad: 0.62, col: '#5dff8f', flip: true, v: 17.5 });
  def('orbK', { name: 'Black Orb',  cat: 'orb', rad: 0.62, col: '#5b5b7a', v: -22 });

  // Portals are 1 block wide and 3 blocks tall.
  var PBOX = [0.15, -1, 0.85, 2];
  def('pCube',   { name: 'Cube Portal',   cat: 'portal', box: PBOX, col: '#5dff8f', mode: 'cube' });
  def('pShip',   { name: 'Ship Portal',   cat: 'portal', box: PBOX, col: '#ff6ad5', mode: 'ship' });
  def('pBall',   { name: 'Ball Portal',   cat: 'portal', box: PBOX, col: '#ff4d5e', mode: 'ball' });
  def('pUfo',    { name: 'UFO Portal',    cat: 'portal', box: PBOX, col: '#ffa63d', mode: 'ufo' });
  def('pWave',   { name: 'Wave Portal',   cat: 'portal', box: PBOX, col: '#4dd2ff', mode: 'wave' });
  def('pRobot',  { name: 'Robot Portal',  cat: 'portal', box: PBOX, col: '#f2f2ff', mode: 'robot' });
  def('pSpider', { name: 'Spider Portal', cat: 'portal', box: PBOX, col: '#b06cff', mode: 'spider' });
  def('pGravUp',   { name: 'Gravity Up',   cat: 'portal', box: PBOX, col: '#ffe14d', grav: -1 });
  def('pGravDown', { name: 'Gravity Down', cat: 'portal', box: PBOX, col: '#4d8dff', grav: 1 });
  def('pSpeed0', { name: 'Speed: Slow',    cat: 'portal', box: PBOX, col: '#ffa63d', speed: 0 });
  def('pSpeed1', { name: 'Speed: Normal',  cat: 'portal', box: PBOX, col: '#4dd2ff', speed: 1 });
  def('pSpeed2', { name: 'Speed: Fast',    cat: 'portal', box: PBOX, col: '#5dff8f', speed: 2 });
  def('pSpeed3', { name: 'Speed: Faster',  cat: 'portal', box: PBOX, col: '#ff6ad5', speed: 3 });
  def('pSpeed4', { name: 'Speed: Fastest', cat: 'portal', box: PBOX, col: '#ff4d5e', speed: 4 });
  def('pMini',   { name: 'Mini Size',   cat: 'portal', box: PBOX, col: '#ff6ad5', mini: true });
  def('pBig',    { name: 'Normal Size', cat: 'portal', box: PBOX, col: '#5dff8f', mini: false });
  def('pMirrorOn',  { name: 'Mirror On',  cat: 'portal', box: PBOX, col: '#ffa63d', mirror: true });
  def('pMirrorOff', { name: 'Mirror Off', cat: 'portal', box: PBOX, col: '#4d8dff', mirror: false });

  // Collectible.
  def('coin', { name: 'Secret Coin', cat: 'coin', rad: 0.5, col: '#ffd23d' });

  // Decorations: pretty, but you pass right through them.
  def('dStar',  { name: 'Star',  cat: 'deco' });
  def('dGlow',  { name: 'Glow',  cat: 'deco' });
  def('dArrow', { name: 'Arrow', cat: 'deco' });

  // Background color triggers: invisible in play, they fade the sky color.
  PD.BG_COLORS.forEach(function (c, i) {
    def('tBg' + i, { name: 'Sky Color ' + (i + 1), cat: 'trigger', col: c, bg: c });
  });

  // Order of the tabs and buttons in the level editor.
  PD.PALETTE = [
    { name: 'Blocks',  items: ['block', 'brick', 'slab'] },
    { name: 'Hazards', items: ['spike', 'spikeS', 'thorn', 'saw', 'sawL'] },
    { name: 'Pads',    items: ['padY', 'padP', 'padR', 'padB'] },
    { name: 'Orbs',    items: ['orbY', 'orbP', 'orbR', 'orbB', 'orbG', 'orbK'] },
    { name: 'Modes',   items: ['pCube', 'pShip', 'pBall', 'pUfo', 'pWave', 'pRobot', 'pSpider'] },
    { name: 'Portals', items: ['pGravUp', 'pGravDown', 'pSpeed0', 'pSpeed1', 'pSpeed2', 'pSpeed3',
                               'pSpeed4', 'pMini', 'pBig', 'pMirrorOn', 'pMirrorOff'] },
    { name: 'Extras',  items: ['coin', 'dStar', 'dGlow', 'dArrow',
                               'tBg0', 'tBg1', 'tBg2', 'tBg3', 'tBg4', 'tBg5', 'tBg6', 'tBg7'] }
  ];

  // ------------------------------------------------------------------------
  // Hitbox helpers
  // ------------------------------------------------------------------------

  // Turn a point inside a cell clockwise by r quarter turns around the center.
  function rotPoint(u, v, r) {
    for (var i = 0; i < (r & 3); i++) { var nu = v, nv = 1 - u; u = nu; v = nv; }
    return [u, v];
  }

  /* Work out where an object's hitbox is in the world.
     Returns { x0, y0, x1, y1 } for boxes, plus { cx, cy, rad } for round things.
     Blocks may have w and h so one object can be a whole platform. */
  PD.hitbox = function (o) {
    var t = T[o.t];
    var w = o.w || 1, h = o.h || 1;
    if (t.rad) {
      var cx = o.x + 0.5, cy = o.y + 0.5;
      return { x0: cx - t.rad, y0: cy - t.rad, x1: cx + t.rad, y1: cy + t.rad,
               cx: cx, cy: cy, rad: t.rad };
    }
    if (t.cat === 'trigger') {
      // A trigger is a tall line: you hit it no matter how high you are.
      return { x0: o.x, y0: -1000, x1: o.x + 1, y1: 1000 };
    }
    if (t.cat === 'deco') return { x0: o.x, y0: o.y, x1: o.x + 1, y1: o.y + 1 };
    if (w !== 1 || h !== 1) {
      return { x0: o.x, y0: o.y, x1: o.x + w, y1: o.y + h };
    }
    var b = t.box;
    var p = rotPoint(b[0], b[1], o.r || 0), q = rotPoint(b[2], b[3], o.r || 0);
    return {
      x0: o.x + Math.min(p[0], q[0]), y0: o.y + Math.min(p[1], q[1]),
      x1: o.x + Math.max(p[0], q[0]), y1: o.y + Math.max(p[1], q[1])
    };
  };

  // Small math helpers used all over the game.
  PD.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  PD.lerp = function (a, b, t) { return a + (b - a) * t; };

  /* A tiny seeded random number maker. Give it the same seed and it always
     returns the same list of numbers. Used for stars and for music. */
  PD.rng = function (seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  };

  // Blend two "#rrggbb" colors. t = 0 gives a, t = 1 gives b.
  PD.mixColor = function (a, b, t) {
    var pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    var r = Math.round(PD.lerp(pa >> 16, pb >> 16, t));
    var g = Math.round(PD.lerp((pa >> 8) & 255, (pb >> 8) & 255, t));
    var bl = Math.round(PD.lerp(pa & 255, pb & 255, t));
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
  };

  if (typeof module !== 'undefined') module.exports = PD;
})(typeof window !== 'undefined' ? window : globalThis);
