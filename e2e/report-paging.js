// The report's Summary of projects shows 50 at a time, with Per page and Previous/Next like the Projects list.
// Seeds 55 projects with one entry each (today), checks the pages, then removes them.
const { start, login, BASE } = require('./helpers');
const { sql } = require('./import-util');

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };

(async () => {
  const tag = Date.now().toString(36);
  const client = sql(`select id from "Client" where "archivedAt" is null limit 1`) || sql(`select id from "Client" limit 1`);
  const admin = sql(`select id from "User" where email='admin@example.com'`);
  const ids = Array.from({ length: 55 }, (_, i) => `rp${tag}${i}`);
  sql(`insert into "Project" (id,name,"clientId",access,archived,"createdAt") select 'rp'||'${tag}'||g, 'Paging ${tag} '||lpad(g::text,2,'0'), '${client}', 'PUBLIC', false, now() from generate_series(0,54) g`);
  sql(`insert into "TimeEntry" (id,"userId","projectId",date,"startMin",minutes,description,custom,"tagIds") select 'rt'||'${tag}'||g, '${admin}', 'rp'||'${tag}'||g, current_date, 540, 60, '', '{}', ARRAY[]::text[] from generate_series(0,54) g`);
  const b = await start();
  try {
    const a = await login(b, 'admin@example.com');
    const rows = async () => a.locator('table.rtable tbody tr.rg-row').count();
    const go = async (u) => { await a.goto(BASE + u); await a.waitForLoadState('networkidle'); };
    const range = 'range=thisweek&group=project';

    await go(`/reports?${range}`);
    ok((await rows()) === 50, `the first page shows 50 projects (${await rows()})`);
    ok((await a.locator('.ppager').count()) === 1, 'the pager shows when there is more than one page');
    ok((await a.locator('.psize select').inputValue()) === '50', 'Per page starts at 50');
    ok((await a.locator('.ppager .btn', { hasText: 'Previous' }).getAttribute('aria-disabled')) === 'true', 'Previous is off on the first page');

    // Next carries the page and the page size; following it shows page 2. (Clicking it is not used here: link clicks on this page are flaky in the automated browser, on main too.)
    const nextHref = await a.locator('.ppager a', { hasText: 'Next' }).getAttribute('href');
    ok(/page=2/.test(nextHref) && /pp=50/.test(nextHref), 'Next links to page 2 at 50 per page');
    await a.goto(BASE + nextHref); await a.waitForLoadState('networkidle');
    const prevHref = await a.locator('.ppager a', { hasText: 'Previous' }).getAttribute('href');
    ok(/page=1/.test(prevHref), 'on page 2, Previous links back to page 1');
    const onTwo = await rows();
    ok(onTwo > 0 && onTwo <= 50, `page 2 shows the rest (${onTwo})`);
    ok((await a.locator('.ppager .note').innerText()).includes('Page 2 of 2'), 'the pager says Page 2 of 2');

    await go(`/reports?${range}&pp=200`);
    ok((await rows()) >= 55, `Per page 200 shows all the seeded projects (${await rows()})`);
    ok((await a.locator('.ppager').count()) === 0, 'no pager when everything fits on one page');
  } catch (e) {
    console.log('ERR', e.message.slice(0, 600)); fails++;
  } finally {
    sql(`delete from "TimeEntry" where id like 'rt${tag}%'`);
    sql(`delete from "Project" where id like 'rp${tag}%'`);
    await b.close();
  }
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})();
