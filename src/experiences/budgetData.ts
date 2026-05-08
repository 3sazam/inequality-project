/**
 * All tunable budget values live here (UK — GBP, monthly unless noted).
 *
 * Two paths:
 *   • Average mode → `buildExpenses(income)` uses the DEFAULTS below.
 *   • Custom  mode → `buildExpenses(income, overrides)` replaces individual fields.
 *
 * To plug in a Blender model for a section:
 *   1. Export `.glb` from Blender (glTF 2.0 binary).
 *   2. Place it in `public/models/` (e.g. `public/models/housing.glb`).
 *   3. Update SECTION_MODELS below to that path.
 */

import {
  calculateIncomeTax,
  calculateNI,
  calculateStudentLoan,
  COUNCIL_TAX_MONTHLY,
  type StudentLoanPlan,
  type CouncilBand,
} from './ukTax';

export const PLACEHOLDER_MODEL = '/IMIP_Placeholder.glb';

/* ── Section → Blender model map ─────────────────── */

export const SECTION_MODELS: Record<string, string> = {
  'section-income':      PLACEHOLDER_MODEL,
  'section-housing':     PLACEHOLDER_MODEL,
  'section-utilities':   PLACEHOLDER_MODEL,
  'section-groceries':   PLACEHOLDER_MODEL,
  'section-transport':   PLACEHOLDER_MODEL,
  'section-income-tax':  PLACEHOLDER_MODEL,
  'section-ni':          PLACEHOLDER_MODEL,
  'section-pension':     PLACEHOLDER_MODEL,
  'section-student':     PLACEHOLDER_MODEL,
  'section-council':     PLACEHOLDER_MODEL,
  'section-remaining':   PLACEHOLDER_MODEL,
};

/* ── Slider defaults + ranges ────────────────────── */

export const DEFAULTS = {
  rent:         1200,
  utilities:    275,
  groceries:    300,
  transport:    150,
  pensionPct:   5,
  studentPlan:  'plan2' as StudentLoanPlan,
  councilBand:  'D' as CouncilBand,
};

export const RENT_RANGE      = { min: 400, max: 2500, step: 50 };
export const UTILITIES_RANGE = { min: 0,   max: 500,  step: 5 };
export const GROCERIES_RANGE = { min: 100, max: 700,  step: 10 };
export const TRANSPORT_RANGE = { min: 0,   max: 400,  step: 10 };

export const PENSION_OPTIONS: number[] = [0, 3, 5, 8];
export const STUDENT_PLAN_OPTIONS: { value: StudentLoanPlan; label: string }[] = [
  { value: 'none',  label: 'None' },
  { value: 'plan2', label: 'Plan 2' },
  { value: 'plan5', label: 'Plan 5' },
];
export const COUNCIL_BAND_OPTIONS: CouncilBand[] = ['A','B','C','D','E','F','G','H'];

/* ── Utilities (for reference — summed into one section) ── */

export const UTILITY_ITEMS = [
  { label: 'Energy',   amount: 50 },
  { label: 'Gas',      amount: 80 },
  { label: 'Water',    amount: 35 },
  { label: 'Electric', amount: 80 },
  { label: 'Wi-Fi',    amount: 30 },
];
export const UTILITY_TOTAL = UTILITY_ITEMS.reduce((s, i) => s + i.amount, 0);

/* ── Reference figures for the Remaining section ─── */

export const UK_MEDIAN_MONTHLY_TAKEHOME = 2300;
// FTSE 100 CEO median pay ~= £4.2m/yr → hourly ≈ £2,154.
export const FTSE_CEO_HOURLY = 2154;

/* ── Expense shape + kinds ───────────────────────── */

export type ExpenseKind =
  | 'rent'
  | 'utilities'
  | 'groceries'
  | 'transport'
  | 'incomeTax'
  | 'ni'
  | 'pension'
  | 'student'
  | 'council';

export type Expense = {
  id: string;
  kind: ExpenseKind;
  group: string;
  label: string;
  /** Factual copy shown in Average mode (no controls). */
  description: string;
  /** Action-oriented copy shown in Custom mode. Falls back to `description` if absent. */
  descriptionCustom?: string;
  amount: number;          // monthly £, already rounded
  model?: string;
  derived?: boolean;       // true = computed from income, not directly editable
};

/* ── Overrides (custom-mode user input) ──────────── */

export type ExpenseOverrides = {
  rent?:        number;
  utilities?:   number;
  groceries?:   number;
  transport?:   number;
  pensionPct?:  number;
  studentPlan?: StudentLoanPlan;
  councilBand?: CouncilBand;
};

/* ── Build the scene's expense list from live state ── */

export function buildExpenses(
  monthlyIncome: number,
  overrides: ExpenseOverrides = {}
): Expense[] {
  const rent        = overrides.rent        ?? DEFAULTS.rent;
  const utilities   = overrides.utilities   ?? DEFAULTS.utilities;
  const groceries   = overrides.groceries   ?? DEFAULTS.groceries;
  const transport   = overrides.transport   ?? DEFAULTS.transport;
  const pensionPct  = overrides.pensionPct  ?? DEFAULTS.pensionPct;
  const studentPlan = overrides.studentPlan ?? DEFAULTS.studentPlan;
  const councilBand = overrides.councilBand ?? DEFAULTS.councilBand;

  const annual       = monthlyIncome * 12;
  const incomeTax    = Math.round(calculateIncomeTax(annual) / 12);
  const ni           = Math.round(calculateNI(annual) / 12);
  const pension      = Math.round((monthlyIncome * pensionPct) / 100);
  const studentLoan  = Math.round(calculateStudentLoan(annual, studentPlan) / 12);
  const council      = COUNCIL_TAX_MONTHLY[councilBand];

  return [
    {
      id: 'section-housing',
      kind: 'rent',
      group: 'Housing',
      label: 'Rent / Mortgage',
      description: 'Usually the biggest line item. For most people it sits around a third of take-home pay.',
      descriptionCustom: 'Drag to what you actually pay each month.',
      amount: rent,
      model: SECTION_MODELS['section-housing'],
    },
    {
      id: 'section-utilities',
      kind: 'utilities',
      group: 'Bills',
      label: 'Utilities',
      description: 'Energy, gas, water, electric, Wi-Fi. The everyday keep-the-lights-on bills.',
      descriptionCustom: 'Slide to your actual bills. Energy, gas, water, electric, Wi-Fi.',
      amount: utilities,
      model: SECTION_MODELS['section-utilities'],
    },
    {
      id: 'section-groceries',
      kind: 'groceries',
      group: 'Essentials',
      label: 'Groceries',
      description: 'What a single adult typically spends on a weekly food shop across the month.',
      descriptionCustom: 'Slide to your typical monthly food spend.',
      amount: groceries,
      model: SECTION_MODELS['section-groceries'],
    },
    {
      id: 'section-transport',
      kind: 'transport',
      group: 'Getting around',
      label: 'Transport',
      description: 'Season ticket, fuel, the occasional taxi. The cost of getting around.',
      descriptionCustom: 'Slide down if you walk or cycle, up if you commute.',
      amount: transport,
      model: SECTION_MODELS['section-transport'],
    },
    {
      id: 'section-income-tax',
      kind: 'incomeTax',
      group: 'Taxes',
      label: 'Income Tax',
      description: 'Taken before you see it. Starts at 20% and rises with each bracket above.',
      // Derived — no user control even in Custom mode, so keep one copy.
      amount: incomeTax,
      model: SECTION_MODELS['section-income-tax'],
      derived: true,
    },
    {
      id: 'section-ni',
      kind: 'ni',
      group: 'Taxes',
      label: 'National Insurance',
      description: 'A second deduction on top of income tax, quietly funding the NHS and state pension.',
      // Derived — no user control even in Custom mode.
      amount: ni,
      model: SECTION_MODELS['section-ni'],
      derived: true,
    },
    {
      id: 'section-pension',
      kind: 'pension',
      group: 'Saving',
      label: 'Pension',
      description: 'Deferred income, yours in retirement. Your employer has to top it up too.',
      descriptionCustom: 'Pick the percentage you put in each month.',
      amount: pension,
      model: SECTION_MODELS['section-pension'],
    },
    {
      id: 'section-student',
      kind: 'student',
      group: 'Debts',
      label: 'Student Loan',
      description: 'Repaid at 9% on whatever you earn above the threshold. Nothing owed below it.',
      descriptionCustom: 'Pick your repayment plan, or none if you never took one out.',
      amount: studentLoan,
      model: SECTION_MODELS['section-student'],
    },
    {
      id: 'section-council',
      kind: 'council',
      group: 'Taxes',
      label: 'Council Tax',
      description: "Paid to your local council. The band is based on a valuation that hasn't changed since 1991.",
      descriptionCustom: 'Pick the band for where you live.',
      amount: council,
      model: SECTION_MODELS['section-council'],
    },
  ];
}

/** Default expense list (Average mode, median-ish income). */
export const EXPENSES: Expense[] = buildExpenses(3500);
