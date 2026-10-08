# CLAUDE.md

## Project

NSW Primary Staffing Planner: a browser-only tool that helps a NSW primary school principal and exec team prepare next year's staffing. It covers entitlement, allocating staff to roles, leave cover, class structures and staff intentions. One person edits; others review exported files or printouts.

**[PLAN.md](PLAN.md) is the source of truth** for scope, data model, module specs, flags, build phases and open items. Read it before starting any work. If this file and PLAN.md disagree, PLAN.md wins. Update PLAN.md (not just code) when Bec changes a requirement.

## Hard rules

- **Never commit real staff data.** Only fictional sample data goes in the repo: no real names, exports, backups, CSVs or spreadsheets. `.gitignore` blocks common export formats; don't override it. Sample data lives in `src/data/sampleData.ts` and every name there is invented.
- **All data stays in the browser.** No server calls, analytics or third-party data services.
- **All reads and writes go through the `Repository` interface** (`src/data/repository.ts`). Only `src/data/dexieRepository.ts` may import Dexie.
- **FTE comes from days and is never entered** (except entitlement, below). Patterns are stored as 10 fortnight days (Week A Mon–Fri, Week B Mon–Fri). Weekly is the default and repeats Week A, so 1 weekday = 0.2 FTE and 1 fortnight day = 0.1 FTE. Whole days only. Use the helpers in `src/domain/dayPattern.ts`.
- **Ask Bec about open items before assuming them.** These are listed under "Open items for Bec" in PLAN.md. Use clearly marked placeholders (`TODO(open item)`) only when Bec agrees.
- **One build phase per branch and pull request.** Each phase ends with unit tests for its logic and a short manual test checklist in the PR.

## Decisions made with Bec (beyond PLAN.md)

- **Position types:** Classroom Teacher; Assistant Principal; Assistant Principal - Curriculum & Instruction; Deputy Principal; Teacher Librarian; RFF Teacher; Executive Release Teacher; QTSS Teacher; Learning & Support Teacher; EaLD Teacher.
  - The same list is used both for the entitlement breakdown and as the roles staff are allocated to.
- **Position categories:** `class_teacher` (Classroom Teacher), `executive` (both AP roles and DP) and `other_teaching` (the rest).
- **Entitlement is exact decimal FTE**, entered as the department supplies it (up to 3 decimals, e.g. 2.316) and stored as integer milli-FTE (`totalMilliFte`, `milliFte`; 1000 = 1.0 FTE). Use `parseFte`/`formatFte`/`milliFteOf` in `src/domain/fte.ts`; never do FTE arithmetic in floating point.
- **Roles:** staff are allocated to named `Role` records (position type + days), not directly to position types. A role day is held by one person (leave cover aside); a person never holds two roles on the same day and is only allocated on days they work. Rules live in `src/domain/allocation.ts`.
- **Full-year allocations for now:** allocations count as whole-year against entitlement until Phase 4 adds date-based cover.
- **Under-entitlement tolerance:** flag "under" only when short by ≥ 0.1 FTE (`UNDER_ENTITLEMENT_TOLERANCE`); always flag "over".
- **Flags** are computed in `src/domain/flags.ts` from the whole plan and shown in the warnings panel on every screen. Writes go through the observable repository, so screens and flags refresh automatically (`usePlanData`).
- **IT/privacy confirmation** for storing real names is still pending, so development uses fictional data only.

## Stack and layout

React 19 + TypeScript + Vite, Dexie (IndexedDB), React Router (hash routing, for GitHub Pages), and Vitest + Testing Library with fake-indexeddb.

- `src/domain/`: record types and pure logic (day patterns, later the flags). Keep this free of React and Dexie.
- `src/data/`: the repository interface, the Dexie implementation, the React provider and the sample data.
- `src/components/`, `src/pages/`: the UI. Each module is a page in the side navigation (`MODULES` in `src/App.tsx`).
- `.github/workflows/ci-deploy.yml`: runs tests and the build on every PR. It deploys to GitHub Pages on pushes to `main` only when the repo variable `PAGES_ENABLED` is `true` (off while the repo is private).

## Commands

```sh
npm install
npm run dev        # local dev server
npm test           # unit tests (Vitest)
npm run typecheck
npm run build      # typecheck + production build into dist/
```

Run `npm test` and `npm run build` before pushing.
