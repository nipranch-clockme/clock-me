// Phase order: once a later phase of a project has time on it, new time can't go on an earlier phase. A member opens the entry form on the
// earlier phase from the Timesheet and saves: the Phase field names the later phase and who used it, and nothing is saved.
// Sets up its own people, a row and an entry directly in the local database, and removes them afterwards.
//   BASE=http://localhost:3500 PSQL="psql -h /var/run/postgresql tags_t" node e2e/phase-order.js
const { execSync } = require("child_process");
const { start, login, BASE } = require("./helpers");
const PSQL = process.env.PSQL || "psql -h /tmp -U postgres clockme";
const sql = (q) => execSync(`${PSQL} -v ON_ERROR_STOP=1 -At`, { input: q }).toString().trim();
let fails = 0;
const ok = (c, m) => { console.log((c ? "ok   " : "FAIL ") + m); if (!c) fails++; };
const addDays = (d, n) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const mondayOf = (d) => { const x = new Date(d + "T00:00:00Z"); return addDays(d, -((x.getUTCDay() + 6) % 7)); };

(async () => {
  const b = await start();
  const pid = process.pid;
  const uid = "phaseord" + pid, other = uid + "o", email = uid + "@example.com";
  const DESC = "Earlier phase " + uid;
  const PAGE = "/timesheet";
  const today = sql(`select to_char(now() at time zone 'UTC','YYYY-MM-DD')`), ws = mondayOf(today);
  const [proj, projName] = sql(`select id||'|'||name from "Project" p where access='PUBLIC' and not archived and (select count(distinct ph.sort) from "Phase" ph where ph."projectId"=p.id and ph.sort<999) >= 2 order by name limit 1`).split("|");
  const phases = sql(`select id||'|'||name from "Phase" where "projectId"='${proj}' and sort<999 order by sort`).split("\n").map((l) => l.split("|"));
  const early = phases[0], late = phases[phases.length - 1];
  const home = sql(`select "locationId"||'|'||"teamId"||'|'||"passwordHash" from "User" where email='priya@example.com'`).split("|");
  const otherName = "Phase Other " + pid;
  try {
    sql(`insert into "User"(id,email,name,"passwordHash",role,"locationId","teamId","weeklyTarget","createdAt") values('${uid}','${email}','Phase Test','${home[2]}','MEMBER','${home[0]}','${home[1]}',40,now()-interval '30 days'),('${other}','${uid}o@example.com','${otherName}','${home[2]}','MEMBER','${home[0]}','${home[1]}',40,now()-interval '30 days')`);
    // this week's row on the project, and a later phase used by the other person
    sql(`insert into "TimesheetRow"("userId","weekStart","projectId") values('${uid}','${ws}','${proj}')`);
    sql(`insert into "TimeEntry"(id,"userId","projectId","phaseId","tagIds",date,"startMin",minutes,description,custom,"createdAt") values('${uid}e','${other}','${proj}','${late[0]}','{}','${today}',540,60,'Later phase','{}',now())`);

    const p = await login(b, email);
    await p.goto(BASE + PAGE); await p.waitForLoadState("networkidle");

    // open the entry form from a day on the project's row, and choose the earlier phase
    await p.locator(`button.addcell[aria-label^="Add time to ${projName} on"]`).first().click();
    await p.waitForSelector("dialog[open] #e-phase");
    await p.selectOption("#e-phase", early[0]);
    await p.fill("#e-desc", DESC);
    ok((await p.inputValue("#e-phase")) === early[0] && (await p.inputValue("#e-desc")) === DESC, "chose the earlier phase and typed a description");

    // saving is refused, and the Phase field says which later phase is in use and who used it
    await p.click('dialog[open] button:has-text("Add entry")');
    await p.waitForSelector("dialog[open] #e-phase-err", { timeout: 30000 });
    const want = `"${late[1]}" is already being used by ${otherName}, so "${early[1]}" can't take new time on this project.`;
    const got = (await p.textContent("dialog[open] #e-phase-err")).trim();
    ok(got === want, "the Phase field shows the later phase and the person who used it (now: " + got + ")");

    // nothing was saved for this person
    ok(sql(`select count(*) from "TimeEntry" where "userId"='${uid}'`) === "0", "no entry was saved on the earlier phase");
  } catch (e) {
    console.log("ERR", e.message.slice(0, 900)); fails++;
  } finally {
    try {
      sql(`delete from "TimeEntry" where "userId" in ('${uid}','${other}')`);
      sql(`delete from "TimesheetRow" where "userId" in ('${uid}','${other}')`);
      sql(`delete from "User" where id in ('${uid}','${other}')`);
      ok(sql(`select count(*) from "User" where id in ('${uid}','${other}')`) === "0", "test people, rows and entries removed");
    } catch (e) {
      console.log("cleanup failed", e.message.slice(0, 300)); fails++;
    }
    await b.close();
  }
  console.log(fails ? `${fails} FAILED` : "ALL PASSED");
  process.exit(fails ? 1 : 0);
})();
