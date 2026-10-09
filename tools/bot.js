/* ==========================================================================
   tools/bot.js   (run with:  node tools/bot.js)
   A test robot that proves every built-in level can be beaten.

   How it works: the bot plays the level and, every few ticks, chooses to hold
   or not hold the jump button. If a choice leads to a crash it rewinds and
   tries the other choice (this is called a "depth first search"). It also
   remembers situations that always end in a crash so it never repeats them.

   To keep levels fair for humans, the bot plays with every hazard made a bit
   BIGGER than it really is. If the bot can win like that, a person has some
   wiggle room.
   ========================================================================== */
'use strict';
const path = require('path');
const fs = require('fs');
const root = path.join(__dirname, '..');
require(path.join(root, 'js/objects.js'));
require(path.join(root, 'js/level.js'));
require(path.join(root, 'js/player.js'));
const PD = globalThis.PD;

/* Try to beat a level. Returns { ok, inputs, coins, farthest }.
   opts.hazPad   : how much bigger hazards are for the bot
   opts.decide   : ticks between decisions (8 ticks = 1/30 of a second)
   opts.needCoins: if true the bot must grab every coin */
function solve(data, opts) {
  opts = Object.assign({ hazPad: 0.08, decide: 8, needCoins: false, maxNodes: 4e6 }, opts);
  const level = PD.prepareLevel(data);
  const sim = new PD.Sim(level, { silent: true, hazPad: opts.hazPad });
  const coinObjs = level.objs.filter(o => o.cat === 'coin');
  const bad = new Set();          // Situations we know always lead to a crash.
  const stack = [];               // The path of choices so far.
  let nodes = 0, farthest = 0;

  // A short text label for "the same situation".
  // Flying modes have far more possible positions, so they are rounded more roughly.
  const key = (s, depth) => {
    const fly = s.mode === 'ship' || s.mode === 'ufo' || s.mode === 'wave';
    return depth + '|' + Math.round(s.y * (fly ? 8 : 24)) + '|' + Math.round(s.vy * (fly ? 1 : 3)) + '|' +
      s.g + s.mode[0] + s.mode[1] + s.speed + (s.mini ? 'm' : '') + (s.prevHold ? 'h' : '') +
      (s.grounded ? 'g' : '') + (s.boost > 0 ? Math.round(s.boost * 30) : '') + '|' + s.coins.length;
  };

  // Which button choice to try first. Trying "let go" first keeps the cube calm.
  const order = s => (s.mode === 'ship' || s.mode === 'wave') ? (s.y < 5 ? [true, false] : [false, true])
                                                              : [false, true];

  stack.push({ state: sim.getState(), tries: null, idx: 0, hold: false });
  while (stack.length) {
    const top = stack[stack.length - 1];
    if (!top.tries) top.tries = order(top.state);
    if (top.idx >= top.tries.length) {
      bad.add(key(top.state, stack.length - 1));
      stack.pop();
      continue;
    }
    const hold = top.tries[top.idx++];
    sim.setState(top.state);
    for (let i = 0; i < opts.decide && !sim.dead && !sim.won; i++) sim.step(hold);
    if (++nodes > opts.maxNodes) break;
    // Missing a required coin counts as a crash.
    if (opts.needCoins && !sim.dead) {
      for (const c of coinObjs) {
        if (sim.x > c.x + 3 && sim.coins.indexOf(c.coinIndex) < 0) { sim.dead = true; break; }
      }
    }
    if (sim.dead) continue;
    if (sim.x > farthest) farthest = sim.x;
    if (sim.won) {
      const inputs = stack.slice(1).map(n => n.hold).concat([hold]);
      return { ok: true, inputs, coins: sim.coins.length, farthest, nodes, length: level.length };
    }
    const st = sim.getState();
    if (bad.has(key(st, stack.length))) continue;
    stack.push({ state: st, tries: null, idx: 0, hold });
  }
  return { ok: false, farthest, nodes, length: level.length };
}

module.exports = { solve, PD };

// When run directly, test every level in /levels.
if (require.main === module) {
  for (const f of fs.readdirSync(path.join(root, 'levels')).filter(f => f.endsWith('.js')).sort()) {
    require(path.join(root, 'levels', f));
  }
  let allGood = true;
  for (const lv of PD.LEVELS) {
    const a = solve(lv, {});
    const b = a.ok ? solve(lv, { needCoins: true }) : { ok: false };
    const pct = Math.floor(100 * a.farthest / a.length);
    console.log(`${lv.name.padEnd(16)} beatable: ${a.ok ? 'YES' : 'NO (stuck at ' + pct + '%, x=' + a.farthest.toFixed(1) + ')'}` +
      `   all coins: ${b.ok ? 'YES' : 'NO' + (b.farthest ? ' (x=' + b.farthest.toFixed(1) + ')' : '')}   length: ${a.length} blocks`);
    if (!a.ok || !b.ok) allGood = false;
  }
  process.exit(allGood ? 0 : 1);
}
