# The Time Sink

Time tracking for a company of about 100 people across several offices. People add time in a weekly
timesheet or a calendar, submit the week, and their leader approves it. Managers see reports and a
productivity dashboard for the people they're responsible for.

It covers time tracking and performance only. There is no billing.

## What's in it

| Tab | Who sees it | What it does |
|---|---|---|
| Dashboard | Everyone | Team members see "Your numbers": % of expected hours last week and last month, the change against the same days last month, whether they are on pace, their weekly hours and where their time went. Team/Project Managers, location managers and admins also see productivity (hours ÷ target) per office, a 12-month trend and the top 5 per office. Location managers also see a card for each team in their office. Names link to profiles |
| Clients | Location managers, admins (admins add and edit clients) | A client dashboard. Pick a period (this month, last month, this or last quarter, this year, the last 12 months) to see the hours logged on each client, and for clients with fixed monthly hours: contracted hours, utilisation (hours ÷ contracted hours), hours left, and this month's pace. Clients with no commitment show the change on the previous period. Click a client for its hours by month against the contract, and its hours by project, phase and person | Each client has a team and points of contact. Admins can give a client a **private view-only link**: an interactive report (date range, project and tag filters, hours by project then tag, CSV) that needs no login and shows only project, hours and tag, never people, descriptions or phases. The link can be copied, turned off or replaced, and can count approved time only.
| Timesheet | Everyone | Three views in one place: **Timesheet** (week, one row per project, click a day to add time), **Calendar** (by time of day; click or drag to add) and **Timer** (start, stop and it adds the time). Submit the week from the top of the page |
| Approvals | Team/Project Managers, location managers, admins | Approve or send back submitted weeks, open *Review Time* for a detailed list, and remind people who haven't submitted. Team/Project Managers approve their team and themselves. Location managers and admins see first the weeks that need them (a team with no manager, or a week waiting more than 3 days) and the rest below, only if really needed |
| Reports | Everyone (limited to what they can see) | Three views: Summary (stacked chart, table grouped by project, client, person, team, location, tag, phase, description, day or month, with an optional second grouping and a doughnut), Detailed (every entry) and Weekly (a grid of hours per day). Tick-box filters for person, team, client, project, phase, tag, timesheet status and office (admins), plus a description search, applied with the Apply filter button. A date picker with arrows to step by week, month, quarter or year. Export to CSV, or print / save as PDF |
| Projects | Everyone (team members see only the projects they have been added to, read only, without the clients and phase templates lists) | Create projects from phase templates and choose who can see them: everyone, or chosen offices, teams and people. Admins add clients and set each one's type: *Fixed monthly hours* (with the hours agreed per month) or *No commitment* (work as it comes) |
| People | Location managers, admins | Invite people, set roles, office, team and weekly target. Create password reset links. Add offices and teams |
| Import & export | Team/Project Managers, location managers, admins (importing people: location managers and admins) | Three imports, each starting from a downloadable CSV template: **People** (each person gets an invite link), **Clients and projects** (Tasks become phases) and **Timesheet**. Every file is checked row by row before anything is saved, and the result shows ready, heads-up and skipped rows with the reason for each. The templates keep the Clockify column names, so a Clockify file goes straight in; billing columns are accepted and ignored. CSV export of projects and people |
| Settings | Admins | Time format (7.50 or 7:30), required fields, lock date, reminders, tags, phase templates, custom fields |

What each role can see:
- **Team member:** only their own time.
- **Team/Project Manager:** their own team in their own office. They approve their team's timesheets and their own.
- **Location manager:** every team in their office.
- **Admin:** the whole company.

Client contracts are company-wide, so on the Clients tab, location managers and admins both see every client's hours
from the whole company. When a client's hours are broken down by person, location managers see only their own office's people by name.

How the Clients tab counts:
- **Contracted hours** are the monthly hours times the number of months in the period. A month that has started counts in full, so "This month" is always one whole month of contract.
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
- Targets spread over working days (used for productivity on the Dashboard and for pace on the Clients tab) live in `src/lib/productivity.ts`. Client periods, contracted hours and pace live in `src/lib/clients.ts`.
- Dates are stored as calendar days (`@db.Date`) and handled as `YYYY-MM-DD` strings. "Today" follows the company time zone in Settings (set from the admin's browser during setup).
- `npm run lint` type-checks the project. Browser tests are in `e2e/` and need a running server and the sample data:
  `node e2e/roles.js` signs in as each role and visits every tab. Tests use `http://localhost:3000` unless you set `BASE`,
  and tests that add their own test data use `PSQL` to reach the database, for example
  `BASE=http://localhost:4000 PSQL='psql -U postgres clockme' node e2e/clients.js`.
