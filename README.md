# Pop Dash

A rhythm platformer for the browser, built with plain HTML, CSS and JavaScript. No install, no build step.
It plays like the classic "jump to the beat" games, with its own name, levels, art and music.

## Play it

- **On your computer:** download the repo and open `index.html`.
- **Online:** in this repo go to Settings, then Pages, pick the `main` branch and save. GitHub gives you a link.

## Controls

| Action | Keys |
|---|---|
| Jump or fly | Click, tap, Space, W or Up |
| Pause | Esc or P |
| Restart | R |
| Practice: add / remove checkpoint | Z / X |

## What is in the game

- **7 game modes:** cube, ship, ball, UFO, wave, robot, spider
- **Pads and orbs:** yellow, pink, red, blue (gravity), green, black
- **Portals:** game mode, gravity, 5 speeds, mini size, mirror
- **3 levels:** Starlight Hop (easy), Neon Tide (normal), Comet Rush (hard), each with 3 secret coins
- **Practice mode** with checkpoints
- **Level editor** with test play, undo, and export / import as text
- **Icon kit:** 10 faces and 12 colors, some unlocked with stars and coins
- **Music made by code:** every level has a tune written by a tiny synth band in `js/audio.js`
- Progress is saved in your browser

## Files

| File | What it does |
|---|---|
| `index.html` | The page and all the menu boxes |
| `css/style.css` | The "chunky pop" look |
| `js/objects.js` | Constants and the list of every object type |
| `js/level.js` | Loads levels and sorts objects for fast lookups |
| `js/player.js` | The physics for all 7 modes |
| `js/render.js` | All drawing (sky, blocks, player) |
| `js/audio.js` | Music and sound effects |
| `js/save.js` | Saving progress |
| `js/game.js` | The game loop, camera, particles, practice mode |
| `js/editor.js` | The level editor |
| `js/ui.js` | Menus |
| `js/main.js` | Starts everything |
| `levels/*.js` | The built-in levels |
| `audio/songs.js` | Where you list your own music files |
| `tools/` | Developer tools (need Node.js) |

## Using your own music

Put a song in the `audio` folder and list it in `audio/songs.js`:

```js
PD.CUSTOM_SONGS = { level1: 'audio/my-song.mp3' };
```

Only use music you made or have a license for.

## Developer tools

```
node tools/build-levels.js   # rebuild the 3 levels from their recipes
node tools/bot.js            # a robot plays every level to prove it can be beaten
node tools/peek.js level1 0 60   # print a text picture of part of a level
```

## Rename the game

Change `PD.GAME_NAME` in `js/objects.js`, plus the title and logo text in `index.html`.

Made by Wildcard Studios.
