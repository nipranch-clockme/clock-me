# Clock me

Time tracking for a company of about 100 people across several offices. People add time in a weekly
timesheet or a calendar, submit the week, and their leader approves it. Managers see reports and a
productivity dashboard for the people they're responsible for.

It covers time tracking and performance only. There is no billing.

## What's in it

| Tab | Who sees it | What it does |
|---|---|---|
| Dashboard | Leaders, project managers, location managers, admins | Productivity (hours ÷ target) per office, a 12-month trend, and the top 5 performers per office and across all offices |
| Timesheet | Everyone | Week view by project and phase. Time is added through "Add entry with details". Copy last week, submit for approval |
| Calendar | Everyone | Week view by time of day. Click a slot to add time. Managers can view their people's calendars |
| Approvals | Leaders, location managers, admins | Approve or send back submitted weeks, and remind people who haven't submitted |
| Reports | Everyone (limited to what they can see) | Filters for date range (including all time), person, team, client, project, tag, phase, description and office. Includes a chart, a breakdown table and CSV export |
| Projects | Everyone (team members see only their own projects, read only) | Create projects from phase templates and choose who can see them: everyone, or chosen offices, teams and people |
| People | Location managers, admins | Invite people, set roles, office, team and weekly target. Create password reset links. Add offices and teams |
| Import & export | Project managers, location managers, admins | CSV import of time entries and projects, with a check of every row before anything is saved. CSV export of time, projects and people |
| Time audit | Leaders, location managers, admins | Days over 10 hours, workdays with no time, entries missing required fields, and a full change log |
| Settings | Admins | Time format (7.50 or 7:30), required fields, lock date, reminders, tags, phase templates, custom fields |

What each role can see:
- **Team member:** only their own time.
- **Team leader and project manager:** their own team in their own office.
- **Location manager:** every team in their office.
- **Admin:** the whole company.

## Putting it online (about 30 minutes, free to start)

You need three free accounts: **GitHub** (stores the code), **Neon** (the database), and **Vercel** (runs the app).

1. **Put the code on GitHub.** Create a new private repository and upload this folder to it.
   Leave out `node_modules`, `.next` and `.env`; the `.gitignore` file already excludes them.
2. **Create the database.** At [neon.tech](https://neon.tech), create a project. Copy its connection
   string; choose the "Pooled connection" option. It looks like `postgresql://...neon.tech/neondb?sslmode=require`.
3. **Create the app.** At [vercel.com](https://vercel.com), choose *Add New → Project*, then pick the GitHub repository.
   Before you deploy, open *Environment Variables* and add:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | The Neon connection string |
   | `SESSION_SECRET` | A long random string (at least 32 characters) |
   | `CRON_SECRET` | Another long random string |
   | `APP_URL` | The app's address, e.g. `https://clock-me.vercel.app` (you can fix this after the first deploy) |

   Then click **Deploy**.
4. **Create the tables and your admin account.** Do this once from your own computer, with
   [Node.js](https://nodejs.org) installed. Run these commands in this folder:

   ```bash
   npm install
   DATABASE_URL="<neon string>" npx prisma db push
   DATABASE_URL="<neon string>" ADMIN_EMAIL="you@company.com" ADMIN_PASSWORD="<strong password>" ADMIN_NAME="Your Name" ADMIN_OFFICE="New York" npm run db:seed
   ```

   This sets up the database tables and default tags, phase templates and settings. It also creates your admin login.
   It doesn't add sample people or projects.
5. **Sign in** at your Vercel address. Then:
   - In People, add your other offices and teams.
   - In Projects, add your clients.
   - In People, invite everyone.

### Email (invites, password resets, reminders)

Without an email service, the app still works. When you invite someone, it shows an invite link for you to send them yourself.
Reminders are only written to the server log.

To turn email on:
1. Create a free account at [resend.com](https://resend.com) and verify your company's email domain.
2. In Vercel, add `RESEND_API_KEY` and `EMAIL_FROM` (for example `Clock me <timesheets@yourcompany.com>`).
3. Redeploy.

Reminders go out once a day at 15:00 UTC. You can change the time in `vercel.json`. Choose which reminders to send in Settings.

## Running it on your computer

```bash
npm install
cp .env.example .env          # then fill in DATABASE_URL and SESSION_SECRET
npx prisma db push
SAMPLE_DATA=1 npm run db:seed # optional: two offices, 11 sample people and about 12,000 entries
npm run dev                   # open http://localhost:3000
```

With sample data, every sample account uses the password `password123`:

| Account | Role |
|---|---|
| `admin@example.com` | Admin |
| `oliver@example.com` | Location manager, London |
| `daniel@example.com` | Team leader, Design, New York |
| `rosa@example.com` | Project manager, Engineering, New York |
| `priya@example.com` | Team member, Design, New York |

## For developers

- Next.js 15 (App Router, server actions), React 19, TypeScript, Prisma with PostgreSQL. Fonts are self-hosted through `next/font`.
- Logins use bcrypt password hashes and a signed, http-only session cookie (`src/lib/session.ts`).
- Who can see what lives in `src/lib/scope.ts`. Which tabs each role gets lives in `src/lib/roles.ts`. Every page and server action checks these on the server.
- Dates are stored as calendar days (`@db.Date`) and handled as `YYYY-MM-DD` strings in UTC.
- `npm run lint` type-checks the project. Browser tests are in `e2e/` and need a running server and the sample data:
  `node e2e/roles.js` signs in as each role and visits every tab.
