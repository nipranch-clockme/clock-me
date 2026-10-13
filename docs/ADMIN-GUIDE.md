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
6. Time off, Public holidays (admins only): add each year's holidays. Most are shared by every office, so they start with every office ticked. Untick the offices a holiday doesn't apply to. Offices with no holidays listed get nothing taken off, and the page warns about them. Add the next year's before it starts.

## Bringing people, projects and time in from CSV
Import & export, Import tab (admins only; location managers and Team/Project Managers can no longer import or export there). Do the three in this order: projects first, so the People file's *Projects Managed* column can link people to them; time last, because it needs the people and the projects.
1. **Clients and projects.** `the-time-sink-clients-projects-template.csv`. Tasks become the project's phases (blank gives the five Submission phases). A blank Client files the project under *Internal*. Only admins create new clients and tags.
2. **People.** Download the template (`the-time-sink-people-template.csv`), fill it in, choose the office, check it, import. Everyone gets an invite link that works for 7 days. The links are shown once, so copy them or download the file straight away (or tick the email option if email is switched on). Managers need a Group, because a Team/Project Manager looks after one team (if the Group is blank, the first group in *Groups Managed* is used). A Group that doesn't exist yet is created. *Projects Managed* links only projects that already exist. Only admins can import, and the Import & export tab is for admins only. Working Days can be written like `Mon, Tue, Wed, Thu, Fri`, `Mon-Fri` or `Monday to Friday`.
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
Team member (own time), Team/Project Manager (own team; approves their team's timesheets and their own), Location manager (own office), Admin (everyone), Human Resource (logs their own time on any project, using the Admin tag for admin time; not a resource; sees the company's team utilisation on the Dashboard, not clients or anyone's entries), and Guest (a third-party contractor in an office: team member access without the Dashboard or Time off, sees project names but not clients, no expected hours, and not counted in inventory or utilisation). Only admins can give someone the Human Resource or Guest role. Location managers (their own office) and admins (anyone) can also add and change time on someone's behalf, and add time off for the people they manage. Time off that people ask for is approved by a location manager (for their office's members and team managers) or an admin; a location manager's request goes to an admin, and an admin's to another admin. Location managers and admins approve only when really needed: weeks of people whose team has no Team/Project Manager (including managers' and admins' own weeks), or weeks that waited more than 3 days. Reminder emails to them cover only those weeks.

## Pilot, then roll out
Run one office for 1 to 2 weeks. Check that people submit, managers approve, and Reports match expectations. Then add one office at a time.

## Everyday tasks
- **Forgot password:** People, create a password reset link, send it to the person.
- **Someone leaves:** People, set them inactive (their history stays).
- **Sign out:** the Sign out button ends the session on every device, so a copy of an old sign-in stops working too.
- **Who changed what:** Settings, Change log shows the latest 200 changes, newest first, with who made each one and, where it applies, who it was about.
- **Wrong time entered, or someone forgot to log:** location managers (for people in their own office) and admins (for anyone) can add and change time on the person's behalf. Open Timesheet or Calendar and pick the person in **Whose time**. A week that is waiting for approval must be sent back from Approvals first, an approved week can't be changed, and neither can a day on or before the lock date. Every change is written to the change log as "on behalf of", and the person still submits their own week.
- **Overtime:** create a tag named exactly `OT` in Settings, and people tag the time they work as overtime with it. Approvals and *Review time* then highlight that time with an *OT* mark (capital letters don't matter). Reports and CSV exports show it only as the tag name, like any other tag. Without an `OT` tag nothing is highlighted.
- **A client's contract changes, or ends part-way through a month:** Clients, **Monthly contracts**. Type that month's hours in its box (0 for a month with no contract, a smaller figure for one that ends part-way), then Save changes. Blue boxes differ from the client's usual monthly hours; boxes left the same follow the usual hours. Utilisation, hours left and pace on the Clients page use each month's own figure. Admins change them; location managers can look. Pick the client's **work types** (your tags, such as CAD or ENG) in the same row, for the record. Each client also has a **status** (Contracted, Project-based or Lost) and a **drawing standard** (AVDL, Modified AVDL or Proprietary), chosen in the same row and saved with Save changes. The table lists Contracted clients first, then Project-based, then Lost, and a lost client's name shows in red. Use the office buttons above the table to see one office's clients and their totals.
- **A figure for a past month is locked:** months before the current one are greyed out and their boxes cannot be typed in. To correct one, press **Change past months** and confirm both warnings. The boxes lock again after you save.
- **Someone's expected hours change through the year:** People, **Monthly hours**. Type the hours per week for that month, then Save changes (location managers can do this for their own office). Utilisation and "Your numbers" use the figure for each month. Admins are not a resource, so they are not listed and are left out of utilisation, reminders and the Top 5 lists.
- **Close a month:** set the lock date in Settings. Holidays and time off on or before the lock date can't be added or removed either.
- **Public holiday (admins only):** Time off, Public holidays. Tick the offices it applies to (all are ticked to start with, and None clears them), then add it. Paste several at once with one line each, like `2026-12-25, Christmas Day`, and every line goes to the offices ticked (add `(half)` for a half day). The list shows each holiday once, with its offices in a column. Removing a holiday takes it from every office in that column.
- **Someone is on leave:** anyone can ask for it: Time off, Request time off. Past dates are fine. A location manager or admin approves it under Approvals, and it counts toward expected hours only once approved. A person can withdraw a request that is still waiting. Location managers and admins can add time off for the people they manage (admins for anyone), and it counts at once. Hours logged on a day off still count, as extra. Changing a holiday or time off changes the numbers for past periods too.
- **Export everything:** Import and export, or Reports, Export, Download CSV (it follows whatever filters are applied).

## Backups
Neon keeps point-in-time history on its free plan (short window). For a company of this size, upgrade Neon to a paid plan and also export the time CSV monthly.

## Updating the app
Changes pushed to the GitHub main branch deploy automatically on Vercel. Database changes apply on each deploy.
