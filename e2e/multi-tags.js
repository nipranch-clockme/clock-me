// Several tags on one entry: picking them in the entry dialog and the timer, showing them, filtering and grouping reports,
// the CSV export, the client's shared link, the timesheet import, and removing a tag.
// Sets up its own people and time in the local database (PSQL defaults to the sample database on this machine) and removes it again.
//   BASE=http://localhost:3500 PSQL="psql -h /var/run/postgresql tags_t" node e2e/multi-tags.js
const { execFileSync } = require('child_process');
const { start, login, BASE } = require('./helpers');
const { desk } = require('./import-util');
const PSQL = process.env.PSQL || 'psql -h /var/run/postgresql clockme';
const [bin, ...args] = PSQL.split(' ');
const sql = (q) => execFileSync(bin, [...args, '-At', '-c', q]).toString().trim();
let fails = 0;
const ok = (c, m, d = '') => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}${d ? ' — ' + d : ''}`); if (!c) fails++; };
const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const mondayOf = (d) => { const x = new Date(d + 'T00:00:00Z'); return addDays(d, -((x.getUTCDay() + 6) % 7)); };
const num = (s) => parseFloat(String(s).replace(/,/g, ''));
const go = async (p, u) => { await p.goto(BASE + u); await p.waitForLoadState('networkidle'); };
const tagsOf = (where) => sql(`select array_to_string(array(select name from "Tag" where id = any(e."tagIds") order by name), '+') from "TimeEntry" e where ${where} order by e."startMin", e.minutes`).split('\n').filter((x) => x !== undefined);

(async () => {
  const b = await start();
  const run = process.pid;
  const uid = 'mtag' + run, email = uid + '@example.com';
  const T = Object.fromEntries(['CAD', 'ENG', 'Revit'].map((n) => [n, sql(`select id from "Tag" where name='${n}'`)]));
  const proj = sql(`select id from "Project" where name='Patient portal'`);
  const phase = sql(`select id from "Phase" where "projectId"='${proj}' and name='Submission 1'`);
  const client = sql(`select "clientId" from "Project" where id='${proj}'`);
  const priya = sql(`select "locationId"||'|'||"teamId"||'|'||"passwordHash" from "User" where email='priya@example.com'`).split('|');
  const todayStr = sql(`select to_char(now() at time zone 'UTC','YYYY-MM-DD')`), ws = mondayOf(todayStr), wed = addDays(ws, 2);
  const shareOld = sql(`select coalesce("shareToken",'')||'|'||"shareApprovedOnly" from "Client" where id='${client}'`).split('|');
  const token = ('mtag' + run + 'x'.repeat(40)).slice(0, 32);
  const settingsOld = sql(`select "requireTag" from "Settings" where id=1`) === 't';
  const tagCount = Number(sql(`select count(*) from "Tag"`));
  try {
    sql(`update "Settings" set "requireTag"=true where id=1`);
    sql(`insert into "User"(id,email,name,"passwordHash",role,"locationId","teamId","weeklyTarget","createdAt") values('${uid}','${email}','Multi Tag','${priya[2]}','MEMBER','${priya[0]}','${priya[1]}',40, now()-interval '30 days')`);
    sql(`insert into "ProjectUserAccess"("projectId","userId") values('${proj}','${uid}')`);
    sql(`insert into "TimesheetRow"("userId","weekStart","projectId") values('${uid}','${ws}','${proj}')`);

    // ---- the entry dialog ----
    const p = await login(b, email);
    await go(p, '/timesheet');
    await p.click(`tr:has-text("Patient portal") button.addcell[aria-label*="Wed"]`); await p.waitForSelector('dialog[open] #e-phase');
    ok((await p.textContent('dialog[open] .tagpick legend')).replace(/\s*\*/, '').trim() === 'Tags', 'the dialog asks for Tags');
    ok(await p.locator('dialog[open] .tagpick-i input[type=checkbox]').count() === tagCount, `one tick box for each of the ${tagCount} tags`);
    ok(await p.locator('dialog[open] select[name=tagId]').count() === 0, 'the single tag dropdown is gone');
    await p.selectOption('#e-phase', { label: 'Submission 1' }); await p.fill('#e-dur', '2'); await p.fill('#e-desc', 'two tags');
    await p.click('dialog[open] button:has-text("Add entry")'); await p.waitForSelector('dialog[open] [role=alert]');
    ok(/Tags/.test(await p.textContent('dialog[open] [role=alert]')) && await p.locator('dialog[open] .tagpick.err').count() === 1, 'no tag ticked is refused when tags are required');
    await p.check('.tagpick-i:has-text("CAD") input'); await p.check('.tagpick-i:has-text("ENG") input');
    ok(await p.locator('.tagpick-i:has(input:checked)').count() === 2, 'two tags can be ticked together');
    await p.click('dialog[open] button:has-text("Add entry")'); await p.waitForSelector('dialog[open]', { state: 'detached' }).catch(() => {});
    await p.waitForSelector('tr:has-text("Patient portal") button.chipbtn');
    ok(sql(`select count(*) from "TimeEntry" where "userId"='${uid}' and cardinality("tagIds")=2`) === '1', 'saved with both tags');
    ok(sql(`select "tagIds"::text from "TimeEntry" where "userId"='${uid}'`) === `{${[T.CAD, T.ENG].sort().join(',')}}`, 'the tag list is stored in a fixed order');
    await p.hover('tr:has-text("Patient portal") button.chipbtn');
    await p.waitForSelector('.sheettip');
    ok(/Tags\s*CAD, ENG/.test((await p.textContent('.sheettip')).replace(/\s+/g, ' ')), 'the hover card lists both tags', (await p.textContent('.sheettip')).replace(/\s+/g, ' '));
    ok(/Tags: CAD, ENG/.test(await p.getAttribute('tr:has-text("Patient portal") button.chipbtn', 'aria-label')), 'the entry names both tags for screen readers');

    // edit: both come back ticked; change one
    await p.click('tr:has-text("Patient portal") button.chipbtn'); await p.waitForSelector('dialog[open] #e-phase');
    ok(await p.locator('.tagpick-i:has-text("CAD") input').isChecked() && await p.locator('.tagpick-i:has-text("ENG") input').isChecked() && !(await p.locator('.tagpick-i:has-text("Revit") input').isChecked()), 'editing shows the saved tags ticked');
    await p.uncheck('.tagpick-i:has-text("ENG") input'); await p.check('.tagpick-i:has-text("Revit") input');
    await p.click('dialog[open] button:has-text("Save changes")'); await p.waitForSelector('dialog[open]', { state: 'detached' }).catch(() => {});
    await p.waitForTimeout(500);
    ok(sql(`select "tagIds"::text from "TimeEntry" where "userId"='${uid}'`) === `{${[T.CAD, T.Revit].sort().join(',')}}`, 'changing the ticks saves the new set');

    // optional tags: none is fine
    sql(`update "Settings" set "requireTag"=false where id=1`);
    await go(p, '/timesheet');
    await p.click(`tr:has-text("Patient portal") button.addcell[aria-label*="Wed"]`); await p.waitForSelector('dialog[open] #e-phase');
    ok(await p.locator('dialog[open] .tagpick legend .req').count() === 0, 'Tags is not marked required when Settings turn that off');
    await p.selectOption('#e-phase', { label: 'Submission 1' }); await p.fill('#e-dur', '0.5'); await p.fill('#e-desc', 'no tags');
    await p.click('dialog[open] button:has-text("Add entry")'); await p.waitForSelector('dialog[open]', { state: 'detached' }).catch(() => {});
    await p.waitForTimeout(500);
    ok(sql(`select count(*) from "TimeEntry" where "userId"='${uid}' and cardinality("tagIds")=0`) === '1', 'an entry with no tags is saved when tags are optional');
    sql(`update "Settings" set "requireTag"=true where id=1`);

    // ---- the timer ----
    sql(`delete from "TimeEntry" where "userId"='${uid}'`);
    sql(`insert into "TimerRun"("userId","projectId","phaseId","tagIds","description","startedAt") values('${uid}','${proj}','${phase}',ARRAY['${T.CAD}','${T.ENG}'],'timer',now()-interval '10 minutes')`);
    await go(p, '/timesheet?view=timer');
    ok(await p.locator('.tmcard .tagpick-i input:checked').count() === 2, 'a running timer shows its two tags ticked');
    await p.uncheck('.tagpick-i:has-text("ENG") input');
    await p.click('button:has-text("Stop")'); await p.waitForSelector('p[role=status]');
    const timerTags = sql(`select distinct "tagIds"::text from "TimeEntry" where "userId"='${uid}'`);
    ok(timerTags === `{${T.CAD}}`, 'stopping the timer saves the tags ticked on screen', timerTags);

    // ---- reports, the export and the client link ----
    sql(`delete from "TimeEntry" where "userId"='${uid}'`);
    const day = '2020-03-02'; // a Monday long ago, so nothing else is in range
    sql(`insert into "TimeEntry"(id,"userId","projectId","phaseId","tagIds",date,"startMin",minutes,description) values
      ('${uid}a','${uid}','${proj}','${phase}',ARRAY['${T.CAD}','${T.ENG}'],'${day}',540,120,'both'),
      ('${uid}b','${uid}','${proj}','${phase}',ARRAY['${T.CAD}'],'${day}',700,60,'one'),
      ('${uid}c','${uid}','${proj}','${phase}',ARRAY[]::text[],'${day}',800,30,'none')`);
    const a = await login(b, 'admin@example.com');
    const rep = `/reports?range=custom&from=2020-03-01&to=2020-03-31&person=${uid}`;
    await go(a, rep + '&group=tag');
    ok(num(await a.locator('.rtotal b').first().innerText()) === 3.5, 'the total counts each entry once (3.50 h)');
    const rows = Object.fromEntries((await a.locator('.rtable tbody tr.rg-row').evaluateAll((trs) => trs.map((tr) => [tr.cells[0].textContent.trim(), tr.querySelector('td[data-l=Hours]').textContent.trim()]))));
    ok(rows.CAD === '3.00' && rows.ENG === '2.00' && rows['No tag'] === '0.50', 'grouped by tag, an entry counts under each of its tags', JSON.stringify(rows));
    ok(await a.locator('text=counts under each of its tags').count() === 1, 'a note explains tag rows can add up to more than the total');
    ok(await a.locator('.rdonut').count() === 0, 'the doughnut is left out when tags overlap');
    await go(a, rep + '&group=project');
    ok(await a.locator('text=counts under each of its tags').count() === 0 && await a.locator('.rdonut').count() === 1, 'no note or missing doughnut for other groupings');
    await go(a, rep + '&group=project&group2=tag');
    await a.click('.rg-chev.all');
    const kids = (await a.locator('.rtable tbody tr.rg-kid').evaluateAll((trs) => trs.map((tr) => tr.textContent.replace(/\s+/g, ' ').trim()))).join(' | ');
    ok(/CAD.*3\.00/.test(kids) && /ENG.*2\.00/.test(kids), 'then by tag lists each tag inside the project', kids);
    await go(a, rep + `&group=tag&tag=${T.ENG}`);
    ok(num(await a.locator('.rtotal b').first().innerText()) === 2 && (await a.locator('.rtable tbody tr.rg-row').count()) === 1, 'filtering on a tag keeps entries that carry it, and lists only that tag');
    await go(a, rep + `&tag=${T.ENG}&tag=${T.Revit}`);
    ok(num(await a.locator('.rtotal b').first().innerText()) === 2, 'two ticked tags match entries with either one');
    await go(a, rep + '&tab=detailed');
    const detail = (await a.locator('.rtable tbody tr').evaluateAll((trs) => trs.map((tr) => tr.textContent.replace(/\s+/g, ' ').trim()))).join(' | ');
    ok(/CAD, ENG/.test(detail), 'the detailed list shows both tags in one cell', detail.slice(0, 200));
    await go(a, rep + '&tab=weekly&group=tag');
    const foot = (await a.locator('tfoot td').allInnerTexts()).join(' ');
    ok(/3\.50/.test(foot) && !/5\.50/.test(foot), 'weekly column totals count each entry once', foot);
    const csv = await (await a.request.get(BASE + '/reports/export?range=custom&from=2020-03-01&to=2020-03-31&person=' + uid)).text();
    const header = csv.split('\r\n')[0].split(',');
    ok(header.includes('Tags') && !header.includes('Tag'), 'the export has a Tags column');
    ok(/"CAD, ENG"/.test(csv), 'the export lists the tags of an entry together', csv.split('\r\n')[1]);

    sql(`update "Client" set "shareToken"='${token}', "shareApprovedOnly"=false where id='${client}'`);
    const v = await (await b.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
    const shr = `/share/${token}?range=custom&from=2020-03-01&to=2020-03-31&project=${proj}`;
    await v.goto(BASE + shr + '&by=tag'); await v.waitForLoadState('networkidle');
    const shareRows = Object.fromEntries(await v.locator('.rtable tbody tr.rg-row').evaluateAll((trs) => trs.map((tr) => [tr.cells[0].textContent.trim(), tr.querySelector('td[data-l=Hours]').textContent.trim()])));
    ok(num(await v.locator('.rtotal b').first().innerText()) === 3.5 && shareRows.CAD === '3.00' && shareRows.ENG === '2.00', 'the client report counts the total once and each tag fully', JSON.stringify(shareRows));
    ok(await v.locator('.rdonut').count() === 0 && await v.locator('text=counts under each of its tags').count() === 1, 'the client report explains the overlap and drops the doughnut');
    await v.goto(BASE + shr + `&by=tag&tag=${T.ENG}`); await v.waitForLoadState('networkidle');
    ok(num(await v.locator('.rtotal b').first().innerText()) === 2, 'the client tag filter matches entries that carry the tag');
    const shareCsv = await (await v.request.get(BASE + shr.replace('/share/', '/share/').replace('?', '/export?'))).text();
    const lines = shareCsv.split('\r\n').filter(Boolean);
    ok(lines[0] === 'Project,Tags,Hours' && lines.some((l) => /^Patient portal,"CAD, ENG",2$/.test(l)) && lines.some((l) => /^Patient portal,CAD,1$/.test(l)), 'the client CSV has one line per project and set of tags', lines.join(' / '));
    ok(lines.slice(1).reduce((s, l) => s + parseFloat(l.split(',').pop()), 0) === 3.5, 'the client CSV adds up to the total');

    // ---- the timesheet import ----
    const ctxA = await login(b, 'admin@example.com');
    const d = desk(ctxA, BASE);
    const note = 'mt' + run;
    const mon = addDays(ws, -7), tue = addDays(ws, -6); // last week: after any lock date, and not a week the new person has closed
    const csvIn = ['Date,Email,Project,Phase,Tag,Description,Hours',
      `${mon},${email},Patient portal,Submission 1,"CAD, Revit",${note} two,1`,
      `${mon},${email},Patient portal,Submission 1,"Revit, CAD, cad",${note} dup,2`,
      `${tue},${email},Patient portal,Submission 1,Nope,${note} unknown,1`,
      `${tue},${email},Patient portal,Submission 1,,${note} none,1`].join('\n');
    await d.paste('time', csvIn);
    let c = await d.check();
    const cell = (r) => r.join(' | ');
    ok(/Ready/.test(cell(c.rows[0])) && /Ready/.test(cell(c.rows[1])), 'import: two tags in one cell are accepted (repeats are ignored)', cell(c.rows[1]));
    ok(!/Only the first tag/.test(c.rows.map(cell).join(' ')), 'import: no "only the first tag" note any more');
    ok(/Unknown tag: Nope/.test(cell(c.rows[2])) && /tag is required/i.test(cell(c.rows[3])), 'import: an unknown tag and a missing tag are refused');
    ok(c.rows[0].includes('CAD, Revit'), 'import: the preview shows the tags together', cell(c.rows[0]));
    const msg = await d.commit();
    ok(/2 time entries added/.test(msg), 'import: two entries saved', msg);
    ok(sql(`select count(*) from "TimeEntry" where description like '${note}%' and cardinality("tagIds")=2`) === '2', 'import: both entries carry two tags');
    await d.paste('time', csvIn.replace('"CAD, Revit"', '"Revit, CAD"')); c = await d.check();
    ok(/Already imported/.test(cell(c.rows[0])), 'import: the same tags in another order are still recognised as already imported', cell(c.rows[0]));

    // ---- removing a tag ----
    const tmp = 'cuid' + run;
    sql(`insert into "Tag"(id,name) values('${tmp}','Temp ${run}')`);
    sql(`insert into "TimeEntry"(id,"userId","projectId","phaseId","tagIds",date,"startMin",minutes,description) values('${uid}t','${uid}','${proj}','${phase}',ARRAY['${T.CAD}','${tmp}'],'${day}',900,15,'tmp tag')`);
    sql(`delete from "TimerRun" where "userId"='${uid}'`);
    sql(`insert into "TimerRun"("userId","projectId","phaseId","tagIds","description") values('${uid}','${proj}','${phase}',ARRAY['${tmp}'],'timer')`);
    await go(a, '/settings');
    const item = a.locator(`.item:has-text("Temp ${run}")`);
    ok(/1 entry/.test(await item.innerText()), 'Settings counts the entries that carry a tag', (await item.innerText()).replace(/\s+/g, ' '));
    a.on('dialog', (x) => x.accept());
    await item.locator('button:has-text("Remove")').click();
    await a.waitForTimeout(400);
    const confirmBtn = a.locator(`dialog[open] button:has-text("Remove")`);
    if (await confirmBtn.count()) await confirmBtn.first().click();
    await a.waitForFunction((n) => !document.body.innerText.includes(n), `Temp ${run}`, { timeout: 15000 }).catch(() => {});
    ok(sql(`select count(*) from "Tag" where id='${tmp}'`) === '0', 'the tag is removed');
    ok(sql(`select "tagIds"::text from "TimeEntry" where id='${uid}t'`) === `{${T.CAD}}`, 'removing a tag takes it off entries and keeps the others');
    ok(sql(`select cardinality("tagIds") from "TimerRun" where "userId"='${uid}'`) === '0', 'and off a running timer');
    ok(p.errs.length === 0 && a.errs.length === 0, 'no browser errors', JSON.stringify([...p.errs, ...a.errs]));
  } finally {
    sql(`delete from "TimeEntry" where "userId"='${uid}'`);
    sql(`delete from "TimerRun" where "userId"='${uid}'`);
    sql(`delete from "AuditLog" where "userId"='${uid}' or "targetUserId"='${uid}' or action like '%Temp ${run}%' or (action like 'Imported % from CSV%' and at > now() - interval '1 hour')`);
    sql(`delete from "Tag" where name='Temp ${run}'`);
    sql(`delete from "User" where id='${uid}'`);
    sql(`update "Client" set "shareToken"=${shareOld[0] ? `'${shareOld[0]}'` : 'null'}, "shareApprovedOnly"=${shareOld[1]} where id='${client}'`);
    sql(`update "Settings" set "requireTag"=${settingsOld} where id=1`);
    await b.close();
  }
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
