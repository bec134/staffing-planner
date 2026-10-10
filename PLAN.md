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
- **Password-protected backups (Bec: optional, in the first release):** encrypted in the browser with the Web Crypto API (AES-GCM, key from PBKDF2-SHA-256). A forgotten password can't be recovered.
- **Future-proofing:** all reads and writes go through one data-access layer, so a shared database can replace browser storage later if approved.
- **Repo rule:** never commit real staff data to GitHub. Use fictional sample data only.
- **Privacy (Bec):** acceptable as long as no data is stored on a server beyond the session. The app stores nothing on a server; plans stay in the browser and in files the user saves.

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

Twelve core records, all scoped to a planning year so a school can keep more than one year's plan.

| Record | Key fields |
| --- | --- |
| PlanningYear | year, school name, Term 1–4 dates (entered by the school; quick picks for cover), created/updated dates |
| Entitlement | planning year, total FTE, list of {position type, FTE} — exact decimal FTE as supplied by the department (up to 3 decimals), stored as thousandths |
| PositionType | name (list supplied by Bec), category (class teacher / executive / other teaching) |
| Staff | name, FTE, fortnight days worked, current role, employment type (permanent / TWT = Temporary Workforce Transition / temporary), preferences for next year, nominated for transfer (with notes) |
| Leave | staff member, start date, end date, FTE affected, leave type (Long Service Leave, Leave without pay, Maternity Leave, Paternity Leave), fortnight days on leave |
| Role | name (e.g. "3/4B", "RFF 1"), position type, fortnight days it runs — added with Bec in Phase 3 so staff are allocated to named roles and unfilled role days can be found |
| Allocation | staff member, role, fortnight days, start date, end date (optional; omitted = whole year), covering-for (optional link to a Leave record) |
| EntitlementPosition | Part 1: a position within an entitlement line (name, position type, fortnight days) |
| EntitlementMatch | Part 1: staff member matched to a position on some days; a backfill links to whole-year leave |
| ClassStructure | one record per class in the accepted structure: name, students per grade (two grades for a composite), linked class teacher role |
| Enrolment | grade, projected student count (numbers only) |
| ClassRules | total number of classes, guide (average) size per grade, allowance over guide, permitted composites |

Allocations carry dates so one record type covers full-year roles and date-based leave cover. Until Phase 4, every allocation is treated as full-year (Bec).

**FTE rule:** most staff work the same days every week, so the default is a weekly pattern (Mon–Fri, 1 day = 0.2 FTE). For the rare case that needs it (e.g. 0.5 FTE = 5 days per fortnight), a staff member or role can switch to a fortnightly pattern (Week A and Week B, 1 day = 0.1 FTE). Behind the scenes everything is stored as 10 fortnight days, with a weekly pattern simply repeated, so calculations work the same for both. Whole days only; FTE is always calculated from days, never entered separately. The one exception is entitlement, which is entered as exact decimal FTE (e.g. 2.316) because that is how the department supplies it; allocations are still whole days, so the dashboard can show small remainders.

## Two parts of staffing (Bec)

Planning happens in two parts, and the app's menu is grouped the same way.

1. **Part 1 · Match staff to entitlement.** Each entitlement line becomes positions by day (Classroom Teacher 6.0 → six Mon–Fri positions; RFF 1.316 → one Mon–Fri position plus one of 3 fortnight days, with 0.016 left as an unfillable remainder). Staff are matched to positions on the days they work — permanent first, then TWT, then temporary (tiles colour-coded by employment type). Part-timers fill part of a position (e.g. Mon–Wed = 0.6 of a Classroom Teacher position). **Whole-year leave** (e.g. full-year maternity, or LWOP two days a week all year) greys out the matched days for any employment type, and another teacher can be matched there as a backfill, which doesn't use extra entitlement. Permanent or TWT staff left unmatched are flagged and can be **nominated for transfer** (with notes); a backfill against whole-year leave can absorb what would otherwise be a surplus. **The entitlement dashboard and over/under warnings count Part 1 matches.** Matching is by hand (no automatic suggestions).
2. **Part 2 · Place staff in classes and roles.** Class structures, the role and staff grids, and part-year leave cover. Only staff matched in Part 1 (and not nominated for transfer) are offered by default. Placement is independent of matching (someone matched to RFF may be placed on a class); each person's whole-year placed FTE is checked against their matched FTE.

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
- **Role grid** (Bec): roles × weekdays with staff-name tiles. Allocate by dragging a name onto a role and day, or by choosing a name; drag a tile to move it, × to remove a day. Each change updates the person's allocated days and FTE; if they don't work that day, the app offers to add it to their days worked. A holder on leave for the whole year shows as a greyed tile on their leave days with their cover in colour; leave for part of the year shows in colour with its dates. Dropping someone onto a leave day assigns cover for that leave's dates. Weekdays are combined by default (tiles marked "A only"/"B only" where they differ), with an option to show Week A and Week B separately. A full-time (1.0 FTE) teacher placed on an empty day of a class fills every day of the week they can take; dropping any name on a role's name fills all the days they're free. Days can then be removed one at a time with ×.

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
- Rules from Bec: the user enters the **total number of classes** and students per grade. Guide (average) sizes: Kindergarten 20, Year 1 22, Year 2 24, Years 3–6 30. Composites only as 1/2, 3/4 or 5/6; a composite uses the lower of its two guides (so 1/2 uses 22). A class may go 1 or 2 over its guide rather than creating a composite where possible.
- The user accepts a suggestion or asks for another, then can edit the accepted structure by hand (rename, move students, add or remove classes). "Create class roles" makes a Classroom Teacher role per class; renaming a class renames its role.

### 5. Staff intentions

- Fields (Bec): Name; Employment Status (Permanent, TWT, Temporary); Permanent FTE (Permanent or TWT only); Work Preference (Full or Part time); Preferred days; Whole year leave days (if applicable) and their leave type (LWOP if blank); Grade Preference 1–3.
- Entered by hand or imported from CSV (column mapping, preview, downloadable template built in code). No external form.
- Intentions are saved on their own and **applied on confirm**: applying sets the person's employment status and days worked (preferred days + whole-year leave days) and their whole-year leave for the school year, adding new staff where needed. That feeds **Part 1**. Cover and backfills for days no longer on leave are removed. Permanent/TWT staff whose days don't add up to their permanent FTE are flagged.
- Grade preferences feed **Part 2**: shown on staff name tiles in the role grid, and flagged when someone is placed on a class with none of their preferred grades.

## Automatic flags

Checks run whenever data changes and appear in a warnings panel, with a link to the record causing each one.

| Flag | Triggers when |
| --- | --- |
| Over/under entitlement | Part 1 matched FTE differs from entitlement, in total or for a position type. Over is always flagged; under only when short by 0.1 FTE (one fortnight day) or more, since smaller decimal remainders can't be filled (Bec) |
| Staff over their FTE | A staff member is allocated on a day they don't work, or to two roles on the same day |
| Unmatched staff (Part 1) | A permanent or TWT staff member has days not matched to the entitlement and isn't nominated for transfer |
| Temporary before permanent (Part 1) | Temporary staff are matched while permanent or TWT staff are still unmatched |
| Intentions not applied | A staff member's intentions differ from the plan, or don't add up (e.g. days ≠ permanent FTE) |
| Outside grade preferences | Someone is placed on a class with none of their preferred grades |
| Placement differs from matching | A person's whole-year placed FTE in Part 2 differs from their Part 1 matched FTE, or someone nominated for transfer is still placed |
| Unfilled roles or leave gaps | A role has a day with no one assigned, including days left by leave |

Checks are date- and day-aware: two part-year roles only clash if their dates overlap and they share a working day. All flag logic gets unit tests.

## Import, export and reports

**Import**

- CSV for staff and staff intentions (leave comes from intentions or is entered by hand; no leave CSV, Bec), with a preview and column-mapping step before anything is saved. Staff import (Phase 3) maps name, employment type, current role and days worked (one text column such as "Mon Tue Wed", or a yes/no column per weekday); fortnightly patterns are set by hand afterwards. Two downloadable staff templates (one per days layout) are generated by the app; CSV files are never committed to the repo.
- Full backup file (JSON) to restore a plan or move it to another device. **Restore from a backup file is offered prominently on the home page (Bec).** The file is checked before anything is saved, and replacing an existing plan asks first.

**Export**

- Full backup file (JSON), optionally passphrase-encrypted.
- Excel workbook (.xlsx) with one sheet per report (below), the same tables as the printed reports, with grids coloured as in the app. Read-only for reviewers; changes in Excel aren't imported back.

**Reports (print, PDF and Excel; Bec)**

- Staffing summary: entitlement vs Part 1 matches, with current warnings.
- Part 1 matching: positions × days grid coloured by employment type (whole-year leave and backfills), staff not fully matched, nominated transfers with notes.
- Part 2 placement: roles × days grid (leave and cover with dates), placements by staff member and by role.
- Leave cover summary: each leave with dates, days, cover, gaps and Part 1 backfills.
- Class structure summary: classes, grades, students and teachers; enrolments by grade.
- Staff and intentions: staff details with their intentions and whether they're applied.

Each report has the school, year and date at the top; grids print landscape (A4). PDFs come from the browser's print dialog (Save as PDF). Reports are built once as tables (`src/domain/reports.ts`) and rendered both on screen/print and to Excel.

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

- [x] Confirm that storing staff names in the browser and in exported files is permitted. *Bec: fine as long as no data is stored on a server beyond the session.*
- [x] List of position types used in the entitlement breakdown. *Supplied: Classroom Teacher; Assistant Principal; Assistant Principal - Curriculum & Instruction; Deputy Principal; Teacher Librarian; RFF Teacher; Executive Release Teacher; QTSS Teacher; Learning & Support Teacher; EaLD Teacher. Categories: class teacher (Classroom Teacher), executive (APs, DP), other teaching (the rest).*
- [x] List of other teaching roles to allocate (release, support, etc.). *Same list as the position types.*
- [x] Class structure rules: max class size per grade, permitted composite combinations, how classroom/teacher limits apply. *Supplied: see module 4 (guides K 20, Y1 22, Y2 24, Y3–6 30; 1–2 over allowed; composites 1/2, 3/4, 5/6; 1/2 composite guide 22; user sets total classes).*
- [x] Fields captured for staff intentions. *Supplied (see module 5); CSV upload or manual entry instead of a form.*
- [x] Leave types to track, if a fixed list is wanted. *Supplied: Long Service Leave; Leave without pay; Maternity Leave; Paternity Leave.*
- [x] Sample CSV layouts for staff and leave imports. *Staff templates are built in; no leave import (Bec).*
- [x] Preferred layouts for printed/PDF reports. *Bec: the suggested set and layout, as both PDF and Excel (especially grids).*
- [x] Whether passphrase-encrypted exports are wanted in the first release. *Yes, optional (Bec).*
- [x] Confirm that allocations covering leave should not count against entitlement. *Confirmed: the person on leave still holds their position.*
