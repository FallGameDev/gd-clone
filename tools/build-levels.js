/* ==========================================================================
   tools/build-levels.js   (run with:  node tools/build-levels.js)
   Writes the three built-in levels into /levels.

   Levels are built from small reusable "patterns" (a spike, a staircase, a
   ship gate...). Each pattern places its objects at the cursor (b.x) and then
   moves the cursor forward. Edit the recipes at the bottom to change a level,
   run this file, then run  node tools/bot.js  to prove it is still beatable.
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

class Builder {
  constructor(meta) { this.meta = meta; this.objs = []; this.x = 14; }
  // Place one object. dx is measured from the cursor.
  put(t, dx, y, r, w, h) {
    const o = { t, x: this.x + dx, y };
    if (r) o.r = r;
    if (w && w !== 1) o.w = w;
    if (h && h !== 1) o.h = h;
    this.objs.push(o);
    return this;
  }
  block(dx, y, w, h, t) { return this.put(t || 'block', dx, y, 0, w || 1, h || 1); }
  adv(n) { this.x += n; return this; }
  // A row of n things on the ground (or at height y).
  row(t, dx, n, y, r) { for (let i = 0; i < n; i++) this.put(t, dx + i, y || 0, r); return this; }

  /* Place a portal with walls above and below it, so nobody can sneak past
     a portal by flying over it. Pass wall = false to leave the walls out. */
  portal(t, dx, y, wall) {
    this.put(t, dx, y);
    if (wall !== false) {
      if (y - 1 > 0) this.block(dx, 0, 1, y - 1, 'brick');
      if (y + 2 < 10) this.block(dx, y + 2, 1, 10 - (y + 2), 'brick');
    }
    return this;
  }

  // ---------------- Cube patterns ----------------
  spikes(n, gap) { this.row('spike', 0, n); return this.adv(n + (gap == null ? 6 : gap)); }
  smallSpikes(n, gap) { this.row('spikeS', 0, n); return this.adv(n + (gap == null ? 6 : gap)); }
  // A low box to hop onto, with an optional spike right after it.
  box(w, h, spikeAfter) {
    this.block(0, 0, w, h);
    if (spikeAfter) this.put('spike', w, 0);
    return this.adv(w + (spikeAfter ? 7 : 6));
  }
  // Stairs going up one block at a time, then a drop back to the ground.
  stairs(steps, tread) {
    tread = tread || 4;
    for (let i = 0; i < steps; i++) this.block(i * tread, 0, tread, i + 1, i % 2 ? 'brick' : 'block');
    return this.adv(steps * tread + 7);
  }
  // Two platforms with a pit of spikes between them.
  pit(width, h) {
    h = h || 1;
    this.block(0, 0, 3, h);
    this.row('spike', 3, width);
    this.block(3 + width, 0, 3, h);
    return this.adv(width + 6 + 6);
  }
  // A pad that throws you onto a high shelf.
  padShelf(pad) {
    this.put(pad || 'padY', 0, 0);
    this.block(3, 2, 6, 1, 'brick');
    this.row('spikeS', 4, 4);
    return this.adv(17);
  }
  // A long spike pit that needs a mid-air orb tap.
  orbPit(orb) {
    this.row('spike', 0, 6);
    this.put(orb || 'orbY', 2, 2);
    return this.adv(6 + 7);
  }
  // Single pillars to hop across, each one taller than the last.
  pillars(n) {
    for (let i = 0; i < n; i++) {
      this.block(i * 4, 0, 1, i + 1, 'brick');
      if (i < n - 1) this.row('spikeS', i * 4 + 1, 3);
    }
    return this.adv(n * 4 + 6);
  }
  // Spikes hanging from a roof. Looks scary, but you just run under it.
  roof(len, y) {
    this.block(0, y, len, 1, 'brick');
    for (let i = 1; i < len; i += 2) this.put('spike', i, y - 1, 2);
    return this;
  }

  // ---------------- Tunnel patterns (ship, UFO) ----------------
  // One gate: a pillar from the floor and a pillar from the ceiling.
  gate(low, gapSize, spiky) {
    if (low > 0) this.block(0, 0, 1, low, 'brick');
    const top = low + gapSize;
    if (top < 10) this.block(0, top, 1, 10 - top, 'brick');
    if (spiky && low > 0) this.put('spikeS', 0, low);
    if (spiky && top < 10) this.put('spikeS', 0, top - 1, 2);
    return this;
  }
  gates(lows, gapSize, spacing, spiky) {
    for (const low of lows) { this.gate(low, gapSize, spiky); this.adv(spacing); }
    return this;
  }

  // ---------------- Ball and spider tunnel ----------------
  // A tunnel 5 blocks tall. "plan" is a string: F = floor spike, C = ceiling spike, . = empty.
  tunnel(plan, roofY) {
    roofY = roofY || 5;
    this.block(0, roofY, plan.length, 1, 'brick');
    for (let i = 0; i < plan.length; i++) {
      if (plan[i] === 'F') this.put('spike', i, 0);
      if (plan[i] === 'C') this.put('spike', i, roofY - 1, 2);
    }
    return this.adv(plan.length);
  }

  // ---------------- Wave zigzag ----------------
  // "mids" lists the middle height of the tunnel at each column.
  zigzag(mids, gapSize) {
    let start = 0;
    const flo = mids.map(m => Math.max(0, Math.round(m - gapSize / 2)));
    for (let i = 1; i <= mids.length; i++) {
      if (i === mids.length || flo[i] !== flo[start]) {
        const w = i - start, f = flo[start], top = f + gapSize;
        if (f > 0) this.block(start, 0, w, f);
        if (top < 10) this.block(start, top, w, 10 - top);
        start = i;
      }
    }
    return this.adv(mids.length);
  }

  save(file) {
    const data = Object.assign({}, this.meta);
    const lines = this.objs.map(o => '    ' + JSON.stringify(o)).join(',\n');
    const head = JSON.stringify(data, null, 2).replace(/\n}$/, '');
    const text = '/* Built-in level. Made by tools/build-levels.js, so edit that file\n' +
      '   instead of this one. Each object: t = type, x and y = grid position,\n' +
      '   r = quarter turns, w and h = size in blocks. */\n' +
      'PD.registerLevel(' + head + ',\n  "objects": [\n' + lines + '\n  ]\n});\n';
    fs.writeFileSync(path.join(__dirname, '..', 'levels', file), text);
    console.log(file, this.objs.length, 'objects, ends at x =', this.x);
  }
}

// Make a smooth up and down list of heights for a wave tunnel.
function triangle(len, lo, hi, slope, startMid) {
  const out = []; let m = startMid, dir = 1;
  for (let i = 0; i < len; i++) {
    out.push(m);
    m += dir * slope;
    if (m >= hi) { m = hi; dir = -1; }
    if (m <= lo) { m = lo; dir = 1; }
  }
  return out;
}

/* ==========================================================================
   LEVEL 1: Starlight Hop (Easy). Cube only: spikes, boxes, pads and orbs.
   ========================================================================== */
(function () {
  const b = new Builder({
    id: 'level1', name: 'Starlight Hop', author: 'Wildcard Studios', difficulty: 'Easy', stars: 2,
    speed: 1, mode: 'cube', bg: '#1b1147', blockColor: '#7c5cff',
    song: { id: 'level1', bpm: 125, seed: 11, root: 45, scale: 'minor' }
  });
  b.spikes(1, 9).spikes(1, 8).box(3, 1).spikes(2, 8);
  b.box(2, 1, true).stairs(3).spikes(1, 7).spikes(2, 8);
  b.put('coin', 0, 3).spikes(1, 9);                         // Coin 1: jump at just the right time.
  b.put('tBg1', 0, 0).pit(3).box(4, 1).spikes(2, 7).padShelf('padY');
  b.spikes(1, 6).pillars(3).spikes(2, 8).orbPit('orbY');
  b.put('tBg3', 0, 0).stairs(2, 5).pit(4).spikes(1, 6).spikes(1, 7);
  b.put('padY', 0, 0).block(3, 2, 5, 1, 'brick').put('coin', 9, 5).row('spikeS', 4, 5).adv(18); // Coin 2
  b.box(3, 1, true).spikes(2, 7).orbPit('orbY').stairs(3).pit(3);
  b.put('tBg0', 0, 0).roof(9, 4).spikes(1, 5).spikes(1, 9).pillars(4).spikes(2, 7);
  b.put('padP', 0, 0).row('spike', 2, 2).adv(10);
  b.put('orbY', 3, 2).put('orbY', 6, 3).put('coin', 8, 6).row('spike', 1, 10).adv(18);        // Coin 3
  b.spikes(1, 7).box(3, 2).spikes(2, 7).stairs(2).spikes(1, 6).spikes(1, 6);
  b.save('level1.js');
})();

/* ==========================================================================
   LEVEL 2: Neon Tide (Normal). Adds the ship, the ball, flipped gravity,
   and speed changes.
   ========================================================================== */
(function () {
  const b = new Builder({
    id: 'level2', name: 'Neon Tide', author: 'Wildcard Studios', difficulty: 'Normal', stars: 5,
    speed: 1, mode: 'cube', bg: '#0d2a5c', blockColor: '#2fb8ff',
    song: { id: 'level2', bpm: 132, seed: 23, root: 43, scale: 'dorian' }
  });
  b.spikes(2, 7).box(3, 1, true).spikes(1, 6).pit(4).stairs(3).spikes(2, 7);
  b.padShelf('padY').orbPit('orbY').pillars(3);
  // Ship part 1
  b.put('tBg2', 0, 0).portal('pShip', 0, 2).adv(10);
  b.gates([2, 3, 4, 3, 2, 1], 5, 10);
  b.put('coin', -5, 7);                                                                     // Coin 1
  b.gates([3, 4, 5, 3], 4, 10, true);
  b.portal('pCube', 0, 1).adv(8);
  // Fast cube part
  b.portal('pSpeed2', 0, 1).adv(8).spikes(1, 9).spikes(2, 9).box(3, 1).spikes(1, 9).pit(4).spikes(2, 10);
  b.portal('pSpeed1', 0, 1).adv(7);
  // Upside down walk
  b.put('tBg3', 0, 0).portal('pGravUp', 0, 1, false).block(-2, 6, 46, 1, 'brick').row('thorn', 4, 34).adv(12);
  b.put('spike', 0, 5, 2).adv(8).put('spike', 0, 5, 2).put('spike', 1, 5, 2).adv(9);
  b.put('spike', 0, 5, 2).put('coin', 0, 2).adv(8);                                          // Coin 2
  b.portal('pGravDown', 0, 4).adv(12);
  // Ball part
  b.put('tBg4', 0, 0).portal('pBall', 0, 1).adv(4);
  b.tunnel('......FF.....CC......FF....CCC.....F.F....CC.....FFF......');
  b.portal('pCube', 0, 1).adv(8);
  b.spikes(1, 7).put('padB', 0, 0).block(1, 6, 14, 1, 'brick').row('spike', 3, 7).adv(9);
  b.put('padB', 0, 5, 2).adv(11);
  b.spikes(2, 7).orbPit('orbP').box(3, 1, true);
  // Ship part 2 (a bit quicker)
  b.put('tBg1', 0, 0).portal('pShip', 0, 2).adv(10);
  b.gates([3, 5, 3, 1, 3, 5], 4, 9, true);
  b.put('coin', -4, 1);                                                                     // Coin 3
  b.gates([2, 4], 4, 9);
  b.portal('pCube', 0, 1).adv(9);
  b.spikes(1, 7).spikes(2, 7).stairs(3).spikes(1, 7).spikes(3, 6);
  b.save('level2.js');
})();

/* ==========================================================================
   LEVEL 3: Comet Rush (Hard). Every mode, mini size, mirror, top speed.
   ========================================================================== */
(function () {
  const b = new Builder({
    id: 'level3', name: 'Comet Rush', author: 'Wildcard Studios', difficulty: 'Hard', stars: 8,
    speed: 1, mode: 'cube', bg: '#4a1259', blockColor: '#ff5ca8',
    song: { id: 'level3', bpm: 140, seed: 37, root: 41, scale: 'minor' }
  });
  b.spikes(2, 6).spikes(3, 7).box(2, 1, true).pit(4).orbPit('orbY').pillars(4);
  // UFO
  b.put('tBg6', 0, 0).portal('pUfo', 0, 1).adv(9);
  b.gates([1, 3, 4, 2, 1, 3], 5, 9, true);
  b.put('coin', -5, 8);                                                                     // Coin 1
  b.gates([2, 4, 2], 5, 9, true);
  // Wave
  b.put('tBg2', 0, 0).portal('pWave', 0, 4).adv(6);
  b.zigzag(triangle(70, 3.5, 6.5, 0.5, 5), 5);
  b.portal('pSpeed2', 0, 3, false).portal('pSpeed2', 0, 5, false).block(0, 0, 1, 2).block(0, 7, 1, 3).adv(1);
  b.zigzag(triangle(46, 3.5, 6.5, 0.5, 5), 5);
  // Robot
  b.put('tBg5', 0, 0).portal('pRobot', 0, 4).portal('pSpeed1', 2, 3).adv(12);
  b.spikes(2, 6).spikes(5, 7).box(3, 3).spikes(1, 5).spikes(4, 6);
  b.put('coin', 2, 4).spikes(5, 7);                                                         // Coin 2
  b.block(0, 0, 3, 2).row('spike', 3, 4).block(7, 0, 3, 3).adv(16);
  // Spider
  b.put('tBg3', 0, 0).portal('pSpider', 0, 1).adv(4);
  b.tunnel('.....FFF....CCC....FF...CCCC....FFF...CC...FFFF....CC....');
  // Mini cube, mirrored
  b.put('tBg4', 0, 0).portal('pCube', 0, 1).portal('pMini', 2, 1).portal('pMirrorOn', 4, 1).adv(12);
  b.spikes(1, 6).spikes(2, 6).smallSpikes(3, 6).box(2, 1, true).spikes(1, 5).spikes(2, 7);
  b.portal('pBig', 0, 1).portal('pMirrorOff', 2, 1).adv(9);
  // Ball at speed
  b.portal('pBall', 0, 1).portal('pSpeed2', 2, 1).adv(5);
  b.tunnel('.......FF.....CC.....FF.....CC......FFF.....CCC......');
  // Fast ship finale
  b.put('tBg0', 0, 0).portal('pShip', 0, 2).adv(11);
  b.gates([3, 5, 4, 2, 3, 5, 3], 4, 11, true);
  b.put('coin', -6, 1);                                                                     // Coin 3
  b.gates([1, 3], 4, 11, true);
  b.portal('pCube', 0, 1).portal('pSpeed3', 2, 1).adv(14);
  b.spikes(1, 12).spikes(2, 12).box(3, 1).spikes(1, 12).spikes(3, 8);
  b.save('level3.js');
})();
