/* ==========================================================================
   ui.js
   All the menus: main menu, level select, icon picker, settings, the list of
   your own levels, the pause box and the level complete box.
   The menus are normal HTML on top of the game canvas.
   ========================================================================== */
(function (root) {
  'use strict';
  var PD = root.PD, A = PD.Audio, S = PD.Save, G = PD.Game, R = PD.Render;

  var SCREENS = ['menu', 'levels', 'icons', 'shop', 'settings', 'credits', 'custom', 'editor'];
  var current = 'menu';
  var levelIdx = 0;          // Which built-in level the carousel is showing.
  var playing = null;        // { data, practice, test, from } while a level runs.
  var kitMode = 'cube';      // Which game mode the icon kit and the shop are showing.

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
    if (name === 'shop') renderShop(true);
    if (name === 'settings') renderSettings();
    if (name === 'custom') renderCustom();
    if (name === 'credits') renderCredits();
  };

  // ------------------------------------------------------------------------
  // Main menu
  // ------------------------------------------------------------------------
  function renderMenu() {
    var t = S.totals(), box = $('menu-totals');
    box.textContent = '';
    var a = el('div', 'pill'); a.appendChild(el('span', 'dot star')); a.appendChild(el('span', '', t.stars + ' stars'));
    var b = el('div', 'pill'); b.appendChild(el('span', 'dot coin')); b.appendChild(el('span', '', t.coins + ' coins'));
    var c = el('div', 'pill'); c.appendChild(el('span', 'dot ball')); c.appendChild(el('span', '', S.balls() + (S.balls() === 1 ? ' ball' : ' balls')));
    box.appendChild(a); box.appendChild(b); box.appendChild(c);
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
    if (stats.balls > 0) line('Balls earned', '+' + stats.balls);
    if (stats.practice) line('Tip', 'Now try normal mode! Practice gives no balls.');
    var coins = $('cp-coins'); coins.textContent = '';
    for (var i = 0; i < stats.coinCount; i++) coins.appendChild(el('span', 'dot ' + (stats.coins.indexOf(i) >= 0 ? 'coin' : 'empty')));
    $('overlay-complete').classList.remove('hidden');
  }

  // ------------------------------------------------------------------------
  // Icon picker and shop
  // ------------------------------------------------------------------------
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // "12 balls" pill with a little blue ball, used on the icon kit and the shop.
  function ballPill(box) {
    box.textContent = '';
    box.appendChild(el('span', 'dot ball'));
    box.appendChild(el('span', '', S.balls() + (S.balls() === 1 ? ' ball' : ' balls')));
  }

  // One tab per game mode. Shows the icon you have picked for that mode.
  function modeTabs(box, icon, after) {
    box.textContent = '';
    PD.MODES.forEach(function (m) {
      var t = el('button', 'tile mode-tab' + (m === kitMode ? ' sel' : ''));
      t.appendChild(R.iconThumb(m, { design: icon.designs[m], c1: icon.c1, c2: icon.c2 }, 54));
      t.title = cap(m);
      t.setAttribute('aria-label', cap(m));
      t.onclick = function () { kitMode = m; after(); };
      box.appendChild(t);
    });
  }

  function renderIcons() {
    var save = S.get(), icon = S.icon();
    ballPill($('icon-balls'));
    modeTabs($('icon-preview'), icon, renderIcons);
    $('icon-title').textContent = cap(kitMode) + ' icon';

    // Only the icons you own for this mode show up here. The rest are in the shop.
    var grid = $('icon-designs'); grid.textContent = '';
    var missing = 0;
    for (var i = 0; i < PD.ICON_COUNT; i++) (function (i) {
      if (!S.iconOwned(kitMode, i)) { missing++; return; }
      var b = el('button', 'tile' + (icon.designs[kitMode] === i ? ' sel' : ''));
      b.appendChild(R.iconThumb(kitMode, { design: i, c1: icon.c1, c2: icon.c2 }, 52));
      b.setAttribute('aria-label', cap(kitMode) + ' icon ' + (i + 1));
      b.onclick = function () { S.setIconDesign(kitMode, i); renderIcons(); };
      grid.appendChild(b);
    })(i);
    $('icon-more').textContent = missing ? missing + ' more ' + kitMode + ' icon' + (missing > 1 ? 's' : '') + ' in the shop' : 'You own every ' + kitMode + ' icon!';

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

  // What the shopkeeper says in his speech bubble.
  var HELLO = ['Welcome! Spend your balls on new icons.', 'Hi there! Pick an icon you like.', 'Hey! Got some balls to spend?'];
  function say(text) { $('keeper-say').textContent = text; }

  // opening = true when the shop was just opened (so the shopkeeper says hello).
  function renderShop(opening) {
    var icon = S.icon();
    ballPill($('shop-balls'));
    modeTabs($('shop-modes'), icon, renderShop);
    $('shop-title').textContent = cap(kitMode) + ' icons for sale';
    if (opening) say(HELLO[Math.floor(Math.random() * HELLO.length)]);

    var grid = $('shop-grid'); grid.textContent = '';
    var forSale = 0;
    for (var i = 0; i < PD.ICON_COUNT; i++) (function (i) {
      if (S.iconOwned(kitMode, i)) return;               // Already yours, so it is not for sale.
      forSale++;
      var price = S.ICON_PRICES[i], rule = S.ICON_RULES[i];
      var afford = S.balls() >= price;
      var b = el('button', 'tile shop-tile' + (afford ? '' : ' poor'));
      b.appendChild(R.iconThumb(kitMode, { design: i, c1: icon.c1, c2: icon.c2 }, 52));
      var tag = el('span', 'price'); tag.appendChild(el('span', 'dot ball')); tag.appendChild(el('span', '', String(price)));
      b.appendChild(tag);
      // Some icons also unlock for free with stars or coins. Tell the player.
      b.title = rule ? 'Also unlocks free with ' + (rule.stars ? rule.stars + ' stars' : rule.coins + ' coins') : '';
      b.setAttribute('aria-label', cap(kitMode) + ' icon ' + (i + 1) + ', ' + price + ' balls');
      b.onclick = function () { askToBuy(i, price); };
      grid.appendChild(b);
    })(i);
    if (!forSale) {
      grid.appendChild(el('div', 'sub', 'Nothing left to buy here!'));
      if (!opening) say('You own every ' + kitMode + ' icon. Try another mode!');
    }
  }

  // Ask before spending. If you cannot afford it the shopkeeper tells you how many more you need.
  function askToBuy(i, price) {
    var icon = S.icon();
    if (S.balls() < price) {
      say('You need ' + (price - S.balls()) + ' more balls for that one.');
      return;
    }
    var body = el('div', 'buy-body');
    body.appendChild(R.iconThumb(kitMode, { design: i, c1: icon.c1, c2: icon.c2 }, 96));
    body.appendChild(el('div', 'sub', 'This ' + kitMode + ' icon costs ' + price + ' balls.'));
    UI.modal('Buy this icon?', body, [
      { text: 'Cancel', cls: 'blue' },
      { text: 'Buy', cls: 'green', fn: function () {
        var res = S.buyIcon(kitMode, i);
        if (res.ok) { S.setIconDesign(kitMode, i); say('Thanks! I put it on for you.'); }
        else say('Hmm, that did not work.');
        renderShop();
      } }
    ]);
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
  // Credits
  // ------------------------------------------------------------------------
  /* The list of who made what. Each entry is [role, name, optional note].
     Music credits for your own songs are added from audio/songs.js. */
  var CREDITS = [
    ['A game by', 'Wildcard Studios'],
    ['Game design and direction', 'FallGameDev'],
    ['Code, art and levels', 'Built with Claude', 'Every shape is drawn by code. There are no image files.'],
    ['Music', 'Made by code', 'A tiny synth band in js/audio.js writes each tune.'],
    ['Crash sound', 'Provided by FallGameDev'],
    ['Thanks to', 'The rhythm platformers that inspired this game'],
    ['And', 'You, for playing!']
  ];

  function renderCredits() {
    var card = $('credits-card');
    card.textContent = '';
    card.appendChild(el('div', 'name', PD.GAME_NAME));
    CREDITS.concat(PD.SONG_CREDITS || []).forEach(function (c) {
      card.appendChild(el('div', 'role', c[0]));
      card.appendChild(el('div', 'who', c[1]));
      if (c[2]) card.appendChild(el('div', 'note', c[2]));
    });
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
