import * as THREE from '../assets/vendor/three.module.min.js';

// React Bits LightPillar adapted to the portfolio's build-free static runtime.

const container = document.getElementById('aboutLightPillar');

const options = {
  topColor: '#ffffff',
  bottomColor: '#5c5c5c',
  intensity: 1.12,
  rotationSpeed: 0.7,
  glowAmount: 0.0075,
  pillarWidth: 3,
  pillarHeight: 0.4,
  noiseIntensity: 0.5,
  pillarRotation: 30,
  interactive: false,
  mixBlendMode: 'normal',
  quality: 'medium'
};

function mountLightPillar(target, config) {
  if (!target) return () => {};

  const supportCanvas = document.createElement('canvas');
  const gl = supportCanvas.getContext('webgl') || supportCanvas.getContext('experimental-webgl');
  if (!gl) {
    target.classList.add('is-webgl-fallback');
    return () => {};
  }

  const isMobile = window.innerWidth <= 820 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const isLowEndDevice = isMobile || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
  let effectiveQuality = config.quality;
  if (isLowEndDevice && effectiveQuality === 'high') effectiveQuality = 'medium';
  if (isMobile && effectiveQuality !== 'low') effectiveQuality = 'low';

  const qualitySettings = {
    low: { iterations: 24, waveIterations: 1, pixelRatio: 0.5, precision: 'mediump', stepMultiplier: 1.5 },
    medium: { iterations: 40, waveIterations: 2, pixelRatio: 0.65, precision: 'mediump', stepMultiplier: 1.2 },
    high: {
      iterations: 80,
      waveIterations: 4,
      pixelRatio: Math.min(window.devicePixelRatio, 2),
      precision: 'highp',
      stepMultiplier: 1
    }
  };
  const settings = qualitySettings[effectiveQuality] || qualitySettings.medium;

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  let renderer;

  try {
    renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: true,
      powerPreference: effectiveQuality === 'high' ? 'high-performance' : 'low-power',
      precision: settings.precision,
      stencil: false,
      depth: false
    });
  } catch (error) {
    target.classList.add('is-webgl-fallback');
    return () => {};
  }

  const initialWidth = Math.max(1, target.clientWidth);
  const initialHeight = Math.max(1, target.clientHeight);
  renderer.setSize(initialWidth, initialHeight);
  renderer.setPixelRatio(settings.pixelRatio);
  renderer.domElement.className = 'light-pillar-canvas';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  target.style.mixBlendMode = config.mixBlendMode;
  target.appendChild(renderer.domElement);

  const parseColor = hex => {
    const color = new THREE.Color(hex);
    return new THREE.Vector3(color.r, color.g, color.b);
  };

  const vertexShader = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position, 1.0);
    }
  `;

  const fragmentShader = `
    precision ${settings.precision} float;

    uniform float uTime;
    uniform vec2 uResolution;
    uniform vec2 uMouse;
    uniform vec3 uTopColor;
    uniform vec3 uBottomColor;
    uniform float uIntensity;
    uniform bool uInteractive;
    uniform float uGlowAmount;
    uniform float uPillarWidth;
    uniform float uPillarHeight;
    uniform float uNoiseIntensity;
    uniform float uRotCos;
    uniform float uRotSin;
    uniform float uPillarRotCos;
    uniform float uPillarRotSin;
    uniform float uWaveSin;
    uniform float uWaveCos;
    varying vec2 vUv;

    const float STEP_MULT = ${settings.stepMultiplier.toFixed(1)};
    const int MAX_ITER = ${settings.iterations};
    const int WAVE_ITER = ${settings.waveIterations};

    void main() {
      vec2 uv = (vUv * 2.0 - 1.0) * vec2(uResolution.x / uResolution.y, 1.0);
      uv = vec2(uPillarRotCos * uv.x - uPillarRotSin * uv.y, uPillarRotSin * uv.x + uPillarRotCos * uv.y);

      vec3 ro = vec3(0.0, 0.0, -10.0);
      vec3 rd = normalize(vec3(uv, 1.0));

      float rotC = uRotCos;
      float rotS = uRotSin;
      if(uInteractive && (uMouse.x != 0.0 || uMouse.y != 0.0)) {
        float a = uMouse.x * 6.283185;
        rotC = cos(a);
        rotS = sin(a);
      }

      vec3 col = vec3(0.0);
      float t = 0.1;

      for(int i = 0; i < MAX_ITER; i++) {
        vec3 p = ro + rd * t;
        p.xz = vec2(rotC * p.x - rotS * p.z, rotS * p.x + rotC * p.z);

        vec3 q = p;
        q.y = p.y * uPillarHeight + uTime;

        float freq = 1.0;
        float amp = 1.0;
        for(int j = 0; j < WAVE_ITER; j++) {
          q.xz = vec2(uWaveCos * q.x - uWaveSin * q.z, uWaveSin * q.x + uWaveCos * q.z);
          q += cos(q.zxy * freq - uTime * float(j) * 2.0) * amp;
          freq *= 2.0;
          amp *= 0.5;
        }

        float d = length(cos(q.xz)) - 0.2;
        float bound = length(p.xz) - uPillarWidth;
        float k = 4.0;
        float h = max(k - abs(d - bound), 0.0);
        d = max(d, bound) + h * h * 0.0625 / k;
        d = abs(d) * 0.15 + 0.01;

        float grad = clamp((15.0 - p.y) / 30.0, 0.0, 1.0);
        col += mix(uBottomColor, uTopColor, grad) / d;

        t += d * STEP_MULT;
        if(t > 50.0) break;
      }

      float widthNorm = uPillarWidth / 3.0;
      col = tanh(col * uGlowAmount / widthNorm);
      col -= fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) / 15.0 * uNoiseIntensity;
      gl_FragColor = vec4(col * uIntensity, 1.0);
    }
  `;

  const pillarRotRad = (config.pillarRotation * Math.PI) / 180;
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(initialWidth, initialHeight) },
      uMouse: { value: new THREE.Vector2(0, 0) },
      uTopColor: { value: parseColor(config.topColor) },
      uBottomColor: { value: parseColor(config.bottomColor) },
      uIntensity: { value: config.intensity },
      uInteractive: { value: config.interactive },
      uGlowAmount: { value: config.glowAmount },
      uPillarWidth: { value: config.pillarWidth },
      uPillarHeight: { value: config.pillarHeight },
      uNoiseIntensity: { value: config.noiseIntensity },
      uRotCos: { value: 1 },
      uRotSin: { value: 0 },
      uPillarRotCos: { value: Math.cos(pillarRotRad) },
      uPillarRotSin: { value: Math.sin(pillarRotRad) },
      uWaveSin: { value: Math.sin(0.4) },
      uWaveCos: { value: Math.cos(0.4) }
    },
    transparent: true,
    depthWrite: false,
    depthTest: false
  });

  const geometry = new THREE.PlaneGeometry(2, 2);
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const targetFPS = effectiveQuality === 'high' ? 60 : 30;
  const frameTime = 1000 / targetFPS;
  let raf = null;
  const targetRect = target.getBoundingClientRect();
  let visible = targetRect.bottom > -120 && targetRect.top < window.innerHeight + 120;
  let lastTime = performance.now();
  let elapsed = 0;

  const render = currentTime => {
    const deltaTime = currentTime - lastTime;
    if (deltaTime >= frameTime) {
      elapsed += 0.016 * config.rotationSpeed;
      material.uniforms.uTime.value = elapsed;
      material.uniforms.uRotCos.value = Math.cos(elapsed * 0.3);
      material.uniforms.uRotSin.value = Math.sin(elapsed * 0.3);
      renderer.render(scene, camera);
      lastTime = currentTime - (deltaTime % frameTime);
    }
    if (visible && !reduceMotion) raf = requestAnimationFrame(render);
  };

  renderer.render(scene, camera);
  if (visible && !reduceMotion) raf = requestAnimationFrame(render);

  const resizeObserver = new ResizeObserver(entries => {
    const entry = entries[0];
    if (!entry) return;
    const width = Math.max(1, Math.round(entry.contentRect.width));
    const height = Math.max(1, Math.round(entry.contentRect.height));
    renderer.setSize(width, height);
    material.uniforms.uResolution.value.set(width, height);
    renderer.render(scene, camera);
  });
  resizeObserver.observe(target);

  const intersectionObserver = new IntersectionObserver(entries => {
    const nextVisible = entries.some(entry => entry.isIntersecting);
    if (nextVisible === visible || reduceMotion) return;
    visible = nextVisible;
    if (visible) {
      lastTime = performance.now();
      raf = requestAnimationFrame(render);
    } else if (raf) {
      cancelAnimationFrame(raf);
      raf = null;
    }
  }, { rootMargin: '120px' });
  intersectionObserver.observe(target);

  return () => {
    if (raf) cancelAnimationFrame(raf);
    resizeObserver.disconnect();
    intersectionObserver.disconnect();
    geometry.dispose();
    material.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  };
}

const destroyLightPillar = mountLightPillar(container, options);
window.addEventListener('pagehide', destroyLightPillar, { once: true });
