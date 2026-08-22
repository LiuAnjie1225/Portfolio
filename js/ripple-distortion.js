import {
  Renderer,
  Program,
  Mesh,
  Geometry,
  Triangle,
  Texture,
  RenderTarget
} from '../assets/vendor/ogl-1.0.11.mjs';

// Source: https://reactbits.dev/r/RippleDistortion-JS-CSS.json
// React Bits RippleDistortion, adapted from React to this build-free static site.
const MAX_WAVES = 100;
const QUALITY_SCALE = { low: 0.4, medium: 0.7, high: 1 };
const START_SCALE = 1.5;
const LIFE_CONSTANT = Math.log(500);

const waveVertex = `
precision highp float;

attribute vec2 position;
attribute vec2 uv;
attribute vec2 iOffset;
attribute vec2 iScale;
attribute float iOpacity;

varying vec2 vUv;
varying float vOpacity;

void main() {
  vUv = uv;
  vOpacity = iOpacity;
  gl_Position = vec4(iOffset + position * iScale, 0.0, 1.0);
}
`;

const waveFragment = `
precision highp float;

varying vec2 vUv;
varying float vOpacity;

uniform float uRings;

const float PI = 3.141592653589793;
const float EDGE = 0.006737947;

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = dot(p, p);
  if (r > 1.0) discard;

  float brush = (exp(-r * 5.0) - EDGE) / (1.0 - EDGE);
  brush *= 0.55 + 0.45 * cos(sqrt(r) * PI * 2.0 * uRings);

  gl_FragColor = vec4(vec3(brush * vOpacity * vOpacity), 1.0);
}
`;

const screenVertex = `
precision highp float;
attribute vec2 position;
attribute vec2 uv;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const compositeFragment = `
precision highp float;

varying vec2 vUv;

uniform sampler2D uTexture;
uniform sampler2D uDisplacement;
uniform vec2 uResolution;
uniform vec2 uTextureSize;
uniform vec2 uTexel;
uniform vec3 uTint;
uniform vec3 uHighlight;
uniform float uStrength;
uniform float uSwirl;
uniform float uDispersion;
uniform float uGlint;
uniform float uTintAmount;
uniform float uGrayscale;

const float TAU = 6.283185307179586;

vec2 coverUV(vec2 uv) {
  vec2 safe = max(uTextureSize, vec2(1.0));
  vec2 s = uResolution / safe;
  vec2 scaledSize = safe * max(s.x, s.y);
  vec2 offset = (uResolution - scaledSize) * 0.5;
  return (uv * uResolution - offset) / scaledSize;
}

void main() {
  float amount = texture2D(uDisplacement, vUv).r;
  vec2 base = coverUV(vUv);

  float theta = amount * uSwirl * TAU;
  vec2 dir = vec2(sin(theta), cos(theta));
  vec2 push = dir * amount * uStrength;

  vec3 color;
  if (uDispersion > 0.001) {
    float split = uDispersion * 0.25;
    color.r = texture2D(uTexture, base + push * (1.0 + split)).r;
    color.g = texture2D(uTexture, base + push).g;
    color.b = texture2D(uTexture, base + push * (1.0 - split)).b;
  } else {
    color = texture2D(uTexture, base + push).rgb;
  }

  if (uGrayscale > 0.001) {
    color = mix(color, vec3(dot(color, vec3(0.2126, 0.7152, 0.0722))), uGrayscale);
  }

  if (uTintAmount > 0.001) {
    color = mix(color, color * uTint * 1.9, clamp(amount * 1.6, 0.0, 1.0) * uTintAmount);
  }

  if (uGlint > 0.001) {
    float ex = texture2D(uDisplacement, vUv + vec2(uTexel.x, 0.0)).r - texture2D(uDisplacement, vUv - vec2(uTexel.x, 0.0)).r;
    float ey = texture2D(uDisplacement, vUv + vec2(0.0, uTexel.y)).r - texture2D(uDisplacement, vUv - vec2(0.0, uTexel.y)).r;
    vec3 normal = normalize(vec3(-ex * 26.0, -ey * 26.0, 1.0));
    vec3 light = normalize(vec3(-0.35, 0.55, 1.0));
    float raw = pow(max(dot(normal, light), 0.0), 22.0);
    float flatSpec = pow(max(light.z, 0.0), 22.0);
    color += uHighlight * clamp((raw - flatSpec) / max(1.0 - flatSpec, 0.0001), 0.0, 1.0) * uGlint;
  }

  gl_FragColor = vec4(color, 1.0);
}
`;

const hexToRGB = (hex) => {
  const clean = hex.replace('#', '');
  const full = clean.length === 3
    ? clean.split('').map((character) => character + character).join('')
    : clean;
  const value = parseInt(full, 16);
  if (Number.isNaN(value)) return [1, 1, 1];
  return [
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255
  ];
};

function mountRippleDistortion(mount, options) {
  if (!mount) return () => {};

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const config = {
    brushSize: options.brushSize,
    spread: options.spread,
    fade: options.fade,
    spacing: options.spacing,
    clickStrength: options.clickStrength,
    trigger: options.trigger,
    enabled: options.enabled
  };

  let renderer;
  try {
    renderer = new Renderer({
      alpha: false,
      antialias: false,
      dpr: Math.min(window.devicePixelRatio || 1, 2)
    });
  } catch (error) {
    mount.dataset.renderer = 'image-fallback';
    console.warn('RippleDistortion WebGL unavailable:', error);
    return () => {};
  }

  const gl = renderer.gl;
  gl.clearColor(0, 0, 0, 1);
  const canvas = gl.canvas;
  canvas.setAttribute('aria-hidden', 'true');
  mount.appendChild(canvas);

  const imageTexture = new Texture(gl, {
    generateMipmaps: false,
    minFilter: gl.LINEAR,
    magFilter: gl.LINEAR,
    wrapS: gl.CLAMP_TO_EDGE,
    wrapT: gl.CLAMP_TO_EDGE
  });

  const offsets = new Float32Array(MAX_WAVES * 2);
  const scales = new Float32Array(MAX_WAVES * 2);
  const opacities = new Float32Array(MAX_WAVES);
  const waves = Array.from({ length: MAX_WAVES }, () => ({
    x: 0,
    y: 0,
    scale: START_SCALE,
    target: START_SCALE,
    size: 1,
    opacity: 0
  }));
  let current = 0;

  const geometry = new Geometry(gl, {
    position: {
      size: 2,
      data: new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1])
    },
    uv: {
      size: 2,
      data: new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1])
    },
    iOffset: { instanced: 1, size: 2, data: offsets },
    iScale: { instanced: 1, size: 2, data: scales },
    iOpacity: { instanced: 1, size: 1, data: opacities }
  });

  const waveUniforms = { uRings: { value: options.rings } };
  const waveProgram = new Program(gl, {
    vertex: waveVertex,
    fragment: waveFragment,
    uniforms: waveUniforms,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    cullFace: false
  });
  waveProgram.setBlendFunc(gl.ONE, gl.ONE);
  const waveMesh = new Mesh(gl, {
    geometry,
    program: waveProgram,
    frustumCulled: false
  });

  const displacementTarget = new RenderTarget(gl, {
    width: 2,
    height: 2,
    depth: false,
    minFilter: gl.LINEAR,
    magFilter: gl.LINEAR,
    wrapS: gl.CLAMP_TO_EDGE,
    wrapT: gl.CLAMP_TO_EDGE
  });

  const compositeUniforms = {
    uTexture: { value: imageTexture },
    uDisplacement: { value: displacementTarget.texture },
    uResolution: { value: [1, 1] },
    uTextureSize: { value: [1, 1] },
    uTexel: { value: [1, 1] },
    uTint: { value: hexToRGB(options.tint) },
    uHighlight: { value: hexToRGB(options.highlightColor) },
    uStrength: { value: options.strength },
    uSwirl: { value: options.swirl },
    uDispersion: { value: options.dispersion },
    uGlint: { value: options.glint },
    uTintAmount: { value: options.tintAmount },
    uGrayscale: { value: options.grayscale ? 1 : 0 }
  };

  const compositeMesh = new Mesh(gl, {
    geometry: new Triangle(gl),
    program: new Program(gl, {
      vertex: screenVertex,
      fragment: compositeFragment,
      uniforms: compositeUniforms,
      depthTest: false,
      depthWrite: false
    })
  });

  let width = 1;
  let height = 1;
  let disposed = false;
  let imageReady = false;
  let visible = true;

  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.decoding = 'async';
  image.onload = () => {
    if (disposed) return;
    imageTexture.image = image;
    compositeUniforms.uTextureSize.value = [
      image.naturalWidth || 1,
      image.naturalHeight || 1
    ];
    imageReady = true;
    mount.dataset.ready = 'true';
  };
  image.onerror = () => {
    mount.dataset.renderer = 'image-fallback';
    canvas.hidden = true;
  };
  image.src = options.src;

  const resize = () => {
    width = Math.max(1, mount.clientWidth);
    height = Math.max(1, mount.clientHeight);
    renderer.setSize(width, height);
    compositeUniforms.uResolution.value = [width, height];

    const qualityScale = QUALITY_SCALE[options.quality] || QUALITY_SCALE.high;
    const fieldWidth = Math.max(2, Math.round(width * qualityScale));
    const fieldHeight = Math.max(2, Math.round(height * qualityScale));
    displacementTarget.setSize(fieldWidth, fieldHeight);
    compositeUniforms.uTexel.value = [1 / fieldWidth, 1 / fieldHeight];
  };

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(mount);
  resize();

  const visibilityObserver = new IntersectionObserver((entries) => {
    visible = entries[0]?.isIntersecting ?? true;
  });
  visibilityObserver.observe(mount);

  const setNewWave = (x, y, power) => {
    const wave = waves[current];
    current = (current + 1) % MAX_WAVES;
    wave.x = x;
    wave.y = y;
    wave.scale = START_SCALE * power;
    wave.target = START_SCALE * Math.max(1, config.spread) * power;
    wave.size = Math.max(1, config.brushSize);
    wave.opacity = 1;
  };

  const localPoint = (clientX, clientY) => {
    const rect = mount.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    if (
      clientX < rect.left ||
      clientX > rect.right ||
      clientY < rect.top ||
      clientY > rect.bottom
    ) return null;
    return [clientX - rect.left, rect.height - (clientY - rect.top)];
  };

  let previousX = 0;
  let previousY = 0;
  const onMove = (event) => {
    if (!config.enabled || reduceMotion || config.trigger === 'click') return;
    const point = localPoint(event.clientX, event.clientY);
    if (!point) return;
    const step = Math.max(1, config.spacing);
    if (
      Math.abs(point[0] - previousX) > step ||
      Math.abs(point[1] - previousY) > step
    ) {
      setNewWave(point[0], point[1], 1);
      previousX = point[0];
      previousY = point[1];
    }
  };

  const onDown = (event) => {
    if (!config.enabled || reduceMotion || config.trigger === 'hover') return;
    const point = localPoint(event.clientX, event.clientY);
    if (!point) return;
    setNewWave(point[0], point[1], Math.max(1, config.clickStrength));
  };

  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerdown', onDown, { passive: true });

  let frame = 0;
  let previousTime = 0;
  const loop = (now) => {
    frame = requestAnimationFrame(loop);
    if (!visible || document.hidden || !imageReady) return;

    const delta = previousTime ? Math.min(0.05, (now - previousTime) / 1000) : 0;
    previousTime = now;
    const growth = reduceMotion ? 0 : 1 - Math.exp(-delta * 1.09);
    const decay = reduceMotion
      ? 1
      : Math.exp((-delta * LIFE_CONSTANT) / Math.max(0.15, config.fade));

    for (let index = 0; index < MAX_WAVES; index += 1) {
      const wave = waves[index];
      if (wave.opacity <= 0) {
        opacities[index] = 0;
        continue;
      }

      wave.opacity *= decay;
      wave.scale += (wave.target - wave.scale) * growth;

      if (wave.opacity < 0.002) {
        wave.opacity = 0;
        opacities[index] = 0;
        continue;
      }

      const half = (wave.scale * wave.size) / 2;
      offsets[index * 2] = (wave.x / width) * 2 - 1;
      offsets[index * 2 + 1] = (wave.y / height) * 2 - 1;
      scales[index * 2] = (half / width) * 2;
      scales[index * 2 + 1] = (half / height) * 2;
      opacities[index] = wave.opacity;
    }

    geometry.attributes.iOffset.needsUpdate = true;
    geometry.attributes.iScale.needsUpdate = true;
    geometry.attributes.iOpacity.needsUpdate = true;

    renderer.render({ scene: waveMesh, target: displacementTarget, clear: true });
    renderer.render({ scene: compositeMesh });
  };
  frame = requestAnimationFrame(loop);
  mount.dataset.renderer = 'react-bits-ripple-distortion';

  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    resizeObserver.disconnect();
    visibilityObserver.disconnect();
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerdown', onDown);
    if (canvas.parentNode === mount) mount.removeChild(canvas);
    const loseContext = gl.getExtension('WEBGL_lose_context');
    if (loseContext) loseContext.loseContext();
  };
}

const mount = document.getElementById('heroRippleDistortion');
const dispose = mountRippleDistortion(mount, {
  src: 'assets/hero-painted-background.jpg',
  brushSize: 130,
  strength: 0.11,
  swirl: 0.65,
  rings: 4,
  spread: 5,
  fade: 3,
  spacing: 15,
  dispersion: 0,
  glint: 0,
  tint: '#ffffff',
  tintAmount: 0.1,
  grayscale: true,
  highlightColor: '#ffffff',
  trigger: 'hover',
  clickStrength: 2,
  quality: 'low',
  enabled: true
});

window.addEventListener('pagehide', dispose, { once: true });
