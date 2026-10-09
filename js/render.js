/* ==========================================================================
   render.js
   All the drawing. Nothing here changes the game, it only paints it.

   World drawing uses a flipped canvas so that 1 unit = 1 block and y goes UP,
   the same as the physics. That means shapes can be drawn with the exact
   numbers the physics uses.

   Style guide ("chunky pop"): thick dark outlines, a hard drop shadow under
   everything solid, bright candy colors, and a night sky behind it all.
   ========================================================================== */
(function (root) {
  'use strict';
  var PD = root.PD;
  var OUT = '#0d0a26';          // Outline color used everywhere.
  var LW = 0.09;                // Outline thickness in blocks.
  var TAU = Math.PI * 2;

  var R = PD.Render = { OUT: OUT };

  // Path for a rectangle with rounded corners.
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
  R.rr = rr;

  // Fill and outline the current path in the chunky style.
  function ink(ctx, fill, lw) {
    ctx.fillStyle = fill; ctx.fill();
    ctx.lineWidth = lw || LW; ctx.strokeStyle = OUT; ctx.lineJoin = 'round'; ctx.stroke();
  }

  function poly(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (var i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.closePath();
  }

  // ------------------------------------------------------------------------
  // Background: sky, stars, moon and rolling hills. Drawn in screen pixels.
  // ------------------------------------------------------------------------
  var STARS = (function () {
    var r = PD.rng(1234), a = [];
    for (var i = 0; i < 110; i++) a.push({ x: r(), y: r() * 0.8, s: 0.6 + r() * 1.8, d: 0.2 + r() * 0.8, p: r() * TAU });
    return a;
  })();

  R.drawBackground = function (ctx, W, H, camX, bg, time, pulse) {
    var grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, PD.mixColor(bg, '#05030f', 0.55));
    grad.addColorStop(0.7, bg);
    grad.addColorStop(1, PD.mixColor(bg, '#ffffff', 0.12 + pulse * 0.08));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Twinkling stars. Far stars drift slower than near ones (parallax).
    for (var i = 0; i < STARS.length; i++) {
      var s = STARS[i];
      var x = (((s.x - camX * 0.004 * s.d) % 1) + 1) % 1 * W;
      var tw = 0.55 + 0.45 * Math.sin(time * 2 + s.p);
      ctx.globalAlpha = tw * (0.5 + s.d * 0.5);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(x, s.y * H, s.s * (1 + pulse * 0.4), 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // A big friendly moon with a chunky outline.
    var mx = W * 0.88, my = H * 0.17, mr = Math.min(W, H) * 0.065;
    ctx.beginPath(); ctx.arc(mx + mr * 0.12, my + mr * 0.12, mr, 0, TAU);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fill();
    ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU);
    ctx.fillStyle = '#fff3c4'; ctx.fill();
    ctx.lineWidth = Math.max(3, mr * 0.09); ctx.strokeStyle = OUT; ctx.stroke();
    ctx.fillStyle = 'rgba(214,190,120,0.7)';
    ctx.beginPath(); ctx.arc(mx - mr * 0.3, my - mr * 0.2, mr * 0.2, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(mx + mr * 0.3, my + mr * 0.3, mr * 0.13, 0, TAU); ctx.fill();

    // Two layers of hills.
    hills(ctx, W, H, camX * 6, H * 0.62, H * 0.10, PD.mixColor(bg, '#000000', 0.25), 0.0021);
    hills(ctx, W, H, camX * 12, H * 0.72, H * 0.08, PD.mixColor(bg, '#000000', 0.45), 0.0034);
  };

  function hills(ctx, W, H, off, base, amp, col, f) {
    ctx.beginPath(); ctx.moveTo(0, H);
    for (var x = 0; x <= W + 16; x += 16) {
      var k = (x + off) * f;
      ctx.lineTo(x, base - amp * (Math.sin(k * 3.1) * 0.6 + Math.sin(k * 7.3 + 1) * 0.4));
    }
    ctx.lineTo(W, H); ctx.closePath();
    ctx.fillStyle = col; ctx.fill();
  }

  // ------------------------------------------------------------------------
  // Ground and tunnel ceiling. Drawn in world units.
  // ------------------------------------------------------------------------
  R.drawGround = function (ctx, x0, x1, bg, accent, ceilAlpha) {
    var dark = PD.mixColor(bg, '#000000', 0.5), mid = PD.mixColor(bg, accent, 0.35);
    band(ctx, x0, x1, 0, -40, dark, mid, accent);
    if (ceilAlpha > 0.01) {
      ctx.globalAlpha = ceilAlpha;
      band(ctx, x0, x1, PD.CEIL, PD.CEIL + 40, dark, mid, accent);
      ctx.globalAlpha = 1;
    }
  };

  function band(ctx, x0, x1, edge, far, dark, mid, accent) {
    var dir = far < edge ? -1 : 1;
    ctx.fillStyle = dark;
    ctx.fillRect(x0, Math.min(edge, far), x1 - x0, Math.abs(far - edge));
    // A row of big chunky tiles right at the edge.
    ctx.fillStyle = mid;
    ctx.fillRect(x0, dir < 0 ? edge - 1.2 : edge, x1 - x0, 1.2);
    ctx.strokeStyle = OUT; ctx.lineWidth = 0.07;
    for (var x = Math.floor(x0 / 4) * 4; x < x1; x += 4) {
      ctx.beginPath(); ctx.moveTo(x, edge); ctx.lineTo(x, edge + dir * 1.2); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(x0, edge + dir * 1.2); ctx.lineTo(x1, edge + dir * 1.2); ctx.stroke();
    // The bright line you actually run on.
    ctx.fillStyle = OUT; ctx.fillRect(x0, edge - 0.12, x1 - x0, 0.24);
    ctx.fillStyle = accent; ctx.fillRect(x0, edge - 0.05, x1 - x0, 0.1);
  }

  // ------------------------------------------------------------------------
  // Level objects
  // ------------------------------------------------------------------------
  /* Draw one object. env = { blockColor, time, editor }.
     In the editor, triggers are shown as little labels. In play they are hidden. */
  R.drawObject = function (ctx, o, env) {
    var t = PD.TYPES[o.t], time = env.time || 0;
    if (!t) return;
    if (t.cat === 'solid' && (o.w > 1 || o.h > 1)) return drawBigBlock(ctx, o, env);
    ctx.save();
    ctx.translate(o.x + 0.5, o.y + 0.5);
    if (o.r) ctx.rotate(-o.r * Math.PI / 2);
    switch (t.cat) {
      case 'solid': drawBlock(ctx, o.t, env.blockColor); break;
      case 'hazard': drawHazard(ctx, o.t, t, time); break;
      case 'pad': drawPad(ctx, t, time); break;
      case 'orb': drawOrb(ctx, t, time); break;
      case 'portal': drawPortal(ctx, t, time); break;
      case 'coin': drawCoin(ctx, time); break;
      case 'deco': drawDeco(ctx, o.t, time, env.blockColor); break;
      case 'trigger': if (env.editor) drawTrigger(ctx, t); break;
    }
    ctx.restore();
  };

  function blockFill(id, col) { return id === 'brick' ? PD.mixColor(col, '#120a3a', 0.42) : col; }

  function drawBlock(ctx, id, col) {
    var y0 = id === 'slab' ? 0 : -0.5, h = id === 'slab' ? 0.5 : 1;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    rr(ctx, -0.5 + 0.12, y0 - 0.12, 1, h, 0.12); ctx.fill();
    rr(ctx, -0.5, y0, 1, h, 0.12); ink(ctx, blockFill(id, col));
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    rr(ctx, -0.38, y0 + h - 0.24, 0.76, 0.12, 0.06); ctx.fill();
  }

  // A platform made of many cells is drawn as one big shape with seams.
  function drawBigBlock(ctx, o, env) {
    var col = blockFill(o.t, env.blockColor);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    rr(ctx, o.x + 0.12, o.y - 0.12, o.w, o.h, 0.12); ctx.fill();
    rr(ctx, o.x, o.y, o.w, o.h, 0.12); ink(ctx, col);
    ctx.strokeStyle = 'rgba(13,10,38,0.35)'; ctx.lineWidth = 0.05;
    ctx.beginPath();
    for (var i = 1; i < o.w; i++) { ctx.moveTo(o.x + i, o.y + 0.08); ctx.lineTo(o.x + i, o.y + o.h - 0.08); }
    for (var j = 1; j < o.h; j++) { ctx.moveTo(o.x + 0.08, o.y + j); ctx.lineTo(o.x + o.w - 0.08, o.y + j); }
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    rr(ctx, o.x + 0.12, o.y + o.h - 0.24, o.w - 0.24, 0.12, 0.06); ctx.fill();
  }

  function drawHazard(ctx, id, t, time) {
    if (id === 'spike' || id === 'spikeS') {
      var top = id === 'spike' ? 0.44 : 0.0;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      poly(ctx, [-0.42 + 0.1, -0.5 - 0.06, 0.1, top - 0.1, 0.42 + 0.1, -0.5 - 0.06]); ctx.fill();
      poly(ctx, [-0.42, -0.5, 0, top, 0.42, -0.5]); ink(ctx, '#f6f2ff');
      poly(ctx, [-0.2, -0.42, 0, top - 0.35, 0.2, -0.42]); ctx.fillStyle = '#ff5ca8'; ctx.fill();
    } else if (id === 'thorn') {
      for (var i = -1; i <= 1; i++) {
        poly(ctx, [i * 0.3 - 0.16, -0.5, i * 0.3, -0.2, i * 0.3 + 0.16, -0.5]); ink(ctx, '#f6f2ff', 0.07);
      }
    } else {
      // Saw blade: a spinning gear with a face plate in the middle.
      var rad = t.draw, teeth = id === 'sawL' ? 14 : 10;
      ctx.rotate(-time * 5);
      ctx.beginPath();
      for (var k = 0; k < teeth * 2; k++) {
        var a = k / (teeth * 2) * TAU, rr2 = k % 2 ? rad : rad * 0.74;
        ctx.lineTo(Math.cos(a) * rr2, Math.sin(a) * rr2);
      }
      ctx.closePath(); ink(ctx, '#e9e6ff');
      ctx.beginPath(); ctx.arc(0, 0, rad * 0.42, 0, TAU); ink(ctx, '#ff5ca8');
      ctx.beginPath(); ctx.arc(0, 0, rad * 0.14, 0, TAU); ctx.fillStyle = OUT; ctx.fill();
    }
  }

  function drawPad(ctx, t, time) {
    var pulse = 0.5 + 0.5 * Math.sin(time * 8);
    ctx.globalAlpha = 0.35 + pulse * 0.3;
    ctx.fillStyle = t.col;
    ctx.beginPath(); ctx.ellipse(0, -0.3, 0.38, 0.22 + pulse * 0.08, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    rr(ctx, -0.42, -0.5, 0.84, 0.2, 0.1); ink(ctx, t.col);
  }

  function drawOrb(ctx, t, time) {
    var pulse = 0.5 + 0.5 * Math.sin(time * 6);
    ctx.lineWidth = 0.07; ctx.strokeStyle = t.col; ctx.globalAlpha = 0.75 - pulse * 0.4;
    ctx.beginPath(); ctx.arc(0, 0, 0.46 + pulse * 0.14, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(0.07, -0.07, 0.34, 0, TAU); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, 0.34, 0, TAU); ink(ctx, t.col);
    ctx.beginPath(); ctx.arc(-0.1, 0.12, 0.1, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fill();
  }

  function drawPortal(ctx, t, time) {
    // A tall glowing ring, 3 blocks high.
    var wob = Math.sin(time * 4) * 0.04;
    ctx.beginPath(); ctx.ellipse(0.08, -0.08, 0.5, 1.5, 0, 0, TAU);
    ctx.lineWidth = 0.34; ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, 0, 0.5, 1.5, 0, 0, TAU);
    ctx.lineWidth = 0.42; ctx.strokeStyle = OUT; ctx.stroke();
    ctx.lineWidth = 0.24; ctx.strokeStyle = t.col; ctx.stroke();
    ctx.globalAlpha = 0.22 + wob;
    ctx.fillStyle = t.col; ctx.fill();
    ctx.globalAlpha = 1;
    // A small sign inside so you can tell what the portal does.
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = OUT; ctx.lineWidth = 0.06;
    if (t.mode) {
      drawModeGlyph(ctx, t.mode);
    } else if (t.grav != null) {
      var d = t.grav < 0 ? 1 : -1;
      poly(ctx, [-0.22, -0.1 * d, 0, 0.3 * d, 0.22, -0.1 * d]); ink(ctx, '#ffffff', 0.06);
    } else if (t.speed != null) {
      for (var i = 0; i <= t.speed; i++) {
        var yy = (i - t.speed / 2) * 0.3;
        poly(ctx, [-0.14, yy - 0.12, 0.14, yy, -0.14, yy + 0.12]); ink(ctx, '#ffffff', 0.05);
      }
    } else if (t.mini != null) {
      var s = t.mini ? 0.12 : 0.24;
      rr(ctx, -s, -s, s * 2, s * 2, 0.04); ink(ctx, '#ffffff', 0.06);
    } else if (t.mirror != null) {
      poly(ctx, [-0.06, -0.2, -0.26, 0, -0.06, 0.2]); ink(ctx, '#ffffff', 0.05);
      poly(ctx, [0.06, -0.2, 0.26, 0, 0.06, 0.2]); ink(ctx, t.mirror ? '#ffffff' : '#8a88a8', 0.05);
    }
  }

  // Tiny picture of each game mode, used inside mode portals.
  function drawModeGlyph(ctx, mode) {
    if (mode === 'cube') { rr(ctx, -0.2, -0.2, 0.4, 0.4, 0.05); ink(ctx, '#ffffff', 0.06); }
    else if (mode === 'ship') { poly(ctx, [-0.26, -0.12, 0.28, 0, -0.26, 0.16]); ink(ctx, '#ffffff', 0.06); }
    else if (mode === 'ball') { ctx.beginPath(); ctx.arc(0, 0, 0.22, 0, TAU); ink(ctx, '#ffffff', 0.06); }
    else if (mode === 'ufo') { ctx.beginPath(); ctx.ellipse(0, -0.04, 0.28, 0.12, 0, 0, TAU); ink(ctx, '#ffffff', 0.06);
                               ctx.beginPath(); ctx.arc(0, 0.04, 0.14, 0, Math.PI); ink(ctx, '#ffffff', 0.06); }
    else if (mode === 'wave') { poly(ctx, [-0.26, -0.2, 0, 0.2, 0.26, -0.2, 0, -0.02]); ink(ctx, '#ffffff', 0.06); }
    else if (mode === 'robot') { rr(ctx, -0.16, -0.02, 0.32, 0.26, 0.04); ink(ctx, '#ffffff', 0.06);
                                 ctx.fillRect(-0.16, -0.26, 0.1, 0.2); ctx.fillRect(0.06, -0.26, 0.1, 0.2); }
    else if (mode === 'spider') { ctx.beginPath(); ctx.arc(0, 0, 0.14, 0, TAU); ink(ctx, '#ffffff', 0.06);
      ctx.beginPath();
      for (var i = 0; i < 4; i++) { var a = (i < 2 ? 0.5 : -0.5) + (i % 2 ? Math.PI - 1 : 0) + (i % 2 ? 0 : 1) * 0;
        var sx = i % 2 ? -1 : 1, sy = i < 2 ? 1 : -1;
        ctx.moveTo(sx * 0.12, sy * 0.06); ctx.lineTo(sx * 0.3, sy * 0.22); }
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.06; ctx.stroke();
    }
  }

  function drawCoin(ctx, time) {
    var squash = Math.abs(Math.cos(time * 2.5));       // Makes the coin look like it spins.
    ctx.scale(0.25 + squash * 0.75, 1);
    ctx.beginPath(); ctx.arc(0.06, -0.06, 0.44, 0, TAU); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, 0.44, 0, TAU); ink(ctx, '#ffd23d');
    star(ctx, 0, 0, 0.26, 0.11); ctx.fillStyle = '#fff6c9'; ctx.fill();
  }

  function star(ctx, x, y, r1, r2) {
    ctx.beginPath();
    for (var i = 0; i < 10; i++) {
      var a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? r2 : r1;
      ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
  }
  R.star = star;

  function drawDeco(ctx, id, time, col) {
    if (id === 'dStar') {
      var s = 0.8 + 0.2 * Math.sin(time * 3);
      star(ctx, 0, 0, 0.42 * s, 0.18 * s); ink(ctx, '#fff3a0', 0.07);
    } else if (id === 'dGlow') {
      ctx.globalAlpha = 0.25 + 0.15 * Math.sin(time * 2);
      ctx.beginPath(); ctx.arc(0, 0, 0.9, 0, TAU); ctx.fillStyle = col; ctx.fill();
      ctx.globalAlpha = 0.8;
      ctx.beginPath(); ctx.arc(0, 0, 0.22, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.globalAlpha = 1;
    } else {
      poly(ctx, [-0.4, 0.16, 0.05, 0.16, 0.05, 0.36, 0.44, 0, 0.05, -0.36, 0.05, -0.16, -0.4, -0.16]);
      ink(ctx, '#ffe14d', 0.07);
    }
  }

  function drawTrigger(ctx, t) {
    rr(ctx, -0.4, -0.4, 0.8, 0.8, 0.2); ink(ctx, t.col, 0.07);
    ctx.beginPath(); ctx.arc(0, 0, 0.16, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 0.05;
    ctx.setLineDash([0.2, 0.2]);
    ctx.beginPath(); ctx.moveTo(-0.5, -40); ctx.lineTo(-0.5, 40); ctx.stroke();
    ctx.setLineDash([]);
  }

  // ------------------------------------------------------------------------
  // The player
  // ------------------------------------------------------------------------
  PD.ICON_COUNT = 10;
  PD.ICON_COLORS = ['#5dff8f', '#4dd2ff', '#ffe14d', '#ff6ad5', '#ff4d5e', '#ffa63d',
                    '#b06cff', '#f2f2ff', '#3dffd9', '#8dff3d', '#4d6bff', '#ff8fb3'];

  // The face on the cube. Each design is a few simple shapes.
  function drawFace(ctx, design, c2) {
    ctx.fillStyle = c2; ctx.strokeStyle = OUT; ctx.lineWidth = 0.06;
    function box(x, y, w, h) { rr(ctx, x, y, w, h, 0.04); ctx.fill(); ctx.stroke(); }
    switch (design) {
      case 0: box(-0.3, 0.02, 0.2, 0.24); box(0.1, 0.02, 0.2, 0.24); box(-0.26, -0.3, 0.52, 0.12); break;
      case 1: ctx.beginPath(); ctx.arc(0, 0.04, 0.24, 0, TAU); ctx.fill(); ctx.stroke();
              ctx.beginPath(); ctx.arc(0.05, 0.04, 0.09, 0, TAU); ctx.fillStyle = OUT; ctx.fill(); break;
      case 2: poly(ctx, [-0.34, 0.26, -0.08, 0.1, -0.08, -0.02, -0.34, 0.04]); ctx.fill(); ctx.stroke();
              poly(ctx, [0.34, 0.26, 0.08, 0.1, 0.08, -0.02, 0.34, 0.04]); ctx.fill(); ctx.stroke();
              box(-0.2, -0.32, 0.4, 0.1); break;
      case 3: box(-0.32, 0.0, 0.3, 0.3); box(0.02, -0.32, 0.3, 0.3); break;
      case 4: box(-0.1, -0.32, 0.2, 0.64); box(-0.32, -0.1, 0.64, 0.2); break;
      case 5: rr(ctx, -0.26, -0.26, 0.52, 0.52, 0.06); ctx.lineWidth = 0.18; ctx.strokeStyle = OUT; ctx.stroke();
              ctx.lineWidth = 0.08; ctx.strokeStyle = c2; ctx.stroke(); break;
      case 6: poly(ctx, [-0.36, -0.36, 0.36, 0.36, 0.36, -0.36]); ctx.fill(); ctx.stroke();
              box(-0.28, 0.08, 0.18, 0.18); break;
      case 7: star(ctx, 0, 0, 0.34, 0.15); ctx.fill(); ctx.stroke(); break;
      case 8: box(-0.3, 0.06, 0.6, 0.16);
              ctx.fillStyle = OUT; ctx.fillRect(-0.18, 0.1, 0.1, 0.08); ctx.fillRect(0.08, 0.1, 0.1, 0.08);
              ctx.fillStyle = c2; poly(ctx, [-0.24, -0.16, 0, -0.34, 0.24, -0.16]); ctx.fill(); ctx.stroke(); break;
      case 9: ctx.beginPath(); ctx.arc(-0.16, 0.1, 0.12, 0, TAU); ctx.fill(); ctx.stroke();
              ctx.beginPath(); ctx.arc(0.16, 0.1, 0.12, 0, TAU); ctx.fill(); ctx.stroke();
              ctx.beginPath(); ctx.arc(0, -0.1, 0.2, Math.PI, TAU); ctx.lineWidth = 0.1; ctx.strokeStyle = OUT; ctx.stroke(); break;
    }
  }

  function cubeBody(ctx, icon, size) {
    ctx.save(); ctx.scale(size, size);
    rr(ctx, -0.5, -0.5, 1, 1, 0.14); ink(ctx, icon.c1);
    ctx.fillStyle = 'rgba(255,255,255,0.28)'; rr(ctx, -0.38, 0.28, 0.76, 0.1, 0.05); ctx.fill();
    drawFace(ctx, icon.design, icon.c2);
    ctx.restore();
  }

  /* Draw the player.
     p    = { x, y, rot, mode, g, mini, vy, speed, grounded }
     icon = { design, c1, c2 } */
  R.drawPlayer = function (ctx, p, icon, time) {
    var s = p.mini ? 0.6 : 1;
    ctx.save();
    ctx.translate(p.x, p.y);
    var vx = PD.SPEEDS[p.speed == null ? 1 : p.speed];
    var tilt = Math.atan2(p.vy || 0, vx);
    switch (p.mode) {
      case 'cube':
        ctx.rotate(-p.rot * Math.PI / 180);
        if (p.g < 0) ctx.scale(1, -1);
        cubeBody(ctx, icon, s);
        break;
      case 'ship':
        ctx.rotate(tilt * 0.7); ctx.scale(s, s * p.g);
        // Flame
        poly(ctx, [-0.62, -0.3, -0.95 - Math.random() * 0.25, -0.2, -0.62, -0.08]); ink(ctx, '#ffa63d', 0.06);
        // Hull
        ctx.beginPath();
        ctx.moveTo(-0.62, -0.02); ctx.lineTo(0.42, -0.02); ctx.quadraticCurveTo(0.78, -0.1, 0.5, -0.36);
        ctx.quadraticCurveTo(0.2, -0.52, -0.5, -0.46); ctx.quadraticCurveTo(-0.72, -0.4, -0.62, -0.02);
        ctx.closePath(); ink(ctx, icon.c2);
        poly(ctx, [-0.62, -0.02, -0.78, 0.3, -0.36, -0.02]); ink(ctx, icon.c2);
        ctx.translate(-0.05, 0.24); cubeBody(ctx, icon, 0.52);
        break;
      case 'ball':
        ctx.rotate(-p.rot * Math.PI / 180); ctx.scale(s, s);
        ctx.beginPath(); ctx.arc(0, 0, 0.5, 0, TAU); ink(ctx, icon.c1);
        ctx.beginPath(); ctx.arc(0, 0, 0.3, 0, TAU); ink(ctx, icon.c2, 0.07);
        ctx.fillStyle = OUT; ctx.fillRect(-0.5, -0.05, 1, 0.1); ctx.fillRect(-0.05, -0.5, 0.1, 1);
        ctx.beginPath(); ctx.arc(0, 0, 0.12, 0, TAU); ctx.fillStyle = icon.c1; ctx.fill();
        break;
      case 'ufo':
        ctx.rotate(tilt * 0.25); ctx.scale(s, s * p.g);
        ctx.save(); ctx.translate(0, 0.14); cubeBody(ctx, icon, 0.5); ctx.restore();
        ctx.beginPath(); ctx.arc(0, 0, 0.44, 0, Math.PI); ctx.closePath();
        ctx.fillStyle = 'rgba(180,235,255,0.35)'; ctx.fill(); ctx.lineWidth = 0.07; ctx.strokeStyle = OUT; ctx.stroke();
        ctx.beginPath(); ctx.ellipse(0, -0.14, 0.62, 0.24, 0, 0, TAU); ink(ctx, icon.c2);
        for (var i = -1; i <= 1; i++) { ctx.beginPath(); ctx.arc(i * 0.3, -0.16, 0.07, 0, TAU); ctx.fillStyle = icon.c1; ctx.fill(); }
        break;
      case 'wave':
        ctx.rotate(tilt); ctx.scale(s, s);
        poly(ctx, [-0.45, -0.34, 0.5, 0, -0.45, 0.34, -0.22, 0]); ink(ctx, icon.c1);
        poly(ctx, [-0.2, -0.14, 0.2, 0, -0.2, 0.14]); ctx.fillStyle = icon.c2; ctx.fill();
        break;
      case 'robot':
        ctx.scale(s, s * p.g);
        var step = p.grounded ? Math.sin(time * 22) * 0.16 : 0.12;
        ctx.strokeStyle = OUT; ctx.lineWidth = 0.2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-0.18, -0.1); ctx.lineTo(-0.18 + step, -0.42);
        ctx.moveTo(0.18, -0.1); ctx.lineTo(0.18 - step, -0.42); ctx.stroke();
        ctx.strokeStyle = icon.c2; ctx.lineWidth = 0.1; ctx.stroke();
        ctx.translate(0, 0.14); cubeBody(ctx, icon, 0.72);
        break;
      case 'spider':
        ctx.scale(s, s * p.g);
        var w = Math.sin(time * 26) * 0.1;
        ctx.strokeStyle = OUT; ctx.lineWidth = 0.17; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath();
        for (var k = 0; k < 4; k++) {
          var sx = k < 2 ? -1 : 1, far = k % 2 ? 0.5 : 0.28, ww = (k % 2 ? w : -w);
          ctx.moveTo(sx * 0.15, -0.12); ctx.lineTo(sx * (far - 0.08), 0.1); ctx.lineTo(sx * far + ww, -0.44);
        }
        ctx.stroke(); ctx.strokeStyle = icon.c2; ctx.lineWidth = 0.08; ctx.stroke();
        ctx.translate(0, -0.08); ctx.scale(1, 0.75); cubeBody(ctx, icon, 0.66);
        break;
    }
    ctx.restore();
  };

  /* Make a small picture of something for a button.
     kind = an object type id, or a mode name with an icon for the icon picker. */
  R.thumb = function (size, drawFn, unitsWide) {
    var c = document.createElement('canvas'), dpr = Math.min(2, root.devicePixelRatio || 1);
    c.width = c.height = Math.round(size * dpr);
    c.style.width = c.style.height = size + 'px';
    var ctx = c.getContext('2d'), u = c.width / (unitsWide || 1.5);
    ctx.setTransform(u, 0, 0, -u, c.width / 2, c.height / 2);
    drawFn(ctx);
    return c;
  };

  R.objectThumb = function (id, size, blockColor) {
    var t = PD.TYPES[id];
    var wide = t.cat === 'portal' ? 3.6 : (id === 'sawL' ? 3.8 : (id === 'saw' ? 2.3 : 1.5));
    return R.thumb(size, function (ctx) {
      R.drawObject(ctx, { t: id, x: -0.5, y: -0.5, r: 0, w: 1, h: 1 }, { blockColor: blockColor, time: 0.3, editor: true });
    }, wide);
  };

  R.iconThumb = function (mode, icon, size) {
    return R.thumb(size, function (ctx) {
      R.drawPlayer(ctx, { x: 0, y: 0, rot: 0, mode: mode, g: 1, vy: 0, speed: 1, grounded: false }, icon, 0);
    }, mode === 'cube' ? 1.5 : 2.1);
  };
})(typeof window !== 'undefined' ? window : globalThis);
