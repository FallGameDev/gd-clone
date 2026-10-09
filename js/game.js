/* ==========================================================================
   game.js
   Runs a level: reads input, steps the physics, moves the camera, makes the
   particles and sounds, and draws each frame. It also handles practice mode
   checkpoints and the scrolling sky behind the menus.

   The loop has three states:
     "idle" : menus are showing, only the sky scrolls
     "play" : a level is running
     "off"  : the editor has the canvas, so this file draws nothing
   ========================================================================== */
(function (root) {
  'use strict';
  var PD = root.PD, R = PD.Render, A = PD.Audio;

  var canvas, ctx, W = 0, H = 0, dpr = 1, u = 40;     // u = pixels per block.
  var state = 'idle', paused = false;
  var level = null, sim = null, opts = {};
  var hold = false;                 // Is the jump button down right now?
  var last = 0, acc = 0, time = 0, frame = 0;
  var cam = { x: 0, y: -2 };
  var bg = { cur: '#1b1147', target: '#1b1147' }, blockColor = '#7c5cff';
  var parts = [], rings = [], trail = [], zips = [];
  var attempt = 0, totalJumps = 0, deadT = 0, winT = 0, finished = false;
  var shake = 0, flash = 0, mirrorAmt = 0, ceilAlpha = 0;
  var checkpoints = [], cpClock = 0;
  var lastPct = -1, icon = null;

  // Calm song used for practice mode and for the menus.
  var PRACTICE_SONG = { id: 'practice', bpm: 96, seed: 5, root: 48, scale: 'major' };
  var MENU_SONG = { id: 'menu', bpm: 104, seed: 9, root: 45, scale: 'dorian' };

  var G = PD.Game = {};

  function $(id) { return document.getElementById(id); }

  // ------------------------------------------------------------------------
  // Setup
  // ------------------------------------------------------------------------
  G.init = function (cv) {
    canvas = cv; ctx = canvas.getContext('2d');
    resize();
    root.addEventListener('resize', resize);

    // Mouse and touch: press anywhere on the game to jump.
    canvas.addEventListener('pointerdown', function (e) {
      if (state !== 'play' || paused) return;
      e.preventDefault(); A.unlock(); hold = true;
    });
    root.addEventListener('pointerup', function () { hold = false; });
    root.addEventListener('pointercancel', function () { hold = false; });
    root.addEventListener('blur', function () { hold = false; });
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    // Keyboard.
    root.addEventListener('keydown', function (e) {
      if (state !== 'play') return;
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault();
        if (!paused && !e.repeat) { A.unlock(); hold = true; }
      } else if (e.code === 'Escape' || e.code === 'KeyP') {
        if (!finished && opts.onPause) opts.onPause();
      } else if (e.code === 'KeyR') { if (!paused && !finished) G.restart(); }
      else if (e.code === 'KeyZ') G.addCheckpoint();
      else if (e.code === 'KeyX') G.removeCheckpoint();
    });
    root.addEventListener('keyup', function (e) {
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') hold = false;
    });

    last = performance.now();
    requestAnimationFrame(loop);
  };

  function resize() {
    dpr = Math.min(2, root.devicePixelRatio || 1);
    W = root.innerWidth; H = root.innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    // Show about 11 blocks top to bottom, but never fewer than 15 across.
    u = Math.min(H / 11, W / 15);
  }
  G.size = function () { return { W: W, H: H, dpr: dpr }; };

  // ------------------------------------------------------------------------
  // Starting and stopping
  // ------------------------------------------------------------------------
  /* Start a level.
     o.practice   : practice mode with checkpoints
     o.test       : played from the editor, so nothing is saved
     o.onPause    : called when the player asks to pause
     o.onComplete : called with the final stats when the level is beaten */
  G.start = function (data, o) {
    opts = o || {};
    level = PD.prepareLevel(data);
    sim = new PD.Sim(level);
    blockColor = data.blockColor || '#7c5cff';
    icon = PD.Save.icon();
    attempt = 0; totalJumps = 0; checkpoints = []; finished = false;
    paused = false; hold = false; state = 'play';
    $('hud').classList.remove('hidden');
    $('practice-bar').classList.toggle('hidden', !opts.practice);
    $('hud-mode').textContent = opts.practice ? 'PRACTICE' : (opts.test ? 'TEST' : '');
    if (opts.practice) A.playMusic(PRACTICE_SONG, { calm: true });
    beginAttempt();
  };

  function beginAttempt() {
    attempt++;
    var cp = opts.practice && checkpoints.length ? checkpoints[checkpoints.length - 1] : null;
    if (cp) { sim.setState(cp.state); bg.cur = bg.target = cp.bg; }
    else { sim.reset(); bg.cur = bg.target = level.data.bg || PD.BG_COLORS[0]; }
    // If the button is still held from the last try, do not count it as a new tap.
    sim.prevHold = hold;
    parts.length = 0; rings.length = 0; trail.length = 0; zips.length = 0;
    deadT = 0; winT = 0; cpClock = 0; shake = 0; acc = 0;
    mirrorAmt = sim.mirror ? 1 : 0;
    snapCamera();
    if (!opts.practice) A.playMusic(level.data.song);
    lastPct = -1;
  }

  G.restart = function () {
    if (state !== 'play') return;
    checkpoints = []; finished = false; paused = false;
    totalJumps += sim.jumps;
    beginAttempt();
  };

  G.pause = function () { if (state === 'play') { paused = true; hold = false; A.pause(); } };
  G.resume = function () { paused = false; last = performance.now(); A.resume(); };
  G.isPractice = function () { return !!opts.practice; };

  // Leave the level and go back to the scrolling menu sky.
  G.stop = function (silent) {
    state = 'idle'; paused = false; hold = false; level = null; sim = null;
    $('hud').classList.add('hidden');
    A.resume();
    if (!silent) G.menuMusic();
  };

  G.menuMusic = function () {
    if (!A.current || A.current.def !== MENU_SONG) A.playMusic(MENU_SONG, { calm: true });
  };

  // The editor borrows the canvas. "off" stops this file from drawing.
  G.setOff = function (off) { state = off ? 'off' : 'idle'; };
  G.canvas = function () { return canvas; };

  // ------------------------------------------------------------------------
  // Practice checkpoints
  // ------------------------------------------------------------------------
  G.addCheckpoint = function (quiet) {
    if (state !== 'play' || !opts.practice || !sim || sim.dead || sim.won) return;
    checkpoints.push({ state: sim.getState(), bg: bg.target });
    cpClock = 0;
    if (!quiet) A.sfx('check');
  };
  G.removeCheckpoint = function () {
    if (state !== 'play' || !opts.practice) return;
    checkpoints.pop();
    A.sfx('click');
  };

  // ------------------------------------------------------------------------
  // Main loop
  // ------------------------------------------------------------------------
  function loop(now) {
    requestAnimationFrame(loop);
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (state === 'off') return;
    time += dt; frame++;
    if (state === 'play' && !paused) update(dt);
    else if (state === 'idle') cam.x += dt * 3;
    draw(dt);
  }

  function update(dt) {
    // Fixed time steps keep the physics the same on fast and slow screens.
    acc += dt;
    while (acc >= PD.TICK) {
      acc -= PD.TICK;
      if (sim.dead || sim.won) break;
      sim.step(hold);
      if (sim.events.length) { for (var i = 0; i < sim.events.length; i++) onEvent(sim.events[i]); sim.events.length = 0; }
    }

    if (sim.dead) {
      deadT += dt;
      if (deadT > 0.85) beginAttempt();
    } else if (sim.won) {
      winT += dt;
      if (winT > 1.4 && !finished) finish();
    } else {
      spawnTrail(dt);
      // Practice mode drops a checkpoint for you every few seconds.
      if (opts.practice) {
        cpClock += dt;
        if (cpClock > 2.5 && (sim.grounded || sim.mode === 'ship' || sim.mode === 'ufo' || sim.mode === 'wave')) G.addCheckpoint(true);
      }
    }

    // Camera follows the player.
    var viewW = W / u, viewH = H / u;
    cam.x = sim.x - viewW * 0.3;
    cam.y += (cameraTargetY() - cam.y) * (1 - Math.exp(-dt * 6));

    // Smooth changes: sky color, mirror flip, tunnel ceiling fade.
    if (bg.cur !== bg.target) bg.cur = PD.mixColor(bg.cur, bg.target, Math.min(1, dt * 5));
    mirrorAmt += ((sim.mirror ? 1 : 0) - mirrorAmt) * Math.min(1, dt * 7);
    ceilAlpha += ((PD.CORRIDOR[sim.mode] ? 1 : 0) - ceilAlpha) * Math.min(1, dt * 6);
    shake = Math.max(0, shake - dt);
    flash = Math.max(0, flash - dt * 3);

    // Progress bar.
    var pct = percent();
    if (pct !== lastPct) {
      lastPct = pct;
      $('hud-fill').style.width = pct + '%';
      $('hud-pct').textContent = pct + '%';
    }
  }

  function percent() { return Math.floor(100 * PD.clamp(sim.x / level.length, 0, 1)); }

  function cameraTargetY() {
    var viewH = H / u;
    if (PD.CORRIDOR[sim.mode]) return PD.CEIL / 2 - viewH / 2;
    var groundCam = -Math.max(1.8, viewH * 0.2);
    return Math.max(groundCam, sim.y - viewH * 0.62);
  }
  function snapCamera() { cam.x = sim.x - (W / u) * 0.3; cam.y = cameraTargetY(); ceilAlpha = PD.CORRIDOR[sim.mode] ? 1 : 0; }

  // ------------------------------------------------------------------------
  // Reacting to things the physics reports
  // ------------------------------------------------------------------------
  function onEvent(e) {
    switch (e.type) {
      case 'jump': A.sfx('jump'); break;
      case 'land': burst(sim.x - 0.2, sim.y - sim.half() * sim.g, 4, '#ffffff', 2.5, 0.25); break;
      case 'pad':  A.sfx('pad'); rings.push({ x: e.a.x + 0.5, y: e.a.y + 0.5, t: 0, col: e.a.type.col }); break;
      case 'orb':  A.sfx('orb'); rings.push({ x: e.a.x + 0.5, y: e.a.y + 0.5, t: 0, col: e.a.type.col }); break;
      case 'portal': A.sfx('portal'); flash = 0.35; burst(sim.x, sim.y, 14, e.a.type.col, 7, 0.5); break;
      case 'coin': A.sfx('coin'); burst(e.a.x + 0.5, e.a.y + 0.5, 16, '#ffd23d', 6, 0.6); break;
      case 'zip':  zips.push({ x: sim.x, y0: e.a, y1: e.b, t: 0 }); A.sfx('jump'); break;
      case 'bg':   bg.target = e.a; break;
      case 'die':  onDeath(); break;
      case 'win':  onWin(); break;
    }
  }

  function onDeath() {
    A.sfx('die');
    if (!opts.practice) A.stopMusic();
    burst(sim.x, sim.y, 26, icon.c1, 9, 0.8);
    burst(sim.x, sim.y, 14, icon.c2, 6, 0.7);
    rings.push({ x: sim.x, y: sim.y, t: 0, col: '#ffffff' });
    shake = 0.3;
    if (!opts.test) {
      var pct = percent();
      var best = PD.Save.report(level.data.id, opts.practice ? 'practice' : 'normal', pct);
      if (best && pct > 0) toast('New best: ' + pct + '%');
    }
  }

  function onWin() {
    A.sfx('win');
    for (var i = 0; i < 6; i++) burst(sim.x + 2 + Math.random() * 6, 2 + Math.random() * 6, 18, PD.ICON_COLORS[i * 2], 8, 1.1);
    flash = 0.6;
  }

  function finish() {
    finished = true;
    A.stopMusic();
    var stats = {
      attempts: attempt, jumps: totalJumps + sim.jumps, time: sim.time,
      coins: sim.coins.slice(), coinCount: level.coinCount,
      practice: !!opts.practice, test: !!opts.test, level: level.data
    };
    if (!opts.test) PD.Save.report(level.data.id, opts.practice ? 'practice' : 'normal', 100, sim.coins);
    if (opts.onComplete) opts.onComplete(stats);
  }

  function toast(text) {
    var el = $('toast');
    el.textContent = text;
    el.classList.remove('show');
    void el.offsetWidth;            // Restart the CSS animation.
    el.classList.add('show');
  }
  G.toast = toast;

  // ------------------------------------------------------------------------
  // Particles
  // ------------------------------------------------------------------------
  function burst(x, y, n, col, speed, life) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.7);
      parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, life: life * (0.6 + Math.random() * 0.6),
                   size: 0.1 + Math.random() * 0.14, col: col, grav: 14 });
    }
  }

  var trailClock = 0;
  function spawnTrail(dt) {
    trailClock += dt;
    if (sim.mode === 'wave') {
      // The wave leaves a solid zigzag line behind it.
      trail.push(sim.x, sim.y);
      if (trail.length > 400) trail.splice(0, 2);
    } else if (trail.length) trail.length = 0;
    if (trailClock < 0.03) return;
    trailClock = 0;
    var half = sim.half();
    if (sim.mode === 'ship' || sim.mode === 'ufo') {
      parts.push({ x: sim.x - 0.6, y: sim.y - 0.2 * sim.g, vx: -3 - Math.random() * 2, vy: (Math.random() - 0.5) * 2,
                   t: 0, life: 0.35, size: 0.14, col: icon.c2, grav: 0 });
    } else if (sim.grounded && sim.mode !== 'wave') {
      parts.push({ x: sim.x - half, y: sim.y - half * sim.g, vx: -2 - Math.random() * 2, vy: (1 + Math.random() * 2) * sim.g,
                   t: 0, life: 0.3, size: 0.09, col: icon.c1, grav: 10 * sim.g });
    }
  }

  // ------------------------------------------------------------------------
  // Drawing
  // ------------------------------------------------------------------------
  function draw(dt) {
    var pulse = Math.pow(1 - A.beat(), 3) * (A.current ? 1 : 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Mirror portals flip the whole picture left to right.
    if (mirrorAmt > 0.002) {
      var sx = 1 - 2 * mirrorAmt;
      if (Math.abs(sx) < 0.03) sx = 0.03;
      ctx.translate(W / 2, 0); ctx.scale(sx, 1); ctx.translate(-W / 2, 0);
    }
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake * 40, (Math.random() - 0.5) * shake * 40);

    R.drawBackground(ctx, W, H, cam.x, bg.cur, time, pulse);

    // Switch to world units: 1 = one block, y points up.
    ctx.save();
    ctx.transform(u, 0, 0, -u, -cam.x * u, H + cam.y * u);
    var viewW = W / u, x0 = cam.x - 2, x1 = cam.x + viewW + 2;
    R.drawGround(ctx, x0, x1, bg.cur, blockColor, state === 'play' ? ceilAlpha : 0);

    if (state === 'play' && level) {
      var env = { blockColor: blockColor, time: time, editor: false };
      for (var c = Math.floor(x0) - 2; c <= Math.floor(x1) + 2; c++) {
        var list = level.cols.get(c);
        if (!list) continue;
        for (var i = 0; i < list.length; i++) {
          var o = list[i];
          if (o._f === frame) continue;         // Wide objects sit in many columns. Draw them once.
          o._f = frame;
          if (o.cat === 'coin' && sim.used.has(o.id)) continue;
          R.drawObject(ctx, o, env);
        }
      }
      drawFinish();
      drawCheckpoints();
      drawEffects(dt);
      if (!sim.dead) R.drawPlayer(ctx, sim, icon, time);
    }
    ctx.restore();

    // Screen space extras.
    if (state === 'play' && level && mirrorAmt < 0.01) {
      // "Attempt 3" floats in the world near the start, like a signpost.
      var tx = (7 - cam.x) * u, ty = H - (5 - cam.y) * u;
      if (tx > -300 && tx < W + 300 && checkpoints.length === 0) {
        ctx.font = '900 ' + Math.round(u * 0.9) + 'px ' + getComputedStyle(document.body).fontFamily;
        ctx.textAlign = 'center'; ctx.lineJoin = 'round';
        ctx.lineWidth = u * 0.22; ctx.strokeStyle = R.OUT; ctx.strokeText('Attempt ' + attempt, tx, ty);
        ctx.fillStyle = '#ffffff'; ctx.fillText('Attempt ' + attempt, tx, ty);
      }
    }
    if (flash > 0) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = 'rgba(255,255,255,' + (flash * 0.5).toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }
  }

  // The finish line: a glowing checkered gate.
  function drawFinish() {
    var x = level.length;
    if (x < cam.x - 2 || x > cam.x + W / u + 2) return;
    for (var y = 0; y < 30; y++) {
      ctx.fillStyle = (y % 2) ? '#ffffff' : '#ffe14d';
      ctx.fillRect(x, y, 0.5, 1);
      ctx.fillStyle = (y % 2) ? '#ffe14d' : '#ffffff';
      ctx.fillRect(x + 0.5, y, 0.5, 1);
    }
    ctx.strokeStyle = R.OUT; ctx.lineWidth = 0.1; ctx.strokeRect(x, 0, 1, 30);
  }

  function drawCheckpoints() {
    for (var i = 0; i < checkpoints.length; i++) {
      var s = checkpoints[i].state;
      ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(Math.PI / 4);
      R.rr(ctx, -0.22, -0.22, 0.44, 0.44, 0.06);
      ctx.fillStyle = i === checkpoints.length - 1 ? '#5dff8f' : '#2a7a4a'; ctx.fill();
      ctx.lineWidth = 0.08; ctx.strokeStyle = R.OUT; ctx.stroke();
      ctx.restore();
    }
  }

  function drawEffects(dt) {
    var i, p;
    // Wave trail.
    if (trail.length > 3) {
      ctx.beginPath(); ctx.moveTo(trail[0], trail[1]);
      for (i = 2; i < trail.length; i += 2) ctx.lineTo(trail[i], trail[i + 1]);
      ctx.lineJoin = 'round';
      ctx.lineWidth = 0.34; ctx.strokeStyle = R.OUT; ctx.stroke();
      ctx.lineWidth = 0.18; ctx.strokeStyle = icon.c1; ctx.stroke();
    }
    // Spider zip lines.
    for (i = zips.length - 1; i >= 0; i--) {
      var z = zips[i]; z.t += dt;
      if (z.t > 0.18) { zips.splice(i, 1); continue; }
      ctx.globalAlpha = 1 - z.t / 0.18;
      ctx.lineWidth = 0.3; ctx.strokeStyle = icon.c2;
      ctx.beginPath(); ctx.moveTo(z.x, z.y0); ctx.lineTo(z.x, z.y1); ctx.stroke();
    }
    // Expanding rings from pads, orbs and crashes.
    for (i = rings.length - 1; i >= 0; i--) {
      var r = rings[i]; r.t += dt;
      if (r.t > 0.4) { rings.splice(i, 1); continue; }
      ctx.globalAlpha = 1 - r.t / 0.4;
      ctx.lineWidth = 0.14; ctx.strokeStyle = r.col;
      ctx.beginPath(); ctx.arc(r.x, r.y, 0.4 + r.t * 5, 0, Math.PI * 2); ctx.stroke();
    }
    // Square confetti particles.
    var live = !paused;
    for (i = parts.length - 1; i >= 0; i--) {
      p = parts[i];
      if (live) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy -= p.grav * dt; }
      if (p.t > p.life) { parts.splice(i, 1); continue; }
      ctx.globalAlpha = 1 - p.t / p.life;
      ctx.fillStyle = p.col;
      ctx.fillRect(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
    }
    ctx.globalAlpha = 1;
  }
})(typeof window !== 'undefined' ? window : globalThis);
