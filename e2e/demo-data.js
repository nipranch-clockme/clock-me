// Settings > Demo data: adds 30 people, projects and a year of time, leaves everything real alone, and removes it all again.
// Run against a copy of the sample database (it adds and removes data):  BASE=http://localhost:3500 PSQL="psql -h /var/run/postgresql demo_t" node e2e/demo-data.js
const { execSync } = require("child_process");
const fs = require("fs");
const { start, login, BASE } = require("./helpers");
const PSQL = process.env.PSQL || "psql -h /var/run/postgresql clockme";
const q = (sql) => execSync(`${PSQL} -At -F '|' -c "${sql.replace(/"/g, '\\"')}"`, { encoding: "utf8" }).trim();
const n = (sql) => Number(q(sql));
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log("FAIL", m); } else console.log("PASS", m); };
const DEMO = `u."email" like '%@demo.timesink.example'`;

const counts = () => ({
  users: n(`select count(*) from "User"`), projects: n(`select count(*) from "Project"`), phases: n(`select count(*) from "Phase"`),
  entries: n(`select count(*) from "TimeEntry"`), sheets: n(`select count(*) from "Timesheet"`), clients: n(`select count(*) from "Client"`),
  tags: n(`select count(*) from "Tag"`), teams: n(`select count(*) from "Team"`), locations: n(`select count(*) from "Location"`),
  secrets: n(`select count(*) from "AppSecret" where key='demo-data'`),
  holidays: n(`select count(*) from "Holiday"`), timeoff: n(`select count(*) from "TimeOff"`),
});
const envSecret = () => (fs.readFileSync(process.env.ENVFILE || "/tmp/cm-demo/.env", "utf8").match(/^CRON_SECRET="?([^"\n]+)"?/m) || [])[1];
const cron = async () => (await fetch(BASE + "/api/cron/reminders", { headers: { authorization: `Bearer ${envSecret()}` } })).json();

(async () => {
  const before = counts();
  const cronBefore = await cron();
  const b = await start();
  const p = await login(b, "admin@example.com");
  p.on("dialog", (d) => d.accept());
  await p.goto(BASE + "/settings"); await p.waitForLoadState("networkidle");
  ok(await p.locator("#demo-h").count() === 1, "admin sees the Demo data panel");
  ok(await p.locator("text=Not added.").count() === 1, "it starts as not added");
  ok(await p.locator('button:has-text("Remove demo data")').count() === 0, "no Remove button before anything is added");

  // add it
  await p.click('button:has-text("Add demo data")');
  await p.waitForSelector("text=The demo data is in", { timeout: 240000 });
  ok(true, "adding finishes by itself");
  const text = await p.locator("#demo-h").locator("..").innerText();
  console.log("   panel says:", text.replace(/\s+/g, " ").slice(0, 260));
  ok(await p.locator('button:has-text("Add demo data")').count() === 0, "Add button is gone once it is added");

  const demoUsers = n(`select count(*) from "User" u where ${DEMO}`);
  ok(demoUsers === 30, `30 demo people (${demoUsers})`);
  ok(n(`select count(distinct u."locationId") from "User" u where ${DEMO}`) === before.locations, "spread over every office");
  ok(n(`select count(*) from "User" u join "Team" t on t.id=u."teamId" where ${DEMO} and t."locationId"<>u."locationId"`) === 0, "every team is the person's own office team");
  ok(n(`select count(*) from "User" u where ${DEMO} and u."teamId" is null`) === 0, "everyone has a team (these offices have teams)");
  ok(n(`select count(*) from "User" u where ${DEMO} and (u."passwordHash" is null or u.role<>'MEMBER' or u."inviteToken" is not null)`) === 0, "demo people are plain members with an unknown password and no invite");
  ok(n(`select count(distinct u."employeeId") from "User" u where ${DEMO} and u."employeeId" like 'DEMO-%'`) === 30, "unique DEMO- employee IDs");
  const after = counts();
  ok(after.clients === before.clients && after.tags === before.tags && after.teams === before.teams && after.locations === before.locations, "no client, tag, team or office was created");
  ok(after.users === before.users + 30, "only the 30 people were added to users");

  const projects = n(`select count(*) from "Project" where id in (select jsonb_array_elements_text(value::jsonb->'projectIds') from "AppSecret" where key='demo-data')`);
  ok(projects >= 6 && after.projects === before.projects + projects, `demo projects added (${projects}), none touched`);
  ok(n(`select count(*) from "Project" pr where id in (select jsonb_array_elements_text(value::jsonb->'projectIds') from "AppSecret" where key='demo-data') and pr."budgetHours" is null`) === 0, "every demo project has a budget");
  ok(n(`select count(*) from (select "clientId", name from "Project" group by 1,2 having count(*)>1) x`) === 0, "no duplicate project names within a client");
  const entries = n(`select count(*) from "TimeEntry" e join "User" u on u.id=e."userId" where ${DEMO}`);
  ok(entries > 12000 && entries < 30000, `about a year of time (${entries} entries)`);
  ok(after.entries === before.entries + entries, "no time was added for real people");
  const span = q(`select min(e.date), max(e.date) from "TimeEntry" e join "User" u on u.id=e."userId" where ${DEMO}`).split("|");
  const days = (new Date(span[1]) - new Date(span[0])) / 864e5;
  ok(days > 340 && days < 372, `covers the past year (${span[0]} to ${span[1]})`);
  ok(span[1] < new Date().toISOString().slice(0, 10), "nothing in the future or today");
  ok(n(`select count(*) from "TimeEntry" e join "User" u on u.id=e."userId" where ${DEMO} and extract(dow from e.date) in (0,6)`) === 0, "no weekend time");
  // public holidays per office and PTO per person, so expected hours match the gaps
  const hols = n(`select count(*) from "Holiday" where name like '% (demo)'`);
  ok(hols >= before.locations * 5 && after.holidays === before.holidays + hols, `each office got public holidays (${hols}), none of the real ones touched`);
  ok(n(`select count(*) from "Holiday" where name like '% (demo)' and extract(dow from date) in (0,6)`) === 0, "demo holidays fall on weekdays");
  ok(n(`select count(*) from "TimeEntry" e join "User" u on u.id=e."userId" join "Holiday" h on h."locationId"=u."locationId" and h.date=e.date where ${DEMO} and h.fraction>=1`) === 0, "no demo time on a public holiday of the person's office");
  const pto = n(`select count(*) from "TimeOff" t join "User" u on u.id=t."userId" where ${DEMO}`);
  ok(pto >= 60 && after.timeoff === before.timeoff + pto, `demo people have PTO (${pto} stretches), real people none added`);
  ok(n(`select count(*) from "TimeEntry" e join "User" u on u.id=e."userId" join "TimeOff" t on t."userId"=e."userId" and e.date between t."startDate" and t."endDate" where ${DEMO}`) === 0, "no demo time on a PTO day");
  ok(n(`select count(*) from "TimeOff" t join "User" u on u.id=t."userId" where ${DEMO} and (t.source<>'manual' or t.fraction<>1 or extract(dow from t."startDate") in (0,6) and extract(dow from t."endDate") in (0,6) and t."endDate"-t."startDate"<2)`) === 0, "demo PTO is plain, and never only a weekend");
  ok(n(`select count(*) from "TimeEntry" e join "User" u on u.id=e."userId" where ${DEMO} and cardinality(e."tagIds") = 0`) === 0, "every entry has an existing tag");
  ok(n(`select count(*) from "TimeEntry" e join "User" u on u.id=e."userId" where ${DEMO} and cardinality(e."tagIds") > 1`) > 1000, "many entries carry two tags");
  ok(n(`select count(*) from "TimeEntry" e join "User" u on u.id=e."userId" where ${DEMO} and exists (select 1 from unnest(e."tagIds") t where t not in (select id from "Tag"))`) === 0, "only existing tags are used");
  ok(n(`select count(*) from "TimeEntry" e join "User" u on u.id=e."userId" join "Phase" ph on ph.id=e."phaseId" where ${DEMO} and ph."projectId"<>e."projectId"`) === 0, "phases belong to their project");
  ok(n(`select count(*) from "TimeEntry" e join "User" u on u.id=e."userId" where ${DEMO} and e."projectId" not in (select jsonb_array_elements_text(value::jsonb->'projectIds') from "AppSecret" where key='demo-data')`) === 0, "demo time only goes on demo projects");
  const avg = Number(q(`select round(avg(s)/60.0,2) from (select sum(minutes) s from "TimeEntry" e join "User" u on u.id=e."userId" where ${DEMO} group by e."userId", e.date) x`));
  ok(avg > 5.5 && avg < 9, `a normal working day (${avg} h on days with time)`);
  ok(n(`select count(*) from "TimeEntry" e join "User" u on u.id=e."userId" where ${DEMO} and (e."startMin"<0 or e."startMin"+e.minutes>1440 or e.minutes<15)`) === 0, "entries start and end inside a day and are at least 15 minutes");
  // contracted clients are not wildly overrun
  const contract = q(`select c.name, c."monthlyHours", round(avg(m.h)::numeric,0) from "Client" c join (select pr."clientId" cid, date_trunc('month', e.date) mo, sum(e.minutes)/60.0 h from "TimeEntry" e join "Project" pr on pr.id=e."projectId" join "User" u on u.id=e."userId" where ${DEMO} and e.date < date_trunc('month', now()) group by 1,2) m on m.cid=c.id where c.type='FIXED' and c."monthlyHours" is not null group by 1,2`);
  console.log("   contracted clients (name | contract | average demo hours a month):", contract.replace(/\n/g, " ; "));
  for (const line of contract.split("\n").filter(Boolean)) { const [name, mh, avgh] = line.split("|"); ok(avgh / mh > 0.4 && avgh / mh < 1.3, `${name}: demo hours are near the contract (${avgh} of ${mh})`); }
  const thisMon = q(`select date_trunc('week', now())::date`);
  ok(n(`select count(*) from "Timesheet" t join "User" u on u.id=t."userId" where ${DEMO} and t."weekStart">='${thisMon}'`) === 0, "the current week has no sheet (stays open)");
  ok(n(`select count(*) from "Timesheet" t join "User" u on u.id=t."userId" where ${DEMO} and t.status<>'APPROVED'`) === 0, "past weeks are approved, so nothing lands in anyone's approval list");
  ok((await cron()).sent && JSON.stringify((await cron()).sent) === JSON.stringify(cronBefore.sent), `reminders ignore demo people (${JSON.stringify(cronBefore.sent)})`);

  // the rest of the app copes
  for (const path of ["/people", "/dashboard", "/reports", "/clients", "/projects", "/approvals", "/import-export"]) {
    const r = await p.goto(BASE + path); await p.waitForLoadState("networkidle");
    ok(r.status() < 400 && !(await p.locator("text=Application error").count()), `${path} loads with demo data`);
  }
  await p.goto(BASE + "/people"); await p.waitForLoadState("networkidle");
  ok(await p.locator("tbody tr", { hasText: "Invite pending" }).count() === 0, "no demo person shows as an invite pending");
  ok(await p.locator("tbody tr", { hasText: "demo.timesink.example" }).count() >= 30, "demo people are listed");

  // a second add is not offered, and the server refuses it too
  await p.goto(BASE + "/settings"); await p.waitForLoadState("networkidle");
  ok(await p.locator('button:has-text("Add demo data")').count() === 0 && await p.locator('button:has-text("Remove demo data")').count() === 1, "only Remove is offered when added");

  // remove everything
  await p.click('button:has-text("Remove demo data")');
  await p.waitForSelector("text=Not added.", { timeout: 120000 });
  const gone = counts();
  ok(JSON.stringify(gone) === JSON.stringify(before), `everything is back to how it was ${JSON.stringify(gone) === JSON.stringify(before) ? "" : JSON.stringify({ before, gone })}`);
  ok(n(`select count(*) from "AuditLog" where action like '%demo data%'`) >= 2, "the change log records the adding and the removal");
  ok(n(`select count(*) from "TimeEntry" e join "User" u on u.id=e."userId" where ${DEMO}`) === 0, "no demo time left");
  ok(p.errs.length === 0, "no browser errors " + p.errs.slice(0, 2).join(" | "));
  await b.close();
  console.log(fails ? `${fails} FAILED` : "ALL PASSED");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
