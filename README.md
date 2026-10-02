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

## Putting it online (free to start)

You need three free accounts. **GitHub** stores the code, **Neon** holds the database, and **Vercel** runs the app.
You don't need to install anything on your own computer.

1. **The code is on GitHub** in a private repository.
2. **Create the database.** At [neon.tech](https://neon.tech), create a project, pick a region near your main office,
   and click **Connect**. Copy the connection string. It starts with `postgresql://` and ends with `neon.tech/neondb?sslmode=require...`.
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
   - In Projects, add your clients.
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
2. In Vercel, add `RESEND_API_KEY` and `EMAIL_FROM` (for example `Clock me <timesheets@yourcompany.com>`).
3. Redeploy.

Reminders go out once a day at 15:00 UTC. You can change the time in `vercel.json`. Choose which reminders to send in Settings.

## Running it on your computer

```bash
npm install
cp .env.example .env          # then fill in DATABASE_URL
npm run db:migrate            # creates the tables
SAMPLE_DATA=1 npm run db:seed # optional: two offices, 11 sample people and about 12,000 entries
npm run dev                   # open http://localhost:3000
```

Without sample data, the first visit opens the setup page so you can create your admin account.

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
- Logins use bcrypt password hashes and a signed, http-only session cookie (`src/lib/session.ts`). The signing key comes from `SESSION_SECRET`, or one is generated and kept in the `AppSecret` table.
- Database changes are Prisma migrations in `prisma/migrations`. `npm run build` applies them through `scripts/migrate.mjs`, which uses Neon's direct address for migrations and the pooled address for the app. To change the schema, edit `prisma/schema.prisma`, then run `npx prisma migrate dev --name what-changed`.
- Who can see what lives in `src/lib/scope.ts`. Which tabs each role gets lives in `src/lib/roles.ts`. Every page and server action checks these on the server.
- Dates are stored as calendar days (`@db.Date`) and handled as `YYYY-MM-DD` strings in UTC.
- `npm run lint` type-checks the project. Browser tests are in `e2e/` and need a running server and the sample data:
  `node e2e/roles.js` signs in as each role and visits every tab.
