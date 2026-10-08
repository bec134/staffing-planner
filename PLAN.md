# NSW Primary Staffing Planner — Build Plan

Oct 3, 2026 · @Bec

## Purpose and users

A browser-based tool that helps a NSW primary school principal and exec team prepare staffing for the following school year: entitlement, class structures, staff intentions, role allocation and leave cover.

- **Users:** the principal and exec team.
- **Working model:** one person edits the working copy; others review exported files, printouts or PDFs.
- **School type:** primary only (for now).
- **Not in scope:** placing individual students into classes, timetabling, payroll, or connecting to department systems.

## Scope and build priority

Entitlement entry is built first because every other module checks against it. The rest follow in the order Bec ranked them.

1. **Staffing entitlement** — entered manually, as a total FTE and broken down by position type.
2. **Allocating staff to roles** — class teachers plus other teaching roles (release, support, etc.). Each role has days of the week (e.g. FTE 1.0  = all 10 days of the fortnight; 0.1 = 1 day per fortnight) that a teacher can be allocated to. Each teacher also has an FTE including days of the week worked or days of the week where leave is being taken.
3. **Leave cover** — assigning staff against positions where others are on leave: full-year, part-time/partial FTE, and term- or date-based cover.
4. **Class structures** — suggested class numbers per grade, generated from rules Bec supplies.
5. **Staff intentions** — staff plans for next year, entered manually and/or imported from an external form's results.

## Data and privacy

All data stays in the editor's browser; nothing is sent to a server. Staff names are the only personal data, and students appear only as enrolment counts per grade.

- **Storage:** browser storage (IndexedDB) on the editor's device.
- **Sharing:** export a file for reviewers and import it back to restore or move devices. Exported files contain staff names, so keep them in storage your department permits.
- **Optional:** passphrase-encrypted export files (browser Web Crypto API).
- **Future-proofing:** all reads and writes go through one data-access layer, so a shared database can replace browser storage later if approved.
- **Repo rule:** never commit real staff data to GitHub. Use fictional sample data only.
- **To check:** confirm with your school's IT or privacy contact what's permitted before using real names.

## Recommended tech stack

React with TypeScript, built with Vite and hosted free on GitHub Pages. It's well supported by Claude Code and needs no server.

| Need | Choice | Why |
| --- | --- | --- |
| Framework | React + TypeScript + Vite | Typed data model catches FTE/calculation errors early |
| Local storage | IndexedDB via Dexie.js | Handles more data than localStorage, survives reloads |
| CSV import | PapaParse | Reliable parsing of spreadsheet exports |
| Spreadsheet export | SheetJS (xlsx) | Excel-compatible output |
| PDF / print | Print stylesheet + browser Save as PDF; jsPDF if layout control is needed | Simplest path first |
| Testing | Vitest | Unit tests for allocation and flag logic |
| Hosting | GitHub Pages via GitHub Actions | Free, deploys on push |

Note: a GitHub Pages site is publicly reachable, but it holds no data — each user's data lives only in their own browser.

## Data model

Ten core records, all scoped to a planning year so a school can keep more than one year's plan.

| Record | Key fields |
| --- | --- |
| PlanningYear | year, school name, Term 1–4 dates (entered by the school; quick picks for cover), created/updated dates |
| Entitlement | planning year, total FTE, list of {position type, FTE} — exact decimal FTE as supplied by the department (up to 3 decimals), stored as thousandths |
| PositionType | name (list supplied by Bec), category (class teacher / executive / other teaching) |
| Staff | name, FTE, fortnight days worked, current role, employment type (permanent / TPT / temporary), preferences for next year |
| Leave | staff member, start date, end date, FTE affected, leave type (Long Service Leave, Leave without pay, Maternity Leave, Paternity Leave), fortnight days on leave |
| Role | name (e.g. "3/4B", "RFF 1"), position type, fortnight days it runs — added with Bec in Phase 3 so staff are allocated to named roles and unfilled role days can be found |
| Allocation | staff member, role, fortnight days, start date, end date (optional; omitted = whole year), covering-for (optional link to a Leave record) |
| ClassStructure | grade/grade combination, number of classes, students per class, rule set used |
| Enrolment | grade, projected student count (numbers only) |
| ClassRules | max class size per grade, permitted composite combinations, available classrooms/teachers |

Allocations carry dates so one record type covers full-year roles and date-based leave cover. Until Phase 4, every allocation is treated as full-year (Bec).

**FTE rule:** most staff work the same days every week, so the default is a weekly pattern (Mon–Fri, 1 day = 0.2 FTE). For the rare case that needs it (e.g. 0.5 FTE = 5 days per fortnight), a staff member or role can switch to a fortnightly pattern (Week A and Week B, 1 day = 0.1 FTE). Behind the scenes everything is stored as 10 fortnight days, with a weekly pattern simply repeated, so calculations work the same for both. Whole days only; FTE is always calculated from days, never entered separately. The one exception is entitlement, which is entered as exact decimal FTE (e.g. 2.316) because that is how the department supplies it; allocations are still whole days, so the dashboard can show small remainders.

## Module specifications

Each module is a screen in the app, reachable from a persistent side or top navigation.

### 1. Staffing entitlement

- Enter total FTE and an FTE figure per position type.
- Show whether the breakdown sums to the total.
- Running dashboard: entitlement vs allocated vs remaining FTE.

### 2. Allocating staff to roles

- Staff list with add/edit and CSV import.
- Each staff member has a work pattern: weekly by default (which weekdays they work), or fortnightly when needed (Week A and Week B differ).
- Each role has the days it runs, using the same weekly/fortnightly pattern; its FTE is calculated from those days.
- Assign staff to class teacher roles and other teaching roles by day; a teacher can only be allocated to days they work.
- One person can hold several part allocations (e.g. 0.6 class + 0.4 release), but never two roles on the same day.
- View by staff member, by role, and as a weekly grid (staff × weekdays) that expands to Week A/B only when someone works fortnightly.

### 3. Leave cover

- Record leave per staff member: start and end dates, plus which days are affected, weekly or fortnightly (FTE affected is calculated from those days).
- Show positions left uncovered by leave, by date range and day.
- Assign cover by day: full-year, partial FTE, or term/date-based.
- Timeline view of each position showing who covers it, on which days, and when.
- The person on leave keeps their position (Bec): their allocation stays and counts against entitlement; cover doesn't.
- The weekly grid shows both the person who holds the position (with their leave) and the person covering it (with whose leave), for the whole year or as at a chosen date.

### 4. Class structures

- Enter projected enrolment counts per grade.
- Enter rules: max class size per grade, permitted composite combinations, available classrooms/teachers.
- Generate one or more suggested structures that satisfy the rules; show why any rule can't be met.
- Accepting a structure creates the class teacher roles used in module 2.

### 5. Staff intentions

- Record each staff member's intentions for next year (fields to be supplied by Bec).
- Manual entry plus CSV import from an external form, with a column-mapping step.
- Intentions visible beside each staff member during allocation.

## Automatic flags

Three checks run whenever data changes and appear in a warnings panel, with a link to the record causing each one.

| Flag | Triggers when |
| --- | --- |
| Over/under entitlement | Allocated FTE differs from entitlement, in total or for a position type. Over is always flagged; under only when short by 0.1 FTE (one fortnight day) or more, since smaller decimal remainders can't be filled (Bec) |
| Staff over their FTE | A staff member is allocated on a day they don't work, or to two roles on the same day |
| Unfilled roles or leave gaps | A role has a day with no one assigned, including days left by leave |

Checks are date- and day-aware: two part-year roles only clash if their dates overlap and they share a working day. All flag logic gets unit tests.

## Import, export and reports

**Import**

- CSV for staff, leave, enrolment counts and staff intentions, with a preview and column-mapping step before anything is saved. Staff import (Phase 3) maps name, employment type, current role and days worked (one text column such as "Mon Tue Wed", or a yes/no column per weekday); fortnightly patterns are set by hand afterwards.
- Full backup file (JSON) to restore a plan or move it to another device.

**Export**

- Full backup file (JSON), optionally passphrase-encrypted.
- Spreadsheet (.xlsx) of staff, allocations, leave cover and class structures.

**Reports (print and PDF)**

- Staffing summary: entitlement vs allocation, with current flags.
- Allocation list by staff member and by role.
- Leave cover summary by position and date.
- Class structure summary per grade.

Exact report layouts are to be confirmed by Bec; build with a print stylesheet first.

## Build phases for Claude Code

Build in seven phases, one branch and pull request each, so every phase can be tested before the next starts. Save this plan in the repo (e.g. as `PLAN.md`) and reference it from `CLAUDE.md`.

1. **Foundation** — Vite + React + TypeScript scaffold, Dexie data layer behind a repository interface, navigation shell, fictional sample data, GitHub Pages deploy via Actions.
2. **Entitlement** — entry screen, position types, entitlement vs allocated dashboard.
3. **Staff and allocation** — staff records, CSV import with mapping, role allocation with split FTE, over/under-entitlement and over-FTE flags.
4. **Leave cover** — leave records, uncovered-position view, date-based cover assignment, timeline, leave-gap flags.
5. **Class structures** — enrolment counts, rules entry, suggestion engine, accepting a structure creates class roles.
6. **Staff intentions** — manual entry, CSV import, display alongside allocation.
7. **Exports and reports** — JSON backup/restore (with optional encryption), .xlsx export, print/PDF reports.

Each phase ends with unit tests for its logic and a short manual test checklist.

## Open items for Bec

These details weren't assumed; Claude Code should ask for them, or use placeholders, until they're supplied.

- [ ] Confirm with IT/privacy contact that storing staff names in the browser and in exported files is permitted.
- [x] List of position types used in the entitlement breakdown. *Supplied: Classroom Teacher; Assistant Principal; Assistant Principal - Curriculum & Instruction; Deputy Principal; Teacher Librarian; RFF Teacher; Executive Release Teacher; QTSS Teacher; Learning & Support Teacher; EaLD Teacher. Categories: class teacher (Classroom Teacher), executive (APs, DP), other teaching (the rest).*
- [x] List of other teaching roles to allocate (release, support, etc.). *Same list as the position types.*
- [ ] Class structure rules: max class size per grade, permitted composite combinations, how classroom/teacher limits apply.
- [ ] Fields captured for staff intentions, and a sample export from the form you'll use.
- [x] Leave types to track, if a fixed list is wanted. *Supplied: Long Service Leave; Leave without pay; Maternity Leave; Paternity Leave.*
- [ ] Sample CSV layouts for staff and leave imports.
- [ ] Preferred layouts for printed/PDF reports.
- [ ] Whether passphrase-encrypted exports are wanted in the first release.
- [x] Confirm that allocations covering leave should not count against entitlement. *Confirmed: the person on leave still holds their position.*
