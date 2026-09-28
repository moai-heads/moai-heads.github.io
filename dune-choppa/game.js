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
      if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3' || e.code === 'Digit4') state.buildSel = (+e.code.slice(5)) - 1;
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
    over: false, win: false, score: 0, wave: 1, t: 0,
    warCrimes: 0, wcFlash: 0,
    phase: 'fly', scrap: 120, buildSel: 0, buildMsg: '', buildMsgT: 0, turretCd: 0,
    spawnCd: 1.2, waveTimer: 0, shake: 0, best: +(localStorage.getItem('dc_best') || 0)
  };

  const P = {};
  function reset() {
    state.over = false; state.score = 0; state.wave = 1; state.t = 0;
    state.warCrimes = 0; state.wcFlash = 0;
    state.spawnCd = 1.2; state.waveTimer = 0; state.shake = 0;
    state.phase = 'fly'; state.scrap = 120; state.buildSel = 0;
    state.buildMsg = ''; state.buildMsgT = 0; state.turretCd = 0;
    BASE.length = 0;
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
  const GRID_W = 12, GRID_H = 7, CELL = 54;
  const GRID_X = (VW - GRID_W * CELL) / 2, GRID_Y = 96;
  function countBase(kind) { let n = 0; for (const b of BASE) if (b.kind === kind) n += b.level; return n; }
  function armorMul() { return Math.max(0.45, 1 - countBase('bunker') * 0.08); }
  function nearestEnemy() { let best = null, bd = 1e9; for (const e of enemies) { if (!e.alive) continue; const d = Math.abs(e.x - P.x); if (d < bd) { bd = d; best = e; } } return best; }
  function buildMsg(t) { state.buildMsg = t; state.buildMsgT = 1.4; }
  function endWave() {
    state.phase = 'build';
    state.scrap += 60 + state.wave * 12;
    const rep = countBase('repair'); if (rep > 0) P.hp = Math.min(100, P.hp + 30 * rep);
    const dep = countBase('depot');  if (dep > 0) P.bombs = Math.min(10, P.bombs + 2 + dep);
    buildMsg('wave ' + state.wave + ' cleared');
  }
  function startWave() {
    state.wave++; state.phase = 'fly'; state.waveTimer = 0;
    P.bombs = Math.min(10, P.bombs + 2 + countBase('depot'));
    state.buildMsg = ''; state.buildMsgT = 0;
    for (let i = 0; i < 3 + state.wave; i++) spawnEnemy(P.x + 700 + i * 180 + Math.random() * 120);
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
      return;
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
        if (P.hp <= 0) { P.hp = 0; state.over = true; state.win = false; saveBest(); burst(P.x, P.y, 40, '#ff5a3c', 320); }
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
        if (P.hp <= 0) { P.hp = 0; state.over = true; state.win = false; saveBest(); burst(P.x, P.y, 40, '#ff5a3c', 320); }
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

  function drawBaseIcon(x, y, kind, level) {
    const def = BUILD[kind];
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = 'rgba(8,12,20,0.6)'; ctx.fillRect(-CELL/2+3, -CELL/2+3, CELL-6, CELL-6);
    ctx.strokeStyle = def.col; ctx.lineWidth = 2;
    if (kind === 'turret') { ctx.beginPath(); ctx.arc(0, 0, 11, 0, 6.283); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(13, -9); ctx.stroke(); }
    else if (kind === 'bunker') { ctx.beginPath(); ctx.moveTo(-13, 9); ctx.lineTo(-13, -3); ctx.lineTo(0, -13); ctx.lineTo(13, -3); ctx.lineTo(13, 9); ctx.closePath(); ctx.stroke(); }
    else if (kind === 'repair') { ctx.beginPath(); ctx.moveTo(-11, -11); ctx.lineTo(11, -11); ctx.lineTo(11, 11); ctx.lineTo(-11, 11); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.moveTo(0, -6); ctx.lineTo(0, 6); ctx.stroke(); }
    else if (kind === 'depot') { ctx.beginPath(); ctx.ellipse(0, 0, 12, 8, 0, 0, 6.283); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.stroke(); }
    ctx.fillStyle = def.col;
    for (let i = 0; i < level; i++) ctx.fillRect(-CELL/2 + 6 + i * 7, CELL/2 - 9, 5, 4);
    ctx.restore();
  }
  function handleBuildClick(x, y) {
    for (let i = 0; i < 4; i++) { const bw = 156, bx = GRID_X + i * (bw + 4), by = VH - 52; if (x >= bx && x < bx + bw && y >= by && y < by + 38) { state.buildSel = i; return; } }
    const lb = { x: VW - 276, y: VH - 52, w: 256, h: 38 };
    if (x >= lb.x && x < lb.x + lb.w && y >= lb.y && y < lb.y + lb.h) { startWave(); return; }
    if (x >= GRID_X && x < GRID_X + GRID_W * CELL && y >= GRID_Y && y < GRID_Y + GRID_H * CELL) {
      const gx = Math.floor((x - GRID_X) / CELL), gy = Math.floor((y - GRID_Y) / CELL);
      const occ = BASE.find(b => b.gx === gx && b.gy === gy);
      const kind = DEF_ORDER[state.buildSel];
      if (!occ) {
        if (state.scrap >= BUILD[kind].cost) { state.scrap -= BUILD[kind].cost; BASE.push({ gx, gy, kind, level: 1 }); }
        else buildMsg('not enough scrap');
      } else {
        const uc = BUILD[occ.kind].cost;
        if (occ.level >= 3) buildMsg('max level');
        else if (state.scrap >= uc) { state.scrap -= uc; occ.level++; }
        else buildMsg('not enough scrap');
      }
    }
  }
  function drawBuild() {
    ctx.fillStyle = '#070b16'; ctx.fillRect(0, 0, VW, VH);
    ctx.textAlign = 'left'; ctx.fillStyle = '#f0b46b';
    ctx.font = '700 22px ui-monospace,Menlo,monospace';
    ctx.fillText('BASE // DEPLOYMENT', 24, 40);
    ctx.fillStyle = '#8b97a8'; ctx.font = '600 13px ui-monospace,Menlo,monospace';
    ctx.fillText('build your base, then launch wave ' + (state.wave + 1) + '  ·  click a cell to place / upgrade', 24, 62);
    ctx.textAlign = 'right'; ctx.fillStyle = '#ffd27a'; ctx.font = '700 18px ui-monospace,Menlo,monospace';
    ctx.fillText('SCRAP ' + Math.floor(state.scrap), VW - 24, 40);
    ctx.textAlign = 'left';
    for (let gy = 0; gy < GRID_H; gy++) for (let gx = 0; gx < GRID_W; gx++) {
      const x = GRID_X + gx * CELL, y = GRID_Y + gy * CELL;
      ctx.fillStyle = ((gx + gy) & 1) ? 'rgba(30,42,64,0.55)' : 'rgba(24,34,54,0.55)';
      ctx.fillRect(x, y, CELL, CELL);
      ctx.strokeStyle = 'rgba(90,120,170,0.25)'; ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
    }
    for (const b of BASE) drawBaseIcon(GRID_X + b.gx * CELL + CELL / 2, GRID_Y + b.gy * CELL + CELL / 2, b.kind, b.level);
    if (mouse.x >= GRID_X && mouse.x < GRID_X + GRID_W * CELL && mouse.y >= GRID_Y && mouse.y < GRID_Y + GRID_H * CELL) {
      const gx = Math.floor((mouse.x - GRID_X) / CELL), gy = Math.floor((mouse.y - GRID_Y) / CELL);
      const occ = BASE.find(b => b.gx === gx && b.gy === gy);
      ctx.globalAlpha = 0.25; ctx.fillStyle = occ ? '#ffd27a' : BUILD[DEF_ORDER[state.buildSel]].col;
      ctx.fillRect(GRID_X + gx * CELL + 3, GRID_Y + gy * CELL + 3, CELL - 6, CELL - 6); ctx.globalAlpha = 1;
      ctx.strokeStyle = occ ? '#ffd27a' : '#7fd0ff'; ctx.lineWidth = 2;
      ctx.strokeRect(GRID_X + gx * CELL + 1, GRID_Y + gy * CELL + 1, CELL - 2, CELL - 2);
    }
    for (let i = 0; i < 4; i++) {
      const def = BUILD[DEF_ORDER[i]], bw = 156, bh = 38, bx = GRID_X + i * (bw + 4), by = VH - 52;
      const sel = i === state.buildSel;
      ctx.fillStyle = sel ? 'rgba(255,210,122,0.18)' : 'rgba(20,28,44,0.85)'; ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = sel ? '#ffd27a' : 'rgba(90,120,170,0.5)'; ctx.lineWidth = sel ? 2 : 1; ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
      ctx.fillStyle = def.col; ctx.font = '700 13px ui-monospace,Menlo,monospace'; ctx.fillText((i + 1) + ' ' + def.name, bx + 10, by + 17);
      ctx.fillStyle = '#8b97a8'; ctx.font = '600 11px ui-monospace,Menlo,monospace'; ctx.fillText(def.cost + ' scrap', bx + 10, by + 31);
    }
    ctx.fillStyle = '#5c6b7d'; ctx.font = '600 11px ui-monospace,Menlo,monospace';
    ctx.fillText(DEF_ORDER && BUILD[DEF_ORDER[state.buildSel]].desc, GRID_X, VH - 58);
    const lb = { x: VW - 276, y: VH - 52, w: 256, h: 38 };
    ctx.fillStyle = 'rgba(120,220,140,0.16)'; ctx.fillRect(lb.x, lb.y, lb.w, lb.h);
    ctx.strokeStyle = '#7fdc8c'; ctx.lineWidth = 2; ctx.strokeRect(lb.x + 0.5, lb.y + 0.5, lb.w - 1, lb.h - 1);
    ctx.fillStyle = '#b8f0c4'; ctx.font = '700 15px ui-monospace,Menlo,monospace'; ctx.textAlign = 'center';
    ctx.fillText('LAUNCH WAVE ' + (state.wave + 1) + '  [space]', lb.x + lb.w / 2, lb.y + 24);
    if (state.buildMsgT > 0) {
      ctx.globalAlpha = Math.min(1, state.buildMsgT * 2); ctx.fillStyle = '#ff6b5a';
      ctx.font = '700 14px ui-monospace,Menlo,monospace';
      ctx.fillText(state.buildMsg, VW / 2, GRID_Y - 8); ctx.globalAlpha = 1;
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
    if (state.warCrimes > 0) {
      const g = state.wcFlash > 0 ? Math.min(1, state.wcFlash) : 0;
      ctx.fillStyle = g > 0 ? '#ffffff' : '#ff6b5a';
      ctx.fillText('WAR CRIMES ' + state.warCrimes, 18, 90);
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
      ctx.fillStyle = '#ff6b5a'; ctx.font = '700 44px ui-monospace,Menlo,monospace';
      ctx.fillText('CHOPPA DOWN', VW / 2, VH / 2 - 40);
      ctx.fillStyle = '#ffe6bf'; ctx.font = '600 20px ui-monospace,Menlo,monospace';
      ctx.fillText('score ' + state.score + '  ·  wave ' + state.wave
                   + (state.warCrimes > 0 ? '  ·  war crimes ' + state.warCrimes : ''), VW / 2, VH / 2 + 4);
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
  if (location.hash === "#debug") window.DC = { state, enemies, bullets, ebullets, parts, bombs, booms, structs, missiles, P, mouse, keys, ensureStructs, get genX(){return genX;}, get camX(){return state.camX;}, frame(dt){ update(dt); draw(); } };
})();
