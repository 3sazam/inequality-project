import styles from './BudgetProgressBar.module.css';
import { useTweenedNumber } from './useTweenedNumber';

export interface BudgetProgressBarProps {
  /** Total income — the denominator and 100% reference. */
  income: number;
  /** Amount currently remaining — the numerator (can be < 0). */
  remaining: number;
  /** Transient label shown below the bar (e.g. "-£650 Rent"). Null/undefined hides it. */
  chipLabel?: string | null;
  /** Currency prefix. Default "£". */
  currency?: string;
  /** Locale for number formatting. Default "en-GB". */
  locale?: string;
  className?: string;
}

export function BudgetProgressBar({
  income,
  remaining,
  chipLabel,
  currency = '£',
  locale = 'en-GB',
  className,
}: BudgetProgressBarProps) {
  const tweened = useTweenedNumber(remaining);
  const pct = income > 0 ? Math.max(0, Math.min(1, tweened / income)) : 0;
  const displayAmount = Math.round(tweened);
  const displayPct = Math.round(pct * 100);

  const formatted = `${currency}${displayAmount.toLocaleString(locale)}`;
  const totalFormatted = `${currency}${income.toLocaleString(locale)}`;

  return (
    <div
      className={className ? `${styles.root} ${className}` : styles.root}
      role="progressbar"
      aria-label="Remaining budget"
      aria-valuemin={0}
      aria-valuemax={income}
      aria-valuenow={Math.max(0, Math.round(remaining))}
      aria-valuetext={`${formatted} of ${totalFormatted} remaining`}
    >
      <div className={styles.header}>
        <span className={styles.label}>remaining</span>
        <span className={styles.amount}>{formatted}</span>
        <span className={styles.percent}>{displayPct}%</span>
      </div>

      <div className={styles.track}>
        <div
          className={styles.fill}
          style={{ ['--pct' as string]: pct }}
        />
      </div>

      <span className={styles.footnote}>of {totalFormatted}</span>

      <div
        className={`${styles.chip} ${chipLabel ? styles.chipVisible : ''}`}
        aria-live="polite"
      >
        {chipLabel ?? ''}
      </div>
    </div>
  );
}

export default BudgetProgressBar;
