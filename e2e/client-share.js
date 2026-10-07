// A client's view-only report link: created by an admin, opened without logging in, limited to project, hours and tag, with filters.
// Run: BASE=http://localhost:3100 NODE_PATH=$(npm root -g) PSQL="psql -h /var/run/postgresql clockme" node e2e/client-share.js
const { start, login, BASE } = require('./helpers');
const { sql } = require('./import-util');

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const CLIENT = 'Bluebird Health';
const money = (min) => (min / 60).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const q = (s) => s.replace(/'/g, "''");

(async () => {
  const clientId = sql(`select id from "Client" where name='${CLIENT}'`);
  const other = sql(`select id from "Client" where name<>'${CLIENT}' order by name limit 1`);
  const mins = (where) => +sql(`select coalesce(sum(e.minutes),0) from "TimeEntry" e join "Project" p on p.id=e."projectId" where p."clientId"='${clientId}' ${where || ''}`);
  const b = await start();
  const reset = () => sql(`update "Client" set "shareToken"=null, "shareApprovedOnly"=false, "shareViewedAt"=null where id='${clientId}'`);
  try {
    reset();
    // Some time with no tag, so the "No tag" choice exists (removed again at the end).
    sql(`delete from "TimeEntry" where description='share-test-notag'`);
    sql(`insert into "TimeEntry"(id,"userId","projectId",date,minutes,description) select 'sharetest-notag', (select id from "User" where email='admin@example.com'), p.id, current_date - 1, 90, 'share-test-notag' from "Project" p where p."clientId"='${clientId}' order by p.name limit 1`);
    const admin = await login(b, 'admin@example.com');

    // 1. The admin creates the link on the client page.
    await admin.goto(`${BASE}/clients/${clientId}`); await admin.waitForLoadState('networkidle');
    ok(await admin.locator('h3:has-text("Client link")').count() === 1, 'admin sees the Client link panel');
    await admin.click('button:has-text("Create link")');
    await admin.waitForSelector('.shlink input');
    const shown = await admin.inputValue('.shlink input');
    const token = sql(`select "shareToken" from "Client" where id='${clientId}'`);
    ok(/^[A-Za-z0-9_-]{32}$/.test(token), 'a 32 character secret was saved');
    ok(shown === `${BASE}/share/${token}`, 'the panel shows the full link');
    ok(sql(`select count(*) from "AuditLog" where action like 'Turned on the view-only link for client ${CLIENT}%' and at > now() - interval '5 minutes'`) !== '0', 'turning it on is in the audit log');

    // 2. A visitor with no login opens it.
    const visitor = await (await b.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
    const errs = []; visitor.on('pageerror', (e) => errs.push(e.message));
    const res = await visitor.goto(`${BASE}/share/${token}`); await visitor.waitForLoadState('networkidle');
    ok(res.status() === 200 && !/\/login/.test(visitor.url()), 'the link opens without logging in');
    const h = res.headers();
    ok(/noindex/.test(h['x-robots-tag'] || '') && /no-store/.test(h['cache-control'] || '') && h['referrer-policy'] === 'no-referrer', 'search engines, caches and referrers are told to stay away');
    ok(await visitor.locator('meta[name=robots][content*=noindex]').count() === 1, 'the page also says noindex');
    ok((await visitor.locator('h1').innerText()).includes(CLIENT), 'it names the client');
    const total = await visitor.locator('.rtotal b').innerText();
    ok(total === money(mins()), `total hours match the database (${total})`);

    // 3. Only project, hours and tag: nothing about people, descriptions, phases, other clients.
    const text = await visitor.locator('body').innerText();
    const html = await visitor.content();
    const people = sql(`select distinct u.name from "TimeEntry" e join "Project" p on p.id=e."projectId" join "User" u on u.id=e."userId" where p."clientId"='${clientId}' limit 12`).split('\n').filter(Boolean);
    ok(people.length > 2 && people.every((n) => !text.includes(n) && !html.includes(n)), `none of the ${people.length} people who logged time is named`);
    const descs = sql(`select distinct e.description from "TimeEntry" e join "Project" p on p.id=e."projectId" where p."clientId"='${clientId}' and length(e.description)>5 limit 8`).split('\n').filter(Boolean);
    ok(descs.length > 0 && descs.every((d) => !html.includes(d)), 'no description is shown');
    const phases = sql(`select distinct ph.name from "Phase" ph join "Project" p on p.id=ph."projectId" where p."clientId"='${clientId}'`).split('\n').filter(Boolean);
    ok(phases.length > 0 && phases.every((n) => !html.includes(n)), 'no phase is shown');
    const otherNames = sql(`select p.name from "Project" p where p."clientId"='${other}' limit 3`).split('\n').filter(Boolean);
    ok(otherNames.every((n) => !html.includes(n)), 'no other client project is shown');
    const myTags = sql(`select distinct t.name from "TimeEntry" e join "Project" p on p.id=e."projectId" join "Tag" t on t.id=e."tagId" where p."clientId"='${clientId}'`).split('\n').filter(Boolean);
    const unusedTags = sql(`select t.name from "Tag" t where not exists (select 1 from "TimeEntry" e join "Project" p on p.id=e."projectId" where e."tagId"=t.id and p."clientId"='${clientId}')`).split('\n').filter(Boolean);
    ok(unusedTags.every((n) => !(html.includes(`>${n}<`))), 'tags this client never used are not offered');
    ok(myTags.length > 0, 'this client has tags to show');
    ok(await visitor.locator('.side, .snav, .top').count() === 0, 'no app menu or top bar');

    // 4. Filters and grouping.
    const proj = sql(`select p.id||'|'||p.name from "Project" p where p."clientId"='${clientId}' and exists (select 1 from "TimeEntry" e where e."projectId"=p.id) order by p.name limit 1`).split('|');
    const projMins = mins(`and p.id='${proj[0]}'`);
    await visitor.goto(`${BASE}/share/${token}?project=${proj[0]}`); await visitor.waitForLoadState('networkidle');
    ok((await visitor.locator('.rtotal b').innerText()) === money(projMins), 'one project: total matches the database');
    ok(await visitor.locator('.rtable tbody tr.rg-row').count() === 1, 'one project: one row in the table');
    await visitor.goto(`${BASE}/share/${token}?project=${other}x&project=nonsense`); await visitor.waitForLoadState('networkidle');
    ok((await visitor.locator('.rtotal b').innerText()) === money(mins()), 'ids that are not this client are ignored');
    const foreignProject = sql(`select id from "Project" where "clientId"<>'${clientId}' limit 1`);
    await visitor.goto(`${BASE}/share/${token}?project=${foreignProject}`); await visitor.waitForLoadState('networkidle');
    ok((await visitor.locator('.rtotal b').innerText()) === money(mins()), "another client's project id shows nothing of theirs");
    const tag = sql(`select t.id||'|'||t.name from "Tag" t where exists (select 1 from "TimeEntry" e join "Project" p on p.id=e."projectId" where e."tagId"=t.id and p."clientId"='${clientId}') order by t.name limit 1`).split('|');
    await visitor.goto(`${BASE}/share/${token}?tag=${tag[0]}`); await visitor.waitForLoadState('networkidle');
    ok((await visitor.locator('.rtotal b').innerText()) === money(mins(`and e."tagId"='${tag[0]}'`)), 'one tag: total matches the database');
    await visitor.goto(`${BASE}/share/${token}?tag=none`); await visitor.waitForLoadState('networkidle');
    ok((await visitor.locator('.rtotal b').innerText()) === money(90) && mins(`and e."tagId" is null`) === 90, 'No tag: total matches the database');
    await visitor.goto(`${BASE}/share/${token}?by=tag`); await visitor.waitForLoadState('networkidle');
    ok(await visitor.locator('.rtable th:has-text("TAG")').count() === 1 && await visitor.locator('.rtable tbody tr.rg-row').count() >= myTags.length, 'group by tag lists the tags');
    await visitor.goto(`${BASE}/share/${token}?range=thisyear`); await visitor.waitForLoadState('networkidle');
    ok((await visitor.locator('.rtotal b').innerText()) === money(mins(`and e.date >= date_trunc('year', now())::date and e.date < (date_trunc('year', now()) + interval '1 year')::date`)), 'This year: total matches the database');
    // using the page's own controls
    await visitor.goto(`${BASE}/share/${token}`); await visitor.waitForLoadState('networkidle');
    await visitor.click('.fm-b:has-text("Project")');
    await visitor.check(`.fm-p input[value="${proj[0]}"]`);
    await visitor.click('button:has-text("Apply filter")');
    await visitor.waitForFunction((t) => document.querySelector('.rtotal b')?.textContent === t, money(projMins));
    ok(/project=/.test(visitor.url()), 'ticking a project and applying filters the page');
    await visitor.click('.rg-chev >> nth=0');
    ok(await visitor.locator('tr.rg-kid').count() > 0, 'a project row opens to show its tags');

    // 5. CSV
    const csv = await visitor.request.get(`${BASE}/share/${token}/export`);
    const body = await csv.text();
    ok(csv.status() === 200 && /filename="Bluebird-Health-time-report-\d{4}-\d{2}-\d{2}\.csv"/.test(csv.headers()['content-disposition'] || ''), 'CSV downloads under a tidy name');
    const lines = body.trim().split(/\r?\n/);
    ok(lines[0] === 'Project,Tag,Hours', 'CSV columns are Project, Tag, Hours only');
    const sum = lines.slice(1).reduce((a, l) => a + parseFloat(l.split(',').pop()), 0);
    ok(Math.abs(sum - mins() / 60) < 0.05 * lines.length, `CSV hours add up to the total (${sum.toFixed(2)})`);
    ok(descs.every((d) => !body.includes(d)) && people.every((n) => !body.includes(n)), 'CSV has no people or descriptions');
    const csv1 = await visitor.request.get(`${BASE}/share/${token}/export?project=${proj[0]}`);
    ok((await csv1.text()).trim().split(/\r?\n/).slice(1).every((l) => l.startsWith(proj[1])), 'CSV follows the filters');

    // 6. Approved time only.
    await admin.goto(`${BASE}/clients/${clientId}`); await admin.waitForLoadState('networkidle');
    await admin.locator('.shadmin .tog').click();
    await admin.waitForFunction(() => document.querySelector('.shadmin .tog input')?.checked === true);
    ok(sql(`select "shareApprovedOnly" from "Client" where id='${clientId}'`) === 't', 'the switch is saved');
    const approved = mins(`and exists (select 1 from "Timesheet" t where t."userId"=e."userId" and t.status='APPROVED' and t."weekStart"=date_trunc('week', e.date)::date)`);
    await visitor.goto(`${BASE}/share/${token}`); await visitor.waitForLoadState('networkidle');
    ok((await visitor.locator('.rtotal b').innerText()) === money(approved) && approved < mins(), `approved only: total matches approved weeks (${money(approved)})`);
    ok((await visitor.locator('.shhead .sub').innerText()).includes('approved time only'), 'the page says it counts approved time only');
    await admin.locator('.shadmin .tog').click();
    await admin.waitForFunction(() => document.querySelector('.shadmin .tog input')?.checked === false);

    // 7. Phone width and dark theme.
    await visitor.setViewportSize({ width: 390, height: 800 });
    await visitor.goto(`${BASE}/share/${token}`); await visitor.waitForLoadState('networkidle');
    ok(await visitor.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no sideways scroll on a phone');
    await visitor.screenshot({ path: '/tmp/claude-0/shots/share-phone.png', fullPage: true });
    await visitor.setViewportSize({ width: 1280, height: 1000 });
    await visitor.click('.themebtn'); await visitor.waitForTimeout(300);
    ok(await visitor.evaluate(() => document.documentElement.dataset.theme) === 'dark', 'the theme button switches to dark');
    await visitor.screenshot({ path: '/tmp/claude-0/shots/share-dark.png', fullPage: true });
    await visitor.click('.themebtn');
    await visitor.screenshot({ path: '/tmp/claude-0/shots/share-light.png', fullPage: true });
    ok(errs.length === 0, 'no page errors: ' + errs.join(' / '));

    // 8. Who can see and change the link.
    for (const who of ['oliver@example.com', 'aisha@example.com']) {
      const pg = await login(b, who);
      await pg.goto(`${BASE}/clients/${clientId}`); await pg.waitForLoadState('networkidle');
      const html2 = await pg.content();
      ok(!html2.includes(token) && await pg.locator('h3:has-text("Client link")').count() === 0, `${who}: no link panel and the secret is not in the page`);
      for (const route of ['/projects', '/clients', '/timesheet', '/calendar']) {
        const r = await pg.request.get(`${BASE}${route}`);
        ok(!(await r.text()).includes(token), `${who}: the secret is not in ${route}`);
      }
      await pg.context().close();
    }
    for (const route of ['/projects', '/clients', '/reports', '/timesheet', '/people']) {
      const r = await admin.request.get(`${BASE}${route}`);
      ok(!(await r.text()).includes(token), `admin: the secret is not in ${route}`);
    }

    // 9. A new link replaces the old one; turning it off stops it.
    await admin.goto(`${BASE}/clients/${clientId}`); await admin.waitForLoadState('networkidle');
    admin.once('dialog', (d) => d.accept());
    await admin.click('button:has-text("Make a new link")');
    await admin.waitForFunction((old) => document.querySelector('.shlink input')?.value && !document.querySelector('.shlink input').value.endsWith(old), token);
    const token2 = sql(`select "shareToken" from "Client" where id='${clientId}'`);
    ok(token2 && token2 !== token, 'a new secret was made');
    ok((await visitor.request.get(`${BASE}/share/${token}`)).status() === 404, 'the old link stops working');
    ok((await visitor.request.get(`${BASE}/share/${token}/export`)).status() === 404, 'the old CSV link stops working');
    ok((await visitor.request.get(`${BASE}/share/${token2}`)).status() === 200, 'the new link works');
    admin.once('dialog', (d) => d.accept());
    await admin.click('button:has-text("Turn off")');
    await admin.waitForSelector('button:has-text("Create link")');
    ok(sql(`select "shareToken" is null from "Client" where id='${clientId}'`) === 't', 'turning it off clears the secret');
    ok((await visitor.request.get(`${BASE}/share/${token2}`)).status() === 404, 'a link that was turned off shows nothing');

    // 10. Guessing is slowed down.
    sql(`delete from "AuthAttempt" where key like 'share:%'`);
    let last = '';
    for (let i = 0; i < 34; i++) { const r = await visitor.request.get(`${BASE}/share/${'a'.repeat(32 - String(i).length)}${i}`); last = r.status() === 404 ? '404' : await r.text(); }
    ok(/Too many attempts/.test(last), 'many wrong links in a row are refused for a while');
    ok((await visitor.request.get(`${BASE}/share/${'b'.repeat(32)}/export`)).status() === 429, 'the CSV address is refused too');
  } catch (e) {
    console.log('ERR', e.message.slice(0, 900)); fails++;
  } finally {
    try { sql(`delete from "TimeEntry" where description='share-test-notag'`); reset(); sql(`delete from "AuthAttempt" where key like 'share:%'`); sql(`delete from "AuditLog" where action like '%view-only link%' and at > now() - interval '1 hour'`); } catch {}
    await b.close();
  }
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})();
