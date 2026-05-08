import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import * as THREE from 'three';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { AllHologramScenes, HologramTimeAnimator, MouseInfluenceTracker } from './HologramObjects';
import {
  buildExpenses,
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
import { GridBackground } from '../components/GridBackground';
import { usePageBackground } from '../lib/usePageBackground';
import expStyles from './expenditure.module.css';

gsap.registerPlugin(ScrollTrigger);

type Mode = 'average' | 'custom';

const SERIF = "'Instrument Serif', 'Cormorant Garamond', serif";
const SANS  = "'Manrope', system-ui, sans-serif";
const BODY  = "'Lato', system-ui, sans-serif";

/* ── Responsive hook ─────────────────────────────── */

// 900px catches portrait tablets (768) and small laptops in split-screen.
// Below this width the side-by-side text+model layout collides with the
// centred 3D model, so we switch to the stacked mobile layout instead.
function useIsMobile(breakpoint = 900) {
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
const PARTICLE_COUNT_DESKTOP = 700;
// 120 is the floor where the field still reads as a continuous backdrop on a
// 360-pt phone. Going lower starts to feel like scattered dots.
const PARTICLE_COUNT_MOBILE  = 120;
// Camera fov 50 at z=10 → world height visible = 2*10*tan(25°) ≈ 9.33
const VISIBLE_WORLD_HEIGHT = 2 * 10 * Math.tan((50 / 2) * Math.PI / 180);

const PARTICLE_VERTEX = /* glsl */`
  attribute float aPhase;
  attribute float aIntensity;
  uniform float uTime;
  uniform float uSize;
  varying float vAlpha;
  void main() {
    // Tiny in-place sway baked into the vertex shader so the field feels alive
    // without paying for a 700-element JS loop + buffer re-upload every frame.
    vec3 pos = position;
    pos.x += sin(uTime * 0.40 + aPhase)        * 0.08;
    pos.y += cos(uTime * 0.35 + aPhase * 1.3)  * 0.08;

    // Slow per-particle fade in/out — some particles also stay brighter (aIntensity).
    float pulse = 0.45 + 0.55 * sin(uTime * 0.45 + aPhase);
    vAlpha = aIntensity * pulse;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
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

function ParticleLayer({ count }: { count: number }) {
  const groupRef = useRef<THREE.Group>(null);
  const texture = useMemo(makeSoftDotTexture, []);

  // Jittered grid → orderly but not mechanical. Phases + intensities give variety.
  const { positions, phases, intensities } = useMemo(() => {
    const [vx, vy] = PARTICLE_VOLUME;
    const cols = Math.max(1, Math.round(Math.sqrt(count * (vx / vy))));
    const rows = Math.ceil(count / cols);
    const cellW = vx / cols;
    const cellH = vy / rows;
    const pos = new Float32Array(count * 3);
    const ph  = new Float32Array(count);
    const it  = new Float32Array(count);
    for (let i = 0; i < count; i++) {
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
  }, [count]);

  const uniforms = useMemo(() => ({
    uTime:    { value: 0 },
    uTex:     { value: texture },
    uColor:   { value: new THREE.Color('#ffffff') },
    uOpacity: { value: 0.72 },
    uSize:    { value: 4.0 },
  }), [texture]);

  useFrame((state) => {
    if (groupRef.current) {
      const px2world = VISIBLE_WORLD_HEIGHT / window.innerHeight;
      groupRef.current.position.y = window.scrollY * px2world * 0.85;
    }
    uniforms.uTime.value = state.clock.elapsedTime;
    // Sway is now driven entirely by the vertex shader using uTime + aPhase —
    // no per-frame JS loop, no buffer re-upload.
  });

  return (
    <group ref={groupRef}>
      <points>
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

const ParticleBackdrop = memo(function ParticleBackdrop({ isMobile }: { isMobile: boolean }) {
  const count = isMobile ? PARTICLE_COUNT_MOBILE : PARTICLE_COUNT_DESKTOP;
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
      <Canvas
        camera={{ position: [0, 0, 10], fov: 50 }}
        dpr={[1, isMobile ? 1 : 1.5]}
        gl={{ alpha: true, antialias: false, powerPreference: 'high-performance' }}
      >
        <ParticleLayer count={count} />
      </Canvas>
    </div>
  );
});

function CameraAnimator({ totalY }: { totalY: number }) {
  const { camera } = useThree();

  useEffect(() => {
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: '#main-scroll-container',
        start: 'top top',
        end: 'bottom bottom',
        scrub: true, // Lenis owns the easing; no additional lag needed here
      },
    });

    tl.to(camera.position, { y: -totalY, ease: 'none' });

    return () => {
      (tl.scrollTrigger as ScrollTrigger | undefined)?.kill();
      tl.kill();
    };
  }, [camera, totalY]);

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

const BackgroundAtmosphere = memo(function BackgroundAtmosphere({ isMobile }: { isMobile: boolean }) {
  // Full-screen 70-90px CSS blur on phones is the single biggest GPU cost on
  // this page. Halving it on mobile is invisible to the eye (the orbs stay
  // soft and luminous) but cuts the per-frame composite cost by ~60%.
  const blurA = isMobile ? 36 : 72;
  const blurB = isMobile ? 44 : 88;
  const blurC = isMobile ? 30 : 60;
  const blurFlareA = isMobile ? 24 : 42;
  const blurFlareB = isMobile ? 22 : 36;
  const blurFlareC = isMobile ? 28 : 50;
  return (
    <>
      <style>{`
        @keyframes ghostFade { 0%,100% { opacity:0.03 } 50% { opacity:0.16 } }

        @keyframes cloudA {
          0%,100% { transform:translate(0,0) scale(1); }
          20%  { transform:translate(6vw,-10vh) scale(1.08); }
          50%  { transform:translate(9vw,5vh) scale(0.94); }
          78%  { transform:translate(-6vw,8vh) scale(1.06); }
        }
        @keyframes cloudB {
          0%,100% { transform:translate(0,0) scale(1); }
          28%  { transform:translate(-8vw,10vh) scale(1.12); }
          62%  { transform:translate(7vw,-7vh) scale(0.92); }
        }
        @keyframes cloudC {
          0%,100% { transform:translate(0,0) scale(1); }
          35%  { transform:translate(5vw,-12vh) scale(1.10); }
          70%  { transform:translate(-7vw,6vh) scale(0.90); }
        }

        /* Fast flares — shorter cycles for constant perceived motion */
        @keyframes flareA {
          0%,100% { transform:translateX(0) scaleX(1); opacity:0.55; }
          45%     { transform:translateX(14vw) scaleX(1.25); opacity:0.90; }
          75%     { transform:translateX(-8vw) scaleX(0.85); opacity:0.40; }
        }
        @keyframes flareB {
          0%,100% { transform:translate(0,0) rotate(0deg); opacity:0.45; }
          40%     { transform:translate(-12vw, 10vh) rotate(-8deg); opacity:0.80; }
          72%     { transform:translate(8vw, -6vh) rotate(5deg); opacity:0.35; }
        }
        @keyframes flareC {
          0%,100% { transform:translateY(0) scaleY(1); opacity:0.50; }
          50%     { transform:translateY(-12vh) scaleY(1.3); opacity:0.85; }
        }

        /* Stop drifting blur animations for users with reduced-motion preference.
         * The clouds and flares stay visible — they just hold position. */
        @media (prefers-reduced-motion: reduce) {
          [data-bg-anim] { animation: none !important; }
        }
      `}</style>

      {/* Edge vignette */}
      <div aria-hidden style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
        background: 'radial-gradient(ellipse 80% 65% at 50% 50%, transparent 45%, rgba(50,58,72,0.32) 100%)',
      }} />

      {/* Cloud A — large primary, top-left drift */}
      <div aria-hidden data-bg-anim="" style={{
        position: 'fixed', top: '-18%', left: '-5%',
        width: '75vw', height: '75vw', maxWidth: 1050, maxHeight: 1050,
        background: 'radial-gradient(circle, rgba(255,255,255,0.78) 0%, rgba(255,255,255,0.38) 32%, transparent 62%)',
        filter: `blur(${blurA}px)`,
        pointerEvents: 'none', zIndex: 0, willChange: 'transform',
        animation: 'cloudA 22s ease-in-out infinite',
      }} />

      {/* Cloud B — bottom-right drift */}
      <div aria-hidden data-bg-anim="" style={{
        position: 'fixed', bottom: '-22%', right: '-8%',
        width: '65vw', height: '65vw', maxWidth: 900, maxHeight: 900,
        background: 'radial-gradient(circle, rgba(255,255,255,0.68) 0%, rgba(235,238,244,0.32) 36%, transparent 62%)',
        filter: `blur(${blurB}px)`,
        pointerEvents: 'none', zIndex: 0, willChange: 'transform',
        animation: 'cloudB 28s ease-in-out infinite 4s',
      }} />

      {/* Cloud C — center secondary */}
      <div aria-hidden data-bg-anim="" style={{
        position: 'fixed', top: '22%', right: '5%',
        width: '45vw', height: '45vw', maxWidth: 620, maxHeight: 620,
        background: 'radial-gradient(circle, rgba(255,255,255,0.58) 0%, rgba(220,225,234,0.24) 40%, transparent 66%)',
        filter: `blur(${blurC}px)`,
        pointerEvents: 'none', zIndex: 0, willChange: 'transform',
        animation: 'cloudC 18s ease-in-out infinite 8s',
      }} />

      {/* Flare A — horizontal sweep across middle, 11s */}
      <div aria-hidden data-bg-anim="" style={{
        position: 'fixed', top: '30%', left: '-10%',
        width: '55vw', height: '28vh',
        background: 'radial-gradient(ellipse 100% 80% at 40% 50%, rgba(255,255,255,0.55) 0%, rgba(230,234,240,0.22) 50%, transparent 72%)',
        filter: `blur(${blurFlareA}px)`,
        pointerEvents: 'none', zIndex: 0, willChange: 'transform',
        animation: 'flareA 11s ease-in-out infinite 1s',
      }} />

      {/* Flare B — diagonal corner-to-corner, 9s */}
      <div aria-hidden data-bg-anim="" style={{
        position: 'fixed', bottom: '10%', left: '15%',
        width: '42vw', height: '22vh',
        background: 'radial-gradient(ellipse 90% 70% at 50% 60%, rgba(210,218,230,0.60) 0%, rgba(200,210,225,0.20) 55%, transparent 75%)',
        filter: `blur(${blurFlareB}px)`,
        pointerEvents: 'none', zIndex: 0, willChange: 'transform',
        animation: 'flareB 9s ease-in-out infinite 2.5s',
      }} />

      {/* Flare C — vertical pulse from top, 13s */}
      <div aria-hidden data-bg-anim="" style={{
        position: 'fixed', top: '-5%', left: '35%',
        width: '30vw', height: '40vh',
        background: 'radial-gradient(ellipse 80% 100% at 50% 0%, rgba(255,255,255,0.50) 0%, transparent 68%)',
        filter: `blur(${blurFlareC}px)`,
        pointerEvents: 'none', zIndex: 0, willChange: 'transform',
        animation: 'flareC 13s ease-in-out infinite 5s',
      }} />

      {/* Ghost labels */}
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
            color: '#3a4050',
            filter: 'blur(0.4px)',
            pointerEvents: 'none',
            zIndex: 0,
            opacity: 0.03,
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
      '0 0 18px rgba(255,255,255,0.18)',
      '0 0 36px rgba(255,255,255,0.12)',
      '0 0 90px rgba(255,255,255,0.08)',
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
        // Incoming fades in slightly slower than outgoing fades out, so both
        // words are visible together for ~0.7s — a pronounced cross-fade.
        if (incomingRef.current) {
          gsap.fromTo(
            incomingRef.current,
            { opacity: 0 },
            { opacity: 1, duration: 1.5, ease: 'power3.inOut', overwrite: true }
          );
        }
        if (outgoingRef.current) {
          gsap.to(outgoingRef.current, { opacity: 0, duration: 1.3, ease: 'power3.inOut', overwrite: true });
        }
      });
    }, 110);

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

const sectionCardStyle: CSSProperties = {
  display: 'inline-flex',
  flexDirection: 'column',
  alignSelf: 'flex-start',
  maxWidth: '400px',
  padding: '1.8rem 2rem 2rem',
};

/* ── Shared text styles ──────────────────────────── */

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontFamily: SANS,
  fontSize: '0.75rem',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'rgba(26,26,22,0.38)',
  marginBottom: '0.45rem',
};

const headingStyle: React.CSSProperties = {
  fontFamily: SERIF,
  fontStyle: 'italic',
  fontWeight: 400,
  margin: '0 0 0.3rem',
  fontSize: 'clamp(3rem, 5.5vw, 5rem)',
  lineHeight: 1.04,
  color: '#1a1a16',
  letterSpacing: '-0.005em',
};

const bodyStyle: React.CSSProperties = {
  fontFamily: BODY,
  margin: '0 0 0.3rem',
  fontSize: '1.05rem',
  lineHeight: 1.6,
  color: 'rgba(26,26,22,0.5)',
  maxWidth: '340px',
};

const numberStyle: React.CSSProperties = {
  fontFamily: SERIF,
  fontStyle: 'italic',
  fontWeight: 700,
  fontSize: 'clamp(3.5rem, 6.5vw, 6rem)',
  lineHeight: 1.04,
  letterSpacing: '-0.005em',
  fontVariantNumeric: 'tabular-nums',
  display: 'inline-block',
};

/* ── Mobile-tightened text styles ─────────────────
 *
 * On a real iPhone the visible viewport is ~180pt smaller than what Playwright
 * shows, because Safari's URL bar and bottom toolbar each eat into 100dvh.
 * The full-size heading + description + amount exceed the upper-half budget
 * and start drifting into the model's territory. These compact variants keep
 * text inside the upper third so the 3D model below has room to breathe.
 */
const mobileHeadingStyle: React.CSSProperties = {
  ...headingStyle,
  fontSize: 'clamp(1.9rem, 7.4vw, 2.6rem)',
};
const mobileBodyStyle: React.CSSProperties = {
  ...bodyStyle,
  fontSize: '0.92rem',
  lineHeight: 1.5,
};
const mobileNumberStyle: React.CSSProperties = {
  ...numberStyle,
  fontSize: 'clamp(2.2rem, 8.4vw, 3rem)',
};

function makeSectionStyle(isMobile: boolean): CSSProperties {
  return {
    height: '100svh',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: isMobile ? 'flex-start' : 'center',
    // Mobile header stack: progress pill (top ~46px) → logo (32px, 12px gap)
    // → section text. 112px clears both with breathing room above the title.
    paddingTop: isMobile ? 'calc(env(safe-area-inset-top) + 112px)' : 0,
    paddingLeft: isMobile ? '6vw' : '6vw',
    paddingRight: isMobile ? '6vw' : 0,
    maxWidth: isMobile ? '100vw' : '52vw',
  };
}

function makeExpenseSectionStyle(isMobile: boolean): CSSProperties {
  return makeSectionStyle(isMobile);
}

/* ── Small controls ──────────────────────────────── */

function Slider({
  value, min, max, step, onChange, suffix = '',
}: {
  value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; suffix?: string;
}) {
  const fillPct = `${Math.round(((value - min) / (max - min)) * 100)}%`;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 340, marginTop: '0.9rem' }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        fontFamily: SANS,
        fontVariantNumeric: 'tabular-nums',
      }}>
        <span style={{ fontSize: '0.78rem', fontWeight: 500, color: 'rgba(26,26,22,0.75)' }}>
          £{value.toLocaleString()}{suffix}
        </span>
        <span style={{ fontSize: '0.6rem', color: 'rgba(26,26,22,0.35)' }}>
          £{min.toLocaleString()} – £{max.toLocaleString()}{suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={expStyles.slider}
        style={{ '--fill': fillPct } as React.CSSProperties}
      />
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
      alignSelf: 'flex-start',
      gap: 4,
      background: 'rgba(26,26,22,0.04)',
      border: '1px solid rgba(26,26,22,0.1)',
      borderRadius: 8,
      padding: 3,
      marginTop: '0.9rem',
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
          format={(v) => v}
          onChange={(v) => onOverride({ councilBand: v })} />;
      default:
        return null;
    }
  })();

  const description =
    mode === 'custom' && expense.descriptionCustom
      ? expense.descriptionCustom
      : expense.description;

  // Mobile uses the compact text scale; desktop keeps the original sizing
  // (with the rent-specific shrink so "Rent / Mortgage" still fits its row).
  // NI's label is "National Insurance" — too wide for a single line on the
  // desktop card, so it skips whiteSpace:nowrap and stays on the constrained
  // 400px card so it wraps cleanly to two lines.
  const heading = isMobile
    ? { ...mobileHeadingStyle, margin: '0 0 0.3rem' }
    : {
        ...headingStyle,
        margin: '0 0 0.3rem',
        ...(expense.kind === 'ni' ? {} : { whiteSpace: 'nowrap' as const }),
        ...(expense.kind === 'rent' && { fontSize: 'clamp(2.6rem, 4.6vw, 4.4rem)' }),
      };
  const body = isMobile ? mobileBodyStyle : bodyStyle;
  const number = isMobile ? mobileNumberStyle : numberStyle;
  const card = isMobile
    ? { ...sectionCardStyle, maxWidth: 'none', padding: '1.2rem 0 1.5rem' }
    : (expense.kind === 'ni' ? sectionCardStyle : { ...sectionCardStyle, maxWidth: 'none' });
  const monthSuffixSize = isMobile ? '0.78rem' : '0.95rem';

  return (
    <div id={expense.id} style={makeExpenseSectionStyle(isMobile)}>
      <div data-section-card style={card}>
        <h1 style={heading}>{expense.label}</h1>
        <p style={body}>{description}</p>
        <span style={{
          ...number,
          color: '#8b2216',
          marginTop: 0,
          whiteSpace: 'nowrap',
        }}>
          − £{expense.amount.toLocaleString()}
          <span style={{
            fontFamily: BODY,
            fontStyle: 'normal',
            fontWeight: 400,
            fontSize: monthSuffixSize,
            letterSpacing: 0,
            color: 'rgba(26,26,22,0.45)',
            marginLeft: 10,
            verticalAlign: 'middle',
            whiteSpace: 'nowrap',
          }}>/month</span>
          {expense.derived && (
            <span style={{
              fontFamily: SANS,
              fontStyle: 'normal',
              fontWeight: 400,
              fontSize: '0.7rem',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'rgba(26,26,22,0.35)',
              marginLeft: 10,
              verticalAlign: 'middle',
            }}>(auto)</span>
          )}
        </span>
        {control}
      </div>
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
      display: 'inline-flex',
      alignSelf: 'flex-start',
      background: 'rgba(26,26,22,0.06)',
      border: '1px solid rgba(26,26,22,0.12)',
      borderRadius: 999,
      padding: 3,
    }}>
      <button type="button" style={btn(mode === 'average')} onClick={() => onChange('average')}>Average</button>
      <button type="button" style={btn(mode === 'custom')}  onClick={() => onChange('custom')}>Custom</button>
    </div>
  );
}

/* ── Scroll hint ─────────────────────────────────── */

function ScrollHint() {
  const [scrolling, setScrolling] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onScroll = () => {
      setScrolling(true);
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => setScrolling(false), 800);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, []);

  return (
    <>
      <style>{`
        @keyframes _arrowBounce {
          0%, 100% { transform: translateY(0);   opacity: 1;   }
          50%       { transform: translateY(5px); opacity: 0.5; }
        }
      `}</style>
      <div
        aria-hidden
        style={{
          position: 'fixed',
          bottom: 56, left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 200,
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: '0.3rem',
          color: 'rgba(26,26,22,0.65)',
          fontFamily: SANS,
          fontSize: '0.6rem',
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          pointerEvents: 'none',
          padding: '0.4rem 0.8rem',
          opacity: scrolling ? 0 : 1,
          transition: 'opacity 0.45s ease',
          textShadow: '0 1px 6px rgba(255,255,255,0.55)',
        }}
      >
        <span style={{ opacity: 0.8 }}>Scroll</span>
        <span style={{
          fontSize: '1rem',
          animation: scrolling ? 'none' : '_arrowBounce 1.5s ease-in-out infinite',
          display: 'block',
        }}>↓</span>
      </div>
    </>
  );
}

/* ── Back-to-top + undo ──────────────────────────── */

const UNDO_MS = 4500;

function BackToTopButton({ lenisRef }: { lenisRef: React.RefObject<Lenis | null> }) {
  const [visible,  setVisible]  = useState(false);
  const [showUndo, setShowUndo] = useState(false);
  const savedY  = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Show after scrolling past 60 % of the first viewport
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > window.innerHeight * 0.6);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Auto-dismiss undo if the user scrolls away from top themselves
  useEffect(() => {
    if (!showUndo) return;
    const onScroll = () => {
      if (window.scrollY > 100) dismiss();
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showUndo]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  function dismiss() {
    setShowUndo(false);
    if (timerRef.current) clearTimeout(timerRef.current);
  }

  const goTop = () => {
    savedY.current = window.scrollY;
    setShowUndo(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    lenisRef.current?.scrollTo(0, {
      duration: 1.1,
      easing: (t: number) => 1 - Math.pow(1 - t, 3),
    });
    timerRef.current = setTimeout(dismiss, UNDO_MS);
  };

  const undo = () => {
    lenisRef.current?.scrollTo(savedY.current, { duration: 1.0 });
    dismiss();
  };

  const btnBase: React.CSSProperties = {
    fontFamily: SANS,
    fontSize: '0.72rem',
    letterSpacing: '0.05em',
    padding: '0.38rem 0.85rem',
    borderRadius: 999,
    cursor: 'pointer',
    display: 'block',
    whiteSpace: 'nowrap',
  };

  return (
    <>
      <style>{`
        @keyframes _drainBar {
          from { transform: scaleX(1); }
          to   { transform: scaleX(0); }
        }
      `}</style>

      <div style={{
        position: 'fixed',
        // Sit 12px above the SoundToggle (bottom:24px + ~36px tall + 12px gap)
        bottom: '4.8rem',
        left: '1.5rem',
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: '0.45rem',
      }}>

        {/* Undo chip — dark, inverted, appears immediately after going to top */}
        <div style={{
          opacity: showUndo ? 1 : 0,
          transform: showUndo ? 'translateY(0) scale(1)' : 'translateY(5px) scale(0.96)',
          transition: 'opacity 0.18s ease, transform 0.18s ease',
          pointerEvents: showUndo ? 'auto' : 'none',
        }}>
          <button
            onClick={undo}
            style={{
              ...btnBase,
              paddingBottom: '0.52rem',
              border: '1px solid rgba(26,26,22,0.35)',
              background: 'rgba(26,26,22,0.88)',
              color: 'rgba(242,235,224,0.9)',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            ↩ Go back
            {/* Countdown drain bar */}
            {showUndo && (
              <span style={{
                position: 'absolute',
                bottom: 0, left: 0,
                height: 2,
                width: '100%',
                background: 'rgba(242,235,224,0.28)',
                transformOrigin: 'left center',
                animation: `_drainBar ${UNDO_MS}ms linear forwards`,
              }} />
            )}
          </button>
        </div>

        {/* Back-to-top pill — hides while undo is showing (already at top) */}
        <div style={{
          opacity: visible && !showUndo ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(6px)',
          transition: 'opacity 0.28s ease, transform 0.28s ease',
          pointerEvents: visible && !showUndo ? 'auto' : 'none',
        }}>
          <button
            onClick={goTop}
            style={{
              ...btnBase,
              fontSize: '0.78rem',
              padding: '0.45rem 1rem',
              border: '1px solid rgba(26,26,22,0.4)',
              background: 'rgba(26,26,22,0.78)',
              color: 'rgba(242,235,224,0.92)',
            }}
          >
            ↑ Back to top
          </button>
        </div>

      </div>
    </>
  );
}

/* ── Main page ───────────────────────────────────── */

export default function MainExperience() {
  // BG matches the outer stop of the radial gradient so iOS rubber-band past
  // the page edges stays in family. theme-color is the gradient's mid-tone —
  // that's what the user actually sees behind the URL bar at the top of the
  // viewport, so the Safari chrome tint reads as a continuation of the page.
  usePageBackground('#a4acb8', '#cdd1d8');
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

  const lenisRef = useRef<Lenis | null>(null);

  // Boot Lenis smooth scroll on desktop only. On touch devices Lenis intercepts
  // touch events and re-animates them, which fights iOS's well-tuned momentum
  // scroll and shows up as visible input lag. Native scroll is already silky
  // smooth on phones — we just opt out and let the OS do its job.
  useEffect(() => {
    if (isMobile) return;
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    });
    lenisRef.current = lenis;

    lenis.on('scroll', ScrollTrigger.update);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);

    return () => {
      gsap.ticker.remove(tick);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, [isMobile]);

  // Track which section is currently active → drives which 3D model + ambient word are shown.
  const [activeKind, setActiveKind] = useState<string>('section-income');
  const [activeWord, setActiveWord] = useState<string>('INCOME');

  // Progress-bar state — the bar is a dumb visualization of these two values.
  const [barRemaining, setBarRemaining] = useState<number>(income);
  const [barChip, setBarChip] = useState<string | null>(null);

  // Vertical world-space gap between consecutive models. On mobile we offset
  // models down (so each active model lives in the bottom half) which means
  // the previous model creeps into the top of the viewport — bumping the step
  // keeps neighbours fully off-screen.
  const MODEL_Y_STEP = isMobile ? 8 : 5;

  const sections = useMemo(() => [
    { id: 'section-income',    word: 'INCOME', amount: income },
    ...expenses.map(e => ({ id: e.id, word: KIND_WORD[e.kind], amount: e.amount })),
    { id: 'section-remaining', word: 'LEFT',   amount: netRemaining },
  ], [expenses, income, netRemaining]);

  useEffect(() => {

    let lastIndex = -1;
    // Single ScrollTrigger reading actual DOM position each tick — avoids
    // missed/out-of-order onEnter events on fast-fling scrolls.
    const trigger = ScrollTrigger.create({
      trigger: '#main-scroll-container',
      start: 'top top',
      end: 'bottom bottom',
      // No snap — Lenis owns the scroll. Snap-on-stop was the source of the
      // perceived jitter (snap fights user input + Lenis inertia).
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
          setActiveKind(sections[active].id);
          setActiveWord(sections[active].word);
        }
      },
    });

    return () => trigger.kill();
  }, [sections]);

  // Snap to nearest section on scroll idle.
  useEffect(() => {
    const sectionIds = sections.map(s => s.id);
    let snapping = false;

    function getNearestSectionTop(): { top: number; dist: number } {
      const viewCenter = window.scrollY + window.innerHeight / 2;
      let bestTop = 0;
      let bestDist = Infinity;
      for (const id of sectionIds) {
        const el = document.getElementById(id);
        if (!el) continue;
        const elTop = window.scrollY + el.getBoundingClientRect().top;
        const elCenter = elTop + window.innerHeight / 2;
        const dist = Math.abs(elCenter - viewCenter);
        if (dist < bestDist) { bestDist = dist; bestTop = elTop; }
      }
      return { top: bestTop, dist: bestDist };
    }

    function snapToNearest() {
      if (snapping) return;
      const { top, dist } = getNearestSectionTop();
      if (dist < 4) return; // already snapped — avoid re-triggering
      snapping = true;
      const lenis = lenisRef.current;
      if (lenis) {
        lenis.scrollTo(Math.round(top), {
          duration: 1.0,
          easing: (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
        });
      } else {
        window.scrollTo({ top: Math.round(top), behavior: 'smooth' });
      }
      setTimeout(() => { snapping = false; }, 1300);
    }

    window.addEventListener('scrollend', snapToNearest);
    return () => window.removeEventListener('scrollend', snapToNearest);
  }, [sections]);

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
        // Earlier trigger point → bar starts decrementing while the previous
        // section is still partly visible, overlapping the two states.
        start: 'top 70%',
        onEnter:     () => { setBarRemaining(remainingAfter);  setBarChip(label); },
        onLeaveBack: () => { setBarRemaining(remainingBefore); setBarChip(null); },
      }));
    }

    return () => triggers.forEach(t => t.kill());
  }, [income, expenses]);

  // Card reveals are scroll-driven, not state-driven. Each card's opacity/y
  // is a function of its section's scroll progress: scrubbed in as the section
  // enters the viewport, scrubbed in reverse when the user scrolls back. This
  // is what makes fast scroll + reverse scroll smooth — no overlapping tweens
  // from rapid `activeKind` changes, no flicker on direction reversal.
  useLayoutEffect(() => {
    const tweens: gsap.core.Tween[] = [];

    sections.forEach((section, i) => {
      const card = document.querySelector(`#${section.id} [data-section-card]`);
      if (!card) return;
      const children = Array.from(card.children);

      if (i === 0) {
        // First section is on screen at mount — fade in once.
        gsap.set(children, { opacity: 0, y: 28 });
        tweens.push(
          gsap.to(children, {
            opacity: 1, y: 0,
            stagger: 0.09, duration: 0.85, ease: 'power3.out', delay: 0.3,
          }),
        );
        return;
      }

      // Hidden until its section starts entering the viewport.
      gsap.set(children, { opacity: 0, y: 28 });
      tweens.push(
        gsap.to(children, {
          opacity: 1, y: 0,
          stagger: 0.05,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: `#${section.id}`,
            start: 'top 65%',
            end: 'top 25%',
            scrub: 0.3,
            invalidateOnRefresh: true,
          },
        }),
      );
    });

    return () => {
      tweens.forEach((t) => {
        (t.scrollTrigger as ScrollTrigger | undefined)?.kill();
        t.kill();
      });
    };
  }, [sections]);

  const handleOverride = (patch: ExpenseOverrides) =>
    setOverrides((prev) => ({ ...prev, ...patch }));

  return (
    <div style={{
      background: 'radial-gradient(ellipse 80% 70% at 50% 42%, #e6e8eb 0%, #cdd1d8 40%, #b8bfc8 80%, #a4acb8 100%)',
      fontFamily: SANS,
      position: 'relative',
    }}>

      {/* GridBackground runs a canvas2d RAF loop that re-strokes the entire
       *  grid every frame — wasteful on mobile (no cursor, no glow). Skipped
       *  there. The radial gradient on the page wrapper carries enough
       *  atmosphere on its own. */}
      {!isMobile && <GridBackground variant="experience" zIndex={0} />}

      {/* The animated cloud blobs are lovely on desktop but mobile GPUs run
       *  CSS filter:blur on huge fixed elements as a software fallback. Skip
       *  them on phones; the page still reads as moody from the gradient +
       *  particles + grain alone. */}
      {!isMobile && <BackgroundAtmosphere isMobile={isMobile} />}

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

      {/* Logo */}
      <Link to="/" className={expStyles.logoWrap}>
        <div className={expStyles.logoMask} />
      </Link>

      <ScrollHint />

      <BudgetProgressBar income={income} remaining={barRemaining} chipLabel={barChip} />
      <BackToTopButton lenisRef={lenisRef} />

      {/* Ambient blurred word — deepest layer, sits behind particles + 3D */}
      <AmbientWord word={activeWord} isMobile={isMobile} />

      {/* Particles — dedicated canvas at zIndex 1, always behind the 3D model */}
      <ParticleBackdrop isMobile={isMobile} />

      {/* Fixed 3-D canvas — all models at their section Y positions.
          On mobile, every model is offset downward so the active one sits in
          the lower half of the viewport, leaving the top half for the text.
          `100dvh` lets the canvas track Safari's URL bar as it shows/hides;
          `100svh` would leave a gap at the bottom that crops the model when
          the chrome retracts on scroll. */}
      <div style={{ width: '100vw', height: '100dvh', position: 'fixed', top: 0, left: 0, zIndex: 2 }}>
        <Canvas
          camera={{ position: [0, 0, 8], fov: 50 }}
          // Mobile GPUs choke on 1.5+ DPR with two canvases plus heavy CSS
          // compositing. 1.25 keeps the hologram crisp without melting frames.
          dpr={[1, isMobile ? 1.25 : 2]}
          gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
        >
          <fog attach="fog" args={['#c8cdd6', 6, 22]} />
          <ambientLight intensity={1.1} color="#f0f2f6" />
          <directionalLight position={[10, 10, 10]} intensity={1.0} />
          <CameraAnimator totalY={MODEL_Y_STEP * (sections.length - 1)} />
          <HologramTimeAnimator />
          <MouseInfluenceTracker />
          <AllHologramScenes
            sections={sections}
            step={MODEL_Y_STEP}
            activeId={activeKind}
            // Mobile pushes the model into the lower portion of the canvas so
            // the text card up top can breathe. With the compact mobile text
            // styles (mobileHeadingStyle/etc.) the upper third stops at ~30%
            // of dvh, so -1.6 puts the model centre at ~62% — plenty of clear
            // space above (no overlap with descriptions like "National
            // Insurance") and ~60pt clearance below before Safari's toolbar.
            yOffset={isMobile ? -1.6 : 0}
          />
        </Canvas>
      </div>

      {/* HTML scroll container */}
      <div id="main-scroll-container" style={{ position: 'relative', zIndex: 10, width: '100%' }}>

        {/* Income intro — keep the original (pre-pill) top padding so the
            opening "Starting with £X,XXX" sits where it always did. */}
        <div id="section-income" style={{ ...sectionStyle, paddingTop: isMobile ? '14vh' : 0 }}>
          <div data-section-card style={isMobile ? { ...sectionCardStyle, padding: '1.2rem 0 1.5rem' } : sectionCardStyle}>
            <span style={labelStyle}>Your income</span>
            <h1 style={{
              ...(isMobile ? mobileHeadingStyle : headingStyle),
              margin: '0 0 1.4rem',
              fontSize: isMobile ? 'clamp(1.6rem, 6vw, 2.1rem)' : 'clamp(2rem, 3.8vw, 3.6rem)',
            }}>
              <span style={{ display: 'block', lineHeight: 1, marginBottom: '0.15rem' }}>
                Starting with
              </span>
              <span style={{ ...(isMobile ? mobileNumberStyle : numberStyle), color: '#1c4d2e', display: 'inline-block' }}>
                £{income.toLocaleString()}
              </span>
            </h1>
            <p style={{ ...(isMobile ? mobileBodyStyle : bodyStyle), margin: '0 0 1rem' }}>
              {mode === 'average'
                ? 'Scroll to see where it goes, one line at a time.'
                : "You're in custom mode. Adjust the sliders as you scroll."}
            </p>
            <ModeToggle mode={mode} onChange={setMode} />
          </div>
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
          <div data-section-card style={isMobile ? { ...sectionCardStyle, padding: '1.2rem 0 1.5rem' } : sectionCardStyle}>
            <span style={labelStyle}>What's left</span>
            <h1 style={{
              ...(isMobile ? mobileHeadingStyle : headingStyle),
              margin: '0 0 0.3rem',
              fontSize: isMobile ? 'clamp(1.9rem, 7.4vw, 2.6rem)' : 'clamp(2.4rem, 4.6vw, 4rem)',
            }}>
              {/* Non-breaking space keeps "The bottom" on one line at every viewport,
                  even inside the 400px section card. */}
              The{' '}bottom<br />
              <span style={{
                position: 'relative',
                display: 'inline-block',
                paddingBottom: '0.08em',
              }}>
                line
                <span aria-hidden="true" style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: 2,
                  background: 'currentColor',
                  opacity: 0.55,
                }} />
              </span>
              .
            </h1>
            <p style={{ ...(isMobile ? mobileBodyStyle : bodyStyle), margin: '0 0 0.2rem' }}>
              After your expenses, you're left with
            </p>
            <span style={{
              ...(isMobile ? mobileNumberStyle : numberStyle),
              color: netRemaining < 0 ? '#8b2216' : '#1c442a',
              whiteSpace: 'nowrap',
            }}>
              £{netRemaining.toLocaleString()}
              <span style={{
                fontFamily: BODY,
                fontStyle: 'normal',
                fontWeight: 400,
                fontSize: isMobile ? '0.78rem' : '0.95rem',
                letterSpacing: 0,
                color: 'rgba(26,26,22,0.45)',
                marginLeft: 10,
                verticalAlign: 'middle',
                whiteSpace: 'nowrap',
              }}>
                /month
              </span>
            </span>
            <button
              type="button"
              onClick={() => navigate('/affordability', { state: { income, monthlyRemaining: netRemaining } })}
              style={{
                marginTop: isMobile ? '1.1rem' : '1.4rem',
                alignSelf: 'flex-start',
                fontFamily: SANS,
                fontSize: isMobile ? '0.78rem' : '0.82rem',
                padding: isMobile ? '0.6rem 1.05rem' : '0.7rem 1.2rem',
                border: '1px solid #1c4d2e',
                borderRadius: 999,
                background: '#1c4d2e',
                color: '#f2ebe0',
                cursor: 'pointer',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              See what's in reach →
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
