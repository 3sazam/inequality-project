import { memo, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import * as THREE from 'three';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import {
  buildExpenses,
  PLACEHOLDER_MODEL,
  DEFAULTS,
  RENT_RANGE,
  UTILITIES_RANGE,
  GROCERIES_RANGE,
  TRANSPORT_RANGE,
  PENSION_OPTIONS,
  STUDENT_PLAN_OPTIONS,
  COUNCIL_BAND_OPTIONS,
  type Expense,
  type ExpenseKind,
  type ExpenseOverrides,
} from './budgetData';
import type { StudentLoanPlan, CouncilBand } from './ukTax';
import { BudgetProgressBar } from '../components/BudgetProgressBar';

gsap.registerPlugin(ScrollTrigger);

type Mode = 'average' | 'custom';

const SERIF = "'Instrument Serif', 'Cormorant Garamond', serif";
const SANS  = "system-ui, -apple-system, sans-serif";

/* ── Responsive hook ─────────────────────────────── */

function useIsMobile(breakpoint = 720) {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= breakpoint
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [breakpoint]);
  return isMobile;
}

/* ── 3D helpers ──────────────────────────────────── */

function SectionModel({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  return <primitive object={scene} />;
}

useGLTF.preload(PLACEHOLDER_MODEL);

/* ── Drifting particle field (atmosphere) ─────────
 *
 * Renders in its OWN <Canvas> behind the main 3D canvas (DOM z-index), so
 * particles can never composite on top of the model. Tiny, uniform, crisp
 * dots — `sizeAttenuation: false` so every point is the same size on screen
 * regardless of depth. Matches the igloo.inc ambient-dust look.
 */

function makeSoftDotTexture(): THREE.CanvasTexture {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0,    'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.85)');
  g.addColorStop(1,    'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

const PARTICLE_VOLUME: [number, number] = [26, 120];
const PARTICLE_COUNT = 700;
// Camera fov 50 at z=10 → world height visible = 2*10*tan(25°) ≈ 9.33
const VISIBLE_WORLD_HEIGHT = 2 * 10 * Math.tan((50 / 2) * Math.PI / 180);

const PARTICLE_VERTEX = /* glsl */`
  attribute float aPhase;
  attribute float aIntensity;
  uniform float uTime;
  uniform float uSize;
  varying float vAlpha;
  void main() {
    // Slow per-particle fade in/out — some particles also stay brighter (aIntensity).
    float pulse = 0.45 + 0.55 * sin(uTime * 0.45 + aPhase);
    vAlpha = aIntensity * pulse;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uSize;
  }
`;

const PARTICLE_FRAGMENT = /* glsl */`
  uniform sampler2D uTex;
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vAlpha;
  void main() {
    vec4 tex = texture2D(uTex, gl_PointCoord);
    float a = tex.a * uOpacity * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor, a);
  }
`;

function ParticleLayer() {
  const groupRef = useRef<THREE.Group>(null);
  const pointsRef = useRef<THREE.Points>(null);
  const texture = useMemo(makeSoftDotTexture, []);

  // Jittered grid → orderly but not mechanical. Phases + intensities give variety.
  const { positions, phases, intensities } = useMemo(() => {
    const [vx, vy] = PARTICLE_VOLUME;
    const cols = Math.max(1, Math.round(Math.sqrt(PARTICLE_COUNT * (vx / vy))));
    const rows = Math.ceil(PARTICLE_COUNT / cols);
    const cellW = vx / cols;
    const cellH = vy / rows;
    const pos = new Float32Array(PARTICLE_COUNT * 3);
    const ph  = new Float32Array(PARTICLE_COUNT);
    const it  = new Float32Array(PARTICLE_COUNT);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const cx = i % cols;
      const cy = Math.floor(i / cols);
      pos[i * 3]     = -vx / 2 + (cx + 0.5 + (Math.random() - 0.5) * 0.6) * cellW;
      pos[i * 3 + 1] = -vy / 2 + (cy + 0.5 + (Math.random() - 0.5) * 0.6) * cellH;
      pos[i * 3 + 2] = 0;
      ph[i] = Math.random() * Math.PI * 2;
      // Most particles dim, ~20% catch the light and read brighter.
      it[i] = Math.random() < 0.2 ? 0.85 + Math.random() * 0.15 : 0.35 + Math.random() * 0.35;
    }
    return { positions: pos, phases: ph, intensities: it };
  }, []);

  const basePositions = useMemo(() => positions.slice(), [positions]);

  const uniforms = useMemo(() => ({
    uTime:    { value: 0 },
    uTex:     { value: texture },
    uColor:   { value: new THREE.Color('#1a1a16') },
    uOpacity: { value: 0.85 },
    uSize:    { value: 3.6 },
  }), [texture]);

  useFrame((state) => {
    if (groupRef.current) {
      const px2world = VISIBLE_WORLD_HEIGHT / window.innerHeight;
      groupRef.current.position.y = window.scrollY * px2world * 0.85;
    }

    uniforms.uTime.value = state.clock.elapsedTime;

    // Tiny in-place sway so the field feels alive.
    if (!pointsRef.current) return;
    const t = state.clock.elapsedTime;
    const attr = pointsRef.current.geometry.attributes.position as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    const amp = 0.08;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = phases[i];
      arr[i * 3]     = basePositions[i * 3]     + Math.sin(t * 0.4 + p) * amp;
      arr[i * 3 + 1] = basePositions[i * 3 + 1] + Math.cos(t * 0.35 + p * 1.3) * amp;
    }
    attr.needsUpdate = true;
  });

  return (
    <group ref={groupRef}>
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position"   args={[positions,   3]} />
          <bufferAttribute attach="attributes-aPhase"     args={[phases,      1]} />
          <bufferAttribute attach="attributes-aIntensity" args={[intensities, 1]} />
        </bufferGeometry>
        <shaderMaterial
          uniforms={uniforms}
          vertexShader={PARTICLE_VERTEX}
          fragmentShader={PARTICLE_FRAGMENT}
          transparent
          depthWrite={false}
        />
      </points>
    </group>
  );
}

const ParticleBackdrop = memo(function ParticleBackdrop() {
  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1,
        pointerEvents: 'none',
      }}
    >
      <Canvas camera={{ position: [0, 0, 10], fov: 50 }} gl={{ alpha: true, antialias: true }}>
        <ParticleLayer />
      </Canvas>
    </div>
  );
});

function CameraAnimator({ sectionCount: _sectionCount }: { sectionCount: number }) {
  const { camera } = useThree();

  useEffect(() => {
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: '#main-scroll-container',
        start: 'top top',
        end: 'bottom bottom',
        scrub: 1.2,
      },
    });

    tl.to(camera.position, { y: -20, ease: 'none' });

    return () => {
      (tl.scrollTrigger as ScrollTrigger | undefined)?.kill();
      tl.kill();
    };
  }, [camera]);

  return null;
}

/* ── Background atmosphere (vignette + soft blobs + ghost labels) ─ */

const GHOST_LABELS: { text: string; top: string; left?: string; right?: string; delay: number; dur: number }[] = [
  { text: 'DIVIDE / 01 · UK NET',     top: '7%',  left:  '6%', delay: 0,   dur: 9 },
  { text: 'BUDGET · MO · ID-0420',    top: '12%', right: '7%', delay: 2.5, dur: 11 },
  { text: 'SECTION · 03 / EXPENSES',  top: '76%', left:  '8%', delay: 1.2, dur: 13 },
  { text: '£ / MO · 2025',            top: '82%', right: '9%', delay: 4,   dur: 10 },
  { text: 'NET · TX-0091',            top: '38%', left:  '4%', delay: 6,   dur: 12 },
  { text: 'CH-0420 / FLOW',           top: '60%', right: '5%', delay: 3,   dur: 14 },
];

const BackgroundAtmosphere = memo(function BackgroundAtmosphere() {
  const blobARef = useRef<HTMLDivElement>(null);
  const blobBRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      const y = window.scrollY;
      if (blobARef.current) blobARef.current.style.transform = `translateY(${-y * 0.18}px)`;
      if (blobBRef.current) blobBRef.current.style.transform = `translateY(${-y * 0.32}px)`;
      raf = 0;
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    window.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <>
      {/* Spherical vignette — deepens the edges so the page feels like a chamber */}
      <div
        aria-hidden
        style={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 0,
          background:
            'radial-gradient(ellipse 82% 68% at 50% 50%, transparent 55%, rgba(28,38,32,0.14) 100%)',
        }}
      />

      {/* Soft atmospheric blobs — organic depth, parallax with scroll */}
      <div
        ref={blobARef}
        aria-hidden
        style={{
          position: 'fixed',
          top: '14%', left: '10%',
          width: '38vw', height: '38vw',
          maxWidth: 520, maxHeight: 520,
          background: 'radial-gradient(circle, rgba(28,40,32,0.08), transparent 65%)',
          filter: 'blur(60px)',
          pointerEvents: 'none',
          zIndex: 0,
          willChange: 'transform',
        }}
      />
      <div
        ref={blobBRef}
        aria-hidden
        style={{
          position: 'fixed',
          bottom: '10%', right: '8%',
          width: '34vw', height: '34vw',
          maxWidth: 460, maxHeight: 460,
          background: 'radial-gradient(circle, rgba(240,242,232,0.18), transparent 65%)',
          filter: 'blur(70px)',
          pointerEvents: 'none',
          zIndex: 0,
          willChange: 'transform',
        }}
      />

      {/* Light flares — long, soft highlights suggesting curvature */}
      <div
        aria-hidden
        style={{
          position: 'fixed',
          top: '18%', left: '-15%', right: '-15%', height: '14vh',
          background: 'linear-gradient(180deg, transparent, rgba(255,253,245,0.42), transparent)',
          filter: 'blur(48px)',
          transform: 'rotate(-7deg)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />
      <div
        aria-hidden
        style={{
          position: 'fixed',
          bottom: '14%', left: '-20%', right: '-10%', height: '11vh',
          background: 'linear-gradient(180deg, transparent, rgba(255,250,235,0.28), transparent)',
          filter: 'blur(56px)',
          transform: 'rotate(5deg)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* Ghost labels — pulsing technical artifacts in the periphery */}
      <style>{`@keyframes ghostFade { 0%,100% { opacity: 0.04 } 50% { opacity: 0.22 } }`}</style>
      {GHOST_LABELS.map((l) => (
        <div
          key={l.text}
          aria-hidden
          style={{
            position: 'fixed',
            top: l.top, left: l.left, right: l.right,
            fontFamily: SANS,
            fontSize: 10,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: '#1a1a16',
            filter: 'blur(0.6px)',
            pointerEvents: 'none',
            zIndex: 0,
            opacity: 0.04,
            animation: `ghostFade ${l.dur}s ease-in-out ${l.delay}s infinite`,
          }}
        >
          {l.text}
        </div>
      ))}
    </>
  );
});

/* ── Ambient blurred word behind the canvas ──────── */

const KIND_WORD: Record<ExpenseKind, string> = {
  rent:      'RENT',
  utilities: 'BILLS',
  groceries: 'FOOD',
  transport: 'TRANSIT',
  incomeTax: 'TAX',
  ni:        'NI',
  pension:   'PENSION',
  student:   'LOAN',
  council:   'COUNCIL',
};

function ambientLayerStyle(isMobile: boolean): CSSProperties {
  return {
    position: 'fixed',
    inset: 0,
    zIndex: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
    userSelect: 'none',
    fontFamily: SERIF,
    fontStyle: 'italic',
    fontWeight: 400,
    fontSize: isMobile ? 'clamp(7rem, 38vw, 18rem)' : 'clamp(10rem, 28vw, 28rem)',
    // Text is fully transparent; only the soft glow shows. Avoids CSS filter:blur
    // which forces full-screen rasterization on every composite (the jitter source).
    color: 'transparent',
    textShadow: [
      '0 0 18px rgba(26,26,22,0.05)',
      '0 0 36px rgba(26,26,22,0.05)',
      '0 0 72px rgba(26,26,22,0.04)',
    ].join(', '),
    letterSpacing: '-0.04em',
    lineHeight: 1,
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
    transform: 'translateZ(0)',
    willChange: 'opacity',
    backfaceVisibility: 'hidden',
  };
}

/**
 * Two stacked layers cross-fade between words. While the new word is fading
 * in, the previous word is fading out at the same time — no flash, no pop.
 */
function AmbientWord({ word, isMobile }: { word: string; isMobile: boolean }) {
  const aRef = useRef<HTMLDivElement>(null);
  const bRef = useRef<HTMLDivElement>(null);
  const showA = useRef(true);
  const lastCommitted = useRef(word);

  // Track which layer currently displays which word.
  const [textA, setTextA] = useState(word);
  const [textB, setTextB] = useState('');

  useEffect(() => {
    // Initial mount — fade layer A in once.
    if (aRef.current) gsap.set(aRef.current, { opacity: 1 });
    if (bRef.current) gsap.set(bRef.current, { opacity: 0 });
  }, []);

  // Debounce the cross-fade: only react to words that settle for ~140ms.
  // Prevents 10 overlapping tweens during a fast scroll (which caused both
  // the lag and the "no word appears" symptom).
  useEffect(() => {
    if (lastCommitted.current === word) return;

    const id = window.setTimeout(() => {
      if (lastCommitted.current === word) return;
      lastCommitted.current = word;

      const incomingRef = showA.current ? bRef : aRef;
      const outgoingRef = showA.current ? aRef : bRef;

      if (showA.current) setTextB(word); else setTextA(word);
      showA.current = !showA.current;

      requestAnimationFrame(() => {
        if (incomingRef.current) {
          gsap.fromTo(
            incomingRef.current,
            { opacity: 0 },
            { opacity: 1, duration: 0.9, ease: 'power2.out', overwrite: true }
          );
        }
        if (outgoingRef.current) {
          gsap.to(outgoingRef.current, { opacity: 0, duration: 0.9, ease: 'power2.out', overwrite: true });
        }
      });
    }, 140);

    return () => window.clearTimeout(id);
  }, [word]);

  const style = ambientLayerStyle(isMobile);

  return (
    <>
      <div ref={aRef} style={style}>{textA}</div>
      <div ref={bRef} style={style}>{textB}</div>
    </>
  );
}

/* ── Shared text styles ──────────────────────────── */

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontFamily: SANS,
  fontSize: '0.6rem',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'rgba(26,26,22,0.38)',
  marginBottom: '0.8rem',
};

const headingStyle: React.CSSProperties = {
  fontFamily: SERIF,
  fontStyle: 'italic',
  fontWeight: 400,
  margin: '0 0 1rem',
  fontSize: 'clamp(2.4rem, 4.5vw, 3.8rem)',
  lineHeight: 1.04,
  color: '#1a1a16',
  letterSpacing: '-0.005em',
};

const bodyStyle: React.CSSProperties = {
  fontFamily: SANS,
  margin: '0 0 0.5rem',
  fontSize: '0.88rem',
  lineHeight: 1.72,
  color: 'rgba(26,26,22,0.5)',
  maxWidth: '340px',
};

function makeSectionStyle(isMobile: boolean): CSSProperties {
  return {
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    paddingLeft: isMobile ? '6vw' : '10vw',
    paddingRight: isMobile ? '80px' : 0,
    maxWidth: isMobile ? '100vw' : '52vw',
  };
}

/* ── Small controls ──────────────────────────────── */

function Slider({
  value, min, max, step, onChange, suffix = '',
}: {
  value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; suffix?: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 340, marginTop: '0.9rem' }}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ accentColor: '#1c4d2e', width: '100%' }}
      />
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontFamily: SANS,
        fontSize: '0.62rem',
        color: 'rgba(26,26,22,0.4)',
        fontVariantNumeric: 'tabular-nums',
      }}>
        <span>£{min.toLocaleString()}{suffix}</span>
        <span>£{max.toLocaleString()}{suffix}</span>
      </div>
    </div>
  );
}

function Segmented<T extends string | number>({
  value, options, onChange, format = (v) => String(v),
}: {
  value: T;
  options: readonly T[] | T[];
  onChange: (v: T) => void;
  format?: (v: T) => string;
}) {
  return (
    <div style={{
      display: 'inline-flex',
      flexWrap: 'wrap',
      gap: 4,
      background: 'rgba(26,26,22,0.04)',
      border: '1px solid rgba(26,26,22,0.1)',
      borderRadius: 8,
      padding: 3,
      marginTop: '0.9rem',
      maxWidth: 340,
    }}>
      {options.map((opt) => {
        const active = opt === value;
        return (
          <button
            key={String(opt)}
            type="button"
            onClick={() => onChange(opt)}
            style={{
              fontFamily: SANS,
              fontSize: '0.72rem',
              padding: '0.32rem 0.7rem',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              background: active ? '#1c4d2e' : 'transparent',
              color: active ? '#f2ebe0' : 'rgba(26,26,22,0.55)',
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            {format(opt)}
          </button>
        );
      })}
    </div>
  );
}

/* ── Expense section ─────────────────────────────── */

function ExpenseSection({
  expense,
  isMobile,
  mode,
  overrides,
  onOverride,
}: {
  expense: Expense;
  isMobile: boolean;
  mode: Mode;
  overrides: ExpenseOverrides;
  onOverride: (patch: ExpenseOverrides) => void;
}) {
  const custom = mode === 'custom';

  const control = (() => {
    if (!custom) return null;
    switch (expense.kind) {
      case 'rent':
        return <Slider value={overrides.rent ?? DEFAULTS.rent}
          {...RENT_RANGE}
          onChange={(v) => onOverride({ rent: v })} />;
      case 'utilities':
        return <Slider value={overrides.utilities ?? DEFAULTS.utilities}
          {...UTILITIES_RANGE}
          onChange={(v) => onOverride({ utilities: v })} />;
      case 'groceries':
        return <Slider value={overrides.groceries ?? DEFAULTS.groceries}
          {...GROCERIES_RANGE}
          onChange={(v) => onOverride({ groceries: v })} />;
      case 'transport':
        return <Slider value={overrides.transport ?? DEFAULTS.transport}
          {...TRANSPORT_RANGE}
          onChange={(v) => onOverride({ transport: v })} />;
      case 'pension':
        return <Segmented
          value={overrides.pensionPct ?? DEFAULTS.pensionPct}
          options={PENSION_OPTIONS}
          format={(v) => `${v}%`}
          onChange={(v) => onOverride({ pensionPct: v })} />;
      case 'student':
        return <Segmented<StudentLoanPlan>
          value={overrides.studentPlan ?? DEFAULTS.studentPlan}
          options={STUDENT_PLAN_OPTIONS.map(o => o.value)}
          format={(v) => STUDENT_PLAN_OPTIONS.find(o => o.value === v)?.label ?? String(v)}
          onChange={(v) => onOverride({ studentPlan: v })} />;
      case 'council':
        return <Segmented<CouncilBand>
          value={overrides.councilBand ?? DEFAULTS.councilBand}
          options={COUNCIL_BAND_OPTIONS}
          format={(v) => `Band ${v}`}
          onChange={(v) => onOverride({ councilBand: v })} />;
      default:
        return null;
    }
  })();

  return (
    <div id={expense.id} style={makeSectionStyle(isMobile)}>
      <span style={labelStyle}>{expense.group}</span>
      <h1 style={headingStyle}>{expense.label}</h1>
      <p style={bodyStyle}>{expense.description}</p>
      <span style={{
        fontFamily: SANS,
        fontSize: '0.75rem',
        color: '#8b2216',
        display: 'inline-block',
        marginTop: '0.4rem',
        fontVariantNumeric: 'tabular-nums',
      }}>
        − £{expense.amount.toLocaleString()} / month
        {expense.derived && (
          <span style={{ color: 'rgba(26,26,22,0.35)', marginLeft: 8 }}>(auto)</span>
        )}
      </span>
      {control}
    </div>
  );
}

/* ── Mode toggle (Average / Custom) ──────────────── */

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const btn = (active: boolean): CSSProperties => ({
    fontFamily: SANS,
    fontSize: '0.72rem',
    padding: '0.36rem 0.9rem',
    border: 'none',
    borderRadius: 999,
    cursor: 'pointer',
    background: active ? '#1c4d2e' : 'transparent',
    color: active ? '#f2ebe0' : 'rgba(26,26,22,0.55)',
    transition: 'background 0.15s, color 0.15s',
  });

  return (
    <div style={{
      position: 'fixed', top: 24, right: 24, zIndex: 200,
      display: 'inline-flex',
      background: 'rgba(242,235,224,0.85)',
      border: '1px solid rgba(26,26,22,0.13)',
      borderRadius: 999,
      padding: 3,
    }}>
      <button type="button" style={btn(mode === 'average')} onClick={() => onChange('average')}>Average</button>
      <button type="button" style={btn(mode === 'custom')}  onClick={() => onChange('custom')}>Custom</button>
    </div>
  );
}

/* ── Main page ───────────────────────────────────── */

export default function MainExperience() {
  const location = useLocation();
  const navigate = useNavigate();
  const income   = Number(location.state?.userInput) || 3500;
  const isMobile = useIsMobile();
  const sectionStyle = makeSectionStyle(isMobile);

  const [mode, setMode] = useState<Mode>('average');
  const [overrides, setOverrides] = useState<ExpenseOverrides>({});

  const expenses = useMemo(
    () => buildExpenses(income, mode === 'custom' ? overrides : {}),
    [income, mode, overrides]
  );

  const totalSpent   = useMemo(() => expenses.reduce((s, e) => s + e.amount, 0), [expenses]);
  const netRemaining = income - totalSpent;

  // Track which section is currently active → drives which 3D model + ambient word are shown.
  const [activeModel, setActiveModel] = useState<string>(PLACEHOLDER_MODEL);
  const [activeWord, setActiveWord] = useState<string>('INCOME');

  // Progress-bar state — the bar is a dumb visualization of these two values.
  const [barRemaining, setBarRemaining] = useState<number>(income);
  const [barChip, setBarChip] = useState<string | null>(null);

  const totalSections = 1 + expenses.length + 1;

  useEffect(() => {
    const sections: { id: string; model: string; word: string }[] = [
      { id: 'section-income', model: PLACEHOLDER_MODEL, word: 'INCOME' },
      ...expenses.map(e => ({
        id: e.id,
        model: e.model ?? PLACEHOLDER_MODEL,
        word: KIND_WORD[e.kind],
      })),
      { id: 'section-remaining', model: PLACEHOLDER_MODEL, word: 'LEFT' },
    ];

    let lastIndex = -1;
    // Single ScrollTrigger reading actual DOM position each tick — avoids
    // missed/out-of-order onEnter events on fast-fling scrolls.
    const trigger = ScrollTrigger.create({
      trigger: '#main-scroll-container',
      start: 'top top',
      end: 'bottom bottom',
      snap: {
        snapTo: 1 / (sections.length - 1),
        duration: { min: 0.7, max: 1.4 },
        delay: 0.15,
        ease: 'power3.inOut',
      },
      onUpdate: () => {
        const center = window.innerHeight / 2;
        let active = 0;
        let bestDist = Infinity;
        for (let i = 0; i < sections.length; i++) {
          const el = document.getElementById(sections[i].id);
          if (!el) continue;
          const rect = el.getBoundingClientRect();
          const mid = (rect.top + rect.bottom) / 2;
          const dist = Math.abs(mid - center);
          if (dist < bestDist) {
            bestDist = dist;
            active = i;
          }
        }
        if (active !== lastIndex) {
          lastIndex = active;
          setActiveModel(sections[active].model);
          setActiveWord(sections[active].word);
        }
      },
    });

    return () => trigger.kill();
  }, [expenses]);

  // Scroll-drive the progress bar: set remaining + chip per expense section.
  useEffect(() => {
    setBarRemaining(income);
    setBarChip(null);

    const triggers: ReturnType<typeof ScrollTrigger.create>[] = [];
    let cumulative = 0;

    for (const expense of expenses) {
      const spentBefore = cumulative;
      cumulative += expense.amount;
      const remainingAfter = income - cumulative;
      const remainingBefore = income - spentBefore;
      const label = `-£${expense.amount.toLocaleString()} ${expense.label}`;

      triggers.push(ScrollTrigger.create({
        trigger: `#${expense.id}`,
        start: 'top 55%',
        onEnter:     () => { setBarRemaining(remainingAfter);  setBarChip(label); },
        onLeaveBack: () => { setBarRemaining(remainingBefore); setBarChip(null); },
      }));
    }

    return () => triggers.forEach(t => t.kill());
  }, [income, expenses]);

  const handleOverride = (patch: ExpenseOverrides) =>
    setOverrides((prev) => ({ ...prev, ...patch }));

  return (
    <div style={{
      background: 'radial-gradient(ellipse 82% 72% at 50% 44%, #f9f7f0 0%, #efede3 38%, #d2d6cb 78%, #b6bdb1 100%)',
      fontFamily: SANS,
      position: 'relative',
    }}>

      <BackgroundAtmosphere />

      {/* Grain overlay */}
      <div style={{
        position: 'fixed',
        inset: 0,
        backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.72' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)'/%3E%3C/svg%3E\")",
        backgroundRepeat: 'repeat',
        backgroundSize: '300px 300px',
        opacity: 0.045,
        pointerEvents: 'none',
        zIndex: 9999,
      }} />

      {/* Back button */}
      <div style={{ position: 'fixed', top: 24, left: 24, zIndex: 200 }}>
        <Link
          to="/"
          style={{
            fontFamily: SANS,
            fontSize: '0.8rem',
            color: 'rgba(26,26,22,0.5)',
            textDecoration: 'none',
            border: '1px solid rgba(26,26,22,0.15)',
            borderRadius: 6,
            padding: '0.38rem 0.9rem',
            background: 'rgba(242,235,224,0.75)',
            display: 'inline-block',
          }}
        >
          ← Back
        </Link>
      </div>

      <ModeToggle mode={mode} onChange={setMode} />

      {/* Scroll hint */}
      <div style={{
        position: 'fixed',
        bottom: 28, left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 200,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: '0.3rem',
        color: 'rgba(26,26,22,0.32)',
        fontFamily: SANS,
        fontSize: '0.58rem',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        pointerEvents: 'none',
      }}>
        <span>Scroll</span>
        <span style={{ fontSize: '0.85rem' }}>↓</span>
      </div>

      <BudgetProgressBar income={income} remaining={barRemaining} chipLabel={barChip} />

      {/* Ambient blurred word — deepest layer, sits behind particles + 3D */}
      <AmbientWord word={activeWord} isMobile={isMobile} />

      {/* Particles — dedicated canvas at zIndex 1, always behind the 3D model */}
      <ParticleBackdrop />

      {/* Fixed 3-D canvas — swaps model based on active section */}
      <div style={{ width: '100vw', height: '100vh', position: 'fixed', top: 0, left: 0, zIndex: 2 }}>
        <Canvas camera={{ position: [0, 0, 8], fov: 50 }} gl={{ alpha: true }}>
          <fog attach="fog" args={['#ebe2d2', 6, 22]} />
          <ambientLight intensity={1.1} color="#f2ebe0" />
          <directionalLight position={[10, 10, 10]} intensity={1.0} />
          <CameraAnimator sectionCount={totalSections} />
          <Suspense fallback={null}>
            <SectionModel key={activeModel} url={activeModel} />
          </Suspense>
        </Canvas>
      </div>

      {/* HTML scroll container */}
      <div id="main-scroll-container" style={{ position: 'relative', zIndex: 10, width: '100%' }}>

        {/* Income intro */}
        <div id="section-income" style={sectionStyle}>
          <span style={labelStyle}>Your income</span>
          <h1 style={headingStyle}>
            Starting with<br />
            <span style={{ color: 'rgba(26,26,22,0.4)' }}>£{income.toLocaleString()}</span>
          </h1>
          <p style={bodyStyle}>
            {mode === 'average'
              ? 'Scroll down to watch your monthly budget divide itself — line by line.'
              : 'You’re in custom mode. Adjust the sliders as you scroll — the bar updates in real time.'}
          </p>
        </div>

        {expenses.map(expense => (
          <ExpenseSection
            key={expense.id}
            expense={expense}
            isMobile={isMobile}
            mode={mode}
            overrides={overrides}
            onOverride={handleOverride}
          />
        ))}

        {/* Remaining balance */}
        <div id="section-remaining" style={sectionStyle}>
          <span style={labelStyle}>What's left</span>
          <h1 style={headingStyle}>Remaining Balance</h1>
          <p style={bodyStyle}>
            After your expenses, you're left with{' '}
            <strong style={{ color: netRemaining < 0 ? '#8b2216' : '#1c442a', fontWeight: 500 }}>
              £{netRemaining.toLocaleString()}
            </strong>{' '}
            each month.
          </p>
          <button
            type="button"
            onClick={() => navigate('/affordability', { state: { income, monthlyRemaining: netRemaining } })}
            style={{
              marginTop: '1.6rem',
              alignSelf: 'flex-start',
              fontFamily: SANS,
              fontSize: '0.82rem',
              padding: '0.7rem 1.2rem',
              border: '1px solid #1c4d2e',
              borderRadius: 999,
              background: '#1c4d2e',
              color: '#f2ebe0',
              cursor: 'pointer',
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            See what you can do with your balance →
          </button>
        </div>

      </div>
    </div>
  );
}
