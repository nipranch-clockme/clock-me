# The Time Sink

Time tracking for a company of about 100 people across several offices. People add time in a weekly
timesheet or a calendar, submit the week, and their leader approves it. Managers see reports and a
productivity dashboard for the people they're responsible for.

It covers time tracking and performance only. There is no billing.

## What's in it

| Tab | Who sees it | What it does |
|---|---|---|
| Dashboard | Everyone | Team members see "Your numbers": % of expected hours last week and last month, the change against the same days last month, whether they are on pace, and their weekly hours. Team/Project Managers, location managers and admins also see productivity (hours ÷ target) per office, a 12-month trend and the top 5 per office. Location managers also see a card for each team in their office, and their 12-month trend has one line per team. Location managers get an *Inventory vs actual* chart for their office (and admins one per office): for the last 12 full months, the hours available (capacity: people's weekly hours for each month, less holidays and time off), the hours contracted by the office's clients (clients assigned to the office's teams) and the hours logged. The Top 5 lists show only productivity and hours. Location managers and admins have three tabs: Team overview (the numbers on this page), Client overview (see Clients) and Detailed utilisation (each office's monthly report). Everyone except team members can fold up *Your numbers* (the choice is remembered in the browser). Admins are not a resource, so they are left out of every utilisation number, the Top 5 lists, reminders and the not-submitted list. Names link to profiles |
| Clients | Location managers, admins (admins add and edit clients) | The client overview is a tab on the Dashboard, called Client overview. Pick a period (this month, last month, this or last quarter, this year, the last 12 months) to see the hours logged on each client, and for clients with fixed monthly hours: contracted hours, utilisation (hours ÷ contracted hours), hours left, and this month's pace. Clients with no commitment show the change on the previous period. Click a client for its hours by month against the contract, and its hours by project, phase and person. The **Monthly contracts** page is a table of every client by month (Jan to Dec, year total, per day, work type and drawing standard), with each client's status (Contracted, Project-based or Lost) and buttons to see one office: admins type each month's contracted hours, so a contract that changes from month to month, or ends part-way through one, is worked out month by month; location managers can look but not change. A month left the same as the client's usual hours follows it; only months that differ are stored (migration 0010). Work types are tags, set per client in the table or the Edit client form, kept for the record | Each client has a team and points of contact. Admins can give a client a **private view-only link**: an interactive report (date range, project and tag filters, hours by project then tag, CSV) that needs no login and shows only project, hours and tag, never people, descriptions or phases. The link can be copied, turned off or replaced, and can count approved time only.
| Timesheet | Everyone | Three views in one place: **Timesheet** (week, one row per project, click a day to add time), **Calendar** (by time of day; click or drag to add) and **Timer** (start, stop and it adds the time). Submit the week from the top of the page. The Timesheet and Calendar go back up to 520 weeks and stop at the current week. Location managers (people in their own office, not admins or other location managers) and admins (anyone) get a **Whose time** picker on the Timesheet and Calendar to add and change time on someone's behalf; the page says whose time it is, the week's locks still apply (a submitted week must be sent back from Approvals first), and every change is written to the change log as "on behalf of". The person still submits their own week. The Timer is always your own |
| Time off | Everyone | Two views. **Time off**: anyone can request PTO, sick leave or other leave for themselves, whole or half days, one day or a stretch, including past dates. A request waits in Approvals until a location manager (for their office's members and team managers) or an admin approves or declines it; a location manager's request goes to an admin, and an admin's to another admin. Requests can be withdrawn while they wait. Only approved time off counts toward expected hours. Location managers (for their office) and admins (for anyone) can add time off for people directly, and it counts at once. Team/Project Managers can't add it for others. **Public holidays**: everyone can see every office's holidays, with the offices each one applies to. Only admins add or change them: one holiday can be ticked for several offices at once (every office is ticked to start with), and several can be pasted one per line. Holidays are taken out of expected hours for the offices they apply to, so utilisation and productivity stay fair. Time can still be logged on those days and counts as extra. Days off show as badges on the Timesheet and Calendar. Time off that another system supplies (the table already has `source` and `externalId` for a future Keka sync) is read-only here |
| Approvals | Team/Project Managers, location managers, admins | Approve or send back submitted weeks, open *Review time* for a detailed list, and remind people who haven't submitted. Overtime is time tagged **OT** (create a tag with exactly that name in Settings). It is highlighted with an *OT* mark on the card and in *Review time* (a banner, and the tagged entries); Reports and exports show it only as the tag, like any other tag. Team/Project Managers approve their team and themselves. Location managers and admins see first the weeks that need them (a team with no manager, or a week waiting more than 3 days) and the rest below, only if really needed. Location managers and admins also get a *Time off requests* section for people in their office, with Approve and Decline (a reason is optional) |
| Reports | Everyone (limited to what they can see) | Two views: Summary (stacked chart, table grouped by project, client, person, team, location, tag, phase, description, day or month, with an optional second grouping and a doughnut) and Detailed (every entry). Tick-box filters for person, team, client, project, phase, tag, timesheet status and office (admins), plus a description search, applied with the Apply filter button. A date picker with arrows to step by week, month, quarter or year. Export to CSV, or print / save as PDF |
| Projects | Everyone (team members see only the projects they have been added to, read only, without the clients and phase templates lists) | Create projects from phase templates and choose who can see them: everyone, or chosen offices, teams and people. Admins add clients and set each one's type: *Fixed monthly hours* (with the hours agreed per month) or *No commitment* (work as it comes) |
| People | Location managers, admins | Invite people, set roles, office, team and weekly target. Create password reset links. Add offices and teams. The **Monthly hours** view is a table of everyone's expected hours per week for each month, so hours can go up or down through the year and productivity follows the current month (admins and location managers change the boxes: location managers for their own office's people, never admins or other location managers; admins are not listed because they are not a resource) |
| Import & export | Admins only | Three imports, each starting from a downloadable CSV template: **People** (each person gets an invite link), **Clients and projects** (Tasks become phases) and **Timesheet**. Every file is checked row by row before anything is saved, and the result shows ready, heads-up and skipped rows with the reason for each. The templates keep the Clockify column names, so a Clockify file goes straight in; billing columns are accepted and ignored. CSV export of time, projects and people |
| Settings | Admins | Time format (7.50 or 7:30), required fields, lock date, reminders, tags, phase templates, custom fields, and the change log (the latest 200 changes, newest first) |

What each role can see:
- **Team member:** only their own time.
- **Team/Project Manager:** their own team in their own office. They approve their team's timesheets and their own.
- **Location manager:** every team in their office.
- **Human Resource:** logs their own time on any project, using the Admin tag for admin time. Not a resource: left out of inventory, headcount and utilisation. Sees the whole company's team utilisation (Team overview and Detailed utilisation, every office) but no clients, no contract figures and nobody's entries. Can ask for time off and see holidays.
- **Guest:** a third-party contractor, assigned to an office. Team member access on the projects they are added to, but they see only the project name, not its client. No Dashboard, no Time off, no creating projects, and no expected hours. Not counted in inventory or utilisation.
- **Admin:** the whole company.

Client contracts are company-wide, so in the Client overview tab, location managers and admins both see every client's hours
from the whole company. When a client's hours are broken down by person, location managers see only their own office's people by name.

How the Client overview counts:
- **Contracted hours** add up each month's contract over the months in the period: the figure in the Monthly contracts table for that month, or the client's usual monthly hours. A month that has started counts in full, so "This month" is always one whole month of contract.
- **Utilisation** is the hours logged on all of the client's projects (archived ones included) divided by contracted hours. Over 100% is shown in red as over contract.
- **Pace** (this month only) compares the hours logged up to yesterday with the monthly hours spread over this month's working days (Monday to Friday) so far. Within 10% either way is on pace.
- **Change** compares a period with the one before it. A period that's still running is compared with the same number of days of the previous one.

See [docs/ADMIN-GUIDE.md](docs/ADMIN-GUIDE.md) for day-to-day running and handover.

## Putting it online (free to start)

You need three free accounts. **GitHub** stores the code, **Neon** holds the database, and **Vercel** runs the app.
You don't need to install anything on your own computer.

1. **The code is on GitHub** in a private repository.
2. **Create the database.** At [neon.tech](https://neon.tech), create a project and pick the region
   **AWS US East (N. Virginia)**, which is where Vercel runs the app unless you change it. Then click **Connect**. Copy the connection string. It starts with `postgresql://` and ends with `neon.tech/neondb?sslmode=require...`.
3. **Create the app.** At [vercel.com](https://vercel.com), choose *Add New → Project* and import the GitHub repository.
   Before you click Deploy, open *Environment Variables* and add one:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | The Neon connection string from step 2 |

   Then click **Deploy**. On each deploy, the app also creates or updates the database tables.
4. **Open your new site straight away** using the address Vercel shows, which ends in `.vercel.app`.
   The first visit opens a setup page where you create your admin account and name your first office.
   Once one account exists, that page closes for good, so do this before you share the address.
5. **Set up your company:**
   - In People, add your other offices and teams.
   - In Projects, add your clients. Choose *Fixed monthly hours* and enter the hours agreed per month, or *No commitment*.
   - In People, invite everyone.

Optional settings you can add later in Vercel (*Settings → Environment Variables*, then redeploy):

| Name | What it's for |
|---|---|
| `RESEND_API_KEY`, `EMAIL_FROM` | Send invites, password resets and reminders by email (see below) |
| `CRON_SECRET` | Any long random string. Turns on the daily reminder emails |
| `APP_URL` | Your own web address, if you add a custom domain such as `https://time.yourcompany.com` |
| `SESSION_SECRET` | A long random string for signing logins. If you leave it out, the app makes its own and keeps it in the database |

### Email (invites, password resets, reminders)

Without an email service, the app still works. When you invite someone, it shows an invite link for you to send them yourself.
Reminders are only written to the server log.

To turn email on:
1. Create a free account at [resend.com](https://resend.com) and verify your company's email domain.
2. In Vercel, add `RESEND_API_KEY` and `EMAIL_FROM` (for example `The Time Sink <timesheets@yourcompany.com>`).
3. For reminder emails, also add `CRON_SECRET` with any long random string (40 or more letters and numbers).
   Vercel sends it with the daily reminder call so nobody else can trigger it.
4. Redeploy.

Reminders go out once a day at 15:00 UTC. You can change the time in `vercel.json`. Choose which reminders to send in Settings.

## Running it on your computer

```bash
npm install
cp .env.example .env          # then fill in DATABASE_URL
npm run db:migrate            # creates the tables
SAMPLE_DATA=1 npm run db:seed # optional: two offices, 11 sample people, 4 clients and about 12,000 entries
npm run dev                   # open http://localhost:3000
```

Without sample data, the first visit opens the setup page so you can create your admin account.

In the sample data, Northwind Logistics (300 hours a month) and Bluebird Health (200 hours a month) have fixed monthly hours;
Harbor & Co and Internal have no commitment. Every sample account uses the password `password123`:

| Account | Role |
|---|---|
| `admin@example.com` | Admin |
| `oliver@example.com` | Location manager, London |
| `daniel@example.com` | Team leader, Design, New York |
| `rosa@example.com` | Project manager, Engineering, New York |
| `priya@example.com` | Team member, Design, New York |

## For developers

- Next.js 15 (App Router, server actions), React 19, TypeScript, Prisma with PostgreSQL. Fonts are self-hosted through `next/font`.
- Logins use bcrypt password hashes and a signed, http-only session cookie (`src/lib/session.ts`). The signing key comes from `SESSION_SECRET`, or one is generated and kept in the `AppSecret` table.
- Database changes are Prisma migrations in `prisma/migrations`. `npm run build` applies them through `scripts/migrate.mjs`, which uses Neon's direct address for migrations and the pooled address for the app. To change the schema, edit `prisma/schema.prisma`, then run `npx prisma migrate dev --name what-changed`.
- Who can see what lives in `src/lib/scope.ts`. Which tabs each role gets lives in `src/lib/roles.ts`. Every page and server action checks these on the server.
- Expected hours (weekly target, or the month's own weekly hours from the Monthly hours table, spread over Monday to Friday, less the office's public holidays and the person's time off) are worked out in one place, `src/lib/expected.ts` (plain arithmetic, checked by `npx tsx e2e/expected-unit.mts`), with the database loaders in `src/lib/timeoff.ts`. Everything that divides by expected hours uses it: the Dashboard and `src/lib/productivity.ts`, profiles, "Your numbers", approvals and reminders. Holidays and time off apply to past periods too, because the app does not keep an office history. The Clients contract pace in `src/lib/clients.ts` stays plain Monday to Friday for the whole company.
- Dates are stored as calendar days (`@db.Date`) and handled as `YYYY-MM-DD` strings. "Today" follows the company time zone in Settings (set from the admin's browser during setup).
- `npm run lint` type-checks the project. Browser tests are in `e2e/` and need a running server and the sample data:
  `node e2e/roles.js` signs in as each role and visits every tab. Tests use `http://localhost:3000` unless you set `BASE`,
  and tests that add their own test data use `PSQL` to reach the database, for example
  `BASE=http://localhost:4000 PSQL='psql -U postgres clockme' node e2e/clients.js`.
