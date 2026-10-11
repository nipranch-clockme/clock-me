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
6. Time off, Public holidays: add each office's holidays for the year. Offices with no holidays listed get nothing taken off, and the page warns about them. Add the next year's before it starts.

## Bringing people, projects and time in from CSV
Import & export, Import tab. Do the three in this order: projects first, so the People file's *Projects Managed* column can link people to them; time last, because it needs the people and the projects.
1. **Clients and projects.** `the-time-sink-clients-projects-template.csv`. Tasks become the project's phases (blank gives the five Submission phases). A blank Client files the project under *Internal*. Only admins create new clients and tags.
2. **People.** Download the template (`the-time-sink-people-template.csv`), fill it in, choose the office, check it, import. Everyone gets an invite link that works for 7 days. The links are shown once, so copy them or download the file straight away (or tick the email option if email is switched on). Managers need a Group, because a Team/Project Manager looks after one team (if the Group is blank, the first group in *Groups Managed* is used). A Group that doesn't exist yet is created. *Projects Managed* links only projects that already exist. Only admins and location managers can import people, and location managers can only add to their own office, as Team Members or Team/Project Managers. Working Days can be written like `Mon, Tue, Wed, Thu, Fri`, `Mon-Fri` or `Monday to Friday`.
3. **Timesheet.** `the-time-sink-timesheet-template.csv`. Needs the people and projects to exist. Admins can tick *Add what's missing* to create unknown projects, clients, phases and tags from the file. A row identical to time already saved is skipped, so a file can be imported twice safely.

Things to know:
- Nothing is saved until you press Import, and rows with a problem are left out with the reason shown. Fix the file and check it again.
- Billing columns (Billable, Billable Rate, Cost Rate) are accepted and ignored. Week Start, Employees Managed and Assigned team manager are ignored too.
- Settings can reject Clockify rows: if tags or descriptions are required, rows without them are skipped, dates on or before the lock date are refused, and so is time in a week that is already submitted or approved. Relax the setting for the import if needed.
- If a file still has the template's example rows in it, the check says so and asks you to confirm before it will import them.
- A file that can't be read (an Excel file, semicolons instead of commas, a quote that is never closed, more values in a row than the header has columns) is refused with the reason, rather than imported wrongly.
- A row can carry several tags, separated by commas (for example `CAD, Revit`). An entry in The Time Sink can have any number of tags.
- There is no undo for an import, and clients and projects can't be deleted (only archived), so check the "This import will also add" box before you import.

## Sharing a report with a client
Clients, open the client, **Client link**, Create link. Copy it and send it to the client. They open it without logging in and get an interactive report with date range, project and tag filters, hours by project then tag, and a CSV download. It shows only project, hours and tag: never people, descriptions, phases, budgets or other clients.
- Anyone with the link can see the report, so send it only to the client. The secret in the link is long and can't be guessed.
- **Make a new link** if the link was shared by mistake: the old one stops working at once. **Turn off** removes access until you create a link again.
- By default the report counts everything logged, so its totals match your Reports page. Switch on **Count only approved time** to leave out weeks that haven't been approved yet.
- The panel shows when the link was last opened. Only admins can create or change links.

## Roles
Team Member (own time), Team/Project Manager (own team; approves their team's timesheets and their own), Location Manager (own office), Admin (everyone). Location managers (their own office) and admins (anyone) can also add and change time on someone's behalf. Location managers and admins approve only when really needed: weeks of people whose team has no Team/Project Manager (including managers' and admins' own weeks), or weeks that waited more than 3 days. Reminder emails to them cover only those weeks.

## Pilot, then roll out
Run one office for 1 to 2 weeks. Check that people submit, managers approve, and Reports match expectations. Then add one office at a time.

## Everyday tasks
- **Forgot password:** People, create a password reset link, send it to the person.
- **Someone leaves:** People, set them inactive (their history stays).
- **Wrong time entered, or someone forgot to log:** location managers (for people in their own office) and admins (for anyone) can add and change time on the person's behalf. Open Timesheet or Calendar and pick the person in **Whose time**. A week that is waiting for approval must be sent back from Approvals first, an approved week can't be changed, and neither can a day on or before the lock date. Every change is written to the change log as "on behalf of", and the person still submits their own week.
- **Overtime:** create a tag named exactly `OT` in Settings, and people tag the time they work as overtime with it. Approvals and *Review Time* then highlight that time with an *OT* mark (capital letters don't matter). Reports and CSV exports show it only as the tag name, like any other tag. Without an `OT` tag nothing is highlighted.
- **A client's contract changes, or ends part-way through a month:** Clients, **Monthly contracts**. Type that month's hours in its box (0 for a month with no contract, a smaller figure for one that ends part-way), then Save changes. Blue boxes differ from the client's usual monthly hours; boxes left the same follow the usual hours. Utilisation, hours left and pace on the Clients page use each month's own figure. Admins change them; location managers can look. Pick the client's **work types** (your tags, such as CAD or ENG) in the same row, for the record.
- **Someone's expected hours change through the year:** People, **Monthly hours**. Type the hours per week for that month, then Save changes (location managers can do this for their own office). Productivity and "Your numbers" use the figure for each month. Admins are not a resource, so they are not listed and are left out of utilisation, reminders and the Top 5 lists.
- **Close a month:** set the lock date in Settings. Holidays and time off on or before the lock date can't be added or removed either.
- **Public holiday:** Time off, Public holidays, pick the office (admins) and add it. "All offices" is for a holiday everyone shares. Paste several at once with one line each, like `2026-12-25, Christmas Day` (add `(half)` for a half day).
- **Someone is on leave:** Time off, Add time off. Managers can add it for the people they manage. Hours logged on a day off still count, as extra. Changing a holiday or time off changes the numbers for past periods too.
- **Export everything:** Import and export, or Reports, Export, Save as CSV (it follows whatever filters are applied).

## Backups
Neon keeps point-in-time history on its free plan (short window). For a company of this size, upgrade Neon to a paid plan and also export the time CSV monthly.

## Updating the app
Changes pushed to the GitHub main branch deploy automatically on Vercel. Database changes apply on each deploy.
