import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { globalCursor } from '../../lib/cursor';

// ─── Vertex shader ────────────────────────────────────────────────────────────
// Full-screen quad trick: write directly to clip-space, bypassing MVP entirely.
const VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// ─── Fragment shader ──────────────────────────────────────────────────────────
// 5 Gaussian orbs across 3 depth layers — cream base, warm-neutral shadows only.
// No vivid hues: the orbs read as barely-perceptible density shifts on the paper.
const FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;

uniform float uTime;
uniform vec2  uMouse;
uniform float uAspect;

// Gaussian — exp(-d²/r²)
float G(vec2 p, vec2 c, float r) {
  vec2 d = p - c;
  return exp(-dot(d, d) / (r * r));
}

// Film grain — animated hash
float grain(vec2 uv, float seed) {
  return fract(sin(dot(uv * 640.0 + seed, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 uv = (vUv - 0.5) * vec2(uAspect, 1.0);

  // Base in linear space: sRGB #f2ebe0 → linear ≈ (0.893, 0.843, 0.790)
  vec3 col = vec3(0.893, 0.843, 0.790);

  float t = uTime * 0.055; // slow drift

  // Shared shadow tone — very slightly warm (fractionally less blue subtracted)
  vec3 shadow = vec3(0.058, 0.056, 0.048);

  // ── FAR layer ──
  vec2 pF = uMouse * 0.025;
  col -= G(uv, vec2(sin(t * 0.44) * 0.55, cos(t * 0.32) * 0.34) + pF, 0.60) * shadow * 1.00;
  col -= G(uv, vec2(cos(t * 0.37 + 1.9) * 0.50, sin(t * 0.51 + 0.7) * 0.38) + pF, 0.52) * shadow * 0.72;

  // ── MID layer ──
  vec2 pM = uMouse * 0.05;
  col -= G(uv, vec2(sin(t * 0.62 + 2.5) * 0.40, cos(t * 0.45 + 1.1) * 0.28) + pM, 0.40) * shadow * 0.52;
  col -= G(uv, vec2(cos(t * 0.55 + 3.8) * 0.36, sin(t * 0.70 + 2.9) * 0.44) + pM, 0.32) * shadow * 0.38;

  // ── NEAR layer ──
  vec2 pN = uMouse * 0.08;
  col -= G(uv, vec2(sin(t * 0.80 + 5.2) * 0.26, cos(t * 0.63 + 3.5) * 0.33) + pN, 0.26) * shadow * 0.26;

  // Soft edge vignette
  float v = smoothstep(0.60, 1.35, length(uv / vec2(uAspect * 0.5, 0.5)));
  col -= v * 0.022;

  // Film grain — very light on a pale surface
  float gSeed = floor(uTime * 24.0) * 0.1372;
  col += (grain(vUv, gSeed) - 0.5) * 0.010;

  col = clamp(col, 0.0, 1.0);

  // Gamma encode (sRGB)
  col = pow(col, vec3(1.0 / 2.2));

  gl_FragColor = vec4(col, 1.0);
}
`;

// ─── Inner R3F scene ──────────────────────────────────────────────────────────

function OrbScene() {
  const matRef  = useRef<THREE.ShaderMaterial>(null!);
  const target  = useRef(new THREE.Vector2());
  const smooth  = useRef(new THREE.Vector2());

  const uniforms = useMemo(() => ({
    uTime:   { value: 0 },
    uMouse:  { value: new THREE.Vector2() },
    uAspect: { value: typeof window !== 'undefined' ? window.innerWidth / window.innerHeight : 1.778 },
  }), []);

  useFrame(({ clock, size }) => {
    // Use global cursor (canvas has pointerEvents:none, so R3F pointer won't fire)
    const cx = globalCursor.x;
    const cy = globalCursor.y;
    const w  = size.width || window.innerWidth;
    const h  = size.height || window.innerHeight;

    const mx = cx < -100 ? 0 : cx / w - 0.5;
    const my = cy < -100 ? 0 : -(cy / h - 0.5);   // flip Y

    target.current.set(mx, my);
    smooth.current.lerp(target.current, 0.022);     // slow, dreamy lag

    const mat = matRef.current;
    if (!mat) return;
    mat.uniforms.uTime.value   = clock.elapsedTime;
    mat.uniforms.uMouse.value.copy(smooth.current);
    mat.uniforms.uAspect.value = w / h;
  });

  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={VERT}
        fragmentShader={FRAG}
        uniforms={uniforms}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
}

// ─── Exported component ───────────────────────────────────────────────────────

export function AnimatedBackground() {
  return (
    <Canvas
      dpr={[0.75, 1.5]}
      gl={{
        alpha: false,
        antialias: false,
        powerPreference: 'high-performance',
      }}
      camera={{ position: [0, 0, 1], fov: 75 }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: -1,
        pointerEvents: 'none',
      }}
    >
      <OrbScene />
    </Canvas>
  );
}
