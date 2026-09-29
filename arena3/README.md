# ARENA3 — web viewer

Static host for the ARENA3 roguelike. `index.html` is a dependency-free WebGL2
viewer that loads `arena3.wasm` and drives it via `a3_step`. No build step and no
runtime fetch beyond the wasm — playable straight from any static host.

Controls: WASD move · mouse look · left-click shoot · 1-4 weapon · Tab map · Enter start.
