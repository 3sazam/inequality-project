import { useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const SERIF = "'Instrument Serif', 'Cormorant Garamond', serif";
const SANS  = "'Manrope', system-ui, sans-serif";
const BODY  = "'Lato', system-ui, sans-serif";
const BG    = '#f2ebe0';
const DARK  = '#1a1a16';
const RED   = '#8b2216';
const GREEN = '#1c4d2e';
const AMBER = '#7a4d1a';

const GRAIN = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.72' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)'/%3E%3C/svg%3E\")";

type Em = 'debt' | 'asylum';
type SpendingRow = { label: string; sub: string; pct: number; em?: Em };

// HM Treasury PESA 2024 — 2023/24 outturn
const ROWS: SpendingRow[] = [
  { label: 'Social protection',    sub: 'Pensions, universal credit, housing benefit',  pct: 29.4 },
  { label: 'Health',               sub: 'NHS England and devolved health services',      pct: 14.4 },
  { label: 'Education',            sub: 'Schools, further and higher education',         pct:  9.4 },
  { label: 'Debt interest',        sub: 'Servicing £2.7 trillion of national debt',      pct:  7.8, em: 'debt'   },
  { label: 'Transport',            sub: 'Roads, rail and national infrastructure',       pct:  5.0 },
  { label: 'Defence',              sub: 'Armed forces and intelligence services',        pct:  4.5 },
  { label: 'Housing & environment',sub: 'Social housing and climate programmes',         pct:  2.8 },
  { label: 'Justice & policing',   sub: 'Courts, police forces and prisons',             pct:  2.7 },
  { label: 'Everything else',      sub: 'Local government, science, culture and more',   pct: 23.0 },
  { label: 'Asylum & migration',   sub: '£5.4bn: hotels, processing and enforcement',   pct:  0.44, em: 'asylum' },
];

// Bank of England gilt holdings by sector (Q4 2023)
const GILT = [
  { label: 'Overseas investors',          note: 'Foreign sovereign funds, banks and hedge funds',    pct: 32 },
  { label: 'UK insurance & pensions',     note: 'Institutional capital, concentrated at the top',   pct: 27 },
  { label: 'Bank of England',             note: 'Recycled back to Treasury, net public cost: £0',   pct: 27 },
  { label: 'UK banks & private wealth',   note: 'Predominantly high-net-worth individuals',          pct: 14 },
];

export default function SpendingFlow() {
  const location  = useLocation();
  const navigate  = useNavigate();
  const income    = Number(location.state?.income)           || 3500;
  const remaining = Number(location.state?.monthlyRemaining) || 0;

  const barsRef  = useRef<HTMLDivElement>(null);
  const giltRef  = useRef<HTMLDivElement>(null);
  const callRef  = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {

      // ── Spending bar rows ───────────────────────────
      barsRef.current?.querySelectorAll<HTMLElement>('[data-row]').forEach(row => {
        const fill = row.querySelector<HTMLElement>('[data-fill]');
        if (!fill) return;
        gsap.set(row,  { opacity: 0, y: 10 });
        gsap.set(fill, { scaleX: 0, transformOrigin: 'left center' });
        const tl = gsap.timeline({
          scrollTrigger: { trigger: row, start: 'top 91%', toggleActions: 'play none none none' },
        });
        tl.to(row,  { opacity: 1, y: 0, duration: 0.4,  ease: 'power2.out' })
          .to(fill, { scaleX: 1,         duration: 0.65, ease: 'power2.out' }, '-=0.2');
      });

      // ── Contrast callout ────────────────────────────
      if (callRef.current) {
        gsap.from(callRef.current, {
          opacity: 0, y: 28, duration: 0.9, ease: 'power2.out',
          scrollTrigger: { trigger: callRef.current, start: 'top 82%', toggleActions: 'play none none none' },
        });
      }

      // ── Gilt holder rows ────────────────────────────
      giltRef.current?.querySelectorAll<HTMLElement>('[data-row]').forEach(row => {
        const fill = row.querySelector<HTMLElement>('[data-fill]');
        if (!fill) return;
        gsap.set(row,  { opacity: 0, y: 10 });
        gsap.set(fill, { scaleX: 0, transformOrigin: 'left center' });
        const tl = gsap.timeline({
          scrollTrigger: { trigger: row, start: 'top 91%', toggleActions: 'play none none none' },
        });
        tl.to(row,  { opacity: 1, y: 0, duration: 0.4,  ease: 'power2.out' })
          .to(fill, { scaleX: 1,         duration: 0.6,  ease: 'power2.out' }, '-=0.2');
      });

      // ── Closing ─────────────────────────────────────
      if (closeRef.current) {
        gsap.from(closeRef.current, {
          opacity: 0, y: 20, duration: 0.8, ease: 'power2.out',
          scrollTrigger: { trigger: closeRef.current, start: 'top 85%', toggleActions: 'play none none none' },
        });
      }
    });

    return () => ctx.revert();
  }, []);

  return (
    <div style={{ background: BG, minHeight: '100vh', position: 'relative' }}>

      {/* Grain */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999, pointerEvents: 'none',
        backgroundImage: GRAIN, backgroundRepeat: 'repeat', backgroundSize: '300px 300px',
        opacity: 0.045,
      }} />

      {/* Back */}
      <div style={{ position: 'fixed', top: 24, left: 24, zIndex: 200 }}>
        <Link
          to="/affordability"
          state={{ income, monthlyRemaining: remaining }}
          style={{
            fontFamily: SANS, fontSize: '0.8rem',
            color: 'rgba(26,26,22,0.5)', textDecoration: 'none',
            border: '1px solid rgba(26,26,22,0.15)', borderRadius: 6,
            padding: '0.38rem 0.9rem', background: 'rgba(242,235,224,0.85)',
          }}
        >← Back to timeline</Link>
      </div>

      <div style={{
        maxWidth: 740,
        margin: '0 auto',
        padding: '0 clamp(1.5rem, 6vw, 4rem)',
      }}>

        {/* ── Intro ──────────────────────────────────────── */}
        <section style={{ paddingTop: 'clamp(7rem, 14vh, 10rem)', paddingBottom: '5rem' }}>
          <span style={{
            display: 'block', fontFamily: SANS, fontSize: '0.72rem',
            letterSpacing: '0.13em', textTransform: 'uppercase',
            color: 'rgba(26,26,22,0.4)', marginBottom: '1.1rem',
          }}>2023 / 24 · UK public spending</span>
          <h1 style={{
            fontFamily: SERIF, fontStyle: 'italic', fontWeight: 400,
            fontSize: 'clamp(2.8rem, 6vw, 4.4rem)',
            lineHeight: 1.04, letterSpacing: '-0.02em',
            color: DARK, margin: '0 0 1.6rem',
          }}>
            Where does your<br />pound actually go?
          </h1>
          <p style={{
            fontFamily: BODY, fontSize: '0.88rem', lineHeight: 1.75,
            color: 'rgba(26,26,22,0.5)', margin: 0, maxWidth: 460,
          }}>
            Of every pound collected in tax, this is what the government
            spends it on. Scroll to follow the money.
          </p>
        </section>

        {/* ── Spending bars ──────────────────────────────── */}
        <section style={{ paddingBottom: '5rem' }}>
          <div style={{
            fontFamily: SANS, fontSize: '0.66rem', letterSpacing: '0.12em',
            textTransform: 'uppercase', color: 'rgba(26,26,22,0.35)',
            marginBottom: '2.2rem',
          }}>
            Of every £1 in public spending
          </div>

          <div ref={barsRef}>
            {ROWS.map(row => {
              const isDebt   = row.em === 'debt';
              const isAsylum = row.em === 'asylum';
              const isAccent = isDebt || isAsylum;
              const barColor = isDebt ? RED : isAsylum ? AMBER
                : `rgba(26,26,22,${Math.min(0.6, 0.2 + row.pct * 0.014)})`;
              const labelColor = isDebt ? RED : isAsylum ? AMBER : DARK;
              const barWidthPct = Math.min(100, (row.pct / 30) * 100);

              return (
                <div
                  key={row.label}
                  data-row=""
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    gap: '0.4rem 1.8rem',
                    alignItems: 'center',
                    padding: `${isAccent ? '1.3' : '1.0'}rem 0`,
                    borderTop: `1px solid rgba(26,26,22,${isAccent ? 0.12 : 0.07})`,
                  }}
                >
                  <div>
                    <div style={{
                      display: 'flex', alignItems: 'baseline', gap: '0.6rem',
                      marginBottom: '0.55rem', flexWrap: 'wrap',
                    }}>
                      <span style={{
                        fontFamily: SERIF, fontStyle: 'italic', fontWeight: 400,
                        fontSize: isAccent ? '1.2rem' : '1rem',
                        color: labelColor,
                      }}>{row.label}</span>
                      <span style={{
                        fontFamily: SANS, fontSize: '0.61rem', letterSpacing: '0.07em',
                        color: 'rgba(26,26,22,0.33)', textTransform: 'uppercase',
                      }}>{row.sub}</span>
                    </div>
                    {/* Bar track */}
                    <div style={{ height: isAccent ? 7 : 4, background: 'rgba(26,26,22,0.07)', borderRadius: 4, overflow: 'hidden' }}>
                      <div
                        data-fill=""
                        style={{
                          height: '100%',
                          width: `${barWidthPct}%`,
                          background: barColor,
                          borderRadius: 4,
                        }}
                      />
                    </div>
                  </div>

                  {/* Percentage */}
                  <div style={{ textAlign: 'right', minWidth: 60 }}>
                    <span style={{
                      fontFamily: SERIF, fontStyle: 'italic',
                      fontSize: isAccent ? '2.1rem' : '1.6rem',
                      color: isDebt ? RED : isAsylum ? AMBER : 'rgba(26,26,22,0.45)',
                      lineHeight: 1,
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {row.pct < 1 ? row.pct.toFixed(2) : row.pct.toFixed(1)}
                      <span style={{ fontSize: '0.55em', opacity: 0.6 }}>%</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <p style={{
            fontFamily: SANS, fontSize: '0.6rem', letterSpacing: '0.06em',
            color: 'rgba(26,26,22,0.28)', margin: '1.4rem 0 0',
          }}>
            Source: HM Treasury PESA 2024 · Home Office Annual Report 2023–24
          </p>
        </section>

        {/* ── Contrast callout ───────────────────────────── */}
        <section style={{ padding: '6rem 0 8rem' }}>
          <div
            ref={callRef}
            style={{
              borderLeft: `3px solid ${RED}`,
              paddingLeft: '2rem',
            }}
          >
            <div style={{
              fontFamily: SANS, fontSize: '0.68rem', letterSpacing: '0.12em',
              textTransform: 'uppercase', color: 'rgba(26,26,22,0.38)',
              marginBottom: '1.2rem',
            }}>The comparison</div>

            <p style={{
              fontFamily: SERIF, fontStyle: 'italic', fontWeight: 400,
              fontSize: 'clamp(1.7rem, 4vw, 2.8rem)',
              color: DARK, lineHeight: 1.12,
              margin: '0 0 2.5rem',
            }}>
              Debt interest costs{' '}
              <span style={{ color: RED }}>18× more</span>{' '}
              than the entire asylum system.
            </p>

            <div style={{ display: 'flex', gap: '2.5rem 4rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <div style={{
                  fontFamily: SERIF, fontStyle: 'italic',
                  fontSize: 'clamp(2.4rem, 5vw, 3.4rem)',
                  color: RED, lineHeight: 1,
                  fontVariantNumeric: 'tabular-nums',
                  marginBottom: '0.5rem',
                }}>£96bn</div>
                <div style={{
                  fontFamily: SANS, fontSize: '0.67rem', letterSpacing: '0.1em',
                  textTransform: 'uppercase', color: 'rgba(26,26,22,0.42)',
                }}>Debt interest</div>
              </div>

              <div style={{
                fontFamily: SERIF, fontStyle: 'italic',
                fontSize: '1.4rem', color: 'rgba(26,26,22,0.22)',
                paddingBottom: '0.4rem',
              }}>vs</div>

              <div>
                <div style={{
                  fontFamily: SERIF, fontStyle: 'italic',
                  fontSize: 'clamp(2.4rem, 5vw, 3.4rem)',
                  color: AMBER, lineHeight: 1,
                  fontVariantNumeric: 'tabular-nums',
                  marginBottom: '0.5rem',
                }}>£5.4bn</div>
                <div style={{
                  fontFamily: SANS, fontSize: '0.67rem', letterSpacing: '0.1em',
                  textTransform: 'uppercase', color: 'rgba(26,26,22,0.42)',
                }}>Asylum & migration</div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Who receives it ────────────────────────────── */}
        <section style={{ paddingBottom: '8rem' }}>
          <span style={{
            display: 'block', fontFamily: SANS, fontSize: '0.72rem',
            letterSpacing: '0.13em', textTransform: 'uppercase',
            color: 'rgba(26,26,22,0.4)', marginBottom: '1rem',
          }}>Where does the £96bn flow?</span>
          <h2 style={{
            fontFamily: SERIF, fontStyle: 'italic', fontWeight: 400,
            fontSize: 'clamp(1.8rem, 4vw, 2.8rem)',
            lineHeight: 1.1, color: DARK,
            margin: '0 0 3rem',
          }}>
            Who collects the interest<br />on Britain's debt?
          </h2>

          <div ref={giltRef}>
            {GILT.map(g => {
              const isBoE   = g.label === 'Bank of England';
              const barFill = isBoE ? 'rgba(26,26,22,0.18)' : GREEN;
              const numCol  = isBoE ? 'rgba(26,26,22,0.32)' : GREEN;

              return (
                <div
                  key={g.label}
                  data-row=""
                  style={{
                    padding: '1.2rem 0',
                    borderTop: '1px solid rgba(26,26,22,0.08)',
                  }}
                >
                  <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    alignItems: 'baseline', marginBottom: '0.6rem',
                  }}>
                    <span style={{
                      fontFamily: SERIF, fontStyle: 'italic', fontWeight: 400,
                      fontSize: '1.15rem',
                      color: isBoE ? 'rgba(26,26,22,0.42)' : DARK,
                    }}>{g.label}</span>
                    <span style={{
                      fontFamily: SERIF, fontStyle: 'italic',
                      fontSize: '1.9rem', color: numCol, lineHeight: 1,
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {g.pct}<span style={{ fontSize: '0.55em', opacity: 0.65 }}>%</span>
                    </span>
                  </div>

                  <div style={{ height: 5, background: 'rgba(26,26,22,0.07)', borderRadius: 3, marginBottom: '0.6rem', overflow: 'hidden' }}>
                    <div
                      data-fill=""
                      style={{
                        height: '100%',
                        width: `${(g.pct / 35) * 100}%`,
                        background: barFill,
                        borderRadius: 3,
                      }}
                    />
                  </div>

                  <div style={{
                    fontFamily: SANS, fontSize: '0.65rem', letterSpacing: '0.06em',
                    color: isBoE ? 'rgba(26,26,22,0.28)' : 'rgba(26,26,22,0.42)',
                  }}>{g.note}</div>
                </div>
              );
            })}
          </div>

          <p style={{
            fontFamily: SANS, fontSize: '0.6rem', letterSpacing: '0.06em',
            color: 'rgba(26,26,22,0.28)', margin: '1.4rem 0 0',
          }}>
            Source: OBR Economic and Fiscal Outlook March 2024 · Bank of England gilt holdings by sector
          </p>
        </section>

        {/* ── Closing ────────────────────────────────────── */}
        <section style={{ paddingBottom: '10rem', textAlign: 'center' }}>
          <div ref={closeRef}>
            <p style={{
              fontFamily: SERIF, fontStyle: 'italic', fontWeight: 400,
              fontSize: 'clamp(1.5rem, 3.5vw, 2.3rem)',
              lineHeight: 1.35,
              maxWidth: 520, margin: '0 auto 3.5rem',
              color: 'rgba(26,26,22,0.55)',
            }}>
              "The national debt is not a burden on the wealthy.{' '}
              <span style={{ color: DARK }}>It pays them."</span>
            </p>
            <button
              type="button"
              onClick={() => navigate('/wealth-inequality', { state: { income, monthlyRemaining: remaining } })}
              style={{
                fontFamily: SANS, fontSize: '0.85rem',
                padding: '0.75rem 1.5rem',
                border: `1px solid ${GREEN}`, borderRadius: 999,
                background: GREEN, color: BG, cursor: 'pointer',
              }}
            >
              See the bigger picture →
            </button>
          </div>
        </section>

      </div>
    </div>
  );
}
