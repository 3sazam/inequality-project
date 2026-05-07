import { Link } from 'react-router-dom';
import { UK_MEDIAN_MONTHLY_TAKEHOME, FTSE_CEO_HOURLY } from '../experiences/budgetData';

const SERIF = "'Instrument Serif', 'Cormorant Garamond', serif";
const SANS  = "'Manrope', system-ui, sans-serif";
const BODY  = "'Lato', system-ui, sans-serif";

export default function WealthInequality() {
  // CEO earns the median's monthly take-home in roughly this many hours.
  const ceoHoursToMatchMedianMonth = UK_MEDIAN_MONTHLY_TAKEHOME / FTSE_CEO_HOURLY;

  return (
    <div style={{
      minHeight: '100dvh',
      background: '#f2ebe0',
      color: '#1a1a16',
      fontFamily: SANS,
      position: 'relative',
      padding: 'clamp(3rem, 6vw, 5rem) clamp(1.4rem, 6vw, 4rem) 5rem',
    }}>
      {/* Grain */}
      <div style={{
        position: 'fixed', inset: 0,
        backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.72' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)'/%3E%3C/svg%3E\")",
        backgroundRepeat: 'repeat', backgroundSize: '300px 300px',
        opacity: 0.045, pointerEvents: 'none', zIndex: 9999,
      }} />

      {/* Back */}
      <div style={{ position: 'fixed', top: 24, left: 24, zIndex: 200 }}>
        <Link to="/affordability" style={{
          fontFamily: SANS, fontSize: '0.8rem',
          color: 'rgba(26,26,22,0.5)', textDecoration: 'none',
          border: '1px solid rgba(26,26,22,0.15)', borderRadius: 6,
          padding: '0.38rem 0.9rem', background: 'rgba(242,235,224,0.75)',
        }}>← Back</Link>
      </div>

      <main style={{
        position: 'relative', zIndex: 10,
        maxWidth: 720, margin: '0 auto',
        display: 'flex', flexDirection: 'column', gap: '2.4rem',
      }}>
        <header style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <span style={{
            fontFamily: SANS, fontSize: '0.6rem',
            letterSpacing: '0.1em', textTransform: 'uppercase',
            color: 'rgba(26,26,22,0.38)',
          }}>The bigger picture</span>

          <h1 style={{
            fontFamily: SERIF, fontStyle: 'italic', fontWeight: 400,
            margin: 0, fontSize: 'clamp(2.6rem, 5.8vw, 4.6rem)',
            lineHeight: 1.04, letterSpacing: '-0.005em',
          }}>
            It's not just you.
          </h1>

          <p style={{
            fontFamily: BODY, margin: 0, fontSize: '0.95rem', lineHeight: 1.7,
            color: 'rgba(26,26,22,0.55)', maxWidth: 540,
          }}>
            The slow climb you just saw isn't a personal failure. It's the shape of the system. The gap between what most people earn and what the people at the top earn is now wider than at any point in modern memory.
          </p>
        </header>

        <section style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1.4rem',
        }}>
          <Stat
            label="UK median take-home"
            value={`£${UK_MEDIAN_MONTHLY_TAKEHOME.toLocaleString()}`}
            suffix="per month"
          />
          <Stat
            label="FTSE 100 CEO pay"
            value={`£${FTSE_CEO_HOURLY.toLocaleString()}`}
            suffix="per hour"
          />
          <Stat
            label="That CEO matches a median month in"
            value={`${ceoHoursToMatchMedianMonth.toFixed(1)} hrs`}
            suffix="of work"
          />
        </section>

        <section style={{
          borderTop: '1px solid rgba(26,26,22,0.12)',
          paddingTop: '2rem',
          display: 'flex', flexDirection: 'column', gap: '0.9rem',
        }}>
          <h2 style={{
            fontFamily: SERIF, fontStyle: 'italic', fontWeight: 400,
            margin: 0, fontSize: 'clamp(1.6rem, 3vw, 2.2rem)',
            lineHeight: 1.1,
          }}>
            More to come.
          </h2>
          <p style={{ margin: 0, fontSize: '0.92rem', lineHeight: 1.7, color: 'rgba(26,26,22,0.55)', maxWidth: 540 }}>
            This page is a placeholder for the rest of the story: the share of wealth at the top, how it's grown, and what it actually buys.
          </p>
        </section>

        <Link to="/" style={{
          alignSelf: 'flex-start',
          fontFamily: SANS, fontSize: '0.82rem',
          padding: '0.7rem 1.2rem',
          border: '1px solid rgba(26,26,22,0.2)', borderRadius: 999,
          background: 'transparent', color: '#1a1a16',
          textDecoration: 'none', marginTop: '1rem',
        }}>
          Start over
        </Link>
      </main>
    </div>
  );
}

function Stat({ label, value, suffix }: { label: string; value: string; suffix: string }) {
  return (
    <div style={{
      // Outer grid stretches sibling cards to equal height (when in the same row).
      // Inner `1fr` value row absorbs the extra height and `align-self: end` parks the
      // number against the suffix — so numbers baseline-align across desktop cards
      // without forcing extra whitespace on mobile (where each card stands alone).
      display: 'grid',
      gridTemplateRows: 'auto 1fr auto',
      height: '100%',
      rowGap: '0.7rem',
      padding: '1.3rem 1.2rem 1.2rem',
      background: 'rgba(255,255,255,0.4)',
      border: '1px solid rgba(26,26,22,0.1)',
      borderRadius: 10,
    }}>
      <span style={{
        fontFamily: SANS, fontSize: '0.6rem',
        letterSpacing: '0.1em', textTransform: 'uppercase',
        color: 'rgba(26,26,22,0.45)',
        lineHeight: 1.4,
      }}>{label}</span>
      <span style={{
        fontFamily: SERIF, fontStyle: 'italic', fontWeight: 400,
        fontSize: 'clamp(1.8rem, 3vw, 2.4rem)',
        lineHeight: 1,
        fontVariantNumeric: 'tabular-nums',
        alignSelf: 'end',
      }}>{value}</span>
      <span style={{
        fontFamily: SANS, fontSize: '0.72rem',
        color: 'rgba(26,26,22,0.45)',
        lineHeight: 1.4,
      }}>{suffix}</span>
    </div>
  );
}
