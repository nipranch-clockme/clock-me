// What the Import review found, kept fixed: the paste box, invite links that stay, example rows, unreadable files, odd values, the preview beyond 1,000 rows,
// the change log, what a manager can find out, and the layout at tablet and phone width.
// Run: BASE=http://localhost:3100 NODE_PATH=$(npm root -g) PSQL="psql -h /var/run/postgresql clockme" node e2e/import-review.js
const { start, login, BASE } = require('./helpers');
const { sql, session, desk: makeDesk, FX } = require('./import-util');
const path = require('path');

const S = session();
const ok = S.ok;
const check = (row) => row[row.length - 1];
const byName = (rows, name) => rows.find((r) => r[1] === name || r[2] === name) || [];
const run = 'rv' + process.pid;
const hiddenId = 'hidden' + process.pid;

(async () => {
  const b = await start();
  try {
    S.setSettings(false, false, null);
    const [pub] = sql(`select p.name || '|' || c.name || '|' || ph.name from "Project" p join "Client" c on c.id=p."clientId" join "Phase" ph on ph."projectId"=p.id where p.access='PUBLIC' and not p.archived and ph.sort<999 order by p.name limit 1`).split('\n');
    const [pubProject, pubClient, pubPhase] = pub.split('|');
    sql(`insert into "Project"(id,name,"clientId",access) values ('${hiddenId}','Review Hidden ${run}',(select id from "Client" where name<>'Internal' limit 1),'RESTRICTED')`);
    sql(`insert into "Phase"(id,"projectId",name,sort) values ('${hiddenId}-ph','${hiddenId}','Work',0)`);
    const teamMate = sql(`select email from "User" where role='MEMBER' and "teamId"=(select "teamId" from "User" where email='aisha@example.com') limit 1`);
    ok(!!teamMate, 'setup: aisha has a team member to import time for');

    const p = await login(b, 'admin@example.com');
    const d = makeDesk(p, BASE);

    // ---------- The paste box stays put while you type ----------
    await d.open('people');
    await p.click('summary:has-text("Paste CSV text instead")');
    const box = p.locator('#imp-text-people');
    await box.pressSequentially('Name,Email\nTyped One,typed.one@review-test.com', { delay: 15 });
    ok((await box.count()) === 1 && (await box.inputValue()) === 'Name,Email\nTyped One,typed.one@review-test.com', 'paste: the box is still there, with everything typed, after typing');
    ok((await p.locator('.ichip').count()) === 0, 'paste: no file chip replaces the box');
    await p.click('button:has-text("Check file")');
    await p.waitForSelector('.itiles');
    ok((await p.locator('.ipreview tbody tr').count()) === 1, 'paste: the typed text can be checked');
    await box.pressSequentially('\nTyped Two,typed.two@review-test.com');
    await p.click('button:has-text("Check file"), button:has-text("Check again")');
    await p.waitForFunction(() => document.querySelectorAll('.ipreview tbody tr').length === 2);
    ok(true, 'paste: more can be typed and checked again');

    // ---------- Values that used to slip through ----------
    await d.paste('people', [
      'Name,Email,Working Days,Daily Work Capacity',
      'W One,w1@review-test.com,Mon-Fri,8',
      'W Two,w2@review-test.com,"Mon, Tue, Foo",8',
      'W Three,w3@review-test.com,"Mon, Tue, Wed, Thu, Fri",',
      'W Four,w4@review-test.com,,lots',
      'W Five,w5@review-test.com,Monday to Thursday,7:30',
    ].join('\n'));
    let c = await d.check();
    ok(check(byName(c.rows, 'W One')) === 'Ready' && byName(c.rows, 'W One')[6] === '40', 'people: Mon-Fri with 8 hours is 40 a week, not 8');
    ok(/Working Days should name days/.test(check(byName(c.rows, 'W Two'))), 'people: a day that is not a day refuses the row: ' + check(byName(c.rows, 'W Two')));
    ok(/^Ready/.test(check(byName(c.rows, 'W Three'))) && /usual 40/.test(check(byName(c.rows, 'W Three'))) && byName(c.rows, 'W Three')[6] === '40', 'people: days without daily hours keep the usual 40, with a heads-up');
    ok(/Daily Work Capacity should be hours/.test(check(byName(c.rows, 'W Four'))), 'people: hours that are not hours say so');
    ok(byName(c.rows, 'W Five')[6] === '30', 'people: Monday to Thursday at 7:30 is 30 a week');

    await d.paste('people', ['Name,Email,Role,Joining date,Location', 'Old Hand,old.hand@review-test.com,Owner,1985-06-01,Remote', 'Too Early,too.early@review-test.com,,1899-01-01,', 'Far Future,far.future@review-test.com,,2999-01-01,'].join('\n'));
    c = await d.check();
    ok(/^Ready/.test(check(byName(c.rows, 'Old Hand'))), 'people: a 1985 joining date is fine, a Location column that is not an office is ignored: ' + check(byName(c.rows, 'Old Hand')));
    ok(byName(c.rows, 'Old Hand')[3] === 'Admin', 'people: Owner (Clockify\'s workspace owner) becomes Admin');
    ok(/joining date/i.test(check(byName(c.rows, 'Too Early'))), 'people: a date before the 1900s is refused as a joining date');
    ok(/future/.test(check(byName(c.rows, 'Far Future'))), 'people: a date far in the future says it is in the future');

    await d.paste('people', 'Name,Email,Title\nUi One,ui1@review-test.com,"oops\nUi Two,ui2@review-test.com,x');
    c = await d.check();
    ok(/never closed/.test(c.error || ''), 'file: a quote that is never closed is refused, with its line: ' + c.error);
    await d.paste('people', 'Name,Email\nE X,e.x@review-test.com,extra');
    c = await d.check();
    ok(/more values than the header/.test(check(c.rows[0])), 'file: a row with more values than the header is refused');
    await d.paste('people', 'Name;Email\nA;a@review-test.com');
    c = await d.check();
    ok(/semicolons/.test(c.error || ''), 'file: semicolons are explained');
    await d.paste('people', 'PK\u0003\u0004binary');
    c = await d.check();
    ok(/Excel/.test(c.error || ''), 'file: an Excel file is explained');

    // ---------- Files the page refuses without crashing ----------
    await d.open('people');
    await p.setInputFiles('#imp-file-people', { name: 'big.csv', mimeType: 'text/csv', buffer: Buffer.alloc(3_700_000, 'a') });
    await p.waitForSelector('.err-text');
    ok(/3\.5 MB/.test(await p.locator('.err-text').innerText()) && (await p.locator('.ichip').count()) === 0, 'file: one over 3.5 MB is refused with a message');
    await p.setInputFiles('#imp-file-people', { name: 'empty.csv', mimeType: 'text/csv', buffer: Buffer.from('  \n') });
    await p.waitForFunction(() => /empty/.test(document.querySelector('.err-text')?.textContent || ''));
    ok(true, 'file: an empty file says it is empty');
    await d.open('people');
    await p.click('summary:has-text("Paste CSV text instead")');
    await p.fill('#imp-text-people', 'Name,Email\n' + 'a'.repeat(3_700_000));
    await p.click('button:has-text("Check file")');
    await p.waitForSelector('.err-text');
    ok(/3\.5 MB/.test(await p.locator('.err-text').innerText()), 'paste: text over 3.5 MB is refused with a message');
    // A request that fails on the way never turns the page into an error screen.
    await d.paste('people', 'Name,Email\nNet One,net.one@review-test.com');
    await p.route('**/import-export**', (r) => (r.request().method() === 'POST' ? r.abort() : r.continue()));
    await p.click('button:has-text("Check file")');
    await p.waitForSelector('.alert.bad');
    ok(/nothing was saved/i.test(await p.locator('.alert.bad').innerText()) && (await p.locator('button:has-text("Check file"), button:has-text("Check again")').count()) === 1, 'file: a failed request shows a message and the page stays usable');
    await p.unroute('**/import-export**');

    // ---------- The template's example rows ask for confirmation ----------
    await d.load('people');
    c = await d.check();
    ok((await p.locator('.alert.warn').count()) === 1 && /example/.test(await p.locator('.alert.warn').innerText()), 'sample: the template\'s own rows are flagged');
    ok(await p.locator('button.primary:has-text("Import")').isDisabled(), 'sample: Import stays off until the box is ticked');
    await p.check('.alert.warn .icheck input');
    ok(await p.locator('button.primary:has-text("Import")').isEnabled(), 'sample: ticking the box turns Import on');
    for (const kind of ['projects', 'time']) {
      await d.load(kind); await d.check();
      ok((await p.locator('.alert.warn').count()) === 1, `sample: the ${kind} template's rows are flagged too`);
    }
    await d.paste('people', 'Name,Email\nReal One,real.one@review-test.com');
    await d.check();
    ok((await p.locator('.alert.warn').count()) === 0, 'sample: a file of your own rows is not flagged');

    // ---------- Filter boxes ----------
    await d.paste('people', 'Name,Email\nGood One,good.one@review-test.com\nGood Two,good.two@review-test.com\nNo Mail,');
    c = await d.check();
    ok(c.rows.length === 3 && (await p.locator('.itile[aria-pressed="true"]').count()) === 0, 'tiles: all rows show to start with, no box pressed');
    await p.click('.itile.ok');
    ok((await p.locator('.ipreview tbody tr').count()) === 2 && (await p.locator('.itile.ok').getAttribute('aria-pressed')) === 'true', 'tiles: the ready box shows only ready rows');
    await p.click('.itile.ok');
    ok((await p.locator('.ipreview tbody tr').count()) === 3, 'tiles: pressing it again shows every row');
    await p.click('.itile.bad');
    ok((await p.locator('.ipreview tbody tr').count()) === 1, 'tiles: the skipped box shows only skipped rows');

    // ---------- The preview beyond 1,000 rows ----------
    const bulk = ['Name,Email', ...Array.from({ length: 1100 }, (_, i) => (i === 1049 ? `Gap ${i},` : `Bulk ${i},bulk${i}@review-test.com`))].join('\n');
    await d.paste('people', bulk);
    c = await d.check();
    ok(c.bad === 1 && (await p.locator('.itile.ok b').innerText()) === '1,099', 'bulk: 1,100 rows checked, one skipped');
    await p.click('.itile.bad');
    const lateRows = await p.locator('.ipreview tbody tr').evaluateAll((trs) => trs.map((tr) => tr.textContent));
    ok(lateRows.length === 1 && /No email/.test(lateRows[0]), 'bulk: a skipped row past row 1,000 can still be seen');
    ok(/first 1,000/.test(await p.locator('main').innerText()), 'bulk: the page says only the first 1,000 plus the problems are listed');

    // ---------- Importing people: the links stay, the change log names each person ----------
    await d.paste('people', [
      'Name,Email,Role,Group,Projects Managed',
      `Dup Proj,dup.proj@review-test.com,Project Manager,Review Team,"${pubProject}, ${pubProject}:${pubClient}"`,
    ].join('\n'));
    c = await d.check();
    ok(c.ready === 1, 'people: a project listed twice (two spellings) is ready');
    const done = await d.commit();
    ok(/1 person added/.test(done), 'people: and it imports (it used to fail with a wrong message): ' + done);
    const newId = sql(`select id from "User" where email='dup.proj@review-test.com'`);
    ok(sql(`select count(*) from "ProjectManager" where "userId"='${newId}'`) === '1', 'people: the project is linked once');
    ok(sql(`select count(*) from "AuditLog" where "targetUserId"='${newId}' and action like 'Imported Dup Proj%as Team/Project Manager from CSV'`) === '1', 'people: the change log has a line for the new person');
    ok((await p.locator('li.istep').count()) === 1 && (await p.locator('.ilinks').count()) === 1, 'people: after the import only the result is left, with the invite links');
    ok(/shown only once/.test(await p.locator('.ilinks').innerText()), 'people: the page says the links are shown only once');
    ok((await p.locator('.ilinks input[readonly]').inputValue()).includes('/invite/'), 'people: each link is in a box that can be selected by hand');
    p.once('dialog', (dlg) => dlg.dismiss());
    await p.click('button:has-text("Import another file")');
    ok((await p.locator('.ilinks').count()) === 1, 'people: "Import another file" asks first, and No keeps the links');
    p.once('dialog', (dlg) => dlg.accept());
    await p.click('button:has-text("Import another file")');
    await p.waitForSelector('.idrop');
    ok((await p.locator('.ilinks').count()) === 0, 'people: Yes starts a fresh import');

    // ---------- Importing time: odd characters, per-person change log, the Tag column, who can see which project ----------
    const timeFile = (rows) => ['Project,Client,Description,Task,Email,Tags,Start Date,Start Time,Duration (h)', ...rows].join('\n');
    await d.paste('time', timeFile([
      `${pubProject},${pubClient},nul\u0000byte ${run},${pubPhase},admin@example.com,,2026-12-07,9:00 AM,1:00`,
      `${pubProject},${pubClient},plain ${run},${pubPhase},admin@example.com,,2026-12-08,9:00 AM,2:00`,
    ]));
    c = await d.check();
    ok(c.ready === 2, 'time: a row with a NUL character in the description is ready (it used to fail the whole import): ' + JSON.stringify(c.rows.map(check)));
    const heads = await p.locator('.ipreview thead th').allInnerTexts();
    ok(heads.includes('Tags'), 'time: the preview shows the Tags column: ' + heads.join(','));
    const msg = await d.commit();
    ok(/2 time entries added/.test(msg), 'time: both are saved: ' + msg);
    ok(sql(`select count(*) from "TimeEntry" where description = 'nulbyte ${run}'`) === '1', 'time: the NUL is dropped from the description');
    const adminId = sql(`select id from "User" where email='admin@example.com'`);
    ok(sql(`select count(*) from "AuditLog" where "targetUserId"='${adminId}' and action like 'Imported 2 time entries (3 h, 2026-12-07 to 2026-12-08) from CSV' and at > now() - interval '10 minutes'`) === '1', 'time: the change log has a line for the person whose time was added');
    sql(`delete from "AuditLog" where action like 'Imported 2 time entries (3 h%'`);

    const hiddenRow = (email) => timeFile([`Review Hidden ${run},,x ${run},Work,${email},,2026-12-09,9:00 AM,1:00`]);
    await d.paste('time', hiddenRow(teamMate));
    c = await d.check();
    ok(/doesn't have access/.test(check(c.rows[0])), 'time: an admin sees a restricted project and that the person lacks access: ' + check(c.rows[0]));
    await p.context().close();

    const a = await login(b, 'aisha@example.com');
    const ad = makeDesk(a, BASE);
    await ad.paste('time', hiddenRow(teamMate));
    c = await ad.check();
    ok(/^Unknown project/.test(check(c.rows[0])), 'time: a manager who cannot see a project is told it is unknown, not that it exists: ' + check(c.rows[0]));
    await a.context().close();

    // ---------- Admin: the office to start with is their own ----------
    const q = await login(b, 'admin@example.com');
    const qd = makeDesk(q, BASE);
    await qd.open('people');
    if (await q.locator('#imp-office').count()) {
      const own = sql(`select "locationId" from "User" where email='admin@example.com'`);
      ok((await q.inputValue('#imp-office')) === own, 'people: the office starts as the admin\'s own');
    }

    // ---------- Layout: tablet and phone ----------
    for (const [label, w, h] of [['tablet', 1024, 900], ['small tablet', 820, 1000], ['phone', 390, 844]]) {
      await q.setViewportSize({ width: w, height: h });
      await qd.load('people', { file: path.join(FX, 'users.csv') });
      await qd.check();
      const m = await q.evaluate(() => {
        const box = document.querySelector('.ipreview');
        const r = box.getBoundingClientRect();
        const verdicts = [...box.querySelectorAll('td.ichk')].map((e) => e.getBoundingClientRect());
        return {
          scroll: box.scrollWidth - box.clientWidth, page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          verdictOutside: verdicts.filter((v) => v.right > r.right + 1).length, rows: verdicts.length,
        };
      });
      ok(m.scroll <= 1 && m.page <= 1 && m.verdictOutside === 0 && m.rows > 0, `layout (${label}): the check column is inside the box, nothing scrolls sideways: ${JSON.stringify(m)}`);
    }
    ok(q.errs.length === 0, 'no page errors: ' + q.errs.join(' / '));
    await q.context().close();
  } catch (e) {
    console.log('ERR', e.message.slice(0, 900)); S.bump();
  } finally {
    try { sql(`delete from "TimeEntry" where description like '%${run}%'`); } catch {}
    try { sql(`delete from "Project" where id='${hiddenId}'`); } catch {}
    S.cleanup();
    await b.close();
  }
  console.log(S.fails() ? `${S.fails()} FAILED` : 'ALL PASSED');
  process.exit(S.fails() ? 1 : 0);
})();
