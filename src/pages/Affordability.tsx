import { useEffect, useRef, useMemo, useState, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import * as THREE from 'three';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const SERIF = "'Instrument Serif', 'Cormorant Garamond', serif";
const SANS  = "'Manrope', system-ui, sans-serif";
const BODY  = "'Lato', system-ui, sans-serif";
const BG    = '#f2ebe0';
const DARK  = '#1a1a16';

type Goal = { id: string; label: string; group: string; price: number };
type GoalData = { goal: Goal; years: number; xPos: number; above: boolean };

const GOALS: Goal[] = [
  { id: 'holiday', label: 'Two-week holiday',  group: 'A break',             price: 3_000   },
  { id: 'car',     label: 'A used car',         group: 'Getting around',      price: 12_000  },
  { id: 'flat',    label: '1-bed flat',          group: 'A place of your own', price: 230_000 },
  { id: 'house',   label: '3-bed house',         group: 'A family home',       price: 330_000 },
];

const WORLD_SPAN = 16;
const CAM_START  = -1.5;
const CAM_END    = WORLD_SPAN + 0.8;
const CAM_Z      = 8;
const CAM_FOV    = 52;
const STEM_H     = 1.55;
const CARD_Y     = STEM_H + 0.45;

// How many world-units of camera travel it takes to fully reveal a goal
const REVEAL_DIST = 2.0;
// Right-edge offset: how far past the camera centre the "reveal trigger" fires
const CAM_HALF_W  = 5.8;

function formatYears(y: number): string {
  if (!isFinite(y) || y <= 0) return '∞';
  if (y < 1) { const m = Math.max(1, Math.round(y * 12)); return `${m} mo`; }
  if (y < 10)  return `${y.toFixed(1)} yr`;
  if (y < 100) return `${Math.round(y)} yr`;
  return `${Math.round(y).toLocaleString()}+ yr`;
}

// ── Soft-dot particle texture ─────────────────────────────────────────────

function makeDotTexture(): THREE.CanvasTexture {
  const s = 32;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(s/2, s/2, 0, s/2, s/2, s/2);
  g.addColorStop(0,    'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.85)');
  g.addColorStop(1,    'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  return tex;
}

const VERT = /* glsl */`
  attribute float aPhase;
  attribute float aIntensity;
  uniform float uTime;
  uniform float uSize;
  varying float vAlpha;
  void main() {
    // Sway baked into the vertex shader so the field stays alive without
    // paying for a 420-element JS loop + buffer re-upload every frame.
    vec3 pos = position;
    pos.x += sin(uTime * 0.40 + aPhase)        * 0.055;
    pos.y += cos(uTime * 0.35 + aPhase * 1.3)  * 0.055;

    float pulse = 0.45 + 0.55 * sin(uTime * 0.45 + aPhase);
    vAlpha = aIntensity * pulse;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = uSize;
  }
`;

const FRAG = /* glsl */`
  uniform sampler2D uTex;
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vAlpha;
  void main() {
    vec4 t = texture2D(uTex, gl_PointCoord);
    float a = t.a * uOpacity * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor, a);
  }
`;

const P_COUNT_DESKTOP = 420;
const P_COUNT_MOBILE  = 200;
const P_VX = 38;
const P_VY = 18;

function ParticleLayer({ count }: { count: number }) {
  const groupRef = useRef<THREE.Group>(null);
  const texture  = useMemo(makeDotTexture, []);

  const { positions, phases, intensities } = useMemo(() => {
    const cols = Math.round(Math.sqrt(count * P_VX / P_VY));
    const rows = Math.ceil(count / cols);
    const cw = P_VX / cols, ch = P_VY / rows;
    const pos = new Float32Array(count * 3);
    const ph  = new Float32Array(count);
    const it  = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const cx = i % cols, cy = Math.floor(i / cols);
      pos[i*3]   = -P_VX/2 + (cx + 0.5 + (Math.random()-.5)*.7) * cw;
      pos[i*3+1] = -P_VY/2 + (cy + 0.5 + (Math.random()-.5)*.7) * ch;
      pos[i*3+2] = -0.4;
      ph[i] = Math.random() * Math.PI * 2;
      it[i] = Math.random() < 0.2 ? 0.82 + Math.random()*.18 : 0.28 + Math.random()*.38;
    }
    return { positions: pos, phases: ph, intensities: it };
  }, [count]);

  const uniforms = useMemo(() => ({
    uTime:    { value: 0 },
    uTex:     { value: texture },
    uColor:   { value: new THREE.Color('#2a2a24') },
    uOpacity: { value: 1.0 },
    uSize:    { value: 3.8 },
  }), [texture]);

  useFrame(({ camera, clock }) => {
    if (groupRef.current) {
      groupRef.current.position.x = camera.position.x * 0.5;
    }
    uniforms.uTime.value = clock.elapsedTime;
    // Per-particle sway is now in the vertex shader — no JS loop needed.
  });

  return (
    <group ref={groupRef}>
      <points renderOrder={-1}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position"   args={[positions, 3]} />
          <bufferAttribute attach="attributes-aPhase"     args={[phases, 1]}    />
          <bufferAttribute attach="attributes-aIntensity" args={[intensities, 1]} />
        </bufferGeometry>
        <shaderMaterial
          uniforms={uniforms}
          vertexShader={VERT}
          fragmentShader={FRAG}
          transparent
          depthWrite={false}
        />
      </points>
    </group>
  );
}

// ── Camera ────────────────────────────────────────────────────────────────

function CameraAnimator() {
  const { camera } = useThree();

  useEffect(() => {
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: '#afford-scroll',
        start: 'top top',
        end:   'bottom bottom',
        scrub: 1.5,
      },
    });
    tl.fromTo(camera.position, { x: CAM_START }, { x: CAM_END, ease: 'none' });

    return () => {
      (tl.scrollTrigger as ScrollTrigger | undefined)?.kill();
      tl.kill();
    };
  }, [camera]);

  useFrame(({ camera }) => {
    camera.lookAt(camera.position.x, 0, 0);
  });

  return null;
}

// ── Today marker ─────────────────────────────────────────────────────────

function TodayMarker() {
  return (
    <group position={[0, 0, 0]}>
      <mesh>
        <sphereGeometry args={[0.045, 12, 12]} />
        <meshBasicMaterial color={DARK} transparent opacity={0.45} />
      </mesh>
      <mesh position={[0, -(STEM_H * 0.5), 0]}>
        <boxGeometry args={[0.003, STEM_H, 0.003]} />
        <meshBasicMaterial color={DARK} transparent opacity={0.12} />
      </mesh>
      <Html center position={[0, -(CARD_Y - 0.3), 0]} style={{ pointerEvents: 'none' }}>
        <div style={{
          fontFamily: SANS, fontSize: 9, letterSpacing: '0.14em',
          textTransform: 'uppercase', color: 'rgba(26,26,22,0.4)',
          textAlign: 'center', whiteSpace: 'nowrap', userSelect: 'none',
        }}>
          Today
        </div>
      </Html>
    </group>
  );
}

// ── Goal marker — fades in as camera right-edge crosses its xPos ──────────

function GoalMarker({ gd }: { gd: GoalData }) {
  const { goal, years, xPos, above } = gd;
  const isOk     = isFinite(years) && years > 0;
  const numColor = isOk ? DARK : '#8b2216';
  const yStem    = above ?  STEM_H / 2 : -STEM_H / 2;
  const yCard    = above ?  CARD_Y     : -CARD_Y;

  const dotRef   = useRef<THREE.Mesh>(null);
  const stemRef  = useRef<THREE.Mesh>(null);
  const labelRef = useRef<HTMLDivElement>(null);

  useFrame(({ camera }) => {
    // t = 0 when goal just enters right edge, 1 when camera has passed REVEAL_DIST beyond
    const t = THREE.MathUtils.clamp(
      (camera.position.x + CAM_HALF_W - xPos) / REVEAL_DIST,
      0, 1,
    );
    const eased = t * t * (3 - 2 * t); // smoothstep

    if (dotRef.current) {
      (dotRef.current.material as THREE.MeshBasicMaterial).opacity = eased;
    }
    if (stemRef.current) {
      (stemRef.current.material as THREE.MeshBasicMaterial).opacity = eased * 0.18;
    }
    if (labelRef.current) {
      labelRef.current.style.opacity = String(eased);
      // Slide in from right as it reveals
      labelRef.current.style.transform = `translateX(${(1 - eased) * 18}px)`;
    }
  });

  return (
    <group position={[xPos, 0, 0]}>
      <mesh ref={dotRef}>
        <sphereGeometry args={[0.072, 12, 12]} />
        <meshBasicMaterial color={DARK} transparent opacity={0} />
      </mesh>
      <mesh ref={stemRef} position={[0, yStem, 0]}>
        <boxGeometry args={[0.004, STEM_H, 0.004]} />
        <meshBasicMaterial color={DARK} transparent opacity={0} />
      </mesh>
      <Html center position={[0, yCard, 0]} style={{ pointerEvents: 'none' }}>
        <div ref={labelRef} style={{
          width: 200, textAlign: 'center', userSelect: 'none',
          opacity: 0,
          willChange: 'opacity, transform',
        }}>
          <div style={{
            fontFamily: SANS, fontSize: 10, letterSpacing: '0.14em',
            textTransform: 'uppercase', color: 'rgba(26,26,22,0.42)',
            marginBottom: 8,
          }}>{goal.group}</div>
          <div style={{
            fontFamily: SERIF, fontStyle: 'italic', fontWeight: 400,
            fontSize: 21, color: DARK, lineHeight: 1.2, marginBottom: 12,
          }}>{goal.label}</div>
          <div style={{
            fontFamily: SERIF, fontStyle: 'italic', fontWeight: 400,
            fontSize: 48, color: numColor, lineHeight: 1,
            fontVariantNumeric: 'tabular-nums', marginBottom: 6,
          }}>{formatYears(years)}</div>
          <div style={{
            fontFamily: SANS, fontSize: 10, letterSpacing: '0.11em',
            textTransform: 'uppercase', color: 'rgba(26,26,22,0.36)',
            marginBottom: 9,
          }}>of saving everything</div>
          <div style={{
            fontFamily: SANS, fontSize: 12,
            color: 'rgba(26,26,22,0.32)',
          }}>£{goal.price.toLocaleString()}</div>
        </div>
      </Html>
    </group>
  );
}

// ── Scene ─────────────────────────────────────────────────────────────────

function Scene({ goalDatas, particleCount }: { goalDatas: GoalData[]; particleCount: number }) {
  const lineLen = CAM_END - CAM_START + 1;
  const lineMid = CAM_START + lineLen / 2;

  return (
    <>
      <ParticleLayer count={particleCount} />
      <CameraAnimator />

      {/* Horizontal timeline rule */}
      <mesh position={[lineMid, 0, 0]}>
        <boxGeometry args={[lineLen, 0.006, 0.006]} />
        <meshBasicMaterial color={DARK} transparent opacity={0.18} />
      </mesh>

      <TodayMarker />
      {goalDatas.map(gd => <GoalMarker key={gd.goal.id} gd={gd} />)}
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

const GRAIN = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.72' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)'/%3E%3C/svg%3E\")";

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

export default function Affordability() {
  const location = useLocation();
  const navigate = useNavigate();
  const income           = Number(location.state?.income)           || 3500;
  const monthlyRemaining = Number(location.state?.monthlyRemaining) || 0;
  const annualSavings    = monthlyRemaining * 12;
  const cantSave         = monthlyRemaining <= 0;
  const isMobile         = useIsMobile();

  const years = GOALS.map(g => cantSave ? Infinity : g.price / annualSavings);

  const finiteYears = years.filter(y => isFinite(y));
  const maxY        = finiteYears.length > 0 ? Math.max(...finiteYears) : 40;

  function posFromYears(y: number, i: number): number {
    if (!isFinite(y) || cantSave) {
      const s = WORLD_SPAN * 0.44;
      const e = WORLD_SPAN * 0.97;
      return s + (i / (GOALS.length - 1)) * (e - s);
    }
    if (y <= 0) return 1.5;
    return 1.5 + (Math.log1p(y) / Math.log1p(maxY)) * (WORLD_SPAN - 1.5);
  }

  const goalDatas: GoalData[] = GOALS.map((goal, i) => ({
    goal,
    years: years[i],
    xPos:  posFromYears(years[i], i),
    above: i % 2 === 0,
  }));

  // Fade out the intro caption and scroll cue in the first ~400px of scroll
  useEffect(() => {
    const targets = ['#afford-intro', '#afford-scroll-cue'];
    const tls = targets.map(id => {
      const el = document.querySelector(id);
      if (!el) return null;
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: '#afford-scroll',
          start: 'top top',
          end:   '+=420',
          scrub: 0.8,
        },
      });
      tl.to(el, { opacity: 0, y: -8, ease: 'none' });
      return tl;
    });
    return () => {
      tls.forEach(tl => {
        if (!tl) return;
        (tl.scrollTrigger as ScrollTrigger | undefined)?.kill();
        tl.kill();
      });
    };
  }, []);

  return (
    <div id="afford-scroll" style={{ height: '380vh', position: 'relative' }}>

      {/* Grain overlay */}
      <div style={{
        position: 'fixed', inset: 0,
        backgroundImage: GRAIN,
        backgroundRepeat: 'repeat', backgroundSize: '300px 300px',
        opacity: 0.045, pointerEvents: 'none', zIndex: 9999,
      }} />

      {/* Left gradient — prevents timeline labels from visually colliding with the header */}
      <div style={{
        position: 'fixed', top: 0, left: 0, bottom: 0,
        width: 'min(460px, 35vw)',
        background: `linear-gradient(to right, ${BG} 45%, rgba(242,235,224,0) 100%)`,
        pointerEvents: 'none',
        zIndex: 60,
      }} />

      {/* Back */}
      <div style={{ position: 'fixed', top: 24, left: 24, zIndex: 200 }}>
        <Link to="/3d-experience" style={{
          fontFamily: SANS, fontSize: '0.8rem',
          color: 'rgba(26,26,22,0.5)', textDecoration: 'none',
          border: '1px solid rgba(26,26,22,0.15)', borderRadius: 6,
          padding: '0.38rem 0.9rem', background: 'rgba(242,235,224,0.75)',
        }}>← Back to budget</Link>
      </div>

      {/* Header */}
      <div style={{
        position: 'fixed',
        top: isMobile ? '5rem' : 'clamp(3rem, 6vw, 5rem)',
        left: isMobile ? '1.4rem' : 'clamp(1.4rem, 6vw, 4rem)',
        zIndex: 100, maxWidth: 520,
      }}>
        <span style={{
          display: 'block', fontFamily: SANS, fontSize: isMobile ? '0.65rem' : '0.75rem',
          letterSpacing: '0.13em', textTransform: 'uppercase',
          color: 'rgba(26,26,22,0.45)', marginBottom: isMobile ? '0.6rem' : '1rem',
        }}>If you save what's left</span>

        {/* Large money figure */}
        <div style={{
          fontFamily: SERIF, fontStyle: 'italic', fontWeight: 400,
          fontSize: isMobile ? 'clamp(2.8rem, 14vw, 4rem)' : 'clamp(4rem, 9vw, 6.5rem)',
          lineHeight: 0.88, letterSpacing: '-0.025em',
          color: cantSave ? '#8b2216' : '#1c4d2e',
          marginBottom: '0.5rem',
        }}>
          £{Math.max(0, monthlyRemaining).toLocaleString()}
        </div>

        {/* "a month" label */}
        <div style={{
          fontFamily: SERIF, fontStyle: 'italic', fontWeight: 400,
          fontSize: isMobile ? '1.2rem' : 'clamp(1.5rem, 2.8vw, 2.2rem)',
          color: 'rgba(26,26,22,0.42)',
          lineHeight: 1,
          marginBottom: cantSave ? '1rem' : 0,
        }}>
          a month
        </div>

        {cantSave && (
          <p style={{
            fontFamily: BODY, fontSize: '0.84rem', lineHeight: 1.65,
            color: 'rgba(26,26,22,0.5)', margin: 0,
          }}>
            Nothing left to save. Every goal stays out of reach.
          </p>
        )}
      </div>

      {/* Intro caption — explains the mechanic, fades out on first scroll */}
      <div id="afford-intro" style={{
        position: 'fixed',
        bottom: isMobile ? '24%' : '34%',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 50,
        textAlign: 'center',
        pointerEvents: 'none',
        whiteSpace: isMobile ? 'normal' : 'nowrap',
        maxWidth: isMobile ? '85vw' : 'none',
      }}>
        <span style={{
          fontFamily: SANS, fontSize: '0.6rem',
          letterSpacing: '0.14em', textTransform: 'uppercase',
          color: 'rgba(26,26,22,0.28)',
          lineHeight: 1.6,
        }}>
          {isMobile
            ? 'Each dot is a milestone — the further right, the longer it takes'
            : 'Each dot is a milestone · the further right, the longer it takes'}
        </span>
      </div>

      {/* Footnote — desktop only; the bottom band is too tight on phones */}
      {!isMobile && (
        <div style={{
          /* Sit above the SoundToggle (bottom-left, ~30px tall + 24px gap). */
          position: 'fixed', bottom: '5rem', left: 'clamp(1.4rem, 6vw, 4rem)',
          zIndex: 100, maxWidth: 320,
        }}>
          <p style={{
            margin: 0, fontFamily: SANS, fontSize: '0.68rem',
            color: 'rgba(26,26,22,0.35)', lineHeight: 1.6,
          }}>
            Zero interest, zero inflation, nothing spent on yourself. The real numbers are worse.
          </p>
        </div>
      )}

      {/* Scroll cue — desktop only; intro caption already implies scroll on mobile */}
      {!isMobile && (
        <div id="afford-scroll-cue" style={{
          position: 'fixed', bottom: '2.4rem',
          left: '50%', transform: 'translateX(-50%)',
          zIndex: 100,
        }}>
          <span style={{
            fontFamily: SANS, fontSize: '0.62rem',
            letterSpacing: '0.12em', textTransform: 'uppercase',
            color: 'rgba(26,26,22,0.32)',
          }}>scroll →</span>
        </div>
      )}

      {/* Next page — center-aligned on mobile, right-aligned on desktop */}
      <div style={{
        position: 'fixed',
        bottom: '1.4rem',
        right: isMobile ? undefined : '2rem',
        left: isMobile ? '50%' : undefined,
        transform: isMobile ? 'translateX(-50%)' : undefined,
        zIndex: 100,
      }}>
        <button
          type="button"
          onClick={() => navigate('/spending-flow', { state: { income, monthlyRemaining } })}
          style={{
            fontFamily: SANS,
            fontSize: isMobile ? '0.76rem' : '0.82rem',
            padding: isMobile ? '0.6rem 1rem' : '0.7rem 1.2rem',
            border: '1px solid #1c4d2e', borderRadius: 999,
            background: '#1c4d2e', color: BG, cursor: 'pointer',
          }}
        >
          Now zoom out →
        </button>
      </div>

      {/* 3D canvas */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 1, background: BG }}>
        <Canvas
          camera={{ position: [CAM_START, 0, CAM_Z], fov: CAM_FOV }}
          dpr={[1, isMobile ? 1.5 : 2]}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
        >
          <Suspense fallback={null}>
            <Scene goalDatas={goalDatas} particleCount={isMobile ? P_COUNT_MOBILE : P_COUNT_DESKTOP} />
          </Suspense>
        </Canvas>
      </div>

    </div>
  );
}
