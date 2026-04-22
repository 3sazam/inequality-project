# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Dev server → http://localhost:5173
npm run build     # tsc + vite build
npm run lint      # ESLint
npm run preview   # Preview production build
```

No test runner is configured.

## Rules

**Frontend changes require E2E verification.**
After any change to `src/`, take a Playwright screenshot of the affected page before reporting done. Run navigation + screenshot in parallel where possible.

```
mcp__playwright__browser_navigate → http://localhost:5173
mcp__playwright__browser_take_screenshot
```

**Never guess at URLs.** Only use URLs from user messages or local files.

**No speculative code.** Don't add error handling, abstractions, or features beyond what's asked.

**No AI-looking UI.** Avoid Inter font, glassmorphism, indigo/purple gradients, and perfect radial backgrounds.

**No trailing summaries.** Don't recap what you just did — the diff speaks for itself.

**Confirm before destructive actions.** Force push, branch delete, dropping data — always ask first.

## Architecture

### User flow

`/` → `/3d-experience` → `/affordability` → `/wealth-inequality`

Each page receives the previous page's calculated data via React Router `location.state`. The entry point is `/` (Home), which collects a monthly income figure and passes it forward as `userInput`.

### Data layer (`src/experiences/`)

- **`budgetData.ts`** — single source of truth for all expense categories. Defines each expense's default value, min/max range, label, and the `SECTION_MODELS` map that assigns a `.glb` URL to each scroll section.
- **`ukTax.ts`** — UK tax, National Insurance, council tax, and student loan calculations. Called by `ExpenditureScene01.tsx` to derive net deductions from gross income.

### Main experience (`ExpenditureScene01.tsx`)

The core page is a scroll-driven budget visualiser with three independently composited layers (all `position: fixed`, differentiated by `z-index`):

| Layer | z-index | What it is |
|---|---|---|
| Particle backdrop | 1 | Dedicated `<Canvas>` with ~700 custom-shader particles; parallaxes with scroll |
| Ambient word | 0 | Large blurred text (INCOME, RENT, TAX…) that cross-fades per section |
| 3D model canvas | 2 | Main `<Canvas>`; swaps a glTF model per section; camera Y driven by GSAP ScrollTrigger |

Scroll sections are plain DOM elements above the canvases (z-index 10). GSAP ScrollTrigger snaps scroll to section centres and drives all visual state transitions: active model, ambient word, camera position, and the `BudgetProgressBar` remaining balance.

Two modes exist — **Average** (pre-filled defaults) and **Custom** (user-adjustable sliders/buttons). Switching modes re-runs the full budget calculation.

### `BudgetProgressBar` component (`src/components/BudgetProgressBar/`)

Reusable fixed-right bar showing remaining income percentage and amount. Accepts `income`, `remaining`, and an optional `chipLabel` (shown briefly when an expense is deducted). Animated internally via `useTweenedNumber` (requestAnimationFrame lerp) and GSAP for the chip.

### 3D models

Models live in `public/` as `.glb` files. `useGLTF` (from `@react-three/drei`) loads them asynchronously inside a `<Suspense>` boundary. The auto-generated wrapper is `src/experiences/IMIP_Placeholder.tsx` (gltfjsx output) — regenerate it with gltfjsx when swapping the placeholder model.
