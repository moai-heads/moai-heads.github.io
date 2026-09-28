# ARENA3 — a bounded arena roguelike on ioquake3

Open `index.html`. Move WASD, look with the mouse, click to shoot, Esc for menu.

## What it is
A roguelike *mod* (`vm/qagame.qvm`) running on the ioquake3 engine compiled to
WebAssembly. Each "room" is a real Quake 3 / OpenArena arena map used as a prefab.
Clear the room's bot encounter, then walk into one of two portals — each carries a
different permanent upgrade drawn from Quake 3's own mechanics (weapons, armour,
quad, haste, battlesuit, regen, invisibility, flight, megahealth, ammo). Clear 5
rooms to win; 3 lives.

## Provenance / licensing
- **Engine:** ioquake3 (GPLv2), built to wasm with Emscripten.
- **Game data:** OpenArena (GPL/CC-BY-SA) — `baseoa/pak0.pk3`, and a texture pack.
- **Mod code / maps / bots:** this repo — `baseoa/zz-arena3.pk3` (QVM), `arena3-maps.pk3`, `arena3-misc.pk3`.

No id Software / Quake 3 retail or demo assets are included.
