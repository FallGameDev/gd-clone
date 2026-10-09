/* ==========================================================================
   ui.js
   All the menus: main menu, level select, icon picker, settings, the list of
   your own levels, the pause box and the level complete box.
   The menus are normal HTML on top of the game canvas.
   ========================================================================== */
(function (root) {
  'use strict';
  var PD = root.PD, A = PD.Audio, S = PD.Save, G = PD.Game, R = PD.Render;

  var SCREENS = ['menu', 'levels', 'icons', 'settings', 'custom', 'editor'];
  var current = 'menu';
  var levelIdx = 0;          // Which built-in level the carousel is showing.
  var playing = null;        // { data, practice, test, from } while a level runs.

  var UI = PD.UI = {};

  function $(id) { return document.getElementById(id); }

  // Small helper to build an element: el('div', 'class names', 'text').
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  UI.el = el;

  // Show one screen and hide the rest. Pass null to hide them all.
  UI.show = function (name) {
    SCREENS.forEach(function (s) { $('screen-' + s).classList.toggle('hidden', s !== name); });
    current = name;
    if (name === 'menu') renderMenu();
    if (name === 'levels') renderLevelCard();
    if (name === 'icons') renderIcons();
    if (name === 'settings') renderSettings();
    if (name === 'custom') renderCustom();
  };

  // ------------------------------------------------------------------------
  // Main menu
  // ------------------------------------------------------------------------
  function renderMenu() {
    var t = S.totals(), box = $('menu-totals');
    box.textContent = '';
    var a = el('div', 'pill'); a.appendChild(el('span', 'dot star')); a.appendChild(el('span', '', t.stars + ' stars'));
    var b = el('div', 'pill'); b.appendChild(el('span', 'dot coin')); b.appendChild(el('span', '', t.coins + ' coins'));
    box.appendChild(a); box.appendChild(b);
  }

  // ------------------------------------------------------------------------
  // Level select
  // ------------------------------------------------------------------------
  function meter(label, pct, cls) {
    var wrap = document.createDocumentFragment();
    wrap.appendChild(el('div', 'meter-label', label));
    var m = el('div', 'meter ' + (cls || '')), fill = el('i'), txt = el('b', '', pct + '%');
    fill.style.width = pct + '%';
    m.appendChild(fill); m.appendChild(txt);
    wrap.appendChild(m);
    return wrap;
  }

  function renderLevelCard() {
    var lv = PD.LEVELS[levelIdx], p = S.level(lv.id), card = $('lv-card');
    card.textContent = '';
    card.appendChild(el('div', 'name', lv.name));
    card.appendChild(el('div', 'badge ' + lv.difficulty, lv.difficulty + '  •  ' + lv.stars + ' stars'));
    card.appendChild(meter('Normal mode', p.normal));
    card.appendChild(meter('Practice mode', p.practice, 'practice'));
    var coins = el('div', 'coins');
    for (var i = 0; i < 3; i++) coins.appendChild(el('span', 'dot ' + (p.coins.indexOf(i) >= 0 ? 'coin' : 'empty')));
    card.appendChild(coins);
    card.appendChild(el('div', 'sub', 'Attempts: ' + p.attempts + (p.done ? '   •   Completed!' : '')));
    var row = el('div', 'play-row');
    var play = el('button', 'btn big green', 'Play'), prac = el('button', 'btn big blue', 'Practice');
    play.onclick = function () { UI.playLevel(lv, { from: 'levels' }); };
    prac.onclick = function () { UI.playLevel(lv, { practice: true, from: 'levels' }); };
    row.appendChild(play); row.appendChild(prac);
    card.appendChild(row);
    card.style.borderColor = '';
    card.style.background = PD.mixColor(lv.bg, '#2a1f6b', 0.45);
  }

  function shiftLevel(d) {
    levelIdx = (levelIdx + d + PD.LEVELS.length) % PD.LEVELS.length;
    renderLevelCard();
  }

  // ------------------------------------------------------------------------
  // Playing a level
  // ------------------------------------------------------------------------
  /* Start a level. o = { practice, test, from }.
     "from" is the screen to go back to afterwards. */
  UI.playLevel = function (data, o) {
    o = o || {};
    playing = { data: data, practice: !!o.practice, test: !!o.test, from: o.from || 'levels' };
    UI.show(null);
    closeOverlays();
    A.unlock();
    G.setOff(false);
    if (!o.test) { S.level(data.id).attempts++; S.write(); }
    G.start(data, { practice: playing.practice, test: playing.test, onPause: openPause, onComplete: openComplete });
  };

  function closeOverlays() {
    ['pause', 'complete', 'modal'].forEach(function (n) { $('overlay-' + n).classList.add('hidden'); });
  }

  function openPause() {
    if (!playing || !$('overlay-pause').classList.contains('hidden')) return;
    G.pause();
    $('pause-info').textContent = playing.data.name + (playing.practice ? '  (practice)' : '');
    $('pz-mode').textContent = playing.practice ? 'Normal Mode' : 'Practice Mode';
    $('overlay-pause').classList.remove('hidden');
  }

  function exitLevel() {
    var p = playing; playing = null;
    closeOverlays();
    if (p && p.test) {
      G.stop(true);
      PD.Editor.resume();
    } else {
      G.stop();
      UI.show(p ? p.from : 'menu');
    }
  }

  function openComplete(stats) {
    $('cp-title').textContent = stats.practice ? 'Practice Complete!' : 'Level Complete!';
    var box = $('cp-stats'); box.textContent = '';
    function line(k, v) { box.appendChild(el('span', '', k)); box.appendChild(el('b', '', v)); }
    line('Attempts', stats.attempts);
    line('Jumps', stats.jumps);
    line('Time', stats.time.toFixed(1) + ' s');
    if (!stats.practice && !stats.test && stats.level.stars) line('Stars earned', '+' + stats.level.stars);
    if (stats.practice) line('Tip', 'Now try normal mode!');
    var coins = $('cp-coins'); coins.textContent = '';
    for (var i = 0; i < stats.coinCount; i++) coins.appendChild(el('span', 'dot ' + (stats.coins.indexOf(i) >= 0 ? 'coin' : 'empty')));
    $('overlay-complete').classList.remove('hidden');
  }

  // ------------------------------------------------------------------------
  // Icon picker
  // ------------------------------------------------------------------------
  function renderIcons() {
    var save = S.get(), icon = S.icon();
    var prev = $('icon-preview'); prev.textContent = '';
    PD.MODES.forEach(function (m) { prev.appendChild(R.iconThumb(m, icon, 74)); });

    var grid = $('icon-designs'); grid.textContent = '';
    for (var i = 0; i < PD.ICON_COUNT; i++) (function (i) {
      var open = S.iconUnlocked(i);
      var b = el('button', 'tile' + (save.icon.design === i ? ' sel' : '') + (open ? '' : ' locked'));
      b.appendChild(R.iconThumb('cube', { design: i, c1: icon.c1, c2: icon.c2 }, 52));
      if (!open) {
        var rule = S.ICON_RULES[i];
        b.appendChild(el('span', 'lock', rule.stars ? rule.stars + ' stars' : rule.coins + ' coins'));
        b.title = 'Locked';
      } else b.onclick = function () { save.icon.design = i; S.write(); renderIcons(); };
      b.setAttribute('aria-label', 'Face ' + (i + 1) + (open ? '' : ' (locked)'));
      grid.appendChild(b);
    })(i);

    ['c1', 'c2'].forEach(function (key) {
      var row = $('icon-' + key); row.textContent = '';
      PD.ICON_COLORS.forEach(function (col, i) {
        var b = el('button', 'tile' + (save.icon[key] === i ? ' sel' : ''));
        b.style.background = col;
        b.setAttribute('aria-label', 'Color ' + (i + 1));
        b.onclick = function () { save.icon[key] = i; S.write(); renderIcons(); };
        row.appendChild(b);
      });
    });
  }

  // ------------------------------------------------------------------------
  // Settings
  // ------------------------------------------------------------------------
  function renderSettings() {
    var st = S.get().settings;
    $('set-music').value = st.music;
    $('set-sfx').value = st.sfx;
  }

  // ------------------------------------------------------------------------
  // My levels (made in the editor)
  // ------------------------------------------------------------------------
  function renderCustom() {
    var list = $('cl-list'), levels = S.get().custom;
    list.textContent = '';
    if (!levels.length) { list.appendChild(el('div', 'empty', 'No levels yet. Press New Level to build your first one!')); return; }
    levels.forEach(function (lv) {
      var row = el('div', 'level-row'), name = el('div', 'grow', lv.name);
      name.appendChild(el('small', '', lv.objects.length + ' objects   •   best ' + S.level(lv.id).normal + '%'));
      var play = el('button', 'btn green', 'Play'), edit = el('button', 'btn blue', 'Edit'), del = el('button', 'btn red', 'Delete');
      play.onclick = function () { UI.playLevel(lv, { from: 'custom' }); };
      edit.onclick = function () { PD.Editor.open(lv); };
      del.onclick = function () {
        UI.modal('Delete "' + lv.name + '"?', el('div', 'sub', 'This cannot be undone.'), [
          { text: 'Cancel' },
          { text: 'Delete', cls: 'red', fn: function () { S.deleteCustom(lv.id); renderCustom(); } }
        ]);
      };
      row.appendChild(name); row.appendChild(play); row.appendChild(edit); row.appendChild(del);
      list.appendChild(row);
    });
  }

  function importLevel() {
    var ta = el('textarea'); ta.placeholder = 'Paste level code here';
    UI.modal('Import a Level', ta, [
      { text: 'Cancel' },
      { text: 'Import', cls: 'green', fn: function () {
        var lv = null;
        try { lv = PD.sanitizeLevel(JSON.parse(ta.value)); } catch (e) { lv = null; }
        if (!lv) { G.toast('That is not level code'); return false; }
        S.saveCustom(lv); renderCustom();
      } }
    ]);
  }

  /* A simple pop-up box. buttons = [{ text, cls, fn }].
     If fn returns false the box stays open. */
  UI.modal = function (title, body, buttons) {
    $('md-title').textContent = title;
    var b = $('md-body'); b.textContent = ''; b.appendChild(body);
    var row = $('md-buttons'); row.textContent = '';
    buttons.forEach(function (def) {
      var btn = el('button', 'btn ' + (def.cls || ''), def.text);
      btn.onclick = function () {
        if (def.fn && def.fn() === false) return;
        $('overlay-modal').classList.add('hidden');
      };
      row.appendChild(btn);
    });
    $('overlay-modal').classList.remove('hidden');
  };

  // ------------------------------------------------------------------------
  // Wiring up all the buttons (runs once at startup)
  // ------------------------------------------------------------------------
  UI.init = function () {
    // Every button clicks, and the first click also switches the sound on.
    document.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('button')) { A.unlock(); A.sfx('click'); }
    }, true);
    document.addEventListener('pointerdown', function () {
      A.unlock();
      if (!playing && current !== 'editor') G.menuMusic();
    });

    // Buttons with data-go="screen" simply switch screens.
    document.querySelectorAll('[data-go]').forEach(function (b) {
      b.addEventListener('click', function () { UI.show(b.getAttribute('data-go')); });
    });

    $('lv-prev').onclick = function () { shiftLevel(-1); };
    $('lv-next').onclick = function () { shiftLevel(1); };
    root.addEventListener('keydown', function (e) {
      if (current !== 'levels' || playing) return;
      if (e.code === 'ArrowLeft') shiftLevel(-1);
      if (e.code === 'ArrowRight') shiftLevel(1);
    });

    // HUD
    $('btn-pause').onclick = openPause;
    $('btn-cp-add').onclick = function () { G.addCheckpoint(); };
    $('btn-cp-del').onclick = function () { G.removeCheckpoint(); };

    // Pause box
    $('pz-resume').onclick = function () { $('overlay-pause').classList.add('hidden'); G.resume(); };
    $('pz-restart').onclick = function () { $('overlay-pause').classList.add('hidden'); G.resume(); G.restart(); };
    $('pz-mode').onclick = function () {
      var p = playing;
      G.resume();
      UI.playLevel(p.data, { practice: !p.practice, test: p.test, from: p.from });
    };
    $('pz-exit').onclick = exitLevel;
    root.addEventListener('keydown', function (e) {
      if (e.code === 'Escape' && playing && !$('overlay-pause').classList.contains('hidden') && !e.repeat) {
        e.stopImmediatePropagation();
        $('pz-resume').onclick();
      }
    }, true);

    // Level complete box
    $('cp-retry').onclick = function () { var p = playing; UI.playLevel(p.data, { practice: p.practice, test: p.test, from: p.from }); };
    $('cp-exit').onclick = exitLevel;

    // Settings
    function vols() {
      var st = S.get().settings;
      st.music = +$('set-music').value; st.sfx = +$('set-sfx').value;
      A.setVolume(st.music, st.sfx); S.write();
    }
    $('set-music').oninput = vols;
    $('set-sfx').oninput = function () { vols(); };
    $('set-sfx').onchange = function () { A.sfx('orb'); };
    $('set-reset').onclick = function () {
      UI.modal('Erase everything?', el('div', 'sub', 'Your progress, icons and your own levels will be deleted.'), [
        { text: 'Cancel' },
        { text: 'Erase', cls: 'red', fn: function () { S.reset(); renderSettings(); A.setVolume(0.7, 0.8); } }
      ]);
    };

    // My levels
    $('cl-new').onclick = function () { PD.Editor.open(PD.blankLevel()); };
    $('cl-import').onclick = importLevel;

    // Pause automatically if the player switches tabs mid-level.
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && playing && $('overlay-complete').classList.contains('hidden')) openPause();
    });
  };
})(typeof window !== 'undefined' ? window : globalThis);
