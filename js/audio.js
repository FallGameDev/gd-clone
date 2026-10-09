/* ==========================================================================
   audio.js
   Sound effects and music, all made with the Web Audio API.

   Music is NOT a recording. A tiny "band" is built in code: a kick drum, a
   snare, a hi-hat, a bass and a lead synth. Each level gives the band a seed
   number, a tempo (bpm) and a musical scale, and the band writes its own
   tune from that. Same seed, same tune, every time.

   If audio/songs.js lists a file for a song id, that file plays instead.
   ========================================================================== */
(function (root) {
  'use strict';
  var PD = root.PD;

  var ctx = null, master, musicGain, sfxGain, noiseBuf;
  var vol = { music: 0.7, sfx: 0.8 };
  var song = null;            // The song that is playing right now (generated).
  var timer = null;           // The scheduler interval.
  var fileEl = null;          // <audio> element when a custom file is playing.
  var sfxFiles = {};          // Cache of custom sound effect elements.

  var SCALES = {
    minor:  [0, 2, 3, 5, 7, 8, 10],
    dorian: [0, 2, 3, 5, 7, 9, 10],
    major:  [0, 2, 4, 5, 7, 9, 11]
  };
  // Chord patterns, written as steps of the scale. One chord per bar.
  var PROGS = [[0, 5, 3, 4], [0, 3, 5, 4], [0, 2, 5, 4], [0, 5, 2, 3], [0, 4, 5, 3]];

  var A = PD.Audio = {};

  // Browsers only allow sound after the player clicks or presses a key.
  A.unlock = function () {
    if (!ctx) {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain(); master.connect(ctx.destination);
      musicGain = ctx.createGain(); musicGain.connect(master);
      sfxGain = ctx.createGain(); sfxGain.connect(master);
      // One second of static, reused for drums and crashes.
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      A.setVolume(vol.music, vol.sfx);
    }
    if (ctx.state === 'suspended') ctx.resume();
  };

  A.setVolume = function (music, sfx) {
    vol.music = music; vol.sfx = sfx;
    if (ctx) { musicGain.gain.value = music * 0.55; sfxGain.gain.value = sfx * 0.8; }
    if (fileEl) fileEl.volume = music;
  };

  A.pause = function () { if (ctx && ctx.state === 'running') ctx.suspend(); if (fileEl) fileEl.pause(); };
  A.resume = function () { if (ctx && ctx.state === 'suspended') ctx.resume(); if (fileEl) fileEl.play().catch(function () {}); };

  // ------------------------------------------------------------------------
  // Instruments. "t" is the exact time the note should start.
  // ------------------------------------------------------------------------
  function midiToHz(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  function tone(type, hz, t, dur, gain, dest, cutoff, slideTo) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(hz, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    if (cutoff) {
      var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff;
      o.connect(f); f.connect(g);
    } else o.connect(g);
    g.connect(dest);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(t, dur, gain, dest, type, freq) {
    var s = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    s.buffer = noiseBuf; f.type = type; f.frequency.value = freq;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }

  function kick(t, g)  { tone('sine', 150, t, 0.2, g, musicGain, 0, 42); }
  function snare(t, g) { noise(t, 0.14, g, musicGain, 'highpass', 1400); tone('triangle', 190, t, 0.08, g * 0.5, musicGain); }
  function hat(t, g)   { noise(t, 0.04, g, musicGain, 'highpass', 7500); }

  // ------------------------------------------------------------------------
  // The song writer
  // ------------------------------------------------------------------------
  function writeSong(def, calm) {
    var r = PD.rng(def.seed * 7919 + 13);
    var s = {
      def: def, calm: calm,
      stepDur: 60 / def.bpm / 4,               // One sixteenth note.
      scale: SCALES[def.scale] || SCALES.minor,
      prog: PROGS[Math.floor(r() * PROGS.length)],
      leadA: [], leadB: [], bass: [],
      step: 0, nextTime: 0, startTime: 0
    };
    // Two 16 step melodies. Each step is a chord tone (0 to 4) or a rest (-1).
    for (var i = 0; i < 16; i++) {
      var strong = i % 4 === 0;
      s.leadA.push(r() < (strong ? 0.95 : 0.55) ? Math.floor(r() * 4) : -1);
      s.leadB.push(r() < (strong ? 0.9 : 0.7) ? Math.floor(r() * 5) : -1);
      s.bass.push(i % 4 === 0 || (i % 2 === 0 && r() < 0.75) || r() < 0.15);
    }
    return s;
  }

  // Turn "step n of the scale, starting at the chord root" into a note number.
  function noteAt(s, chordDeg, tone, octave) {
    var chordTones = [0, 2, 4, 6, 7];             // Root, third, fifth, seventh, octave.
    var deg = chordDeg + chordTones[tone];
    var oct = Math.floor(deg / 7);
    return s.def.root + octave * 12 + oct * 12 + s.scale[deg % 7];
  }

  // Play everything that happens on one sixteenth note.
  function playStep(s, n, t) {
    var bar = Math.floor(n / 16), i = n % 16;
    var section = Math.floor(bar / 4) % 8;        // The tune changes every 4 bars.
    var chord = s.prog[bar % 4];
    var calm = s.calm;
    var drums = !calm && section !== 0 && section !== 4;
    var full = !calm && (section === 2 || section === 3 || section === 6 || section === 7);
    var useB = section >= 4;

    if (calm) {
      if (i === 0) kick(t, 0.5);
      if (i % 4 === 2) hat(t, 0.08);
    } else {
      if (drums && i % 4 === 0) kick(t, 0.9);
      if (section === 5 && bar % 4 === 3 && i >= 8) snare(t, 0.25 + (i - 8) * 0.03);   // Drum roll.
      else if (full && i % 8 === 4) snare(t, 0.4);
      if (i % 2 === 0 || (full && i % 4 === 3)) hat(t, i % 4 === 2 ? 0.16 : 0.08);
    }

    // Bass
    if ((drums || calm) && s.bass[i] && (!calm || i % 4 === 0)) {
      tone('sawtooth', midiToHz(noteAt(s, chord, 0, -1)), t, s.stepDur * (calm ? 3.5 : 1.7), 0.3, musicGain, calm ? 320 : 520);
    }
    // Lead melody
    var pat = useB ? s.leadB : s.leadA, toneIdx = pat[i];
    if (toneIdx >= 0 && (!calm || i % 2 === 0)) {
      var hz = midiToHz(noteAt(s, chord, toneIdx, section >= 6 ? 2 : 1));
      tone(calm ? 'triangle' : 'square', hz, t, s.stepDur * (calm ? 2.6 : 0.95), calm ? 0.16 : 0.1, musicGain, calm ? 1800 : 2600);
      if (!calm) tone('sawtooth', hz * 1.006, t, s.stepDur * 0.9, 0.05, musicGain, 2200);
    }
    // Soft chord pad at the start of each bar.
    if (i === 0 && (calm || section === 0 || section === 4 || full)) {
      for (var k = 0; k < 3; k++) {
        tone('triangle', midiToHz(noteAt(s, chord, k, 1)), t, s.stepDur * 15, 0.045, musicGain, 1400);
      }
    }
  }

  // Runs many times a second and queues up the notes that are about to play.
  function schedule() {
    if (!song || !ctx) return;
    while (song.nextTime < ctx.currentTime + 0.14) {
      playStep(song, song.step, Math.max(song.nextTime, ctx.currentTime));
      song.step++;
      song.nextTime += song.stepDur;
    }
  }

  /* Start a song. def = { id, bpm, seed, root, scale }.
     opts.calm makes a soft version (used for practice mode and menus). */
  A.playMusic = function (def, opts) {
    A.stopMusic();
    if (!def) return;
    opts = opts || {};
    A.current = { def: def, started: (root.performance ? performance.now() : Date.now()) / 1000 };
    var file = PD.CUSTOM_SONGS && PD.CUSTOM_SONGS[opts.fileId || def.id];
    if (file) {
      fileEl = new Audio(file);
      fileEl.loop = true; fileEl.volume = vol.music;
      fileEl.play().catch(function () {});
      return;
    }
    if (!ctx) return;
    song = writeSong(def, !!opts.calm);
    song.nextTime = song.startTime = ctx.currentTime + 0.06;
    // Fade in so restarts do not click.
    musicGain.gain.cancelScheduledValues(ctx.currentTime);
    musicGain.gain.setValueAtTime(0.0001, ctx.currentTime);
    musicGain.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol.music * 0.55), ctx.currentTime + 0.08);
    timer = setInterval(schedule, 25);
    schedule();
  };

  A.stopMusic = function () {
    if (timer) { clearInterval(timer); timer = null; }
    song = null;
    if (fileEl) { fileEl.pause(); fileEl = null; }
    if (ctx) {
      // Quick fade so notes that are already queued do not ring on.
      musicGain.gain.cancelScheduledValues(ctx.currentTime);
      musicGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.03);
    }
    A.current = null;
  };

  /* How far through the current beat we are, from 0 to 1.
     The game uses this to make the background pulse in time. */
  A.beat = function () {
    if (!A.current) return 0;
    var t;
    if (song && ctx) t = ctx.currentTime - song.startTime;
    else if (fileEl) t = fileEl.currentTime;
    else t = (root.performance ? performance.now() : Date.now()) / 1000 - A.current.started;
    var b = t * A.current.def.bpm / 60;
    return b - Math.floor(b);
  };

  // ------------------------------------------------------------------------
  // Sound effects
  // ------------------------------------------------------------------------
  A.sfx = function (name) {
    // A custom file wins if one is listed in audio/songs.js.
    var file = PD.CUSTOM_SFX && PD.CUSTOM_SFX[name];
    if (file && sfxFiles[name] !== false) {
      try {
        if (!sfxFiles[name]) {
          sfxFiles[name] = new Audio(file);
          sfxFiles[name].addEventListener('error', function () { sfxFiles[name] = false; });
        }
        var el = sfxFiles[name].cloneNode();
        el.volume = PD.clamp(vol.sfx, 0, 1);
        el.play().catch(function () {});
        return;
      } catch (e) { sfxFiles[name] = false; }
    }
    if (!ctx) return;
    var t = ctx.currentTime;
    switch (name) {
      case 'jump':   tone('square', 320, t, 0.07, 0.05, sfxGain, 1800, 520); break;
      case 'orb':    tone('triangle', 520, t, 0.16, 0.3, sfxGain, 0, 1040); break;
      case 'pad':    tone('sine', 260, t, 0.22, 0.35, sfxGain, 0, 780); break;
      case 'portal': tone('sawtooth', 180, t, 0.3, 0.14, sfxGain, 1600, 900);
                     noise(t, 0.25, 0.12, sfxGain, 'bandpass', 1800); break;
      case 'coin':   tone('square', 988, t, 0.09, 0.14, sfxGain, 4000);
                     tone('square', 1319, t + 0.08, 0.22, 0.14, sfxGain, 4000); break;
      case 'die':    noise(t, 0.5, 0.7, sfxGain, 'lowpass', 1800);
                     tone('sawtooth', 220, t, 0.45, 0.35, sfxGain, 900, 40); break;
      case 'win':    [0, 4, 7, 12, 16].forEach(function (n, i) {
                       tone('square', midiToHz(69 + n), t + i * 0.09, 0.3, 0.14, sfxGain, 3200);
                     }); break;
      case 'click':  tone('square', 660, t, 0.05, 0.08, sfxGain, 2400); break;
      case 'check':  tone('triangle', 700, t, 0.1, 0.2, sfxGain, 0, 1100); break;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
