/* ==========================================================================
   player.js
   The physics "simulation". It knows nothing about drawing or sound.
   Each call to step() moves the player forward by 1/240 of a second and
   checks what it touched. Because it has no drawing code, the same file is
   used by the game, by practice checkpoints, and by the test bot in /tools.

   Coordinates: 1 unit = 1 block. x grows to the right, y grows UP.
   The ground is at y = 0. The player's x and y are the CENTER of its body.
   Gravity "g" is 1 when falling down and -1 when flipped.
   ========================================================================== */
(function (root) {
  'use strict';
  var PD = root.PD;
  var DT = PD.TICK;

  // Tuning numbers for every mode. Change these to change how the game feels.
  var PHYS = PD.PHYS = {
    cube:   { grav: 88, jump: 19.6, miniJump: 15.6, maxFall: 26 },
    robot:  { grav: 88, jump: 10.5, boost: 0.28, maxFall: 26 },
    ship:   { up: 32, down: 26, maxUp: 11, maxDown: 11.5 },
    ufo:    { grav: 50, jump: 12.5, maxFall: 14 },
    ball:   { grav: 55, kick: 6, maxFall: 17 },
    spider: { grav: 88, maxFall: 26 },
    wave:   { }
  };

  function Sim(level, opts) {
    this.level = level;                 // A prepared level (see level.js).
    this.opts = opts || {};
    this.events = [];                   // Things that happened this step (for sound and effects).
    this.hazPad = this.opts.hazPad || 0; // The test bot makes hazards a bit bigger to be safe.
    this.reset();
  }

  // Put the player back at the start of the level.
  Sim.prototype.reset = function () {
    var d = this.level.data;
    this.mode = d.mode || 'cube';
    this.speed = d.speed == null ? 1 : d.speed;
    this.mini = !!d.mini;
    this.g = 1;
    this.mirror = false;
    this.x = 0;
    this.y = this.half();
    this.vy = 0;
    this.grounded = true;
    this.dead = false;
    this.won = false;
    this.rot = 0;                       // Spin angle in degrees, only for looks.
    this.boost = 0;                     // Robot: time left that holding still lifts you.
    this.prevHold = false;
    this.buffer = false;                // True after a fresh tap until something uses it.
    this.used = new Set();              // Ids of pads, orbs and portals already triggered.
    this.coins = [];                    // Coin numbers collected this attempt.
    this.jumps = 0;
    this.time = 0;
    this.events.length = 0;
  };

  // Half of the player's body size. Mini players are smaller.
  Sim.prototype.half = function () {
    if (this.mode === 'wave') return this.mini ? 0.14 : 0.22;
    return this.mini ? 0.3 : 0.5;
  };

  // Save and load the full state. Used by practice checkpoints and the bot.
  Sim.prototype.getState = function () {
    return {
      mode: this.mode, speed: this.speed, mini: this.mini, g: this.g, mirror: this.mirror,
      x: this.x, y: this.y, vy: this.vy, grounded: this.grounded, dead: this.dead,
      won: this.won, rot: this.rot, boost: this.boost, prevHold: this.prevHold,
      buffer: this.buffer, used: new Set(this.used), coins: this.coins.slice(),
      jumps: this.jumps, time: this.time
    };
  };
  Sim.prototype.setState = function (s) {
    for (var k in s) this[k] = s[k];
    this.used = new Set(s.used);
    this.coins = s.coins.slice();
    this.events.length = 0;
  };

  Sim.prototype.emit = function (type, a, b) {
    if (!this.opts.silent) this.events.push({ type: type, a: a, b: b });
  };

  Sim.prototype.die = function () {
    if (this.dead) return;
    this.dead = true;
    this.emit('die');
  };

  // Flip gravity and give a small push toward the new "down".
  Sim.prototype.flipGravity = function (to) {
    var ng = to == null ? -this.g : to;
    if (ng === this.g) return;
    this.g = ng;
    this.vy = -ng * 5;
    this.grounded = false;
  };

  // How strongly a pad or orb launches each mode.
  function launchScale(mode) {
    if (mode === 'ship' || mode === 'ufo') return 0.6;
    if (mode === 'ball') return 0.72;
    return 1;
  }

  /* Move the game forward by one tick.
     "hold" is true while the player is pressing the jump button. */
  Sim.prototype.step = function (hold) {
    if (this.dead || this.won) return;
    var mode = this.mode, P = PHYS[mode], g = this.g;

    // A fresh tap fills the buffer. Letting go empties it.
    if (hold && !this.prevHold) this.buffer = true;
    if (!hold) this.buffer = false;
    this.prevHold = hold;

    // ---------------- 1. Mode specific movement ----------------
    if (mode === 'cube') {
      if (this.grounded && hold) {
        this.vy = (this.mini ? P.miniJump : P.jump) * g;
        this.grounded = false; this.buffer = false; this.jumps++;
        this.emit('jump');
      }
      this.vy -= P.grav * g * DT;
      if (this.vy * g < -P.maxFall) this.vy = -P.maxFall * g;
    } else if (mode === 'robot') {
      if (this.grounded && hold) {
        this.vy = P.jump * g * (this.mini ? 0.85 : 1);
        this.boost = P.boost;
        this.grounded = false; this.buffer = false; this.jumps++;
        this.emit('jump');
      }
      if (!hold) this.boost = 0;
      // While boosting, gravity is switched off so a long hold goes higher.
      if (this.boost > 0) this.boost -= DT;
      else this.vy -= P.grav * g * DT;
      if (this.vy * g < -P.maxFall) this.vy = -P.maxFall * g;
    } else if (mode === 'ship') {
      var acc = hold ? P.up : -P.down;
      this.vy += acc * g * DT;
      var rel = this.vy * g;
      if (rel > P.maxUp) rel = P.maxUp;
      if (rel < -P.maxDown) rel = -P.maxDown;
      this.vy = rel * g;
    } else if (mode === 'ufo') {
      if (this.buffer) {
        this.vy = P.jump * g * (this.mini ? 0.85 : 1);
        this.buffer = false; this.grounded = false; this.jumps++;
        this.emit('jump');
      }
      this.vy -= P.grav * g * DT;
      if (this.vy * g < -P.maxFall) this.vy = -P.maxFall * g;
    } else if (mode === 'ball') {
      if (this.grounded && this.buffer) {
        this.buffer = false; this.jumps++;
        this.g = g = -g;
        this.vy = -g * P.kick;
        this.grounded = false;
        this.emit('jump');
      }
      this.vy -= P.grav * g * DT;
      if (this.vy * g < -P.maxFall) this.vy = -P.maxFall * g;
    } else if (mode === 'wave') {
      // The wave has no gravity. It goes diagonally up or diagonally down.
      var slope = this.mini ? 2 : 1;
      this.vy = (hold ? 1 : -1) * g * PD.SPEEDS[this.speed] * slope;
    } else if (mode === 'spider') {
      if (this.grounded && this.buffer) {
        this.buffer = false; this.jumps++;
        this.spiderZip();
        g = this.g;
      } else {
        this.vy -= P.grav * g * DT;
        if (this.vy * g < -P.maxFall) this.vy = -P.maxFall * g;
      }
    }

    // ---------------- 2. Move ----------------
    var velBefore = this.vy;
    this.x += PD.SPEEDS[this.speed] * DT;
    this.y += this.vy * DT;
    this.time += DT;
    var wasGrounded = this.grounded;
    this.grounded = false;
    var half = this.half();

    // ---------------- 3. World floor and tunnel ceiling ----------------
    if (this.y - half <= 0) {
      this.y = half;
      if (this.vy < 0) this.vy = 0;
      if (g === 1) this.grounded = true;
    }
    if (PD.CORRIDOR[mode]) {
      if (this.y + half >= PD.CEIL) {
        this.y = PD.CEIL - half;
        if (this.vy > 0) this.vy = 0;
        if (g === -1) this.grounded = true;
      }
    } else if (this.y > PD.KILL_HEIGHT) {
      this.die(); return;
    }

    // ---------------- 4. Objects near the player ----------------
    var cols = this.level.cols;
    var c0 = Math.floor(this.x - half - 0.01), c1 = Math.floor(this.x + half + 0.01);
    var tol = 0.3 + Math.abs(velBefore) * DT * 1.5;   // How deep we may sink and still "land".
    var both = PD.BOTH_SIDES[mode];
    for (var c = c0; c <= c1; c++) {
      var list = cols.get(c);
      if (!list) continue;
      for (var i = 0; i < list.length; i++) {
        var o = list[i], b = o.box;
        if (o.cat === 'deco') continue;
        if (c !== c0 && Math.floor(b.x0) < c) continue;   // Wide object, already handled in an earlier column.
        var px0 = this.x - half, px1 = this.x + half, py0 = this.y - half, py1 = this.y + half;
        if (o.cat === 'solid') {
          if (px1 <= b.x0 + 1e-6 || px0 >= b.x1 - 1e-6 || py1 <= b.y0 + 1e-6 || py0 >= b.y1 - 1e-6) continue;
          if (mode === 'wave') { this.die(); return; }   // The wave pops on any block.
          var penTop = b.y1 - py0;     // How far our feet are below the top of the block.
          var penBot = py1 - b.y0;     // How far our head is above the bottom of the block.
          if ((g === 1 || both) && velBefore <= 0.001 && penTop <= tol) {
            this.y = b.y1 + half; this.vy = 0;
            if (g === 1) this.grounded = true;
          } else if ((g === -1 || both) && velBefore >= -0.001 && penBot <= tol) {
            this.y = b.y0 - half; this.vy = 0;
            if (g === -1) this.grounded = true;
          } else {
            // Not a landing. If the middle of the body is inside the block, crash.
            var inn = (this.mini ? 0.1 : 0.16) + this.hazPad;
            if (this.x + inn > b.x0 && this.x - inn < b.x1 &&
                this.y + inn > b.y0 && this.y - inn < b.y1) { this.die(); return; }
          }
        } else if (o.cat === 'hazard') {
          var hp = this.hazPad;
          if (b.rad) {
            if (circleHitsBox(b.cx, b.cy, b.rad + hp, px0, py0, px1, py1)) { this.die(); return; }
          } else if (px1 > b.x0 - hp && px0 < b.x1 + hp && py1 > b.y0 - hp && py0 < b.y1 + hp) {
            this.die(); return;
          }
        } else if (o.cat === 'trigger') {
          if (this.x >= o.x && !this.used.has(o.id)) {
            this.used.add(o.id);
            this.emit('bg', o.type.bg);
          }
        } else if (!this.used.has(o.id)) {
          // Pads, orbs, portals and coins all work once per attempt.
          var hit = b.rad ? circleHitsBox(b.cx, b.cy, b.rad, px0, py0, px1, py1)
                          : (px1 > b.x0 && px0 < b.x1 && py1 > b.y0 && py0 < b.y1);
          if (!hit) continue;
          if (o.cat === 'pad') {
            this.used.add(o.id);
            this.touchPad(o);
          } else if (o.cat === 'orb') {
            if (this.buffer) { this.used.add(o.id); this.buffer = false; this.touchOrb(o); }
          } else if (o.cat === 'portal') {
            this.used.add(o.id);
            this.touchPortal(o);
          } else if (o.cat === 'coin') {
            this.used.add(o.id);
            this.coins.push(o.coinIndex);
            this.emit('coin', o);
          }
          g = this.g; mode = this.mode; half = this.half(); both = PD.BOTH_SIDES[mode];
        }
      }
    }

    // ---------------- 5. Spin, just for looks ----------------
    if (mode === 'cube') {
      if (this.grounded) {
        var target = Math.round(this.rot / 90) * 90;
        this.rot += (target - this.rot) * 0.35;
      } else this.rot += 415 * this.g * DT;
    } else if (mode === 'ball') {
      this.rot += 620 * this.g * DT;
    } else this.rot = 0;
    if (this.grounded && !wasGrounded) this.emit('land');

    // ---------------- 6. Finish line ----------------
    if (this.x >= this.level.length) { this.won = true; this.emit('win'); }
  };

  Sim.prototype.touchPad = function (o) {
    var t = o.type;
    if (t.flip) this.flipGravity();
    else if (this.mode !== 'wave') {
      this.vy = t.v * this.g * launchScale(this.mode);
      this.boost = 0;
    }
    this.grounded = false;
    this.emit('pad', o);
  };

  Sim.prototype.touchOrb = function (o) {
    var t = o.type;
    if (t.flip) this.flipGravity();
    if (t.v && this.mode !== 'wave') {
      this.vy = t.v * this.g * launchScale(this.mode);
      this.boost = 0;
    }
    this.grounded = false;
    this.jumps++;
    this.emit('orb', o);
  };

  Sim.prototype.touchPortal = function (o) {
    var t = o.type;
    if (t.mode && t.mode !== this.mode) {
      this.mode = t.mode;
      this.vy *= 0.5; this.rot = 0; this.boost = 0;
      // Entering a tunnel mode: make sure we start inside the tunnel.
      if (PD.CORRIDOR[this.mode]) this.y = PD.clamp(this.y, this.half(), PD.CEIL - this.half());
    }
    if (t.grav != null) this.flipGravity(t.grav);
    if (t.speed != null) this.speed = t.speed;
    if (t.mini != null) this.mini = t.mini;
    if (t.mirror != null) this.mirror = t.mirror;
    this.emit('portal', o);
  };

  /* Spider move: flip gravity, then zip in a straight line to the first
     surface in the new falling direction. */
  Sim.prototype.spiderZip = function () {
    var half = this.half(), from = this.y;
    this.g = -this.g;
    var dir = -this.g;                           // +1 means zip up, -1 means zip down.
    var target = dir < 0 ? half : PD.CEIL - half;
    var c0 = Math.floor(this.x - half), c1 = Math.floor(this.x + half);
    for (var c = c0; c <= c1; c++) {
      var list = this.level.cols.get(c);
      if (!list) continue;
      for (var i = 0; i < list.length; i++) {
        var o = list[i], b = o.box;
        if (o.cat !== 'solid') continue;
        if (this.x + half <= b.x0 || this.x - half >= b.x1) continue;
        if (dir > 0 && b.y0 >= from + half - 0.01) target = Math.min(target, b.y0 - half);
        if (dir < 0 && b.y1 <= from - half + 0.01) target = Math.max(target, b.y1 + half);
      }
    }
    this.y = target; this.vy = 0; this.grounded = true;
    this.emit('zip', from, target);
  };

  // True when a circle overlaps a box.
  function circleHitsBox(cx, cy, r, x0, y0, x1, y1) {
    var nx = cx < x0 ? x0 : (cx > x1 ? x1 : cx);
    var ny = cy < y0 ? y0 : (cy > y1 ? y1 : cy);
    var dx = cx - nx, dy = cy - ny;
    return dx * dx + dy * dy < r * r;
  }

  PD.Sim = Sim;
})(typeof window !== 'undefined' ? window : globalThis);
