'use strict';
/* DUNE CHOPPA // GUNSHIP — no engine, no assets. canvas only. */
(function () {
  const cv = document.getElementById('game');
  const ctx = cv.getContext('2d');
  const VW = 960, VH = 540;
  function fit() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = VW * dpr; cv.height = VH * dpr;
    cv.style.width = '100%'; cv.style.height = 'auto';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
  }
  fit(); window.addEventListener('resize', fit);

  const keys = {};
  window.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
    if (state.phase === 'build') {
      if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3' || e.code === 'Digit4') buildAtRegion(DEF_ORDER[(+e.code.slice(5)) - 1]);
      if (e.code === 'ArrowLeft' && REGIONS.length) state.region = (state.region + REGIONS.length - 1) % REGIONS.length;
      if (e.code === 'ArrowRight' && REGIONS.length) state.region = (state.region + 1) % REGIONS.length;
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') { startWave(); e.preventDefault(); }
    }
    if (e.code === 'KeyR' && state.over) reset();
    if (e.code === 'KeyB') wantBomb = true;
  });
  window.addEventListener('keyup', e => { keys[e.code] = false; });

  const mouse = { x: 640, y: 260, down: false };
  function toLocal(cx, cy) {
    const r = cv.getBoundingClientRect();
    return { x: (cx - r.left) * VW / r.width, y: (cy - r.top) * VH / r.height };
  }
  cv.addEventListener('mousemove', e => { const p = toLocal(e.clientX, e.clientY); mouse.x = p.x; mouse.y = p.y; });
  cv.addEventListener('mousedown', e => { const p = toLocal(e.clientX, e.clientY); mouse.x = p.x; mouse.y = p.y; if (state.phase === 'build') handleBuildClick(p.x, p.y); else mouse.down = true; e.preventDefault(); });
  window.addEventListener('mouseup', () => { mouse.down = false; });
  cv.addEventListener('touchstart', e => { e.preventDefault(); const t = e.touches[0]; const p = toLocal(t.clientX, t.clientY); mouse.x = p.x; mouse.y = p.y; if (state.phase === 'build') handleBuildClick(p.x, p.y); else mouse.down = true; }, {passive:false});
  cv.addEventListener('touchmove', e => { e.preventDefault(); const t = e.touches[0]; const p = toLocal(t.clientX, t.clientY); mouse.x = p.x; mouse.y = p.y; }, {passive:false});
  cv.addEventListener('touchend', e => { e.preventDefault(); mouse.down = false; }, {passive:false});

  // ---- world / terrain ----
  // original DUNE CHOPPA analytic hills: a 4-term sum whose biggest term is
  // amplitude-modulated by a slow sine, so some hills run tall and others
  // shallow. amplitudes are scaled to this 960x540 canvas.
  const GROUND = VH * 0.72;
  const HILL_SCALE = 0.53;
  function groundY(wx) {
    const mod = 0.62 + 0.38 * Math.sin(wx * 0.00090 + 0.4);
    const big = 138.0 * Math.sin(wx * 0.00162 + 1.3) * mod;
    const mid = 64.0 * Math.sin(wx * 0.00410 + 4.1);
    const small = 21.0 * Math.sin(wx * 0.01020 + 2.2);
    const grain = 4.0 * Math.sin(wx * 0.03100 + 0.7);
    return GROUND - (big + mid + small + grain) * HILL_SCALE;
  }

  // ---- state ----
  const state = {
    over: false, win: false, score: 0, wave: 0, t: 0,
    warCrimes: 0, wcFlash: 0,
    phase: 'build', region: 0, scrap: 120, airframes: 3, banner: '', bannerT: 0, bannerCol: '#8fffa8',
    buildMsg: '', buildMsgT: 0, turretCd: 0,
    spawnCd: 1.2, waveTimer: 0, shake: 0, best: +(localStorage.getItem('dc_best') || 0)
  };

  const P = {};
  function reset() {
    state.over = false; state.score = 0; state.wave = 0; state.t = 0;
    state.warCrimes = 0; state.wcFlash = 0;
    state.spawnCd = 1.2; state.waveTimer = 0; state.shake = 0;
    state.phase = 'build'; state.scrap = 120; state.region = 0; state.airframes = 3;
    state.banner = ''; state.bannerT = 0;
    state.buildMsg = ''; state.buildMsgT = 0; state.turretCd = 0;
    BASE.length = 0; REGIONS.length = 0; islCanvas = null; mapData = null; mapCanvas = null;
    P.x = 260; P.y = 250; P.vx = 0; P.vy = 0;
    P.hp = 100; P.heat = 0; P.fireCd = 0; P.rotor = 0; P.hitFlash = 0;
    P.bombs = 5; P.bombCd = 0; P.bombRegen = 0;
    enemies.length = 0; bullets.length = 0; ebullets.length = 0; parts.length = 0;
    bombs.length = 0; booms.length = 0; wantBomb = false;
    structs.length = 0; genX = 900;
    missiles.length = 0; floaters.length = 0;
    for (let i = 0; i < 5; i++) spawnEnemy(360 + i * 260);
  }
  const enemies = [], bullets = [], ebullets = [], parts = [];
  const bombs = [], booms = [];
  const structs = [];               // towns + military bases along the ground
  const missiles = [];              // SAMs launched by schools & hospitals
  const floaters = [];              // floating world-space text
  let genX = 900;                   // how far the world has been populated
  let wantBomb = false;

  // ---- player base (built top-down between waves) ----
  const BASE = [];                  // {gx,gy,kind,level}
  const BUILD = {
    turret: { name: 'TURRET', cost: 40, col: '#7fd0ff', desc: 'auto-fires at raiders from the chopper' },
    bunker: { name: 'BUNKER', cost: 25, col: '#c9b18a', desc: '+8% hull armor per level' },
    repair: { name: 'REPAIR', cost: 30, col: '#8fffa8', desc: 'heal 30 hull each wave' },
    depot:  { name: 'DEPOT',  cost: 20, col: '#ffd27a', desc: '+1 bomb / wave, faster gun cooling' },
  };
  const DEF_ORDER = ['turret', 'bunker', 'repair', 'depot'];

  // ---- campaign island: a procedural per-pixel map, rendered low-res then
  // nearest-neighbour upscaled for the pixel-art look (canvas2d has no shader
  // stage, so this is the equivalent: one colour-classification pass per pixel).
  // Double source resolution but keep the same 640x360 display footprint.
  // At 2x nearest-neighbour, terrain features read as pixel-art sprites.
  const IW = 320, IH = 180;
  const ICOL = [[26,48,84],[40,86,132],[220,196,134],[120,164,88],[74,116,62],[132,120,106],[230,232,238]];
  const REGION_NAMES = ['SALT FLAT','DUNE BASIN','THE RIDGE','OASIS','OLD HARBOR','BLACK MESA'];
  const REGION_TERRAIN = ['coastal','desert','ridge','oasis','harbor','mesa'];
  let islCanvas = null;
  // the campaign map is a SINGLE pixel buffer: terrain with roads and the
  // growing city baked straight into it, so what you develop IS the map.
  let mapData = null, mapCanvas = null;
  function ihash(x, y) {
    let n = (x * 374761393 + y * 668265263) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }
  function sm(t) { return t * t * (3 - 2 * t); }
  function vnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const a = ihash(xi, yi), b = ihash(xi + 1, yi), c = ihash(xi, yi + 1), d = ihash(xi + 1, yi + 1);
    const u = sm(xf), v = sm(yf);
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
  }
  function fbm(x, y) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < 5; i++) { s += a * vnoise(x * f, y * f); f *= 2; a *= 0.5; } return s; }
  function islandH(u, v, seed) {
    const dx = (u - 0.5) * 2, dy = (v - 0.5) * 2;
    const d = Math.sqrt(dx * dx + dy * dy * 1.25);
    let edge = Math.max(0, Math.min(1, (1 - d) * 1.4));
    const n = fbm(u * 5 + seed, v * 5 + seed * 1.7);
    let h = edge * 0.72 + (n - 0.5) * 0.6 + 0.28;
    h += (fbm(u * 13 + seed * 3, v * 13 + seed) - 0.5) * 0.16;
    return h;
  }
  function buildIsland() {
    const m = (location.search + location.hash).match(/seed=([-\d.]+)/);
    const sp = m ? parseFloat(m[1]) : NaN;
    const seed = isFinite(sp) ? sp : ((typeof window.ISLAND_SEED === 'number') ? window.ISLAND_SEED : Math.random() * 100);
    const c = document.createElement('canvas'); c.width = IW; c.height = IH;
    const cx = c.getContext('2d');
    const img = cx.createImageData(IW, IH), dat = img.data;
    const count = IW * IH, heights = new Float32Array(count);
    REGIONS.length = 0;
    const cand = [];

    // Bake a fine height field, hillshade and tile-scale terrain texture.
    for (let y = 0; y < IH; y++) for (let x = 0; x < IW; x++) {
      const i = y * IW + x, h = islandH(x / IW, y / IH, seed);
      heights[i] = h;
      let ci;
      if (h < 0.34) ci = 0; else if (h < 0.42) ci = 1; else if (h < 0.47) ci = 2;
      else if (h < 0.58) ci = 3; else if (h < 0.68) ci = 4; else if (h < 0.80) ci = 5; else ci = 6;
      landMask[i] = (h >= 0.42 && h < 0.96) ? 1 : 0;
      const o = i * 4, base = ICOL[ci];
      const grain = (ihash(x * 3 + 1, y * 5 + 2) - 0.5) * 13;
      const patch = (vnoise(x * 0.075 + seed * 2.1, y * 0.075 + seed * 1.3) - 0.5) * 11;
      const left = x ? heights[i - 1] : h, up = y ? heights[i - IW] : h;
      const shade = 1 + (left - h) * 4.2 + (up - h) * 3.0;
      let detail = grain + patch;
      if (ci <= 1) {
        const wave = Math.sin(x * 0.18 + y * 0.12 + vnoise(x * 0.035, y * 0.035 + seed) * 4.5);
        detail += wave > 0.78 ? 5 : 0;
      } else if (ci === 2) detail += Math.sin(x * 0.31 + y * 0.10 + patch * 0.08) * 4;
      else if (ci === 5) detail += Math.sin(x * 0.43 + y * 0.20 + patch * 0.1) * 3;
      else if (ci === 6 && ihash(x + 1701, y + 5309) > 0.93) detail += 12;
      const light = ci <= 1 ? 1 : Math.max(0.78, Math.min(1.18, shade));
      dat[o] = Math.max(0, Math.min(255, base[0] * light + detail));
      dat[o + 1] = Math.max(0, Math.min(255, base[1] * light + detail));
      dat[o + 2] = Math.max(0, Math.min(255, base[2] * light + detail));
      dat[o + 3] = 255;
      if (h >= 0.47 && h < 0.78) cand.push({ x, y });
    }

    function paint(x, y, rgb) {
      if (x < 0 || y < 0 || x >= IW || y >= IH) return;
      const o = (y * IW + x) * 4;
      dat[o] = rgb[0]; dat[o + 1] = rgb[1]; dat[o + 2] = rgb[2]; dat[o + 3] = 255;
    }

    // Surf scallops make the coastline read clearly at 2x zoom.
    for (let y = 1; y < IH - 1; y++) for (let x = 1; x < IW - 1; x++) {
      const i = y * IW + x, h = heights[i];
      if (h < 0.32 || h >= 0.42) continue;
      let shore = false;
      for (const [dx, dy] of NB8) if (landMask[(y + dy) * IW + x + dx]) { shore = true; break; }
      if (shore) paint(x, y, ihash(x * 7 + 91, y * 11 + 37) > 0.60 ? [105,169,156] : [65,130,151]);
    }

    // Two seeded downhill streams from the high interior to the sea. A
    // breadth-first coast distance guarantees each path reaches the shoreline.
    const coastDist = new Int16Array(count); coastDist.fill(32767);
    const queue = new Int32Array(count); let qh = 0, qt = 0;
    for (let i = 0; i < count; i++) if (heights[i] < 0.42) { coastDist[i] = 0; queue[qt++] = i; }
    const N4 = [[1,0],[-1,0],[0,1],[0,-1]];
    while (qh < qt) {
      const i = queue[qh++], x = i % IW, y = (i / IW) | 0, nd = coastDist[i] + 1;
      for (const [dx, dy] of N4) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= IW || ny >= IH) continue;
        const ni = ny * IW + nx;
        if (coastDist[ni] > nd) { coastDist[ni] = nd; queue[qt++] = ni; }
      }
    }
    const river = new Uint8Array(count), bank = new Uint8Array(count), riverSeeds = [];
    for (let stream = 0; stream < 2; stream++) {
      let start = -1, best = -1;
      for (let i = 0; i < count; i++) {
        const h = heights[i], cd = coastDist[i];
        if (h < 0.58 || h > 0.82 || cd < 10 || cd > 52) continue;
        let separated = true;
        for (const old of riverSeeds) if (Math.abs((old % IW) - (i % IW)) < 22 && Math.abs(((old / IW) | 0) - ((i / IW) | 0)) < 18) { separated = false; break; }
        if (!separated) continue;
        const score = h * 0.55 + Math.min(cd, 36) * 0.002 + ihash(i + stream * 1931, 887) * 0.14;
        if (score > best) { best = score; start = i; }
      }
      if (start < 0) continue;
      riverSeeds.push(start);
      let i = start;
      for (let step = 0; step < 320 && coastDist[i] > 0; step++) {
        river[i] = 1;
        const x = i % IW, y = (i / IW) | 0;
        for (const [dx, dy] of N4) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= IW || ny >= IH) continue;
          const ni = ny * IW + nx;
          if (landMask[ni] && !river[ni]) bank[ni] = 1;
        }
        let next = -1, score = Infinity;
        for (const [dx, dy] of NB8) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= IW || ny >= IH) continue;
          const ni = ny * IW + nx;
          if (coastDist[ni] >= coastDist[i] || river[ni]) continue;
          const s = heights[ni] + ihash(nx * 13 + stream * 97, ny * 17 + 211) * 0.035;
          if (s < score) { score = s; next = ni; }
        }
        if (next < 0) break;
        i = next;
      }
    }
    for (let i = 0; i < count; i++) {
      if (bank[i] && !river[i]) paint(i % IW, (i / IW) | 0, [177,165,123]);
      if (river[i]) paint(i % IW, (i / IW) | 0, ihash(i + 703, 119) > 0.68 ? [90,161,176] : [50,119,151]);
    }

    // Tiny clustered hardwoods: dark pixel-art canopy, bright leaves, one-pixel trunk.
    const treeShape = [
      [0,-2,2], [-1,-1,1],[0,-1,0],[1,-1,2],
      [-2,0,2],[-1,0,0],[0,0,0],[1,0,1],[2,0,2],
      [-2,1,2],[-1,1,0],[0,1,1],[1,1,0],[2,1,2],
      [-1,2,2],[0,2,3],[1,2,2]
    ];
    const treePal = [
      [[52,112,51],[35,75,44],[113,160,67],[111,83,54]],
      [[61,126,56],[39,83,47],[133,173,72],[116,88,56]],
      [[48,101,58],[32,69,49],[100,149,74],[109,82,57]]
    ];
    for (let gy = 5; gy < IH - 4; gy += 5) for (let gx = 5; gx < IW - 4; gx += 5) {
      const j = gy * IW + gx;
      if (heights[j] < 0.52 || heights[j] > 0.75) continue;
      const forestness = vnoise(gx * 0.055 + seed * 2.7, gy * 0.055 + seed * 1.9);
      if (forestness < 0.43 || ihash(gx + 612, gy + 143) < 0.22) continue;
      const tx = gx + ((ihash(gx + 201, gy + 379) * 3) | 0) - 1;
      const ty = gy + ((ihash(gx + 503, gy + 887) * 3) | 0) - 1;
      const pal = treePal[(ihash(gx + 71, gy + 31) * treePal.length) | 0];
      for (const [dx, dy, c] of treeShape) {
        const x = tx + dx, y = ty + dy;
        if (x < 0 || y < 0 || x >= IW || y >= IH) continue;
        const k = y * IW + x;
        if (!landMask[k] || river[k] || bank[k]) continue;
        paint(x, y, pal[c]);
      }
    }

    // Sparse rocky tors and snow caps break up high ground into landmarks.
    for (let gy = 8; gy < IH - 7; gy += 9) for (let gx = 8; gx < IW - 7; gx += 10) {
      const cxp = gx + ((ihash(gx + 77, gy + 91) * 5) | 0) - 2;
      const cyp = gy + ((ihash(gx + 31, gy + 53) * 5) | 0) - 2;
      const ci = cyp * IW + cxp;
      if (heights[ci] < 0.67 || heights[ci] > 0.88 || ihash(gx + 991, gy + 727) < 0.44) continue;
      for (let dy = -3; dy <= 2; dy++) {
        const half = dy <= -2 ? dy + 3 : (dy === -1 ? 2 : (dy === 0 ? 3 : 2));
        for (let dx = -half; dx <= half; dx++) {
          const x = cxp + dx, y = cyp + dy;
          if (x < 0 || y < 0 || x >= IW || y >= IH) continue;
          const k = y * IW + x;
          if (!landMask[k] || river[k] || bank[k]) continue;
          let col;
          if (dy <= -2 && Math.abs(dx) <= 1) col = heights[k] > 0.80 ? [228,226,212] : [184,178,151];
          else if (dx + dy < 0) col = [157,155,139];
          else col = [91,98,91];
          if (heights[k] > 0.80 && ihash(x + 661, y + 71) > 0.44) col = [222,226,224];
          paint(x, y, col);
        }
      }
    }

    cx.putImageData(img, 0, 0);
    islCanvas = c;
    mapData = new Uint8ClampedArray(img.data);
    mapCanvas = null; cityDirty = true;
    for (let t = 0; t < 6000 && REGIONS.length < 6; t++) {
      const cnd = cand[(Math.random() * cand.length) | 0]; if (!cnd) break;
      let ok = true;
      for (const r of REGIONS) if (Math.abs(r.px - cnd.x) < 52 && Math.abs(r.py - cnd.y) < 40) { ok = false; break; }
      if (!ok) continue;
      const i = REGIONS.length;
      REGIONS.push({ px: cnd.x, py: cnd.y, name: REGION_NAMES[i % REGION_NAMES.length],
                     terrain: REGION_TERRAIN[i % REGION_TERRAIN.length], threat: 1 + i,
                     owned: false, dev: 0, structs: [] });
    }
    REGIONS.sort((a, b) => a.px - b.px);
    if (state.region >= REGIONS.length) state.region = 0;
    // fresh urban fabric for the new island
    urban = new Uint8Array(IW * IH);
    urbanOwner = new Int8Array(IW * IH).fill(-1);
    road = new Uint8Array(IW * IH);
    urbanCount = REGIONS.map(() => 0);
    frontier = REGIONS.map(() => []);
    cityDirty = true; cityAcc = 0; crandState = (seed * 1e6) | 0;
    for (let i = 0; i < REGIONS.length; i++) if (REGIONS[i].owned) citySeedRegion(i);
    rebuildRoads();
  }
  const REGIONS = [];
  // ---- city growth ----
  // owning a region plants a settlement; each development level raises the
  // ceiling on how far the sprawl can creep. growth is an "eden" expansion --
  // cells are claimed off a boundary frontier so the blobs stay organic -- and
  // highways stitch the holdings together so the sprawl runs along the roads.
  let urban = null, urbanOwner = null, road = null, landMask = new Uint8Array(IW * IH);
  let cityDirty = true, cityAcc = 0;
  let urbanCount = [], frontier = [];
  const CITY_TICK = 0.26;
  // seeded prng so growth is reproducible for a given island (and for GIF demos)
  let crandState = 1;
  function crand() {
    crandState |= 0; crandState = (crandState + 0x6D2B79F5) | 0;
    let t = Math.imul(crandState ^ (crandState >>> 15), 1 | crandState);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const NB8 = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]];
  function cityCap(dev) { return (24 + dev * 66) * 4; }
  function inb(x, y) { return x >= 0 && y >= 0 && x < IW && y < IH; }
  function landAt(x, y) { return inb(x, y) && landMask[y * IW + x] === 1; }
  function cityClaim(x, y, idx) {
    const i = y * IW + x;
    if (urban[i] || !landAt(x, y)) return false;
    urban[i] = 1; urbanOwner[i] = idx; urbanCount[idx]++; frontier[idx].push(i);
    cityDirty = true; return true;
  }
  function citySeedRegion(idx) {
    const r = REGIONS[idx]; if (!r) return;
    let bx = r.px, by = r.py, found = landAt(bx, by);
    for (let rad = 1; rad < 12 && !found; rad++)
      for (let dy = -rad; dy <= rad && !found; dy++)
        for (let dx = -rad; dx <= rad && !found; dx++)
          if (landAt(r.px + dx, r.py + dy)) { bx = r.px + dx; by = r.py + dy; found = true; }
    if (!found) return;
    cityClaim(bx, by, idx);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) cityClaim(bx + dx, by + dy, idx);
  }
  function cityStep() {
    let any = false;
    for (let idx = 0; idx < REGIONS.length; idx++) {
      const r = REGIONS[idx]; if (!r.owned) continue;
      const cap = cityCap(r.dev);
      let tries = 2 * (1 + r.dev);
      for (let t = 0; t < tries && urbanCount[idx] < cap; t++) {
        const f = frontier[idx]; if (!f.length) break;
        const ci = f[(crand() * f.length) | 0];
        const x = ci % IW, y = (ci / IW) | 0;
        let placed = false;
        for (let a = 0; a < 7 && !placed; a++) {
          const d = NB8[(crand() * NB8.length) | 0];
          if (cityClaim(x + d[0], y + d[1], idx)) { placed = true; any = true; }
        }
        // roads also sprout a little sprawl beside them
        if (!placed && cityClaim(x + ((crand() * 3) | 0) - 1, y, idx)) { placed = true; any = true; }
        if (!placed) { const p = f.indexOf(ci); if (p >= 0) f.splice(p, 1); }
      }
    }
    return any;
  }
  function rebuildRoads() {
    road.fill(0);
    const owned = REGIONS.map((r, i) => i).filter(i => REGIONS[i].owned).sort((a, b) => REGIONS[a].px - REGIONS[b].px);
    for (let k = 0; k + 1 < owned.length; k++) {
      let x0 = REGIONS[owned[k]].px, y0 = REGIONS[owned[k]].py;
      const x1 = REGIONS[owned[k + 1]].px, y1 = REGIONS[owned[k + 1]].py;
      const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
      const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let err = dx - dy;
      for (let guard = 0; guard < 400; guard++) {
        if (inb(x0, y0)) road[y0 * IW + x0] = 1;
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x0 += sx; }
        if (e2 < dx) { err += dx; y0 += sy; }
      }
    }
    cityDirty = true;
  }
  function syncCity() { for (let i = 0; i < REGIONS.length; i++) if (REGIONS[i].owned) citySeedRegion(i); rebuildRoads(); }
  // renderCity bakes roads + city growth INTO the island's pixel buffer and
  // produces one unified map image. (the old code composited a translucent
  // overlay on top; this makes the city literally part of the map surface.)
  function renderCity() {
    if (!mapCanvas) { mapCanvas = document.createElement('canvas'); mapCanvas.width = IW; mapCanvas.height = IH; }
    const cc = mapCanvas.getContext('2d');
    const img = cc.createImageData(IW, IH), d = img.data;
    if (mapData) d.set(mapData);
    else for (let i = 0; i < d.length; i += 4) { d[i] = 12; d[i+1] = 20; d[i+2] = 34; d[i+3] = 255; }
    for (let y = 0; y < IH; y++) for (let x = 0; x < IW; x++) {
      const i = y * IW + x, o = i * 4;
      // roads are graded straight into the terrain (asphalt over whatever is there)
      if (road[i] && !urban[i]) {
        d[o]   = d[o]   * 0.28 + 52  * 0.72;
        d[o+1] = d[o+1] * 0.28 + 56  * 0.72;
        d[o+2] = d[o+2] * 0.28 + 70  * 0.72;
        d[o+3] = 255;
        continue;
      }
      if (!urban[i]) continue;
      let nb = 0;
      for (const [dx, dy] of NB8) if (inb(x + dx, y + dy) && urban[(y + dy) * IW + x + dx]) nb++;
      const h = ihash(x * 7 + 3, y * 11 + 5);
      let R, G, B;
      if (nb >= 6) { R = 188; G = 179; B = 163; }        // dense concrete core
      else if (nb >= 4) { R = 154; G = 141; B = 122; }    // built-up
      else {                                              // sprawl edge: fades into terrain
        const t = 0.55 + (h - 0.5) * 0.14;
        R = d[o]   * (1 - t) + 132 * t;
        G = d[o+1] * (1 - t) + 120 * t;
        B = d[o+2] * (1 - t) + 102 * t;
      }
      // street grid etched through built-up blocks
      const street = (nb >= 5) && ((x % 3 === 0) !== (y % 3 === 0));
      if (street) { R = 62; G = 66; B = 78; }
      else if (nb >= 5 && h > 0.80) { R = 255; G = 206; B = 120; }  // lit windows
      else { const n = (h - 0.5) * 22; R += n; G += n; B += n; }
      d[o] = R; d[o+1] = G; d[o+2] = B; d[o+3] = 255;
    }
    cc.putImageData(img, 0, 0);
    cityDirty = false;
  }
  function mapRect() {
    const x0 = 24, y0 = 72, w = VW - 24 - 268, h = VH - 72 - 62;
    let sc = Math.floor(Math.min(w / IW, h / IH)); if (sc < 1) sc = 1;
    const iw = IW * sc, ih = IH * sc;
    return { ox: x0 + (w - iw) / 2, oy: y0 + (h - ih) / 2, s: sc, iw, ih };
  }
  function regionScreen(r, ox, oy, sc) { return { x: ox + r.px * sc, y: oy + r.py * sc }; }
  function buildAtRegion(kind) {
    const r = REGIONS[state.region]; if (!r) return;
    const exist = r.structs.find(s => s.kind === kind), cost = BUILD[kind].cost;
    if (exist && exist.level < 3) {
      if (state.scrap < cost) { buildMsg('not enough scrap'); return; }
      state.scrap -= cost; exist.level++;
      const b = BASE.find(b => b.region === state.region && b.kind === kind); if (b) b.level++;
      return;
    }
    if (exist) { buildMsg('max level'); return; }
    if (r.structs.length >= 3) { buildMsg('region full'); return; }
    if (state.scrap < cost) { buildMsg('not enough scrap'); return; }
    state.scrap -= cost; r.structs.push({ kind, level: 1 }); BASE.push({ region: state.region, kind, level: 1 });
  }

  // ---- region economy ----
  // you win a region, invest scrap into it, and it pays that scrap back at the
  // end of every following round -- win or lose.
  const DEV_TIERS = [
    { name: 'OUTPOST',  cost: 45,  yield: 18 },
    { name: 'MINE',     cost: 95,  yield: 40 },
    { name: 'REFINERY', cost: 200, yield: 85 },
  ];
  function devYield(dev) { let y = 0; for (let i = 0; i < dev; i++) y += DEV_TIERS[i].yield; return y; }
  function totalIncome() { let y = 0; for (const r of REGIONS) if (r.owned) y += devYield(r.dev); return y; }
  function developRegion() {
    const r = REGIONS[state.region]; if (!r) return;
    if (!r.owned) { buildMsg('capture it first'); return; }
    if (r.dev >= DEV_TIERS.length) { buildMsg('max development'); return; }
    const t = DEV_TIERS[r.dev];
    if (state.scrap < t.cost) { buildMsg('not enough scrap'); return; }
    state.scrap -= t.cost; r.dev++;
    for (let k = 0; k < 2 + r.dev * 2; k++) cityStep();
    buildMsg(r.name + ' \u2192 ' + t.name + '  +' + t.yield + '/round');
  }
  function payYields() {
    let total = 0;
    for (const r of REGIONS) if (r.owned) total += devYield(r.dev);
    if (total > 0) {
      state.scrap += total;
      state.banner = '+' + total + ' SCRAP FROM YOUR REGIONS';
      state.bannerT = 2.8; state.bannerCol = '#8fffa8';
    }
    return total;
  }
  function shotDown() {
    state.airframes--;
    burst(P.x, P.y, 40, '#ff5a3c', 320); state.shake = 1.4;
    // clear the battlefield so the rest of this frame is harmless
    enemies.length = 0; ebullets.length = 0; bullets.length = 0; missiles.length = 0; bombs.length = 0;
    const paid = payYields();
    if (state.airframes <= 0) {
      state.over = true; state.win = false; saveBest();
      state.banner = ''; state.bannerT = 0;
    } else {
      state.phase = 'build'; P.hp = 100;
      state.banner = paid > 0 ? state.banner : 'SHOT DOWN \u2014 EXTRACTED';
      state.bannerCol = paid > 0 ? '#8fffa8' : '#ff9a6a';
      state.bannerT = 2.8;
    }
  }
  function countBase(kind) { let n = 0; for (const b of BASE) if (b.kind === kind) n += b.level; return n; }
  function armorMul() { return Math.max(0.45, 1 - countBase('bunker') * 0.08); }
  function nearestEnemy() { let best = null, bd = 1e9; for (const e of enemies) { if (!e.alive) continue; const d = Math.abs(e.x - P.x); if (d < bd) { bd = d; best = e; } } return best; }
  function buildMsg(t) { state.buildMsg = t; state.buildMsgT = 1.4; }
  function endWave() {
    state.phase = 'build';
    state.scrap += 60 + state.wave * 12;
    const rep = countBase('repair'); if (rep > 0) P.hp = Math.min(100, P.hp + 30 * rep);
    const dep = countBase('depot');  if (dep > 0) P.bombs = Math.min(10, P.bombs + 2 + dep);
    const rg = REGIONS[state.region];
    let captured = false;
    if (rg && !rg.owned) {
      rg.owned = true; captured = true;
      citySeedRegion(state.region);
      rebuildRoads();
      for (let k = 0; k < 4; k++) cityStep();  // a first burst of construction
    }
    const paid = payYields();
    if (captured) {
      state.banner = rg.name + ' SECURED';
      state.bannerCol = '#8fffa8'; if (!(paid > 0)) state.bannerT = 2.8;
    }
    buildMsg(captured ? (rg.name + ' secured') : ('wave ' + state.wave + ' cleared'));
    if (REGIONS.length && REGIONS.every(r => r.owned)) { state.over = true; state.win = true; saveBest(); }
  }
  function startWave() {
    state.wave++; state.phase = 'fly'; state.waveTimer = 0;
    P.bombs = Math.min(10, P.bombs + 2 + countBase('depot'));
    state.buildMsg = ''; state.buildMsgT = 0;
    const rg = REGIONS[state.region];
    for (let i = 0; i < 3 + state.wave + (rg ? rg.threat - 1 : 0); i++) spawnEnemy(P.x + 700 + i * 180 + Math.random() * 120);
  }

  // deterministic per-x RNG so clusters are stable if we ever revisit them
  function hash32(n) {
    n = (n ^ 61) ^ (n >>> 16); n = (n + (n << 3)) ^ (n >>> 4);
    n = Math.imul(n, 0x27d4eb2d); n = (n + (n << 15)) ^ (n >>> 9);
    return n >>> 0;
  }
  function mulberry(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const EN = ['raider', 'raider', 'raider', 'thrower', 'thrower', 'gunner'];

  function spawnEnemy(x0) {
    const kind = EN[(Math.random() * EN.length) | 0];
    const x = x0 !== undefined ? x0 : P.x + 470 + Math.random() * 300;
    enemies.push({
      x, y: groundY(x), kind, hp: kind === 'gunner' ? 3 : (kind === 'thrower' ? 2 : 2),
      cool: 1 + Math.random() * 2, walk: Math.random() < 0.5 ? -1 : 1,
      phase: Math.random() * 6.28, alive: true, fireCd: 1 + Math.random() * 2
    });
  }

  function burst(x, y, n, col, spd) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, s = spd * (0.3 + Math.random());
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: 0.5 + Math.random() * 0.5, col });
    }
  }

  function fire() {
    // mouse is screen-space; the chopper is drawn at P.x-camX. aim in screen space,
    // but store bullets in WORLD space so collisions/drawing line up.
    const scx = P.x - state.camX, cy = P.y + 8;
    const ang = Math.atan2(mouse.y - cy, mouse.x - scx);
    const sp = 900, spread = (Math.random() - 0.5) * 0.035;
    const a = ang + spread;
    bullets.push({ x: P.x + Math.cos(ang) * 30, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1.1 });
    P.heat += 4.5;
    burst(P.x + Math.cos(ang) * 34, cy, 2, '#ffd27a', 120);
  }

  // ---- update ----
  function update(dt) {
    state.t += dt;
    ensureStructs();
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 3);

    if (state.phase === 'build') {
      for (const f of floaters) { f.life -= dt; f.y -= 22 * dt; }
      for (let i = floaters.length - 1; i >= 0; i--) if (floaters[i].life <= 0) floaters.splice(i, 1);
      if (state.buildMsgT > 0) state.buildMsgT -= dt;
      if (state.bannerT > 0) state.bannerT -= dt;
      // let the cities keep filling in while we plan the next push
      cityAcc += dt; let guard = 0;
      while (cityAcc >= CITY_TICK && guard++ < 8) { cityAcc -= CITY_TICK; cityStep(); }
      return;
    }
    // safety net: any lethal damage (crash, blast) takes the chopper down
    if (!state.over && state.phase === 'fly' && P.hp <= 0) {
      P.hp = 0; shotDown(); return;
    }
    if (!state.over) {
      // flight
      const ax = 1500, ay = 1400, damp = 0.90;
      let ix = 0, iy = 0;
      if (keys.ArrowLeft || keys.KeyA) ix -= 1;
      if (keys.ArrowRight || keys.KeyD) ix += 1;
      if (keys.ArrowUp || keys.KeyW) iy -= 1;
      if (keys.ArrowDown || keys.KeyS) iy += 1;
      P.vx += ix * ax * dt; P.vy += iy * ay * dt;
      P.vx *= Math.pow(damp, dt * 60); P.vy *= Math.pow(damp, dt * 60);
      P.vx = Math.max(-260, Math.min(260, P.vx));
      P.vy = Math.max(-260, Math.min(260, P.vy));
      P.x += P.vx * dt; P.y += P.vy * dt;
      P.x = Math.max(60, Math.min(P.x, state.camX + VW - 80));
      P.y = Math.max(70, P.y);
      P.rotor += dt * 40;
      // ground crash
      if (P.y > groundY(P.x) - 34) { P.y = groundY(P.x) - 34; P.vy = -120; P.hp -= 26 * armorMul(); P.hitFlash = 0.3; state.shake = 1; }

      // camera
      const camTarget = P.x - 300;
      state.camX += (camTarget - state.camX) * Math.min(1, dt * 3.2);

      // firing
      P.heat = Math.max(0, P.heat - dt * (34 + 6 * countBase('depot')));
      P.fireCd -= dt;
      const firing = (mouse.down || keys.Space) && P.heat < 100 && P.hitFlash <= 0;
      if (firing && P.fireCd <= 0) { fire(); P.fireCd = 0.055; }
      if (P.heat >= 100) { /* overheated */ }

      // base turrets auto-fire at the nearest raider
      const nTur = countBase('turret');
      if (nTur > 0) {
        state.turretCd -= dt;
        if (state.turretCd <= 0) {
          const tgt = nearestEnemy();
          if (tgt) {
            const ang = Math.atan2((tgt.y - 30) - P.y, tgt.x - P.x);
            bullets.push({ x: P.x, y: P.y, vx: Math.cos(ang) * 820, vy: Math.sin(ang) * 820, life: 1.2 });
            burst(P.x + Math.cos(ang) * 30, P.y, 1, '#8fd0ff', 90);
            state.turretCd = Math.max(0.18, 0.9 / nTur);
          } else state.turretCd = 0.25;
        }
      }

      // bombs
      P.bombCd = Math.max(0, P.bombCd - dt);
      P.bombRegen += dt;
      if (P.bombRegen >= 5 && P.bombs < 6) { P.bombs++; P.bombRegen = 0; }
      if (wantBomb) {
        if (P.bombs > 0 && P.bombCd <= 0) {
          P.bombs--; P.bombCd = 0.35;
          bombs.push({ x: P.x, y: P.y + 16, vx: P.vx * 0.5,
                       vy: Math.max(50, P.vy + 30), life: 3 });
          burst(P.x, P.y + 16, 3, '#cfe3ff', 40);
        }
        wantBomb = false;
      }

      if (P.hitFlash > 0) P.hitFlash -= dt;

      // waves
      state.waveTimer += dt;
      if (state.waveTimer > 18) { state.waveTimer = 0; endWave(); }
      state.spawnCd -= dt;
      const maxAlive = 4 + state.wave;
      if (state.spawnCd <= 0 && enemies.filter(e => e.alive).length < maxAlive) {
        spawnEnemy(P.x + 700 + Math.random() * 400);
        state.spawnCd = Math.max(0.5, 1.6 - state.wave * 0.12);
      }
    } else {
      state.camX += 40 * dt;
    }

    // enemies
    for (const e of enemies) {
      if (!e.alive) continue;
      e.y = groundY(e.x);
      e.phase += dt * 8;
      // drift toward player when close
      if (e.x - P.x < 520 && e.x - P.x > 120) e.x -= 26 * dt;
      if (!state.over) {
        e.fireCd -= dt;
        if (e.fireCd <= 0 && e.x - P.x < 620 && e.x - P.x > 60) {
          e.fireCd = 1.6 + Math.random() * 1.8 - state.wave * 0.08;
          const ang = Math.atan2((P.y + 8) - (e.y - 26), P.x - e.x);
          const sp = e.kind === 'gunner' ? 460 : 360;
          ebullets.push({ x: e.x, y: e.y - 26, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 60, life: 2.2, g: 160 });
          if (e.kind === 'thrower' || e.kind === 'gunner') burst(e.x + 8, e.y - 26, 2, '#ff9d5c', 60);
        }
      }
    }
    // despawn far behind
    for (let i = enemies.length - 1; i >= 0; i--) if (enemies[i].x < state.camX - 200 || !enemies[i].alive) enemies.splice(i, 1);

    // schools & hospitals lob surface-to-air missiles at the chopper
    for (const st of structs) {
      if (st.fireFlash > 0) st.fireFlash -= dt;
      if (!st.alive || (st.kind !== 'school' && st.kind !== 'hospital')) continue;
      if (st.fireCd > 0) { st.fireCd -= dt; continue; }
      const dx = P.x - st.x;
      if (Math.abs(dx) > 540) continue;                       // only when the chopper is close
      const roofY = st.gy - structH(st.kind);
      if (P.y > roofY - 6) continue;                          // needs the chopper above the roofline
      launchMissile(st);
      st.fireCd = 2.4 + Math.random() * 2.4;
    }

    // player bullets

    // player bullets
    for (const b of bullets) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      for (const e of enemies) {
        if (!e.alive) continue;
        if (Math.abs(b.x - e.x) < 18 && b.y > e.y - 54 && b.y < e.y + 4) {
          e.hp--; b.life = 0; burst(b.x, b.y, 6, '#ffd166', 160);
          if (e.hp <= 0) { e.alive = false; state.score += 100; burst(e.x, e.y - 26, 18, '#ff6b6b', 260); }
          break;
        }
      }
    }
    for (let i = bullets.length - 1; i >= 0; i--) if (bullets[i].life <= 0 || bullets[i].x > state.camX + VW + 60) bullets.splice(i, 1);

    // bombs: gravity, ground/enemy impact, then blast
    for (const b of bombs) {
      b.vy += 900 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      let hit = false;
      for (const e of enemies) {
        if (!e.alive) continue;
        if (Math.abs(b.x - e.x) < 22 && b.y > e.y - 54 && b.y < e.y + 4) { hit = true; break; }
      }
      if (!hit) {
        for (const st of structs) {
          if (!st.alive) continue;
          const h = structH(st.kind), w = structW(st.kind);
          if (Math.abs(b.x - st.x) < w / 2 && b.y > st.gy - h && b.y < st.gy) { hit = true; break; }
        }
      }
      const gy = groundY(b.x) - 2;
      if (hit || b.y >= gy) { b.life = 0; explode(b.x, Math.min(b.y, gy), true); }
    }
    for (let i = bombs.length - 1; i >= 0; i--)
      if (bombs[i].life <= 0 || bombs[i].x < state.camX - 80) bombs.splice(i, 1);

    // blast rings
    for (const bm of booms) bm.life -= dt;
    for (let i = booms.length - 1; i >= 0; i--) if (booms[i].life <= 0) booms.splice(i, 1);

    // enemy bullets
    for (const b of ebullets) {
      b.vy += b.g * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (!state.over && Math.abs(b.x - P.x) < 34 && Math.abs(b.y - P.y) < 20) {
        b.life = 0; P.hp -= 9 * armorMul(); P.hitFlash = 0.35; state.shake = 0.8;
        burst(P.x, P.y, 8, '#ff8a5c', 180);
        if (P.hp <= 0) { P.hp = 0; shotDown(); }
      }
    }
    for (let i = ebullets.length - 1; i >= 0; i--) if (ebullets[i].life <= 0) ebullets.splice(i, 1);

    // SAM missiles: homing flight, smoke trail, impact
    for (const m of missiles) {
      const dx = P.x - m.x, dy = P.y - m.y;
      const cur = Math.atan2(m.vy, m.vx);
      let des = Math.atan2(dy, dx);
      let diff = des - cur;
      while (diff > Math.PI) diff -= 6.283185;
      while (diff < -Math.PI) diff += 6.283185;
      const turn = Math.min(Math.abs(diff), 2.3 * dt) * Math.sign(diff);
      const na = cur + turn, sp = Math.hypot(m.vx, m.vy);
      m.vx = Math.cos(na) * sp; m.vy = Math.sin(na) * sp;
      m.x += m.vx * dt; m.y += m.vy * dt; m.life -= dt;
      m.smoke -= dt;
      if (m.smoke <= 0) {
        m.smoke = 0.035;
        parts.push({ x: m.x, y: m.y, vx: (Math.random() - 0.5) * 24, vy: (Math.random() - 0.5) * 24 - 8,
                     life: 0.45, col: '#98a4b4' });
      }
      if (!state.over && Math.abs(m.x - P.x) < 30 && Math.abs(m.y - P.y) < 22) {
        m.life = 0; explode(m.x, m.y, false, true);
        P.hp -= 14 * armorMul(); P.hitFlash = 0.4; state.shake = 1;
        burst(P.x, P.y, 12, '#ff8a5c', 220);
        if (P.hp <= 0) { P.hp = 0; shotDown(); }
        continue;
      }
      if (m.y > groundY(m.x) - 2) { m.life = 0; explode(m.x, groundY(m.x) - 2, false, true); }
      if (m.x < state.camX - 200) m.life = 0;
    }
    for (let i = missiles.length - 1; i >= 0; i--) if (missiles[i].life <= 0) missiles.splice(i, 1);

    // floating text
    for (const f of floaters) { f.life -= dt; f.y -= 22 * dt; }
    for (let i = floaters.length - 1; i >= 0; i--) if (floaters[i].life <= 0) floaters.splice(i, 1);
    if (state.wcFlash > 0) state.wcFlash = Math.max(0, state.wcFlash - dt * 2.2);

    // particles
    for (const p of parts) { p.vy += 420 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    for (let i = parts.length - 1; i >= 0; i--) if (parts[i].life <= 0) parts.splice(i, 1);
  }

  function explode(x, y, byPlayer, noStructs) {
    booms.push({ x, y, life: 0.5, max: 0.5 });
    state.shake = Math.max(state.shake, 1.1);
    burst(x, y, 26, '#ffd06b', 320);
    burst(x, y, 14, '#ff6b3c', 220);
    const R = 96;
    if (!noStructs) for (const st of structs) {
      if (!st.alive) continue;
      const h = structH(st.kind), cx2 = st.x, cy2 = st.gy - h / 2;
      const dx = cx2 - x, dy = cy2 - y;
      if (dx * dx + dy * dy < R * R) {
        st.alive = false;
        burst(st.x, st.gy - 12, 14, '#c9a06a', 200);
        if (!st.civ) state.score += 25;   // military targets score; civilian buildings do not
        if (byPlayer && (st.kind === 'school' || st.kind === 'hospital')) {
          state.warCrimes++; state.wcFlash = 1.4;                // bombing a school/hospital = war crime
          floaters.push({ x: st.x, y: st.gy - structH(st.kind) - 8,
                          text: 'WAR CRIME', life: 1.8, col: '#ff6b5a' });
          burst(st.x, st.gy - structH(st.kind) / 2, 22, '#ffffff', 260);
        }
      }
    }
    for (const e of enemies) {
      if (!e.alive) continue;
      const dx = e.x - x, dy = (e.y - 26) - y;
      if (dx * dx + dy * dy < R * R) {
        e.alive = false; state.score += 100;
        burst(e.x, e.y - 26, 16, '#ff6b6b', 240);
      }
    }
  }


  // ---- towns & military bases ----
  function launchMissile(st) {
    const sx = st.x, sy = st.gy - structH(st.kind) - 2;
    const ang = Math.atan2(P.y - sy, P.x - sx);
    missiles.push({ x: sx, y: sy, vx: Math.cos(ang) * 225, vy: Math.sin(ang) * 225 - 70,
                    life: 6, smoke: 0 });
    st.fireFlash = 0.18;
    burst(sx, sy, 5, '#ffd27a', 110);
  }
  function structH(kind) {
    return ({ house: 30, school: 48, hospital: 36, tent: 20, bunker: 20,
              radar: 36, tower: 52, flag: 44, pad: 6 })[kind] || 26;
  }
  function structW(kind) {
    return ({ house: 34, school: 58, hospital: 52, tent: 28, bunker: 52,
              radar: 24, tower: 22, flag: 20, pad: 40 })[kind] || 30;
  }
  function addStruct(x, kind) {
    structs.push({ x, gy: groundY(x), kind, alive: true,
                   civ: kind === 'house' || kind === 'school' || kind === 'hospital',
                   hitT: 0, seed: Math.random() * 1000,
                   fireCd: 0.8 + Math.random() * 2.6, fireFlash: 0 });
  }
  function buildTown(cx, rnd) {
    const n = 4 + ((rnd() * 3) | 0);
    const kinds = [];
    for (let i = 0; i < n; i++) kinds.push('house');
    kinds[(rnd() * n) | 0] = 'school';
    let h = (rnd() * n) | 0;
    if (kinds[h] === 'school') h = (h + 1) % n;
    kinds[h] = 'hospital';
    const step = 66 + rnd() * 26;
    for (let i = 0; i < n; i++) {
      const x = cx + (i - (n - 1) / 2) * step + (rnd() - 0.5) * 14;
      addStruct(x, kinds[i]);
    }
  }
  function buildBase(cx, rnd) {
    const n = 2 + ((rnd() * 3) | 0);
    for (let i = 0; i < n; i++) addStruct(cx + i * 50 + (rnd() - 0.5) * 18, 'tent');
    addStruct(cx - 30 + (rnd() - 0.5) * 20, 'bunker');
    addStruct(cx + n * 50 + 34, 'radar');
    addStruct(cx + 24, 'tower');
    addStruct(cx + n * 50 + 84, 'flag');
    addStruct(cx + 96, 'pad');
  }
  function ensureStructs() {
    while (genX < state.camX + VW + 500) {
      const rnd = mulberry(hash32(genX | 0));
      if (rnd() < 0.42) buildBase(genX, rnd); else buildTown(genX, rnd);
      genX += 1000 + rnd() * 900;
    }
    for (let i = structs.length - 1; i >= 0; i--)
      if (structs[i].x < state.camX - 700) structs.splice(i, 1);
  }

  function drawStructs() {
    for (const st of structs) {
      const sx = st.x - state.camX;
      if (sx < -140 || sx > VW + 140) continue;
      ctx.save(); ctx.translate(sx, st.gy);
      if (!st.alive) { drawRubble(st); ctx.restore(); continue; }
      switch (st.kind) {
        case 'house':    drawHouse(); break;
        case 'school':   drawSchool(st); break;
        case 'hospital': drawHospital(); break;
        case 'tent':     drawTent(); break;
        case 'bunker':   drawBunker(); break;
        case 'radar':    drawRadar(); break;
        case 'tower':    drawTower(); break;
        case 'flag':     drawFlag(); break;
        case 'pad':      drawPad(); break;
      }
      if ((st.kind === 'school' || st.kind === 'hospital') && st.alive) {
        const armed = st.fireCd < 1.3;
        const on = armed ? (Math.sin(state.t * 20) > 0) : (Math.sin(state.t * 4) > 0);
        const ly = st.kind === 'school' ? -72 : -46;
        ctx.fillStyle = on ? '#ff4d4d' : 'rgba(255,80,80,0.22)';
        ctx.beginPath(); ctx.arc(0, ly, 2.6, 0, 6.283); ctx.fill();
      }
      ctx.restore();
    }
  }
  function windowsRow(y, n, litSeed) {
    ctx.fillStyle = '#ffdd9a';
    for (let i = 0; i < n; i++) {
      if (((litSeed >> i) & 1) === 0) continue;
      ctx.fillRect(-((n - 1) * 6) / 2 + i * 6 - 2, y, 4, 4);
    }
  }
  function drawHouse() {
    ctx.fillStyle = '#c9a06a'; ctx.fillRect(-17, -26, 34, 26);
    ctx.fillStyle = '#8c5a3a';
    ctx.beginPath(); ctx.moveTo(-21, -26); ctx.lineTo(0, -40); ctx.lineTo(21, -26); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#5a3b27'; ctx.fillRect(-4, -14, 8, 14);
    windowsRow(-21, 4, (Math.random() * 16) | 0);
  }
  function drawSchool(st) {
    ctx.fillStyle = '#d8b480'; ctx.fillRect(-29, -28, 58, 28);
    ctx.fillStyle = '#7a5233';
    ctx.beginPath(); ctx.moveTo(-32, -28); ctx.lineTo(0, -46); ctx.lineTo(32, -28); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#b08650'; ctx.fillRect(-6, -60, 12, 20);
    ctx.fillStyle = '#7a5233';
    ctx.beginPath(); ctx.moveTo(-9, -60); ctx.lineTo(0, -70); ctx.lineTo(9, -60); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(0, -57, 4, 0, 6.283); ctx.fill();
    windowsRow(-22, 4, (st.seed * 1000 | 0));
    ctx.fillStyle = '#2b3442'; ctx.fillRect(-16, -10, 32, 9);
    ctx.fillStyle = '#ffe6a8'; ctx.font = '600 7px ui-monospace,monospace';
    ctx.textAlign = 'center'; ctx.fillText('SCHOOL', 0, -3); ctx.textAlign = 'left';
  }
  function drawHospital() {
    ctx.fillStyle = '#efe4d0'; ctx.fillRect(-26, -34, 52, 34);
    ctx.fillStyle = '#c9d8e0'; ctx.fillRect(-28, -40, 56, 7);
    ctx.fillStyle = '#e23b3b';
    ctx.fillRect(-4, -31, 8, 22); ctx.fillRect(-13, -22, 26, 8);
    for (let i = 0; i < 3; i++) { ctx.fillStyle = '#9fb0bc'; ctx.fillRect(-22 + i * 18, -8, 6, 6); }
  }
  function drawTent() {
    ctx.fillStyle = '#7a8a52';
    ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(0, -20); ctx.lineTo(14, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#5c6a3c';
    ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(0, -20); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#3f4a2a'; ctx.fillRect(-2, -9, 4, 9);
  }
  function drawBunker() {
    ctx.fillStyle = '#8d8d84';
    ctx.beginPath(); ctx.ellipse(0, 0, 26, 18, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#6f6f68'; ctx.fillRect(-26, -3, 52, 3);
    ctx.fillStyle = '#2b2e2e'; ctx.fillRect(-15, -11, 30, 4);
  }
  function drawRadar() {
    ctx.strokeStyle = '#9aa3ac'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -30); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, -30, 13, 6, -0.5, 0, 6.283); ctx.stroke();
    ctx.fillStyle = '#6fd0ff'; ctx.beginPath(); ctx.arc(2, -32, 1.6, 0, 6.283); ctx.fill();
  }
  function drawTower() {
    ctx.fillStyle = '#7a6a58';
    ctx.beginPath(); ctx.moveTo(-11, 0); ctx.lineTo(-5, -46); ctx.lineTo(5, -46); ctx.lineTo(11, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#5b4f40'; ctx.fillRect(-10, -52, 20, 8);
    ctx.fillStyle = '#2b2e2e'; ctx.fillRect(-7, -50, 14, 3);
  }
  function drawFlag() {
    ctx.strokeStyle = '#9a9a9a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -44); ctx.stroke();
    ctx.fillStyle = '#6fa83c';
    ctx.beginPath(); ctx.moveTo(0, -44);
    ctx.lineTo(20 + Math.sin(state.t * 3) * 3, -38); ctx.lineTo(0, -32); ctx.closePath(); ctx.fill();
  }
  function drawPad() {
    ctx.strokeStyle = '#c9bfd0'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, -3, 18, 6, 0, 0, 6.283); ctx.stroke();
    ctx.fillStyle = '#c9bfd0'; ctx.font = 'bold 10px ui-monospace,monospace';
    ctx.textAlign = 'center'; ctx.fillText('H', 0, 0); ctx.textAlign = 'left';
  }
  function drawRubble(st) {
    ctx.fillStyle = '#5b4a3a';
    ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(-7, -10); ctx.lineTo(3, -5);
    ctx.lineTo(12, -12); ctx.lineTo(20, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#463a2d';
    ctx.fillRect(-12, -4, 5, 3); ctx.fillRect(4, -6, 6, 3); ctx.fillRect(-2, -3, 4, 3);
  }

  function saveBest() {
    if (state.score > state.best) { state.best = state.score; try { localStorage.setItem('dc_best', String(state.best)); } catch (e) {} }
  }

  function handleBuildClick(x, y) {
    for (let i = 0; i < 4; i++) { const bw = 150, bx = 20 + i * (bw + 6), by = VH - 50; if (x >= bx && x < bx + bw && y >= by && y < by + 36) { buildAtRegion(DEF_ORDER[i]); return; } }
    const lb = { x: VW - 236, y: VH - 50, w: 216, h: 36 };
    if (x >= lb.x && x < lb.x + lb.w && y >= lb.y && y < lb.y + lb.h) { startWave(); return; }
    const db = { x: VW - 244, y: 200, w: 212, h: 30 };
    if (x >= db.x && x < db.x + db.w && y >= db.y && y < db.y + db.h) { developRegion(); return; }
    const M = mapRect();
    for (let i = 0; i < REGIONS.length; i++) {
      const p = regionScreen(REGIONS[i], M.ox, M.oy, M.s);
      if (x > p.x - 22 && x < p.x + 22 && y > p.y - 22 && y < p.y + 22) { state.region = i; return; }
    }
  }
  function drawBuild() {
    if (!islCanvas) buildIsland();
    ctx.fillStyle = '#05080f'; ctx.fillRect(0, 0, VW, VH);
    ctx.fillStyle = '#0a1220'; ctx.fillRect(0, 64, VW, VH - 64 - 62);
    const M = mapRect();
    ctx.imageSmoothingEnabled = false;
    if ((!mapCanvas && islCanvas) || cityDirty) renderCity();
    if (mapCanvas) ctx.drawImage(mapCanvas, M.ox, M.oy, M.iw, M.ih);
    // header
    ctx.textAlign = 'left'; ctx.fillStyle = '#f0b46b'; ctx.font = '700 20px ui-monospace,Menlo,monospace';
    ctx.fillText('CAMPAIGN // ISLAND', 24, 38);
    ctx.fillStyle = '#8b97a8'; ctx.font = '600 12px ui-monospace,Menlo,monospace';
    ctx.fillText('click a region \u00b7 fortify it \u00b7 DEVELOP it once you own it \u00b7 then LAUNCH', 24, 58);
    ctx.textAlign = 'right'; ctx.font = '700 16px ui-monospace,Menlo,monospace';
    ctx.fillStyle = '#ffd27a'; ctx.fillText('SCRAP ' + Math.floor(state.scrap), VW - 24, 28);
    ctx.fillStyle = '#8b97a8'; ctx.font = '600 12px ui-monospace,Menlo,monospace';
    ctx.fillText('WAVE ' + state.wave, VW - 24, 48);
    ctx.fillStyle = totalIncome() > 0 ? '#8fffa8' : '#4d5a6e';
    ctx.fillText('INCOME +' + totalIncome() + '/round', VW - 24, 68);
    ctx.textAlign = 'left';
    // region nodes
    for (let i = 0; i < REGIONS.length; i++) {
      const r = REGIONS[i], p = regionScreen(r, M.ox, M.oy, M.s), sel = i === state.region;
      ctx.fillStyle = 'rgba(5,8,15,0.72)'; ctx.fillRect(p.x - 13, p.y - 13, 26, 26);
      ctx.strokeStyle = r.owned ? '#8fffa8' : sel ? '#ffd27a' : '#9fb4d0';
      ctx.lineWidth = sel ? 3 : 2; ctx.strokeRect(p.x - 12.5, p.y - 12.5, 25, 25);
      ctx.fillStyle = r.owned ? '#8fffa8' : sel ? '#ffd27a' : '#dbe6f2';
      ctx.font = '700 14px ui-monospace,Menlo,monospace'; ctx.textAlign = 'center';
      ctx.fillText(String(i + 1), p.x, p.y + 5);
      r.structs.forEach((st, k) => { ctx.fillStyle = BUILD[st.kind].col; ctx.fillRect(p.x - 10 + k * 7, p.y + 15, 5, 5); });
      if (r.owned) {
        // development pips
        for (let k = 0; k < DEV_TIERS.length; k++) {
          ctx.fillStyle = k < r.dev ? '#8fffa8' : 'rgba(143,255,168,0.22)';
          ctx.fillRect(p.x - 9 + k * 7, p.y - 20, 5, 5);
        }
        if (devYield(r.dev) > 0) {
          ctx.fillStyle = '#b8f0c4'; ctx.font = '700 10px ui-monospace,Menlo,monospace';
          ctx.fillText('+' + devYield(r.dev), p.x, p.y - 25);
        }
      }
      if (sel || r.owned) { ctx.fillStyle = sel ? '#ffe6bf' : '#9fe6b4'; ctx.font = '600 11px ui-monospace,Menlo,monospace'; ctx.fillText(r.name, p.x, p.y + 36); }
      ctx.textAlign = 'left';
    }
    // intel panel
    const r = REGIONS[state.region];
    if (r) {
      const PX = VW - 252, PY = 72, PW = 228, PH = 190;
      ctx.fillStyle = 'rgba(6,10,18,0.88)'; ctx.fillRect(PX, PY, PW, PH);
      ctx.strokeStyle = r.owned ? 'rgba(143,255,168,0.55)' : 'rgba(120,150,190,0.5)'; ctx.lineWidth = 1;
      ctx.strokeRect(PX + 0.5, PY + 0.5, PW - 1, PH - 1);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffd27a'; ctx.font = '700 14px ui-monospace,Menlo,monospace';
      ctx.fillText(r.name, PX + 12, PY + 22);
      ctx.fillStyle = '#9fb4d0'; ctx.font = '600 12px ui-monospace,Menlo,monospace';
      ctx.fillText('terrain  ' + r.terrain, PX + 12, PY + 42);
      ctx.fillText('threat   ' + '^'.repeat(Math.min(5, r.threat)), PX + 12, PY + 59);
      ctx.fillStyle = r.owned ? '#8fffa8' : '#ff9a6a';
      ctx.fillText('status   ' + (r.owned ? 'SECURED' : 'hostile'), PX + 12, PY + 76);
      ctx.fillStyle = '#5d6b80'; ctx.fillRect(PX + 10, PY + 86, PW - 20, 1);
      if (r.owned) {
        const tier = DEV_TIERS[r.dev];
        ctx.fillStyle = '#9fb4d0'; ctx.font = '600 12px ui-monospace,Menlo,monospace';
        ctx.fillText('dev      ' + (r.dev ? DEV_TIERS[r.dev - 1].name : 'none') + '  (L' + r.dev + '/3)', PX + 12, PY + 104);
        ctx.fillStyle = '#8fffa8';
        ctx.fillText('yield    +' + devYield(r.dev) + ' scrap / round', PX + 12, PY + 121);
        // develop button
        const db = { x: PX + 12, y: PY + 128, w: PW - 24, h: 30 };
        const afford = tier && state.scrap >= tier.cost;
        ctx.fillStyle = !tier ? 'rgba(80,90,110,0.3)' : afford ? 'rgba(120,220,140,0.18)' : 'rgba(255,110,90,0.12)';
        ctx.fillRect(db.x, db.y, db.w, db.h);
        ctx.strokeStyle = !tier ? 'rgba(120,150,190,0.5)' : afford ? '#7fdc8c' : 'rgba(255,140,110,0.6)';
        ctx.lineWidth = 1; ctx.strokeRect(db.x + 0.5, db.y + 0.5, db.w - 1, db.h - 1);
        ctx.fillStyle = !tier ? '#7d8a9c' : afford ? '#b8f0c4' : '#c98a80';
        ctx.font = '700 12px ui-monospace,Menlo,monospace'; ctx.textAlign = 'center';
        ctx.fillText(!tier ? 'MAX DEVELOPMENT' : ('DEVELOP \u2192 ' + tier.name + '  ' + tier.cost + ' scrap'),
                     db.x + db.w / 2, db.y + 20);
        ctx.textAlign = 'left';
      } else {
        ctx.fillStyle = '#7d8a9c'; ctx.font = '600 12px ui-monospace,Menlo,monospace';
        ctx.fillText('develop', PX + 12, PY + 112);
        ctx.fillStyle = '#c98a80'; ctx.font = '700 12px ui-monospace,Menlo,monospace';
        ctx.fillText('capture this region first', PX + 12, PY + 134);
      }
      ctx.fillStyle = '#5d6b80'; ctx.fillRect(PX + 10, PY + 166, PW - 20, 1);
      ctx.fillStyle = '#8b97a8'; ctx.font = '600 12px ui-monospace,Menlo,monospace';
      ctx.fillText('AIRFRAMES', PX + 12, PY + 184);
      for (let i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.arc(PX + 96 + i * 15, PY + 180, 5, 0, 6.283);
        ctx.fillStyle = i < state.airframes ? '#7fdc8c' : 'rgba(127,220,140,0.22)'; ctx.fill();
      }
    }
    // build buttons
    for (let i = 0; i < 4; i++) {
      const def = BUILD[DEF_ORDER[i]], bw = 150, bh = 36, bx = 20 + i * (bw + 6), by = VH - 50;
      const has = r && r.structs.some(s => s.kind === DEF_ORDER[i]);
      ctx.fillStyle = has ? 'rgba(255,210,122,0.16)' : 'rgba(20,28,44,0.9)'; ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = has ? '#ffd27a' : 'rgba(90,120,170,0.55)'; ctx.lineWidth = 1; ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
      ctx.fillStyle = def.col; ctx.font = '700 12px ui-monospace,Menlo,monospace'; ctx.fillText((i + 1) + ' ' + def.name, bx + 8, by + 15);
      ctx.fillStyle = '#8b97a8'; ctx.font = '600 10px ui-monospace,Menlo,monospace'; ctx.fillText(def.cost + ' scrap \u00b7 ' + (has ? 'upgrade' : 'build here'), bx + 8, by + 29);
    }
    const lb = { x: VW - 236, y: VH - 50, w: 216, h: 36 };
    ctx.fillStyle = 'rgba(120,220,140,0.18)'; ctx.fillRect(lb.x, lb.y, lb.w, lb.h);
    ctx.strokeStyle = '#7fdc8c'; ctx.lineWidth = 2; ctx.strokeRect(lb.x + 0.5, lb.y + 0.5, lb.w - 1, lb.h - 1);
    ctx.fillStyle = '#b8f0c4'; ctx.font = '700 13px ui-monospace,Menlo,monospace'; ctx.textAlign = 'center';
    ctx.fillText('LAUNCH  \u25b6  ' + (r ? r.name : '') + '  [space]', lb.x + lb.w / 2, lb.y + 23);
    if (state.bannerT > 0) {
      ctx.globalAlpha = Math.min(1, state.bannerT * 1.5); ctx.fillStyle = state.bannerCol;
      ctx.font = '700 17px ui-monospace,Menlo,monospace'; ctx.textAlign = 'center';
      ctx.fillText(state.banner, 470, 34); ctx.textAlign = 'left'; ctx.globalAlpha = 1;
    }
    if (state.buildMsgT > 0) {
      ctx.globalAlpha = Math.min(1, state.buildMsgT * 2); ctx.fillStyle = '#ff6b5a';
      ctx.font = '700 13px ui-monospace,Menlo,monospace';
      ctx.fillText(state.buildMsg, VW / 2 + 100, VH - 58); ctx.globalAlpha = 1;
    }
    ctx.textAlign = 'left';
  }

  // ---- draw ----
  function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, GROUND + 60);
    g.addColorStop(0, '#101a3a'); g.addColorStop(0.5, '#4a3a63');
    g.addColorStop(0.78, '#c9764f'); g.addColorStop(1, '#f0b46b');
    ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
    // sun
    ctx.globalAlpha = 0.9;
    const sg = ctx.createRadialGradient(720, 300, 4, 720, 300, 120);
    sg.addColorStop(0, '#fff3d0'); sg.addColorStop(0.4, 'rgba(255,200,120,0.6)'); sg.addColorStop(1, 'rgba(255,180,90,0)');
    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(720, 300, 120, 0, 6.283); ctx.fill();
    ctx.globalAlpha = 1;
  }
  function duneLayer(par, base, amp, col, freq, off) {
    const camX = state.camX * par;
    ctx.beginPath(); ctx.moveTo(0, VH);
    for (let x = 0; x <= VW; x += 8) {
      const wx = camX + x;
      const y = base + Math.sin(wx * freq + off) * amp + Math.sin(wx * freq * 2.3 + off) * amp * 0.35;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(VW, VH); ctx.closePath(); ctx.fillStyle = col; ctx.fill();
  }
  // the near ground: drawn straight from groundY so the hills you see are the
  // hills you fly into (collision, enemies and shadow all use groundY too).
  function drawGroundLayer() {
    ctx.beginPath(); ctx.moveTo(0, VH);
    for (let x = 0; x <= VW; x += 4) ctx.lineTo(x, groundY(state.camX + x));
    ctx.lineTo(VW, VH); ctx.closePath();
    const g = ctx.createLinearGradient(0, GROUND - 160, 0, GROUND + 210);
    g.addColorStop(0, '#f0bb72'); g.addColorStop(0.45, '#e0a860'); g.addColorStop(1, '#a86f3d');
    ctx.fillStyle = g; ctx.fill();
  }
  function drawTerrain() {
    duneLayer(0.35, GROUND - 128, 26, '#8a5a3c', 0.0018, 0.0);
    duneLayer(0.6, GROUND - 74, 32, '#b07a45', 0.0024, 1.1);
    drawGroundLayer();
    // sunlit crest line on the near hills
    ctx.strokeStyle = 'rgba(255,226,168,0.65)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, groundY(state.camX));
    for (let x = 0; x <= VW; x += 4) ctx.lineTo(x, groundY(state.camX + x));
    ctx.stroke();
    // scrub
    ctx.fillStyle = '#6b4a2a';
    const startX = Math.floor((state.camX) / 90) * 90;
    for (let wx = startX; wx < state.camX + VW + 90; wx += 90) {
      const sx = wx - state.camX, sy = groundY(wx) - 6;
      ctx.fillRect(sx, sy, 3, 10); ctx.fillRect(sx - 4, sy + 2, 11, 2);
    }
  }
  function drawChopper() {
    const x = P.x - state.camX, y = P.y;
    ctx.save(); ctx.translate(x, y);
    // shadow
    ctx.globalAlpha = 0.25; ctx.fillStyle = '#000';
    const gy = groundY(P.x) - y; ctx.beginPath(); ctx.ellipse(4, gy - 2, 46, 9, 0, 0, 6.283); ctx.fill();
    ctx.globalAlpha = 1;
    const body = P.hitFlash > 0 ? '#ffd7d7' : '#3d4a5a';
    // tail
    ctx.fillStyle = body; ctx.fillRect(-64, -2, 46, 7);
    ctx.fillRect(-70, -26, 8, 26);
    ctx.beginPath(); ctx.moveTo(-70, -26); ctx.lineTo(-52, -26); ctx.lineTo(-70, -8); ctx.closePath(); ctx.fill();
    // tail rotor
    ctx.save(); ctx.translate(-66, -20); ctx.rotate(P.rotor * 1.6);
    ctx.strokeStyle = '#c9d3e0'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(9, 0); ctx.stroke(); ctx.restore();
    // skids
    ctx.strokeStyle = '#5a6b80'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-18, 14); ctx.lineTo(22, 14); ctx.moveTo(-10, 6); ctx.lineTo(-10, 14); ctx.moveTo(14, 6); ctx.lineTo(14, 14); ctx.stroke();
    // fuselage
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(6, 0, 40, 16, 0, 0, 6.283); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-26, -3, 18, 9, 0, 0, 6.283); ctx.fill();
    // Israeli flag insignia on the fuselage: white field, blue stripes, Star of David.
    ctx.save(); ctx.translate(-12, -1);
    ctx.fillStyle = '#f7f7f0'; ctx.fillRect(-12, -7, 24, 14);
    ctx.strokeStyle = '#263b72'; ctx.lineWidth = 1; ctx.strokeRect(-12, -7, 24, 14);
    ctx.fillStyle = '#2d55a4'; ctx.fillRect(-10.5, -5.5, 21, 2); ctx.fillRect(-10.5, 3.5, 21, 2);
    ctx.strokeStyle = '#2d55a4'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(0, -3.8); ctx.lineTo(-3.5, 2.4); ctx.lineTo(3.5, 2.4); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 3.6); ctx.lineTo(-3.5, -2.6); ctx.lineTo(3.5, -2.6); ctx.closePath(); ctx.stroke();
    ctx.restore();
    // cockpit
    const cg = ctx.createLinearGradient(20, -12, 34, 6);
    cg.addColorStop(0, '#bfe6ff'); cg.addColorStop(1, '#4f9ad0');
    ctx.fillStyle = cg; ctx.beginPath(); ctx.ellipse(30, -1, 14, 11, 0, 0, 6.283); ctx.fill();
    // nose gun
    ctx.fillStyle = '#2b3442'; ctx.fillRect(38, 4, 16, 5); ctx.fillRect(50, 5, 4, 3);
    // rotor
    ctx.save(); ctx.translate(6, -16); ctx.rotate(0);
    ctx.strokeStyle = 'rgba(200,215,235,0.55)'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(-52, 0); ctx.lineTo(52, 0); ctx.stroke();
    ctx.strokeStyle = '#c9d3e0'; ctx.lineWidth = 3;
    const a = P.rotor;
    ctx.beginPath(); ctx.moveTo(Math.cos(a) * 54, Math.sin(a) * 8); ctx.lineTo(-Math.cos(a) * 54, -Math.sin(a) * 8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(Math.cos(a + 1.57) * 54, Math.sin(a + 1.57) * 8); ctx.lineTo(-Math.cos(a + 1.57) * 54, -Math.sin(a + 1.57) * 8); ctx.stroke();
    ctx.restore();
    // mast
    ctx.fillStyle = '#2b3442'; ctx.fillRect(3, -18, 6, 10);
    ctx.restore();
  }
  function drawEnemy(e) {
    const x = e.x - state.camX, y = e.y;
    if (x < -60 || x > VW + 60) return;
    ctx.save(); ctx.translate(x, y);
    // shadow
    ctx.globalAlpha = 0.28; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(0, 0, 14, 4, 0, 0, 6.283); ctx.fill(); ctx.globalAlpha = 1;
    const bob = Math.sin(e.phase) * 2;
    // legs
    ctx.strokeStyle = '#3a2c1e'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-4, -14); ctx.lineTo(-6, 0); ctx.moveTo(4, -14); ctx.lineTo(6, 0); ctx.stroke();
    // body/robe
    ctx.fillStyle = e.kind === 'gunner' ? '#6b6f3a' : (e.kind === 'thrower' ? '#7a5330' : '#8a6a44');
    ctx.beginPath(); ctx.moveTo(-9, -30 + bob); ctx.lineTo(9, -30 + bob); ctx.lineTo(11, -12); ctx.lineTo(-11, -12); ctx.closePath(); ctx.fill();
    // head
    ctx.fillStyle = '#c99b6a'; ctx.beginPath(); ctx.arc(0, -36 + bob, 7, 0, 6.283); ctx.fill();
    // cloth wrap (generic headcloth)
    ctx.fillStyle = '#5a4426'; ctx.beginPath(); ctx.arc(0, -38 + bob, 8, Math.PI, 0); ctx.fill();
    // arms / weapon
    ctx.strokeStyle = '#3a2c1e'; ctx.lineWidth = 3;
    if (e.kind === 'gunner') { ctx.beginPath(); ctx.moveTo(6, -26 + bob); ctx.lineTo(20, -26 + bob); ctx.stroke(); ctx.fillStyle = '#222'; ctx.fillRect(16, -28 + bob, 14, 4); }
    else if (e.kind === 'thrower') { ctx.beginPath(); ctx.moveTo(6, -28 + bob); ctx.lineTo(14, -34 + bob); ctx.stroke(); }
    else { ctx.beginPath(); ctx.moveTo(6, -26 + bob); ctx.lineTo(12, -18 + bob); ctx.stroke(); }
    ctx.restore();
    // hp pips
    if (e.hp > 1) { ctx.fillStyle = '#ffe066'; for (let i = 0; i < e.hp; i++) ctx.fillRect(x - 7 + i * 6, y - 56, 4, 4); }
  }
  // live minimap during flight: the same baked map shrinks into a corner so you
  // can watch your cities grow while you fly.
  function drawMinimap() {
    if (!mapCanvas || cityDirty) renderCity();
    if (!mapCanvas) return;
    const w = 132, h = w * IH / IW;
    const x = VW - w - 18, y = 52;
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = 'rgba(5,8,15,0.7)'; ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
    ctx.drawImage(mapCanvas, x, y, w, h);
    for (let i = 0; i < REGIONS.length; i++) {
      const r = REGIONS[i], px = x + r.px * (w / IW), py = y + r.py * (h / IH);
      ctx.beginPath(); ctx.arc(px, py, 2.2, 0, 6.283);
      ctx.fillStyle = r.owned ? '#8fffa8' : '#dbe6f2'; ctx.fill();
    }
    const crg = REGIONS[state.region];
    if (crg) {
      const px = x + crg.px * (w / IW), py = y + crg.py * (h / IH);
      ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(px, py, 5, 0, 6.283); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(120,150,190,0.55)'; ctx.lineWidth = 1;
    ctx.strokeRect(x - 2.5, y - 2.5, w + 5, h + 5);
    ctx.restore();
  }
  function drawHUD() {
    ctx.save();
    ctx.font = '600 13px ui-monospace,Menlo,monospace';
    // score
    ctx.fillStyle = '#fff2d0'; ctx.textAlign = 'left';
    ctx.fillText('SCORE ' + state.score, 18, 30);
    ctx.fillStyle = '#ffd27a'; ctx.fillText('WAVE ' + state.wave, 18, 50);
    ctx.fillStyle = '#cfe3ff'; ctx.fillText('BOMBS', 18, 70);
    for (let i = 0; i < 6; i++) {
      ctx.beginPath(); ctx.arc(74 + i * 14, 66, 5, 0, 6.283);
      ctx.fillStyle = i < P.bombs ? '#8fd0ff' : 'rgba(140,160,190,0.25)'; ctx.fill();
    }
    // airframes
    ctx.fillStyle = '#8b97a8'; ctx.fillText('AIRFRAMES', 18, 92);
    for (let i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.arc(88 + i * 14, 88, 5, 0, 6.283);
      ctx.fillStyle = i < state.airframes ? '#7fdc8c' : 'rgba(127,220,140,0.22)'; ctx.fill();
    }
    const inc = totalIncome();
    if (inc > 0) { ctx.fillStyle = '#8fffa8'; ctx.fillText('INCOME +' + inc + '/round', 18, 112); }
    // region being contested
    const crg = REGIONS[state.region];
    if (crg) {
      ctx.textAlign = 'center'; ctx.fillStyle = crg.owned ? '#8fffa8' : '#ffd27a';
      ctx.fillText(crg.name + (crg.owned ? '  \u00b7  defending' : '  \u00b7  contested'), VW / 2, 30);
      ctx.textAlign = 'left';
    }
    if (state.warCrimes > 0) {
      const g = state.wcFlash > 0 ? Math.min(1, state.wcFlash) : 0;
      ctx.fillStyle = g > 0 ? '#ffffff' : '#ff6b5a';
      ctx.fillText('WAR CRIMES ' + state.warCrimes, 18, 132);
    }
    ctx.fillStyle = '#8b97a8'; ctx.textAlign = 'right';
    ctx.fillText('BEST ' + Math.max(state.best, state.score), VW - 18, 30);
    ctx.textAlign = 'left';
    // hp bar
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(18, VH - 44, 220, 16);
    ctx.fillStyle = '#ff5a4d'; ctx.fillRect(18, VH - 44, 220 * (P.hp / 100), 16);
    ctx.strokeStyle = '#5a3a3a'; ctx.strokeRect(18, VH - 44, 220, 16);
    ctx.fillStyle = '#ffd7d0'; ctx.fillText('HULL', 24, VH - 32);
    // heat bar
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(VW - 238, VH - 44, 220, 16);
    const hc = P.heat > 80 ? '#ff4d4d' : '#ffb347';
    ctx.fillStyle = hc; ctx.fillRect(VW - 238, VH - 44, 220 * (P.heat / 100), 16);
    ctx.strokeStyle = '#5a4a2a'; ctx.strokeRect(VW - 238, VH - 44, 220, 16);
    ctx.fillStyle = '#ffe6bf'; ctx.textAlign = 'right'; ctx.fillText('GUN', VW - 24, VH - 32); ctx.textAlign = 'left';
    if (P.heat >= 100) { ctx.fillStyle = '#ff5a4d'; ctx.textAlign = 'center'; ctx.fillText('OVERHEAT', VW / 2, VH - 24); }
    // crosshair
    const mx = mouse.x, my = mouse.y;
    ctx.strokeStyle = 'rgba(255,220,150,0.9)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(mx, my, 11, 0, 6.283); ctx.moveTo(mx - 18, my); ctx.lineTo(mx - 5, my);
    ctx.moveTo(mx + 5, my); ctx.lineTo(mx + 18, my); ctx.moveTo(mx, my - 18); ctx.lineTo(mx, my - 5);
    ctx.moveTo(mx, my + 5); ctx.lineTo(mx, my + 18); ctx.stroke();
    if (state.over) {
      ctx.fillStyle = 'rgba(5,7,15,0.72)'; ctx.fillRect(0, 0, VW, VH);
      ctx.textAlign = 'center';
      const won = !!state.win;
      const owned = REGIONS.filter(r => r.owned).length;
      ctx.fillStyle = won ? '#8fffa8' : '#ff6b5a'; ctx.font = '700 44px ui-monospace,Menlo,monospace';
      ctx.fillText(won ? 'ISLAND SECURED' : 'CAMPAIGN LOST', VW / 2, VH / 2 - 40);
      ctx.fillStyle = '#ffe6bf'; ctx.font = '600 20px ui-monospace,Menlo,monospace';
      ctx.fillText('score ' + state.score + '  ·  wave ' + state.wave + '  ·  regions held ' + owned + '/' + REGIONS.length, VW / 2, VH / 2 + 4);
      ctx.fillStyle = '#9fb4d0'; ctx.font = '600 15px ui-monospace,Menlo,monospace';
      ctx.fillText(won ? 'every region is yours \u00b7 the archipelago pays tribute' : 'out of airframes \u00b7 the archipelago stays free', VW / 2, VH / 2 + 30);
      const blink = 0.55 + 0.45 * Math.sin(state.t * 6);
      ctx.globalAlpha = blink; ctx.fillStyle = '#ffd27a';
      ctx.fillText('press R to fly again', VW / 2, VH / 2 + 46); ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function draw() {
    if (state.phase === 'build') { drawBuild(); return; }
    ctx.save();
    if (state.shake > 0) { ctx.translate((Math.random() - 0.5) * 10 * state.shake, (Math.random() - 0.5) * 10 * state.shake); }
    drawSky();
    drawTerrain();
    drawStructs();
    for (const e of enemies) drawEnemy(e);
    // bullets
    ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (const b of bullets) { ctx.strokeStyle = '#ffe066'; ctx.beginPath(); ctx.moveTo(b.x - state.camX, b.y); ctx.lineTo(b.x - state.camX - b.vx * 0.012, b.y - b.vy * 0.012); ctx.stroke(); }
    for (const b of ebullets) { ctx.fillStyle = '#ff8a5c'; ctx.beginPath(); ctx.arc(b.x - state.camX, b.y, 5, 0, 6.283); ctx.fill(); }
    for (const m of missiles) {
      const sx = m.x - state.camX, ang = Math.atan2(m.vy, m.vx);
      ctx.save(); ctx.translate(sx, m.y); ctx.rotate(ang);
      ctx.fillStyle = '#d8dde6'; ctx.fillRect(-6, -2, 12, 4);
      ctx.fillStyle = '#2b2e36';
      ctx.beginPath(); ctx.moveTo(6, -2); ctx.lineTo(10, 0); ctx.lineTo(6, 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ff5a3c';
      ctx.beginPath(); ctx.moveTo(-6, -2); ctx.lineTo(-13, 0); ctx.lineTo(-6, 2); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    for (const b of bombs) {
      const sx = b.x - state.camX;
      ctx.fillStyle = '#3a3f4a'; ctx.beginPath(); ctx.ellipse(sx, b.y, 4, 7, 0, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#e8c06a'; ctx.fillRect(sx - 5, b.y - 6, 10, 2);
      ctx.beginPath(); ctx.moveTo(sx - 4, b.y + 6); ctx.lineTo(sx, b.y + 12); ctx.lineTo(sx + 4, b.y + 6);
      ctx.closePath(); ctx.fillStyle = '#2a2e36'; ctx.fill();
    }
    for (const f of floaters) {
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life));
      ctx.fillStyle = f.col;
      ctx.font = '700 14px ui-monospace,Menlo,monospace';
      ctx.textAlign = 'center';
      ctx.fillText(f.text, f.x - state.camX, f.y);
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
    }
    drawChopper();
    for (const bm of booms) {
      const t = 1 - bm.life / bm.max, sx = bm.x - state.camX;
      ctx.globalAlpha = Math.max(0, 1 - t);
      ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 3 * (1 - t) + 1;
      ctx.beginPath(); ctx.arc(sx, bm.y, 12 + t * 84, 0, 6.283); ctx.stroke();
      ctx.fillStyle = 'rgba(255,140,60,0.35)';
      ctx.beginPath(); ctx.arc(sx, bm.y, 12 + t * 40, 0, 6.283); ctx.fill();
      ctx.globalAlpha = 1;
    }
    for (const p of parts) { ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.col; ctx.fillRect(p.x - state.camX - 1.5, p.y - 1.5, 3, 3); }
    ctx.globalAlpha = 1;
    ctx.restore();
    drawMinimap();
    drawHUD();
  }

  let last = 0, started = false;
  function loop(now) {
    if (!started) { started = true; last = now; }
    let dt = (now - last) / 1000; last = now;
    if (!(dt > 0)) dt = 0; else if (dt > 0.05) dt = 0.05;
    update(dt); draw();
    requestAnimationFrame(loop);
  }
  state.camX = -40; reset();
  requestAnimationFrame(loop);
  if (location.hash === "#debug") window.DC = { state, REGIONS, BASE, DEV_TIERS, buildAtRegion, developRegion, devYield, totalIncome, payYields, shotDown, endWave, startWave, reset, buildIsland, mapRect, handleBuildClick, enemies, bullets, ebullets, parts, bombs, booms, structs, missiles, P, mouse, keys, ensureStructs, get genX(){return genX;}, get camX(){return state.camX;}, frame(dt){ update(dt); draw(); },
    syncCity, cityStep, rebuildRoads, renderCity,
    get urban(){return urban;}, get road(){return road;}, get landMask(){return landMask;},
    get mapCanvas(){return mapCanvas;}, get cityCanvas(){return mapCanvas;}, get cityDirty(){return cityDirty;} };
})();
