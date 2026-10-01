# AUSPOST SIMULATOR: DELIVERY ATTEMPT

A playable C++17 / SDL3 top-down delivery game, playable at **https://moai-heads.github.io/auspost-simulator/**. The suburb is drawn live by SDL from a tile-based ground map and interactive objects—there is no screenshot background.

## Play

- **Arrow keys / WASD:** walk the postie around the suburb; **Shift:** sprint.
- **Mouse:** aim toward the marked safe-drop zone.
- **Hold/release Space:** charge and throw. You must get close enough for the parcel to reach the drop zone.
- **E:** recover a missed parcel or check the bike.
- **Delivery card:** Up/Down choose a reason or pickup point; Left/Right switch fields; **Enter** advances/stamps. You can also click a choice.
- Return to the bike after filing each card. Avoid the dog, garden obstacles, and suspicious residents.
- **Tab:** route sheet; **R:** restart.

There are five addresses, throw range/wind, parcel recovery, obstacles, resident detection, a patrolling dog that raises suspicion, timed paperwork, and a shift score. Getting caught costs time; nobody gets hurt.

## Native build

Requires SDL3 development files and CMake:

```sh
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build
(cd build && ./auspost)
```

## Web build

Requires Emscripten and CMake:

```sh
emcmake cmake -S . -B build-web -DCMAKE_BUILD_TYPE=Release
cmake --build build-web
```

The compiled `auspost.js` and `auspost.wasm` sit beside `index.html` and are published from the main branch root under `/auspost-simulator/`.
