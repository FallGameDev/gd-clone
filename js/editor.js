/* ==========================================================================
   editor.js
   The level editor. Pick an object from the bar at the bottom, then click or
   drag on the grid to place it. Levels are saved in the browser and can be
   shared as text with Export and Import.

   Mouse:    left = use tool, right or middle drag = move the view, wheel = zoom
   Keys:     1 Build, 2 Erase, 3 Move, Q/E turn, arrows or WASD move the view,
             Ctrl+Z undo, Ctrl+Y redo
   ========================================================================== */
(function (root) {
  'use strict';
  var PD = root.PD, R = PD.Render, A = PD.Audio, S = PD.Save;

  var canvas, ctx;
  var active = false;                 // True while the editor is on screen.
  var lv = null;                      // The level being edited.
  var cam = { x: -3, y: -4 }, u = 40; // View position and zoom (pixels per block).
  var tool = 'build', selType = 'block', rot = 0, tab = 0;
  var undo = [], redo = [], dirty = false;
  var hover = null;                   // Grid cell under the mouse.
  var drag = null;                    // What the current mouse drag is doing.
  var time = 0, last = 0;

  // Only these objects look different when turned.
  var CAN_TURN = { slab: 1, spike: 1, spikeS: 1, thorn: 1, padY: 1, padP: 1, padR: 1, padB: 1, dArrow: 1 };
  var BLOCK_COLORS = ['#7c5cff', '#2fb8ff', '#ff5ca8', '#5dff8f', '#ffa63d', '#ff4d5e', '#3dffd9', '#b9b1e6'];

  var E = PD.Editor = {};
  function $(id) { return document.getElementById(id); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // ------------------------------------------------------------------------
  // Opening and closing
  // ------------------------------------------------------------------------
  E.open = function (level) {
    lv = clone(level);
    undo = []; redo = []; dirty = false; rot = 0;
    var s = PD.Game.size();
    u = PD.clamp(Math.min(s.H / 16, s.W / 22), 18, 46);
    cam.x = -3; cam.y = -(170 / u);
    $('ed-name').value = lv.name;
    E.resume();
  };

  // Come back to the editor (also used after a test play).
  E.resume = function () {
    PD.Game.setOff(true);
    A.stopMusic();
    PD.UI.show('editor');
    active = true;
    buildPalette();
    setTool(tool);
    last = performance.now();
    requestAnimationFrame(loop);
  };

  function close() {
    active = false;
    PD.Game.setOff(false);
    PD.Game.menuMusic();
    PD.UI.show('custom');
  }

  function save() {
    lv.name = ($('ed-name').value || 'My Level').slice(0, 24);
    S.saveCustom(clone(lv));
    dirty = false;
    PD.Game.toast('Saved!');
  }

  // ------------------------------------------------------------------------
  // Undo and redo. A snapshot of the object list is saved before each change.
  // ------------------------------------------------------------------------
  function snapshot() {
    undo.push(JSON.stringify(lv.objects));
    if (undo.length > 80) undo.shift();
    redo.length = 0; dirty = true;
  }
  function doUndo() { if (undo.length) { redo.push(JSON.stringify(lv.objects)); lv.objects = JSON.parse(undo.pop()); dirty = true; } }
  function doRedo() { if (redo.length) { undo.push(JSON.stringify(lv.objects)); lv.objects = JSON.parse(redo.pop()); dirty = true; } }

  // ------------------------------------------------------------------------
  // Placing and erasing
  // ------------------------------------------------------------------------
  // True when the object covers grid cell (cx, cy).
  function covers(o, cx, cy) {
    return cx >= o.x && cx < o.x + (o.w || 1) && cy >= o.y && cy < o.y + (o.h || 1);
  }

  function placeAt(cx, cy) {
    if (cx < 3 || cy < 0 || cy > 30) return;       // Keep the start area clear.
    var cat = PD.TYPES[selType].cat;
    // Only one object of each kind can live in a cell. A new one replaces the old one.
    lv.objects = lv.objects.filter(function (o) { return !(covers(o, cx, cy) && PD.TYPES[o.t].cat === cat); });
    var o = { t: selType, x: cx, y: cy };
    if (rot && CAN_TURN[selType]) o.r = rot;
    lv.objects.push(o);
  }

  function eraseAt(cx, cy) {
    for (var i = lv.objects.length - 1; i >= 0; i--) {
      if (covers(lv.objects[i], cx, cy)) { lv.objects.splice(i, 1); return; }
    }
  }

  function cellAt(e) {
    var s = PD.Game.size();
    return { x: Math.floor(cam.x + e.clientX / u), y: Math.floor(cam.y + (s.H - e.clientY) / u) };
  }

  function levelEnd() {
    var m = 0;
    lv.objects.forEach(function (o) { m = Math.max(m, o.x + (o.w || 1)); });
    return Math.max(30, m + 12);
  }

  // ------------------------------------------------------------------------
  // Toolbar and palette
  // ------------------------------------------------------------------------
  function setTool(t) {
    tool = t;
    document.querySelectorAll('.btn.tool').forEach(function (b) { b.classList.toggle('sel', b.getAttribute('data-tool') === t); });
    canvas.style.cursor = t === 'pan' ? 'grab' : 'crosshair';
  }

  function buildPalette() {
    var tabs = $('ed-tabs'), items = $('ed-items');
    tabs.textContent = ''; items.textContent = '';
    PD.PALETTE.forEach(function (group, i) {
      var b = PD.UI.el('button', 'tab' + (i === tab ? ' sel' : ''), group.name);
      b.onclick = function () { tab = i; buildPalette(); };
      tabs.appendChild(b);
    });
    PD.PALETTE[tab].items.forEach(function (id) {
      var b = PD.UI.el('button', 'tile' + (id === selType ? ' sel' : ''));
      b.title = PD.TYPES[id].name;
      b.setAttribute('aria-label', PD.TYPES[id].name);
      b.appendChild(R.objectThumb(id, 46, lv.blockColor));
      b.onclick = function () { selType = id; setTool('build'); buildPalette(); };
      items.appendChild(b);
    });
  }

  // ------------------------------------------------------------------------
  // Pop-up boxes: level setup and export
  // ------------------------------------------------------------------------
  function swatchRow(colors, get, set) {
    var row = PD.UI.el('div', 'grid swatches');
    function paint() {
      row.textContent = '';
      colors.forEach(function (c) {
        var b = PD.UI.el('button', 'tile' + (get() === c ? ' sel' : ''));
        b.style.background = c;
        b.setAttribute('aria-label', 'Color ' + c);
        b.onclick = function () { set(c); dirty = true; paint(); };
        row.appendChild(b);
      });
    }
    paint();
    return row;
  }

  function select(options, value, onChange) {
    var s = document.createElement('select');
    options.forEach(function (o) {
      var op = document.createElement('option');
      op.value = o[0]; op.textContent = o[1];
      if (String(o[0]) === String(value)) op.selected = true;
      s.appendChild(op);
    });
    s.onchange = function () { onChange(s.value); dirty = true; };
    return s;
  }

  function openSetup() {
    var f = PD.UI.el('div', 'form');
    function add(label, control) { f.appendChild(PD.UI.el('span', '', label)); f.appendChild(control); }
    add('Start as', select(PD.MODES.map(function (m) { return [m, m[0].toUpperCase() + m.slice(1)]; }), lv.mode, function (v) { lv.mode = v; }));
    add('Start speed', select([[0, 'Slow'], [1, 'Normal'], [2, 'Fast'], [3, 'Faster'], [4, 'Fastest']], lv.speed, function (v) { lv.speed = +v; }));
    add('Start size', select([['big', 'Normal'], ['mini', 'Mini']], lv.mini ? 'mini' : 'big', function (v) { lv.mini = v === 'mini'; }));
    add('Sky color', swatchRow(PD.BG_COLORS, function () { return lv.bg; }, function (c) { lv.bg = c; }));
    add('Block color', swatchRow(BLOCK_COLORS, function () { return lv.blockColor; }, function (c) { lv.blockColor = c; buildPalette(); }));

    var bpm = document.createElement('input');
    bpm.type = 'range'; bpm.min = 80; bpm.max = 180; bpm.step = 1; bpm.value = lv.song.bpm;
    var bpmLabel = PD.UI.el('span', '', 'Music speed: ' + lv.song.bpm);
    bpm.oninput = function () { lv.song.bpm = +bpm.value; bpmLabel.textContent = 'Music speed: ' + bpm.value; dirty = true; };
    f.appendChild(bpmLabel); f.appendChild(bpm);

    var tune = document.createElement('input');
    tune.type = 'number'; tune.min = 1; tune.max = 99; tune.value = lv.song.seed; tune.className = 'text';
    tune.oninput = function () { lv.song.seed = PD.clamp(Math.round(+tune.value) || 1, 1, 99); dirty = true; };
    add('Tune number', tune);
    add('Mood', select([['minor', 'Dark'], ['dorian', 'Cool'], ['major', 'Bright']], lv.song.scale, function (v) { lv.song.scale = v; }));

    PD.UI.modal('Level Setup', f, [
      { text: 'Hear the music', cls: 'blue', fn: function () { A.unlock(); A.playMusic(lv.song); return false; } },
      { text: 'Done', cls: 'green', fn: function () { A.stopMusic(); } }
    ]);
  }

  function openExport() {
    lv.name = ($('ed-name').value || 'My Level').slice(0, 24);
    var ta = document.createElement('textarea');
    ta.readOnly = true; ta.value = JSON.stringify(lv);
    PD.UI.modal('Export: copy this code', ta, [
      { text: 'Copy', cls: 'blue', fn: function () {
        ta.select();
        if (navigator.clipboard) navigator.clipboard.writeText(ta.value).then(function () { PD.Game.toast('Copied!'); }, function () {});
        return false;
      } },
      { text: 'Done', cls: 'green' }
    ]);
  }

  // ------------------------------------------------------------------------
  // Drawing the editor view
  // ------------------------------------------------------------------------
  function loop(now) {
    if (!active) return;
    requestAnimationFrame(loop);
    time += Math.min(0.05, (now - last) / 1000); last = now;
    draw();
  }

  function draw() {
    var s = PD.Game.size(), W = s.W, H = s.H, dpr = s.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    R.drawBackground(ctx, W, H, cam.x, lv.bg, time, 0);
    ctx.save();
    ctx.transform(u, 0, 0, -u, -cam.x * u, H + cam.y * u);
    var x0 = cam.x - 1, x1 = cam.x + W / u + 1, y0 = cam.y, y1 = cam.y + H / u;
    R.drawGround(ctx, x0, x1, lv.bg, lv.blockColor, 0);

    // Grid lines. Every tenth line is brighter so distances are easy to count.
    var x, y;
    for (x = Math.floor(x0); x <= x1; x++) {
      ctx.strokeStyle = x % 10 === 0 ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.09)';
      ctx.lineWidth = 0.03;
      ctx.beginPath(); ctx.moveTo(x, Math.max(0, y0)); ctx.lineTo(x, y1); ctx.stroke();
    }
    for (y = Math.max(0, Math.floor(y0)); y <= y1; y++) {
      ctx.strokeStyle = y === PD.CEIL ? 'rgba(77,210,255,0.8)' : 'rgba(255,255,255,0.09)';
      ctx.lineWidth = y === PD.CEIL ? 0.07 : 0.03;
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
    }

    // Objects.
    var env = { blockColor: lv.blockColor, time: time, editor: true };
    for (var i = 0; i < lv.objects.length; i++) {
      var o = lv.objects[i];
      if (o.x + (o.w || 1) < x0 - 2 || o.x > x1 + 2) continue;
      R.drawObject(ctx, { t: o.t, x: o.x, y: o.y, r: o.r || 0, w: o.w || 1, h: o.h || 1 }, env);
    }

    // Start and finish markers.
    R.drawPlayer(ctx, { x: 0, y: lv.mini ? 0.3 : 0.5, rot: 0, mode: lv.mode, g: 1, mini: lv.mini, vy: 0, speed: lv.speed, grounded: true }, S.icon(), time);
    var end = levelEnd();
    ctx.fillStyle = 'rgba(255,225,77,0.55)'; ctx.fillRect(end, 0, 0.5, 30);

    // Ghost of what you are about to place.
    if (hover && !drag) {
      if (tool === 'build' && hover.x >= 3 && hover.y >= 0 && hover.y <= 30) {
        ctx.globalAlpha = 0.55;
        R.drawObject(ctx, { t: selType, x: hover.x, y: hover.y, r: CAN_TURN[selType] ? rot : 0, w: 1, h: 1 }, env);
        ctx.globalAlpha = 1;
      } else if (tool === 'erase') {
        ctx.strokeStyle = '#ff4d5e'; ctx.lineWidth = 0.1;
        ctx.strokeRect(hover.x + 0.05, hover.y + 0.05, 0.9, 0.9);
      }
    }
    ctx.restore();

    // Labels are drawn in normal screen space so the text is the right way up.
    ctx.font = '700 13px ' + getComputedStyle(document.body).fontFamily;
    ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center';
    ctx.fillText('START', (0 - cam.x) * u, H - (1.5 - cam.y) * u);
    ctx.fillText('FINISH', (end + 0.25 - cam.x) * u, H - (-0.6 - cam.y) * u);
    ctx.fillStyle = 'rgba(77,210,255,0.9)'; ctx.textAlign = 'left';
    ctx.fillText('tunnel ceiling (ship, ball, UFO, wave, spider)', 70, H - (PD.CEIL + 0.15 - cam.y) * u);

    var secs = end / PD.SPEEDS[lv.speed];
    $('ed-status').textContent = PD.TYPES[selType].name + '  •  ' + (hover ? 'x ' + hover.x + ', y ' + hover.y + '  •  ' : '') +
      lv.objects.length + ' objects  •  about ' + Math.round(secs) + ' s long';
  }

  // ------------------------------------------------------------------------
  // Input
  // ------------------------------------------------------------------------
  function useTool(c) {
    if (tool === 'build') placeAt(c.x, c.y); else eraseAt(c.x, c.y);
  }

  function zoom(factor, px, py) {
    var s = PD.Game.size();
    if (px == null) { px = s.W / 2; py = s.H / 2; }
    var wx = cam.x + px / u, wy = cam.y + (s.H - py) / u;     // World point under the cursor.
    u = PD.clamp(u * factor, 12, 84);
    cam.x = wx - px / u; cam.y = wy - (s.H - py) / u;         // Keep that point still.
  }

  E.init = function () {
    canvas = PD.Game.canvas(); ctx = canvas.getContext('2d');

    canvas.addEventListener('pointerdown', function (e) {
      if (!active) return;
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      var panning = tool === 'pan' || e.button === 1 || e.button === 2;
      if (panning) drag = { pan: true, x: e.clientX, y: e.clientY };
      else {
        var c = cellAt(e);
        snapshot();
        useTool(c);
        drag = { pan: false, cx: c.x, cy: c.y };
      }
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!active) return;
      hover = cellAt(e);
      if (!drag) return;
      if (drag.pan) {
        cam.x -= (e.clientX - drag.x) / u; cam.y += (e.clientY - drag.y) / u;
        drag.x = e.clientX; drag.y = e.clientY;
      } else if (hover.x !== drag.cx || hover.y !== drag.cy) {
        // Dragging paints (or erases) every cell the mouse passes over.
        useTool(hover); drag.cx = hover.x; drag.cy = hover.y;
      }
      cam.x = Math.max(-8, cam.x); cam.y = PD.clamp(cam.y, -12, 30);
    });
    function endDrag() { drag = null; }
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('pointerleave', function () { if (!drag) hover = null; });
    canvas.addEventListener('wheel', function (e) {
      if (!active) return;
      e.preventDefault();
      zoom(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX, e.clientY);
    }, { passive: false });

    root.addEventListener('keydown', function (e) {
      if (!active || !$('overlay-modal').classList.contains('hidden')) return;
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      var ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.code === 'KeyZ') { e.preventDefault(); if (e.shiftKey) doRedo(); else doUndo(); return; }
      if (ctrl && e.code === 'KeyY') { e.preventDefault(); doRedo(); return; }
      if (ctrl && e.code === 'KeyS') { e.preventDefault(); save(); return; }
      switch (e.code) {
        case 'Digit1': setTool('build'); break;
        case 'Digit2': setTool('erase'); break;
        case 'Digit3': setTool('pan'); break;
        case 'KeyQ': rot = (rot + 3) % 4; break;
        case 'KeyE': rot = (rot + 1) % 4; break;
        case 'ArrowLeft': case 'KeyA': cam.x = Math.max(-8, cam.x - 3); break;
        case 'ArrowRight': case 'KeyD': cam.x += 3; break;
        case 'ArrowUp': case 'KeyW': cam.y = Math.min(30, cam.y + 2); break;
        case 'ArrowDown': case 'KeyS': cam.y = Math.max(-12, cam.y - 2); break;
      }
    });

    // Toolbar buttons.
    document.querySelectorAll('.btn.tool').forEach(function (b) {
      b.onclick = function () { setTool(b.getAttribute('data-tool')); };
    });
    $('ed-rot').onclick = function () { rot = (rot + 1) % 4; };
    $('ed-zin').onclick = function () { zoom(1.2); };
    $('ed-zout').onclick = function () { zoom(1 / 1.2); };
    $('ed-undo').onclick = doUndo;
    $('ed-redo').onclick = doRedo;
    $('ed-settings').onclick = openSetup;
    $('ed-export').onclick = openExport;
    $('ed-save').onclick = save;
    $('ed-name').oninput = function () { dirty = true; };
    $('ed-test').onclick = function () {
      lv.name = ($('ed-name').value || 'My Level').slice(0, 24);
      active = false;
      PD.UI.playLevel(clone(lv), { test: true });
    };
    $('ed-back').onclick = function () {
      if (!dirty) return close();
      PD.UI.modal('Save your changes?', PD.UI.el('div', 'sub', 'You have changes that are not saved yet.'), [
        { text: 'Keep editing' },
        { text: 'Leave', cls: 'red', fn: close },
        { text: 'Save and leave', cls: 'green', fn: function () { save(); close(); } }
      ]);
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
