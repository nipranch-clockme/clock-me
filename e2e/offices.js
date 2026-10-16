// People > Offices and Teams: rename (the new name shows everywhere) and delete only once nobody belongs to it.
// Run against a copy of the sample database:  BASE=http://localhost:3300 PSQL="psql postgresql://tsk:tsk@localhost/tsk" node e2e/offices.js
const { execSync } = require("child_process");
const { start, login, BASE } = require("./helpers");
const PSQL = process.env.PSQL || "psql -h /var/run/postgresql clockme";
const q = (sql) => execSync(`${PSQL} -At -c "${sql.replace(/"/g, '\\"')}"`, { encoding: "utf8" }).trim();
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log("FAIL", m); } else console.log("PASS", m); };

(async () => {
  const b = await start();
  const p = await login(b, "admin@example.com");
  p.on("dialog", (d) => d.accept());
  const row = (name) => p.locator(`section:has(h3:text-is("Offices")) .item:has-text("${name}")`).first();
  await p.goto(BASE + "/people"); await p.waitForLoadState("networkidle");

  // Rename
  const before = q(`select count(*) from "User" u join "Location" l on l.id=u."locationId" where l.name='PNQ'`);
  await row("PNQ").locator('button:has-text("Rename")').click();
  await p.fill('input[aria-label="New name for PNQ"]', "Pune");
  await p.click('button:has-text("Save")'); await p.waitForTimeout(1500);
  ok(q(`select count(*) from "Location" where name='Pune'`) === "1" && q(`select count(*) from "Location" where name='PNQ'`) === "0", "PNQ is renamed to Pune");
  ok(q(`select count(*) from "User" u join "Location" l on l.id=u."locationId" where l.name='Pune'`) === before, "its people stay with it");
  await p.reload(); await p.waitForLoadState("networkidle");
  ok((await p.content()).includes("Pune"), "People page shows the new name");
  await p.goto(BASE + "/dashboard"); await p.waitForLoadState("networkidle");
  ok((await p.content()).includes("Pune"), "Dashboard shows the new name");
  await p.goto(BASE + "/people"); await p.waitForLoadState("networkidle");
  await row("Pune").locator('button:has-text("Rename")').click();
  await p.fill('input[aria-label="New name for Pune"]', "amd");
  await p.click('button:has-text("Save")'); await p.waitForTimeout(1200);
  ok((await p.locator("text=Another office already has that name").count()) === 1, "can't take another office's name (any capitals)");
  await p.fill('input[aria-label="New name for Pune"]', "PNQ");
  await p.click('button:has-text("Save")'); await p.waitForTimeout(1500);
  ok(q(`select count(*) from "Location" where name='PNQ'`) === "1", "renamed back");

  // Delete: refused while people belong to it, done once empty
  await p.reload(); await p.waitForLoadState("networkidle");
  await row("KLH").locator('button:has-text("Delete")').click(); await p.waitForTimeout(1500);
  ok((await p.locator("text=Move them to another office").count()) === 1 && q(`select count(*) from "Location" where name='KLH'`) === "1", "an office with people isn't deleted");
  await p.fill("#no-name", "Temp office"); await p.click('button:has-text("Add office")'); await p.waitForTimeout(1200);
  const id = q(`select id from "Location" where name='Temp office'`);
  q(`insert into "Team"(id,name,"locationId") values('tmpteam','Temp team','${id}')`);
  q(`insert into "Holiday"(id,"locationId",date,name) values('tmphol','${id}','2026-12-25','Xmas')`);
  await p.reload(); await p.waitForLoadState("networkidle");
  await row("Temp office").locator('button:has-text("Delete")').click(); await p.waitForTimeout(1500);
  ok(q(`select count(*) from "Location" where id='${id}'`) === "0", "an empty office is deleted");
  ok(q(`select count(*) from "Team" where id='tmpteam'`) === "0" && q(`select count(*) from "Holiday" where id='tmphol'`) === "0", "its teams and holidays go with it");
  ok(p.errs.length === 0, "no page errors: " + p.errs.join(" | "));

  // Teams: rename, delete refused with people (archived too), deleted when empty
  const trow = (name) => p.locator(`section:has(h3:text-is("Teams")) .item:has-text("${name}")`).first();
  const team = q(`select t.name||'|'||t.id from "Team" t where exists (select 1 from "User" u where u."teamId"=t.id) order by t.name limit 1`).split("|");
  await p.reload(); await p.waitForLoadState("networkidle");
  await trow(team[0]).locator('button:has-text("Rename")').click();
  await p.fill(`input[aria-label="New name for ${team[0]}"]`, team[0] + " Squad");
  await p.click('button:has-text("Save")'); await p.waitForTimeout(1500);
  ok(q(`select name from "Team" where id='${team[1]}'`) === team[0] + " Squad", "a team is renamed");
  await p.reload(); await p.waitForLoadState("networkidle");
  await trow(team[0] + " Squad").locator('button:has-text("Delete")').click(); await p.waitForTimeout(1500);
  ok((await p.locator("text=Move them to another team first").count()) === 1 && q(`select count(*) from "Team" where id='${team[1]}'`) === "1", "a team with people isn't deleted");
  await trow(team[0] + " Squad").locator('button:has-text("Rename")').click();
  await p.fill(`input[aria-label="New name for ${team[0]} Squad"]`, team[0]);
  await p.click('button:has-text("Save")'); await p.waitForTimeout(1500);
  ok(q(`select name from "Team" where id='${team[1]}'`) === team[0], "renamed back");
  const loc = q(`select id from "Location" where name='AMD'`);
  q(`insert into "Team"(id,name,"locationId") values('t-arch','Archive team','${loc}'), ('t-empty','Empty team','${loc}')`);
  const arch = q(`select id from "User" where role='MEMBER' and "teamId" is not null limit 1`), archTeam = q(`select "teamId" from "User" where id='${arch}'`);
  q(`update "User" set "teamId"='t-arch', active=false where id='${arch}'`);
  await p.reload(); await p.waitForLoadState("networkidle");
  await trow("Archive team").locator('button:has-text("Delete")').click(); await p.waitForTimeout(1500);
  ok(q(`select count(*) from "Team" where id='t-arch'`) === "1", "a team with only an archived person isn't deleted");
  await trow("Empty team").locator('button:has-text("Delete")').click(); await p.waitForTimeout(1500);
  ok(q(`select count(*) from "Team" where id='t-empty'`) === "0", "an empty team is deleted");
  q(`update "User" set "teamId"='${archTeam}', active=true where id='${arch}'`); q(`delete from "Team" where id='t-arch'`);

  // Only admins (Location managers: their own office's teams)
  const m = await login(b, "oliver@example.com");
  await m.goto(BASE + "/people"); await m.waitForLoadState("networkidle");
  ok((await m.locator('section:has(h3:text-is("Offices")) button:has-text("Rename")').count()) === 0, "a Location manager can't rename or delete offices");
  ok((await m.locator('section:has(h3:text-is("Teams")) button:has-text("Rename")').count()) > 0, "a Location manager can rename their office's teams");
  const mem = await login(b, "priya@example.com");
  await mem.goto(BASE + "/people"); await mem.waitForLoadState("networkidle");
  ok((await mem.locator('button:has-text("Rename")').count()) === 0, "others get no Rename");
  await b.close();
  console.log(fails ? `${fails} FAILED` : "ALL PASSED");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
