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
