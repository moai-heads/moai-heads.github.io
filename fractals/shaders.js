const WGSL_HEADER = `struct Uniforms {
  resolution: vec2f,
  time: f32,
  iterations: f32,
  center: vec2f,
  scale: f32,
  palette: f32,
  param: vec2f,
  pointer: vec2f,
};

@group(0) @binding(0) var<uniform> u: Uniforms;

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vertex_main(@builtin(vertex_index) index: u32) -> VertexOut {
  var positions = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f( 3.0, -1.0),
    vec2f(-1.0,  3.0)
  );
  var out: VertexOut;
  out.position = vec4f(positions[index], 0.0, 1.0);
  out.uv = positions[index] * 0.5 + vec2f(0.5);
  return out;
}

fn complex_square(z: vec2f) -> vec2f {
  return vec2f(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y);
}

fn complex_mul(a: vec2f, b: vec2f) -> vec2f {
  return vec2f(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

fn complex_div(a: vec2f, b: vec2f) -> vec2f {
  let d = max(dot(b, b), 0.0000001);
  return vec2f(
    (a.x * b.x + a.y * b.y) / d,
    (a.y * b.x - a.x * b.y) / d
  );
}

fn plane(uv: vec2f) -> vec2f {
  let aspect = u.resolution.x / u.resolution.y;
  let screen = (uv * 2.0 - vec2f(1.0)) * vec2f(aspect, -1.0);
  return u.center + screen * u.scale;
}

fn palette(t: f32, shift: f32) -> vec3f {
  let phase = vec3f(0.02, 0.24, 0.51) + shift / 6.28318;
  let wave = cos(6.28318 * (phase + t * vec3f(0.94, 0.67, 0.46)));
  return clamp(vec3f(0.5) + vec3f(0.5) * wave, vec3f(0.0), vec3f(1.0));
}

fn linear_to_screen(color: vec3f) -> vec4f {
  return vec4f(pow(max(color, vec3f(0.0)), vec3f(0.4545)), 1.0);
}`;

const SHADERS = {
  mandelbrot: `${WGSL_HEADER}

@fragment
fn fragment_main(input: VertexOut) -> @location(0) vec4f {
  let c = plane(input.uv);
  var z = vec2f(0.0);
  var escaped = 0u;
  var magnitude = 0.0;

  for (var i = 0u; i < 4096u; i = i + 1u) {
    if (f32(i) >= u.iterations) { break; }
    z = complex_square(z) + c;
    magnitude = dot(z, z);
    if (magnitude > 256.0) {
      escaped = i + 1u;
      break;
    }
  }

  if (escaped == 0u) {
    let interior = 0.015 + 0.018 * sin(u.time * 0.35 + c.x * 3.0);
    return vec4f(vec3f(interior, interior * 1.18, interior * 0.86), 1.0);
  }

  let smooth = (f32(escaped) + 1.0 - log2(log2(max(sqrt(magnitude), 1.0001)))) / u.iterations;
  let edge = clamp(smooth, 0.0, 1.0);
  let color = palette(edge * 1.15, u.palette + u.time * 0.10);
  return linear_to_screen(color * (0.26 + 1.18 * pow(edge, 0.56)));
}`,

  julia: `${WGSL_HEADER}

@fragment
fn fragment_main(input: VertexOut) -> @location(0) vec4f {
  var z = plane(input.uv);
  let c = u.param;
  var escaped = 0u;
  var magnitude = 0.0;

  for (var i = 0u; i < 4096u; i = i + 1u) {
    if (f32(i) >= u.iterations) { break; }
    z = complex_square(z) + c;
    magnitude = dot(z, z);
    if (magnitude > 256.0) {
      escaped = i + 1u;
      break;
    }
  }

  if (escaped == 0u) {
    let inner = 0.018 + 0.012 * sin(u.time * 0.42 + length(z));
    return vec4f(vec3f(inner * 0.8, inner, inner * 1.1), 1.0);
  }

  let smooth = (f32(escaped) + 1.0 - log2(log2(max(sqrt(magnitude), 1.0001)))) / u.iterations;
  let edge = clamp(smooth, 0.0, 1.0);
  let color = palette(edge * 1.28, u.palette + 0.5 + u.time * 0.08);
  return linear_to_screen(color * (0.22 + 1.3 * pow(edge, 0.52)));
}`,

  burningShip: `${WGSL_HEADER}

@fragment
fn fragment_main(input: VertexOut) -> @location(0) vec4f {
  let c = plane(input.uv);
  var z = vec2f(0.0);
  var escaped = 0u;
  var magnitude = 0.0;

  for (var i = 0u; i < 4096u; i = i + 1u) {
    if (f32(i) >= u.iterations) { break; }
    z = complex_square(abs(z)) + c;
    magnitude = dot(z, z);
    if (magnitude > 256.0) {
      escaped = i + 1u;
      break;
    }
  }

  if (escaped == 0u) {
    return vec4f(vec3f(0.012, 0.010, 0.015), 1.0);
  }

  let smooth = (f32(escaped) + 1.0 - log2(log2(max(sqrt(magnitude), 1.0001)))) / u.iterations;
  let edge = clamp(smooth, 0.0, 1.0);
  let color = palette(edge * 0.88, u.palette + 1.75 + u.time * 0.06);
  return linear_to_screen(color * (0.26 + 1.22 * pow(edge, 0.50)));
}`,

  tricorn: `${WGSL_HEADER}

@fragment
fn fragment_main(input: VertexOut) -> @location(0) vec4f {
  let c = plane(input.uv);
  var z = vec2f(0.0);
  var escaped = 0u;
  var magnitude = 0.0;

  for (var i = 0u; i < 4096u; i = i + 1u) {
    if (f32(i) >= u.iterations) { break; }
    z = vec2f(
      z.x * z.x - z.y * z.y,
      -2.0 * z.x * z.y
    ) + c;
    magnitude = dot(z, z);
    if (magnitude > 256.0) {
      escaped = i + 1u;
      break;
    }
  }

  if (escaped == 0u) {
    let interior = 0.012 + 0.016 * abs(sin(c.x * 2.0 + u.time * 0.3));
    return vec4f(vec3f(interior * 0.78, interior, interior * 1.05), 1.0);
  }

  let smooth = (f32(escaped) + 1.0 - log2(log2(max(sqrt(magnitude), 1.0001)))) / u.iterations;
  let edge = clamp(smooth, 0.0, 1.0);
  let color = palette(edge * 1.08, u.palette + 3.45 + u.time * 0.07);
  return linear_to_screen(color * (0.23 + 1.24 * pow(edge, 0.55)));
}`,

  newton: `${WGSL_HEADER}

@fragment
fn fragment_main(input: VertexOut) -> @location(0) vec4f {
  var z = plane(input.uv);
  var steps = 0u;
  var converged = false;

  for (var i = 0u; i < 4096u; i = i + 1u) {
    if (f32(i) >= u.iterations) { break; }
    let z2 = complex_square(z);
    let f = complex_mul(z2, z) - vec2f(1.0, 0.0);
    if (length(f) < 0.00008) {
      steps = i;
      converged = true;
      break;
    }
    z = z - complex_div(f, z2 * 3.0);
    steps = i + 1u;
  }

  if (!converged) {
    let haze = 0.035 + 0.045 * sin(length(z) * 5.0 + u.time * 0.2);
    return vec4f(vec3f(haze * 0.8, haze * 0.42, haze * 0.52), 1.0);
  }

  let roots = array<vec2f, 3>(
    vec2f(1.0, 0.0),
    vec2f(-0.5, 0.8660254),
    vec2f(-0.5, -0.8660254)
  );
  let root_colors = array<vec3f, 3>(
    vec3f(0.82, 0.98, 0.38),
    vec3f(0.98, 0.42, 0.26),
    vec3f(0.35, 0.68, 1.0)
  );
  var nearest = 0u;
  var best = 1000.0;
  for (var r = 0u; r < 3u; r = r + 1u) {
    let d = distance(z, roots[r]);
    if (d < best) {
      best = d;
      nearest = r;
    }
  }

  let speed = 1.0 - clamp(f32(steps) / u.iterations, 0.0, 1.0);
  let halo = palette(speed * 0.8, u.palette + u.time * 0.04) * 0.12;
  return linear_to_screen(root_colors[nearest] * (0.18 + 0.95 * speed) + halo);
}`,

  sierpinski: `${WGSL_HEADER}

fn carpet_value(p: vec2f) -> f32 {
  var q = fract(p);
  var value = 1.0;
  for (var i = 0u; i < 14u; i = i + 1u) {
    q = fract(q * 3.0);
    let x_hole = step(0.333333, q.x) * (1.0 - step(0.666667, q.x));
    let y_hole = step(0.333333, q.y) * (1.0 - step(0.666667, q.y));
    if (x_hole * y_hole > 0.5) {
      return 0.0;
    }
    value = value * 0.94;
  }
  return value;
}

@fragment
fn fragment_main(input: VertexOut) -> @location(0) vec4f {
  let p = plane(input.uv);
  let tile = p * 0.34 + vec2f(0.5);
  let field = carpet_value(tile);
  let glow = 0.48 + 0.52 * sin(u.time * 0.35 + p.x * 1.7 + p.y * 1.2);
  let color = palette(field * 0.78 + glow * 0.10, u.palette + u.time * 0.05);
  let ink = mix(vec3f(0.009, 0.014, 0.014), color * (0.58 + glow * 0.3), field);
  return linear_to_screen(ink);
}`,
};
