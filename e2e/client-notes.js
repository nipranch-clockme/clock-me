// Notes on a client's page: Admins and Location Managers add them; the person who wrote a note or an Admin deletes it; other roles can't open the page.
// Run: BASE=http://localhost:3100 NODE_PATH=$(npm root -g) PSQL="psql -h /var/run/postgresql tags_t" node e2e/client-notes.js
const { start, login, BASE } = require('./helpers');
const { sql } = require('./import-util');

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const CLIENT = 'Bluebird Health';
const TAG = 'client-notes-test';

(async () => {
  const clientId = sql(`select id from "Client" where name='${CLIENT}'`);
  const member = sql(`select email from "User" where role='MEMBER' and active order by email limit 1`);
  const lmName = sql(`select name from "User" where email='ravi@example.com'`);
  const b = await start();
  const clean = () => { sql(`delete from "ClientNote" where body like '${TAG}%'`); sql(`delete from "AuditLog" where action like '%a note on client ${CLIENT}'`); };
  try {
    clean();
    const admin = await login(b, 'admin@example.com');
    const lm = await login(b, 'ravi@example.com');
    const noteBy = (p, text) => p.locator('.cnotes li', { has: p.locator(`.cnote-body:has-text("${text}")`) });
    const add = async (p, text) => { await p.fill('#cn-body', text); await p.click('.cnote-form button:has-text("Add note")'); await p.waitForSelector(`.cnote-body:has-text("${text.split('\n')[0]}")`); };

    // 1. The admin adds a note with two lines.
    await admin.goto(`${BASE}/clients/${clientId}`); await admin.waitForLoadState('networkidle');
    ok(await admin.locator('h3:has-text("Notes")').count() === 1, 'admin sees the Notes section on the client page');
    await add(admin, `${TAG} first line\nsecond line`);
    const top = admin.locator('.cnotes li').first();
    ok((await top.locator('.cnote-body').textContent()).includes('second line'), 'the new note is at the top of the list');
    ok(await top.locator('.cnote-body').evaluate((el) => getComputedStyle(el).whiteSpace) === 'pre-wrap', 'the line break in a note is kept');
    ok(await admin.inputValue('#cn-body') === '', 'the form is cleared after the note is added');
    ok(sql(`select count(*) from "ClientNote" n join "User" u on u.id=n."authorId" where n."clientId"='${clientId}' and n.body like '${TAG}%' and u.email='admin@example.com'`) === '1', 'the note is saved against the admin');

    // 2. A note with only spaces is refused.
    await admin.fill('#cn-body', '   ');
    await admin.click('.cnote-form button:has-text("Add note")');
    await admin.waitForSelector('.cnote-form .err-text');
    ok((await admin.textContent('.cnote-form .err-text')).includes('Write something'), 'a note with only spaces is refused');
    await admin.fill('#cn-body', '');

    // 3. A location manager sees the admin's note, can't delete it, and can add and delete their own.
    await lm.goto(`${BASE}/clients/${clientId}`); await lm.waitForLoadState('networkidle');
    ok(await noteBy(lm, `${TAG} first line`).count() === 1, 'a location manager sees the admin\'s note');
    ok(await noteBy(lm, `${TAG} first line`).locator('button:has-text("Delete")').count() === 0, 'a location manager cannot delete the admin\'s note');
    await add(lm, `${TAG} from the location manager`);
    const own = noteBy(lm, `${TAG} from the location manager`);
    ok((await own.locator('.cnote-head b').textContent()) === lmName, 'the location manager\'s note is shown with their name');
    ok(await own.locator('button:has-text("Delete")').count() === 1, 'a location manager can delete their own note');
    lm.once('dialog', (d) => d.accept());
    await own.locator('button:has-text("Delete")').click();
    await lm.waitForSelector(`.cnote-body:has-text("from the location manager")`, { state: 'detached' });
    ok(sql(`select count(*) from "ClientNote" where body='${TAG} from the location manager'`) === '0', 'the location manager\'s note is deleted');

    // 4. A note by a location manager: an admin can delete it.
    await add(lm, `${TAG} to be deleted by admin`);
    await admin.reload(); await admin.waitForLoadState('networkidle');
    const lmNote = noteBy(admin, `${TAG} to be deleted by admin`);
    ok(await lmNote.locator('button:has-text("Delete")').count() === 1, 'an admin can delete a note someone else wrote');
    admin.once('dialog', (d) => d.accept());
    await lmNote.locator('button:has-text("Delete")').click();
    await admin.waitForSelector(`.cnote-body:has-text("to be deleted by admin")`, { state: 'detached' });
    ok(sql(`select count(*) from "ClientNote" where body='${TAG} to be deleted by admin'`) === '0', 'the admin\'s deletion is saved');
    ok(sql(`select count(*) from "AuditLog" where action='Deleted a note on client ${CLIENT}' and at > now() - interval '10 minutes'`) !== '0', 'deleting a note is in the audit log');
    ok(sql(`select count(*) from "AuditLog" where action='Added a note on client ${CLIENT}' and at > now() - interval '10 minutes'`) !== '0', 'adding a note is in the audit log');

    // 5. A team member is sent from the client page to the timesheet.
    const mem = await login(b, member);
    await mem.goto(`${BASE}/clients/${clientId}`); await mem.waitForLoadState('networkidle');
    ok(new URL(mem.url()).pathname === '/timesheet', `a team member (${member}) can't open the client page`);

    // 6. No page errors on the way.
    for (const [who, p] of [['admin', admin], ['location manager', lm]]) {
      ok(p.errs.length === 0, `no browser errors for the ${who}${p.errs.length ? `: ${p.errs.join(' | ').slice(0, 300)}` : ''}`);
    }
  } catch (e) {
    console.log('ERR', e.message.slice(0, 900)); fails++;
  } finally {
    try { clean(); } catch { /* the test database may be gone */ }
    await b.close();
  }
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})();
