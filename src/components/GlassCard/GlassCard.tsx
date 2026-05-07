import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { globalCursor } from '../../lib/cursor';
import styles from './GlassCard.module.css';

type Props = {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
};

export function GlassCard({ children, style, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let sx = globalCursor.x;
    let sy = globalCursor.y;
    let raf: number;

    const tick = () => {
      sx += (globalCursor.x - sx) * 0.10;
      sy += (globalCursor.y - sy) * 0.10;

      const rect = el.getBoundingClientRect();
      const relX = sx - rect.left;
      const relY = sy - rect.top;

      const outsideDx = Math.max(0, -relX, relX - rect.width);
      const outsideDy = Math.max(0, -relY, relY - rect.height);
      const dist = Math.sqrt(outsideDx * outsideDx + outsideDy * outsideDy);
      const sheen = Math.max(0, 1 - dist / 130);

      // Update sheen highlight position + intensity
      el.style.setProperty('--sheen', sheen.toFixed(3));
      el.style.setProperty('--sheen-x', `${relX}px`);
      el.style.setProperty('--sheen-y', `${relY}px`);

      // Border + outer glow via drop-shadow (doesn't conflict with box-shadow)
      if (sheen > 0.005) {
        const alpha = sheen * 0.28;
        const spread = Math.round(sheen * 20);
        el.style.filter = `drop-shadow(0 0 ${spread}px rgba(26,26,22,${(alpha * 0.25).toFixed(3)}))`;
      } else {
        el.style.filter = '';
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      ref={ref}
      className={`${styles.card}${className ? ` ${className}` : ''}`}
      style={style}
    >
      {children}
    </div>
  );
}
