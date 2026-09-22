const GLSL_FRAGMENT_HEADER = `#version 300 es
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_iterations;
uniform vec2 u_center;
uniform float u_scale;
uniform float u_palette;
uniform vec2 u_param;
uniform vec2 u_pointer;

in vec2 v_uv;
out vec4 fragColor;

vec2 complexSquare(vec2 z) {
  return vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y);
}

vec2 complexMul(vec2 a, vec2 b) {
  return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

vec2 complexDiv(vec2 a, vec2 b) {
  float d = max(dot(b, b), 0.0000001);
  return vec2((a.x * b.x + a.y * b.y) / d, (a.y * b.x - a.x * b.y) / d);
}

vec2 plane(vec2 uv) {
  float aspect = u_resolution.x / u_resolution.y;
  vec2 screen = (uv * 2.0 - 1.0) * vec2(aspect, -1.0);
  return u_center + screen * u_scale;
}

vec3 palette(float t, float shift) {
  vec3 phase = vec3(0.02, 0.24, 0.51) + vec3(shift / 6.28318);
  vec3 wave = cos(6.28318 * (phase + t * vec3(0.94, 0.67, 0.46)));
  return clamp(vec3(0.5) + vec3(0.5) * wave, vec3(0.0), vec3(1.0));
}

vec4 linearToScreen(vec3 color) {
  return vec4(pow(max(color, vec3(0.0)), vec3(0.4545)), 1.0);
}`;

const GLSL_VERTEX_SHADER = `#version 300 es
in vec2 a_position;
out vec2 v_uv;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const SHADERS = {
  mandelbrot: `${GLSL_FRAGMENT_HEADER}

void main() {
  vec2 c = plane(v_uv);
  vec2 z = vec2(0.0);
  int escaped = 0;
  float magnitude = 0.0;

  for (int i = 0; i < 1024; i++) {
    if (float(i) >= u_iterations) break;
    z = complexSquare(z) + c;
    magnitude = dot(z, z);
    if (magnitude > 256.0) {
      escaped = i + 1;
      break;
    }
  }

  if (escaped == 0) {
    float interior = 0.015 + 0.018 * sin(u_time * 0.35 + c.x * 3.0);
    fragColor = vec4(vec3(interior, interior * 1.18, interior * 0.86), 1.0);
    return;
  }

  float smoothEscape = (float(escaped) + 1.0 - log2(log2(max(sqrt(magnitude), 1.0001)))) / u_iterations;
  float edge = clamp(smoothEscape, 0.0, 1.0);
  vec3 color = palette(edge * 1.15, u_palette + u_time * 0.10);
  fragColor = linearToScreen(color * (0.26 + 1.18 * pow(edge, 0.56)));
}`,

  julia: `${GLSL_FRAGMENT_HEADER}

void main() {
  vec2 z = plane(v_uv);
  vec2 c = u_param;
  int escaped = 0;
  float magnitude = 0.0;

  for (int i = 0; i < 1024; i++) {
    if (float(i) >= u_iterations) break;
    z = complexSquare(z) + c;
    magnitude = dot(z, z);
    if (magnitude > 256.0) {
      escaped = i + 1;
      break;
    }
  }

  if (escaped == 0) {
    float inner = 0.018 + 0.012 * sin(u_time * 0.42 + length(z));
    fragColor = vec4(vec3(inner * 0.8, inner, inner * 1.1), 1.0);
    return;
  }

  float smoothEscape = (float(escaped) + 1.0 - log2(log2(max(sqrt(magnitude), 1.0001)))) / u_iterations;
  float edge = clamp(smoothEscape, 0.0, 1.0);
  vec3 color = palette(edge * 1.28, u_palette + 0.5 + u_time * 0.08);
  fragColor = linearToScreen(color * (0.22 + 1.3 * pow(edge, 0.52)));
}`,

  burningShip: `${GLSL_FRAGMENT_HEADER}

void main() {
  vec2 c = plane(v_uv);
  vec2 z = vec2(0.0);
  int escaped = 0;
  float magnitude = 0.0;

  for (int i = 0; i < 1024; i++) {
    if (float(i) >= u_iterations) break;
    z = complexSquare(abs(z)) + c;
    magnitude = dot(z, z);
    if (magnitude > 256.0) {
      escaped = i + 1;
      break;
    }
  }

  if (escaped == 0) {
    fragColor = vec4(0.012, 0.010, 0.015, 1.0);
    return;
  }

  float smoothEscape = (float(escaped) + 1.0 - log2(log2(max(sqrt(magnitude), 1.0001)))) / u_iterations;
  float edge = clamp(smoothEscape, 0.0, 1.0);
  vec3 color = palette(edge * 0.88, u_palette + 1.75 + u_time * 0.06);
  fragColor = linearToScreen(color * (0.26 + 1.22 * pow(edge, 0.50)));
}`,

  tricorn: `${GLSL_FRAGMENT_HEADER}

void main() {
  vec2 c = plane(v_uv);
  vec2 z = vec2(0.0);
  int escaped = 0;
  float magnitude = 0.0;

  for (int i = 0; i < 1024; i++) {
    if (float(i) >= u_iterations) break;
    z = vec2(z.x * z.x - z.y * z.y, -2.0 * z.x * z.y) + c;
    magnitude = dot(z, z);
    if (magnitude > 256.0) {
      escaped = i + 1;
      break;
    }
  }

  if (escaped == 0) {
    float interior = 0.012 + 0.016 * abs(sin(c.x * 2.0 + u_time * 0.3));
    fragColor = vec4(interior * 0.78, interior, interior * 1.05, 1.0);
    return;
  }

  float smoothEscape = (float(escaped) + 1.0 - log2(log2(max(sqrt(magnitude), 1.0001)))) / u_iterations;
  float edge = clamp(smoothEscape, 0.0, 1.0);
  vec3 color = palette(edge * 1.08, u_palette + 3.45 + u_time * 0.07);
  fragColor = linearToScreen(color * (0.23 + 1.24 * pow(edge, 0.55)));
}`,

  newton: `${GLSL_FRAGMENT_HEADER}

void main() {
  vec2 z = plane(v_uv);
  int steps = 0;
  bool converged = false;

  for (int i = 0; i < 1024; i++) {
    if (float(i) >= u_iterations) break;
    vec2 z2 = complexSquare(z);
    vec2 f = complexMul(z2, z) - vec2(1.0, 0.0);
    if (length(f) < 0.00008) {
      steps = i;
      converged = true;
      break;
    }
    z -= complexDiv(f, z2 * 3.0);
    steps = i + 1;
  }

  if (!converged) {
    float haze = 0.035 + 0.045 * sin(length(z) * 5.0 + u_time * 0.2);
    fragColor = vec4(haze * 0.8, haze * 0.42, haze * 0.52, 1.0);
    return;
  }

  float d0 = distance(z, vec2(1.0, 0.0));
  float d1 = distance(z, vec2(-0.5, 0.8660254));
  float d2 = distance(z, vec2(-0.5, -0.8660254));
  vec3 rootColor = vec3(0.82, 0.98, 0.38);
  float best = d0;
  if (d1 < best) {
    best = d1;
    rootColor = vec3(0.98, 0.42, 0.26);
  }
  if (d2 < best) {
    rootColor = vec3(0.35, 0.68, 1.0);
  }

  float speed = 1.0 - clamp(float(steps) / u_iterations, 0.0, 1.0);
  vec3 halo = palette(speed * 0.8, u_palette + u_time * 0.04) * 0.12;
  fragColor = linearToScreen(rootColor * (0.18 + 0.95 * speed) + halo);
}`,

  lyapunov: `${GLSL_FRAGMENT_HEADER}

void main() {
  float aspect = u_resolution.x / u_resolution.y;
  vec2 screen = (v_uv * 2.0 - 1.0) * vec2(aspect, 1.0);
  vec2 ab = u_center + screen * u_scale;
  float a = ab.x;
  float b = ab.y;
  float x = 0.5;
  float exponentSum = 0.0;
  const int warmup = 96;
  int sampleCount = clamp(int(u_iterations), 48, 800);
  int totalSteps = warmup + sampleCount;
  bool diverged = false;

  for (int i = 0; i < 1024; i++) {
    if (i >= totalSteps) break;
    int phase = i % 6;
    float r = (phase == 0 || phase == 1 || phase == 3) ? a : b;
    float derivative = abs(r * (1.0 - 2.0 * x));
    x = r * x * (1.0 - x);
    if (abs(x) > 1000000.0) {
      diverged = true;
      break;
    }
    if (i >= warmup) {
      exponentSum += log(max(derivative, 0.0000001));
    }
  }

  float exponent = diverged ? 0.9 : exponentSum / float(sampleCount);
  vec3 deep = vec3(0.012, 0.025, 0.11);
  vec3 violet = vec3(0.39, 0.12, 0.53);
  vec3 gold = vec3(1.0, 0.71, 0.39);
  vec3 teal = vec3(0.16, 0.86, 0.75);
  vec3 blue = vec3(0.34, 0.40, 0.98);
  vec3 color;

  if (exponent < 0.0) {
    float t = smoothstep(-1.2, 0.0, exponent);
    color = t < 0.62
      ? mix(deep, violet, t / 0.62)
      : mix(violet, gold, (t - 0.62) / 0.38);
  } else {
    float t = smoothstep(0.0, 0.85, exponent);
    color = t < 0.68
      ? mix(gold, teal, t / 0.68)
      : mix(teal, blue, (t - 0.68) / 0.32);
  }

  float contour = 0.91 + 0.09 * (0.5 + 0.5 * cos(exponent * 85.0));
  vec3 paletteColor = palette(0.48 + exponent * 0.16, u_palette);
  color = mix(color, paletteColor, 0.16) * contour;
  fragColor = linearToScreen(color);
}`,

  sierpinski: `${GLSL_FRAGMENT_HEADER}

float carpetValue(vec2 p) {
  vec2 q = fract(p);
  float value = 1.0;
  for (int i = 0; i < 14; i++) {
    q = fract(q * 3.0);
    float xHole = step(0.333333, q.x) * (1.0 - step(0.666667, q.x));
    float yHole = step(0.333333, q.y) * (1.0 - step(0.666667, q.y));
    if (xHole * yHole > 0.5) return 0.0;
    value *= 0.94;
  }
  return value;
}

void main() {
  vec2 p = plane(v_uv);
  vec2 tile = p * 0.34 + vec2(0.5);
  float field = carpetValue(tile);
  float glow = 0.48 + 0.52 * sin(u_time * 0.35 + p.x * 1.7 + p.y * 1.2);
  vec3 color = palette(field * 0.78 + glow * 0.10, u_palette + u_time * 0.05);
  vec3 ink = mix(vec3(0.009, 0.014, 0.014), color * (0.58 + glow * 0.3), field);
  fragColor = linearToScreen(ink);
}`,
};
