// Archive, restore and delete a client: archived clients leave the Clients list, and delete only works once the client is archived and has no projects.
// Run: BASE=http://localhost:3000 NODE_PATH=$(npm root -g) PSQL="psql -h /var/run/postgresql tags_t" node e2e/client-archive.js
const { start, login, BASE } = require('./helpers');
const { sql } = require('./import-util');

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };

(async () => {
  const tag = Date.now().toString(36);
  const quiet = `Archive Quiet ${tag}`, busy = `Archive Busy ${tag}`;
  sql(`insert into "Client" (id,name,color,type,status) values ('arq${tag}','${quiet}','s1','FLOATING','PROJECT_BASED'), ('arb${tag}','${busy}','s2','FLOATING','PROJECT_BASED')`);
  const project = `Archive project ${tag}`;
  sql(`insert into "Project" (id,name,"clientId",access,archived,"createdAt") values ('arp${tag}','${project}','arb${tag}','PUBLIC',false,now())`);
  const b = await start();
  try {
    const admin = await login(b, 'admin@example.com');
    admin.on('dialog', (d) => d.accept());
    const row = (p, name) => p.locator('tbody tr', { hasText: name }).count();

    // 1. Archive the quiet client: it leaves the Clients list and the project client picker.
    await admin.goto(`${BASE}/clients/arq${tag}`); await admin.waitForLoadState('networkidle');
    await admin.click('button:has-text("Archive client")'); await admin.waitForSelector('text=Archived. This client is hidden');
    ok(true, 'archiving shows the archived banner on the client page');
    await admin.goto(`${BASE}/clients`); await admin.waitForLoadState('networkidle');
    ok((await row(admin, quiet)) === 0, 'an archived client is not on the Clients list');
    await admin.goto(`${BASE}/clients?status=archived`); await admin.waitForLoadState('networkidle');
    ok((await row(admin, quiet)) === 1, 'the Archived filter lists the archived client');
    await admin.goto(`${BASE}/clients?status=all`); await admin.waitForLoadState('networkidle');
    ok((await row(admin, quiet)) === 1, 'the All filter lists the archived client too');

    // 2. Restore brings it back.
    await admin.goto(`${BASE}/clients/arq${tag}`); await admin.waitForLoadState('networkidle');
    await admin.click('button:has-text("Restore")'); await admin.waitForLoadState('networkidle');
    await admin.goto(`${BASE}/clients`); await admin.waitForLoadState('networkidle');
    ok((await row(admin, quiet)) === 1, 'a restored client is back on the Clients list');

    // 3. Delete needs archiving first, and is refused while the client still has a project.
    await admin.goto(`${BASE}/clients/arb${tag}`); await admin.waitForLoadState('networkidle');
    await admin.click('button:has-text("Archive client")'); await admin.waitForSelector('text=Archived. This client is hidden');
    ok(await admin.locator('button:has-text("Delete client")').isDisabled(), 'a client with a project cannot be deleted: the button is off');
    ok((await admin.locator('button:has-text("Delete client")').getAttribute('title') || '').includes('Remove its projects'), 'the button says why');
    ok(sql(`select count(*) from "Client" where id='arb${tag}'`) === '1', 'the client with a project is still there');

    // 4. Delete the quiet client: archived, no projects, so it goes and the page returns to the Clients list.
    await admin.goto(`${BASE}/clients/arq${tag}`); await admin.waitForLoadState('networkidle');
    await admin.click('button:has-text("Archive client")'); await admin.waitForSelector('text=Archived. This client is hidden');
    await admin.click('button:has-text("Delete client")'); await admin.waitForURL((u) => u.pathname === '/clients', { timeout: 30000 });
    ok(sql(`select count(*) from "Client" where id='arq${tag}'`) === '0', 'an archived client with no projects is deleted');

    // 5. Only Admins see the controls.
    const lead = await login(b, sql(`select email from "User" where role='LEADER' and active order by email limit 1`));
    await lead.goto(`${BASE}/clients/arb${tag}`); await lead.waitForLoadState('networkidle');
    ok((await lead.locator('button:has-text("Archive client")').count()) === 0, 'a Team/Project Manager does not see the archive control');
    ok(admin.errs.length === 0, 'no browser errors on the admin pages' + (admin.errs.length ? `: ${admin.errs.join(' | ').slice(0, 200)}` : ''));
  } catch (e) {
    console.log('ERR', e.message.slice(0, 600)); fails++;
  } finally {
    sql(`delete from "Project" where id='arp${tag}'`);
    sql(`delete from "Client" where id in ('arq${tag}','arb${tag}')`);
    await b.close();
  }
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})();
