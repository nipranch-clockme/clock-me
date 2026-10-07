const fs = require('fs');
const path = require('path');
const { start, login, BASE } = require('./helpers');
const { sql, session, desk: makeDesk, FX, FILES } = require('./import-util');

const S = session();
const ok = S.ok;

(async () => {
  const b = await start();
  try {
    S.setSettings(false, false, null);
    const p = await login(b, 'admin@example.com');
    const d = makeDesk(p, BASE);

    // 1. The templates come back exactly as uploaded, under the new names.
    for (const [kind, [orig, name]] of Object.entries(FILES)) {
      const r = await p.request.get(`${BASE}/import-export/template/${kind}`);
      ok(r.status() === 200, `${kind} template downloads`);
      ok(/attachment/.test(r.headers()['content-disposition'] || '') && (r.headers()['content-disposition'] || '').includes(name), `${kind} template is named ${name}`);
      ok(Buffer.compare(await r.body(), fs.readFileSync(path.join(FX, orig))) === 0, `${kind} template is byte-for-byte the uploaded file`);
    }
    await p.goto(`${BASE}/import-export?import=people`);
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('a:has-text("Download template")')]);
    ok(dl.suggestedFilename() === FILES.people[1], 'the Download button saves the new file name');

    // 2. People
    await d.load('people');
    let c = await d.check();
    console.log('people check', JSON.stringify(c));
    ok(c.ready === 22 && c.bad === 3, 'people: 22 ready, 3 managers without a Group skipped');
    ok(c.reasons.some((r) => /need a team/.test(r)), 'people: the reason says managers need a team');
    ok(c.adds.some((a) => /New teams/.test(a)), 'people: new teams are announced');
    let msg = await d.commit();
    console.log('people commit:', msg);
    ok(/22 people added/.test(msg), 'people: 22 added');
    ok(await p.locator('.ilinks tbody tr').count() === 22, 'people: 22 invite links shown');
    ok(sql(`select count(*) from "User" where email like '%@clockify-test.com' and "inviteToken" is not null and "passwordHash" is null`) === '22', 'people: all saved as invites');
    ok(sql(`select count(*) from "User" where email like '%@clockify-test.com' and role='ADMIN'`) !== '0', 'people: Admin role kept');
    const wk = sql(`select distinct "weeklyTarget" from "User" where email like '%@clockify-test.com' order by 1`);
    console.log('weekly targets:', wk.replace(/\n/g, ','));
    // run it again: everyone already exists
    await d.load('people'); c = await d.check();
    ok(c.ready === 0 && c.reasons.some((r) => /Already has an account/.test(r)), 'people: the same file again adds nobody');

    // 3. Clients and projects
    await d.load('projects'); c = await d.check();
    console.log('projects check', JSON.stringify(c));
    ok(c.ready === 9 && c.bad === 0, 'projects: 9 ready');
    msg = await d.commit(); console.log('projects commit:', msg);
    ok(/9 projects added/.test(msg), 'projects: 9 added');
    ok(sql(`select count(*) from "Project" p join "Client" c on c.id=p."clientId" where c.name='Internal'`) !== '0', 'projects: a blank client lands under Internal');
    await d.load('projects'); c = await d.check();
    ok(c.ready === 0 && c.reasons.some((r) => /Already exists/.test(r)), 'projects: the same file again adds nothing');

    // 4. Timesheet
    await d.load('time'); c = await d.check();
    console.log('time check (no create)', JSON.stringify(c));
    await d.load('time', { create: true }); c = await d.check();
    console.log('time check (create)', JSON.stringify(c));
    const ready = c.ready;
    ok(ready > 0, 'time: rows are ready once people and projects exist');
    msg = await d.commit(); console.log('time commit:', msg);
    ok(new RegExp(`${ready} time entr`).test(msg), 'time: the ready rows were saved');
    const minutes = sql(`select coalesce(sum(minutes),0) from "TimeEntry" e join "User" u on u.id=e."userId" where u.email like '%@clockify-test.com'`);
    console.log('saved minutes', minutes);
    await d.load('time'); c = await d.check();
    ok(c.ready === 0 && c.reasons.some((r) => /Already imported/.test(r)), 'time: the same file again is recognised as already imported');

    ok(p.errs.length === 0, 'no page errors: ' + p.errs.join(' / '));
    await p.context().close();
  } catch (e) {
    console.log('ERR', e.message.slice(0, 800)); S.bump();
  } finally {
    S.cleanup();
    ok(S.added('User').length === 0 && S.added('Project').length === 0, 'clean-up removed everything this run added');
    await b.close();
  }
  console.log(S.fails() ? `${S.fails()} FAILED` : 'ALL PASSED');
  process.exit(S.fails() ? 1 : 0);
})().catch((e) => { console.log('ERR', e.message.slice(0, 800)); process.exit(1); });
