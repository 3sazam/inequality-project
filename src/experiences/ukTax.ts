/**
 * UK tax calculations (England / Wales / NI rates, ~2025/26 bands).
 * All inputs are ANNUAL gross in £. Outputs are ANNUAL amounts in £.
 * Divide by 12 at the call site for a monthly figure.
 *
 * Edit the constants below if bands change in later tax years.
 */

/* ── Income Tax ─────────────────────────────────────────── */

const PERSONAL_ALLOWANCE        = 12570;
const PA_TAPER_START            = 100000;
const BASIC_RATE_LIMIT          = 50270;   // PA + 37,700 basic band
const HIGHER_RATE_LIMIT         = 125140;

export function calculateIncomeTax(annualGross: number): number {
  // Personal allowance tapers £1 for every £2 earned above £100k (gone at £125,140).
  const pa = annualGross <= PA_TAPER_START
    ? PERSONAL_ALLOWANCE
    : Math.max(0, PERSONAL_ALLOWANCE - (annualGross - PA_TAPER_START) / 2);

  const taxable = Math.max(0, annualGross - pa);
  let tax = 0;

  // Basic band: pa → BASIC_RATE_LIMIT at 20%
  const basicBand = Math.min(taxable, BASIC_RATE_LIMIT - pa);
  tax += Math.max(0, basicBand) * 0.20;

  // Higher band: BASIC_RATE_LIMIT → HIGHER_RATE_LIMIT at 40%
  if (taxable > BASIC_RATE_LIMIT - pa) {
    const higherBand = Math.min(
      taxable - (BASIC_RATE_LIMIT - pa),
      HIGHER_RATE_LIMIT - BASIC_RATE_LIMIT
    );
    tax += higherBand * 0.40;
  }

  // Additional band: above HIGHER_RATE_LIMIT at 45%
  if (taxable > HIGHER_RATE_LIMIT - pa) {
    tax += (taxable - (HIGHER_RATE_LIMIT - pa)) * 0.45;
  }

  return tax;
}

/* ── National Insurance (Class 1 employee) ─────────────── */

const NI_PRIMARY_THRESHOLD = 12570;
const NI_UPPER_LIMIT       = 50270;

export function calculateNI(annualGross: number): number {
  let ni = 0;
  if (annualGross > NI_PRIMARY_THRESHOLD) {
    const mainBand = Math.min(annualGross, NI_UPPER_LIMIT) - NI_PRIMARY_THRESHOLD;
    ni += mainBand * 0.08;
  }
  if (annualGross > NI_UPPER_LIMIT) {
    ni += (annualGross - NI_UPPER_LIMIT) * 0.02;
  }
  return ni;
}

/* ── Student Loans ──────────────────────────────────────── */

export type StudentLoanPlan = 'none' | 'plan2' | 'plan5';

const PLAN_2_THRESHOLD = 27295;
const PLAN_5_THRESHOLD = 25000;

export function calculateStudentLoan(annualGross: number, plan: StudentLoanPlan): number {
  if (plan === 'none') return 0;
  const threshold = plan === 'plan2' ? PLAN_2_THRESHOLD : PLAN_5_THRESHOLD;
  return Math.max(0, annualGross - threshold) * 0.09;
}

/* ── Council Tax (England averages by band, MONTHLY £) ─── */

export type CouncilBand = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';

export const COUNCIL_TAX_MONTHLY: Record<CouncilBand, number> = {
  A: 125,
  B: 146,
  C: 167,
  D: 188,
  E: 229,
  F: 271,
  G: 313,
  H: 375,
};
