/* ==========================================================================
   main.js
   The starting point. Runs once when the page has loaded every other file.
   ========================================================================== */
(function () {
  'use strict';
  var PD = window.PD;

  document.title = PD.GAME_NAME;

  // 1. Load saved progress and apply the saved volume.
  var save = PD.Save.load();
  PD.Audio.setVolume(save.settings.music, save.settings.sfx);

  // 2. Start the drawing loop on the canvas.
  PD.Game.init(document.getElementById('stage'));

  // 3. Hook up the menus and the editor, then show the main menu.
  PD.UI.init();
  PD.Editor.init();
  PD.UI.show('menu');
})();
