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
    if (state.phase === 'build' || state.phase === 'battle') {
      stratKey(e.code);
      if (['Space','Enter','NumpadEnter','Digit1','Digit2','Digit3'].includes(e.code)) e.preventDefault();
    }
    if (e.code === 'KeyR' && (state.over || STR.over)) reset();
    if (e.code === 'KeyB') wantBomb = true;
  });
  window.addEventListener('keyup', e => { keys[e.code] = false; });

  const mouse = { x: 640, y: 260, down: false };
  function toLocal(cx, cy) {
    const r = cv.getBoundingClientRect();
    return { x: (cx - r.left) * VW / r.width, y: (cy - r.top) * VH / r.height };
  }
  cv.addEventListener('mousemove', e => { const p = toLocal(e.clientX, e.clientY); mouse.x = p.x; mouse.y = p.y; });
  cv.addEventListener('mousedown', e => { const p = toLocal(e.clientX, e.clientY); mouse.x = p.x; mouse.y = p.y; if (state.phase === 'build' || state.phase === 'battle') handleBuildClick(p.x, p.y); else mouse.down = true; e.preventDefault(); });
  window.addEventListener('mouseup', () => { mouse.down = false; });
  cv.addEventListener('touchstart', e => { e.preventDefault(); const t = e.touches[0]; const p = toLocal(t.clientX, t.clientY); mouse.x = p.x; mouse.y = p.y; if (state.phase === 'build' || state.phase === 'battle') handleBuildClick(p.x, p.y); else mouse.down = true; }, {passive:false});
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
    spawnCd: 1.2, waveTimer: 0, shake: 0, best: +(localStorage.getItem('dc_best') || 0),
    battle: -1, mode: 'fly'
  };

  const P = {};
  function reset() {
    state.over = false; state.score = 0; state.wave = 0; state.t = 0;
    state.warCrimes = 0; state.wcFlash = 0;
    state.spawnCd = 1.2; state.waveTimer = 0; state.shake = 0;
    state.phase = 'build'; state.scrap = 120; state.region = 0; state.airframes = 3;
    state.banner = ''; state.bannerT = 0;
    state.buildMsg = ''; state.buildMsgT = 0; state.turretCd = 0;
    BASE.length = 0; REGIONS.length = 0; cityBuildings.length = 0; islCanvas = null; mapData = null; mapCanvas = null;
    HOSTILES.length = 0; BATTLES.length = 0; hoCells = null; hoOwner = null; hoFrontier = [];
    state.battle = -1; state.mode = 'fly';
    P.x = 260; P.y = 250; P.vx = 0; P.vy = 0;
    P.hp = 100; P.heat = 0; P.fireCd = 0; P.rotor = 0; P.hitFlash = 0;
    P.bombs = 5; P.bombCd = 0; P.bombRegen = 0;
    enemies.length = 0; bullets.length = 0; ebullets.length = 0; parts.length = 0;
    bombs.length = 0; booms.length = 0; wantBomb = false;
    structs.length = 0; genX = 900;
    missiles.length = 0; floaters.length = 0;
    enemies.length = 0;
    islCanvas = null; buildIsland(); stratInit();
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

  // ---- opposing forces (hostile strongholds) ----
  // Enemy bases sit on the island, develop over rounds, and push battles onto
  // the map between their stronghold and your cities. Ignore a battle and the
  // front advances (you lose ground); sortie into it and you blunt/destroy the base.
  const HOSTILES = [];              // {px,py,name,dev,grow,alive}
  const BATTLES = [];               // {hi,region,x,y,ttl,ttlMax,dev,name}
  let hoCells = null, hoOwner = null;   // hostile territory footprint (like urban)
  let hoFrontier = [];
  const HOSTILE_NAMES = ['RED COMPOUND','IRON WORKS','BLACK KEEP','SCORPION NEST','ASH FORTRESS','SABLE YARD'];
  const HOSTILE_CAP = [10, 24, 42, 68];   // footprint cells by dev level

  // ---- campaign island: a procedural per-pixel map, rendered low-res then
  // nearest-neighbour upscaled for the pixel-art look (canvas2d has no shader
  // stage, so this is the equivalent: one colour-classification pass per pixel).
  // Double source resolution but keep the same 640x360 display footprint.
  // At 2x nearest-neighbour, terrain features read as pixel-art sprites.
  const IW = 320, IH = 180;
  const ICOL = [[19,43,77],[42,92,122],[224,203,153],[205,174,113],[183,148,93],[142,125,100],[199,187,159]];
  const REGION_NAMES = ['SALT FLAT','DUNE BASIN','THE RIDGE','OASIS','OLD HARBOR','BLACK MESA'];
  const REGION_TERRAIN = ['coastal','desert','ridge','oasis','harbor','mesa'];
  let islCanvas = null;
  let islSeed = 0;
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
    cityBuildings.length = 0;
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
      } else if (ci >= 2 && ci <= 4) {
        // Long, irregular dune ridges: pale sunward crests, warmer troughs.
        const dune = Math.sin(x * 0.11 + y * 0.072 + vnoise(x * 0.028 + seed, y * 0.028) * 2.7);
        detail += dune * (ci === 2 ? 3 : 6) + (dune > 0.72 ? 4 : 0);
      } else if (ci === 5) detail += Math.sin(x * 0.43 + y * 0.20 + patch * 0.1) * 4;
      else if (ci === 6 && ihash(x + 1701, y + 5309) > 0.93) detail += 7;
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

    // Sparse oasis patches: the land stays overwhelmingly sand and rock, with
    // a few irrigated green pockets and spring pools near inland lowlands.
    const oasis = new Uint8Array(count), oasisCenters = [];
    for (let patchIndex = 0; patchIndex < 3; patchIndex++) {
      let bestCell = -1, bestScore = -1;
      for (let i = 0; i < count; i++) {
        const h = heights[i], cd = coastDist[i];
        if (h < 0.48 || h > 0.67 || cd < 7 || cd > 48) continue;
        const x = i % IW, y = (i / IW) | 0;
        let separated = true;
        for (const q of oasisCenters) if (Math.abs(q.x - x) < 28 && Math.abs(q.y - y) < 20) { separated = false; break; }
        if (!separated) continue;
        const score = ihash(x * 17 + patchIndex * 977, y * 23 + 419) + Math.min(cd, 30) * 0.001;
        if (score > bestScore) { bestScore = score; bestCell = i; }
      }
      if (bestCell < 0) continue;
      const ox = bestCell % IW, oy = (bestCell / IW) | 0;
      oasisCenters.push({ x: ox, y: oy });
      const rx = 6 + ((ihash(ox + 151, oy + 77) * 3) | 0);
      const ry = 4 + ((ihash(ox + 19, oy + 293) * 2) | 0);
      for (let y = oy - ry; y <= oy + ry; y++) for (let x = ox - rx; x <= ox + rx; x++) {
        if (x < 0 || y < 0 || x >= IW || y >= IH) continue;
        const dx = (x - ox) / rx, dy = (y - oy) / ry, d2 = dx * dx + dy * dy;
        const i = y * IW + x;
        if (d2 > 1 || !landMask[i]) continue;
        if (d2 < 0.10) { oasis[i] = 2; paint(x, y, [72,129,142]); }  // spring pool
        else {
          oasis[i] = 1;
          const green = d2 < 0.48 ? [110,130,74] : [145,145,91];
          paint(x, y, green);
        }
      }
    }

    // Date palms clustered around the oasis pockets. Fronds and trunks are
    // hand-built in the pixel buffer; the surrounding dunes remain sparsely vegetated.
    const palmShape = [
      [0,-4,1], [-2,-3,1],[-1,-3,2],[0,-3,0],[1,-3,2],[2,-3,1],
      [-3,-2,1],[-2,-2,2],[-1,-2,0],[0,-2,0],[1,-2,0],[2,-2,2],[3,-2,1],
      [-1,-1,1],[0,-1,2],[1,-1,1], [0,0,4],[0,1,4],[0,2,4]
    ];
    const palmPal = [[99,135,66],[42,76,46],[70,105,54],[57,91,50],[137,105,64]];
    for (let gy = 4; gy < IH - 4; gy += 3) for (let gx = 4; gx < IW - 4; gx += 3) {
      const j = gy * IW + gx;
      if (oasis[j] !== 1 || ihash(gx + 309, gy + 771) < 0.48) continue;
      const tx = gx + ((ihash(gx + 110, gy + 93) * 3) | 0) - 1;
      const ty = gy + ((ihash(gx + 257, gy + 37) * 3) | 0) - 1;
      for (const [dx, dy, c] of palmShape) {
        const x = tx + dx, y = ty + dy;
        if (x < 0 || y < 0 || x >= IW || y >= IH) continue;
        const k = y * IW + x;
        if (!landMask[k] || river[k] || oasis[k] === 2) continue;
        paint(x, y, palmPal[c]);
      }
    }

    // Small olive scrub tufts break up the open sand without turning it into forest.
    for (let gy = 6; gy < IH - 5; gy += 5) for (let gx = 6; gx < IW - 5; gx += 5) {
      const j = gy * IW + gx;
      if (heights[j] < 0.48 || heights[j] > 0.70 || oasis[j] || river[j] || bank[j]) continue;
      if (ihash(gx * 3 + 731, gy * 5 + 193) < 0.94) continue;
      for (const [dx, dy, col] of [[0,0,[128,125,72]],[1,0,[158,139,83]],[-1,1,[117,119,73]]]) {
        const x = gx + dx, y = gy + dy, k = y * IW + x;
        if (landMask[k] && !oasis[k]) paint(x, y, col);
      }
    }

    // Sparse rocky tors and sunlit limestone caps break up high ground into landmarks.
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
          if (dy <= -2 && Math.abs(dx) <= 1) col = heights[k] > 0.80 ? [216,198,160] : [188,165,125];
          else if (dx + dy < 0) col = [158,139,105];
          else col = [91,82,68];
          if (heights[k] > 0.80 && ihash(x + 661, y + 71) > 0.44) col = [224,205,166];
          paint(x, y, col);
        }
      }
    }

    cx.putImageData(img, 0, 0);
    islCanvas = c;
    islSeed = seed;
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
    // enemy territory for the fresh island
    hoCells = new Uint8Array(IW * IH);
    hoOwner = new Int8Array(IW * IH).fill(-1);
    hoFrontier = [];
    spawnHostiles();
    rebuildRoads();
  }
  const REGIONS = [];
  // ---- hostile territory helpers ----
  function hostileAt(x, y) { return inb(x, y) && hoOwner && hoOwner[y * IW + x] >= 0; }
  function hostileClaim(x, y, idx) {
    const i = y * IW + x;
    if (!inb(x, y) || !landAt(x, y) || !hoCells || hoCells[i]) return false;
    if (urban[i]) return false;                 // never grow over the player's cities
    hoCells[i] = 1; hoOwner[i] = idx; hoFrontier[idx].push(i);
    cityDirty = true; return true;
  }
  function hostileCount(idx) { let n = 0; for (let i = 0; i < hoOwner.length; i++) if (hoOwner[i] === idx) n++; return n; }
  function hostileGrow(h, n) {
    const idx = HOSTILES.indexOf(h); if (idx < 0) return;
    const cap = HOSTILE_CAP[Math.min(h.dev, HOSTILE_CAP.length - 1)];
    let cur = hostileCount(idx), tries = n * 5;
    while (cur < cap && tries-- > 0) {
      const f = hoFrontier[idx]; if (!f.length) break;
      const ci = f[(crand() * f.length) | 0];
      const x = ci % IW, y = (ci / IW) | 0;
      let placed = false;
      for (let a = 0; a < 6 && !placed; a++) {
        const d = NB8[(crand() * NB8.length) | 0];
        if (hostileClaim(x + d[0], y + d[1], idx)) { placed = true; cur++; }
      }
      if (!placed) { const p = f.indexOf(ci); if (p >= 0) f.splice(p, 1); }
    }
  }
  function spawnHostiles() {
    HOSTILES.length = 0; BATTLES.length = 0; hoFrontier = [];
    if (!hoCells) return;
    hoCells.fill(0); hoOwner.fill(-1);
    // Candidate ground: land cells not sitting on top of a city. Score by
    // distance from the nearest city, then greedily pick the most isolated spots
    // so the strongholds scatter across the island instead of clustering.
    const pool = [];
    for (let y = 10; y < IH - 10; y += 3) for (let x = 10; x < IW - 10; x += 3) {
      if (!landAt(x, y)) continue;
      let onCity = false;
      for (const r of REGIONS) if (Math.abs(r.px - x) < 26 && Math.abs(r.py - y) < 22) { onCity = true; break; }
      if (onCity) continue;
      let fd = 1e9;
      for (const r of REGIONS) fd = Math.min(fd, Math.hypot(r.px - x, r.py - y));
      pool.push({ x, y, fd });
    }
    if (!pool.length) return;
    const chosen = [];
    for (let n = 0; n < 3; n++) {
      let best = null, bestScore = -1e9;
      for (const c of pool) {
        let score = c.fd;
        for (const ch of chosen) score = Math.min(score, Math.hypot(ch.x - c.x, ch.y - c.y) * 1.5);
        score += crand() * 0.01;
        if (score > bestScore) { bestScore = score; best = c; }
      }
      if (!best) break;
      chosen.push(best);
    }
    for (let i = 0; i < chosen.length; i++) {
      const c = chosen[i];
      const h = { px: c.x, py: c.y, dev: 0, grow: 0, alive: true,
                  name: HOSTILE_NAMES[i % HOSTILE_NAMES.length] };
      HOSTILES.push(h); hoFrontier[i] = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) hostileClaim(c.x + dx, c.y + dy, i);
      hostileGrow(h, 6);
    }
    cityDirty = true;
  }
  function nearestOwnedRegion(h) {
    let best = null, bd = 1e9;
    for (let i = 0; i < REGIONS.length; i++) if (REGIONS[i].owned) {
      const r = REGIONS[i], d = Math.hypot(r.px - h.px, r.py - h.py);
      if (d < bd) { bd = d; best = i; }
    }
    return best;   // null until you hold a city: no front to lose yet
  }
  function battleForHostile(i) { for (let k = 0; k < BATTLES.length; k++) if (BATTLES[k].hi === i) return k; return -1; }
  function spawnBattleFor(h, regionIdx) {
    const hi = HOSTILES.indexOf(h), r = REGIONS[regionIdx];
    if (!r) return;
    BATTLES.push({ hi, region: regionIdx, x: Math.round((h.px + r.px) / 2), y: Math.round((h.py + r.py) / 2),
                   ttl: 3, ttlMax: 3, dev: h.dev, name: h.name + ' FRONT' });
    state.banner = 'BATTLE // ' + r.name; state.bannerCol = '#ff8a6a'; state.bannerT = 3;
  }
  function growHostilesAfterRound() {
    if (!HOSTILES.length) return;
    for (let i = 0; i < HOSTILES.length; i++) {
      const h = HOSTILES[i]; if (!h.alive) continue;
      h.grow += 1 + h.dev;
      if (h.grow >= 2 + h.dev && h.dev < 3) { h.dev++; h.grow = 0; hostileGrow(h, 8 + h.dev * 6); }
      else hostileGrow(h, 3);
    }
    for (let i = 0; i < HOSTILES.length; i++) {
      const h = HOSTILES[i]; if (!h.alive) continue;
      if (battleForHostile(i) >= 0) continue;
      if (h.dev < 1) continue;
      const near = nearestOwnedRegion(h);
      if (near !== null) spawnBattleFor(h, near);
    }
    cityDirty = true;
  }
  function tickBattles() {
    for (let i = BATTLES.length - 1; i >= 0; i--) {
      const b = BATTLES[i];
      b.ttl--;
      if (b.ttl > 0) continue;
      const h = HOSTILES[b.hi], r = REGIONS[b.region];
      if (h && h.alive) { h.dev = Math.min(3, h.dev + 1); h.grow = 0; hostileGrow(h, 10); }
      if (r && r.owned) {
        if (r.dev > 0) r.dev--;
        else { r.owned = false; r.structs.length = 0; for (let k = BASE.length - 1; k >= 0; k--) if (BASE[k].region === b.region) BASE.splice(k, 1); }
      }
      state.banner = 'FRONT LOST // ' + (r ? r.name : '?'); state.bannerCol = '#ff6b5a'; state.bannerT = 3;
      BATTLES.splice(i, 1);
    }
    if (state.battle >= BATTLES.length) state.battle = -1;
    cityDirty = true;
  }
  function resolveBattleWon(i) {
    const b = BATTLES[i]; if (!b) return;
    const h = HOSTILES[b.hi];
    if (h) {
      h.dev = Math.max(0, h.dev - 1); h.grow = 0;
      if (h.dev === 0) {
        h.alive = false;
        for (let k = 0; k < hoOwner.length; k++) if (hoOwner[k] === b.hi) { hoCells[k] = 0; hoOwner[k] = -1; }
      }
    }
    state.scrap += 40 + (b.dev || 0) * 20;
    state.banner = (h && !h.alive) ? (h.name + ' DESTROYED') : ((h ? h.name : 'BASE') + ' PUSHED BACK');
    state.bannerCol = '#8fffa8'; state.bannerT = 3;
    BATTLES.splice(i, 1); state.battle = -1;
    cityDirty = true;
  }
  function selectBattle(i) {
    const b = BATTLES[i]; if (!b) return;
    state.battle = (state.battle === i) ? -1 : i;
    if (state.battle >= 0) state.region = b.region;
  }

  // ---- city growth ----
  // owning a region plants a settlement; each development level raises the
  // ceiling on how far the sprawl can creep. growth is an "eden" expansion --
  // cells are claimed off a boundary frontier so the blobs stay organic -- and
  // highways stitch the holdings together so the sprawl runs along the roads.
  let urban = null, urbanOwner = null, road = null, landMask = new Uint8Array(IW * IH);
  const cityBuildings = []; // visible pixel-art houses/shops, persistent across sorties
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

  // Buildings are small pixel-art sprites baked into the same island buffer as
  // the terrain and city pixels. Their row strings are intentionally chunky at
  // the map's 2x nearest-neighbour display scale.
  const CITY_SPRITES = {
    house: [
      '...t...', '..rRr..', '.rRRRr.', 'rRRRRRr',
      '.wwwww.', '.wVwVw.', '.wwdww.', '..bbb..'
    ],
    shop: [
      '....t....', '...rRr...', '..rRRRr..', '.rrrrrrr.',
      'wwwwwwwww', 'wVwVwVwVw', 'wWwwdwwWw', '.bbbbbbb.'
    ],
    apartment: [
      '....t....', '...rRr...', '..rRRRr..', '.rRRRRRr.',
      'wWWWWWWWw', 'wVwVwVwVw', 'wWWWWWWWw', 'wVwVwVwVw',
      'wWWwdWWWw', '.bbbbbbb.'
    ]
  };
  const CITY_INK = {
    t:[218,151,83], r:[123,64,48], R:[170,83,53],
    w:[217,185,131], W:[165,135,96], V:[55,115,132],
    d:[91,61,43], b:[51,59,54]
  };
  function addCityBuilding(idx, kind) {
    const r = REGIONS[idx]; if (!r || !r.owned) return false;
    const f = frontier[idx] || [], rows = CITY_SPRITES[kind] || CITY_SPRITES.house;
    const w = rows[0].length, h = rows.length;
    const buildingCount = cityBuildingCount(idx);
    const searchRadius = 5 + Math.min(12, buildingCount * 0.6);
    // First keep a one-pixel gap between footprints, then allow edge-touching
    // if a town is hemmed in by coast or already-developed blocks.
    for (let pass = 0; pass < 2; pass++) {
      const gap = pass === 0 ? 1 : 0;
      for (let tries = 0; tries < 320; tries++) {
        let x, y;
        if (f.length && crand() < 0.86) {
          const src = f[(crand() * f.length) | 0];
          const a = crand() * 6.283, rad = 1 + crand() * searchRadius;
          x = Math.round(src % IW + Math.cos(a) * rad);
          y = Math.round((src / IW | 0) + Math.sin(a) * rad);
        } else {
          const a = crand() * 6.283, rad = 4 + crand() * Math.max(18, searchRadius);
          x = Math.round(r.px + Math.cos(a) * rad);
          y = Math.round(r.py + Math.sin(a) * rad);
        }
        const x0 = x - (w >> 1), y0 = y - h + 1;
        let fits = true;
        for (let sy = 0; sy < h && fits; sy++) for (let sx = 0; sx < w; sx++) {
          if (rows[sy][sx] !== '.' && !landAt(x0 + sx, y0 + sy)) { fits = false; break; }
        }
        if (!fits) continue;
        let spaced = true;
        for (const b of cityBuildings) {
          const old = CITY_SPRITES[b.kind] || CITY_SPRITES.house;
          const dx = Math.abs(b.x - x), dy = Math.abs(b.y - y);
          if (dx < (w + old[0].length) / 2 + gap && dy < (h + old.length) / 2 + gap) { spaced = false; break; }
        }
        if (!spaced) continue;
        cityBuildings.push({ region: idx, x, y, kind });
        cityDirty = true;
        return true;
      }
    }
    return false;
  }
  function cityBuildingCount(idx) { let n = 0; for (const b of cityBuildings) if (b.region === idx) n++; return n; }
  function growCitiesAfterRound() {
    // A completed sortie is a visible construction beat: the urban fabric
    // spreads and every owned settlement gets new homes, plus periodic shops
    // and apartment blocks. The visual growth is persistent between waves.
    for (let i = 0; i < 8; i++) cityStep();
    for (let idx = 0; idx < REGIONS.length; idx++) {
      const r = REGIONS[idx]; if (!r.owned) continue;
      const room = Math.max(0, 64 + r.dev * 16 - cityBuildingCount(idx));
      const target = Math.min(room, 1 + (state.wave % 3 === 0 ? 1 : 0) + (r.dev >= 2 ? 1 : 0));
      for (let n = 0; n < target; n++) {
        const kind = (state.wave + idx + n) % 5 === 0 ? 'apartment'
                   : (state.wave + idx + n) % 3 === 0 ? 'shop' : 'house';
        addCityBuilding(idx, kind);
      }
    }
  }
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
      if (hoCells && hoOwner[i] >= 0 && !urban[i]) {   // hostile territory: red sprawl
        let hb = 0;
        for (const [dx, dy] of NB8) if (inb(x + dx, y + dy) && hoOwner[(y + dy) * IW + x + dx] >= 0) hb++;
        const hh = ihash(x * 13 + 7, y * 17 + 9);
        let HR, HG, HB2;
        if (hb >= 6) { HR = 122; HG = 34; HB2 = 30; }
        else if (hb >= 4) { HR = 154; HG = 54; HB2 = 42; }
        else { HR = 176; HG = 78; HB2 = 56; }
        const dn = (hh - 0.5) * 20; HR += dn; HG += dn * 0.5; HB2 += dn * 0.5;
        if (hb >= 5 && ((x % 4 === 0) !== (y % 4 === 0))) { HR = 72; HG = 44; HB2 = 40; }
        else if (hb >= 5 && hh > 0.82) { HR = 255; HG = 150; HB2 = 70; }
        d[o] = HR; d[o+1] = HG; d[o+2] = HB2; d[o+3] = 255;
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
    // Add the discrete settlement buildings last so roofs/windows stay crisp
    // above roads and terrain; transparent sprite cells preserve the map below.
    for (const b of cityBuildings) {
      const rows = CITY_SPRITES[b.kind] || CITY_SPRITES.house;
      const w = rows[0].length, x0 = b.x - (w >> 1), y0 = b.y - rows.length + 1;
      for (let sy = 0; sy < rows.length; sy++) for (let sx = 0; sx < w; sx++) {
        const ch = rows[sy][sx], col = CITY_INK[ch];
        if (col) {
          const x = x0 + sx, y = y0 + sy;
          if (!inb(x, y)) continue;
          const o = (y * IW + x) * 4;
          d[o] = col[0]; d[o+1] = col[1]; d[o+2] = col[2]; d[o+3] = 255;
        }
      }
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

  // ============================ MODERN COMMAND (Avianos-style) ============================
  // A full carbon copy of Avianos' board game, re-skinned as a modern-warfare
  // operation. Every round you and RED each draft a commander; each commander
  // grants 3 ordered actions. Actions let you bank SUPPLY, DEPLOY units,
  // MANEUVER armies across the board, CONSTRUCT facilities, REINFORCE holdings
  // and call in FIRE MISSIONS.
  //
  // Any move onto a contested tile is auto-resolved by the unit
  // ROCK-PAPER-SCISSORS cycle and then replayed in a short battlefield viewer
  // so you can watch the outcome:
  //
  //     INF > ART > ARM > HEL > DRN > INF
  //
  // Win by taking RED's HQ, or by holding 3 of the 5 neutral objectives for
  // two consecutive rounds. Lose if RED takes yours or does the same to you.
  const GX = 6, GY = 4;                       // board: 6 x 4 tiles
  const FW = 0, FR = 1;                       // faction ids: BLUE (you), RED
  const FNAME = ['BLUE', 'RED'];
  const FCOL = ['#6cc4ff', '#ff6b5a'];
  const CMD = [
    { name: 'IRONSIDE', col: '#ff8a4c', acts: ['produce', 'recruit', 'move'] },
    { name: 'HAWK',     col: '#6cc4ff', acts: ['move', 'build', 'recruit'] },
    { name: 'OVERWATCH', col: '#7fd0ff', acts: ['produce', 'build', 'miracle'] },
    { name: 'VIPER',    col: '#c9a6ff', acts: ['muster', 'move', 'trade'] },
    { name: 'ARCLIGHT', col: '#ffd27a', acts: ['produce', 'recruit', 'miracle'] },
  ];
  const ACT_LABEL = {
    produce: 'LOGISTICS', recruit: 'DEPLOY', move: 'MANEUVER',
    build: 'CONSTRUCT', muster: 'REINFORCE', trade: 'REQUISITION', miracle: 'FIRE MISSION',
  };
  const UNIT_K = ['inf', 'art', 'arm', 'hel', 'drn'];
  const UNAME = { inf: 'INFANTRY', art: 'ARTILLERY', arm: 'ARMOR', hel: 'HELICOPTER', drn: 'DRONE' };
  const UABBR = { inf: 'INF', art: 'ART', arm: 'ARM', hel: 'HEL', drn: 'DRN' };
  const UCOST = { inf: 3, art: 5, arm: 7, hel: 7, drn: 5 };
  const UPOW = { inf: 1.0, art: 1.4, arm: 2.0, hel: 1.8, drn: 1.2 };
  const UBEAT = { inf: 'art', art: 'arm', arm: 'hel', hel: 'drn', drn: 'inf' };
  const UCOL = { inf: '#cfe0ff', art: '#ffb060', arm: '#9fe08a', hel: '#8fd8ff', drn: '#e0a8ff' };
  const BLD = {
    seed:    { name: 'LOGISTICS DEPOT', cost: 2 },
    nest:    { name: 'BARRACKS',        cost: 3 },
    worship: { name: 'INTEL CENTER',    cost: 3 },
    bath:    { name: 'MOTOR POOL',      cost: 4 },
  };
  const BLD_K = ['seed', 'nest', 'worship', 'bath'];
  const BLDCOL = { seed: '#ffd27a', nest: '#ff8a6a', worship: '#c9a6ff', bath: '#7fd0ff' };
  const TCOL = { grass: '#6f7d54', forest: '#44663f', fossil: '#a89060', mountain: '#8a8f96' };
  const TNAME = { grass: 'PLAINS', forest: 'WOODS', fossil: 'RUINS', mountain: 'RIDGE' };
  const RES_LABEL = { seed: 'SUPPLY', worker: 'FUEL', bone: 'INTEL' };
  const MIR = [
    { id: 'offering',  name: 'SUPPLY DROP', cost: 3 },
    { id: 'lightning', name: 'AIRSTRIKE',   cost: 6 },
    { id: 'freeze',    name: 'EMP BLAST',   cost: 4 },
  ];
  const OBJECTIVES = 5;                        // neutral objectives on the board
  const HOLD_TO_WIN = 3;                       // hold N objectives for 2 rounds to win
  const ROUND_LIMIT = 30;                      // after this, most objectives wins

  const STR = {
    ready: false, tiles: [], N: 0,
    turn: 0, round: 1, stage: 'pick', avail: [], anc: -1, actIdx: 0,
    armed: null, sel: -1, sel2: -1, kind: 'seed', ukind: 'inf', mirakind: 'offering',
    res: [{ seed: 0, worker: 0, bone: 0 }, { seed: 0, worker: 0, bone: 0 }],
    favor: [0, 0], hold: [0, 0], over: false, win: false,
    msg: '', msgT: 0, aiT: 0, battle: null, view: null, spawned: 0, clearT: 0,
    log: [], banner: '', bannerT: 0,
  };
  function stratMsg(t) { STR.msg = t; STR.msgT = 2.2; STR.log.push(t); if (STR.log.length > 5) STR.log.shift(); }

  function landBBox() {
    let x0 = IW, y0 = IH, x1 = 0, y1 = 0, any = false;
    for (let y = 0; y < IH; y++) for (let x = 0; x < IW; x++) if (landMask[y * IW + x]) {
      any = true; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (!any) return { x0: 40, y0: 30, x1: IW - 40, y1: IH - 30 };
    return { x0, y0, x1, y1 };
  }
  function nearestLand(px, py, rad) {
    if (landAt(px, py)) return { x: px, y: py };
    for (let r = 1; r <= rad; r++) {
      for (let a = 0; a < 16; a++) {
        const ang = a / 16 * 6.283;
        const x = Math.round(px + Math.cos(ang) * r), y = Math.round(py + Math.sin(ang) * r);
        if (landAt(x, y)) return { x, y };
      }
    }
    return null;
  }
  function blankUnits() { const u = {}; for (const k of UNIT_K) u[k] = 0; return u; }
  function blankBlds() { const b = {}; for (const k of BLD_K) b[k] = 0; return b; }
  function buildBoard() {
    STR.tiles.length = 0;
    const bb = landBBox();
    const cw = (bb.x1 - bb.x0) / GX, ch = (bb.y1 - bb.y0) / GY;
    for (let r = 0; r < GY; r++) for (let c = 0; c < GX; c++) {
      const cx = bb.x0 + (c + 0.5) * cw, cy = bb.y0 + (r + 0.5) * ch;
      const pos = nearestLand(Math.round(cx), Math.round(cy), Math.round(Math.min(cw, ch) * 0.6));
      if (!pos) continue;
      const h = islandH(pos.x / IW, pos.y / IH, islSeed);
      let terr = 'grass';
      if (h < 0.46) terr = 'grass'; else if (h < 0.56) terr = 'forest';
      else if (h < 0.66) terr = 'fossil'; else terr = 'mountain';
      STR.tiles.push({ c, r, px: pos.x, py: pos.y, terr, owner: -1,
                       units: blankUnits(), blds: blankBlds(),
                       res: null, flag: false, castle: -1, frozen: 0 });
    }
    STR.N = STR.tiles.length;
    // resource caches on neutral ground (worker = fuel, seed = supply, bone = intel)
    for (const t of STR.tiles) {
      const roll = ihash(t.px * 7 + 13, t.py * 11 + 5);
      if (t.terr === 'grass') t.res = { kind: 'worker', n: 3 };
      else if (t.terr === 'forest') t.res = { kind: 'seed', n: 12 };
      else if (t.terr === 'fossil') t.res = { kind: 'bone', n: 4 };
      else t.res = { kind: roll < 0.5 ? 'seed' : 'bone', n: roll < 0.5 ? 12 : 4 };
      if (roll > 0.88) t.res = null;
    }
    if (!STR.N) { STR.ready = false; return; }
    // home bases: BLUE owns the left edge, RED the right edge
    const sorted = STR.tiles.slice().sort((a, b) => a.px - b.px);
    const pCast = sorted[0], aCast = sorted[sorted.length - 1];
    pCast.castle = FW; pCast.owner = FW; pCast.res = null;
    aCast.castle = FR; aCast.owner = FR; aCast.res = null;
    for (const t of [pCast, aCast]) { t.units.inf = 2; t.blds.seed = 1; t.blds.nest = 1; }
    // neutral objectives spread across the interior
    const pool = STR.tiles.filter(t => t.castle < 0).sort((a, b) => (a.px + a.py * 0.4) - (b.px + b.py * 0.4));
    let placed = 0;
    for (let k = 0; k < OBJECTIVES && pool.length; k++) {
      const idx = Math.min(pool.length - 1, Math.round((k + 0.5) / OBJECTIVES * pool.length));
      const t = pool[idx]; if (!t || t.flag) continue;
      t.flag = true; placed++;
    }
    for (const t of pool) { if (placed >= OBJECTIVES) break; if (!t.flag) { t.flag = true; placed++; } }
    // seeded map so deterministic tests can rely on it
    STR.ready = true;
  }
  function tileAtScreen(x, y) {
    const M = mapRect();
    for (let i = 0; i < STR.N; i++) {
      const t = STR.tiles[i], sx = M.ox + t.px * M.s, sy = M.oy + t.py * M.s;
      if (Math.hypot(x - sx, y - sy) < 22) return i;
    }
    return -1;
  }
  function tileAtIsl(ix, iy) {
    let best = -1, bd = 1e9;
    for (let i = 0; i < STR.N; i++) {
      const t = STR.tiles[i], d = Math.hypot(t.px - ix, t.py - iy);
      if (d < bd) { bd = d; best = i; }
    }
    return bd < 40 ? best : -1;
  }
  function tAdj(a, b) {
    const ta = STR.tiles[a], tb = STR.tiles[b]; if (!ta || !tb) return false;
    return Math.abs(ta.c - tb.c) <= 1 && Math.abs(ta.r - tb.r) <= 1 && (ta.c !== tb.c || ta.r !== tb.r);
  }
  function armyCount(t) { let n = 0; for (const k of UNIT_K) n += t.units[k]; return n; }
  function bldCount(f, k) { let n = 0; for (const t of STR.tiles) if (t.owner === f) n += t.blds[k]; return n; }
  function flagCount(f) { let n = 0; for (const t of STR.tiles) if (t.flag && t.owner === f) n++; return n; }
  function tilesOf(f) { return STR.tiles.filter(t => t.owner === f); }
  function castleOf(f) { return STR.tiles.find(t => t.castle === f) || null; }
  function counterOf(x) { for (const k of UNIT_K) if (UBEAT[k] === x) return k; return 'inf'; }
  function firstNonZero(u) { for (const k of UNIT_K) if (u[k] > 0) return k; return 'inf'; }
  function dominantUnit(units) { let best = 'inf', bn = -1; for (const k of UNIT_K) if (units[k] > bn) { bn = units[k]; best = k; } return best; }
  function harvest(f, res) {
    if (!res) return;
    const r = STR.res[f];
    if (res.kind === 'worker') r.worker = Math.min(9, r.worker + res.n);
    else if (res.kind === 'seed') r.seed = Math.min(99, r.seed + res.n);
    else r.bone = Math.min(9, r.bone + res.n);
  }

  function stratInit() {
    STR.turn = FR; STR.round = 1; STR.stage = 'pick'; STR.anc = -1; STR.actIdx = 0;
    STR.armed = null; STR.sel = -1; STR.sel2 = -1; STR.over = false; STR.win = false;
    STR.res = [{ seed: 0, worker: 0, bone: 0 }, { seed: 0, worker: 0, bone: 0 }];
    STR.favor = [0, 0]; STR.hold = [0, 0]; STR.battle = null; STR.view = null;
    STR.spawned = 0; STR.clearT = 0; STR.banner = ''; STR.bannerT = 0;
    STR.msg = ''; STR.msgT = 0; STR.aiT = 0; STR.log.length = 0;
    buildBoard();
    STR.avail = pickAvail(0, false, true); STR.aiT = 0.6;
    stratMsg('RED HQ IS DRAFTING ...');
  }
  // commanders go on cooldown for two rounds: keep it simple with a rotating offer
  const ancCd = [0, 0, 0, 0, 0];
  function pickAvail(round, isPlayer, first) {
    const out = [];
    for (let i = 0; i < CMD.length; i++) if (ancCd[i] <= 0) out.push(i);
    while (out.length < 3) for (let i = 0; i < CMD.length; i++) if (out.indexOf(i) < 0) out.push(i);
    for (let i = out.length - 1; i > 0; i--) { const j = (crand() * (i + 1)) | 0; const tmp = out[i]; out[i] = out[j]; out[j] = tmp; }
    return out.slice(0, 3);
  }
  function tickAncCd() { for (let i = 0; i < CMD.length; i++) if (ancCd[i] > 0) ancCd[i]--; }
  function pray(f, ai) {
    STR.anc = ai; ancCd[ai] = 2;
    STR.actIdx = 0; STR.stage = 'act'; STR.armed = null; STR.sel = -1; STR.sel2 = -1;
    STR.favor[f]++;
    stratMsg((f === FW ? 'YOU TAKE ' : 'RED TAKES ') + CMD[ai].name);
    if (STR.turn === FR) STR.aiT = 0.9;
  }
  function curAct() { return STR.anc >= 0 ? CMD[STR.anc].acts[STR.actIdx] : null; }
  function skipAct() { STR.armed = null; STR.sel = -1; STR.sel2 = -1; STR.actIdx++; endTurnIfDone(); }
  function endTurnIfDone() {
    if (STR.actIdx >= 3) {
      STR.armed = null; STR.sel = -1; STR.sel2 = -1;
      if (STR.turn === FR) { STR.turn = FW; STR.stage = 'pick'; STR.avail = pickAvail(STR.round, true, false); }
      else endRound();
    }
  }
  function endRound() {
    tickAncCd();
    STR.round++;
    for (let f = 0; f < 2; f++) {
      if (flagCount(f) >= HOLD_TO_WIN) STR.hold[f]++; else STR.hold[f] = 0;
    }
    if (!STR.over) {
      if (STR.hold[FW] >= 2) { STR.over = true; STR.win = true; return; }
      if (STR.hold[FR] >= 2) { STR.over = true; STR.win = false; return; }
      if (!castleOf(FW)) { STR.over = true; STR.win = false; return; }
      if (!castleOf(FR)) { STR.over = true; STR.win = true; return; }
      if (STR.round > ROUND_LIMIT) {
        const bf = flagCount(FW), rf = flagCount(FR);
        if (bf !== rf) { STR.over = true; STR.win = bf > rf; return; }
        let bu = 0, ru = 0;
        for (const t of STR.tiles) { if (t.owner === FW) bu += armyCount(t); else if (t.owner === FR) ru += armyCount(t); }
        STR.over = true; STR.win = bu >= ru; return;
      }
    }
    // barracks reinforce their holdings each round (symmetric for both factions)
    for (const f of [FW, FR])
      for (const t of STR.tiles) if (t.owner === f && t.blds.nest > 0 && armyCount(t) < 10) t.units.inf += 1;
    STR.turn = FR; STR.stage = 'pick'; STR.avail = pickAvail(STR.round, false, true); STR.anc = -1; STR.aiT = 0.7;
    stratMsg('ROUND ' + STR.round + ' // RED DRAFTING');
  }

  // ---- resources ----
  function pay(f, cost) {
    const r = STR.res[f];
    for (const k in cost) if ((r[k] || 0) < cost[k]) return false;
    for (const k in cost) r[k] -= cost[k];
    return true;
  }
  function gain(f, g) { const r = STR.res[f]; for (const k in g) r[k] = Math.min(k === 'seed' ? 99 : 9, (r[k] || 0) + g[k]); }

  // ---- actions ----
  function actProduce(f) {
    const g = { seed: 10, worker: 0, bone: 0 };
    g.seed += 3 * bldCount(f, 'seed');
    g.worker += 1 * bldCount(f, 'bath');
    g.bone += 1 * bldCount(f, 'worship');
    gain(f, g);
    stratMsg(actPrefix(f) + 'LOGISTICS +' + g.seed + ' SUPP' + (g.worker ? ' +' + g.worker + ' FUEL' : '') + (g.bone ? ' +' + g.bone + ' INTEL' : ''));
  }
  function actMuster(f) {
    const nests = tilesOf(f).filter(t => t.blds.nest > 0);
    if (!nests.length) { stratMsg(actPrefix(f) + 'NO BARRACKS'); return; }
    for (const t of nests) t.units.inf += 2;
    stratMsg(actPrefix(f) + 'REINFORCE +2 INF x' + nests.length);
  }
  function actTrade(f) {
    const r = STR.res[f];
    if (r.bone >= 1) { r.bone--; r.seed = Math.min(99, r.seed + 4); stratMsg(actPrefix(f) + '1 INTEL -> 4 SUPPLY'); }
    else if (r.seed >= 4) { r.seed -= 4; r.worker = Math.min(9, r.worker + 1); stratMsg(actPrefix(f) + '4 SUPPLY -> 1 FUEL'); }
    else stratMsg(actPrefix(f) + 'NOTHING TO TRADE');
  }
  function actRecruit(f, tileIdx, unit) {
    const t = STR.tiles[tileIdx]; if (!t || t.owner !== f || t.blds.nest <= 0) return false;
    const cost = UCOST[unit]; if (!pay(f, { seed: cost })) { stratMsg(actPrefix(f) + 'NEED ' + cost + ' SUPPLY'); return false; }
    t.units[unit]++; stratMsg(actPrefix(f) + 'DEPLOY ' + UNAME[unit] + ' @ ' + tName(tileIdx));
    return true;
  }
  function actBuild(f, tileIdx, kind) {
    const t = STR.tiles[tileIdx]; if (!t || t.owner !== f) return false;
    const b = BLD[kind];
    if (!pay(f, { worker: b.cost })) { stratMsg(actPrefix(f) + 'NEED ' + b.cost + ' FUEL'); return false; }
    t.blds[kind]++; stratMsg(actPrefix(f) + b.name + ' @ ' + tName(tileIdx));
    return true;
  }
  function actMiracle(f, tileIdx, kind) {
    const r = STR.res[f];
    if (kind === 'lightning') {
      if (r.bone < 6) { stratMsg(actPrefix(f) + 'NEED 6 INTEL'); return false; }
      if (tileIdx < 0) return false;
      const t = STR.tiles[tileIdx]; if (!t || t.owner === f) return false;
      const n = armyCount(t); r.bone -= 6;
      for (const k of UNIT_K) t.units[k] = 0;
      stratMsg(actPrefix(f) + 'AIRSTRIKE ON ' + tName(tileIdx) + ' (-' + n + ')');
      return true;
    }
    if (kind === 'freeze') {
      if (r.bone < 4) { stratMsg(actPrefix(f) + 'NEED 4 INTEL'); return false; }
      if (tileIdx < 0) return false;
      const t = STR.tiles[tileIdx]; if (!t || t.owner === f) return false;
      t.frozen = 2; r.bone -= 4; stratMsg(actPrefix(f) + 'EMP BLAST @ ' + tName(tileIdx));
      return true;
    }
    if (r.bone < 3) { stratMsg(actPrefix(f) + 'NEED 3 INTEL'); return false; }
    r.bone -= 3; gain(f, { seed: 8, worker: 3, bone: 0 });
    stratMsg(actPrefix(f) + 'SUPPLY DROP +8 SUPP +3 FUEL');
    return true;
  }
  // returns false (invalid), true (resolved now) or 'battle' (viewer launched)
  function actMove(f, fromIdx, toIdx) {
    const a = STR.tiles[fromIdx], b = STR.tiles[toIdx];
    if (!a || !b || a.owner !== f || !tAdj(fromIdx, toIdx)) return false;
    if (a.frozen > 0) { stratMsg(actPrefix(f) + 'ARMY FROZEN'); return false; }
    if (armyCount(a) <= 0) { stratMsg(actPrefix(f) + 'NO ARMY THERE'); return false; }
    if (b.owner === f) {
      for (const k of UNIT_K) { b.units[k] += a.units[k]; a.units[k] = 0; }
      stratMsg(actPrefix(f) + 'REINFORCED ' + tName(toIdx));
      return true;
    }
    if (b.owner < 0 || armyCount(b) <= 0) {
      b.owner = f;
      harvest(f, b.res); b.res = null;
      for (const k of UNIT_K) { b.units[k] += a.units[k]; a.units[k] = 0; }
      stratMsg(actPrefix(f) + 'SEIZED ' + tName(toIdx));
      return true;
    }
    launchBattle(f, fromIdx, toIdx);
    return 'battle';
  }
  function actPrefix(f) { return f === FW ? '' : 'RED: '; }
  function tName(i) { const t = STR.tiles[i]; return t ? TNAME[t.terr].slice(0, 4) + ' ' + (i + 1) : '?'; }

  // ---- battle resolution (rock-paper-scissors) ----
  // How effective `units` are against `enemyUnits`: each type's weight is
  // scaled up when the enemy fields the type it counters, and down when the
  // enemy fields its own counter.
  function armyPower(units, enemyUnits) {
    let p = 0, eTot = 0;
    for (const k of UNIT_K) eTot += enemyUnits[k];
    if (eTot <= 0) eTot = 1;
    for (const k of UNIT_K) {
      const n = units[k];
      if (n <= 0) continue;
      let good = 0, bad = 0;
      for (const j of UNIT_K) {
        if (j === UBEAT[k]) good += enemyUnits[j];
        if (UBEAT[j] === k) bad += enemyUnits[j];
      }
      const mul = Math.max(0.25, 1 + 0.9 * (good - bad) / eTot);
      p += n * UPOW[k] * mul;
    }
    return p;
  }
  function resolveBattle(fromIdx, toIdx) {
    const a = STR.tiles[fromIdx], d = STR.tiles[toIdx];
    const PA = armyPower(a.units, d.units);
    let PD = armyPower(d.units, a.units);
    const fortMul = (d.castle >= 0 ? 1.35 : d.flag ? 1.2 : 1.05);
    PD *= fortMul;
    const aWins = PA > PD;
    let frac;
    if (aWins) frac = clamp01(1 - PD / Math.max(1e-6, PA), 0.15, 0.85);
    else frac = clamp01(1 - PA / Math.max(1e-6, PD), 0.15, 0.85);
    return { aWins, PA, PD, fortMul, frac };
  }
  function clamp01(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function snap(u) { const o = {}; for (const k of UNIT_K) o[k] = u[k]; return o; }

  function launchBattle(attacker, fromIdx, toIdx) {
    const a = STR.tiles[fromIdx], b = STR.tiles[toIdx];
    const res = resolveBattle(fromIdx, toIdx);
    STR.battle = { attacker, from: fromIdx, to: toIdx, res };
    STR.view = {
      t: 0, dur: 3.0, res, from: fromIdx, to: toIdx,
      atk: snap(a.units), def: snap(b.units),
    };
    STR.spawned = 1; STR.clearT = 0;   // keeps dormant fly-phase code harmless
    state.phase = 'battle';
    stratMsg((attacker === FW ? 'YOU ASSAULT ' : 'RED ASSAULTS ') + tName(toIdx));
  }
  function applyBattleResult() {
    const bt = STR.battle; if (!bt) return;
    const a = STR.tiles[bt.from], d = STR.tiles[bt.to];
    const res = bt.res;
    if (res.aWins) {
      let tot = 0;
      const surv = {};
      for (const k of UNIT_K) { surv[k] = Math.max(0, Math.round(a.units[k] * res.frac)); tot += surv[k]; }
      if (tot <= 0) surv[firstNonZero(a.units)] = 1;
      d.owner = bt.attacker;
      for (const k of UNIT_K) { d.units[k] = surv[k]; a.units[k] = 0; }
      harvest(bt.attacker, d.res); d.res = null;
      if (d.castle === (bt.attacker === FW ? FR : FW)) {
        STR.over = true; STR.win = bt.attacker === FW;
      }
      stratMsg((bt.attacker === FW ? '' : 'RED: ') + 'TOOK ' + tName(bt.to));
    } else {
      for (const k of UNIT_K) {
        a.units[k] = 0;
        d.units[k] = Math.max(0, Math.round(d.units[k] * res.frac));
      }
      stratMsg((bt.attacker === FW ? 'BLUE: ' : 'RED: ') + tName(bt.to) + ' HELD');
    }
  }
  function completeAction() {
    STR.armed = null; STR.sel = -1; STR.sel2 = -1;
    if (STR.over) return;
    STR.actIdx++;
    endTurnIfDone();
  }
  function finishBattle() {
    applyBattleResult();
    STR.view = null; STR.battle = null;
    state.phase = 'build';
    completeAction();
  }
  // legacy hook kept for the dormant fly-phase code / debug exports
  function resolvePlayerBattle(won) {
    if (STR.battle) {
      if (!won) STR.battle.res.aWins = false;
      finishBattle();
    }
  }

  // ---- player input ----
  function stratClick(x, y) {
    if (state.phase === 'battle' && STR.view) { STR.view.t = STR.view.dur; return; }
    if (STR.over || !STR.ready) return;
    if (STR.battle) return;
    if (stratUI(x, y)) return;
    if (STR.stage !== 'act' || STR.turn !== FW) return;
    const ti = tileAtScreen(x, y);
    if (ti < 0) return;
    const act = curAct();
    if (!STR.armed) { STR.sel = ti; return; }
    if (STR.armed === 'move') {
      if (STR.sel < 0) { if (STR.tiles[ti].owner === FW) STR.sel = ti; return; }
      if (ti === STR.sel) { STR.sel = -1; return; }
      const r = actMove(FW, STR.sel, ti);
      if (r === 'battle') { STR.armed = null; STR.sel = -1; }
      else if (r) { STR.armed = null; STR.sel = -1; STR.actIdx++; endTurnIfDone(); }
      else STR.sel = ti;
      return;
    }
    if (STR.armed === 'build') {
      if (actBuild(FW, ti, STR.kind)) { STR.armed = null; STR.actIdx++; endTurnIfDone(); }
      return;
    }
    if (STR.armed === 'recruit') {
      if (actRecruit(FW, ti, STR.ukind)) { STR.armed = null; STR.actIdx++; endTurnIfDone(); }
      return;
    }
    if (STR.armed === 'miracle') {
      if (STR.mirakind === 'offering') { if (actMiracle(FW, ti, 'offering')) { STR.armed = null; STR.actIdx++; endTurnIfDone(); } return; }
      if (actMiracle(FW, ti, STR.mirakind)) { STR.armed = null; STR.actIdx++; endTurnIfDone(); }
      return;
    }
  }
  // returns true if the click was consumed by a UI element
  function stratUI(x, y) {
    if (STR.stage === 'pick' && STR.turn === FW) {
      for (let i = 0; i < 3; i++) {
        const bw = 208, bh = 78, bx = 168 + i * (bw + 16), by = VH - 96;
        if (x >= bx && x < bx + bw && y >= by && y < by + bh) { if (STR.avail[i] !== undefined) pray(FW, STR.avail[i]); return true; }
      }
      return false;
    }
    if (STR.stage !== 'act' || STR.turn !== FW) return false;
    for (let i = 0; i < 3; i++) {
      const bw = 176, bh = 40, bx = 22 + i * (bw + 8), by = VH - 52;
      if (x >= bx && x < bx + bw && y >= by && y < by + bh) {
        if (i < STR.actIdx) return true;
        const a = CMD[STR.anc].acts[i];
        if (i > STR.actIdx) return true;
        stratUIAct(i);
        return true;
      }
    }
    const a = curAct();
    if (a === 'build') {
      for (let i = 0; i < BLD_K.length; i++) {
        const bw = 118, bx = 22 + i * (bw + 6), by = VH - 96;
        if (x >= bx && x < bx + bw && y >= by && y < by + 28) { STR.kind = BLD_K[i]; return true; }
      }
    }
    if (a === 'recruit') {
      for (let i = 0; i < UNIT_K.length; i++) {
        const bw = 104, bx = 22 + i * (bw + 6), by = VH - 96;
        if (x >= bx && x < bx + bw && y >= by && y < by + 28) { STR.ukind = UNIT_K[i]; return true; }
      }
    }
    if (a === 'miracle') {
      for (let i = 0; i < MIR.length; i++) {
        const bw = 148, bx = 22 + i * (bw + 6), by = VH - 96;
        if (x >= bx && x < bx + bw && y >= by && y < by + 28) { STR.mirakind = MIR[i].id; return true; }
      }
    }
    const eb = { x: VW - 150, y: VH - 52, w: 128, h: 40 };
    if (x >= eb.x && x < eb.x + eb.w && y >= eb.y && y < eb.y + eb.h) { STR.actIdx = 3; endTurnIfDone(); return true; }
    return false;
  }
  function stratUIAct(i) {
    if (i !== STR.actIdx) return;
    const a = CMD[STR.anc].acts[i];
    if (a === 'produce') { actProduce(FW); STR.actIdx++; endTurnIfDone(); }
    else if (a === 'muster') { actMuster(FW); STR.actIdx++; endTurnIfDone(); }
    else if (a === 'trade') { actTrade(FW); STR.actIdx++; endTurnIfDone(); }
    else if (a === 'miracle') { if (STR.mirakind === 'offering') { actMiracle(FW, -1, 'offering'); STR.actIdx++; endTurnIfDone(); } else STR.armed = 'miracle'; }
    else STR.armed = a;
  }
  function stratKey(code) {
    if (state.phase === 'battle' && STR.view) {
      if (code === 'Space' || code === 'Enter' || code === 'NumpadEnter') STR.view.t = STR.view.dur;
      return;
    }
    if (STR.over) return;
    if (STR.stage === 'pick' && STR.turn === FW) {
      if (code === 'Digit1' && STR.avail[0] !== undefined) pray(FW, STR.avail[0]);
      if (code === 'Digit2' && STR.avail[1] !== undefined) pray(FW, STR.avail[1]);
      if (code === 'Digit3' && STR.avail[2] !== undefined) pray(FW, STR.avail[2]);
      return;
    }
    if (STR.stage !== 'act' || STR.turn !== FW) return;
    if (code === 'Space' || code === 'Enter' || code === 'NumpadEnter') { skipAct(); return; }
    if (code === 'Digit1') { const a = curAct(); if (a === 'produce' || a === 'muster' || a === 'trade' || a === 'miracle') stratUIAct(STR.actIdx); }
  }

  // ---- AI turn ----
  function aiStep(dt) {
    if (STR.over || STR.turn !== FR || STR.stage !== 'act') return;
    if (state.phase === 'battle') return;
    STR.aiT -= dt;
    if (STR.aiT > 0) return;
    STR.aiT = 0.65;
    if (STR.actIdx >= 3) return;
    const a = CMD[STR.anc].acts[STR.actIdx];
    const mine = tilesOf(FR);
    if (a === 'produce') { actProduce(FR); completeAction(); return; }
    if (a === 'muster') { actMuster(FR); completeAction(); return; }
    if (a === 'trade') { actTrade(FR); completeAction(); return; }
    if (a === 'build') {
      const t = mine.find(x => x.blds.seed + x.blds.nest + x.blds.worship + x.blds.bath < 3) || mine[0];
      if (t) {
        const ti = STR.tiles.indexOf(t);
        for (const k of ['nest', 'seed', 'worship', 'bath'])
          if (STR.res[FR].worker >= BLD[k].cost) { actBuild(FR, ti, k); break; }
      }
      completeAction(); return;
    }
    if (a === 'recruit') {
      const bar = mine.filter(t => t.blds.nest > 0);
      if (bar.length) {
        const ti = STR.tiles.indexOf(bar[0]);
        // draft a counter to whatever BLUE fields most
        let blueUnits = blankUnits();
        for (const t of tilesOf(FW)) for (const k of UNIT_K) blueUnits[k] += t.units[k];
        const want = counterOf(dominantUnit(blueUnits));
        const order = [want, 'inf', 'art', 'arm'];
        for (const u of order) if (STR.res[FR].seed >= UCOST[u]) { actRecruit(FR, ti, u); break; }
      }
      completeAction(); return;
    }
    if (a === 'miracle') {
      if (STR.res[FR].bone >= 6) {
        const tg = tilesOf(FW).filter(t => armyCount(t) >= 3).sort((x, y) => armyCount(y) - armyCount(x));
        if (tg.length) { actMiracle(FR, STR.tiles.indexOf(tg[0]), 'lightning'); completeAction(); return; }
      }
      if (STR.res[FR].bone >= 3) { actMiracle(FR, -1, 'offering'); completeAction(); return; }
      completeAction(); return;
    }
    if (a === 'move') {
      const withArmy = mine.filter(t => armyCount(t) > 0 && t.frozen <= 0);
      withArmy.sort((x, y) => armyCount(y) - armyCount(x));
      const src = withArmy[0];
      if (src) {
        const si = STR.tiles.indexOf(src);
        let targets = [];
        for (let i = 0; i < STR.N; i++) if (tAdj(si, i)) {
          const t = STR.tiles[i];
          if (t.owner === FR) continue;
          let score = (t.flag ? 3 : 0) + (t.castle === FW ? 6 : 0) + (t.owner === FW ? 2 : 0);
          if (armyCount(t) > 0) score -= 1;                 // a little cautious
          score += 0.2 * crand();
          targets.push({ i, score });
        }
        targets.sort((x, y) => x.score - y.score);
        const dst = targets[targets.length - 1];
        if (dst) { const r = actMove(FR, si, dst.i); if (r === 'battle') return; }
      }
      completeAction(); return;
    }
    completeAction();
  }

  // ---- update ----
  function stratUpdate(dt) {
    if (!STR.ready) return;
    if (STR.msgT > 0) STR.msgT -= dt;
    if (state.phase === 'battle' && STR.view) {
      STR.view.t += dt;
      if (STR.view.t >= STR.view.dur) finishBattle();
      return;
    }
    if (STR.over) return;
    if (STR.turn === FR && STR.stage === 'pick') {
      STR.aiT -= dt;
      if (STR.aiT <= 0) {
        const ai = STR.avail[(crand() * STR.avail.length) | 0];
        pray(FR, ai === undefined ? 0 : ai);
      }
      return;
    }
    if (STR.turn === FR && STR.stage === 'act') aiStep(dt);
  }

  // ---- draw ----
  function drawStrategy() {
    if (!islCanvas) buildIsland();
    if (!STR.ready) buildBoard();
    ctx.fillStyle = '#05080f'; ctx.fillRect(0, 0, VW, VH);
    ctx.fillStyle = '#0a1220'; ctx.fillRect(0, 64, VW, VH - 64 - 60);
    const M = mapRect();
    ctx.imageSmoothingEnabled = false;
    if ((!mapCanvas && islCanvas) || cityDirty) renderCity();
    if (mapCanvas) ctx.drawImage(mapCanvas, M.ox, M.oy, M.iw, M.ih);
    // adjacency links
    ctx.lineWidth = 1;
    for (let i = 0; i < STR.N; i++) for (let j = i + 1; j < STR.N; j++) if (tAdj(i, j)) {
      const a = STR.tiles[i], b = STR.tiles[j];
      const ax = M.ox + a.px * M.s, ay = M.oy + a.py * M.s, bx = M.ox + b.px * M.s, by = M.oy + b.py * M.s;
      ctx.strokeStyle = (a.owner >= 0 && a.owner === b.owner) ? FCOL[a.owner] + '66' : 'rgba(150,170,200,0.18)';
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    }
    // tiles
    for (let i = 0; i < STR.N; i++) {
      const t = STR.tiles[i], sx = M.ox + t.px * M.s, sy = M.oy + t.py * M.s;
      const R = 17;
      ctx.beginPath(); ctx.arc(sx, sy, R, 0, 6.283);
      ctx.fillStyle = TCOL[t.terr]; ctx.fill();
      if (t.owner >= 0) { ctx.globalAlpha = 0.42; ctx.fillStyle = FCOL[t.owner]; ctx.fill(); ctx.globalAlpha = 1; }
      ctx.lineWidth = t.owner >= 0 ? 2.5 : 1.2;
      ctx.strokeStyle = t.owner >= 0 ? FCOL[t.owner] : 'rgba(20,28,40,0.8)';
      ctx.stroke();
      // objective marker
      if (t.flag) {
        ctx.fillStyle = t.owner === FW ? '#9fd8ff' : t.owner === FR ? '#ff9a8a' : '#e8eef6';
        ctx.font = '700 13px ui-monospace,Menlo,monospace'; ctx.textAlign = 'center';
        ctx.fillText('*', sx, sy - 6); ctx.textAlign = 'left';
      }
      // HQ marker
      if (t.castle >= 0) {
        ctx.fillStyle = FCOL[t.castle]; ctx.font = '700 13px ui-monospace,Menlo,monospace';
        ctx.textAlign = 'center'; ctx.fillText('HQ', sx, sy - 6); ctx.textAlign = 'left';
      }
      // army count
      if (armyCount(t) > 0) {
        ctx.fillStyle = '#fff2d0'; ctx.font = '700 16px ui-monospace,Menlo,monospace';
        ctx.textAlign = 'center'; ctx.fillText(String(armyCount(t)), sx, sy + 6); ctx.textAlign = 'left';
      }
      // unit mix pips
      let up = -16;
      for (const k of UNIT_K) if (t.units[k] > 0) { ctx.fillStyle = UCOL[k]; ctx.fillRect(sx + up, sy + 12, 4, 4); up += 6; }
      // building pips
      let bp = 0;
      for (const k of BLD_K) for (let n = 0; n < t.blds[k]; n++) { ctx.fillStyle = BLDCOL[k]; ctx.fillRect(sx - 14 + bp * 6, sy + 20, 4, 4); bp++; }
      if (t.frozen > 0) { ctx.strokeStyle = '#8fd8ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, sy, R + 2, 0, 6.283); ctx.stroke(); }
      if (STR.sel === i || STR.sel2 === i) { ctx.strokeStyle = '#ffe6bf'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(sx, sy, R + 5, 0, 6.283); ctx.stroke(); }
    }
    // header
    ctx.textAlign = 'left'; ctx.fillStyle = '#f0b46b'; ctx.font = '700 20px ui-monospace,Menlo,monospace';
    ctx.fillText('MODERN COMMAND // OPERATION: SALT FLAT', 22, 32);
    ctx.fillStyle = '#8b97a8'; ctx.font = '600 12px ui-monospace,Menlo,monospace';
    ctx.fillText('draft a commander -> 3 ordered actions -> DEPLOY units, MANEUVER, hold ' + HOLD_TO_WIN + ' objectives 2 rounds, or take the RED HQ', 22, 52);
    ctx.fillStyle = '#5d6b80'; ctx.font = '600 11px ui-monospace,Menlo,monospace';
    ctx.fillText('combat auto-resolves by unit type: INF > ART > ARM > HEL > DRN > INF', 22, 68);
    ctx.textAlign = 'right'; ctx.font = '700 15px ui-monospace,Menlo,monospace';
    ctx.fillStyle = '#ffe6bf'; ctx.fillText('ROUND ' + STR.round, VW - 22, 30);
    ctx.fillStyle = FCOL[FW]; ctx.fillText('BLUE  ' + flagCount(FW) + ' OBJECTIVE' + (flagCount(FW) === 1 ? '' : 'S'), VW - 22, 50);
    ctx.fillStyle = FCOL[FR]; ctx.fillText('RED  ' + flagCount(FR) + ' OBJECTIVES', VW - 22, 68);
    ctx.textAlign = 'left';
    // resources
    if (STR.turn === FW || STR.stage === 'pick') {
      const r = STR.res[FW];
      ctx.fillStyle = '#ffd27a'; ctx.font = '700 14px ui-monospace,Menlo,monospace';
      ctx.fillText('SUPPLY ' + r.seed + '   FUEL ' + r.worker + '   INTEL ' + r.bone, 22, 88);
    }
    // ---- bottom UI ----
    if (STR.stage === 'pick' && STR.turn === FW && !STR.over) {
      ctx.textAlign = 'center'; ctx.font = '700 14px ui-monospace,Menlo,monospace'; ctx.fillStyle = '#ffe6bf';
      ctx.fillText('DRAFT A COMMANDER', VW / 2, VH - 106);
      for (let i = 0; i < 3; i++) {
        const bw = 208, bh = 78, bx = 168 + i * (bw + 16), by = VH - 96, ai = STR.avail[i];
        if (ai === undefined) continue;
        ctx.fillStyle = 'rgba(16,22,36,0.95)'; ctx.fillRect(bx, by, bw, bh);
        ctx.strokeStyle = CMD[ai].col; ctx.lineWidth = 2; ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
        ctx.fillStyle = CMD[ai].col; ctx.font = '700 16px ui-monospace,Menlo,monospace';
        ctx.fillText(CMD[ai].name, bx + bw / 2, by + 24);
        ctx.fillStyle = '#9fb4d0'; ctx.font = '600 11px ui-monospace,Menlo,monospace';
        ctx.fillText(CMD[ai].acts.map(x => ACT_LABEL[x]).join(' > '), bx + bw / 2, by + 46);
        ctx.fillStyle = '#5d6b80'; ctx.font = '600 10px ui-monospace,Menlo,monospace';
        ctx.fillText('[' + (i + 1) + ']', bx + bw / 2, by + 66);
      }
    } else if (STR.turn === FW && !STR.over) {
      const a = curAct();
      ctx.fillStyle = CMD[STR.anc].col; ctx.font = '700 15px ui-monospace,Menlo,monospace';
      ctx.fillText(CMD[STR.anc].name, 22, VH - 66);
      for (let i = 0; i < 3; i++) {
        const bw = 176, bh = 40, bx = 22 + i * (bw + 8), by = VH - 52;
        const done = i < STR.actIdx, cur = i === STR.actIdx;
        ctx.fillStyle = done ? 'rgba(40,50,66,0.55)' : cur ? 'rgba(120,220,140,0.16)' : 'rgba(20,28,44,0.7)';
        ctx.fillRect(bx, by, bw, bh);
        ctx.strokeStyle = done ? 'rgba(90,110,140,0.4)' : cur ? '#7fdc8c' : 'rgba(90,120,170,0.4)';
        ctx.lineWidth = cur ? 2 : 1; ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
        ctx.fillStyle = done ? '#5d6b80' : cur ? '#dff7e6' : '#9fb4d0';
        ctx.font = '700 13px ui-monospace,Menlo,monospace'; ctx.textAlign = 'center';
        let extra = '';
        if (cur) {
          if (a === 'build') extra = ' . ' + BLD[STR.kind].name.split(' ')[0];
          if (a === 'recruit') extra = ' . ' + UABBR[STR.ukind];
          if (a === 'miracle') { const m = MIR.find(x => x.id === STR.mirakind); extra = ' . ' + (m ? m.name : ''); }
        }
        ctx.fillText(ACT_LABEL[CMD[STR.anc].acts[i]] + (done ? ' OK' : '') + extra, bx + bw / 2, by + 25);
        ctx.textAlign = 'left';
      }
      if (a === 'build') for (let i = 0; i < BLD_K.length; i++) {
        const bw = 118, bx = 22 + i * (bw + 6), by = VH - 96, on = STR.kind === BLD_K[i];
        ctx.fillStyle = on ? 'rgba(120,220,140,0.2)' : 'rgba(20,28,44,0.8)'; ctx.fillRect(bx, by, bw, 28);
        ctx.strokeStyle = on ? '#7fdc8c' : 'rgba(90,120,170,0.45)'; ctx.lineWidth = 1; ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, 27);
        ctx.fillStyle = on ? '#dff7e6' : '#9fb4d0'; ctx.font = '700 10px ui-monospace,Menlo,monospace'; ctx.textAlign = 'center';
        ctx.fillText(BLD[BLD_K[i]].name.split(' ')[0] + ' ' + BLD[BLD_K[i]].cost + 'F', bx + bw / 2, by + 18); ctx.textAlign = 'left';
      }
      if (a === 'recruit') for (let i = 0; i < UNIT_K.length; i++) {
        const bw = 104, bx = 22 + i * (bw + 6), by = VH - 96, on = STR.ukind === UNIT_K[i];
        ctx.fillStyle = on ? 'rgba(120,220,140,0.2)' : 'rgba(20,28,44,0.8)'; ctx.fillRect(bx, by, bw, 28);
        ctx.strokeStyle = on ? '#7fdc8c' : 'rgba(90,120,170,0.45)'; ctx.lineWidth = 1; ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, 27);
        ctx.fillStyle = on ? UCOL[UNIT_K[i]] : '#9fb4d0'; ctx.font = '700 10px ui-monospace,Menlo,monospace'; ctx.textAlign = 'center';
        ctx.fillText(UABBR[UNIT_K[i]] + ' ' + UCOST[UNIT_K[i]], bx + bw / 2, by + 18); ctx.textAlign = 'left';
      }
      if (a === 'miracle') for (let i = 0; i < MIR.length; i++) {
        const bw = 148, bx = 22 + i * (bw + 6), by = VH - 96, on = STR.mirakind === MIR[i].id;
        ctx.fillStyle = on ? 'rgba(200,150,255,0.2)' : 'rgba(20,28,44,0.8)'; ctx.fillRect(bx, by, bw, 28);
        ctx.strokeStyle = on ? '#c9a6ff' : 'rgba(90,120,170,0.45)'; ctx.lineWidth = 1; ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, 27);
        ctx.fillStyle = on ? '#efe6ff' : '#9fb4d0'; ctx.font = '700 10px ui-monospace,Menlo,monospace'; ctx.textAlign = 'center';
        ctx.fillText(MIR[i].name + ' ' + MIR[i].cost, bx + bw / 2, by + 18); ctx.textAlign = 'left';
      }
      const eb = { x: VW - 150, y: VH - 52, w: 128, h: 40 };
      ctx.fillStyle = 'rgba(255,140,90,0.14)'; ctx.fillRect(eb.x, eb.y, eb.w, eb.h);
      ctx.strokeStyle = '#ff9a6a'; ctx.lineWidth = 1.5; ctx.strokeRect(eb.x + 0.5, eb.y + 0.5, eb.w - 1, eb.h - 1);
      ctx.fillStyle = '#ffd7c0'; ctx.font = '700 13px ui-monospace,Menlo,monospace'; ctx.textAlign = 'center';
      ctx.fillText('END TURN [SPC]', eb.x + eb.w / 2, eb.y + 25); ctx.textAlign = 'left';
    } else if (STR.turn === FR && !STR.over) {
      ctx.fillStyle = '#ff8a72'; ctx.font = '700 16px ui-monospace,Menlo,monospace'; ctx.textAlign = 'center';
      ctx.fillText('RED MOVES ...', VW / 2, VH - 30); ctx.textAlign = 'left';
    }
    // status + log
    if (STR.msgT > 0) {
      ctx.globalAlpha = Math.min(1, STR.msgT * 1.6);
      ctx.fillStyle = '#ffe6bf'; ctx.font = '700 14px ui-monospace,Menlo,monospace'; ctx.textAlign = 'center';
      ctx.fillText(STR.msg, VW / 2, 108); ctx.textAlign = 'left'; ctx.globalAlpha = 1;
    }
    ctx.fillStyle = '#4d5a6e'; ctx.font = '600 11px ui-monospace,Menlo,monospace';
    for (let i = 0; i < STR.log.length; i++) ctx.fillText(STR.log[i], 22, 132 + i * 15);
    if (STR.view) drawBattleViewer();
    if (STR.over) {
      ctx.fillStyle = 'rgba(5,7,15,0.82)'; ctx.fillRect(0, 0, VW, VH);
      ctx.textAlign = 'center';
      ctx.fillStyle = STR.win ? '#8fffa8' : '#ff6b5a'; ctx.font = '700 44px ui-monospace,Menlo,monospace';
      ctx.fillText(STR.win ? 'OPERATION COMPLETE' : 'LINE COLLAPSED', VW / 2, VH / 2 - 30);
      ctx.fillStyle = '#ffe6bf'; ctx.font = '600 18px ui-monospace,Menlo,monospace';
      ctx.fillText('round ' + STR.round + '  .  objectives held ' + flagCount(FW) + '/' + OBJECTIVES, VW / 2, VH / 2 + 10);
      const blink = 0.55 + 0.45 * Math.sin(state.t * 6);
      ctx.globalAlpha = blink; ctx.fillStyle = '#ffd27a'; ctx.font = '600 15px ui-monospace,Menlo,monospace';
      ctx.fillText('press R to play again', VW / 2, VH / 2 + 42); ctx.globalAlpha = 1;
      ctx.textAlign = 'left';
    }
  }

  // A short battlefield viewer that replays the auto-resolved combat so the
  // player can still watch what happens: both armies advance, trade fire, and
  // the losers fade out as the survivors hold the ground.
  function battleFin(units, fin, k) { return Math.max(0, Math.round(units[k] * fin)); }
  function buildBattleTokens(v) {
    if (v.tok) return v.tok;
    v.finAtk = {}; v.finDef = {};
    for (const k of UNIT_K) {
      v.finAtk[k] = v.res.aWins ? Math.max(0, Math.round(v.atk[k] * v.res.frac)) : 0;
      v.finDef[k] = v.res.aWins ? 0 : Math.max(0, Math.round(v.def[k] * v.res.frac));
    }
    const mk = (units, fin, side) => {
      const toks = []; let idx = 0;
      for (const kk of UNIT_K) {
        const n = Math.min(units[kk], 8);
        const keep = units[kk] ? Math.min(n, Math.round(fin[kk] / units[kk] * n)) : 0;
        for (let i = 0; i < n; i++) {
          const r1 = ihash(side * 131 + idx * 7 + 3, kk.length * 29 + idx * 5 + 1);
          const r2 = ihash(side * 53 + idx * 11 + 9, kk.length * 17 + idx * 3 + 4);
          toks.push({
            side, k: kk, slot: idx, dead: i >= keep,
            dt: 0.26 + 0.62 * (n > 1 ? i / (n - 1) : 0.5) + r1 * 0.12,
            jx: (r1 - 0.5) * 16, jy: (r2 - 0.5) * 10,
            col: (idx % 6), row: (idx % 5),
          });
          idx++;
        }
      }
      return toks;
    };
    v.tok = { atk: mk(v.atk, v.finAtk, 0), def: mk(v.def, v.finDef, 1) };
    return v.tok;
  }
  function drawBattleViewer() {
    const v = STR.view; if (!v) return;
    const bt = STR.battle || { attacker: FW, from: v.from, to: v.to, res: v.res };
    const res = v.res, t = v.t, dur = v.dur;
    const k = Math.min(1, t / (dur * 0.72));
    const done = t > dur * 0.72;
    const tok = buildBattleTokens(v);
    const atkIsBlue = bt.attacker === FW;

    ctx.fillStyle = 'rgba(3,6,12,0.86)'; ctx.fillRect(0, 0, VW, VH);
    const pw = 780, ph = 420, px = (VW - pw) / 2, py = (VH - ph) / 2;
    ctx.fillStyle = 'rgba(10,16,28,0.99)'; ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = '#2a3b55'; ctx.lineWidth = 2; ctx.strokeRect(px + 1, py + 1, pw - 2, ph - 2);

    const terr = STR.tiles[v.to] ? STR.tiles[v.to].terr : 'grass';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd27a'; ctx.font = '700 20px ui-monospace,Menlo,monospace';
    ctx.fillText('BATTLE // ' + tName(v.to) + ' (' + TNAME[terr] + ')', VW / 2, py + 32);
    ctx.fillStyle = '#6b7a90'; ctx.font = '600 12px ui-monospace,Menlo,monospace';
    ctx.fillText('INF > ART > ARM > HEL > DRN > INF   -   auto-resolved by unit type', VW / 2, py + 54);

    // ---- battlefield band ----
    const fx0 = px + 40, fx1 = px + pw - 40, fy0 = py + 74, fy1 = py + 286;
    ctx.fillStyle = 'rgba(20,28,42,0.9)'; ctx.fillRect(fx0, fy0, fx1 - fx0, fy1 - fy0);
    ctx.strokeStyle = 'rgba(60,80,110,0.5)'; ctx.lineWidth = 1; ctx.strokeRect(fx0 + 0.5, fy0 + 0.5, fx1 - fx0 - 1, fy1 - fy0 - 1);
    const cx = (fx0 + fx1) / 2;
    // ground line + contact marker
    ctx.strokeStyle = 'rgba(120,150,190,0.35)'; ctx.setLineDash([5, 6]);
    ctx.beginPath(); ctx.moveTo(cx, fy0 + 8); ctx.lineTo(cx, fy1 - 8); ctx.stroke(); ctx.setLineDash([]);

    const ease = x => x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;

    const sideX = (side, tk) => {
      const adv = ease(k);
      const jitter = Math.sin(t * 2 + tk.slot) * 1.6;
      if (side === 0) {
        const home = fx0 + 34 + tk.col * 17 + tk.jx * 0.5;
        const contact = cx - 62 - tk.col * 9 + jitter;
        return home + (contact - home) * adv;
      }
      const home = fx1 - 34 - tk.col * 17 - tk.jx * 0.5;
      const contact = cx + 62 + tk.col * 9 - jitter;
      return home + (contact - home) * adv;
    };
    const sideY = tk => fy0 + 22 + tk.row * 34 + tk.jy;

    // tracers (only while the fight is on)
    if (k > 0.35 && k < 1) {
      const n = 10;
      for (let i = 0; i < n; i++) {
        const r1 = ihash(v.to * 61 + i, (t * 34 | 0) + i * 5);
        const r2 = ihash(i * 19 + 7, (t * 34 | 0) + 2);
        const ly = fy0 + 20 + r1 * (fy1 - fy0 - 40);
        const y2 = fy0 + 20 + r2 * (fy1 - fy0 - 40);
        const blue = (atkIsBlue ? (i % 2 === 0) : (i % 2 === 1));
        ctx.strokeStyle = blue ? 'rgba(130,195,255,0.6)' : 'rgba(255,150,120,0.6)';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(cx - 70, ly); ctx.lineTo(cx + 70, y2);
        ctx.stroke();
      }
      // muzzle flashes
      const fl = 0.5 + 0.5 * Math.sin(t * 30);
      ctx.globalAlpha = fl; ctx.fillStyle = '#ffe9b0';
      ctx.beginPath(); ctx.arc(cx - 66, fy0 + (fy1 - fy0) * 0.4, 3.5, 0, 6.283); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 66, fy0 + (fy1 - fy0) * 0.6, 3.5, 0, 6.283); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // tokens
    const drawTok = (tk) => {
      const x = sideX(tk.side, tk), y = sideY(tk);
      let a = 1;
      if (tk.dead) {
        const dt = tk.dt;
        if (k < dt) a = 1;
        else if (k > dt + 0.12) a = 0;
        else a = 1 - (k - dt) / 0.12;
      }
      if (a <= 0) return;
      ctx.globalAlpha = a;
      const fc = tk.side === 0 ? (atkIsBlue ? FCOL[0] : FCOL[1]) : (atkIsBlue ? FCOL[1] : FCOL[0]);
      ctx.fillStyle = UCOL[tk.k];
      ctx.fillRect(x - 7, y - 7, 14, 14);
      ctx.strokeStyle = fc; ctx.lineWidth = 2;
      ctx.strokeRect(x - 7, y - 7, 14, 14);
      if (tk.dead && k >= tk.dt) {
        ctx.globalAlpha = 0.8 * a;
        ctx.fillStyle = '#ffd27a';
        const s = 3 + 5 * ((k - tk.dt) / 0.12);
        ctx.beginPath(); ctx.arc(x, y, s, 0, 6.283); ctx.stroke();
      }
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(8,10,16,0.85)'; ctx.font = '700 8px ui-monospace,Menlo,monospace'; ctx.textAlign = 'center';
      ctx.fillText(UABBR[tk.k], x, y + 3);
      ctx.textAlign = 'left'; ctx.globalAlpha = 1;
    };
    for (const tk of tok.def) drawTok(tk);
    for (const tk of tok.atk) drawTok(tk);

    // ---- army rosters ----
    const roster = (units, fin, side, align) => {
      const bx = side === 0 ? fx0 + 4 : fx1 - 4;
      let y = fy1 + 14;
      ctx.textAlign = side === 0 ? 'left' : 'right';
      for (const kk of UNIT_K) {
        if (units[kk] <= 0) continue;
        const shown = Math.round(units[kk] + (fin[kk] - units[kk]) * k);
        const fc = side === 0 ? (atkIsBlue ? FCOL[0] : FCOL[1]) : (atkIsBlue ? FCOL[1] : FCOL[0]);
        ctx.fillStyle = UCOL[kk]; ctx.fillRect(side === 0 ? bx : bx - 12, y - 8, 12, 10);
        ctx.fillStyle = fin[kk] <= 0 && done ? '#7a5a5a' : fc;
        ctx.font = '700 13px ui-monospace,Menlo,monospace';
        const txt = shown + ' ' + UABBR[kk];
        ctx.fillText(txt, side === 0 ? bx + 18 : bx - 18, y);
        y += 19;
      }
      ctx.textAlign = 'left';
    };
    ctx.font = '700 12px ui-monospace,Menlo,monospace';
    ctx.textAlign = 'left'; ctx.fillStyle = atkIsBlue ? FCOL[0] : FCOL[1];
    ctx.fillText('ATTACKER ' + (atkIsBlue ? 'BLUE' : 'RED'), fx0 + 4, fy1 + 4);
    ctx.textAlign = 'right'; ctx.fillStyle = atkIsBlue ? FCOL[1] : FCOL[0];
    ctx.fillText('DEFENDER ' + (atkIsBlue ? 'RED' : 'BLUE'), fx1 - 4, fy1 + 4);
    ctx.textAlign = 'left';
    roster(v.atk, v.finAtk, 0);
    roster(v.def, v.finDef, 1);

    // ---- power bar ----
    let blueP = atkIsBlue ? res.PA : res.PD;
    let redP = atkIsBlue ? res.PD : res.PA;
    const totalP = Math.max(1e-6, blueP + redP);
    const blueNow = 0.5 + (blueP / totalP - 0.5) * k;
    const bw = 520, by = py + ph - 46, bx = VW / 2 - bw / 2;
    ctx.fillStyle = '#241a30'; ctx.fillRect(bx, by, bw, 16);
    ctx.fillStyle = FCOL[0]; ctx.fillRect(bx, by, bw * blueNow, 16);
    ctx.fillStyle = FCOL[1]; ctx.fillRect(bx + bw * blueNow, by, bw * (1 - blueNow), 16);
    ctx.strokeStyle = '#3d4c63'; ctx.lineWidth = 1; ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, 15);
    ctx.fillStyle = '#8b97a8'; ctx.font = '600 11px ui-monospace,Menlo,monospace';
    ctx.fillText('BLUE ' + Math.round(blueP), bx, by - 5);
    ctx.textAlign = 'right'; ctx.fillText(Math.round(redP) + ' RED', bx + bw, by - 5); ctx.textAlign = 'center';

    if (done) {
      const win = res.aWins;
      ctx.globalAlpha = Math.min(1, (t - dur * 0.72) / (dur * 0.12));
      ctx.fillStyle = win ? (atkIsBlue ? FCOL[0] : FCOL[1]) : (atkIsBlue ? FCOL[1] : FCOL[0]);
      ctx.font = '700 22px ui-monospace,Menlo,monospace';
      const label = win ? (atkIsBlue ? 'BLUE TAKES THE TILE' : 'RED TAKES THE TILE') : (atkIsBlue ? 'BLUE REPELLED' : 'RED REPELLED');
      ctx.fillText(label, VW / 2, py + ph - 16);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = '#4d5a6e'; ctx.font = '600 11px ui-monospace,Menlo,monospace';
    ctx.fillText('click / space to skip', VW / 2, py + ph - 2);
    ctx.textAlign = 'left';
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
    buildMsg(r.name + ' → ' + t.name + '  +' + t.yield + '/round');
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
    if (STR.battle) { burst(P.x, P.y, 40, '#ff5a3c', 320); state.shake = 1.4; resolvePlayerBattle(false); return; }
    state.airframes--;
    burst(P.x, P.y, 40, '#ff5a3c', 320); state.shake = 1.4;
    // clear the battlefield so the rest of this frame is harmless
    enemies.length = 0; ebullets.length = 0; bullets.length = 0; missiles.length = 0; bombs.length = 0;
    const paid = payYields();
    if (state.airframes <= 0) {
      state.over = true; state.win = false; saveBest();
      state.banner = ''; state.bannerT = 0;
    } else {
      growCitiesAfterRound();
      if (state.mode === 'battle' && state.battle >= 0 && BATTLES[state.battle]) {
        BATTLES.splice(state.battle, 1); state.battle = -1;   // failing the assault advances the front
        for (const f of BATTLES) f.ttl--;
        for (let k = BATTLES.length - 1; k >= 0; k--) if (BATTLES[k].ttl <= 0) {
          const h = HOSTILES[BATTLES[k].hi]; if (h && h.alive) { h.dev = Math.min(3, h.dev + 1); h.grow = 0; hostileGrow(h, 10); }
          BATTLES.splice(k, 1);
        }
      }
      state.mode = 'fly';
      growHostilesAfterRound();
      tickBattles();
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
      for (let k = 0; k < 2; k++) addCityBuilding(state.region, 'house');
    }
    growCitiesAfterRound();
    if (state.mode === 'battle' && state.battle >= 0 && BATTLES[state.battle]) resolveBattleWon(state.battle);
    state.mode = 'fly';
    const paid = payYields();
    if (captured) {
      state.banner = rg.name + ' SECURED';
      state.bannerCol = '#8fffa8'; if (!(paid > 0)) state.bannerT = 2.8;
    }
    buildMsg(captured ? (rg.name + ' secured') : ('wave ' + state.wave + ' cleared'));
    // hold every region -> campaign won before the enemy gets its counter-punch
    if (REGIONS.length && REGIONS.every(r => r.owned)) { state.over = true; state.win = true; saveBest(); return; }
    growHostilesAfterRound();   // otherwise the enemy keeps developing and pushing fronts
    tickBattles();
  }
  function startWave() {
    state.wave++; state.phase = 'fly'; state.waveTimer = 0;
    P.bombs = Math.min(10, P.bombs + 2 + countBase('depot'));
    state.buildMsg = ''; state.buildMsgT = 0;
    const rg = REGIONS[state.region];
    let extra = 0;
    if (state.battle >= 0 && BATTLES[state.battle]) {   // sortie into a contested front
      const b = BATTLES[state.battle];
      state.mode = 'battle';
      extra = 3 + (b.dev || 0) * 2;
      state.banner = 'ASSAULT // ' + b.name; state.bannerCol = '#ff8a6a'; state.bannerT = 3;
    } else state.mode = 'fly';
    for (let i = 0; i < 3 + state.wave + (rg ? rg.threat - 1 : 0) + extra; i++) spawnEnemy(P.x + 700 + i * 180 + Math.random() * 120);
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

    if (state.phase === 'build' || state.phase === 'battle') {
      if (state.bannerT > 0) state.bannerT -= dt;
      stratUpdate(dt);
      autoStep(dt);
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
      if (STR.battle) {
        const alive = enemies.filter(e => e.alive).length;
        if (STR.spawned > 0 && alive === 0) {
          STR.clearT += dt;
          if (STR.clearT > 1.2) { resolvePlayerBattle(true); return; }
        } else STR.clearT = 0;
      } else {
        if (state.waveTimer > 18) { state.waveTimer = 0; endWave(); }
        state.spawnCd -= dt;
        const maxAlive = 4 + state.wave;
        if (state.spawnCd <= 0 && enemies.filter(e => e.alive).length < maxAlive) {
          spawnEnemy(P.x + 700 + Math.random() * 400);
          state.spawnCd = Math.max(0.5, 1.6 - state.wave * 0.12);
        }
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

  function handleBuildClick(x, y) { stratClick(x, y); }
  function drawBuild() { drawStrategy(); }

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
    // Stylized U.S. flag insignia on the fuselage.
    ctx.save(); ctx.translate(-12, -1);
    ctx.fillStyle = '#f7f7f0'; ctx.fillRect(-12, -7, 24, 14);
    ctx.strokeStyle = '#263b72'; ctx.lineWidth = 1; ctx.strokeRect(-12, -7, 24, 14);
    // Seven red stripes, with the upper-left blue canton.
    ctx.fillStyle = '#b8323a';
    for (let sy = -7; sy < 7; sy += 4) ctx.fillRect(-11.5, sy, 23, 2);
    ctx.fillStyle = '#274477'; ctx.fillRect(-11.5, -6.5, 11, 7.5);
    // Tiny white star marks read clearly at the game's pixel-art scale.
    ctx.fillStyle = '#f7f7f0';
    for (const [sx, sy] of [[-9,-5],[-5,-5],[-2,-5],[-8,-2],[-4,-2],[-9,0],[-5,0],[-2,0]])
      ctx.fillRect(sx, sy, 1.2, 1.2);
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
      ctx.fillText(crg.name + (crg.owned ? '  ·  defending' : '  ·  contested'), VW / 2, 30);
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
      ctx.fillText(won ? 'every region is yours · the archipelago pays tribute' : 'out of airframes · the archipelago stays free', VW / 2, VH / 2 + 30);
      const blink = 0.55 + 0.45 * Math.sin(state.t * 6);
      ctx.globalAlpha = blink; ctx.fillStyle = '#ffd27a';
      ctx.fillText('press R to fly again', VW / 2, VH / 2 + 46); ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function draw() {
    if (state.phase === 'build' || state.phase === 'battle') { drawBuild(); return; }
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
  // ============================ AUTOPLAY / DEMO ============================
  // A scripted driver that plays BLUE's side so you can sit back and watch
  // every feature fire: commander drafts, all six action types (LOGISTICS,
  // CONSTRUCT, DEPLOY, REQUISITION, REINFORCE, FIRE MISSION), MANEUVER, and
  // the auto-resolved battles with their playback. It loops forever, resting
  // on the result screen and then restarting.
  const AUTO = { on: false, wait: 0, restartAt: false };

  // rotate commanders so, over a few rounds, every action type shows up
  const AUTO_SEQ = [0, 2, 3, 1, 4]; // IRONSIDE, OVERWATCH, VIPER, HAWK, ARCLIGHT

  function autoHud() {
    try {
      const b = document.getElementById && document.getElementById('autoplayBtn');
      if (b) {
        b.textContent = AUTO.on ? '\u25A0  STOP AUTOPLAY' : '\u25B6  AUTOPLAY DEMO';
        if (b.classList) b.classList.toggle('on', AUTO.on);
      }
    } catch (e) {}
  }
  function autoStart() {
    AUTO.on = true; AUTO.wait = 0.4; AUTO.restartAt = false;
    if (STR.over || !STR.ready) { reset(); AUTO.wait = 0.9; }
    autoHud();
  }
  function autoStop() { AUTO.on = false; autoHud(); }
  function autoToggle() { return AUTO.on ? autoStop() : autoStart(); }

  function autoArmyTile(f) {
    const mine = tilesOf(f).filter(t => armyCount(t) > 0 && t.frozen <= 0);
    mine.sort((a, b) => armyCount(b) - armyCount(a));
    return mine[0] || null;
  }
  // score a neighbouring tile as a move target; preferEnemy => only attackable
  function autoMoveTarget(f, si, preferEnemy) {
    let best = -1, bs = -1e9;
    for (let i = 0; i < STR.N; i++) {
      if (!tAdj(si, i)) continue;
      const t = STR.tiles[i];
      if (t.owner === f && preferEnemy) continue;
      let sc = (t.flag ? 3 : 0) + (t.castle === (1 - f) ? 6 : 0) + (t.owner === (1 - f) ? 3 : 0);
      if (t.owner < 0) sc += 0.5;          // grab neutral ground / objectives
      if (armyCount(t) > 0) sc -= 0.8;      // a little cautious
      sc += Math.random() * 0.25;
      if (sc > bs) { bs = sc; best = i; }
    }
    return best;
  }
  function autoDoAction() {
    const f = FW;
    const a = curAct();
    if (!a) { skipAct(); return; }
    if (a === 'produce' || a === 'muster' || a === 'trade') { stratUIAct(STR.actIdx); return; }
    if (a === 'build') {
      const mine = tilesOf(f);
      const t = mine.find(x => x.blds.seed + x.blds.nest + x.blds.worship + x.blds.bath < 3) || mine[0];
      let k = null;
      for (const kk of ['nest', 'seed', 'worship', 'bath'])
        if (STR.res[f].worker >= BLD[kk].cost) { k = kk; break; }
      if (!t || !k) { skipAct(); return; }
      STR.kind = k; STR.sel = STR.tiles.indexOf(t);
      if (actBuild(f, STR.sel, k)) completeAction(); else skipAct();
      return;
    }
    if (a === 'recruit') {
      const bar = tilesOf(f).filter(t => t.blds.nest > 0);
      if (!bar.length) { skipAct(); return; }
      let foe = blankUnits();
      for (const t of tilesOf(1 - f)) for (const k of UNIT_K) foe[k] += t.units[k];
      const want = counterOf(dominantUnit(foe));
      let u = null;
      for (const uu of [want, 'inf', 'art', 'arm', 'hel', 'drn'])
        if (STR.res[f].seed >= UCOST[uu]) { u = uu; break; }
      if (!u) { skipAct(); return; }
      STR.ukind = u; STR.sel = STR.tiles.indexOf(bar[0]);
      if (actRecruit(f, STR.sel, u)) completeAction(); else skipAct();
      return;
    }
    if (a === 'miracle') {
      const r = STR.res[f];
      let target = -1, bn = 1;
      for (let i = 0; i < STR.N; i++) {
        const t = STR.tiles[i];
        if (t.owner !== 1 - f) continue;
        const n = armyCount(t);
        if (n > bn) { bn = n; target = i; }
      }
      if (r.bone >= 6 && target >= 0) {
        STR.mirakind = 'lightning'; STR.sel = target;
        if (actMiracle(f, target, 'lightning')) { completeAction(); return; }
      }
      if (r.bone >= 4) {
        let et = -1;
        for (let i = 0; i < STR.N; i++) if (STR.tiles[i].owner === 1 - f) { et = i; break; }
        if (et >= 0) {
          STR.mirakind = 'freeze'; STR.sel = et;
          if (actMiracle(f, et, 'freeze')) { completeAction(); return; }
        }
      }
      STR.mirakind = 'offering';
      if (actMiracle(f, -1, 'offering')) { completeAction(); return; }
      skipAct(); return;
    }
    if (a === 'move') {
      const src = autoArmyTile(f);
      if (!src) { skipAct(); return; }
      const si = STR.tiles.indexOf(src);
      let dst = autoMoveTarget(f, si, true);
      if (dst < 0) dst = autoMoveTarget(f, si, false);
      if (dst < 0) { skipAct(); return; }
      STR.armed = 'move'; STR.sel = si;
      const r = actMove(f, si, dst);
      STR.armed = null; STR.sel = -1;
      if (r === 'battle') return;            // viewer runs, finishBattle completes it
      if (r) completeAction(); else skipAct();
      return;
    }
    skipAct();
  }

  function autoStep(dt) {
    if (!AUTO.on) return;
    if (AUTO.wait > 0) { AUTO.wait -= dt; return; }
    if (AUTO.restartAt) { AUTO.restartAt = false; reset(); AUTO.wait = 1.0; return; }
    if (STR.over) { AUTO.wait = 2.6; AUTO.restartAt = true; return; }
    if (!STR.ready) { AUTO.wait = 0.3; return; }
    if (state.phase === 'battle') return;    // watch the playback; stratUpdate finishes it
    if (STR.stage === 'pick' && STR.turn === FW) {
      const want = AUTO_SEQ[(STR.round - 1) % AUTO_SEQ.length];
      let ai = STR.avail.indexOf(want);
      if (ai < 0 || STR.avail[ai] === undefined) ai = 0;
      pray(FW, STR.avail[ai]);
      AUTO.wait = 0.7;
      return;
    }
    if (STR.stage !== 'act' || STR.turn !== FW) return; // RED's turn: its AI plays
    autoDoAction();
    AUTO.wait = 0.75;
  }

  window.DCAuto = { start: autoStart, stop: autoStop, toggle: autoToggle, isOn: () => AUTO.on, step: autoStep };

  state.camX = -40; reset();
  requestAnimationFrame(loop);
  if (location.hash === "#debug") window.DC = { state, REGIONS, BASE, DEV_TIERS, buildAtRegion, developRegion, devYield, totalIncome, payYields, shotDown, endWave, startWave, reset, buildIsland, mapRect, handleBuildClick, enemies, bullets, ebullets, parts, bombs, booms, structs, missiles, P, mouse, keys, ensureStructs, get genX(){return genX;}, get camX(){return state.camX;}, frame(dt){ update(dt); draw(); },
    syncCity, cityStep, rebuildRoads, renderCity, growCitiesAfterRound, addCityBuilding, cityBuildingCount,
    get cityBuildings(){return cityBuildings;},
    get urban(){return urban;}, get road(){return road;}, get landMask(){return landMask;},
    get mapCanvas(){return mapCanvas;}, get cityCanvas(){return mapCanvas;}, get cityDirty(){return cityDirty;},
    STR, stratInit, stratClick, stratKey, stratUpdate, drawStrategy, buildBoard, tileAtScreen,
    launchBattle, resolvePlayerBattle, aiStep, flagCount, armyCount, tilesOf, bldCount, castleOf, resolveBattle, armyPower,
    actProduce, actMuster, actTrade, actRecruit, actBuild, actMiracle, actMove, completeAction, endRound, pray, CMD, UNIT_K, BLD_K, BLD, UCOST, UBEAT,
    HOSTILES, BATTLES, spawnHostiles, growHostilesAfterRound, tickBattles, resolveBattleWon, selectBattle, spawnBattleFor,
    get hoCells(){return hoCells;}, get hoOwner(){return hoOwner;}, battleForHostile, nearestOwnedRegion };
})();
