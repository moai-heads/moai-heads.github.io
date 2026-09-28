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
    if (e.code === 'KeyR' && state.over) reset();
  });
  window.addEventListener('keyup', e => { keys[e.code] = false; });

  const mouse = { x: 640, y: 260, down: false };
  function toLocal(cx, cy) {
    const r = cv.getBoundingClientRect();
    return { x: (cx - r.left) * VW / r.width, y: (cy - r.top) * VH / r.height };
  }
  cv.addEventListener('mousemove', e => { const p = toLocal(e.clientX, e.clientY); mouse.x = p.x; mouse.y = p.y; });
  cv.addEventListener('mousedown', e => { mouse.down = true; e.preventDefault(); });
  window.addEventListener('mouseup', () => { mouse.down = false; });
  cv.addEventListener('touchstart', e => { e.preventDefault(); const t = e.touches[0]; const p = toLocal(t.clientX, t.clientY); mouse.x = p.x; mouse.y = p.y; mouse.down = true; }, {passive:false});
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
    spawnCd: 1.2, waveTimer: 0, shake: 0, best: +(localStorage.getItem('dc_best') || 0)
  };

  const P = {};
  function reset() {
    state.over = false; state.score = 0; state.wave = 1; state.t = 0;
    state.spawnCd = 1.2; state.waveTimer = 0; state.shake = 0;
    P.x = 260; P.y = 250; P.vx = 0; P.vy = 0;
    P.hp = 100; P.heat = 0; P.fireCd = 0; P.rotor = 0; P.hitFlash = 0;
    enemies.length = 0; bullets.length = 0; ebullets.length = 0; parts.length = 0;
    for (let i = 0; i < 5; i++) spawnEnemy(360 + i * 260);
  }
  const enemies = [], bullets = [], ebullets = [], parts = [];
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
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 3);

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
      if (P.y > groundY(P.x) - 34) { P.y = groundY(P.x) - 34; P.vy = -120; P.hp -= 26; P.hitFlash = 0.3; state.shake = 1; }

      // camera
      const camTarget = P.x - 300;
      state.camX += (camTarget - state.camX) * Math.min(1, dt * 3.2);

      // firing
      P.heat = Math.max(0, P.heat - dt * 34);
      P.fireCd -= dt;
      const firing = (mouse.down || keys.Space) && P.heat < 100 && P.hitFlash <= 0;
      if (firing && P.fireCd <= 0) { fire(); P.fireCd = 0.055; }
      if (P.heat >= 100) { /* overheated */ }

      if (P.hitFlash > 0) P.hitFlash -= dt;

      // waves
      state.waveTimer += dt;
      if (state.waveTimer > 18) { state.waveTimer = 0; state.wave++; }
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

    // enemy bullets
    for (const b of ebullets) {
      b.vy += b.g * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (!state.over && Math.abs(b.x - P.x) < 34 && Math.abs(b.y - P.y) < 20) {
        b.life = 0; P.hp -= 9; P.hitFlash = 0.35; state.shake = 0.8;
        burst(P.x, P.y, 8, '#ff8a5c', 180);
        if (P.hp <= 0) { P.hp = 0; state.over = true; state.win = false; saveBest(); burst(P.x, P.y, 40, '#ff5a3c', 320); }
      }
    }
    for (let i = ebullets.length - 1; i >= 0; i--) if (ebullets[i].life <= 0) ebullets.splice(i, 1);

    // particles
    for (const p of parts) { p.vy += 420 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    for (let i = parts.length - 1; i >= 0; i--) if (parts[i].life <= 0) parts.splice(i, 1);
  }

  function saveBest() {
    if (state.score > state.best) { state.best = state.score; try { localStorage.setItem('dc_best', String(state.best)); } catch (e) {} }
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
      ctx.fillText('score ' + state.score + '  ·  wave ' + state.wave, VW / 2, VH / 2 + 4);
      const blink = 0.55 + 0.45 * Math.sin(state.t * 6);
      ctx.globalAlpha = blink; ctx.fillStyle = '#ffd27a';
      ctx.fillText('press R to fly again', VW / 2, VH / 2 + 46); ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function draw() {
    ctx.save();
    if (state.shake > 0) { ctx.translate((Math.random() - 0.5) * 10 * state.shake, (Math.random() - 0.5) * 10 * state.shake); }
    drawSky();
    drawTerrain();
    for (const e of enemies) drawEnemy(e);
    // bullets
    ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (const b of bullets) { ctx.strokeStyle = '#ffe066'; ctx.beginPath(); ctx.moveTo(b.x - state.camX, b.y); ctx.lineTo(b.x - state.camX - b.vx * 0.012, b.y - b.vy * 0.012); ctx.stroke(); }
    for (const b of ebullets) { ctx.fillStyle = '#ff8a5c'; ctx.beginPath(); ctx.arc(b.x - state.camX, b.y, 5, 0, 6.283); ctx.fill(); }
    drawChopper();
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
  if (location.hash === "#debug") window.DC = { state, enemies, bullets, ebullets, parts, P, mouse, keys, get camX(){return state.camX;} };
})();
