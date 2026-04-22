import { useState } from 'react';
import { BudgetProgressBar } from '../components/BudgetProgressBar';

const SANS = "system-ui, -apple-system, sans-serif";
const SERIF = "'Instrument Serif', 'Cormorant Garamond', serif";

const INCOME = 3500;
const CHIPS = [
  { label: '-£650 Rent',      remaining: INCOME - 650 },
  { label: '-£200 Groceries', remaining: INCOME - 850 },
  { label: '-£150 Transport', remaining: INCOME - 1000 },
  { label: '-£400 Tax',       remaining: INCOME - 1400 },
];

export default function BudgetProgressBarDemo() {
  const [income, setIncome] = useState(INCOME);
  const [remaining, setRemaining] = useState(INCOME);
  const [chipLabel, setChipLabel] = useState<string | null>(null);

  const pushChip = (label: string, value: number) => {
    setRemaining(value);
    setChipLabel(label);
  };

  return (
    <div style={{
      minHeight: '100vh',
      padding: '3rem 2rem',
      background: 'radial-gradient(ellipse at 50% 38%, #f7f1e7 0%, #ebe2d2 55%, #d6cdba 100%)',
      color: '#1a1a16',
      fontFamily: SANS,
    }}>
      <header style={{ maxWidth: 560 }}>
        <span style={{
          fontSize: '0.6rem',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'rgba(26,26,22,0.38)',
        }}>
          Component demo
        </span>
        <h1 style={{
          fontFamily: SERIF,
          fontStyle: 'italic',
          fontWeight: 400,
          fontSize: 'clamp(2rem, 4vw, 3rem)',
          margin: '0.4rem 0 0.8rem',
        }}>
          Budget progress bar
        </h1>
        <p style={{
          fontSize: '0.9rem',
          lineHeight: 1.6,
          color: 'rgba(26,26,22,0.6)',
          margin: 0,
        }}>
          Controls below drive the component on the right. The bar itself is purely
          presentational — it renders whatever <code>income</code>, <code>remaining</code>,
          and <code>chipLabel</code> props are passed in.
        </p>
      </header>

      <section style={{
        marginTop: '2.4rem',
        display: 'grid',
        gap: '1.4rem',
        maxWidth: 520,
      }}>
        <Row label={`Income: £${income.toLocaleString()}`}>
          <input
            type="range"
            min={1000} max={10000} step={50}
            value={income}
            onChange={(e) => {
              const v = Number(e.target.value);
              setIncome(v);
              setRemaining((r) => Math.min(r, v));
            }}
            style={{ width: '100%' }}
          />
        </Row>

        <Row label={`Remaining: £${remaining.toLocaleString()} (${income > 0 ? Math.round((remaining / income) * 100) : 0}%)`}>
          <input
            type="range"
            min={0} max={income} step={10}
            value={remaining}
            onChange={(e) => setRemaining(Number(e.target.value))}
            style={{ width: '100%' }}
          />
        </Row>

        <Row label="Simulate scroll progression">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <DemoButton onClick={() => { setRemaining(income); setChipLabel(null); }}>
              Reset
            </DemoButton>
            {CHIPS.map((c) => (
              <DemoButton
                key={c.label}
                onClick={() => pushChip(c.label, Math.max(0, income - (INCOME - c.remaining)))}
              >
                {c.label}
              </DemoButton>
            ))}
            <DemoButton onClick={() => setChipLabel(null)}>Hide chip</DemoButton>
          </div>
        </Row>

        <Row label="Edge cases">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <DemoButton onClick={() => setRemaining(0)}>0% (empty)</DemoButton>
            <DemoButton onClick={() => setRemaining(income)}>100% (full)</DemoButton>
            <DemoButton onClick={() => setRemaining(-200)}>Overspent</DemoButton>
          </div>
        </Row>
      </section>

      <BudgetProgressBar
        income={income}
        remaining={remaining}
        chipLabel={chipLabel}
      />
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{
        display: 'block',
        fontSize: '0.7rem',
        letterSpacing: '0.05em',
        color: 'rgba(26,26,22,0.55)',
        marginBottom: '0.45rem',
      }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function DemoButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontFamily: SANS,
        fontSize: '0.72rem',
        padding: '0.4rem 0.8rem',
        border: '1px solid rgba(26,26,22,0.2)',
        borderRadius: 999,
        background: 'rgba(242,235,224,0.6)',
        color: '#1a1a16',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}
