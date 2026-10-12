// The timer bar: one minimal row (description, project, phase, tags, clock, Start and Stop) and a Manual entry button that adds time
// for a project without a timer, starting from what is on the bar. Creates its own person and removes it again.
//   BASE=http://localhost:3500 PSQL="psql -h /var/run/postgresql tags_t" node e2e/timer-bar.js
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
  const run = process.pid;
  const uid = 'tbar' + run, email = uid + '@example.com', typed = 'Typed on the bar ' + run;
  const proj = sql(`select id from "Project" where name='Patient portal'`);
  const priya = sql(`select "locationId"||'|'||"teamId"||'|'||"passwordHash" from "User" where email='priya@example.com'`).split('|');
  const today = sql(`select to_char(now() at time zone 'UTC','YYYY-MM-DD')`);
  try {
    sql(`insert into "User"(id,email,name,"passwordHash",role,"locationId","teamId","weeklyTarget","createdAt") values('${uid}','${email}','Timer Bar','${priya[2]}','MEMBER','${priya[0]}','${priya[1]}',40, now()-interval '30 days')`);
    sql(`insert into "ProjectUserAccess"("projectId","userId") values('${proj}','${uid}')`);
    const p = await login(b, email);
    await go(p, '/timesheet?view=timer');

    // one minimal row, with placeholders and aria labels instead of visible captions (tag names and the sr-only project label don't count)
    ok(await p.locator('.tmcard label:not(.tagpick-i):not(.sr-only)').count() === 0, 'the bar has no visible field captions, only placeholders and labels for screen readers');
    const mid = async (sel) => { const bx = await p.locator(sel).first().boundingBox(); return bx ? bx.y + bx.height / 2 : NaN; };
    const rowY = await mid('button.tmmanual');
    ok(Math.abs((await mid('input.tmdesc')) - rowY) < 4 && Math.abs((await mid('.tmcard button.btn.primary')) - rowY) < 4 && Math.abs((await mid('.tmclock')) - rowY) < 4, 'description, clock, Start and Manual entry sit on one row');
    ok(await p.locator('.tagpick').first().isHidden(), 'the tags stay tucked away until the Tags button is pressed');

    // pick a project, a phase and a tag on the bar, then go to a manual entry
    await p.selectOption('#tm-project', { index: 1 });
    const barProject = await p.inputValue('#tm-project');
    await p.selectOption('#tm-phase', { index: 1 });
    const barPhase = await p.inputValue('#tm-phase');
    await p.click('.tmtag-btn');
    ok(await p.locator('.tagpick').first().isVisible(), 'the Tags button opens the tick boxes');
    await p.locator('.tagpick-i input').first().check();
    ok(await p.textContent('.tmtag-n') === '1', 'the Tags button counts the tags ticked');
    await p.click('.tmtag-btn');
    await p.fill('input.tmdesc', typed);

    // a manual entry for a project without a timer, starting from the bar
    await p.click('button.tmmanual');
    await p.waitForSelector('dialog[open] #e-phase');
    ok((await p.textContent('dialog[open] #entry-title')).trim() === 'Add time', 'Manual entry opens the Add time form');
    ok(await p.inputValue('dialog[open] #e-desc') === typed, 'the form carries the description typed on the bar');
    ok(await p.inputValue('dialog[open] #e-project') === barProject, 'the form carries the project chosen on the bar');
    ok(await p.inputValue('dialog[open] #e-phase') === barPhase && barPhase !== '', 'the form carries the phase chosen on the bar');
    ok(await p.locator('dialog[open] .tagpick-i input:checked').count() === 1, 'the form carries the tag ticked on the bar');
    ok(await p.inputValue('dialog[open] #e-date') === today, 'the entry is dated today');
    ok(await p.locator('dialog[open] #e-start').count() === 1 && await p.locator('dialog[open] #e-dur').count() === 1, 'it asks for a start time and a duration');
    await p.fill('dialog[open] #e-dur', '0.5');
    await p.click('dialog[open] button:has-text("Add entry")');
    await p.waitForFunction(() => !document.querySelector('dialog[open]'), null, { timeout: 20000 }).catch(() => {});
    const saved = sql(`select count(*)||'|'||coalesce(sum(minutes),0)||'|'||coalesce(max(cardinality("tagIds")),0)||'|'||(count(*) filter (where "phaseId" is null)) from "TimeEntry" where "userId"='${uid}' and description='${typed}'`);
    ok(saved === '1|30|1|0', 'saving adds the half hour as one entry for today, with the bar\'s tag and phase', saved);
    await p.waitForSelector(`.tmrow:has-text("${typed}")`, { timeout: 20000 }).catch(() => {});
    ok(await p.locator(`.tmrow:has-text("${typed}")`).count() === 1, 'the new entry is listed under today');
    // the bar clears once the manual entry is saved, ready for the next one, and its project list has no search box
    await p.waitForFunction(() => document.querySelector('#tm-desc')?.value === '', null, { timeout: 5000 }).catch(() => {});
    ok(await p.inputValue('#tm-desc') === '' && await p.inputValue('#tm-project') === '' && await p.inputValue('#tm-phase') === '' && await p.locator('.tmtag-n').count() === 0, 'after a manual entry the bar is empty again');
    ok(await p.locator('.tmproj input.ssel-q').count() === 0, 'the project dropdown in the bar has no search box');

    // a narrow screen keeps the bar inside the page
    await p.setViewportSize({ width: 390, height: 844 });
    await go(p, '/timesheet?view=timer');
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(overflow <= 0, 'no sideways scrolling on a phone-width screen', `overflow ${overflow}px`);
    await p.screenshot({ path: process.env.SHOT || '/tmp/timer-bar-mobile.png', fullPage: true });
    await p.setViewportSize({ width: 1280, height: 1000 });
    await go(p, '/timesheet?view=timer');
    await p.screenshot({ path: process.env.SHOT_DESK || '/tmp/timer-bar-desktop.png', clip: { x: 0, y: 0, width: 1280, height: 420 } });

    ok(p.errs.length === 0, 'no browser errors', JSON.stringify(p.errs.slice(0, 3)));
  } finally {
    sql(`delete from "TimeEntry" where "userId"='${uid}'`);
    sql(`delete from "TimerRun" where "userId"='${uid}'`);
    sql(`delete from "AuditLog" where "userId"='${uid}' or "targetUserId"='${uid}'`);
    sql(`delete from "User" where id='${uid}'`);
    await b.close();
  }
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
