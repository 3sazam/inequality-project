import { useLocation, useNavigate, Link } from 'react-router-dom';

const SERIF = "'Instrument Serif', 'Cormorant Garamond', serif";
const SANS  = "system-ui, -apple-system, sans-serif";

type Goal = {
  id: string;
  label: string;
  group: string;
  price: number;
  blurb: string;
};

const GOALS: Goal[] = [
  {
    id: 'flat',
    label: '1-bed flat',
    group: 'A place of your own',
    price: 230_000,
    blurb: 'UK average for a one-bedroom flat (outside London).',
  },
  {
    id: 'house',
    label: '3-bed house',
    group: 'A family home',
    price: 330_000,
    blurb: 'Roughly the average asking price for a three-bedroom house.',
  },
  {
    id: 'car',
    label: 'A used car',
    group: 'Getting around',
    price: 12_000,
    blurb: 'A reliable second-hand car — nothing flash.',
  },
  {
    id: 'holiday',
    label: 'A two-week holiday',
    group: 'A break',
    price: 3_000,
    blurb: 'Flights, hotel, food for a family of two for two weeks.',
  },
];

function formatYears(years: number): string {
  if (!isFinite(years) || years <= 0) return '—';
  if (years < 1) {
    const months = Math.max(1, Math.round(years * 12));
    return `${months} month${months === 1 ? '' : 's'}`;
  }
  if (years < 10)  return `${years.toFixed(1)} years`;
  if (years < 100) return `${Math.round(years)} years`;
  return `${Math.round(years).toLocaleString()}+ years`;
}

export default function Affordability() {
  const location = useLocation();
  const navigate = useNavigate();
  const income           = Number(location.state?.income)           || 3500;
  const monthlyRemaining = Number(location.state?.monthlyRemaining) || 0;

  const annualSavings = monthlyRemaining * 12;
  const cantSave      = monthlyRemaining <= 0;

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f2ebe0',
      color: '#1a1a16',
      fontFamily: SANS,
      position: 'relative',
      padding: 'clamp(3rem, 6vw, 5rem) clamp(1.4rem, 6vw, 4rem) 4rem',
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
        <Link to="/3d-experience" style={{
          fontFamily: SANS, fontSize: '0.8rem',
          color: 'rgba(26,26,22,0.5)', textDecoration: 'none',
          border: '1px solid rgba(26,26,22,0.15)', borderRadius: 6,
          padding: '0.38rem 0.9rem', background: 'rgba(242,235,224,0.75)',
        }}>← Back to budget</Link>
      </div>

      <main style={{
        position: 'relative', zIndex: 10,
        maxWidth: 720, margin: '0 auto',
        display: 'flex', flexDirection: 'column', gap: '2.6rem',
      }}>
        <header style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <span style={{
            fontFamily: SANS, fontSize: '0.6rem',
            letterSpacing: '0.1em', textTransform: 'uppercase',
            color: 'rgba(26,26,22,0.38)',
          }}>If you save what's left</span>

          <h1 style={{
            fontFamily: SERIF, fontStyle: 'italic', fontWeight: 400,
            margin: 0, fontSize: 'clamp(2.6rem, 5.5vw, 4.4rem)',
            lineHeight: 1.04, letterSpacing: '-0.005em',
          }}>
            At <span style={{ color: cantSave ? '#8b2216' : '#1c4d2e' }}>£{Math.max(0, monthlyRemaining).toLocaleString()}</span> a month…
          </h1>

          <p style={{
            margin: 0, fontSize: '0.95rem', lineHeight: 1.7,
            color: 'rgba(26,26,22,0.55)', maxWidth: 540,
          }}>
            {cantSave ? (
              <>Your expenses already exceed your <strong style={{ color: '#1a1a16', fontWeight: 500 }}>£{income.toLocaleString()}</strong> monthly income — there's nothing left to put aside. Every goal below stays out of reach until that changes.</>
            ) : (
              <>That's <strong style={{ color: '#1a1a16', fontWeight: 500 }}>£{annualSavings.toLocaleString()}</strong> a year, assuming you save every penny that's left after bills. Here's how long the things people quietly want take to afford.</>
            )}
          </p>
        </header>

        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {GOALS.map((goal) => {
            const years = cantSave ? Infinity : goal.price / annualSavings;
            return (
              <li key={goal.id} style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) auto',
                gap: '1.4rem',
                alignItems: 'baseline',
                padding: '1.2rem 0',
                borderTop: '1px solid rgba(26,26,22,0.12)',
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <span style={{
                    fontFamily: SANS, fontSize: '0.6rem',
                    letterSpacing: '0.1em', textTransform: 'uppercase',
                    color: 'rgba(26,26,22,0.38)',
                  }}>{goal.group}</span>
                  <span style={{
                    fontFamily: SERIF, fontStyle: 'italic', fontWeight: 400,
                    fontSize: 'clamp(1.6rem, 2.6vw, 2.1rem)', lineHeight: 1.1,
                  }}>
                    {goal.label}
                  </span>
                  <span style={{ fontSize: '0.78rem', color: 'rgba(26,26,22,0.5)', lineHeight: 1.6 }}>
                    £{goal.price.toLocaleString()} · {goal.blurb}
                  </span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{
                    fontFamily: SERIF, fontStyle: 'italic', fontWeight: 400,
                    fontSize: 'clamp(1.6rem, 2.6vw, 2.1rem)',
                    color: cantSave ? '#8b2216' : '#1a1a16',
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {formatYears(years)}
                  </div>
                  <div style={{
                    fontFamily: SANS, fontSize: '0.62rem',
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                    color: 'rgba(26,26,22,0.4)', marginTop: 4,
                  }}>
                    of saving everything
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginTop: '0.4rem' }}>
          <p style={{ margin: 0, fontSize: '0.78rem', color: 'rgba(26,26,22,0.42)', maxWidth: 360, lineHeight: 1.6 }}>
            These figures assume zero interest, zero inflation, and that you spend nothing on yourself. The real numbers are worse.
          </p>
          <button
            type="button"
            onClick={() => navigate('/wealth-inequality', { state: { income, monthlyRemaining } })}
            style={{
              fontFamily: SANS, fontSize: '0.82rem',
              padding: '0.7rem 1.2rem',
              border: '1px solid #1c4d2e', borderRadius: 999,
              background: '#1c4d2e', color: '#f2ebe0', cursor: 'pointer',
            }}
          >
            Now zoom out →
          </button>
        </div>
      </main>
    </div>
  );
}
