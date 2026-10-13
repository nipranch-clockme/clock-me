// Entry draft: a time entry being typed survives the session ending. Saving then sends the person to sign in, and after they sign in the
// entry form opens again with what they typed and a notice. Bumps the sample member's sessionVersion to end the session, and restores it afterwards.
//   BASE=http://localhost:3500 PSQL="psql -h /var/run/postgresql tags_t" node e2e/entry-draft.js
const { execSync } = require("child_process");
const { start, login, BASE } = require("./helpers");
const PSQL = process.env.PSQL || "psql -h /tmp -U postgres clockme";
const sql = (q) => execSync(`${PSQL} -v ON_ERROR_STOP=1 -At`, { input: q }).toString().trim();
let fails = 0;
const ok = (c, m) => { console.log((c ? "ok   " : "FAIL ") + m); if (!c) fails++; };
const here = (p) => new URL(p.url()).pathname + new URL(p.url()).search;

(async () => {
  const b = await start();
  const EMAIL = "priya@example.com";
  const PAGE = "/timesheet";
  const DESC = "Draft kept across sign-in";
  const sv = sql(`select "sessionVersion" from "User" where email='${EMAIL}'`);
  try {
    const p = await login(b, EMAIL);
    await p.goto(BASE + PAGE); await p.waitForLoadState("networkidle");

    // a project row to add time on, if this week has none yet
    if (!(await p.$("table.sheet button.addcell"))) {
      await p.click('button:has-text("Add project row")'); await p.waitForSelector("dialog[open] #addrow-project");
      await p.selectOption("#addrow-project", await p.$eval("#addrow-project", (s) => [...s.options].find((o) => o.value).value));
      await p.click('dialog[open] button:has-text("Add row")');
      await p.waitForSelector("table.sheet button.addcell");
    }

    // open the entry form from a cell, and type a description
    await p.click("table.sheet button.addcell >> nth=0");
    await p.waitForSelector("dialog[open] #e-desc");
    await p.fill("#e-desc", DESC);
    ok((await p.inputValue("#e-desc")) === DESC, "typed a description in the entry form");

    // the session ends: the sign-in cookie no longer matches the user's sessionVersion
    sql(`update "User" set "sessionVersion" = "sessionVersion" + 1 where email='${EMAIL}'`);

    // saving sends the person to sign in
    await p.click('dialog[open] button:has-text("Add entry")');
    await p.waitForURL((x) => x.pathname.startsWith("/login"), { timeout: 90000 });
    ok(new URL(p.url()).pathname === "/login", "saving after the session ended sends them to sign in");

    // sign in again: back on the timesheet, with the entry form open and what was typed in it
    await p.fill("#email", EMAIL); await p.fill("#password", "password123");
    await p.click('button:has-text("Sign in")');
    await p.waitForURL((x) => !x.pathname.startsWith("/login"), { timeout: 90000 });
    ok(here(p) === PAGE, "after signing in: back on " + PAGE + " (now " + here(p) + ")");
    const reopened = await p.waitForSelector("dialog[open] #e-desc", { timeout: 30000 }).then(() => true, () => false);
    ok(reopened && (await p.inputValue("dialog[open] #e-desc")) === DESC, "the entry form is open again with the description typed");
    ok(reopened && (await p.textContent("dialog[open]")).includes("We restored the entry you were adding before your session ended"), "the form shows the restored notice");
    ok(sql(`select count(*) from "TimeEntry" where description='${DESC}'`) === "0", "nothing was saved by the restored form yet");
  } catch (e) {
    console.log("ERR", e.message.slice(0, 900)); fails++;
  } finally {
    sql(`update "User" set "sessionVersion" = ${Number(sv)} where email='${EMAIL}'`);
    ok(sql(`select "sessionVersion" from "User" where email='${EMAIL}'`) === sv, "sessionVersion restored");
    await b.close();
  }
  console.log(fails ? `${fails} FAILED` : "ALL PASSED");
  process.exit(fails ? 1 : 0);
})();
