// Settings > Import history: reads a Clockify detailed report, adds people, teams, clients, projects and time, approves the
// weeks, leaves what already existed alone, and removes exactly what it added.
// Run against a copy of the sample database (it adds and removes data):
//   BASE=http://localhost:3300 PSQL="psql postgresql://tsk:tsk@localhost/tsk" node e2e/history-import.js
// FILE=/path/to/export.csv runs the same import with a real file instead of the small made-up one (fewer exact checks).
const { execSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { start, login, BASE } = require("./helpers");
const PSQL = process.env.PSQL || "psql -h /var/run/postgresql clockme";
const q = (sql) => execSync(`${PSQL} -At -F '|' -c "${sql.replace(/"/g, '\\"')}"`, { encoding: "utf8" }).trim();
const n = (sql) => Number(q(sql));
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log("FAIL", m); } else console.log("PASS", m); };

const H = ["Project", "Client", "Description", "Task", "User", "Group", "Email", "Tags", "Type", "Start Date", "Start Time", "End Date", "End Time", "Duration (h)", "Duration (decimal)", "Date of creation", "Role"];
const row = (a) => a.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",");
const DOM = "history.test.example";
const FIXTURE = [H, ...[
  // project, client, description, task, user, group, email, tags, start date, start time, end date, end time, h, dec, role (Type and Date of creation are filled in below)
  ["Tower A", "Acme Integrators", "System Drawings", "", "Asha", "AMD-Batman", `asha@${DOM}`, "CAD", "09/01/2026", "09:00:00", "09/01/2026", "12:00:00", "03:00:00", "3.00", "Team/Project Manager"],
  ["Tower A", "Acme Integrators", "Markups & Revisions", "Submission 1", "Ben K", "AMD-Batman", `ben@${DOM}`, "CAD, OT", "09/02/2026", "10:00:00", "09/02/2026", "11:30:00", "01:30:00", "1.50", ""],
  ["Client Meeting", "Acme Integrators", "Call", "", "Ben K", "AMD-Batman", `ben@${DOM}`, "REVIT", "09/08/2026", "23:00:00", "09/09/2026", "01:00:00", "02:00:00", "2.00", ""],
  ["Client Meeting", "Northwind Logistics", "Call", "", "Cara", "PNQ-Hawkeye", `cara@${DOM}`, "ENG", "09/03/2026", "14:00:00", "09/03/2026", "15:00:00", "01:00:00", "1.00", ""],
  ["Tower A", "Acme Integrators", "Review", "", "Dev", "PNQ-Hawkeye, PNQ-Falcon", `dev@${DOM}`, "ADMIN", "09/10/2026", "09:00:00", "09/10/2026", "09:30:00", "00:30:00", "0.50", ""],
  ["Tower A", "Acme Integrators", "Empty", "", "Dev", "PNQ-Hawkeye, PNQ-Falcon", `dev@${DOM}`, "CAD", "09/10/2026", "10:00:00", "09/10/2026", "10:00:00", "00:00:00", "0.00", ""],
  ["Tower A", "Acme Integrators", "Admin's own", "", "Sam", "AMD-Batman", "admin@example.com", "CAD", "09/04/2026", "09:00:00", "09/04/2026", "10:00:00", "01:00:00", "1.00", ""],
]].map((r, i) => (i ? [...r.slice(0, 8), "Regular", ...r.slice(8, 14), "10/15/2026", r[14]] : r)).map(row).join("\n") + "\n";

const counts = () => ({
  users: n(`select count(*) from "User"`), projects: n(`select count(*) from "Project"`), phases: n(`select count(*) from "Phase"`),
  entries: n(`select count(*) from "TimeEntry"`), sheets: n(`select count(*) from "Timesheet"`), clients: n(`select count(*) from "Client"`),
  tags: n(`select count(*) from "Tag"`), teams: n(`select count(*) from "Team"`), secrets: n(`select count(*) from "AppSecret" where key like 'history-import%'`),
});

(async () => {
  const file = process.env.FILE || path.join(fs.mkdtempSync(path.join(os.tmpdir(), "hist-")), "clockify.csv");
  if (!process.env.FILE) fs.writeFileSync(file, FIXTURE);
  const before = counts();
  const adminBefore = q(`select role||'|'||"locationId"||'|'||coalesce("teamId",'') from "User" where email='admin@example.com'`);
  const b = await start();
  const p = await login(b, "admin@example.com");
  p.on("dialog", (d) => d.accept());
  await p.goto(BASE + "/settings"); await p.waitForLoadState("networkidle");
  ok(await p.locator("#history-h").count() === 1, "admin sees the Import history panel");
  ok(await p.locator("text=Nothing imported.").count() === 1, "it starts with nothing imported");

  await p.setInputFiles('input[aria-label="Clockify CSV file"]', file);
  await p.waitForSelector('button:has-text("Import")');
  const panel = async () => (await p.locator("#history-h").locator("..").innerText()).replace(/\s+/g, " ");
  console.log("   preview:", (await panel()).slice(0, 400));
  if (!process.env.FILE) {
    ok((await panel()).includes("7 time entries"), "preview counts the split entry twice and leaves out the empty one (7)");
    ok((await panel()).includes("1 row can't be read"), "the zero-length row is listed as left out");
    ok((await panel()).includes("1 entry runs past midnight"), "the past-midnight entry is mentioned");
    ok(await p.locator('select[aria-label="Office for AMD"]').inputValue() !== "", "office AMD is matched by name");
  }
  for (const s of await p.locator('select[aria-label^="Office for"]').all()) ok(await s.inputValue() !== "", `office ${await s.getAttribute("aria-label")} is matched`);
  await p.click('button:has-text("Import")');
  await p.waitForSelector("text=The history is in", { timeout: 600000 });
  ok(true, "importing finishes by itself");
  console.log("   after:", (await panel()).slice(0, 300));
  const after = counts();
  console.log("   before", before, "\n   after ", after);
  ok(after.secrets === 2, "the import is recorded");

  if (!process.env.FILE) {
    ok(after.users - before.users === 4, "4 new people (the admin, already here, is reused)");
    ok(q(`select role||'|'||"locationId"||'|'||coalesce("teamId",'') from "User" where email='admin@example.com'`) === adminBefore, "the existing admin's role, office and team are unchanged");
    ok(q(`select role from "User" where email='asha@${DOM}'`) === "LEADER", "Role column makes Asha a Team/Project Manager");
    ok(q(`select role from "User" where email='ben@${DOM}'`) === "MEMBER", "a blank role is a Team member");
    ok(q(`select u.role||'|'||l.name||'|'||coalesce(u."teamId",'none') from "User" u join "Location" l on l.id=u."locationId" where email='dev@${DOM}'`) === "LOCATION|PNQ|none", "someone under several teams is a Location manager with no team");
    ok(q(`select t.name||'|'||l.name from "User" u join "Team" t on t.id=u."teamId" join "Location" l on l.id=t."locationId" where email='cara@${DOM}'`) === "Hawkeye|PNQ", "a new team is made in the right office");
    ok(n(`select count(*) from "User" where email like '%@${DOM}' and "passwordHash" is not null`) === 0, "new people have no password (they need an invite)");
    ok(after.clients - before.clients === 1, "one new client; Northwind Logistics is reused");
    ok(after.projects - before.projects === 3, "3 new projects: the same project name under two clients is two projects");
    ok(after.tags - before.tags === 2, "OT and ADMIN are new tags; CAD, ENG and REVIT (Revit) are reused");
    ok(after.entries - before.entries === 7, "7 entries saved");
    ok(q(`select string_agg(e."startMin"||'+'||e.minutes||'@'||e.date, ',' order by e.date) from "TimeEntry" e join "User" u on u.id=e."userId" where u.email='ben@${DOM}' and e.description='Call'`) === "1380+60@2026-09-08,0+60@2026-09-09", "the past-midnight entry is split over two days");
    ok(n(`select count(*) from "TimeEntry" e join "Phase" ph on ph.id=e."phaseId" join "User" u on u.id=e."userId" where u.email like '%@${DOM}' and ph.name='Submission 1'`) === 6, "time with no Task goes into Submission 1");
    ok(n(`select count(*) from "TimeEntry" e join "User" u on u.id=e."userId" where u.email='ben@${DOM}' and array_length(e."tagIds",1)=2`) === 1, "an entry keeps both its tags");
    ok(q(`select string_agg(t."weekStart"::text||t.status, ',' order by t."weekStart") from "Timesheet" t join "User" u on u.id=t."userId" where u.email='asha@${DOM}'`) === "2026-08-31APPROVED,2026-09-07APPROVED", "each person's weeks from their first to the file's last are Approved");
  } else {
    ok(after.entries > before.entries, `${after.entries - before.entries} entries saved`);
  }

  // Approvals has nothing to do for the imported weeks.
  await p.goto(BASE + "/approvals"); await p.waitForLoadState("networkidle");
  ok(p.errs.length === 0, "no page errors: " + p.errs.join(" | "));
  await p.goto(BASE + "/reports?range=custom&from=2026-09-01&to=2026-09-30"); await p.waitForLoadState("networkidle");
  ok(p.errs.length === 0, "reports open without errors");

  // Remove it all again.
  await p.goto(BASE + "/settings"); await p.waitForLoadState("networkidle");
  await p.click('button:has-text("Remove imported history")');
  const t0 = Date.now(); await p.waitForSelector('p.alert.info:has-text("Removed")', { timeout: 300000 }); console.log("   removing took", Math.round((Date.now() - t0) / 1000), "s");
  const removed = counts();
  console.log("   removed", removed);
  for (const k of Object.keys(before)) ok(removed[k] === before[k], `after Remove, ${k} is back to ${before[k]} (is ${removed[k]})`);
  ok(q(`select role||'|'||"locationId"||'|'||coalesce("teamId",'') from "User" where email='admin@example.com'`) === adminBefore, "the admin is still here, unchanged");
  ok(await p.locator("text=Nothing imported.").count() === 1, "the panel is back to nothing imported");

  // Only admins can use it.
  const m = await login(b, "priya@example.com");
  await m.goto(BASE + "/settings"); await m.waitForLoadState("networkidle");
  ok(await m.locator("#history-h").count() === 0, "a Team member doesn't get the panel");
  await b.close();
  console.log(fails ? `${fails} FAILED` : "ALL PASSED");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
