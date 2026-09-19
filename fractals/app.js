/* Fractal Field — a no-build WebGL/GLSL gallery. */
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
  const fallbackTitle = $('fallback-title');
  const fallbackDetail = $('fallback-detail');
  const retryRenderer = $('retry-renderer');
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
      filename: 'mandelbrot.glsl',
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
      filename: 'julia.glsl',
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
      filename: 'burning-ship.glsl',
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
      filename: 'tricorn.glsl',
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
      filename: 'newton.glsl',
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
      filename: 'sierpinski-carpet.glsl',
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
    pointers: new Map(),
    pinch: null,
    interacted: false,
  };

  let gl = null;
  let glVersion = 0;
  let renderer = null;
  let fallback = false;
  let fragmentPrecision = 'highp';
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
    if (gl) {
      try {
        compileStudy();
      } catch (error) {
        switchToFallback(`shader compile failed: ${error.message || 'unknown error'}`);
      }
    }
  }

  function resizeCanvas() {
    const rect = frame.getBoundingClientRect();
    const cssWidth = Math.max(1, Math.floor(rect.width));
    const cssHeight = Math.max(1, Math.floor(rect.height));
    let width = Math.max(1, Math.floor(cssWidth * state.dpr));
    let height = Math.max(1, Math.floor(cssHeight * state.dpr));

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

  function pointerPair() {
    return [...state.pointers.values()].slice(0, 2);
  }

  function onPointerDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    markInteracted();
    state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    frame.setPointerCapture?.(event.pointerId);

    if (state.pointers.size === 1) {
      state.dragging = true;
      state.dragStart = {
        x: event.clientX,
        y: event.clientY,
        center: [...state.center],
      };
    } else if (state.pointers.size === 2) {
      state.dragging = false;
      const [a, b] = pointerPair();
      state.pinch = { lastDistance: Math.hypot(a.x - b.x, a.y - b.y) };
    }
    frame.classList.toggle('is-dragging', state.dragging);
  }

  function onPointerMove(event) {
    if (state.pointers.has(event.pointerId)) {
      state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    state.pointer = normalizedPointer(event.clientX, event.clientY);
    updateReadout(event.clientX, event.clientY);

    if (state.pointers.size >= 2 && state.pinch) {
      const [a, b] = pointerPair();
      const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (distance > 0 && state.pinch.lastDistance > 0) {
        zoomAt(midpoint.x, midpoint.y, state.pinch.lastDistance / distance);
      }
      state.pinch.lastDistance = distance;
      return;
    }

    if (!state.dragging || !state.dragStart || state.pointers.size !== 1) return;
    const rect = frame.getBoundingClientRect();
    const aspect = rect.width / rect.height;
    state.center[0] = state.dragStart.center[0] - ((event.clientX - state.dragStart.x) / rect.width) * 2 * aspect * state.scale;
    state.center[1] = state.dragStart.center[1] + ((event.clientY - state.dragStart.y) / rect.height) * 2 * state.scale;
    state.dirty = true;
  }

  function onPointerUp(event) {
    state.pointers.delete(event.pointerId);
    frame.releasePointerCapture?.(event.pointerId);
    state.pinch = null;
    if (state.pointers.size === 1) {
      const [point] = pointerPair();
      state.dragging = true;
      state.dragStart = { x: point.x, y: point.y, center: [...state.center] };
    } else {
      state.dragging = false;
      state.dragStart = null;
    }
    frame.classList.toggle('is-dragging', state.dragging);
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

  function shaderSource(source, type) {
    if (glVersion === 2) return source;
    let converted = source.replace(/^#version 300 es\s*/m, '');
    if (type === 'vertex') {
      return converted
        .replace(/\bin vec2 a_position\b/g, 'attribute vec2 a_position')
        .replace(/\bout vec2 v_uv\b/g, 'varying vec2 v_uv');
    }
    converted = converted
      .replace(/\bin vec2 v_uv\b/g, 'varying vec2 v_uv')
      .replace(/\bout vec4 fragColor;\s*/g, '')
      .replace(/\bfragColor\b/g, 'gl_FragColor');
    if (fragmentPrecision === 'mediump') converted = converted.replace('precision highp float;', 'precision mediump float;');
    return converted;
  }

  function compileShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, shaderSource(source, type === gl.VERTEX_SHADER ? 'vertex' : 'fragment'));
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader) || 'unknown shader compile error';
      gl.deleteShader(shader);
      throw new Error(message);
    }
    return shader;
  }

  function compileStudy() {
    if (!gl) return;
    const study = currentStudy();
    try {
      const vertex = compileShader(gl.VERTEX_SHADER, GLSL_VERTEX_SHADER);
      const fragment = compileShader(gl.FRAGMENT_SHADER, SHADERS[study.key]);
      const program = gl.createProgram();
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const message = gl.getProgramInfoLog(program) || 'unknown program link error';
        gl.deleteProgram(program);
        throw new Error(message);
      }
      if (renderer?.program) gl.deleteProgram(renderer.program);
      renderer = {
        program,
        position: gl.getAttribLocation(program, 'a_position'),
        uniforms: {
          resolution: gl.getUniformLocation(program, 'u_resolution'),
          time: gl.getUniformLocation(program, 'u_time'),
          iterations: gl.getUniformLocation(program, 'u_iterations'),
          center: gl.getUniformLocation(program, 'u_center'),
          scale: gl.getUniformLocation(program, 'u_scale'),
          palette: gl.getUniformLocation(program, 'u_palette'),
          param: gl.getUniformLocation(program, 'u_param'),
          pointer: gl.getUniformLocation(program, 'u_pointer'),
        },
      };
      state.dirty = true;
      setStatus(glVersion === 2 ? 'webgl2 · glsl live' : 'webgl · glsl live', 'ready');
    } catch (error) {
      console.warn('GLSL program failed.', error);
      throw error;
    }
  }

  function initGL() {
    const attributes = {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      failIfMajorPerformanceCaveat: false,
      powerPreference: 'default',
    };

    // Prefer WebGL 1: it is the most compatible GLSL path on older phones and
    // in embedded browsers. The shader source is converted below when needed.
    gl = canvas.getContext('webgl', attributes) || canvas.getContext('experimental-webgl', attributes);
    glVersion = gl ? 1 : 0;
    if (!gl) {
      gl = canvas.getContext('webgl2', attributes);
      glVersion = gl ? 2 : 0;
    }
    if (!gl) throw new Error('WebGL is unavailable');

    const precision = gl.getShaderPrecisionFormat?.(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
    if (!precision || precision.precision === 0) fragmentPrecision = 'mediump';
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    renderer = { buffer };
    fallback = false;
    frame.classList.remove('is-fallback');
    fallbackMessage.hidden = true;
    resizeCanvas();
    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      switchToFallback('webgl context lost');
    }, { once: true });
    compileStudy();
  }

  function switchToFallback(reason) {
    fallback = true;
    frame.classList.add('is-fallback');
    fallbackMessage.hidden = false;
    setStatus('canvas 2d · reference', 'fallback');

    const message = String(reason || '').toLowerCase();
    const inEmbeddedBrowser = /discord|instagram|facebook|fbav|fban|line\//i.test(navigator.userAgent);
    if (message.includes('shader compile')) {
      fallbackTitle.textContent = 'This browser rejected the GLSL shader.';
      fallbackDetail.textContent = 'The live Canvas 2D preview is still running. Try Safari or Chrome for the GPU version.';
    } else if (inEmbeddedBrowser) {
      fallbackTitle.textContent = 'This in-app browser has WebGL turned off.';
      fallbackDetail.textContent = 'GitHub Pages allows WebGL. Use “Open in browser” to launch the GLSL version in Safari or Chrome.';
    } else {
      fallbackTitle.textContent = 'WebGL is unavailable in this browser.';
      fallbackDetail.textContent = 'GitHub Pages is not blocking it. Try Safari or Chrome with hardware acceleration enabled.';
    }

    console.info(reason);
    if (gl && renderer?.program) gl.deleteProgram(renderer.program);
    gl = null;
    renderer = null;
    fallbackContext = fallbackCanvas.getContext('2d', { alpha: false, willReadFrequently: true });
    resizeCanvas();
    state.dirty = true;
  }

  function paletteColor(t, shift) {
    const phase = [0.02, 0.24, 0.51];
    const speed = [0.94, 0.67, 0.46];
    return phase.map((p, index) => {
      const value = 0.5 + 0.5 * Math.cos(Math.PI * 2 * (p + shift / (Math.PI * 2) + t * speed[index]));
      return Math.max(0, Math.min(1, value));
    });
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
      const nextX = ax * ax - ay * ay;
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

  function renderGL() {
    if (!gl || !renderer?.program) return;
    if (state.paused && !state.dirty) return;
    const { width, height } = resizeCanvas();
    gl.viewport(0, 0, width, height);
    gl.clearColor(0.01, 0.014, 0.014, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(renderer.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, renderer.buffer);
    gl.enableVertexAttribArray(renderer.position);
    gl.vertexAttribPointer(renderer.position, 2, gl.FLOAT, false, 0, 0);
    const u = renderer.uniforms;
    gl.uniform2f(u.resolution, width, height);
    gl.uniform1f(u.time, state.time);
    gl.uniform1f(u.iterations, state.iterations);
    gl.uniform2f(u.center, state.center[0], state.center[1]);
    gl.uniform1f(u.scale, state.scale);
    gl.uniform1f(u.palette, state.palette);
    gl.uniform2f(u.param, state.param[0], state.param[1]);
    gl.uniform2f(u.pointer, state.pointer[0], state.pointer[1]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    state.dirty = false;
  }

  function frameLoop(now) {
    const delta = Math.min(0.1, Math.max(0, (now - state.lastFrame) / 1000));
    state.lastFrame = now;
    if (!state.paused) state.time += delta;
    if (fallback) renderFallback(now);
    else renderGL();
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
    retryRenderer.addEventListener('click', () => window.location.reload());
    window.addEventListener('resize', () => {
      state.dpr = Math.min(window.devicePixelRatio || 1, 2);
      state.dirty = true;
      resizeCanvas();
    });
    if ('ResizeObserver' in window) {
      new ResizeObserver(() => {
        state.dirty = true;
        resizeCanvas();
      }).observe(frame);
    }
  }

  function boot() {
    buildCatalog();
    updateStudyUI();
    attachEvents();
    setStatus('checking renderer');
    try {
      initGL();
    } catch (error) {
      console.info('WebGL unavailable; using Canvas 2D fallback.', error);
      switchToFallback(error.message || 'webgl unavailable');
    }
    requestAnimationFrame(frameLoop);
  }

  boot();
})();
