// Our own export files go back in cleanly, and the older Date / Hours style timesheet file still imports.
// Run: BASE=http://localhost:3100 NODE_PATH=$(npm root -g) PSQL="psql -h /var/run/postgresql clockme" node e2e/import.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { start, login, BASE } = require('./helpers');
const { sql, session, desk: makeDesk } = require('./import-util');

const S = session();
const ok = S.ok;
const check = (row) => row[row.length - 1];
const run = 'legacy' + process.pid;

(async () => {
  const b = await start();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'imp-'));
  try {
    S.setSettings(false, false, null);
    const p = await login(b, 'admin@example.com');
    const d = makeDesk(p, BASE);

    // Our exports come back in: every row is simply "already there", never an unknown role or a parse problem.
    for (const [kind, expect] of [['people', /Already has an account/], ['projects', /Already exists/]]) {
      const r = await p.request.get(`${BASE}/import-export/export/${kind}`);
      ok(r.status() === 200, `${kind} export downloads`);
      ok(new RegExp(`filename="the-time-sink-${kind}-\\d{4}-\\d{2}-\\d{2}\\.csv"`).test(r.headers()['content-disposition'] || ''), `${kind} export is named the-time-sink-${kind}-<date>.csv`);
      const file = path.join(tmp, `${kind}.csv`);
      fs.writeFileSync(file, await r.body());
      await d.load(kind, { file });
      const c = await d.check();
      ok(c.ready === 0 && c.reasons.length === 1 && expect.test(c.reasons[0]), `${kind}: our own export goes back in with every row recognised: ${c.reasons.join(' / ')}`);
    }
    ok((await p.request.get(`${BASE}/import-export/export/nothing`)).status() === 404, 'an unknown export is not found');

    // The older timesheet format: Date, Email, Project, Phase, Tag, Description, Hours, Start.
    const csv = ['Date,Email,Project,Phase,Tag,Description,Hours,Start',
      `2026-10-05,admin@example.com,Website rebuild,Submission 1,CAD,API work ${run},2.5,10:30`,
      `2026-10-05,admin@example.com,Website rebuild,Submission 1,CAD,x ${run},1,`,
      '2026-10-06,admin@example.com,Website rebuild,Nope,CAD,x,1,',
      'bad,admin@example.com,Website rebuild,Submission 1,CAD,x,1,',
      `2026-10-06,admin@example.com,Website rebuild,Submission 2,Revit,"Call, with ""quotes""\nand a second line ${run}",1:15,`,
      `2026-10-06,admin@example.com,Website rebuild,Submission 1,CAD,'- note ${run},1,9:5`,
      `2026-10-06,admin@example.com,Website rebuild,Submission 1,CAD,'- note ${run},1,`,
      `2026-10-06,admin@example.com,Website rebuild,Submission 1,CAD,5" screen ${run},1,`].join('\n');
    await d.paste('time', csv);
    let c = await d.check();
    ok(c.rows.length === 8, 'time: eight rows listed (a quoted line break stays in one row)');
    ok(/Ready/.test(check(c.rows[0])), 'time: a normal row is ready');
    ok(/Task \(phase\) must be one of/.test(check(c.rows[2])), 'time: an unknown phase is refused');
    ok(/Date must look like/.test(check(c.rows[3])), 'time: a bad date is refused');
    ok(/Ready/.test(check(c.rows[4])), 'time: commas, quotes and a line break inside a description are fine');
    ok(/Start must be/.test(check(c.rows[5])), 'time: a start of 9:5 is refused');
    ok(/Ready/.test(check(c.rows[6])), 'time: a guarded description is fine');
    ok(/Ready/.test(check(c.rows[7])), 'time: a stray quote inside a description is fine');
    const msg = await d.commit();
    ok(/5 time entries added/.test(msg), 'time: five saved: ' + msg);
    ok(sql(`select count(*) from "TimeEntry" where description like '%${run}%'`) === '5', 'time: five entries in the database');
    ok(sql(`select count(*) from "TimeEntry" where description like E'%"quotes"%\\n%${run}'`) === '1', 'time: the line break and quotes were kept');
    await d.paste('time', csv); c = await d.check();
    ok(c.rows.filter((r) => /Already imported/.test(check(r))).length === 5, 'time: the same file again is recognised as already imported');
    ok(p.errs.length === 0, 'no page errors: ' + p.errs.join(' / '));
    await p.context().close();
  } catch (e) {
    console.log('ERR', e.message.slice(0, 900)); S.bump();
  } finally {
    try { sql(`delete from "TimeEntry" where description like '%${run}%'`); } catch {}
    S.cleanup();
    fs.rmSync(tmp, { recursive: true, force: true });
    await b.close();
  }
  console.log(S.fails() ? `${S.fails()} FAILED` : 'ALL PASSED');
  process.exit(S.fails() ? 1 : 0);
})();
