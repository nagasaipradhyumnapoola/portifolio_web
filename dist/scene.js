// The portrait is sampled into a WebGL point cloud. Its luminance becomes the
// brightness of each square particle, so rendered output is always grayscale.
const vertexSource = `
precision highp float;
attribute vec3 aPosition;
attribute vec4 aInfo;
uniform float uTime;
uniform float uAspect;
uniform float uScale;
uniform float uPoint;
uniform float uDpr;
uniform float uProgress;
uniform float uFormation;
uniform float uBlast;
uniform float uMotion;
uniform vec2 uPointer;
uniform vec2 uLook;
varying float vBrightness;
varying float vAlpha;
varying float vKind;
const float PI = 3.14159265359;
void main() {
  float seed = aInfo.y;
  float random = aInfo.z;
  float kind = aInfo.w;
  vec3 p = aPosition;
  float alpha = 1.0;
  float pointSize = uPoint;
  float age = uTime - uBlast;
  float impact = smoothstep(0.0, 0.4, age) * (1.0 - smoothstep(1.0, 3.8, age));
  if (age < 0.0) impact = 0.0;
  impact *= uMotion;
  if (kind < 0.5) {
    float angle = seed * PI * 2.0;
    vec3 outward = vec3(cos(angle), sin(angle), random - 0.5);
    float radius = 1.0 + random * 1.7;
    vec3 ring = vec3(cos(angle) * radius, sin(angle) * radius * 0.47, sin(seed * 94.0) * 0.6);
    p = mix(p, ring, smoothstep(0.12, 1.0, uProgress));
    p += outward * (1.0 - uFormation) * (2.0 + random * 4.0);
    p += outward * impact * (0.25 + random * 1.3);
    p.z += sin(uTime * 0.45 + seed * 10.0) * 0.008 * uMotion;
    p.xy *= uScale;
    p.y -= 0.055;
    vec2 delta = p.xy - uPointer;
    float dist = length(delta);
    float force = pow(max(0.0, 1.0 - dist / 0.24), 2.0) * 0.12 * uMotion;
    p.xy += delta / max(dist, 0.001) * force;
    p.z += force * 0.2;
    alpha = mix(0.98, 0.32, smoothstep(0.15, 1.0, uProgress));
    alpha *= smoothstep(0.0, 0.18, uFormation);
    pointSize *= 0.9 + aInfo.x * 0.24;
  } else if (kind < 1.5) {
    // Radial square-particle plumes sit behind both open hands.
    float side = seed < 0.5 ? -1.0 : 1.0;
    float burstAge = age - random * 0.5;
    float expansion = max(0.0, burstAge) * (0.25 + random * 0.4);
    p = vec3(side * 0.98, -0.19, -0.5) + p * expansion;
    p.y -= pow(max(0.0, burstAge), 2.0) * 0.028;
    p.xy *= uScale;
    alpha = smoothstep(0.0, 0.2, burstAge) * (1.0 - smoothstep(0.7, 3.6, burstAge));
    alpha *= 0.5 * uMotion * (1.0 - smoothstep(0.0, 0.9, uProgress));
    pointSize = uDpr * (0.75 + random * 2.0);
  } else {
    p.x *= uAspect;
    p.y += sin(uTime * 0.08 + seed * 8.0) * 0.08 * uMotion;
    p.x += cos(uTime * 0.06 + seed * 9.0) * 0.04 * uMotion;
    alpha = (0.06 + random * 0.15) * uFormation;
    pointSize = uDpr * (0.5 + random * 1.3);
  }
  float ry = uLook.x * 0.032 * uMotion;
  float rx = uLook.y * 0.018 * uMotion;
  p = vec3(p.x * cos(ry) + p.z * sin(ry), p.y, -p.x * sin(ry) + p.z * cos(ry));
  p = vec3(p.x, p.y * cos(rx) - p.z * sin(rx), p.y * sin(rx) + p.z * cos(rx));
  float perspective = 2.8 / max(1.0, 2.8 - p.z);
  gl_Position = vec4(p.x * perspective / uAspect, p.y * perspective, 0.0, 1.0);
  gl_PointSize = clamp(pointSize * perspective, 0.8, 7.0 * uDpr);
  vBrightness = pow(aInfo.x, 0.78);
  vAlpha = alpha;
  vKind = kind;
}`;

const fragmentSource = `
precision mediump float;
varying float vBrightness;
varying float vAlpha;
varying float vKind;
void main() {
  // Square rather than circular sprites preserve the requested pixel texture.
  if (vAlpha < 0.003) discard;
  float edge = max(abs(gl_PointCoord.x - 0.5), abs(gl_PointCoord.y - 0.5));
  float a = (1.0 - smoothstep(0.43, 0.5, edge)) * vAlpha;
  gl_FragColor = vec4(vec3(vBrightness), a);
}`;

function shader(gl, type, source) {
  const result = gl.createShader(type);
  gl.shaderSource(result, source);
  gl.compileShader(result);
  if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(result);
    gl.deleteShader(result);
    throw new Error(`Portrait shader: ${message}`);
  }
  return result;
}

function seededRandom(seed) {
  let n = seed;
  return () => {
    n |= 0; n = n + 0x6D2B79F5 | 0;
    let t = Math.imul(n ^ n >>> 15, 1 | n);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export async function createPortraitScene(canvas, { portrait, motion = true }) {
  const wrap = canvas.parentElement;
  const gl = canvas.getContext('webgl', {
    alpha: true, antialias: false, depth: false, premultipliedAlpha: false,
    powerPreference: 'low-power',
  });
  if (!gl) return null;

  const sourceImage = new Image();
  sourceImage.src = portrait;
  await sourceImage.decode();
  const samplingCanvas = document.createElement('canvas');
  samplingCanvas.width = innerWidth < 680 ? 460 : 720;
  const imageAspect = sourceImage.naturalWidth / sourceImage.naturalHeight;
  samplingCanvas.height = Math.round(samplingCanvas.width / imageAspect);
  const context = samplingCanvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(sourceImage, 0, 0, samplingCanvas.width, samplingCanvas.height);
  const { data } = context.getImageData(0, 0, samplingCanvas.width, samplingCanvas.height);
  const random = seededRandom(1703);
  const points = [];
  for (let y = 0; y < samplingCanvas.height; y++) {
    for (let x = 0; x < samplingCanvas.width; x++) {
      const i = (y * samplingCanvas.width + x) * 4;
      const light = (data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722) / 255;
      if (light < 0.055 || data[i + 3] < 32) continue;
      points.push(
        (x / samplingCanvas.width - 0.5) * 2 * imageAspect,
        (0.5 - y / samplingCanvas.height) * 2,
        (light - 0.45) * 0.065 + (random() - 0.5) * 0.025,
        light, random(), random(), 0,
      );
    }
  }
  for (let i = 0; i < 4200; i++) {
    const theta = random() * Math.PI * 2;
    const z = random() * 2 - 1;
    const r = Math.sqrt(1 - z * z);
    points.push(Math.cos(theta) * r, Math.sin(theta) * r, z, 0.3 + random() * 0.7, random(), random(), 1);
  }
  for (let i = 0; i < 600; i++) {
    points.push(random() * 2 - 1, random() * 2 - 1, -0.6 - random(), 0.2 + random() * 0.65, random(), random(), 2);
  }
  const vertex = shader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = shader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  gl.deleteShader(vertex); gl.deleteShader(fragment);
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(points), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'aPosition');
  const info = gl.getAttribLocation(program, 'aInfo');
  gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 28, 0);
  gl.enableVertexAttribArray(info); gl.vertexAttribPointer(info, 4, gl.FLOAT, false, 28, 12);
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  gl.disable(gl.DEPTH_TEST);
  const uniforms = Object.fromEntries(['Time','Aspect','Scale','Point','Dpr','Progress','Formation','Blast','Motion','Pointer','Look'].map(name => [name, gl.getUniformLocation(program, `u${name}`)]));
  const count = points.length / 7;
  let frame = 0, disposed = false, active = true, lost = false;
  let time = 0, lastTime = performance.now(), blastAt = 0.5, currentProgress = 0;
  let progress = 0, aspect = 1, scale = 0.8, pixelRatio = 1;
  let point = 1, targetX = 100, targetY = 100, pointerX = 100, pointerY = 100;
  let lookX = 0, lookY = 0;

  function resize() {
    const width = window.innerWidth, height = window.innerHeight;
    pixelRatio = Math.min(devicePixelRatio || 1, width < 680 ? 1.5 : 1.75);
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    gl.viewport(0, 0, canvas.width, canvas.height);
    aspect = width / height;
    scale = Math.min(0.80, aspect * (width < 680 ? 0.97 : 0.87) / imageAspect);
    point = Math.max(0.95, height * scale / samplingCanvas.height * 0.97) * pixelRatio;
    requestFrame();
  }
  function render(now) {
    frame = 0;
    if (disposed || lost) return;
    const delta = Math.min((now - lastTime) / 1000, 0.045);
    lastTime = now;
    if (motion) time += delta;
    const ease = motion ? 1 - Math.exp(-delta * 9) : 1;
    currentProgress += (progress - currentProgress) * ease;
    if (Math.abs(targetX) > 10) { pointerX = targetX; pointerY = targetY; }
    else { pointerX += (targetX - pointerX) * 0.25; pointerY += (targetY - pointerY) * 0.25; }
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(uniforms.Time, time);
    gl.uniform1f(uniforms.Aspect, aspect);
    gl.uniform1f(uniforms.Scale, scale);
    gl.uniform1f(uniforms.Point, point);
    gl.uniform1f(uniforms.Dpr, pixelRatio);
    gl.uniform1f(uniforms.Progress, currentProgress);
    gl.uniform1f(uniforms.Formation, motion ? Math.min(1, time / 1.7) : 1);
    gl.uniform1f(uniforms.Blast, blastAt);
    gl.uniform1f(uniforms.Motion, motion ? 1 : 0);
    gl.uniform2f(uniforms.Pointer, pointerX, pointerY);
    gl.uniform2f(uniforms.Look, lookX, lookY);
    gl.drawArrays(gl.POINTS, 0, count);
    if (motion && active && !document.hidden) requestFrame();
  }
  function requestFrame() {
    if (!frame && !disposed && !lost && !document.hidden) frame = requestAnimationFrame(render);
  }
  function onVisibility() {
    if (document.hidden) { cancelAnimationFrame(frame); frame = 0; }
    else { lastTime = performance.now(); requestFrame(); }
  }
  function onLost(event) {
    event.preventDefault(); lost = true; cancelAnimationFrame(frame);
    wrap.classList.remove('is-webgl');
  }
  canvas.addEventListener('webglcontextlost', onLost);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('resize', resize, { passive: true });
  resize();
  wrap.classList.add('is-webgl');
  return {
    setProgress(value) { progress = Math.max(0, Math.min(1, value)); requestFrame(); },
    setActive(value) { active = value; if (value) { lastTime = performance.now(); requestFrame(); } },
    setMotion(value) { motion = value; if (!value) { cancelAnimationFrame(frame); frame = 0; } lastTime = performance.now(); requestFrame(); },
    pointer(x, y) {
      targetX = (x / innerWidth * 2 - 1) * aspect;
      targetY = 1 - y / innerHeight * 2;
      lookX = x / innerWidth * 2 - 1; lookY = y / innerHeight * 2 - 1;
      if (Math.abs(pointerX) > 10) { pointerX = targetX; pointerY = targetY; }
    },
    clearPointer() { targetX = targetY = 100; lookX = lookY = 0; },
    burst() { if (motion) { blastAt = time; requestFrame(); } },
    dispose() {
      disposed = true; cancelAnimationFrame(frame);
      canvas.removeEventListener('webglcontextlost', onLost);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', resize);
      gl.deleteBuffer(buffer); gl.deleteProgram(program);
    },
  };
}
