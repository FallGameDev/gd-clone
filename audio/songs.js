/* ==========================================================================
   audio/songs.js
   By default every song in the game is made by code (see js/audio.js), so the
   game needs no music files at all.

   Want to use your own music? Put the file in this /audio folder and list it
   below. Only use songs you made yourself or have a license to use.

   Song ids: "menu", "practice", "level1", "level2", "level3"
   Example:
       PD.CUSTOM_SONGS = { level1: 'audio/my-song.mp3' };
   ========================================================================== */
PD.CUSTOM_SONGS = {};

/* Sound effect files. Any effect not listed here is made by code.
   Effect ids: "die", "jump", "orb", "pad", "portal", "coin", "win", "click" */
PD.CUSTOM_SFX = {
  die: 'audio/boom.mp3'
};

/* Extra lines for the Credits screen. If you add your own music above, credit
   the people who made it here. Each entry is [role, name].
   Example:
       PD.SONG_CREDITS = [['Level 1 music', 'Song Name by Artist Name']];
*/
PD.SONG_CREDITS = [];
