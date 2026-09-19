/* Fractal Field — a no-build WebGPU/WGSL gallery. */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const canvas = $('fractal-canvas');
  const fallbackCanvas = $('fallback-canvas');
  const frame = $('viewport-frame');
  const list = $('fractal-list');
  const statusDot = $('status-dot');
  const statusText = $('renderer-status');
  const fallbackMessage = $('fallback-message');
  const els = {
    kicker: $('study-kicker'),
    title: $('study-title'),
    equation: $('study-equation'),
    theory: $('study-theory'),
    note: $('study-note'),
    family: $('study-family'),
    technique: $('study-technique'),
    interaction: $('study-interaction'),
    filename: $('code-filename'),
    code: $('shader-code'),
    coordinate: $('canvas-coordinate'),
    zoom: $('canvas-zoom'),
    help: $('canvas-help'),
    reset: $('reset-button'),
    pause: $('pause-button'),
    pauseIcon: $('pause-icon'),
    pauseLabel: $('pause-label'),
    iterations: $('iterations-range'),
    iterationsOutput: $('iterations-output'),
    palette: $('palette-range'),
    paletteOutput: $('palette-output'),
    copy: $('copy-button'),
  };

  const STUDIES = [
    {
      key: 'mandelbrot',
      name: 'Mandelbrot set',
      family: 'escape-time',
      kicker: 'study 01 / escape-time',
      equation: 'z₀ = 0  ·  zₙ₊₁ = zₙ² + c',
      theory: 'The Mandelbrot set is the map of every complex number c for which the orbit beginning at z = 0 stays bounded under repeated squaring and addition. A single rule draws an infinite coastline: zoom in and miniature copies keep appearing at the edge.',
      note: 'The border is not a line but a record of how quickly each orbit escapes. Smooth coloring turns that escape time into the flame-like bands around the set.',
      technique: 'complex iteration + smooth escape',
      interaction: 'pan · zoom · inspect orbit time',
      filename: 'mandelbrot.wgsl',
      center: [-0.5, 0],
      scale: 1.55,
      param: [0, 0],
    },
    {
      key: 'julia',
      name: 'Julia set',
      family: 'quadratic dynamics',
      kicker: 'study 02 / quadratic dynamics',
      equation: 'zₙ₊₁ = zₙ² + c  ·  c = −0.745 + 0.113i',
      theory: 'A Julia set freezes c and asks a different question: which starting points z escape? Every point in the plane gets its own orbit, and the boundary between escape and stability becomes the specimen. Change c and the organism changes species.',
      note: 'This study keeps c fixed at a filament-rich value so the canvas can be read as a single dynamical creature rather than a parameter sweep.',
      technique: 'complex iteration + fixed parameter',
      interaction: 'pan · zoom · fixed c',
      filename: 'julia.wgsl',
      center: [0, 0],
      scale: 1.55,
      param: [-0.745, 0.113],
    },
    {
      key: 'burningShip',
      name: 'Burning ship',
      family: 'absolute-value dynamics',
      kicker: 'study 03 / absolute-value dynamics',
      equation: 'zₙ₊₁ = (|Re zₙ| + i|Im zₙ|)² + c',
      theory: 'The Burning Ship takes the quadratic map and folds every orbit into the first quadrant before squaring. That small absolute-value intervention breaks the Mandelbrot set’s calm symmetry and builds a fleet of sharp hulls, masts, and storm fronts.',
      note: 'The famous ship appears below the real axis in the conventional view. The asymmetry is the equation made visible: reflection happens before the complex square.',
      technique: 'folded complex iteration',
      interaction: 'pan · zoom · inspect folds',
      filename: 'burning-ship.wgsl',
      center: [-0.45, -0.52],
      scale: 1.42,
      param: [0, 0],
    },
    {
      key: 'tricorn',
      name: 'Tricorn',
      family: 'antiholomorphic dynamics',
      kicker: 'study 04 / antiholomorphic dynamics',
      equation: 'zₙ₊₁ = conj(zₙ)² + c',
      theory: 'The Tricorn, or Mandelbar set, conjugates the orbit before squaring. The map is no longer holomorphic, and the boundary grows three-cornered “tricorn” lobes with filaments that echo the Mandelbrot while refusing to copy it.',
      note: 'Conjugation flips the sign of the imaginary component on every pass. The result is a fractal whose geometry remembers the mirror operation at every scale.',
      technique: 'conjugate complex iteration',
      interaction: 'pan · zoom · mirror dynamics',
      filename: 'tricorn.wgsl',
      center: [-0.35, 0],
      scale: 1.52,
      param: [0, 0],
    },
    {
      key: 'newton',
      name: 'Newton basin',
      family: 'root finding',
      kicker: 'study 05 / root finding',
      equation: 'zₙ₊₁ = zₙ − (zₙ³ − 1) / (3zₙ²)',
      theory: 'Newton’s method is usually a numerical tool: guess a root, take a tangent step, repeat. Applied to every starting point at once, it becomes a map of attraction basins. Three roots of z³ − 1 divide the plane into colored territories, separated by an intricate unstable frontier.',
      note: 'Color identifies the root reached; brightness records how quickly the iteration converged. The dark seams are points balanced between competing answers.',
      technique: 'Newton–Raphson iteration',
      interaction: 'pan · zoom · follow convergence',
      filename: 'newton.wgsl',
      center: [0, 0],
      scale: 1.75,
      param: [0, 0],
    },
    {
      key: 'sierpinski',
      name: 'Sierpiński carpet',
      family: 'recursive geometry',
      kicker: 'study 06 / recursive geometry',
      equation: 'repeat: subdivide into 3×3, remove the center',
      theory: 'The Sierpiński carpet is a rule for removing space. Split a square into nine equal squares, delete the center, and apply the same instruction to every survivor. Its area tends toward zero while its boundary and visual complexity keep growing.',
      note: 'This version uses a fixed-point test in the shader rather than a texture or a pre-rendered pattern. The recursion is evaluated per pixel, so the carpet stays procedural at every zoom.',
      technique: 'iterated function system',
      interaction: 'pan · zoom · recursive scan',
      filename: 'sierpinski-carpet.wgsl',
      center: [0, 0],
      scale: 2.2,
      param: [0, 0],
    },
  ];

  const state = {
    index: 0,
    time: 0,
    lastFrame: performance.now(),
    lastFallback: 0,
    paused: false,
    dirty: true,
    iterations: 240,
    palette: 1.7,
    center: [-0.5, 0],
    scale: 1.55,
    param: [0, 0],
    pointer: [0, 0],
    dpr: Math.min(window.devicePixelRatio || 1, 2),
    dragging: false,
    dragStart: null,
    interacted: false,
  };

  let gpu = null;
  let gpuReady = false;
  let fallback = false;
  let compileSerial = 0;
  let fallbackContext = null;

  function setStatus(text, kind = '') {
    statusText.textContent = text;
    statusDot.className = `status-dot${kind ? ` ${kind}` : ''}`;
  }

  function esc(text) {
    return String(text)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }

  function buildCatalog() {
    list.innerHTML = STUDIES.map((study, index) => `
      <button class="fractal-item${index === state.index ? ' active' : ''}" type="button" data-index="${index}">
        <span class="fractal-number">0${index + 1}</span>
        <span><span class="fractal-name">${esc(study.name)}</span><span class="fractal-family">${esc(study.family)}</span></span>
      </button>
    `).join('');
    list.querySelectorAll('[data-index]').forEach((button) => {
      button.addEventListener('click', () => selectStudy(Number(button.dataset.index)));
    });
  }

  function currentStudy() {
    return STUDIES[state.index];
  }

  function updateReadout(clientX = null, clientY = null) {
    const point = clientX === null || clientY === null
      ? state.center
      : screenToPlane(clientX, clientY);
    els.coordinate.textContent = `x ${point[0].toFixed(4)}   y ${point[1].toFixed(4)}`;
    els.zoom.textContent = `${(1.55 / state.scale).toFixed(2)}×`;
  }

  function updateStudyUI() {
    const study = currentStudy();
    els.kicker.textContent = study.kicker;
    els.title.textContent = study.name;
    els.equation.textContent = study.equation;
    els.theory.textContent = study.theory;
    els.note.textContent = study.note;
    els.family.textContent = study.family;
    els.technique.textContent = study.technique;
    els.interaction.textContent = study.interaction;
    els.filename.textContent = study.filename;
    els.code.textContent = SHADERS[study.key] || 'Shader source unavailable.';
    list.querySelectorAll('.fractal-item').forEach((button, index) => {
      button.classList.toggle('active', index === state.index);
      button.setAttribute('aria-current', index === state.index ? 'true' : 'false');
    });
    els.iterations.value = String(state.iterations);
    els.iterationsOutput.textContent = String(state.iterations);
    els.palette.value = String(state.palette);
    els.paletteOutput.textContent = Number(state.palette).toFixed(2);
    updateReadout();
  }

  function resetView() {
    const study = currentStudy();
    state.center = [...study.center];
    state.scale = study.scale;
    state.param = [...study.param];
    state.dirty = true;
    updateReadout();
    if (!state.interacted) els.help.classList.remove('hidden');
  }

  async function selectStudy(index) {
    if (!Number.isInteger(index) || !STUDIES[index]) return;
    state.index = index;
    resetView();
    updateStudyUI();
    if (gpuReady) await compileStudy();
  }

  function resizeCanvas() {
    const rect = frame.getBoundingClientRect();
    const cssWidth = Math.max(1, Math.floor(rect.width));
    const cssHeight = Math.max(1, Math.floor(rect.height));
    let width = Math.max(1, Math.floor(cssWidth * state.dpr));
    let height = Math.max(1, Math.floor(cssHeight * state.dpr));

    // CPU fallback is intentionally bounded so an unsupported device stays responsive.
    if (fallback) {
      const maxPixels = 620 * 480;
      const ratio = Math.min(1, Math.sqrt(maxPixels / (width * height)));
      width = Math.max(1, Math.floor(width * ratio));
      height = Math.max(1, Math.floor(height * ratio));
    }

    if (canvas.width !== width || canvas.height !== height || fallbackCanvas.width !== width || fallbackCanvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      fallbackCanvas.width = width;
      fallbackCanvas.height = height;
      state.dirty = true;
    }
    return { width, height };
  }

  function screenToPlane(clientX, clientY) {
    const rect = frame.getBoundingClientRect();
    const px = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const py = Math.max(0, Math.min(rect.height, clientY - rect.top));
    const nx = (px / rect.width) * 2 - 1;
    const ny = 1 - (py / rect.height) * 2;
    return [
      state.center[0] + nx * (rect.width / rect.height) * state.scale,
      state.center[1] + ny * state.scale,
    ];
  }

  function normalizedPointer(clientX, clientY) {
    const rect = frame.getBoundingClientRect();
    return [
      Math.max(-1, Math.min(1, ((clientX - rect.left) / rect.width) * 2 - 1)),
      Math.max(-1, Math.min(1, 1 - ((clientY - rect.top) / rect.height) * 2)),
    ];
  }

  function markInteracted() {
    state.interacted = true;
    els.help.classList.add('hidden');
  }

  function zoomAt(clientX, clientY, factor) {
    const before = screenToPlane(clientX, clientY);
    const rect = frame.getBoundingClientRect();
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ny = 1 - ((clientY - rect.top) / rect.height) * 2;
    state.scale = Math.max(0.000001, Math.min(8, state.scale * factor));
    state.center[0] = before[0] - nx * (rect.width / rect.height) * state.scale;
    state.center[1] = before[1] - ny * state.scale;
    state.dirty = true;
    updateReadout(clientX, clientY);
  }

  function onPointerDown(event) {
    if (event.button !== undefined && event.button !== 0) return;
    markInteracted();
    state.dragging = true;
    state.dragStart = {
      x: event.clientX,
      y: event.clientY,
      center: [...state.center],
    };
    frame.classList.add('is-dragging');
    frame.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event) {
    state.pointer = normalizedPointer(event.clientX, event.clientY);
    updateReadout(event.clientX, event.clientY);
    if (!state.dragging || !state.dragStart) return;
    const rect = frame.getBoundingClientRect();
    const aspect = rect.width / rect.height;
    state.center[0] = state.dragStart.center[0] - ((event.clientX - state.dragStart.x) / rect.width) * 2 * aspect * state.scale;
    state.center[1] = state.dragStart.center[1] + ((event.clientY - state.dragStart.y) / rect.height) * 2 * state.scale;
    state.dirty = true;
  }

  function onPointerUp(event) {
    state.dragging = false;
    state.dragStart = null;
    frame.classList.remove('is-dragging');
    frame.releasePointerCapture?.(event.pointerId);
  }

  function onWheel(event) {
    event.preventDefault();
    markInteracted();
    zoomAt(event.clientX, event.clientY, Math.exp(event.deltaY * 0.0012));
  }

  function setIterations(value) {
    state.iterations = Number(value);
    els.iterationsOutput.textContent = String(state.iterations);
    state.dirty = true;
  }

  function setPalette(value) {
    state.palette = Number(value);
    els.paletteOutput.textContent = state.palette.toFixed(2);
    state.dirty = true;
  }

  function togglePause() {
    state.paused = !state.paused;
    els.pauseIcon.textContent = state.paused ? '▶' : 'Ⅱ';
    els.pauseLabel.textContent = state.paused ? 'play' : 'pause';
    state.dirty = true;
  }

  function copyShader() {
    const source = SHADERS[currentStudy().key] || '';
    const done = () => {
      const original = els.copy.innerHTML;
      els.copy.innerHTML = '<span>✓</span> copied';
      setTimeout(() => { els.copy.innerHTML = original; }, 1300);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(source).then(done).catch(() => fallbackCopy(source, done));
    } else {
      fallbackCopy(source, done);
    }
  }

  function fallbackCopy(text, done) {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    try { document.execCommand('copy'); done(); } finally { area.remove(); }
  }

  function configureGPU() {
    if (!gpu) return;
    const { width, height } = resizeCanvas();
    gpu.context.configure({
      device: gpu.device,
      format: gpu.format,
      alphaMode: 'opaque',
    });
    gpu.size = { width, height };
  }

  async function compileStudy() {
    if (!gpu) return;
    const serial = ++compileSerial;
    const source = SHADERS[currentStudy().key];
    try {
      const module = gpu.device.createShaderModule({ code: source });
      const pipeline = gpu.device.createRenderPipeline({
        layout: 'auto',
        vertex: { module, entryPoint: 'vertex_main' },
        fragment: {
          module,
          entryPoint: 'fragment_main',
          targets: [{ format: gpu.format }],
        },
        primitive: { topology: 'triangle-list' },
      });
      if (serial !== compileSerial) return;
      gpu.pipeline = pipeline;
      gpu.bindGroup = gpu.device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: gpu.uniformBuffer } }],
      });
      state.dirty = true;
      setStatus('webgpu · live', 'ready');
    } catch (error) {
      console.warn('WGSL pipeline failed; using CPU fallback.', error);
      switchToFallback(`shader compile failed: ${error.message || 'unknown error'}`);
    }
  }

  async function initGPU() {
    if (!navigator.gpu) throw new Error('navigator.gpu is unavailable');
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('no WebGPU adapter was found');
    const device = await adapter.requestDevice();
    const context = canvas.getContext('webgpu');
    if (!context) throw new Error('webgpu canvas context is unavailable');
    const format = navigator.gpu.getPreferredCanvasFormat();
    gpu = {
      adapter,
      device,
      context,
      format,
      uniformBuffer: device.createBuffer({
        size: 48,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      }),
      pipeline: null,
      bindGroup: null,
      size: { width: 1, height: 1 },
    };
    device.lost.then((info) => {
      console.warn('WebGPU device lost', info);
      switchToFallback('gpu device lost');
    });
    configureGPU();
    gpuReady = true;
    fallback = false;
    fallbackMessage.hidden = true;
    await compileStudy();
  }

  function switchToFallback(reason) {
    fallback = true;
    gpuReady = false;
    frame.classList.add('is-fallback');
    fallbackMessage.hidden = false;
    setStatus('canvas 2d · reference', 'fallback');
    fallbackMessage.querySelector('strong').textContent = 'WebGPU is unavailable here.';
    fallbackMessage.querySelector('span').textContent = 'Showing a slower Canvas 2D reference render. The WGSL source is still available below.';
    console.info(reason);
    fallbackContext = fallbackCanvas.getContext('2d', { alpha: false });
    resizeCanvas();
    state.dirty = true;
  }

  function paletteColor(t, shift) {
    const phase = [0.02, 0.24, 0.51];
    const speed = [0.94, 0.67, 0.46];
    const rgb = phase.map((p, index) => {
      const value = 0.5 + 0.5 * Math.cos(Math.PI * 2 * (p + shift / (Math.PI * 2) + t * speed[index]));
      return Math.max(0, Math.min(1, value));
    });
    return rgb;
  }

  function writePixel(data, index, rgb, gain = 1) {
    const gamma = 1 / 2.2;
    data[index] = Math.max(0, Math.min(255, Math.pow(Math.max(0, rgb[0] * gain), gamma) * 255));
    data[index + 1] = Math.max(0, Math.min(255, Math.pow(Math.max(0, rgb[1] * gain), gamma) * 255));
    data[index + 2] = Math.max(0, Math.min(255, Math.pow(Math.max(0, rgb[2] * gain), gamma) * 255));
    data[index + 3] = 255;
  }

  function escapeColor(escaped, magnitude, timeShift, paletteShift) {
    const smooth = (escaped + 1 - Math.log2(Math.log2(Math.max(Math.sqrt(magnitude), 1.0001)))) / Math.max(1, state.iterations);
    const edge = Math.max(0, Math.min(1, smooth));
    return { color: paletteColor(edge * 1.1, paletteShift + timeShift), gain: 0.26 + 1.18 * Math.pow(edge, 0.56) };
  }

  function fallbackPixel(study, x, y, aspect, maxIter, timeShift) {
    const px = state.center[0] + x * aspect * state.scale;
    const py = state.center[1] + y * state.scale;
    let zx = 0;
    let zy = 0;
    let escaped = 0;
    let magnitude = 0;

    if (study.key === 'julia') {
      zx = px;
      zy = py;
    }

    if (study.key === 'newton') {
      zx = px;
      zy = py;
      let converged = false;
      let steps = 0;
      for (let i = 0; i < maxIter; i += 1) {
        const z2x = zx * zx - zy * zy;
        const z2y = 2 * zx * zy;
        const fx = z2x * zx - z2y * zy - 1;
        const fy = z2x * zy + z2y * zx;
        if (Math.hypot(fx, fy) < 0.00008) {
          converged = true;
          steps = i;
          break;
        }
        const dx = 3 * z2x;
        const dy = 3 * z2y;
        const denom = Math.max(1e-7, dx * dx + dy * dy);
        const qx = (fx * dx + fy * dy) / denom;
        const qy = (fy * dx - fx * dy) / denom;
        zx -= qx;
        zy -= qy;
        steps = i + 1;
      }
      if (!converged) {
        const haze = 0.035 + 0.045 * Math.sin(Math.hypot(zx, zy) * 5 + timeShift * 0.2);
        return { rgb: [haze * 0.8, haze * 0.42, haze * 0.52], gain: 1 };
      }
      const roots = [[1, 0], [-0.5, 0.8660254], [-0.5, -0.8660254]];
      let nearest = 0;
      let best = Infinity;
      roots.forEach((root, index) => {
        const d = Math.hypot(zx - root[0], zy - root[1]);
        if (d < best) { best = d; nearest = index; }
      });
      const colors = [[0.82, 0.98, 0.38], [0.98, 0.42, 0.26], [0.35, 0.68, 1]];
      const speed = 1 - Math.min(1, steps / Math.max(1, state.iterations));
      const halo = paletteColor(speed * 0.8, state.palette + timeShift * 0.04).map((v) => v * 0.12);
      return { rgb: colors[nearest].map((v, i) => v * (0.18 + 0.95 * speed) + halo[i]), gain: 1 };
    }

    if (study.key === 'sierpinski') {
      let qx = px * 0.34 + 0.5;
      let qy = py * 0.34 + 0.5;
      let value = 1;
      let hole = false;
      for (let i = 0; i < 14; i += 1) {
        qx = qx - Math.floor(qx);
        qy = qy - Math.floor(qy);
        qx *= 3;
        qy *= 3;
        const inHole = qx >= 1 && qx < 2 && qy >= 1 && qy < 2;
        if (inHole) { hole = true; break; }
        value *= 0.94;
      }
      const glow = 0.48 + 0.52 * Math.sin(timeShift * 0.35 + px * 1.7 + py * 1.2);
      const color = paletteColor(value * 0.78 + glow * 0.1, state.palette + timeShift * 0.05);
      const ink = hole ? [0.009, 0.014, 0.014] : color.map((v) => v * (0.58 + glow * 0.3) * value);
      return { rgb: ink, gain: 1 };
    }

    const cX = study.key === 'julia' ? study.param[0] : px;
    const cY = study.key === 'julia' ? study.param[1] : py;
    for (let i = 0; i < maxIter; i += 1) {
      let ax = zx;
      let ay = zy;
      if (study.key === 'burningShip') {
        ax = Math.abs(ax);
        ay = Math.abs(ay);
      }
      let nextX = ax * ax - ay * ay;
      let nextY = 2 * ax * ay;
      if (study.key === 'tricorn') nextY = -2 * ax * ay;
      zx = nextX + cX;
      zy = nextY + cY;
      magnitude = zx * zx + zy * zy;
      if (magnitude > 256) {
        escaped = i + 1;
        break;
      }
    }
    if (!escaped) {
      const interior = study.key === 'tricorn'
        ? 0.012 + 0.016 * Math.abs(Math.sin(px * 2 + timeShift * 0.3))
        : study.key === 'julia'
          ? 0.018 + 0.012 * Math.sin(timeShift * 0.42 + Math.hypot(zx, zy))
          : 0.015 + 0.018 * Math.sin(timeShift * 0.35 + px * 3);
      return { rgb: study.key === 'julia' ? [interior * 0.8, interior, interior * 1.1] : [interior, interior * 1.18, interior * 0.86], gain: 1 };
    }
    const result = escapeColor(escaped, magnitude, timeShift, state.palette + (study.key === 'burningShip' ? 1.75 : study.key === 'tricorn' ? 3.45 : study.key === 'julia' ? 0.5 : 0));
    return { rgb: result.color, gain: result.gain };
  }

  function renderFallback(now) {
    if (!fallbackContext) return;
    const { width, height } = resizeCanvas();
    if (!width || !height) return;
    const minInterval = state.paused ? 0 : 110;
    if (!state.dirty && now - state.lastFallback < minInterval) return;
    state.lastFallback = now;
    const image = fallbackContext.createImageData(width, height);
    const data = image.data;
    const study = currentStudy();
    const aspect = width / height;
    const maxIter = Math.min(state.iterations, 180);
    const shift = state.time;
    let index = 0;
    for (let py = 0; py < height; py += 1) {
      const y = 1 - (py / Math.max(1, height - 1)) * 2;
      for (let px = 0; px < width; px += 1) {
        const x = (px / Math.max(1, width - 1)) * 2 - 1;
        const result = fallbackPixel(study, x, y, aspect, maxIter, shift);
        writePixel(data, index, result.rgb, result.gain);
        index += 4;
      }
    }
    fallbackContext.putImageData(image, 0, 0);
    state.dirty = false;
  }

  function renderGPU() {
    if (!gpu?.pipeline || !gpu.bindGroup) return;
    const { width, height } = resizeCanvas();
    if (gpu.size.width !== width || gpu.size.height !== height) configureGPU();
    const uniformData = new Float32Array([
      width, height,
      state.time,
      state.iterations,
      state.center[0], state.center[1],
      state.scale,
      state.palette,
      state.param[0], state.param[1],
      state.pointer[0], state.pointer[1],
    ]);
    gpu.device.queue.writeBuffer(gpu.uniformBuffer, 0, uniformData);
    const encoder = gpu.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: gpu.context.getCurrentTexture().createView(),
        clearValue: { r: 0.01, g: 0.014, b: 0.014, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });
    pass.setPipeline(gpu.pipeline);
    pass.setBindGroup(0, gpu.bindGroup);
    pass.draw(3);
    pass.end();
    gpu.device.queue.submit([encoder.finish()]);
    state.dirty = false;
  }

  function frameLoop(now) {
    const delta = Math.min(0.1, Math.max(0, (now - state.lastFrame) / 1000));
    state.lastFrame = now;
    if (!state.paused) state.time += delta;
    if (fallback) renderFallback(now);
    else if (gpuReady) renderGPU();
    requestAnimationFrame(frameLoop);
  }

  function attachEvents() {
    frame.addEventListener('pointerdown', onPointerDown);
    frame.addEventListener('pointermove', onPointerMove);
    frame.addEventListener('pointerup', onPointerUp);
    frame.addEventListener('pointercancel', onPointerUp);
    frame.addEventListener('wheel', onWheel, { passive: false });
    frame.addEventListener('dblclick', () => { markInteracted(); resetView(); });
    els.reset.addEventListener('click', resetView);
    els.pause.addEventListener('click', togglePause);
    els.iterations.addEventListener('input', (event) => setIterations(event.target.value));
    els.palette.addEventListener('input', (event) => setPalette(event.target.value));
    els.copy.addEventListener('click', copyShader);
    window.addEventListener('resize', () => {
      state.dpr = Math.min(window.devicePixelRatio || 1, 2);
      state.dirty = true;
      if (gpuReady) configureGPU();
      else if (fallback) resizeCanvas();
    });
    if ('ResizeObserver' in window) {
      new ResizeObserver(() => {
        state.dirty = true;
        if (gpuReady) configureGPU();
        else if (fallback) resizeCanvas();
      }).observe(frame);
    }
  }

  async function boot() {
    buildCatalog();
    updateStudyUI();
    attachEvents();
    setStatus('checking renderer');
    try {
      await initGPU();
    } catch (error) {
      console.info('WebGPU unavailable; using fallback.', error);
      switchToFallback(error.message || 'webgpu unavailable');
    }
    requestAnimationFrame(frameLoop);
  }

  boot();
})();
