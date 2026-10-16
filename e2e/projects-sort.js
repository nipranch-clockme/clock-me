// The Projects list: a Date added column, and sort buttons for client, name, date added and budget (with the filters kept as they are).
// Run: BASE=http://localhost:3100 NODE_PATH=$(npm root -g) PSQL="psql -h /var/run/postgresql tags_t" node e2e/projects-sort.js
const { start, login, BASE } = require('./helpers');
const { sql } = require('./import-util');

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
// Names in the order the database gives them, for the same filter the page uses.
const dbNames = (order, where = 'true') => sql(`select p.name from "Project" p join "Client" c on c.id=p."clientId" where ${where} order by ${order}`).split('\n').filter(Boolean);

(async () => {
  const member = sql(`select email from "User" where role='MEMBER' and active order by email limit 1`);
  const b = await start();
  try {
    const admin = await login(b, 'admin@example.com');
    const names = (p) => p.locator('.ptable tbody tr .prname').allTextContents().then((xs) => xs.map((x) => x.trim()));
    const sortBtn = (p, label) => p.locator('nav.psort a', { hasText: label });
    // Presses a sort button and waits until the address shows that sort, so the list read next is the new one.
    const go = async (p, label, sort, dir) => { await sortBtn(p, label).click(); await p.waitForURL((u) => u.searchParams.get('sort') === sort && u.searchParams.get('dir') === dir); await p.waitForLoadState('networkidle'); };

    // 1. The column and the four buttons.
    await admin.goto(`${BASE}/projects`); await admin.waitForLoadState('networkidle');
    ok(await admin.locator('.ptable thead th', { hasText: 'Date added' }).count() === 1, 'the table has a Date added column');
    const rows = await admin.locator('.ptable tbody tr').count();
    const dates = await admin.locator('.ptable tbody td[data-l="Date added"]').allTextContents();
    ok(rows > 1 && dates.length === rows, `every project row has a date added (${rows} rows)`);
    ok(dates.every((d) => /^[A-Z][a-z]{2} \d{1,2}, \d{4}$/.test(d.trim())), 'dates read like "Oct 15, 2026"');
    ok(await admin.locator('nav.psort a').count() === 4, 'four sort buttons are above the list');
    ok((await admin.locator('nav.psort a[aria-current="true"]').textContent()).includes('Client'), 'by default the Client button is the one in use');

    // 2. Name: A to Z, then Z to A.
    await go(admin, 'Name', 'name', 'asc');
    ok(admin.url().includes('sort=name') && admin.url().includes('dir=asc'), 'Name sorts A to Z first');
    let got = await names(admin);
    ok(JSON.stringify(got) === JSON.stringify([...got].sort((x, y) => x.localeCompare(y))), 'the names are in A to Z order');
    await go(admin, 'Name', 'name', 'desc');
    got = await names(admin);
    ok(admin.url().includes('dir=desc') && JSON.stringify(got) === JSON.stringify([...got].sort((x, y) => y.localeCompare(x))), 'pressing Name again flips it to Z to A');

    // 3. Date added: newest first by default; ties go by name, as in the database.
    await go(admin, 'Date added', 'added', 'desc');
    got = await names(admin);
    const wantAdded = dbNames('p."createdAt" desc, p.name asc', 'p.archived=false');
    ok(JSON.stringify(got) === JSON.stringify(wantAdded), `Date added lists newest first (${got.length} projects match the database)`);

    // 4. Budget: projects with a budget first, biggest first; no budget last; ties by name.
    await go(admin, 'Budget', 'budget', 'desc');
    got = await names(admin);
    const wantBudget = dbNames('(p."budgetHours" is null), p."budgetHours" desc, p.name asc', 'p.archived=false');
    ok(JSON.stringify(got) === JSON.stringify(wantBudget), 'Budget lists the biggest budget first and no budget last');

    // 5. Client, which is the default order.
    await go(admin, 'Client', 'client', 'asc');
    got = await names(admin);
    const wantClient = dbNames('c.name asc, p.name asc', 'p.archived=false');
    ok(JSON.stringify(got) === JSON.stringify(wantClient), 'Client lists projects by client, then name');

    // 6. Filters are kept when sorting, and archived projects still come last.
    await admin.goto(`${BASE}/projects?active=all&client=`); await admin.waitForLoadState('networkidle');
    const href = await sortBtn(admin, 'Name').getAttribute('href');
    ok(/active=all/.test(href) && /sort=name/.test(href), 'the sort buttons keep the Active filter');
    await go(admin, 'Date added', 'added', 'desc');
    const flags = await admin.locator('.ptable tbody tr').evaluateAll((trs) => trs.map((tr) => tr.textContent.includes('Archived')));
    const firstArchived = flags.indexOf(true);
    ok(firstArchived === -1 || flags.slice(firstArchived).every(Boolean), 'archived projects come after the active ones');

    // 7. Paging: 50 a page, 200 and 500 from the drop-down, Previous and Next, and the sort is kept from page to page.
    // Adds 60 projects for this check only; they are removed again straight after.
    sql(`insert into "Project" (id,name,"clientId",access,archived,"createdAt") select 'pgtest'||g, 'pgtest-'||lpad(g::text,3,'0'), (select id from "Client" order by name limit 1), 'PUBLIC', false, now() from generate_series(1,60) g`);
    try {
      const total = +sql(`select count(*) from "Project" where archived=false`);
      await admin.goto(`${BASE}/projects`); await admin.waitForLoadState('networkidle');
      ok(await admin.locator('.ptable tbody tr').count() === 50, 'the first page shows 50 projects');
      ok((await admin.locator('.ppager').textContent()).includes('Page 1 of 2'), 'the page says it is page 1 of 2');
      ok((await admin.locator('.psize-row .note').textContent()).includes(`1–50 of ${total}`), `the count reads 1–50 of ${total}`);
      ok(await admin.locator('.ppager [aria-disabled="true"]').count() === 1, 'Previous is off on the first page');
      await admin.click('.ppager a:has-text("Next")'); await admin.waitForURL((u) => u.searchParams.get('page') === '2'); await admin.waitForLoadState('networkidle');
      ok(await admin.locator('.ptable tbody tr').count() === total - 50, 'page 2 shows the rest of the list');
      ok(await admin.locator('.ppager [aria-disabled="true"]').count() === 1, 'Next is off on the last page');
      await admin.selectOption('.psize select', '200'); await admin.waitForURL((u) => u.searchParams.get('pp') === '200'); await admin.waitForLoadState('networkidle');
      ok(await admin.locator('.ptable tbody tr').count() === total, '200 a page shows every project');
      ok(await admin.locator('.ppager').count() === 0, 'with one page there are no page buttons');
      await admin.selectOption('.psize select', '500'); await admin.waitForURL((u) => u.searchParams.get('pp') === '500'); await admin.waitForLoadState('networkidle');
      ok(await admin.locator('.ptable tbody tr').count() === total, '500 a page also shows every project');
      // The sort is kept from one page to the next.
      await admin.goto(`${BASE}/projects?pp=50&sort=name&dir=asc`); await admin.waitForLoadState('networkidle');
      const page1 = await names(admin);
      await admin.click('.ppager a:has-text("Next")'); await admin.waitForURL((u) => u.searchParams.get('page') === '2' && u.searchParams.get('sort') === 'name'); await admin.waitForLoadState('networkidle');
      const page2 = await names(admin);
      ok(JSON.stringify([...page1, ...page2]) === JSON.stringify(dbNames('p.name asc', 'p.archived=false')), 'page 1 then page 2 is the whole list in name order');
      // The Edit button stays inside the list box at 1280px, so it can be clicked.
      await admin.setViewportSize({ width: 1280, height: 900 }); await admin.goto(`${BASE}/projects`); await admin.waitForLoadState('networkidle');
      const inside = await admin.evaluate(() => { const box = document.querySelector('.tablebox').getBoundingClientRect(); const r = document.querySelector('.ptable td.act a').getBoundingClientRect(); return r.right <= box.right + 1 && r.left >= box.left - 1; });
      ok(inside, 'at 1280px the Edit button is inside the list box');
      await admin.locator('.ptable td.act a').first().click(); await admin.waitForURL((u) => u.searchParams.has('edit'));
      ok(true, 'the Edit button opens a project');
    } finally {
      sql(`delete from "Project" where name like 'pgtest-%'`);
    }

    // 8. A team member sees the column and the buttons too; a phone has no sideways scroll.
    const mem = await login(b, member);
    await mem.goto(`${BASE}/projects`); await mem.waitForLoadState('networkidle');
    ok(new URL(mem.url()).pathname === '/projects', `${member} (team member) opens Projects`);
    const memRows = await mem.locator('.ptable tbody tr').count();
    ok(memRows === 0 || (await mem.locator('.ptable thead th', { hasText: 'Date added' }).count()) === 1, 'a team member sees the Date added column');
    await admin.setViewportSize({ width: 390, height: 844 });
    await admin.goto(`${BASE}/projects`); await admin.waitForLoadState('networkidle');
    const phone = await admin.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
    ok(phone.doc <= phone.win, `Projects has no sideways scroll at 390px (${phone.doc} / ${phone.win})`);

    ok(admin.errs.length === 0 && mem.errs.length === 0, 'no browser errors on Projects' + (admin.errs.length ? `: ${admin.errs.join(' | ').slice(0, 300)}` : ''));
  } catch (e) {
    console.log('ERR', e.message.slice(0, 900)); fails++;
  } finally {
    await b.close();
  }
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})();
