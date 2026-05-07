import { useMemo, useRef, useEffect, type ReactElement } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';

// Module-level mouse influence state — shared across all HologramScene instances.
// Raw values are smoothed once per frame by MouseInfluenceTracker.
const _rawMouse  = { x: 0, y: 0 };
const _smoothMouse = { x: 0, y: 0 };

if (typeof window !== 'undefined') {
  window.addEventListener('mousemove', (e) => {
    _rawMouse.x =  e.clientX / window.innerWidth  - 0.5;
    _rawMouse.y =  e.clientY / window.innerHeight - 0.5;
  }, { passive: true });
}

/** Mount once inside the main 3D Canvas to keep mouse smoothing on the RAF loop. */
export function MouseInfluenceTracker() {
  useFrame((_, delta) => {
    // Frame-rate-independent lerp: decay constant 0.06 → settles in ~0.25 s
    const ease = 1 - Math.pow(0.06, delta);
    _smoothMouse.x += (_rawMouse.x - _smoothMouse.x) * ease;
    _smoothMouse.y += (_rawMouse.y - _smoothMouse.y) * ease;
  });
  return null;
}

const VERTEX_SHADER = `
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec2 vUv;
  varying float vLocalY;

  void main() {
    vUv = uv;
    vec3 pos = position;
    vLocalY = position.y;

    float wave = sin(position.y * 5.0 - uTime * 1.6) * 0.012;
    wave += sin(position.x * 3.0 + uTime * 0.9) * 0.006;
    pos += normal * wave;

    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPos;

    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(-mvPos.xyz);
  }
`;

const FRAGMENT_SHADER = `
  uniform float uTime;
  uniform vec3  uColor;
  uniform vec3  uAccent;

  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec2 vUv;
  varying float vLocalY;

  void main() {
    float fres = pow(1.0 - clamp(dot(vViewDir, vNormal), 0.0, 1.0), 2.4);

    // Bright travelling band that sweeps up the model every few seconds.
    float bandPos = mod(uTime * 0.45, 2.0) - 0.4;
    float band = 1.0 - smoothstep(0.0, 0.18, abs(vUv.y - bandPos));
    band *= 0.85;

    // Fine horizontal scanlines.
    float scanlines = sin(vUv.y * 110.0) * 0.5 + 0.5;
    scanlines = mix(0.78, 1.05, scanlines);

    // Occasional glitch streaks.
    float glitch = step(0.985, sin(vLocalY * 38.0 + uTime * 5.5));

    vec3 col = uColor * (0.42 + fres * 1.45) + uAccent * (band + glitch * 0.7);
    col *= scanlines;

    float alpha = (fres * 0.78 + 0.22) * 0.85 + band * 0.18 + glitch * 0.28;
    alpha = clamp(alpha, 0.0, 1.0);

    gl_FragColor = vec4(col, alpha);
  }
`;

/* Shared materials — one ShaderMaterial per (color, accent) variant, reused across
 * every mesh in every section. Keeps GPU state changes and per-frame React work flat
 * regardless of how many meshes are on screen. The shader program is identical for
 * every variant, so three.js compiles the GLSL exactly once. */
const HOLOGRAM_MATERIALS = new Map<string, THREE.ShaderMaterial>();

function getHologramMaterial(color: string, accent: string): THREE.ShaderMaterial {
  const key = `${color}|${accent}`;
  let mat = HOLOGRAM_MATERIALS.get(key);
  if (!mat) {
    mat = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: {
        uTime:   { value: 0 },
        uColor:  { value: new THREE.Color(color) },
        uAccent: { value: new THREE.Color(accent) },
      },
    });
    HOLOGRAM_MATERIALS.set(key, mat);
  }
  return mat;
}

/* Single per-frame uTime advance for every shared hologram material.
 * Mount once inside the main Canvas. */
export function HologramTimeAnimator() {
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    HOLOGRAM_MATERIALS.forEach((m) => {
      m.uniforms.uTime.value = t;
    });
  });
  return null;
}

function HologramMaterial({
  color = '#3d8a5a',
  accent = '#9be3b9',
}: { color?: string; accent?: string }) {
  const material = useMemo(() => getHologramMaterial(color, accent), [color, accent]);
  return <primitive object={material} attach="material" />;
}

/* ── Procedural shapes ─────────────────────────────── */

function CoinShape() {
  return (
    <group>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[1.05, 1.05, 0.16, 48]} />
        <HologramMaterial />
      </mesh>
      <mesh position={[0, 0, 0.085]}>
        <torusGeometry args={[0.55, 0.06, 16, 48]} />
        <HologramMaterial />
      </mesh>
      <mesh position={[0, 0.05, 0.09]}>
        <boxGeometry args={[0.12, 0.7, 0.04]} />
        <HologramMaterial />
      </mesh>
    </group>
  );
}

function HouseShape() {
  return (
    <group position={[0, -0.9125, 0]}>
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[1.7, 1.0, 1.5]} />
        <HologramMaterial />
      </mesh>
      <mesh position={[0, 1.4, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[1.32, 0.85, 4]} />
        <HologramMaterial />
      </mesh>
      <mesh position={[0, 0.3, 0.76]}>
        <boxGeometry args={[0.36, 0.65, 0.05]} />
        <HologramMaterial />
      </mesh>
      <mesh position={[-0.55, 0.7, 0.76]}>
        <boxGeometry args={[0.32, 0.32, 0.05]} />
        <HologramMaterial />
      </mesh>
      <mesh position={[0.55, 0.7, 0.76]}>
        <boxGeometry args={[0.32, 0.32, 0.05]} />
        <HologramMaterial />
      </mesh>
    </group>
  );
}

function SpannerShape() {
  return (
    <group position={[0, -0.125, 0]} rotation={[0, 0, Math.PI / 5]}>
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[0.16, 0.16, 1.7, 24]} />
        <HologramMaterial />
      </mesh>
      <mesh position={[0, 0.95, 0]}>
        <torusGeometry args={[0.42, 0.14, 16, 32]} />
        <HologramMaterial />
      </mesh>
      <mesh position={[0, -0.95, 0]} rotation={[0, 0, Math.PI / 2]}>
        <boxGeometry args={[0.5, 0.4, 0.4]} />
        <HologramMaterial />
      </mesh>
    </group>
  );
}

function GrocerySackShape() {
  return (
    <group position={[0, -0.225, 0]}>
      <mesh position={[0, -0.1, 0]}>
        <boxGeometry args={[1.4, 1.4, 1.0]} />
        <HologramMaterial />
      </mesh>
      <mesh position={[-0.5, 0.45, 0.0]}>
        <torusGeometry args={[0.28, 0.06, 12, 32, Math.PI]} />
        <HologramMaterial />
      </mesh>
      <mesh position={[0.5, 0.45, 0.0]}>
        <torusGeometry args={[0.28, 0.06, 12, 32, Math.PI]} />
        <HologramMaterial />
      </mesh>
      <mesh position={[-0.35, 0.85, 0.25]}>
        <sphereGeometry args={[0.32, 18, 18]} />
        <HologramMaterial />
      </mesh>
      <mesh position={[0.35, 0.95, -0.05]}>
        <sphereGeometry args={[0.3, 18, 18]} />
        <HologramMaterial />
      </mesh>
      <mesh position={[0.0, 0.9, 0.35]} rotation={[0, 0, Math.PI / 5]}>
        <capsuleGeometry args={[0.13, 0.55, 6, 16]} />
        <HologramMaterial />
      </mesh>
    </group>
  );
}

function CarShape() {
  const wheelRadius = 0.32;
  return (
    <group position={[0, -0.3775, 0]}>
      <mesh position={[0, 0.32, 0]}>
        <boxGeometry args={[2.2, 0.55, 1.0]} />
        <HologramMaterial />
      </mesh>
      <mesh position={[-0.15, 0.85, 0]}>
        <boxGeometry args={[1.2, 0.55, 0.9]} />
        <HologramMaterial />
      </mesh>
      <mesh position={[-0.7, -0.05, 0.55]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[wheelRadius, wheelRadius, 0.18, 20]} />
        <HologramMaterial />
      </mesh>
      <mesh position={[0.7, -0.05, 0.55]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[wheelRadius, wheelRadius, 0.18, 20]} />
        <HologramMaterial />
      </mesh>
      <mesh position={[-0.7, -0.05, -0.55]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[wheelRadius, wheelRadius, 0.18, 20]} />
        <HologramMaterial />
      </mesh>
      <mesh position={[0.7, -0.05, -0.55]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[wheelRadius, wheelRadius, 0.18, 20]} />
        <HologramMaterial />
      </mesh>
    </group>
  );
}

function DocumentShape() {
  return (
    <group rotation={[0, 0, 0.05]}>
      <mesh>
        <boxGeometry args={[1.2, 1.55, 0.04]} />
        <HologramMaterial />
      </mesh>
      {[0.45, 0.2, -0.05, -0.3].map((y, i) => (
        <mesh key={i} position={[0, y, 0.025]}>
          <boxGeometry args={[0.85, 0.05, 0.01]} />
          <HologramMaterial accent="#bff5d4" />
        </mesh>
      ))}
      <mesh position={[0.32, 0.62, 0.025]}>
        <torusGeometry args={[0.08, 0.025, 12, 24]} />
        <HologramMaterial accent="#bff5d4" />
      </mesh>
      <mesh position={[0.16, 0.62, 0.025]}>
        <torusGeometry args={[0.08, 0.025, 12, 24]} />
        <HologramMaterial accent="#bff5d4" />
      </mesh>
      <mesh position={[0.24, 0.62, 0.025]} rotation={[0, 0, -Math.PI / 4]}>
        <boxGeometry args={[0.3, 0.04, 0.01]} />
        <HologramMaterial accent="#bff5d4" />
      </mesh>
    </group>
  );
}

function CoinStackShape() {
  return (
    <group>
      {[-0.45, -0.15, 0.15, 0.45].map((y, i) => (
        <mesh key={i} position={[0, y, 0]} rotation={[0, 0, 0]}>
          <cylinderGeometry args={[0.7, 0.7, 0.18, 32]} />
          <HologramMaterial />
        </mesh>
      ))}
    </group>
  );
}

function GraduationCapShape() {
  return (
    <group position={[0, 0, 0]}>
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[0.4, 0.55, 0.55, 24]} />
        <HologramMaterial />
      </mesh>
      <mesh position={[0, 0.32, 0]} rotation={[0, Math.PI / 4, 0]}>
        <boxGeometry args={[1.55, 0.08, 1.55]} />
        <HologramMaterial />
      </mesh>
      <mesh position={[0.55, 0.36, 0]}>
        <sphereGeometry args={[0.07, 12, 12]} />
        <HologramMaterial accent="#bff5d4" />
      </mesh>
      <mesh position={[0.55, -0.05, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.8, 8]} />
        <HologramMaterial accent="#bff5d4" />
      </mesh>
    </group>
  );
}

/* HUD constants and color palette retained for the constellation HUD —
 * referenced indirectly through the HUD_COLOR constant below. */

const HUD_COLOR = '#ffffff';

/* ── Upward-scrolling constellation ─────────────────────────────────────── */

const STAR_COUNT = 8;
const Y_SPAN     = 4.2;
const CONN_IDX: [number, number][] = [
  [0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,0],[0,4],[2,6],
];

function StarMark({ size = 0.058 }: { size?: number }) {
  const d = size * 0.72;
  return (
    <group>
      <Line points={[[-d,-d,0],[d,d,0]]} color={HUD_COLOR} lineWidth={5.0} transparent opacity={0.55} />
      <Line points={[[-d,-d,0],[d,d,0]]} color={HUD_COLOR} lineWidth={1.5} transparent opacity={1.0} />
      <Line points={[[-d,d,0],[d,-d,0]]} color={HUD_COLOR} lineWidth={5.0} transparent opacity={0.55} />
      <Line points={[[-d,d,0],[d,-d,0]]} color={HUD_COLOR} lineWidth={1.5} transparent opacity={1.0} />
      <mesh>
        <sphereGeometry args={[0.038, 8, 8]} />
        <meshBasicMaterial color={HUD_COLOR} transparent opacity={1.0} />
      </mesh>
    </group>
  );
}

function Constellation({ seed = 0 }: { seed?: number }) {
  const layout = useMemo(() => {
    const j = (k: number) => ((Math.sin((seed + 1) * 17.3 + k * 4.7) + 1) * 0.5 - 0.5) * 0.3;
    return [
      { x: -1.40 + j(1),  z:  0.55 + j(3),  speed: 0.28 },
      { x: -0.20 + j(4),  z: -0.55 + j(6),  speed: 0.32 },
      { x:  1.30 + j(7),  z:  0.50 + j(9),  speed: 0.26 },
      { x:  1.90 + j(10), z: -0.65 + j(12), speed: 0.30 },
      { x:  1.55 + j(13), z:  0.65 + j(15), speed: 0.29 },
      { x:  0.20 + j(16), z: -0.60 + j(18), speed: 0.33 },
      { x: -1.25 + j(19), z:  0.60 + j(21), speed: 0.27 },
      { x: -1.90 + j(22), z: -0.65 + j(24), speed: 0.31 },
    ];
  }, [seed]);

  const starRefs = useRef<(THREE.Group | null)[]>(Array(STAR_COUNT).fill(null));

  // One BufferGeometry per connection — shared by halo + core line
  const lineGeos = useMemo(() =>
    CONN_IDX.map(() => {
      const geo  = new THREE.BufferGeometry();
      const attr = new THREE.BufferAttribute(new Float32Array(6), 3);
      attr.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('position', attr);
      return geo;
    }), []
  );

  const lineMeshes = useMemo(() =>
    CONN_IDX.map((_, ci) => ({
      glow: new THREE.Line(lineGeos[ci], new THREE.LineBasicMaterial({ color: HUD_COLOR, transparent: true, opacity: 0.85, depthWrite: false })),
      halo: new THREE.Line(lineGeos[ci], new THREE.LineBasicMaterial({ color: HUD_COLOR, transparent: true, opacity: 0.55, depthWrite: false })),
      core: new THREE.Line(lineGeos[ci], new THREE.LineBasicMaterial({ color: HUD_COLOR, transparent: true, opacity: 1.0,  depthWrite: false })),
    })), [lineGeos]
  );

  useEffect(() => () => {
    lineGeos.forEach(g => g.dispose());
    lineMeshes.forEach(({ glow, halo, core }) => {
      (glow.material as THREE.Material).dispose();
      (halo.material as THREE.Material).dispose();
      (core.material as THREE.Material).dispose();
    });
  }, [lineGeos, lineMeshes]);

  // Y positions staggered so stars are evenly spread at init
  const yOffsets = useRef(
    layout.map((_, i) => -Y_SPAN / 2 + (i / STAR_COUNT) * Y_SPAN)
  );

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;

    // Advance + wrap
    for (let i = 0; i < STAR_COUNT; i++) {
      yOffsets.current[i] += layout[i].speed * delta;
      if (yOffsets.current[i] > Y_SPAN / 2) yOffsets.current[i] -= Y_SPAN;
    }

    // World positions
    const pos: [number, number, number][] = layout.map((l, i) => [
      l.x + Math.sin(t * 0.31 + i * 1.7 + seed) * 0.06,
      yOffsets.current[i],
      l.z,
    ]);

    // Fade: in at bottom 0–15%, full in middle, out at top 80–100%
    const fades = yOffsets.current.map((y, i) => {
      const norm    = (y + Y_SPAN / 2) / Y_SPAN;
      const env     = norm < 0.15 ? norm / 0.15 : norm > 0.80 ? (1 - norm) / 0.20 : 1.0;
      const flicker = 0.88 + 0.12 * Math.sin(t * 6.3 + i * 1.7 + seed * 0.5);
      return Math.max(0, Math.min(1, env * flicker));
    });

    // Update star positions + opacities
    for (let i = 0; i < STAR_COUNT; i++) {
      const g = starRefs.current[i];
      if (!g) continue;
      g.position.set(...pos[i]);
      g.traverse(child => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mat = (child as any).material as (THREE.Material & { opacity?: number; userData: Record<string, number> }) | undefined;
        if (!mat || mat.opacity === undefined) return;
        if (mat.userData.base === undefined) mat.userData.base = mat.opacity;
        mat.opacity = mat.userData.base * fades[i];
      });
    }

    // Update connection geometries + line opacities
    for (let ci = 0; ci < CONN_IDX.length; ci++) {
      const [ai, bi] = CONN_IDX[ci];
      const fade = Math.min(fades[ai], fades[bi]);

      const attr = lineGeos[ci].getAttribute('position') as THREE.BufferAttribute;
      const arr  = attr.array as Float32Array;
      arr[0] = pos[ai][0]; arr[1] = pos[ai][1]; arr[2] = pos[ai][2];
      arr[3] = pos[bi][0]; arr[4] = pos[bi][1]; arr[5] = pos[bi][2];
      attr.needsUpdate = true;

      (lineMeshes[ci].glow.material as THREE.LineBasicMaterial).opacity = 0.85 * fade;
      (lineMeshes[ci].halo.material as THREE.LineBasicMaterial).opacity = 0.55 * fade;
      (lineMeshes[ci].core.material as THREE.LineBasicMaterial).opacity = 1.0  * fade;
    }
  });

  return (
    <group>
      {layout.map((_, i) => (
        <group key={i} ref={el => { starRefs.current[i] = el; }}>
          <StarMark size={0.058 + (i % 3) * 0.012} />
        </group>
      ))}
      {lineMeshes.map(({ glow, halo, core }, ci) => (
        <group key={ci}>
          <primitive object={glow} />
          <primitive object={halo} />
          <primitive object={core} />
        </group>
      ))}
    </group>
  );
}

function ModelHUD({ seed = 0 }: { kind?: string; amount?: number; seed?: number }) {
  return (
    <group>
      <Constellation seed={seed} />
    </group>
  );
}

/* ── Dispatcher ─────────────────────────────────────── */

function HologramScene({ kind, position, amount, showHUD, seed }: {
  kind: string;
  position: [number, number, number];
  amount?: number;
  showHUD?: boolean;
  seed?: number;
}) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    const g = groupRef.current;
    if (!g) return;

    const t  = state.clock.elapsedTime;
    const ph = (seed ?? 0) * 1.3;

    const mx = _smoothMouse.x; // -0.5 → 0.5, left→right
    const my = _smoothMouse.y; // -0.5 → 0.5, top→bottom

    // Base float — independent frequencies so motion never feels looping.
    // Mouse adds a noticeable tilt proportional to cursor offset from centre.
    g.rotation.y = Math.sin(t * 0.38 + ph)       * 0.16 + mx * 0.45;
    g.rotation.x = Math.sin(t * 0.27 + ph + 1.1) * 0.06 - my * 0.28;
    g.rotation.z = Math.sin(t * 0.19 + ph + 2.4) * 0.04;
    g.position.y = position[1] + Math.sin(t * 0.44 + ph + 0.7) * 0.06 - my * 0.10;
  });

  let shape: ReactElement;
  switch (kind) {
    case 'section-income':
    case 'section-remaining':
      shape = <CoinShape />;
      break;
    case 'section-housing':
      shape = <HouseShape />;
      break;
    case 'section-utilities':
      shape = <SpannerShape />;
      break;
    case 'section-groceries':
      shape = <GrocerySackShape />;
      break;
    case 'section-transport':
      shape = <CarShape />;
      break;
    case 'section-pension':
      shape = <CoinStackShape />;
      break;
    case 'section-student':
      shape = <GraduationCapShape />;
      break;
    case 'section-income-tax':
    case 'section-ni':
    case 'section-council':
      shape = <DocumentShape />;
      break;
    default:
      shape = <CoinShape />;
  }

  return (
    <>
      {/* Invisible depth proxy: writes depth so constellation lines/stars
          orbiting behind the hologram get properly occluded.
          The hologram visual itself has depthTest=false → always reads on top. */}
      {showHUD && (
        <mesh position={position}>
          <sphereGeometry args={[0.95, 24, 18]} />
          <meshBasicMaterial colorWrite={false} />
        </mesh>
      )}
      {/* Floating hologram model */}
      <group ref={groupRef} position={position}>{shape}</group>
      {/* HUD (constellation + labels) in a non-rotating group at same position */}
      {showHUD && (
        <group position={position}>
          <ModelHUD kind={kind} amount={amount} seed={seed} />
        </group>
      )}
    </>
  );
}

export function AllHologramScenes({ sections, step, activeId, yOffset = 0 }: {
  sections: { id: string; amount?: number }[];
  step: number;
  activeId?: string;
  /** Constant Y offset applied to every model (mobile pushes models down so
   *  the active one sits below the text card). */
  yOffset?: number;
}) {
  return (
    <>
      {sections.map((s, i) => (
        <HologramScene
          key={s.id}
          kind={s.id}
          position={[0, yOffset - i * step, 0]}
          amount={s.amount}
          showHUD={s.id === activeId}
          seed={i}
        />
      ))}
    </>
  );
}
