// Session return: when a person's session ends, they land on the sign-in page with the page they were on, and after signing in they go back to it.
// Bumps the sample user's sessionVersion to end the session, and restores it afterwards.
//   BASE=http://localhost:3500 PSQL="psql -h /var/run/postgresql tags_t" node e2e/session-return.js
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
  const sv = sql(`select "sessionVersion" from "User" where email='${EMAIL}'`);
  try {
    const p = await login(b, EMAIL);
    await p.goto(BASE + PAGE); await p.waitForLoadState("networkidle");
    ok(here(p) === PAGE, "signed in and on " + PAGE);

    // End the session: the sign-in cookie no longer matches the user's sessionVersion.
    sql(`update "User" set "sessionVersion" = "sessionVersion" + 1 where email='${EMAIL}'`);
    await p.goto(BASE + PAGE); await p.waitForLoadState("networkidle");
    const u = new URL(p.url());
    ok(u.pathname === "/login" && u.searchParams.get("next") === PAGE && u.searchParams.get("reason") === "ended",
      "session ended: on /login with next " + PAGE + " and reason=ended: " + u.search);

    // Sign in again from the same sign-in page: back to the page they were on.
    await p.fill("#email", EMAIL); await p.fill("#password", "password123");
    await p.click('button:has-text("Sign in")');
    await p.waitForURL((x) => !x.pathname.startsWith("/login"), { timeout: 90000 });
    ok(here(p) === PAGE, "after signing in: back on " + PAGE + " (now " + here(p) + ")");
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
