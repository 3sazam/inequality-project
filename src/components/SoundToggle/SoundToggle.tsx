import { useEffect, useRef, useState } from 'react';
import styles from './SoundToggle.module.css';

export default function SoundToggle() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [on, setOn] = useState(false);

  useEffect(() => {
    const audio = new Audio();
    // preload="none" → no network until user clicks play. Without this the
    // browser pulls "metadata" from a 10MB file on every page load.
    audio.preload = 'none';
    audio.src = '/resonance.mp3';
    audio.loop = true;
    audio.volume = 0.4;
    audioRef.current = audio;
    return () => {
      audio.pause();
      audio.src = '';
    };
  }, []);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (on) {
      audio.pause();
    } else {
      audio.play();
    }
    setOn(prev => !prev);
  }

  return (
    <button className={styles.btn} onClick={toggle} aria-label={on ? 'Mute sound' : 'Unmute sound'}>
      <svg className={styles.icon} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        {on ? (
          <>
            <path d="M11 5L6 9H2v6h4l5 4V5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </>
        ) : (
          <>
            <path d="M11 5L6 9H2v6h4l5 4V5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            <line x1="23" y1="9" x2="17" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="17" y1="9" x2="23" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </>
        )}
      </svg>
      <span className={styles.label}>Sound</span>
    </button>
  );
}
