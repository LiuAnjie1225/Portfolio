import {
  Clock,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderer
} from '../assets/vendor/three.module.min.js';

// Source: https://reactbits.dev/r/FloatingLines-JS-CSS.json
// React Bits FloatingLines, adapted from React to this build-free static site.
const container = document.getElementById('chainFloatingLines');

const options = {
  enabledWaves: ['middle', 'top', 'bottom'],
  lineCount: [10, 15, 20],
  lineDistance: 56.5,
  bendRadius: 8.5,
  bendStrength: -0.5,
  interactive: true,
  parallax: true,
  animationSpeed: 1.7,
  linesGradient: ['#516139', '#b8651b'],
  mouseDamping: 0.05,
  parallaxStrength: 0.2
};

const vertexShader = `
precision highp float;

void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = `
precision highp float;

uniform float iTime;
uniform vec3  iResolution;
uniform float animationSpeed;

uniform bool enableTop;
uniform bool enableMiddle;
uniform bool enableBottom;

uniform int topLineCount;
uniform int middleLineCount;
uniform int bottomLineCount;

uniform float topLineDistance;
uniform float middleLineDistance;
uniform float bottomLineDistance;

uniform vec3 topWavePosition;
uniform vec3 middleWavePosition;
uniform vec3 bottomWavePosition;

uniform vec2 iMouse;
uniform bool interactive;
uniform float bendRadius;
uniform float bendStrength;
uniform float bendInfluence;

uniform bool parallax;
uniform float parallaxStrength;
uniform vec2 parallaxOffset;

uniform vec3 lineGradient[8];
uniform int lineGradientCount;

const vec3 BLACK = vec3(0.0);
const vec3 PINK  = vec3(233.0, 71.0, 245.0) / 255.0;
const vec3 BLUE  = vec3(47.0, 75.0, 162.0) / 255.0;

mat2 rotate(float r) {
  return mat2(cos(r), sin(r), -sin(r), cos(r));
}

vec3 background_color(vec2 uv) {
  vec3 col = vec3(0.0);
  float y = sin(uv.x - 0.2) * 0.3 - 0.1;
  float m = uv.y - y;
  col += mix(BLUE, BLACK, smoothstep(0.0, 1.0, abs(m)));
  col += mix(PINK, BLACK, smoothstep(0.0, 1.0, abs(m - 0.8)));
  return col * 0.5;
}

vec3 getLineColor(float t, vec3 baseColor) {
  if (lineGradientCount <= 0) return baseColor;

  vec3 gradientColor;
  if (lineGradientCount == 1) {
    gradientColor = lineGradient[0];
  } else {
    float clampedT = clamp(t, 0.0, 0.9999);
    float scaled = clampedT * float(lineGradientCount - 1);
    int idx = int(floor(scaled));
    float f = fract(scaled);
    int idx2 = min(idx + 1, lineGradientCount - 1);
    gradientColor = mix(lineGradient[idx], lineGradient[idx2], f);
  }
  return gradientColor * 0.5;
}

float wave(vec2 uv, float offset, vec2 screenUv, vec2 mouseUv, bool shouldBend) {
  float time = iTime * animationSpeed;
  float xMovement = time * 0.1;
  float amp = sin(offset + time * 0.2) * 0.3;
  float y = sin(uv.x + offset + xMovement) * amp;

  if (shouldBend) {
    vec2 d = screenUv - mouseUv;
    float influence = exp(-dot(d, d) * bendRadius);
    y += (mouseUv.y - screenUv.y) * influence * bendStrength * bendInfluence;
  }

  float m = uv.y - y;
  return 0.0175 / max(abs(m) + 0.01, 1e-3);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 baseUv = (2.0 * fragCoord - iResolution.xy) / iResolution.y;
  baseUv.y *= -1.0;
  if (parallax) baseUv += parallaxOffset;

  vec3 col = vec3(0.0);
  vec3 b = lineGradientCount > 0 ? vec3(0.0) : background_color(baseUv);
  vec2 mouseUv = vec2(0.0);

  if (interactive) {
    mouseUv = (2.0 * iMouse - iResolution.xy) / iResolution.y;
    mouseUv.y *= -1.0;
  }

  if (enableBottom) {
    for (int i = 0; i < bottomLineCount; ++i) {
      float fi = float(i);
      float t = fi / max(float(bottomLineCount - 1), 1.0);
      vec2 ruv = baseUv * rotate(bottomWavePosition.z * log(length(baseUv) + 1.0));
      col += getLineColor(t, b) * wave(
        ruv + vec2(bottomLineDistance * fi + bottomWavePosition.x, bottomWavePosition.y),
        1.5 + 0.2 * fi,
        baseUv,
        mouseUv,
        interactive
      ) * 0.2;
    }
  }

  if (enableMiddle) {
    for (int i = 0; i < middleLineCount; ++i) {
      float fi = float(i);
      float t = fi / max(float(middleLineCount - 1), 1.0);
      vec2 ruv = baseUv * rotate(middleWavePosition.z * log(length(baseUv) + 1.0));
      col += getLineColor(t, b) * wave(
        ruv + vec2(middleLineDistance * fi + middleWavePosition.x, middleWavePosition.y),
        2.0 + 0.15 * fi,
        baseUv,
        mouseUv,
        interactive
      );
    }
  }

  if (enableTop) {
    for (int i = 0; i < topLineCount; ++i) {
      float fi = float(i);
      float t = fi / max(float(topLineCount - 1), 1.0);
      vec2 ruv = baseUv * rotate(topWavePosition.z * log(length(baseUv) + 1.0));
      ruv.x *= -1.0;
      col += getLineColor(t, b) * wave(
        ruv + vec2(topLineDistance * fi + topWavePosition.x, topWavePosition.y),
        1.0 + 0.2 * fi,
        baseUv,
        mouseUv,
        interactive
      ) * 0.1;
    }
  }

  float brightness = max(max(col.r, col.g), col.b);
  float alpha = smoothstep(0.035, 0.18, brightness);
  fragColor = vec4(col, alpha);
}

void main() {
  vec4 color = vec4(0.0);
  mainImage(color, gl_FragCoord.xy);
  gl_FragColor = color;
}
`;

const MAX_GRADIENT_STOPS = 8;

function hexToVec3(hex) {
  let value = hex.trim().replace(/^#/, '');
  if (value.length === 3) value = value.split('').map((digit) => digit + digit).join('');
  return new Vector3(
    parseInt(value.slice(0, 2), 16) / 255,
    parseInt(value.slice(2, 4), 16) / 255,
    parseInt(value.slice(4, 6), 16) / 255
  );
}

function getWaveValue(value, wave, fallback) {
  if (typeof value === 'number') return value;
  const index = options.enabledWaves.indexOf(wave);
  return index >= 0 ? value[index] ?? fallback : fallback;
}

function mountFloatingLines(target) {
  if (!target) return () => {};

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  camera.position.z = 1;

  let renderer;
  try {
    renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch (error) {
    target.classList.add('is-webgl-fallback');
    console.warn('FloatingLines WebGL unavailable:', error);
    return () => {};
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth <= 820 ? 1 : 1.5));
  renderer.domElement.setAttribute('aria-hidden', 'true');
  target.appendChild(renderer.domElement);

  const targetMouse = new Vector2(-1000, -1000);
  const currentMouse = new Vector2(-1000, -1000);
  const targetParallax = new Vector2(0, 0);
  const currentParallax = new Vector2(0, 0);
  let targetInfluence = 0;
  let currentInfluence = 0;
  let active = true;
  let visible = false;
  let frameId = 0;

  const count = (wave) => options.enabledWaves.includes(wave) ? getWaveValue(options.lineCount, wave, 6) : 0;
  const distance = (wave) => options.enabledWaves.includes(wave)
    ? getWaveValue(options.lineDistance, wave, 0.1) * 0.01
    : 0.01;

  const uniforms = {
    iTime: { value: 0 },
    iResolution: { value: new Vector3(1, 1, 1) },
    animationSpeed: { value: options.animationSpeed },
    enableTop: { value: options.enabledWaves.includes('top') },
    enableMiddle: { value: options.enabledWaves.includes('middle') },
    enableBottom: { value: options.enabledWaves.includes('bottom') },
    topLineCount: { value: count('top') },
    middleLineCount: { value: count('middle') },
    bottomLineCount: { value: count('bottom') },
    topLineDistance: { value: distance('top') },
    middleLineDistance: { value: distance('middle') },
    bottomLineDistance: { value: distance('bottom') },
    topWavePosition: { value: new Vector3(10, 0.5, -0.4) },
    middleWavePosition: { value: new Vector3(5, 0, 0.2) },
    bottomWavePosition: { value: new Vector3(2, -0.7, -1) },
    iMouse: { value: new Vector2(-1000, -1000) },
    interactive: { value: options.interactive && !reducedMotion.matches },
    bendRadius: { value: options.bendRadius },
    bendStrength: { value: options.bendStrength },
    bendInfluence: { value: 0 },
    parallax: { value: options.parallax && !reducedMotion.matches },
    parallaxStrength: { value: options.parallaxStrength },
    parallaxOffset: { value: new Vector2(0, 0) },
    lineGradient: { value: Array.from({ length: MAX_GRADIENT_STOPS }, () => new Vector3(1, 1, 1)) },
    lineGradientCount: { value: 0 }
  };

  const stops = options.linesGradient.slice(0, MAX_GRADIENT_STOPS);
  uniforms.lineGradientCount.value = stops.length;
  stops.forEach((hex, index) => uniforms.lineGradient.value[index].copy(hexToVec3(hex)));

  const material = new ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false
  });
  const geometry = new PlaneGeometry(2, 2);
  const mesh = new Mesh(geometry, material);
  scene.add(mesh);
  const clock = new Clock();

  const resize = () => {
    const width = Math.max(1, target.clientWidth);
    const height = Math.max(1, target.clientHeight);
    renderer.setSize(width, height, false);
    uniforms.iResolution.value.set(renderer.domElement.width, renderer.domElement.height, 1);
  };

  const handlePointerMove = (event) => {
    if (!uniforms.interactive.value) return;
    const rect = renderer.domElement.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const dpr = renderer.getPixelRatio();
    targetMouse.set(x * dpr, (rect.height - y) * dpr);
    targetInfluence = 1;
    targetParallax.set(
      ((x - rect.width / 2) / rect.width) * options.parallaxStrength,
      (-(y - rect.height / 2) / rect.height) * options.parallaxStrength
    );
  };

  const handlePointerLeave = () => {
    targetInfluence = 0;
    targetParallax.set(0, 0);
  };

  const render = () => {
    if (!active || !visible) return;
    if (!reducedMotion.matches) uniforms.iTime.value = clock.getElapsedTime();
    currentMouse.lerp(targetMouse, options.mouseDamping);
    uniforms.iMouse.value.copy(currentMouse);
    currentInfluence += (targetInfluence - currentInfluence) * options.mouseDamping;
    uniforms.bendInfluence.value = currentInfluence;
    currentParallax.lerp(targetParallax, options.mouseDamping);
    uniforms.parallaxOffset.value.copy(currentParallax);
    renderer.render(scene, camera);
    if (!reducedMotion.matches) frameId = requestAnimationFrame(render);
  };

  const setVisible = (nextVisible) => {
    if (visible === nextVisible) return;
    visible = nextVisible;
    if (visible) {
      clock.start();
      cancelAnimationFrame(frameId);
      render();
    } else {
      cancelAnimationFrame(frameId);
    }
  };

  const resizeObserver = new ResizeObserver(resize);
  const visibilityObserver = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
    rootMargin: '20% 0px'
  });

  resizeObserver.observe(target);
  visibilityObserver.observe(target);
  renderer.domElement.addEventListener('pointermove', handlePointerMove, { passive: true });
  renderer.domElement.addEventListener('pointerleave', handlePointerLeave, { passive: true });
  resize();
  renderer.render(scene, camera);

  const destroy = () => {
    active = false;
    cancelAnimationFrame(frameId);
    resizeObserver.disconnect();
    visibilityObserver.disconnect();
    renderer.domElement.removeEventListener('pointermove', handlePointerMove);
    renderer.domElement.removeEventListener('pointerleave', handlePointerLeave);
    geometry.dispose();
    material.dispose();
    renderer.dispose();
  };

  window.addEventListener('pagehide', destroy, { once: true });
  return destroy;
}

mountFloatingLines(container);
