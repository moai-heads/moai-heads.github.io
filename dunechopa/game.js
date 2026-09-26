// DUNE CHOPPA — host: canvas + input + procedural audio around the wasm core.
(() => {
'use strict';
const FW = 480, FH = 270;
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d', { alpha: false });
const img = ctx.createImageData(FW, FH);

// ---------------------------- wasm boot ----------------------------
let X = null;
const boot = async () => {
  const res = await fetch('dunechopa.wasm');
  const bytes = await res.arrayBuffer();
  const { instance } = await WebAssembly.instantiate(bytes, {});
  X = instance.exports;
  X.init((Math.random() * 0xffffffff) >>> 0);
  requestAnimationFrame(loop);
};

// ---------------------------- audio ----------------------------
const A = {
  ac: null, master: null, noise: null, on: false,
  engine: null, engineGain: null, engineFilt: null,
  music: null,
};
function makeNoise(ac) {
  const len = ac.sampleRate * 1.5;
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}
function initAudio() {
  if (A.on) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  const ac = new AC();
  A.ac = ac; A.on = true;
  A.master = ac.createGain(); A.master.gain.value = 0.7; A.master.connect(ac.destination);
  A.noise = makeNoise(ac);

  // engine: two detuned saws -> lowpass -> gain, plus sub sine
  const eg = ac.createGain(); eg.gain.value = 0.0;
  const filt = ac.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 900; filt.Q.value = 6;
  const o1 = ac.createOscillator(); o1.type = 'sawtooth';
  const o2 = ac.createOscillator(); o2.type = 'sawtooth'; o2.detune.value = 14;
  const sub = ac.createOscillator(); sub.type = 'square'; sub.detune.value = -1200;
  o1.connect(filt); o2.connect(filt); sub.connect(filt); filt.connect(eg); eg.connect(A.master);
  o1.start(); o2.start(); sub.start();
  A.engine = { o1, o2, sub, filt, eg };

  // music bed: slow minor pad
  const mg = ac.createGain(); mg.gain.value = 0.0; mg.connect(A.master);
  const mf = ac.createBiquadFilter(); mf.type = 'lowpass'; mf.frequency.value = 500; mf.Q.value = 1; mf.connect(mg);
  const freqs = [110, 130.81, 164.81, 196.0]; // A minor-ish
  const oscs = [];
  for (const f of freqs) {
    const o = ac.createOscillator(); o.type = 'triangle';
    o.frequency.value = f; o.detune.value = (Math.random()*8-4);
    const g = ac.createGain(); g.gain.value = 0.12;
    o.connect(g); g.connect(mf); o.start();
    oscs.push(o);
  }
  A.music = { mg, oscs };
  ensureRamp();
}
// gentle music ramp-up/down
let musicTarget = 0.0;
function ensureRamp() {
  if (!A.on) return;
  const t = A.ac.currentTime;
  A.music.mg.gain.setTargetAtTime(0.0 + musicTarget, t, 1.2);
}
function musicOn(v) {
  if (!A.on) return;
  musicTarget = v ? 1.0 : 0.0;
  A.music.mg.gain.setTargetAtTime(musicTarget * 0.5, A.ac.currentTime, 1.0);
}
function engineTo(speed, grounded) {
  if (!A.on || !A.engine) return;
  const rpm = 50 + Math.min(speed, 700) * 0.30;
  const t = A.ac.currentTime, k = 0.05;
  A.engine.o1.frequency.setTargetAtTime(rpm, t, k);
  A.engine.o2.frequency.setTargetAtTime(rpm * 1.005, t, k);
  A.engine.sub.frequency.setTargetAtTime(rpm * 0.5, t, k);
  A.engine.filt.frequency.setTargetAtTime(500 + rpm * 3.0, t, k);
  const loud = grounded ? (0.05 + Math.min(speed, 500) / 500 * 0.10) : (0.035 + Math.min(speed,500)/500*0.04);
  A.engine.eg.gain.setTargetAtTime(loud, t, 0.08);
}
function noiseHit(dur, f0, f1, q, gain, type) {
  if (!A.on) return;
  const ac = A.ac, t = ac.currentTime;
  const src = ac.createBufferSource(); src.buffer = A.noise;
  const bp = ac.createBiquadFilter(); bp.type = type || 'bandpass'; bp.Q.value = q;
  bp.frequency.setValueAtTime(f0, t);
  bp.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bp); bp.connect(g); g.connect(A.master);
  src.start(t); src.stop(t + dur);
}
function tone(f0, f1, dur, gain, type) {
  if (!A.on) return;
  const ac = A.ac, t = ac.currentTime;
  const o = ac.createOscillator(); o.type = type || 'square';
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(A.master);
  o.start(t); o.stop(t + dur);
}
function sfx(code, data) {
  if (!A.on) return;
  switch (code) {
    case 0: tone(220, 660, 0.25, 0.15, 'triangle'); musicOn(1); break; // start
    case 1: // gunshot
      noiseHit(0.09, 1800, 300, 1.2, data ? 0.28 : 0.20, 'bandpass');
      tone(180, 60, 0.08, 0.10, 'square');
      break;
    case 2: // scorpion pop
      noiseHit(0.28, 900, 90, 0.8, 0.32, 'lowpass');
      tone(160, 40, 0.25, 0.18, 'sawtooth');
      break;
    case 3: // crash / sting
      noiseHit(0.30, 500, 70, 0.9, 0.34, 'lowpass');
      tone(120, 45, 0.30, 0.20, 'square');
      break;
    case 4: { // flip whoosh + chime
      noiseHit(0.35, 400, 2200, 0.7, 0.16, 'bandpass');
      const n = Math.max(1, data | 0);
      for (let i = 0; i < n; i++) setTimeout(() => tone(660 * Math.pow(1.26, i), 990 * Math.pow(1.26, i), 0.16, 0.12, 'triangle'), i * 90);
      break;
    }
    case 5: tone(300, 60, 0.9, 0.22, 'sawtooth'); musicOn(0); break; // game over
    case 6: // jump whoosh
      noiseHit(0.16, 400, 1400, 1.0, 0.14, 'bandpass');
      tone(260, 520, 0.12, 0.10, 'triangle');
      break;
  }
}

// ---------------------------- input ----------------------------
const keys = new Set();
let mouseX = FW/2, mouseY = FH*0.45, mouseDown = false;
function keydown(e) {
  initAudio();
  if (A.ac && A.ac.state === 'suspended') A.ac.resume();
  keys.add(e.code);
  if (["Space","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.code)) e.preventDefault();
  if (X) X.key(codeToKey(e.code), 1);
}
function keyup(e) { keys.delete(e.code); if (X) X.key(codeToKey(e.code), 0); }
// map browser KeyboardEvent.code -> our numeric codes (matches DOM keyCode-ish table we used)
function codeToKey(code) {
  const m = {
    KeyA:65, KeyD:68, KeyW:87, KeyS:83, KeyR:82,
    ArrowLeft:37, ArrowRight:39, ArrowUp:38, ArrowDown:40,
    Space:32, ShiftLeft:16, ShiftRight:16, KeyN:78,
  };
  return m[code] || 0;
}
window.addEventListener('keydown', keydown);
window.addEventListener('keyup', keyup);
canvas.addEventListener('mousemove', (e) => {
  const r = canvas.getBoundingClientRect();
  mouseX = (e.clientX - r.left) / r.width * FW;
  mouseY = (e.clientY - r.top) / r.height * FH;
  if (X) X.mousemove(mouseX, mouseY);
});
canvas.addEventListener('mousedown', (e) => { initAudio(); mouseDown = true; if (X) X.mousedown(1); e.preventDefault(); });
window.addEventListener('mouseup', () => { mouseDown = false; if (X) X.mousedown(0); });
canvas.addEventListener('contextmenu', e => e.preventDefault());

// touch buttons -> synth key events
function bindTouch(id, code, aimForward) {
  const el = document.getElementById(id);
  const dn = (e) => { e.preventDefault(); initAudio(); if (aimForward) { X.mousemove(420, 120); X.mousedown(1); } else if (X) X.key(code, 1); };
  const up = (e) => { e.preventDefault(); if (aimForward) { X.mousedown(0); } else if (X) X.key(code, 0); };
  el.addEventListener('touchstart', dn, {passive:false});
  el.addEventListener('touchend', up, {passive:false});
  el.addEventListener('touchcancel', up, {passive:false});
  el.addEventListener('mousedown', dn); el.addEventListener('mouseup', up);
}
// side-view bike scheme: W/S throttle+brake, A/D lean back/nose-down
bindTouch('tGo', 87, false); bindTouch('tBack', 83, false);   // W gas / S brake-reverse
bindTouch('tUp', 65, false); bindTouch('tDown', 68, false);   // A lean back / D nose down
bindTouch('tJump', 32, false);                                  // SPACE
bindTouch('tNitro', 16, false); bindTouch('tFire', 0, true);
// start/restart with a plain tap on the canvas for mobile
canvas.addEventListener('touchstart', (e) => { initAudio(); if (A.ac && A.ac.state==='suspended') A.ac.resume(); }, {passive:true});

// ---------------------------- sizing ----------------------------
function resize() {
  const pad = 0;
  const availW = window.innerWidth - pad, availH = window.innerHeight - pad;
  const scale = Math.max(1, Math.min(Math.floor(availW / FW), Math.floor(availH / FH)));
  canvas.style.width = (FW * scale) + 'px';
  canvas.style.height = (FH * scale) + 'px';
}
window.addEventListener('resize', resize); resize();

// ---------------------------- loop ----------------------------
let last = performance.now();
function loop(now) {
  let dt = now - last; last = now;
  if (dt > 50) dt = 50;
  X.frame(dt);

  // blit framebuffer
  const ptr = X.fbptr();
  const mem = new Uint8Array(X.memory.buffer, ptr, FW*FH*4);
  img.data.set(mem);
  ctx.putImageData(img, 0, 0);

  // audio telemetry + events
  if (A.on) {
    engineTo(X.audio_speed(), X.audio_ground());
    let e;
    while ((e = X.evpoll()) >= 0) { sfx((e >>> 16) & 0xffff, e & 0xffff); }
  }
  requestAnimationFrame(loop);
}

boot();
})();
