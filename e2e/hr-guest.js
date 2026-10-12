// Human Resource and Guest: Human Resource logs admin time on the Internal client's projects only, is not a resource, and sees the company's
// team utilisation (no client overview, no contract figures). Guest is a third-party contractor with Team member access, no Dashboard and no
// Time off, not in any office's numbers. Import and export is for admins only. Sets up its own users and removes them again.
//   BASE=http://localhost:3500 PSQL="psql -h /var/run/postgresql tags_t" node e2e/hr-guest.js
const { execSync } = require("child_process");
const { start, login, BASE } = require("./helpers");
const PSQL = process.env.PSQL || "psql -h /tmp -U postgres clockme";
const sql = (q) => execSync(`${PSQL} -v ON_ERROR_STOP=1 -At`, { input: q }).toString().trim();
let fails = 0;
const ok = (c, m) => { console.log((c ? "ok   " : "FAIL ") + m); if (!c) fails++; };
const tabs = async (p) => (await p.locator("nav a").allInnerTexts()).map((t) => t.trim());
const pathOf = (p) => new URL(p.url()).pathname;

(async () => {
  const b = await start();
  const HR = "hrt1", GU = "gst1";
  const hrMail = "hr.test@example.com", guMail = "guest.test@example.com";
  const office = sql(`select id from "Location" where name='AMD'`);
  const internal = sql(`select p.id||'|'||ph.id from "Project" p join "Client" c on c.id=p."clientId" join "Phase" ph on ph."projectId"=p.id where c.name='Internal' and not p.archived and ph.sort<999 order by p.name, ph.sort limit 1`).split("|");
  const internalName = sql(`select p.name from "Project" p join "Client" c on c.id=p."clientId" where c.name='Internal' and not p.archived order by p.name limit 1`);
  const clientProject = sql(`select p.name from "Project" p join "Client" c on c.id=p."clientId" where c.name<>'Internal' and p.access='PUBLIC' and not p.archived order by p.name limit 1`);
  const clientName = sql(`select c.name from "Project" p join "Client" c on c.id=p."clientId" where p.name='${clientProject.replace(/'/g, "''")}' limit 1`);
  const cleanup = () => {
    sql(`delete from "TimeEntry" where "userId" in ('${HR}','${GU}')`);
    sql(`delete from "User" where id in ('${HR}','${GU}')`);
  };
  const csvRows = async (p, year, officeId) => (await (await p.request.get(`${BASE}/dashboard/report?year=${year}&office=${officeId}`)).text()).split("\r\n");
  try {
    cleanup();
    const year = new Date().getUTCFullYear();
    const admin = await login(b, "admin@example.com");
    const before = await csvRows(admin, year, office);
    const row = (rows, label) => rows.find((l) => l.startsWith(label + ","));
    const beforeInv = row(before, "Inventory available"), beforeEmp = row(before, "Total active employees");

    // the two new people, in the same office as the admin's test people, with no expected hours (not a resource)
    const pw = sql(`select "passwordHash" from "User" where email='elena@example.com'`);
    sql(`insert into "User"(id,email,name,"passwordHash",role,"locationId","weeklyTarget","createdAt") values
      ('${HR}','${hrMail}','Hana Resource','${pw}','HUMAN_RESOURCE','${office}',0,now()-interval '300 days'),
      ('${GU}','${guMail}','Gita Guest','${pw}','GUEST','${office}',0,now()-interval '300 days')`);

    const after = await csvRows(admin, year, office);
    ok(row(after, "Inventory available") === beforeInv && row(after, "Total active employees") === beforeEmp,
      "Human Resource and Guest add nothing to the office's inventory or headcount");

    // ---------- Human Resource ----------
    const hr = await login(b, hrMail);
    const hrTabs = await tabs(hr);
    ok(["Dashboard", "Timesheet", "Time off", "Reports", "Projects"].every((t) => hrTabs.includes(t)), "Human Resource: Dashboard, Timesheet, Time off, Reports, Projects: " + hrTabs.join(","));
    ok(!["Clients", "People", "Approvals", "Import & export", "Settings"].some((t) => hrTabs.includes(t)), "Human Resource: no Clients, People, Approvals, Import & export or Settings");
    await hr.goto(`${BASE}/dashboard`); await hr.waitForLoadState("networkidle");
    const hrDash = (await hr.locator(".dtabs a").allInnerTexts()).map((t) => t.trim());
    ok(hrDash.join() === "Team Overview,Detailed Utilization", "Human Resource: Team Overview and Detailed Utilization only: " + hrDash.join(","));
    await hr.goto(`${BASE}/dashboard?tab=detailed`); await hr.waitForLoadState("networkidle");
    const offs = (await hr.locator("#mr-office option").allInnerTexts()).map((t) => t.trim());
    ok(offs[0] === "All offices" && offs.length > 2, "Human Resource: every office and All offices: " + offs.join(","));
    ok((await hr.locator("#monthly-report").count()) === 1 && (await hr.locator("td:has-text('Contract fulfilment')").count()) === 0,
      "Human Resource: the monthly report has no contract fulfilment line");
    await hr.goto(`${BASE}/dashboard?tab=clients`); await hr.waitForLoadState("networkidle");
    ok((await hr.locator("#cl-range").count()) === 0 && (await hr.locator("table.clients").count()) === 0, "Human Resource: no client overview, even by link");
    await hr.goto(`${BASE}/clients`); await hr.waitForLoadState("networkidle");
    ok(pathOf(hr) === "/timesheet", "Human Resource: /clients goes to the timesheet");
    await hr.goto(`${BASE}/timesheet`); await hr.waitForLoadState("networkidle");
    await hr.click('button:has-text("Add project row")');
    await hr.waitForSelector("dialog[open] select[name=projectId]");
    const hrOpts = (await hr.locator("dialog[open] select[name=projectId] option").allInnerTexts()).map((t) => t.trim());
    ok(hrOpts.some((n) => n.includes(internalName)), "Human Resource: can log on an Internal project (" + internalName + ")");
    ok(hrOpts.some((n) => n === clientProject), "Human Resource: can log on any project, including client projects (" + clientProject + ")");
    await hr.locator("dialog[open] button:has-text('Cancel'), dialog[open] button[value=cancel]").first().click().catch(() => {});
    ok(hr.errs.length === 0, "no page errors for Human Resource " + hr.errs.join(" | "));
    await hr.context().close();

    // ---------- Guest ----------
    const gu = await login(b, guMail);
    const guTabs = await tabs(gu);
    ok(["Timesheet", "Reports", "Projects"].every((t) => guTabs.includes(t)) && !guTabs.includes("Dashboard") && !guTabs.includes("Time off"),
      "Guest: Timesheet, Reports and Projects, with no Dashboard and no Time off: " + guTabs.join(","));
    await gu.goto(`${BASE}/dashboard`); await gu.waitForLoadState("networkidle");
    ok(pathOf(gu) === "/timesheet", "Guest: /dashboard goes to the timesheet");
    await gu.goto(`${BASE}/time-off`); await gu.waitForLoadState("networkidle");
    ok(pathOf(gu) === "/timesheet", "Guest: /time-off goes to the timesheet");
    await gu.goto(`${BASE}/projects`); await gu.waitForLoadState("networkidle");
    ok((await gu.locator('button:has-text("New project")').count()) === 0, "Guest: cannot create projects");
    await gu.goto(`${BASE}/timesheet`); await gu.waitForLoadState("networkidle");
    await gu.click('button:has-text("Add project row")');
    await gu.waitForSelector("dialog[open] select[name=projectId]");
    const guOpts = (await gu.locator("dialog[open] select[name=projectId] option").allInnerTexts()).map((t) => t.trim());
    ok(guOpts.some((n) => n === clientProject) && guOpts.some((n) => n.includes(internalName)), "Guest: can log on the projects a team member can, including client projects");
    ok(!guOpts.some((n) => n.includes(clientName)), "Guest: project list shows project names only, not the client (" + clientName + ")");
    const guBody = await gu.locator("body").innerText();
    await gu.goto(`${BASE}/projects`); await gu.waitForLoadState("networkidle");
    ok(!(await gu.locator("body").innerText()).includes(clientName), "Guest: Projects page does not show the client name");
    await gu.goto(`${BASE}/profile`); await gu.waitForLoadState("networkidle");
    ok(!(await gu.locator("body").innerText()).includes(clientName), "Guest: own profile does not show the client name");
    await gu.goto(`${BASE}/reports`); await gu.waitForLoadState("networkidle");
    ok((await gu.locator('label:has-text("Client")').count()) === 0 && !(await gu.locator("body").innerText()).includes(clientName), "Guest: Reports has no client filter and no client name");
    ok(!guBody.includes(clientName), "Guest: timesheet does not show the client name");
    await gu.locator("dialog[open] button:has-text('Cancel'), dialog[open] button[value=cancel]").first().click().catch(() => {});
    ok(gu.errs.length === 0, "no page errors for Guest " + gu.errs.join(" | "));
    await gu.context().close();

    // ---------- Admin: import and export ----------
    ok((await admin.locator("nav a").allInnerTexts()).map((t) => t.trim()).includes("Import & export"), "admin: Import & export tab");
    await admin.context().close();
  } catch (e) {
    console.log("ERR", e.message.slice(0, 900)); fails++;
  } finally {
    cleanup();
    ok(sql(`select count(*) from "User" where id in ('${HR}','${GU}')`) === "0", "clean-up removed the test people");
    await b.close();
  }
  console.log(fails ? `${fails} FAILED` : "ALL PASSED");
  process.exit(fails ? 1 : 0);
})();
