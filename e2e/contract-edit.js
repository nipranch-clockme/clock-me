// Clients > Monthly contracts: an admin's Edit dialog changes one client's hours for a month, its status, standard and work types in one save,
// and the table shows the new figure. A location manager sees no Edit buttons. The client is put back as it was at the end.
//   BASE=http://localhost:3500 PSQL="psql -h /var/run/postgresql tags_t" node e2e/contract-edit.js
const { execFileSync } = require('child_process');
const { start, login, BASE } = require('./helpers');
const PSQL = process.env.PSQL || 'psql -h /var/run/postgresql clockme';
const [bin, ...args] = PSQL.split(' ');
const sql = (q) => execFileSync(bin, [...args, '-At', '-c', q]).toString().trim();
let fails = 0;
const ok = (c, m, d = '') => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}${d ? ' — ' + d : ''}`); if (!c) fails++; };
const go = async (p, u) => { await p.goto(BASE + u); await p.waitForLoadState('networkidle'); };

(async () => {
  const b = await start();
  const year = sql(`select to_char(now() at time zone 'UTC','YYYY')`);
  const dec = `${year}-12-01`;
  const [id, name, status, drawing] = sql(`select id||'|'||name||'|'||status::text||'|'||coalesce("drawingStandard"::text,'') from "Client" where name <> 'Internal' order by name limit 1`).split('|');
  const workTypes = sql(`select coalesce(array_to_string("workTypeIds", ','),'') from "Client" where id='${id}'`);
  const tag = sql(`select id from "Tag" order by name limit 1`);
  const decBefore = sql(`select coalesce((select hours::text from "ClientMonth" where "clientId"='${id}' and month='${dec}'),'')`);
  const newStatus = status === 'CONTRACTED' ? 'PROJECT_BASED' : 'CONTRACTED';
  const newDrawing = drawing === 'AVDL' ? 'PROPRIETARY' : 'AVDL';
  try {
    const p = await login(b, 'admin@example.com');
    await p.setViewportSize({ width: 1400, height: 1000 });
    await go(p, '/clients');
    await p.waitForSelector('table.mgrid');
    const edit = p.locator(`button[aria-label="Edit ${name}"]`);
    ok('an admin sees an Edit button for each client', await edit.count() === 1 && await p.locator('button[aria-label^="Edit "]').count() >= 2);

    await edit.click();
    const dlg = p.locator('dialog[open]');
    await dlg.waitFor({ timeout: 10000 });
    ok('Edit opens the client\'s dialog', (await dlg.locator('h2').textContent()).trim() === `Edit ${name}`);
    const months = dlg.locator('.ce-months > .ce-month');
    ok('the dialog has a box for each of the 12 months', await months.count() === 12);
    const pastBoxes = await dlg.locator('.ce-month.past').count();
    ok('past months are locked in the dialog until Change past months is confirmed', pastBoxes === await dlg.locator('.ce-month.past input:disabled').count(), `${pastBoxes} past`);

    // December is never past in the current year, so its box is editable
    await months.nth(11).locator('input').fill('321');
    await dlg.locator('select[id$="-st"]').selectOption(newStatus);
    await dlg.locator('select[id$="-dr"]').selectOption(newDrawing);
    await dlg.locator('.ce-tags input[type=checkbox]').first().click();
    const save = dlg.locator('button:has-text("Save changes")');
    ok('Save changes is enabled once something changed', await save.isEnabled());
    await save.click();
    await p.waitForFunction(() => !document.querySelector('dialog[open]'), null, { timeout: 20000 }).catch(() => {});
    ok('a successful save closes the dialog', await p.locator('dialog[open]').count() === 0);

    const hours = sql(`select hours from "ClientMonth" where "clientId"='${id}' and month='${dec}'`);
    ok('December hours are saved from the dialog', hours === '321', hours);
    const after = sql(`select status::text||'|'||coalesce("drawingStandard"::text,'')||'|'||coalesce(array_to_string("workTypeIds", ','),'') from "Client" where id='${id}'`);
    const [st, dr, wt] = after.split('|');
    ok('status and standard are saved from the dialog', st === newStatus && dr === newDrawing, `${st} / ${dr}`);
    const hadTag = workTypes.split(',').includes(tag);
    ok('the work type ticked in the dialog is toggled and saved', wt.split(',').includes(tag) !== hadTag, `${hadTag ? 'removed' : 'added'}`);

    await p.waitForFunction((cell) => document.querySelector(`input[data-cell="${cell}"]`)?.value === '321', `m|${id}|${dec.slice(0, 7)}`, { timeout: 15000 }).catch(() => {});
    const shown = await p.locator(`input[data-cell="m|${id}|${dec.slice(0, 7)}"]`).inputValue();
    ok('the table shows the new December figure after the save', shown === '321', shown);
    const tagName = sql(`select name from "Tag" where id='${tag}'`);
    const wtCell = (await p.locator(`tr:has(td.cl:has-text("${name}")) td.wt`).first().textContent()).trim();
    ok('the table shows the work type as saved', wtCell.includes(tagName) === sql(`select '${tag}' = any("workTypeIds") from "Client" where id='${id}'`) .startsWith('t'), `"${wtCell}"`);

    // A location manager reads the table but cannot open an Edit dialog
    const rav = await login(b, 'ravi@example.com');
    await go(rav, '/clients');
    await rav.waitForSelector('table.mgrid').catch(() => {});
    ok('a location manager sees no Edit buttons', await rav.locator('button[aria-label^="Edit "]').count() === 0);

    ok('no browser errors', p.errs.length === 0 && rav.errs.length === 0, JSON.stringify([...p.errs, ...rav.errs].slice(0, 3)));
  } finally {
    // put the client back as it was
    if (decBefore === '') sql(`delete from "ClientMonth" where "clientId"='${id}' and month='${dec}'`);
    else sql(`update "ClientMonth" set hours=${Number(decBefore)} where "clientId"='${id}' and month='${dec}'`);
    sql(`update "Client" set status='${status}', "drawingStandard"=${drawing ? `'${drawing}'` : 'NULL'}, "workTypeIds"=ARRAY[${workTypes ? workTypes.split(',').map((x) => `'${x}'`).join(',') : ''}]::text[] where id='${id}'`);
    await b.close();
  }
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
