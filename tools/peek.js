/* tools/peek.js   (run with:  node tools/peek.js level1 390 420)
   Prints a text picture of part of a level, handy when the bot gets stuck.
   # block, ^ spike, o orb, _ pad, | portal, $ coin */
'use strict';
const { PD } = require('./bot.js');
const fs = require('fs'), path = require('path');
for (const f of fs.readdirSync(path.join(__dirname, '..', 'levels'))) require(path.join(__dirname, '..', 'levels', f));
const lv = PD.LEVELS.find(l => l.id === process.argv[2]);
const x0 = +process.argv[3], x1 = +process.argv[4];
const sym = { solid: '#', hazard: '^', orb: 'o', pad: '_', portal: '|', coin: '$', trigger: ' ', deco: ' ' };
for (let y = 10; y >= 0; y--) {
  let line = String(y).padStart(2) + ' ';
  for (let x = x0; x <= x1; x++) {
    let ch = '.';
    for (const o of lv.objects) {
      const w = o.w || 1, h = o.h || 1;
      if (x >= o.x && x < o.x + w && y >= o.y && y < o.y + h) ch = sym[PD.TYPES[o.t].cat];
    }
    line += ch;
  }
  console.log(line);
}
console.log('   ' + Array.from({ length: x1 - x0 + 1 }, (_, i) => (x0 + i) % 10 === 0 ? '+' : ' ').join('') + '  (+ marks x = multiples of 10, starting ' + x0 + ')');
