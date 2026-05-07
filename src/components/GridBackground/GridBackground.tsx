import { useEffect, useRef } from 'react';

type Variant = 'home' | 'experience';
type Layer = { spacing: number; parallax: number; alpha: number; glow: number };

const VARIANTS = {
  home: {
    layers: [{ spacing: 56, parallax: 0, alpha: 0.03, glow: 1.0 }] as Layer[],
    lineRGB: '26, 26, 22',
    glowRGB: '44, 106, 62',
    cursorEase: 0.10,
    scrollEase: 0.12,
    peakAlpha: 0.72,
    maxReach: 320,
    reachSpeed: 260,
    barrel: 0,
    mode: 'intersection' as const,
    sigmaPerp: 0,
    sigmaPara: 0,
  },
  experience: {
    layers: [
      { spacing: 96, parallax: 0.18, alpha: 0.065, glow: 1.3 },
      { spacing: 192, parallax: 0.42, alpha: 0.045, glow: 1.6 },
    ] as Layer[],
    lineRGB: '60, 70, 90',
    glowRGB: '52, 130, 74',
    cursorEase: 0.085,
    scrollEase: 0.075,
    peakAlpha: 0.58,
    maxReach: 500,
    reachSpeed: 180,
    barrel: 0.20,
    mode: 'sigma' as const,
    sigmaPerp: 170,
    sigmaPara: 420,
  },
};

// Per-line independent animation config. Each grid line endpoint gets its own
// copy so no two lines ever animate at the same pace or reach the same length.
interface LineCfg {
  maxFrac: number; // fraction of maxReach this end reaches (0.28–1.0)
  speed:   number; // exponential growth rate (2.0–8.0)
  delay:   number; // staggered activation delay within presence ramp (0–0.42)
  ampFrac: number; // breathing oscillation amplitude fraction (0.04–0.18)
  freq:    number; // breathing frequency Hz (0.18–0.90)
  phase:   number; // breathing phase offset radians (0–2π)
}

function mkLineCfg(): LineCfg {
  return {
    maxFrac: 0.28 + 0.72 * Math.random(),
    speed:   2.0  + 6.0  * Math.random(),
    delay:   0.42 * Math.random(),
    ampFrac: 0.04 + 0.14 * Math.random(),
    freq:    0.18 + 0.72 * Math.random(),
    phase:   Math.PI * 2 * Math.random(),
  };
}

// Translates the global presence (0→1) + elapsed time into a per-line reach
// in pixels. The delay staggers activation; the oscillation keeps lines moving
// even when the cursor is stationary.
function computeReach(c: LineCfg, presence: number, t: number, maxR: number): number {
  const localP = Math.max(0, (presence - c.delay) / Math.max(0.001, 1 - c.delay));
  const eased  = 1 - Math.exp(-localP * c.speed);
  const osc    = c.ampFrac * Math.sin(t * c.freq * Math.PI * 2 + c.phase) * eased;
  return maxR * c.maxFrac * Math.max(0, eased + osc);
}

function applyBarrel(px: number, py: number, w: number, h: number, k: number) {
  const nx = (2 * px - w) / w;
  const ny = (2 * py - h) / h;
  const r2 = nx * nx + ny * ny;
  const f = 1 + k * r2;
  return { x: ((nx * f + 1) / 2) * w, y: ((ny * f + 1) / 2) * h };
}

function addCurvedLine(
  ctx: CanvasRenderingContext2D,
  x0: number, y0: number,
  x1: number, y1: number,
  w: number, h: number,
  k: number,
  N = 14,
) {
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const p = applyBarrel(x0 + t * (x1 - x0), y0 + t * (y1 - y0), w, h, k);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
}

function drawTip(ctx: CanvasRenderingContext2D, x: number, y: number, alpha: number) {
  const r = 5;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(255,255,255,${alpha.toFixed(3)})`);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

export function GridBackground({ variant = 'home', zIndex = 0 }: { variant?: Variant; zIndex?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cfg = VARIANTS[variant];
    const k = cfg.barrel;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const target = { x: -9999, y: -9999, active: false };
    const smooth = { x: -9999, y: -9999 };
    let scrollY = window.scrollY;
    let smoothScroll = scrollY;
    let w = 0, h = 0;

    // Per-line config maps keyed by integer grid index.
    // Each vertical line gets [upCfg, downCfg]; each horizontal gets [leftCfg, rightCfg].
    const vertCfgs  = new Map<number, [LineCfg, LineCfg]>();
    const horizCfgs = new Map<number, [LineCfg, LineCfg]>();

    let presence = 0; // global animation presence driver 0→1
    let opacity  = 0;
    let prevHasCursor = false;
    let lastTs = performance.now();

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const onMove = (e: PointerEvent) => {
      target.x = e.clientX; target.y = e.clientY; target.active = true;
      if (smooth.x < -1000) { smooth.x = e.clientX; smooth.y = e.clientY; }
    };
    const onLeave = () => { target.active = false; };
    const onScroll = () => { scrollY = window.scrollY; };

    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerleave', onLeave);
    window.addEventListener('blur', onLeave);
    window.addEventListener('scroll', onScroll, { passive: true });

    let raf = 0;

    const draw = () => {
      if (target.active) {
        smooth.x += (target.x - smooth.x) * cfg.cursorEase;
        smooth.y += (target.y - smooth.y) * cfg.cursorEase;
      }
      smoothScroll += (scrollY - smoothScroll) * cfg.scrollEase;

      ctx.clearRect(0, 0, w, h);

      const cx = smooth.x;
      const cy = smooth.y;
      const hasCursor = target.active && cx > -1000;

      const now = performance.now();
      const dt  = Math.min(0.05, (now - lastTs) / 1000);
      const t   = now / 1000;
      lastTs = now;

      // On cursor enter: regenerate all per-line configs and partially collapse
      // presence so the spread re-animates freshly from the new position.
      if (!prevHasCursor && hasCursor) {
        vertCfgs.clear();
        horizCfgs.clear();
        presence *= 0.12;
      }
      prevHasCursor = hasCursor;

      if (hasCursor) {
        presence = Math.min(1, presence + dt * 2.2);
        opacity  = Math.min(1, opacity  + dt * 12);
      } else {
        presence = Math.max(0, presence - dt * 1.4);
        opacity  = Math.max(0, opacity  - dt * 3);
      }

      // Base grid
      for (const layer of cfg.layers) {
        const offset = -smoothScroll * layer.parallax;
        const startY = ((offset % layer.spacing) + layer.spacing) % layer.spacing - layer.spacing;
        const startX = -layer.spacing;

        ctx.lineWidth = 1;
        ctx.strokeStyle = `rgba(${cfg.lineRGB}, ${layer.alpha})`;

        ctx.beginPath();
        for (let x = startX; x <= w + layer.spacing; x += layer.spacing) {
          addCurvedLine(ctx, x, 0, x, h, w, h, k);
        }
        ctx.stroke();

        ctx.beginPath();
        for (let y = startY; y <= h + layer.spacing; y += layer.spacing) {
          addCurvedLine(ctx, 0, y, w, y, w, h, k);
        }
        ctx.stroke();
      }

      if (opacity < 0.005) {
        raf = requestAnimationFrame(draw);
        return;
      }

      if (cfg.mode === 'intersection') {
        const maxR = cfg.maxReach;
        const peak = cfg.peakAlpha;
        const cutoff = maxR * 0.92;

        for (const layer of cfg.layers) {
          const offset = -smoothScroll * layer.parallax;
          const startY = ((offset % layer.spacing) + layer.spacing) % layer.spacing - layer.spacing;
          const startX = -layer.spacing;

          // Vertical lines — each gets independent up/down reach
          for (let x = startX; x <= w + layer.spacing; x += layer.spacing) {
            const dx = Math.abs(x - cx);
            if (dx >= cutoff) continue;

            const gi = Math.round(x / layer.spacing);
            if (!vertCfgs.has(gi)) vertCfgs.set(gi, [mkLineCfg(), mkLineCfg()]);
            const [upC, dnC] = vertCfgs.get(gi)!;

            const lineUp = computeReach(upC, presence, t, maxR);
            const lineDn = computeReach(dnC, presence, t, maxR);
            if (lineUp + lineDn < 4) continue;

            const distFrac = 1 - dx / cutoff;
            const alpha = peak * distFrac * distFrac * layer.glow * opacity;
            if (alpha < 0.01) continue;

            const yTop = Math.max(0, cy - lineUp);
            const yBot = Math.min(h, cy + lineDn);
            if (yBot - yTop < 2) continue;

            const midT = Math.max(0.01, Math.min(0.99, lineUp / Math.max(1, lineUp + lineDn)));
            const grad = ctx.createLinearGradient(0, yTop, 0, yBot);
            grad.addColorStop(0,    `rgba(${cfg.glowRGB}, 0)`);
            grad.addColorStop(midT, `rgba(${cfg.glowRGB}, ${Math.min(1, alpha).toFixed(3)})`);
            grad.addColorStop(1,    `rgba(${cfg.glowRGB}, 0)`);
            ctx.strokeStyle = grad;
            ctx.lineWidth = distFrac > 0.55 ? 2 : 1.5;
            ctx.beginPath();
            addCurvedLine(ctx, x, yTop, x, yBot, w, h, k);
            ctx.stroke();

            if (distFrac > 0.4) {
              const tipA = Math.min(1, alpha * 0.85);
              if (lineUp > 8 && yTop > 1) {
                const tp = applyBarrel(x, yTop, w, h, k);
                drawTip(ctx, tp.x, tp.y, tipA);
              }
              if (lineDn > 8 && yBot < h - 1) {
                const tp = applyBarrel(x, yBot, w, h, k);
                drawTip(ctx, tp.x, tp.y, tipA);
              }
            }
          }

          // Horizontal lines — each gets independent left/right reach
          for (let y = startY; y <= h + layer.spacing; y += layer.spacing) {
            const dy = Math.abs(y - cy);
            if (dy >= cutoff) continue;

            const gi = Math.round(y / layer.spacing);
            if (!horizCfgs.has(gi)) horizCfgs.set(gi, [mkLineCfg(), mkLineCfg()]);
            const [ltC, rtC] = horizCfgs.get(gi)!;

            const lineLt = computeReach(ltC, presence, t, maxR);
            const lineRt = computeReach(rtC, presence, t, maxR);
            if (lineLt + lineRt < 4) continue;

            const distFrac = 1 - dy / cutoff;
            const alpha = peak * distFrac * distFrac * layer.glow * opacity;
            if (alpha < 0.01) continue;

            const xL = Math.max(0, cx - lineLt);
            const xR = Math.min(w, cx + lineRt);
            if (xR - xL < 2) continue;

            const midT = Math.max(0.01, Math.min(0.99, lineLt / Math.max(1, lineLt + lineRt)));
            const grad = ctx.createLinearGradient(xL, 0, xR, 0);
            grad.addColorStop(0,    `rgba(${cfg.glowRGB}, 0)`);
            grad.addColorStop(midT, `rgba(${cfg.glowRGB}, ${Math.min(1, alpha).toFixed(3)})`);
            grad.addColorStop(1,    `rgba(${cfg.glowRGB}, 0)`);
            ctx.strokeStyle = grad;
            ctx.lineWidth = distFrac > 0.55 ? 2 : 1.5;
            ctx.beginPath();
            addCurvedLine(ctx, xL, y, xR, y, w, h, k);
            ctx.stroke();

            if (distFrac > 0.4) {
              const tipA = Math.min(1, alpha * 0.85);
              if (lineLt > 8 && xL > 1) {
                const tp = applyBarrel(xL, y, w, h, k);
                drawTip(ctx, tp.x, tp.y, tipA);
              }
              if (lineRt > 8 && xR < w - 1) {
                const tp = applyBarrel(xR, y, w, h, k);
                drawTip(ctx, tp.x, tp.y, tipA);
              }
            }
          }
        }
      } else {
        // sigma mode — experience page
        const sp2 = cfg.sigmaPerp * cfg.sigmaPerp;
        const peak = cfg.peakAlpha;

        for (const layer of cfg.layers) {
          const offset = -smoothScroll * layer.parallax;
          const startY = ((offset % layer.spacing) + layer.spacing) % layer.spacing - layer.spacing;
          const startX = -layer.spacing;
          const radius = cfg.sigmaPara * 1.5;

          for (let x = startX; x <= w + layer.spacing; x += layer.spacing) {
            const dx = x - cx;
            const perp = Math.exp(-(dx * dx) / sp2);
            if (perp < 0.05) continue;
            const p = Math.min(peak, layer.glow * perp);
            if (p < 0.015) continue;
            const yTop = Math.max(0, cy - radius);
            const yBot = Math.min(h, cy + radius);
            if (yBot - yTop < 4) continue;
            const grad = ctx.createLinearGradient(0, yTop, 0, yBot);
            grad.addColorStop(0,   `rgba(${cfg.glowRGB}, 0)`);
            grad.addColorStop(0.5, `rgba(${cfg.glowRGB}, ${p})`);
            grad.addColorStop(1,   `rgba(${cfg.glowRGB}, 0)`);
            ctx.strokeStyle = grad;
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            addCurvedLine(ctx, x, yTop, x, yBot, w, h, k);
            ctx.stroke();
          }

          for (let y = startY; y <= h + layer.spacing; y += layer.spacing) {
            const dy = y - cy;
            const perp = Math.exp(-(dy * dy) / sp2);
            if (perp < 0.05) continue;
            const p = Math.min(peak, layer.glow * perp);
            if (p < 0.015) continue;
            const xL = Math.max(0, cx - radius);
            const xR = Math.min(w, cx + radius);
            if (xR - xL < 4) continue;
            const grad = ctx.createLinearGradient(xL, 0, xR, 0);
            grad.addColorStop(0,   `rgba(${cfg.glowRGB}, 0)`);
            grad.addColorStop(0.5, `rgba(${cfg.glowRGB}, ${p})`);
            grad.addColorStop(1,   `rgba(${cfg.glowRGB}, 0)`);
            ctx.strokeStyle = grad;
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            addCurvedLine(ctx, xL, y, xR, y, w, h, k);
            ctx.stroke();
          }
        }
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('blur', onLeave);
      window.removeEventListener('scroll', onScroll);
    };
  }, [variant]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex }}
    />
  );
}
