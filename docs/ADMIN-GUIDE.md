# The Time Sink: admin guide and handover

## Where things live
| Thing | Where | Who should own it |
|---|---|---|
| Code | GitHub repository (private) | Company GitHub organisation, at least 2 owners |
| Running app | Vercel project (free `.vercel.app` address) | Company Vercel team, at least 2 members |
| Database (all time entries) | Neon project, AWS US East | Company Neon account, at least 2 members |

Move all three into accounts the company owns (not one person's personal login) before the pilot. Each service lets you invite a second owner.

## The only secret
`DATABASE_URL` in Vercel (Project, Settings, Environment Variables). Optional: `RESEND_API_KEY` and `EMAIL_FROM` (to email invites and reminders), `APP_URL`, `CRON_SECRET`. Without email, invites are copy-link: copy the link in People and send it yourself.

## First day
1. Open the site. The setup page creates the first admin. It closes once one account exists.
2. People: add offices (AMD, PNQ, KLH, NAG, SSE) and each office's teams. Every Team/Project Manager needs a team.
3. Projects: add clients (pick a team and add points of contact) and projects.
4. People: invite a second admin straight away, then the pilot office's location manager, managers and members.
5. Settings: choose time format, required fields, lock date, tags and phase templates.

## Bringing people, projects and time in from CSV
Import and export, Import tab. Do the three in this order, because each needs the one before it:
1. **People.** Download the template (`the-time-sink-people-template.csv`), fill it in, choose the office, check it, import. Everyone gets an invite link that works for 7 days (copy them from the result, or tick the email option if email is switched on). Managers need a Group, because a Team/Project Manager looks after one team. A Group that doesn't exist yet is created. Only admins and location managers can import people, and location managers can only add to their own office.
2. **Clients and projects.** `the-time-sink-clients-projects-template.csv`. Tasks become the project's phases (blank gives the five Submission phases). A blank Client files the project under *Internal*. Only admins create new clients and tags.
3. **Timesheet.** `the-time-sink-timesheet-template.csv`. Needs the people and projects to exist. Admins can tick *Add what's missing* to create unknown projects, clients, phases and tags from the file. A row identical to time already saved is skipped, so a file can be imported twice safely.

Things to know:
- Nothing is saved until you press Import, and rows with a problem are left out with the reason shown. Fix the file and check it again.
- Billing columns (Billable, Billable Rate, Cost Rate) are accepted and ignored. Week Start, Employees Managed and Assigned team manager are ignored too.
- Settings can reject Clockify rows: if tags or descriptions are required, rows without them are skipped, and dates before the lock date are refused. Relax the setting for the import if needed.
- Only the first tag on a row is kept (one tag per time entry).
- There is no undo for an import, and clients and projects can't be deleted (only archived), so check the "This import will also add" box before you import.

## Sharing a report with a client
Clients, open the client, **Client link**, Create link. Copy it and send it to the client. They open it without logging in and get an interactive report with date range, project and tag filters, hours by project then tag, and a CSV download. It shows only project, hours and tag: never people, descriptions, phases, budgets or other clients.
- Anyone with the link can see the report, so send it only to the client. The secret in the link is long and can't be guessed.
- **Make a new link** if the link was shared by mistake: the old one stops working at once. **Turn off** removes access until you create a link again.
- By default the report counts everything logged, so its totals match your Reports page. Switch on **Count only approved time** to leave out weeks that haven't been approved yet.
- The panel shows when the link was last opened. Only admins can create or change links.

## Roles
Team Member (own time), Team/Project Manager (own team; approves their team's timesheets and their own), Location Manager (own office), Admin (everyone). Location managers and admins approve only when really needed: weeks of people whose team has no Team/Project Manager (including managers' and admins' own weeks), or weeks that waited more than 3 days. Reminder emails to them cover only those weeks.

## Pilot, then roll out
Run one office for 1 to 2 weeks. Check that people submit, managers approve, and Reports match expectations. Then add one office at a time.

## Everyday tasks
- **Forgot password:** People, create a password reset link, send it to the person.
- **Someone leaves:** People, set them inactive (their history stays).
- **Wrong time entered:** unlock by sending the week back in Approvals, or edit as admin.
- **Close a month:** set the lock date in Settings.
- **Export everything:** Import and export, or Reports, Export, Save as CSV (it follows whatever filters are applied).

## Backups
Neon keeps point-in-time history on its free plan (short window). For a company of this size, upgrade Neon to a paid plan and also export the time CSV monthly.

## Updating the app
Changes pushed to the GitHub main branch deploy automatically on Vercel. Database changes apply on each deploy.
