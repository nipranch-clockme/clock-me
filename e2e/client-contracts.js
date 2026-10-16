// Import & export > Client contracts: sets each client's team, status, work types and twelve months of contracted hours from a CSV.
// Run against a copy of the sample database (it changes clients, then puts them back):
//   BASE=http://localhost:3300 PSQL="psql postgresql://tsk:tsk@localhost/tsk" node e2e/client-contracts.js
// FILE=/path/to/contracts.csv also checks a real file (nothing from it is saved).
const fs = require('fs');
const { start, login, BASE } = require('./helpers');
const { sql, session, desk: makeDesk } = require('./import-util');

const S = session();
const ok = S.ok;
const M = 'January,February,March,April,May,June,July,August,September,October,November,December';
const C1 = 'Contracts Test One', C2 = 'Contracts Test Two', C3 = 'Contracts Test Three';
const office = sql(`select name from "Location" order by name limit 1`);
const team = sql(`select t.name from "Team" t join "Location" l on l.id=t."locationId" where l.name='${office}' order by t.name limit 1`);
const tag = sql(`select name from "Tag" order by name limit 1`), tag2 = sql(`select name from "Tag" order by name offset 1 limit 1`);

(async () => {
  const b = await start();
  const cid = (n) => sql(`select id from "Client" where name='${n}'`);
  const months = (n) => sql(`select to_char(month,'MM')||'='||hours from "ClientMonth" where "clientId"='${cid(n)}' and month >= '2026-01-01' and month < '2027-01-01' order by month`).split('\n').filter(Boolean);
  try {
    // Two clients that already exist, one with a team and a status the file changes.
    sql(`insert into "Client"(id, name, status) values ('ct1','${C1}','LOST'), ('ct2','${C2}','LOST')`);
    sql(`update "Client" set "teamId"=(select id from "Team" limit 1) where id='ct2'`);
    const p = await login(b, 'admin@example.com');
    const d = makeDesk(p, BASE);

    await d.open('contracts');
    ok(await p.locator('.ikind:has-text("Client contracts")').count() === 1, 'admins see Client contracts on the Import page');
    const tpl = await p.request.get(`${BASE}/import-export/template/contracts`);
    ok(tpl.status() === 200 && (await tpl.text()).includes('Client,Team,Office,Status,Year,January'), 'the template downloads');

    const text = [
      `Client,Team,Office,Status,Year,${M},Work types,Year Total`,
      `${C1},${team},${office},Contracted,2026,0,0,0,0,173,346,346,346,346,346,346,346,${tag} + ${tag2},2249`,
      `${C2},Unassigned,,Ended,2026,65,65,65,,,,,,,,,,,195`,
      `${C3},Wolverine Test,${office},Non-contracted,2026,1,2,3.5,0,0,0,0,0,0,0,0,0,${tag},`,
      `${C1},${team},${office},Contracted,2026,1,1,1,1,1,1,1,1,1,1,1,1,,`,
      `Contracts Bad Tag,${team},${office},Contracted,2026,1,1,1,1,1,1,1,1,1,1,1,1,NOPE,`,
      `Contracts Bad Hours,${team},${office},Contracted,2026,1,x,1,1,1,1,1,1,1,1,1,1,,`,
      `Contracts Bad Status,${team},${office},Maybe,2026,1,1,1,1,1,1,1,1,1,1,1,1,,`,
    ].join('\n');
    await d.paste('contracts', text);
    const c = await d.check();
    ok(c.ready === 3 && c.bad === 4, `3 rows ready, 4 skipped (got ${c.ready}/${c.bad})`);
    ok(c.reasons.some((r) => /Same client as row 2/.test(r)), 'a client listed twice is skipped');
    ok(c.reasons.some((r) => /Unknown work type NOPE/.test(r)), 'an unknown work type is skipped, not created');
    ok(c.reasons.some((r) => /number of hours/.test(r)), 'a month that is not a number is skipped');
    ok(c.reasons.some((r) => /Status must be/.test(r)), 'an unknown status is skipped');
    ok(c.adds.some((a) => a.includes(C3)) && c.adds.some((a) => a.includes(`Wolverine Test (${office})`)), 'the new client and the new team are announced');
    ok(c.colnotes.some((n) => /Year Total/.test(n)), 'the Year Total column is mentioned as not used');
    ok(sql(`select count(*) from "ClientMonth" where "clientId"='ct1'`) === '0', 'checking saves nothing');

    const msg = await d.commit();
    ok(/Contracts saved for 3 clients/.test(msg), `import says 3 clients saved (${msg})`);
    ok(sql(`select l.name||'/'||t.name||'/'||c.status from "Client" c join "Team" t on t.id=c."teamId" join "Location" l on l.id=t."locationId" where c.id='ct1'`) === `${office}/${team}/CONTRACTED`, 'team and status are set');
    ok(sql(`select array_length("workTypeIds",1) from "Client" where id='ct1'`) === '2', 'both work types are set');
    const m1 = months(C1);
    ok(m1.join(' ') === '05=173 06=346 07=346 08=346 09=346 10=346 11=346 12=346', `the months are stored; a month of 0 needs no row of its own, as in the table (${m1.join(' ')})`);
    ok(sql(`select coalesce("teamId",'none')||'/'||status from "Client" where id='ct2'`) === 'none/LOST', 'Unassigned takes the team away; Ended is Lost');
    ok(months(C2).join(' ') === '01=65 02=65 03=65', 'blank months are 0');
    ok(sql(`select c.status||'/'||t.name from "Client" c join "Team" t on t.id=c."teamId" where c.name='${C3}'`) === 'PROJECT_BASED/Wolverine Test', 'the new client is created on the new team, Non-contracted is Project based');
    ok(months(C3)[2] === '03=3.5', 'decimals are kept');
    ok(sql(`select count(*) from "AuditLog" where action like 'Set contract for client ${C1}, 2026 from CSV%'`) === '1', 'the change log has a line per client');

    // The same file again changes nothing more, and blank Team / Status / Work types leave things as they are.
    await d.paste('contracts', `Client,Status,Year,${M},Work types\n${C1},,2026,5,5,5,5,5,5,5,5,5,5,5,5,`);
    const c2 = await d.check();
    ok(c2.ready === 1, 'a file without Team or Office columns is fine');
    await d.commit();
    ok(sql(`select c.status||'/'||array_length("workTypeIds",1)||'/'||(c."teamId" is not null) from "Client" c where id='ct1'`) === 'CONTRACTED/2/true', 'blank status, work types and no Team column leave them as they were');
    ok(months(C1).every((m) => m.endsWith('=5')), 'hours are replaced');

    // A file without month columns is refused as a whole.
    await d.paste('contracts', `Client,Year,January\n${C1},2026,5`);
    const c3 = await d.check();
    ok(/every month/.test(c3.error || ''), 'missing month columns are named');

    if (process.env.FILE) {
      await d.paste('contracts', fs.readFileSync(process.env.FILE, 'utf8'));
      const r = await d.check();
      console.log('real file:', JSON.stringify({ ready: r.ready, notes: r.notes, bad: r.bad, reasons: r.reasons, adds: r.adds, colnotes: r.colnotes }));
      ok(!r.bad, 'the real file has no skipped rows');
    }
    ok(!p.errs.length, `no browser errors ${p.errs.join(' | ')}`);
  } catch (e) { console.log('FAIL', e.message); S.bump(); }
  finally {
    sql(`delete from "AuditLog" where action like 'Set contract for client Contracts Test%' or action like 'Imported contracts for%'`);
    sql(`delete from "Client" where id in ('ct1','ct2') or name like 'Contracts Test%'`);
    S.cleanup();
    await b.close();
  }
  console.log(S.fails() ? `${S.fails()} FAILED` : 'ALL PASSED');
  process.exit(S.fails() ? 1 : 0);
})();
