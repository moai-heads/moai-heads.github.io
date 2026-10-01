# AUSPOST SIMULATOR: DELIVERY ATTEMPT

A small, playable C++17 + SDL3 arcade game, presented as an app on the fictional **Kookaburra OS 97** desktop. The web version is built with Emscripten and hosted at **https://moai-heads.github.io/auspost-simulator/**.

## Play

- **Enter / Start your shift** — start the five-stop route
- **Mouse** — aim for the marked safe drop zone (arrow keys also nudge aim)
- **Hold and release Space (or press and hold the gold on-screen button) — charge and throw the parcel; aim for the gold part of the meter
- **Card:** arrow keys / **1–3** select fields, **Enter** moves through and stamps
- **Escape:** hold **Left Arrow / A** to pedal; **Shift** to sprint
- **Tab** — route map; **R** — start over

Score balances a safe parcel, correct delivery card, clean escape, and remaining time. Getting caught costs time and points, never health.

## Native build

Requires SDL3 development files and CMake:

```sh
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build
(cd build && ./auspost)
```

## Web build

Requires Emscripten with its SDL3 port:

```sh
emcmake cmake -S . -B build-web -DCMAKE_BUILD_TYPE=Release
cmake --build build-web
```

The compiled web files (`auspost.js`, `auspost.wasm`, and `auspost.data`) are included beside `index.html`. This site is published from the `main` branch root, so the game is available under `/auspost-simulator/` after the Pages build completes.

The supplied screenshot is used as the in-game suburban playfield; all menus, HUD, route, throw arc, parcel, card, and scoring logic are rendered live by SDL3. No external runtime service is needed.
