import * as THREE from '../assets/vendor/three.module.min.js';

// React Bits Silk adapted from the JS-CSS registry to the build-free static runtime.

const container = document.getElementById('aboutSilk');

const options = {
  speed: 5,
  scale: 1,
  color: '#3d3b23',
  noiseIntensity: 1.5,
  rotation: 0
};

const hexToNormalizedRGB = hex => {
  hex = hex.replace('#', '');
  return [
    parseInt(hex.slice(0, 2), 16) / 255,
    parseInt(hex.slice(2, 4), 16) / 255,
    parseInt(hex.slice(4, 6), 16) / 255
  ];
};

const vertexShader = `
varying vec2 vUv;
varying vec3 vPosition;

void main() {
  vPosition = position;
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = `
varying vec2 vUv;
varying vec3 vPosition;

uniform float uTime;
uniform vec3  uColor;
uniform float uSpeed;
uniform float uScale;
uniform float uRotation;
uniform float uNoiseIntensity;

const float e = 2.71828182845904523536;

float noise(vec2 texCoord) {
  float G = e;
  vec2  r = (G * sin(G * texCoord));
  return fract(r.x * r.y * (1.0 + texCoord.x));
}

vec2 rotateUvs(vec2 uv, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  mat2  rot = mat2(c, -s, s, c);
  return rot * uv;
}

void main() {
  float rnd        = noise(gl_FragCoord.xy);
  vec2  uv         = rotateUvs(vUv * uScale, uRotation);
  vec2  tex        = uv * uScale;
  float tOffset    = uSpeed * uTime;

  tex.y += 0.03 * sin(8.0 * tex.x - tOffset);

  float pattern = 0.6 +
                  0.4 * sin(5.0 * (tex.x + tex.y +
                                   cos(3.0 * tex.x + 5.0 * tex.y) +
                                   0.02 * tOffset) +
                           sin(20.0 * (tex.x + tex.y - 0.1 * tOffset)));

  vec4 col = vec4(uColor, 1.0) * vec4(pattern) - rnd / 15.0 * uNoiseIntensity;
  col.a = 1.0;
  gl_FragColor = col;
}
`;

function mountSilk(target, config) {
  if (!target) return () => {};

  const supportCanvas = document.createElement('canvas');
  const supportContext = supportCanvas.getContext('webgl') || supportCanvas.getContext('experimental-webgl');
  if (!supportContext) {
    target.classList.add('is-webgl-fallback');
    return () => {};
  }

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.1, 10);
  camera.position.z = 1;

  const renderer = new THREE.WebGLRenderer({
    alpha: false,
    antialias: false,
    powerPreference: 'low-power'
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth <= 820 ? 1 : 1.5));
  renderer.setClearColor(config.color, 1);
  target.appendChild(renderer.domElement);

  const uniforms = {
    uSpeed: { value: config.speed },
    uScale: { value: config.scale },
    uNoiseIntensity: { value: config.noiseIntensity },
    uColor: { value: new THREE.Color(...hexToNormalizedRGB(config.color)) },
    uRotation: { value: config.rotation },
    uTime: { value: 0 }
  };

  const geometry = new THREE.PlaneGeometry(1, 1, 1, 1);
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader
  });
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  const clock = new THREE.Clock();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let frameId = 0;
  let active = true;

  const resize = () => {
    const width = Math.max(1, target.clientWidth || window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, width <= 820 ? 1 : 1.5));
    renderer.setSize(width, height, false);
    renderer.render(scene, camera);
  };

  const render = () => {
    if (!active || document.hidden) {
      frameId = requestAnimationFrame(render);
      return;
    }
    if (!reducedMotion.matches) uniforms.uTime.value += 0.1 * clock.getDelta();
    renderer.render(scene, camera);
    frameId = requestAnimationFrame(render);
  };

  const intersectionObserver = new IntersectionObserver(([entry]) => {
    active = entry.isIntersecting;
    if (active) clock.getDelta();
  }, { rootMargin: '25% 0px' });
  intersectionObserver.observe(target);

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(target);
  window.addEventListener('resize', resize, { passive: true });
  resize();
  render();

  target.dataset.renderer = 'react-bits-silk';

  return () => {
    cancelAnimationFrame(frameId);
    intersectionObserver.disconnect();
    resizeObserver.disconnect();
    window.removeEventListener('resize', resize);
    geometry.dispose();
    material.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };
}

mountSilk(container, options);
