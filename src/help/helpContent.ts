/**
 * Help topics (Bec): step-by-step guides for each part of the app, plus
 * warnings, privacy and a glossary. Kept as plain text so it can be
 * searched and tested; **double asterisks** mark button and field names,
 * which are shown in bold.
 *
 * When a screen changes, update its guide here too.
 */

export interface HelpSection {
  heading: string;
  /** Paragraphs shown before the steps. */
  text?: string[];
  /** Numbered steps. */
  steps?: string[];
  /** Bulleted points. */
  points?: string[];
  /** A highlighted tip. */
  tip?: string;
}

export interface HelpTopic {
  id: string;
  title: string;
  /** One line for the contents page. */
  summary: string;
  group: 'Start here' | 'Part 1 · Entitlement' | 'Part 2 · Placement' | 'Finishing up' | 'Reference';
  /** The app page this guide is about, for a "Go to" link. */
  page?: { path: string; label: string };
  sections: HelpSection[];
}

export const HELP_TOPICS: HelpTopic[] = [
  {
    id: 'getting-started',
    title: 'Getting started',
    summary: 'What the app does and the order to work through it each year.',
    group: 'Start here',
    sections: [
      {
        heading: 'What the app is for',
        text: [
          "The Staffing Planner helps you prepare next year's staffing: matching staff to the entitlement, setting class structures, placing staff in classes and roles, and covering leave. Everything is saved in this browser on this computer; nothing is sent to a server.",
          'The warnings panel at the top of every page lists anything that needs attention. Click a warning to go to the record causing it.',
        ],
      },
      {
        heading: 'The order to work in',
        text: ['You can move between pages at any time, but this order works best:'],
        steps: [
          'On the **Overview** page, create a planning year, or restore a backup from a previous session.',
          'Enter the department entitlement on **Entitlement**.',
          'Add your staff and their plans for next year on **Staff** (by hand or from a CSV file).',
          '**Part 1:** on **Match staff**, match staff to the entitlement positions: permanent first, then TWT, then temporary.',
          '**Part 2:** on **Class structures**, work out the classes, then place staff in classes and roles on **Roles & placement**.',
          'Record leave and assign cover on **Leave cover**.',
          'Print or export reports, and save a backup, on **Export & reports**.',
        ],
        tip: 'To explore safely, click **Load fictional sample plan** on the Overview page. It loads a made-up school you can change freely.',
      },
      {
        heading: 'Help on each page',
        text: [
          'The **Steps** list on the Overview page shows each step with a tick when it is done, and a button to go straight to it.',
          'Every page has a **How to use this page** link at the top that opens its guide here.',
        ],
      },
    ],
  },
  {
    id: 'plans',
    title: 'Plans, backups and restoring',
    summary: 'Create a planning year, save a backup, and continue a previous session.',
    group: 'Start here',
    page: { path: '/', label: 'Overview' },
    sections: [
      {
        heading: 'Create a planning year',
        steps: [
          'Go to **Overview**.',
          'Under **New planning year**, enter the **Year** and **School name**.',
          'Click **Create planning year**. It starts with the standard position types and a blank entitlement.',
        ],
        text: ['If you have more than one plan, choose which one to work on from the **Planning year** list at the top of the Overview page.'],
      },
      {
        heading: 'Save a backup',
        text: [
          'Your plan is kept in this browser only. Save a backup regularly, and always before clearing your browser data or changing computers.',
        ],
        steps: [
          'On **Overview** (or **Export & reports**), find **Back up this plan**.',
          'To protect the file, tick **Protect with a password** and type the password twice.',
          'Click **Download backup file**. The file is saved to your Downloads folder.',
        ],
        tip: 'If you forget the password, the backup cannot be opened. No one can recover it, so keep the password somewhere safe.',
      },
      {
        heading: 'Restore a backup (continue a previous session)',
        steps: [
          'Go to **Overview** and find **Restore from a backup file**.',
          'Click **Choose File** and pick your backup (it ends in .backup.json).',
          'If it is password-protected, type the password and click **Unlock**.',
          'Check the school, year and backup date shown, then click **Restore plan**.',
          'If that plan is already in this browser, the button says **Replace with backup** and changes made since the backup will be lost.',
        ],
      },
      {
        heading: 'Start again',
        points: [
          '**Load fictional sample plan** loads (or resets) the made-up sample school.',
          '**Delete all data in this browser** removes every plan stored here. Save a backup first.',
        ],
      },
    ],
  },
  {
    id: 'entitlement',
    title: 'Entering the entitlement',
    summary: 'Enter the total FTE and the breakdown by position type.',
    group: 'Part 1 · Entitlement',
    page: { path: '/entitlement', label: 'Entitlement' },
    sections: [
      {
        heading: 'Enter the entitlement',
        steps: [
          'Go to **Entitlement**.',
          'Under **Enter entitlement**, type the **Total entitlement** exactly as the department supplies it, up to 3 decimal places (for example 14.884).',
          'Type the FTE for each position type (for example RFF Teacher 1.316).',
          'Check the line under the table: the breakdown should add up to the total.',
          'Click **Save entitlement**. (**Discard changes** puts back what was last saved.)',
        ],
      },
      {
        heading: 'Read the dashboard',
        text: [
          '**Entitlement vs matched** compares the entitlement with the staff matched in Part 1 (Match staff). Remaining shows what is still to match; a negative number means over the entitlement.',
          'Small decimal remainders (less than 0.1 FTE, one fortnight day) cannot be filled, so they are shown but not flagged as a warning.',
        ],
      },
      {
        heading: 'Position types',
        text: [
          'The standard list (Principal, Classroom Teacher, Assistant Principal, through to Part-time Teacher and School Counsellor) is used both for the entitlement and for roles.',
        ],
        steps: [
          'To add one, type a **New position type**, choose its **Category**, and click **Add**.',
          'If your plan was created before a standard type (such as Part-time Teacher or School Counsellor) was added, click **Add standard position types**.',
          'To remove one, click **Delete**. A type can only be deleted when no roles or positions use it.',
        ],
      },
    ],
  },
  {
    id: 'staff',
    title: 'Adding staff',
    summary: 'Add each staff member and their plans for next year, by hand or from a CSV file.',
    group: 'Part 1 · Entitlement',
    page: { path: '/staff', label: 'Staff' },
    sections: [
      {
        heading: 'One form for each person',
        text: [
          "Each staff member's details and their plans for next year are entered together, in one form. Saving updates the plan straight away.",
          'Their days worked are their **preferred days** plus any **whole-year leave days**. That is what Part 1 matches against the entitlement, and the leave is recorded for the whole school year.',
        ],
      },
      {
        heading: 'Add a staff member',
        steps: [
          'Go to **Staff** (in Part 1 of the menu), or click **Add staff** on the Overview or Match staff page.',
          'Click **Add staff member**.',
          'Enter the **Name** and choose the **Employment status** (Permanent, TWT or Temporary). For Permanent or TWT, enter their **Permanent FTE**.',
          'Choose their **Substantive role**: Principal, Deputy Principal, Assistant Principal, Assistant Principal - Curriculum & Instruction, Teacher, Teacher Librarian or School Counsellor.',
          'If they hold two positions (for example Teacher 0.6 and AP C&I 0.2), tick the other one under **Also substantive in** and enter its FTE (0.2). Their substantive role has the rest of their days (0.6). The staff page shows each role\'s FTE and how much is matched.',
          'Choose the **Work preference**. Full time ticks every day that is not a leave day.',
          'Tick the **Preferred days** they will work. Choose **Week A / Week B differ** if their days change between the two weeks of the fortnight.',
          'If they are taking leave for the whole year on some days (for example LWOP two days a week), tick those under **Whole year leave days** and choose the **Leave type**.',
          'Choose up to three grade preferences (**Grade preference** 1, 2 and 3), most preferred first.',
          'Click **Add staff member**. A warning shows first if their days do not add up to their permanent FTE.',
        ],
        tip: 'Example: a permanent 1.0 teacher who wants to work Mon–Wed takes LWOP on Thu and Fri. Preferred days Mon, Tue, Wed plus leave days Thu, Fri = 1.0 FTE.',
      },
      {
        heading: 'Import staff from a CSV file',
        steps: [
          'On the **Staff** page, open the **Import CSV** tab (or click **Import from CSV**).',
          'Click **Download template**, fill it in in Excel (one row per person), and save it as CSV.',
          'Click **Choose File** next to **CSV file** and pick your file.',
          'Check the columns under **Match columns**.',
          'Check the **Preview**: the last column says what each row will add or change. Rows with problems say why and are not imported.',
          'Click **Import**. Someone already in the plan (same name) is updated; a blank substantive role keeps the one they have.',
        ],
        points: [
          'Days can be written like "Mon-Fri" or "Mon Tue Wed".',
          'Leave type can be LSL, LWOP, Maternity or Paternity, and is LWOP if blank.',
          'Grades are K or 1–6.',
        ],
      },
      {
        heading: 'Change or remove a staff member',
        steps: [
          'On the **All staff** tab, click their name.',
          'Click **Edit details**, make the changes, then click **Save changes**. If a change removes leave that has cover, you are asked first.',
          'Click **Delete staff member** to remove them. Their matches, placements, leave and details are removed too.',
        ],
        text: ['Their page also shows their placements and leave, and you can **Add allocation** there.'],
      },
      {
        heading: 'Details not yet applied',
        text: [
          'If details were saved before this form existed and never applied, they are listed at the top of the Staff page. Click **Apply** to update the plan, or **Discard** to keep the plan as it is.',
        ],
      },
      {
        heading: 'Next',
        text: ['Match staff to the entitlement on **Match staff**.'],
      },
    ],
  },
  {
    id: 'matching',
    title: 'Part 1: Match staff to the entitlement',
    summary: 'Match staff to entitlement positions by day, handle whole-year leave and transfers.',
    group: 'Part 1 · Entitlement',
    page: { path: '/matching', label: 'Match staff' },
    sections: [
      {
        heading: 'Create positions',
        text: [
          'Each entitlement line becomes positions. For example Classroom Teacher 6.0 becomes six Mon–Fri positions, and RFF Teacher 1.316 becomes one full position plus one of 3 fortnight days. A remainder under 0.1 FTE cannot be a position.',
        ],
        steps: [
          'Go to **Match staff**.',
          'Click **Create positions from entitlement**. If the entitlement grows later, click **Add missing positions**.',
          'To change which days a part position runs (for example a 0.2 position from Monday to Thursday), open **Positions** below the grid, click **Edit**, change the days and click **Save changes**. Anyone matched moves with it; if someone can\'t (for example they don\'t work the new day), you\'re told before anything changes. **Add position** adds one by hand.',
          "To split a position (for example a 1.0 Classroom Teacher into 0.4 + 0.4 + 0.2), open **Positions**, click **Split**, use **Add a part** until there are enough parts, and tick each part's days. Parts can share days (for example two 0.4 parts both on Wed–Thu) as long as they add up to the position's FTE. Click **Split position**: part 1 keeps the name, the others become new positions, and anyone matched moves with their days (you're told first if someone loses a day).",
          'To change the order of the grid (for example Deputy Principal above Classroom Teacher), use the ↑ and ↓ beside a group heading. The same order is used on the Entitlement page and in Part 2.',
        ],
      },
      {
        heading: 'Match staff',
        text: [
          'Match permanent staff first, then TWT, then temporary. The staff list is grouped in that order and tiles are coloured: blue for permanent, purple for TWT, amber for temporary.',
        ],
        steps: [
          'Drag a name from the staff list onto a position and day. A full-time teacher fills the whole week in one go.',
          'Or click **+** in a cell and choose a name.',
          'To take a day off someone, click the **×** on their tile. To move them, drag the tile to another cell.',
          'A name in the list says which days they are still free, or "fully matched".',
        ],
        tip: 'Tick **Show Week A and Week B separately** when someone works different days in each week of the fortnight.',
      },
      {
        heading: 'Whole-year leave and backfills',
        text: [
          'Leave that covers the whole school year (for example maternity leave, or LWOP two days a week all year) shows as a grey tile. The person still holds their position.',
        ],
        steps: [
          'Match the person on leave to their position as normal; their leave days turn grey.',
          'Drag another teacher onto the grey days to backfill them. A backfill does not use extra entitlement.',
        ],
      },
      {
        heading: 'Two positions, and second jobs',
        text: [
          'Someone can hold more than one position, for example a Teacher 0.6 (Mon–Wed) and AP C&I 0.2 (Thu): match them to each on its days. Tick the second one under **Also substantive in** on their staff details and enter its FTE.',
          'They are matched to an executive position only up to that FTE. Anything more (for example a second AP C&I day) is matched as higher duties and labelled so; on a day they are matched as a teacher it opens up their class for a backfill, as for any higher duties.',
          'Someone on whole-year leave from their own position can work elsewhere on those days as a second job, for example an AP on LWOP all year working 0.2 as a temporary teacher.',
        ],
        steps: [
          'Match them to their own position as normal; their leave days turn grey.',
          "Drag their name onto another position on a leave day (or click **+**: they are listed with \"(second job)\").",
          'Choose the **Employment in this position** (Temporary to start with) and click **Match as second job**. The tile is coloured by that employment type and marked "second job".',
          "To change the employment type later, use the menu on the tile. It appears for anyone holding more than one position.",
          'In Part 2 they can be placed in a role on their second-job days; other leave days stay off limits.',
        ],
      },
      {
        heading: 'Higher duties',
        text: [
          'Someone can relieve in a higher executive position for the whole year, for example a 0.6 teacher (Mon–Wed) acting as Assistant Principal - Curriculum & Instruction on Wednesdays. People can only step up: a teacher into any executive position, an Assistant Principal into Deputy Principal or Principal, a Deputy into Principal.',
        ],
        steps: [
          'Match the person to their own (substantive) position as normal, on all their days.',
          'Drag their name onto the executive position on the higher-duties day (or click **+** there: they are listed with "(higher duties)").',
          "If the executive position's holder is on whole-year leave that day (a grey tile), drop the name on that grey day instead: they backfill the leave on higher duties.",
          'Click **OK** to confirm. Their tile in the executive position is marked "higher duties", and their own position turns grey ("Higher duties") on that day.',
          'Drag another teacher onto the grey day to backfill their own position.',
          "Someone who isn't matched anywhere else on those days (for example a temporary teacher in an unfilled AP position) is simply matched; their tile still says \"higher duties\" because the position is above their substantive role.",
          'To end higher duties, click **×** on the "higher duties" tile. The backfill on their own position is removed too.',
        ],
        tip: 'Higher duties shows on the Leave cover page and the staff member\'s page. In Part 2, place them in the executive role on those days as normal, and cover their class.',
      },
      {
        heading: 'Staff left over: nominate for transfer',
        steps: [
          'Under **Not yet matched**, find the permanent or TWT staff member who cannot be matched.',
          'Click **Nominate for transfer**, add **Notes**, and click **Confirm nomination**. Their matches are removed and they are no longer flagged.',
          'Nominated staff are listed under **Nominated for transfer**, where you can edit the notes or click **Withdraw nomination**.',
        ],
      },
      {
        heading: 'Check against the entitlement',
        text: ['The **Entitlement vs matched** table at the bottom shows how each position type compares with the entitlement.'],
      },
    ],
  },
  {
    id: 'classes',
    title: 'Part 2: Class structures',
    summary: 'Get suggested class structures, accept one, and create class roles.',
    group: 'Part 2 · Placement',
    page: { path: '/classes', label: 'Class structures' },
    sections: [
      {
        heading: 'Get suggestions',
        steps: [
          'Go to **Class structures**.',
          'Enter the **Total number of classes** and the number of students in each grade.',
          'Open **Rules** to check the guide class sizes (K 20, Year 1 22, Year 2 24, Years 3–6 30), the **Allowance over guide** (2) and which **Composite classes allowed** (1/2, 3/4, 5/6).',
          'Click **Suggest class structures**.',
        ],
        text: [
          'A class can go up to the allowance over its guide before a composite is preferred. A composite uses the lower of its two guides (a 1/2 composite uses 22).',
        ],
      },
      {
        heading: 'Choose a structure',
        steps: [
          'The first option is the best fit. Click **Show another option** and **Previous option** to compare.',
          'Click **Accept this structure** when you find the one you want.',
        ],
      },
      {
        heading: 'Adjust it and create class roles',
        steps: [
          'Under **Accepted class structure**, rename classes (for example "K Blue") and change student numbers.',
          'Use **Add a class** and **Add class**, or **Remove**, to change the classes.',
          'Click **Save changes**. The check below the table shows any students not placed.',
          'Click **Create class roles**. Each class gets a class teacher role, ready for placing staff on Roles & placement.',
        ],
      },
    ],
  },
  {
    id: 'allocation',
    title: 'Part 2: Roles & placement',
    summary: 'Add roles, then place staff in classes and roles by day.',
    group: 'Part 2 · Placement',
    page: { path: '/allocation', label: 'Roles & placement' },
    sections: [
      {
        heading: 'Before you start',
        text: [
          'Staff are added in Part 1, on the **Staff** page. Class roles are created on Class structures. This page is for placing those staff in classes and other roles.',
        ],
      },
      {
        heading: 'Add roles',
        text: ['Roles are what staff are placed in: classes (created on Class structures), RFF, library, executive release and so on.'],
        steps: [
          'Go to **Roles & placement** and open the **By role** tab.',
          'Click **Add role**.',
          "Enter the role's name (for example RFF 1), choose the **Position type**, and tick the days it runs.",
          'Click **Add role**.',
        ],
      },
      {
        heading: 'Place staff with the role grid',
        steps: [
          'Open the **Role grid** tab (the first tab). Roles run down the side and days across the top.',
          'Drag a name onto a role and day, or click **+** and choose a name. Staff matched in Part 1 are offered; tick **Show all staff** to see everyone.',
          "A full-time teacher dropped on a class fills the whole week. Dropping a name on a role's name fills every day they are free.",
          'Click **×** to remove a day, or drag a tile to move it.',
          'Someone on higher duties can be placed in an executive role on their higher-duties days; their own class shows grey on those days and needs cover.',
          'Name tiles show grade preferences (for example "Prefers K, 1, 2") from each person\'s staff details.',
        ],
        tip: 'Grey tiles are staff on leave. Dropping someone on a grey day assigns them as cover for that leave, for the leave dates.',
      },
      {
        heading: 'Other views',
        points: [
          '**By role** lists every role with who holds it; click a role to edit it or its allocations.',
          '**Staff grid** shows each person by day, with leave and who covers it. Choose an **As at** date to see a single day.',
        ],
      },
    ],
  },
  {
    id: 'leave',
    title: 'Part 2: Leave and cover',
    summary: 'Record leave, see what it leaves vacant, and assign cover.',
    group: 'Part 2 · Placement',
    page: { path: '/leave', label: 'Leave cover' },
    sections: [
      {
        heading: 'Enter term dates first',
        steps: [
          'Go to **Leave cover** and open the **Term dates** tab.',
          'Enter the start and end of each term and click **Save term dates**. These give quick picks when assigning cover, and Term 1 start to Term 4 end counts as "the whole year".',
        ],
      },
      {
        heading: 'Record leave',
        steps: [
          'On the **Leave** tab, click **Add leave**.',
          'Choose the **Staff member** and **Leave type** (Long Service Leave, Leave without pay, Maternity Leave or Paternity Leave).',
          'Enter the **First day** and **Last day**, and tick the days of the week they are on leave.',
          'Click **Add leave**.',
        ],
        tip: 'The person on leave keeps their position. Whole-year leave for part of the week (for example LWOP on Thu and Fri) is easiest to enter in the staff form, under Whole year leave days.',
      },
      {
        heading: 'Assign cover',
        steps: [
          'Click the leave to open it. **Positions left vacant** and **Not yet covered** show what needs cover.',
          'Click **Add cover**.',
          'Choose who it is **Covered by** and the **Role to cover**, then set the dates (use a term quick pick) and days.',
          'Click **Assign cover**. Cover does not count against the entitlement.',
        ],
        text: ['You can also assign cover on the Role grid by dropping a name on a grey (on leave) tile.'],
      },
      {
        heading: 'Check nothing is missed',
        points: [
          '**Uncovered** lists every position left without cover, with dates.',
          '**Timeline** shows leave and cover across the year.',
        ],
      },
    ],
  },
  {
    id: 'reports',
    title: 'Reports, PDF and Excel',
    summary: 'Print reports, save them as PDF, or download an Excel workbook.',
    group: 'Finishing up',
    page: { path: '/reports', label: 'Export & reports' },
    sections: [
      {
        heading: 'The reports',
        points: [
          '**Staffing summary**: entitlement vs matched, and current warnings.',
          '**Part 1 · Entitlement matching**: positions by day, staff not fully matched, nominated transfers.',
          '**Part 2 · Placement**: roles by day, and placements by staff member and by role.',
          '**Leave cover summary**: each leave with its cover and any gaps.',
          '**Class structure summary**: classes, students and teachers.',
          '**Staff**: everyone with their substantive role and plans for next year.',
        ],
      },
      {
        heading: 'Save as PDF or print',
        steps: [
          'Go to **Export & reports**.',
          'Untick any reports you do not want.',
          'Click **Print / Save as PDF**.',
          'In the print dialog, choose **Save as PDF** as the printer (or choose a printer), then save.',
        ],
        tip: 'Grids print landscape and in colour. If colours are missing, turn on "Background graphics" in the print dialog\'s settings.',
      },
      {
        heading: 'Download an Excel workbook',
        steps: [
          'Choose the reports you want.',
          'Click **Download Excel workbook**. It has one sheet per report, with grids coloured as in the app.',
        ],
        text: ['The workbook is for reviewing. Changes made in Excel are not read back into the app; use a backup to move a plan.'],
      },
    ],
  },
  {
    id: 'warnings',
    title: 'Understanding warnings',
    summary: 'What each warning means and how to fix it.',
    group: 'Reference',
    sections: [
      {
        heading: 'How warnings work',
        text: [
          'Warnings are checked every time something changes and listed at the top of every page. Click one to go to the record causing it. Click **Warnings** to show or hide the list.',
        ],
      },
      {
        heading: 'Part 1',
        points: [
          '**Under or over the entitlement**: matched FTE differs from the entitlement for a position type or in total. Match more staff, or check the entitlement. Under is only flagged from 0.1 FTE.',
          '**Not matched to the entitlement**: a permanent or TWT staff member has days not matched. Match them, or nominate them for transfer.',
          '**Temporary staff matched while permanent or TWT staff are unmatched**: match permanent and TWT staff first.',
          "**Matched on a day the position doesn't run**: change the position's days back, or move the person on Match staff.",
        ],
      },
      {
        heading: 'Part 2',
        points: [
          '**Matched for X FTE but placed for Y FTE**: what someone is placed for in Part 2 differs from their Part 1 match. Adjust their placements (or matches).',
          '**Nominated for transfer but still placed**: remove their placements, or withdraw the nomination.',
          '**Allocated on a day they don\'t work** or **to two roles on the same day**: change the allocation or their days.',
          '**Has no one allocated**: a role has empty days. Place someone, or change the days the role runs.',
          '**No cover for leave**: assign cover on Leave cover.',
          '**Outside their grade preferences**: someone is on a class with none of their preferred grades. Consider another class, or leave it if intended.',
        ],
      },
      {
        heading: 'Staff',
        points: [
          "**Details for next year aren't applied yet**: click Apply (or Discard) at the top of the Staff page.",
          "**Days don't add up to the permanent FTE**: check the preferred days, leave days and permanent FTE.",
        ],
      },
    ],
  },
  {
    id: 'privacy',
    title: 'Your data and privacy',
    summary: 'Where your plan is stored and how to keep it safe.',
    group: 'Reference',
    sections: [
      {
        heading: 'Where your plan is kept',
        points: [
          'Your plan is saved in this browser on this computer. Nothing is sent to a server, and no one else can see it.',
          'It stays there between visits, but clearing browser data, using a private window, or using another computer or browser means it is not there. Save backups.',
          'Backups, PDFs and Excel files are saved to your Downloads folder. They contain staff names, so keep them somewhere your department permits.',
        ],
      },
      {
        heading: 'Sharing with your team',
        text: [
          'One person edits the plan. Others review the PDF or Excel reports. To hand over editing, save a backup and the other person restores it on their computer.',
        ],
      },
    ],
  },
  {
    id: 'glossary',
    title: 'Glossary',
    summary: 'FTE, fortnight days, TWT, backfill and other terms.',
    group: 'Reference',
    sections: [
      {
        heading: 'Terms',
        points: [
          '**FTE**: full-time equivalent. 1.0 is five days a week. Staff and role FTE comes from the days ticked; the entitlement is entered exactly as supplied.',
          '**Fortnight days / Week A and Week B**: days are recorded across a fortnight. One weekday every week is 0.2 FTE; one day a fortnight is 0.1 FTE.',
          '**Permanent, TWT, Temporary**: employment types. TWT is Temporary Workforce Transition.',
          '**Position (Part 1)**: a piece of the entitlement, such as "Classroom Teacher 3" or "RFF Teacher 2".',
          '**Role (Part 2)**: what someone is placed in, such as a class, RFF 1 or the library.',
          '**Matching (Part 1)**: assigning staff to entitlement positions, by day.',
          '**Placement (Part 2)**: assigning staff to classes and roles, by day.',
          '**Whole-year leave**: leave from the start of Term 1 to the end of Term 4.',
          '**Backfill**: a teacher matched in Part 1 on days someone is on whole-year leave.',
          '**Higher duties**: relieving in a higher executive position (Assistant Principal, Deputy or Principal) on some days for the whole year. Their own position is backfilled on those days.',
          '**Second job**: work in another position on days someone is on whole-year leave from their own, with its own employment type.',
          '**Cover**: a teacher placed in Part 2 on days someone is on leave, for the leave dates.',
          '**Composite**: a class with two grades (1/2, 3/4 or 5/6).',
          '**Nominated for transfer**: a permanent or TWT staff member surplus to the entitlement.',
        ],
      },
    ],
  },
  {
    id: 'faq',
    title: 'Common questions',
    summary: 'Quick answers to things that come up.',
    group: 'Reference',
    sections: [
      {
        heading: 'Questions',
        points: [
          "**My plan has disappeared.** It may be in another browser or computer, or browser data was cleared. Restore your latest backup on the Overview page.",
          "**Can two people edit at once?** No. One person edits; others review reports. Pass a backup to hand over.",
          '**Why is someone not offered on the Role grid?** Only staff matched in Part 1 are offered. Tick **Show all staff**.',
          "**Why can't I drop someone on a day?** They don't work that day, already hold another role then, or the role doesn't run that day. The message under the grid says which.",
          '**Can I undo?** There is no undo button. Remove the change by hand, or restore a recent backup.',
          '**Can I edit the Excel file and bring it back?** No. The workbook is for reviewing only.',
          '**How do I try things without affecting my plan?** Save a backup first, or experiment in the fictional sample plan.',
        ],
      },
    ],
  },
];

export const helpTopic = (id: string) => HELP_TOPICS.find((t) => t.id === id);

/** All of a topic's text, for searching. */
export function topicText(t: HelpTopic): string {
  return [t.title, t.summary, ...t.sections.flatMap((s) => [s.heading, ...(s.text ?? []), ...(s.steps ?? []), ...(s.points ?? []), s.tip ?? ''])]
    .join(' ')
    .replace(/\*\*/g, '');
}

/** Topics containing every word of the query. */
export function searchHelp(query: string): HelpTopic[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return HELP_TOPICS;
  return HELP_TOPICS.filter((t) => {
    const text = topicText(t).toLowerCase();
    return words.every((w) => text.includes(w));
  });
}
