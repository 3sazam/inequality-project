import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatedBackground } from '../components/AnimatedBackground';
import { GridBackground } from '../components/GridBackground';
import styles from './home.module.css';

export default function Home() {
  const [inputValue, setInputValue] = useState('');
  const [pressing, setPressing] = useState(false);
  const navigate = useNavigate();
  const btnRef = useRef<HTMLButtonElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);
  const target = useRef({ x: 0, y: 0 });
  const current = useRef({ x: 0, y: 0 });
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      // Negate: cursor right → background drifts left (camera-pan parallax)
      target.current.x = -(e.clientX - window.innerWidth  / 2) * 0.012;
      target.current.y = -(e.clientY - window.innerHeight / 2) * 0.008;
    };
    const onLeave = () => { target.current.x = 0; target.current.y = 0; };

    const tick = () => {
      current.current.x += (target.current.x - current.current.x) * 0.04;
      current.current.y += (target.current.y - current.current.y) * 0.04;
      if (bgRef.current) {
        bgRef.current.style.transform =
          `translate(${current.current.x.toFixed(2)}px, ${current.current.y.toFixed(2)}px)`;
      }
      raf.current = requestAnimationFrame(tick);
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('mouseleave', onLeave);
    raf.current = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseleave', onLeave);
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = Number(inputValue);
    if (!raw || raw <= 0) return;
    navigate('/3d-experience', { state: { userInput: raw } });
  };

  return (
    <div className={styles.container}>
      <div ref={bgRef} aria-hidden style={{ position: 'fixed', top: -20, left: -20, right: -20, bottom: -20, pointerEvents: 'none', zIndex: -1, willChange: 'transform' }}>
        <AnimatedBackground />
      </div>
      <GridBackground variant="home" zIndex={0} />
      <div className={styles.logo} role="img" aria-label="Divide" />
      <main className={styles.main}>
        <h1 className={styles.title} style={{ fontFamily: "'Manrope', sans-serif" }}>
          The gap is <span className={styles.wider}>wider</span> than you think
        </h1>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.inputBar}>
            <span className={styles.prefix}>£</span>
            <input
              type="number"
              placeholder="your monthly income"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setPressing(true);
                  setTimeout(() => setPressing(false), 180);
                }
              }}
              className={styles.input}
              min="1"
              required
            />
          </div>
          <button
            ref={btnRef}
            type="submit"
            className={`${styles.enterBtn} ${pressing ? styles.enterBtnPressed : ''}`}
          >
            enter ↵
          </button>
        </form>
      </main>
    </div>
  );
}
