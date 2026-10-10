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

- **Position types:** Principal; Classroom Teacher; Assistant Principal; Assistant Principal - Curriculum & Instruction; Deputy Principal; Teacher Librarian; RFF Teacher; Executive Release Teacher; QTSS Teacher; Learning & Support Teacher; EaLD Teacher; Part-time Teacher; School Counsellor.
  - The same list is used both for the entitlement breakdown and as the roles staff are allocated to.
- **Position categories:** `class_teacher` (Classroom Teacher), `executive` (Principal, both AP roles and DP) and `other_teaching` (the rest).
- **Changing a position's days** moves its matches with it (`planPositionDaysChange`, confirmed first); matches left outside a position's days are flagged (`outside_position_days`).
- **Splitting a position** (`planSplitPosition`, `SplitPosition.tsx`): parts may share days but must add up to the position's FTE; part 1 keeps the original, the rest become new positions of the same type; each matched day goes to the first part with that day free, else comes off (confirmed first).
- **Higher duties (Bec):** whole year only; people only step up (`seniority`: Principal 4, Deputy 3, AP / AP C&I 2, others 1). On Match staff, dropping someone on an executive position on days they're already matched offers it (`planHigherDuties`, `src/domain/higherDuties.ts`). It creates a `Leave` with `leaveType: 'higher_duties'` and `higherDutiesPositionId`, plus a match with `higherDutiesLeaveId` (which also has `coveringLeaveId` when it backfills an executive on whole-year leave); the substantive day greys and is backfilled as usual. `clashDays` doesn't count a higher-duties allocation against the substantive one. `tidyHigherDutiesIn` (`src/data/higherDutiesStore.ts`) keeps leave, backfills and Part 2 cover in line after Part 1 changes. In Part 2 (`placesHigherDuties`), placing them in an executive role on those days gives an allocation with `higherDutiesLeaveId`. `LEAVE_TYPES` (the leave form and CSV) excludes higher duties; staff saves leave it alone.
- **Order of position types** is shared by the entitlement, Part 1 and Part 2 grids; Match staff has ↑/↓ on each group heading (`moveGroup`, which skips types with no positions).
- **Plans made before a standard type existed** get it from **Add standard position types** on the Entitlement page (`missingDefaultPositionTypes`).
- **Entitlement is exact decimal FTE**, entered as the department supplies it (up to 3 decimals, e.g. 2.316) and stored as integer milli-FTE (`totalMilliFte`, `milliFte`; 1000 = 1.0 FTE). Use `parseFte`/`formatFte`/`milliFteOf` in `src/domain/fte.ts`; never do FTE arithmetic in floating point.
- **Roles:** staff are allocated to named `Role` records (position type + days), not directly to position types. A role day is held by one person (leave cover aside); a person never holds two roles on the same day and is only allocated on days they work. Rules live in `src/domain/allocation.ts`.
- **Full-year allocations for now:** allocations count as whole-year against entitlement until Phase 4 adds date-based cover.
- **Under-entitlement tolerance:** flag "under" only when short by ≥ 0.1 FTE (`UNDER_ENTITLEMENT_TOLERANCE`); always flag "over".
- **Flags** are computed in `src/domain/flags.ts` from the whole plan and shown in the warnings panel on every screen. Writes go through the observable repository, so screens and flags refresh automatically (`usePlanData`).
- **Leave types:** fixed list `LEAVE_TYPES` — Long Service Leave, Leave without pay, Maternity Leave, Paternity Leave.
- **Leave cover:** the person on leave keeps their position (their allocation stays and counts against entitlement). Cover is an `Allocation` with `coveringLeaveId`, start/end dates and days, and is not counted against entitlement. Gap and cover rules live in `src/domain/leave.ts`; dates are ISO strings handled by `src/domain/dates.ts`.
- **Weekly grid** shows the position holder (with leave and who covers) and the coverer (with whose leave), for the whole year or as at a date.
- **Class structures:** user enters total classes and students per grade. Guides K 20, Y1 22, Y2 24, Y3–6 30; up to 2 over the guide before preferring a composite; composites only 1/2, 3/4, 5/6, using the lower guide (1/2 = 22). The engine in `src/domain/classStructure.ts` scores every structure that totals the class count and offers the best 10. The accepted structure is one `ClassStructure` record per class, linked to a class teacher role.
- **Role grid** (`src/domain/roleGrid.ts`, `RoleGrid.tsx`): drag-and-drop or pick-a-name allocation by role and day; dropping on a holder's leave day creates cover for that leave's dates. Whole-year leave is greyed; part-year leave shows in colour with dates. A 1.0 FTE teacher dropped (or picked) on an empty class day fills the whole week (`planFill`); dropping on a role's name fills all free days for anyone.
- **CSV templates** are built in code (`STAFF_TEMPLATES`) and offered as downloads; never add template `.csv` files to the repo.
- **Two parts (Bec):** Part 1 matches staff to entitlement positions by day (`positions` and `matches` tables, `src/domain/matching.ts`, `/matching`); Part 2 places them in roles (`roles`, `allocations`). **Entitlement counts Part 1 matches.** Only whole-year leave greys out in Part 1 and can be backfilled (a match with `coveringLeaveId`). Part 1 tiles are coloured by employment type; leave greys any type. Staff can be nominated for transfer (`nominatedForTransfer`, `transferNotes`). Part 2 offers matched staff by default and flags placed ≠ matched FTE. Both parts use the shared `AssignmentGrid`.
- **Employment types:** Permanent, TWT (Temporary Workforce Transition; stored as `twt`, formerly TPT) and Temporary.
- **Staff and their plans for next year (Bec):** one form and one CSV import on the Staff page (`StaffForm`, `StaffImport`, `src/domain/staffImport.ts`, `STAFF_TEMPLATE`). Saving goes through `planSaveStaff` (`src/domain/intentions.ts`), which updates the staff record, whole-year leave (type per person, LWOP default) and a linked `StaffIntention` holding permanent FTE, work preference, preferred days and grade preferences, so they're always applied. Days worked = preferred days + whole-year leave days. **Substantive role** (`Staff.currentRole`) is one of `SUBSTANTIVE_ROLES`. There is no separate Staff intentions page (`/intentions` redirects to `/staff`); legacy unapplied intentions show on the Staff page (`PendingDetails`). Grade preferences show on Part 2 name tiles and are flagged when placed outside them.
- **Exports and reports (Phase 7):** reports are built once as tables in `src/domain/reports.ts` and rendered both on screen/print (`/reports`, print stylesheet, landscape grids) and to Excel (`src/data/excelExport.ts`, exceljs loaded on demand). Backups (`src/data/backup.ts`) are JSON, optionally password-protected (AES-GCM, PBKDF2); restored files are checked before saving. **Restore from backup is on the home page (Bec).** File names end `.backup.json` / `.xlsx`, which `.gitignore` blocks.
- **Menu (Bec):** staff are added in **Part 1** on the Staff page (`/staff`, `src/pages/staff/`); Part 2's page is **Roles & placement** (`/allocation`: role grid, roles, staff grid). Old `/allocation/staff/:id`, `/allocation/import` and `/allocation/role-grid` addresses redirect. The Overview shows the year's steps with ticks (`src/domain/progress.ts`).
- **Help (Bec):** step-by-step guides in `src/help/helpContent.ts`, shown at `/help`, with a `HelpLink` under each page title. **When you change a screen, update its guide**; `helpContent.test.ts` fails if a guide names a button or field that no longer exists.
- **Privacy (Bec):** fine as long as nothing is stored on a server beyond the session. The repo still holds fictional data only.

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
