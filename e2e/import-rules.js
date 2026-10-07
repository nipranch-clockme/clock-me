// Import rules and permissions, checked with small pasted files: what each row says, who may import what, and what actually gets saved.
// Run: BASE=http://localhost:3100 NODE_PATH=$(npm root -g) PSQL="psql -h /var/run/postgresql clockme" node e2e/import-rules.js
const { start, login, BASE } = require('./helpers');
const { sql, session, desk: makeDesk } = require('./import-util');

const S = session();
const ok = S.ok;
const check = (row) => row[row.length - 1];
const byName = (rows, name) => rows.find((r) => r[1] === name || r[2] === name) || [];

(async () => {
  const b = await start();
  try {
    S.setSettings(false, false, null);

    // ---------- Admin: people ----------
    const p = await login(b, 'admin@example.com');
    const d = makeDesk(p, BASE);
    await d.paste('people', [
      'Name,Email,Role,Group,Daily Work Capacity,Working Days,Employee ID,Joining date,Office',
      'Ann Able,ann.able@rules-test.com,,Rules Team,8,"Mon, Tue, Wed, Thu, Fri",RT-1,2020-01-15,AMD',
      'Bad Mail,not-an-email,,,,,,,AMD',
      'Ann Again,ANN.ABLE@rules-test.com,,,,,,,AMD',
      'Role Typo,typo@rules-test.com,Wizard,,,,,,AMD',
      'Overtime,ot@rules-test.com,,,12,"Mon, Tue, Wed, Thu, Fri, Sat, Sun",,,AMD',
      'Future,future@rules-test.com,,,,,,2090-01-01,AMD',
      'Dup Emp,dup.emp@rules-test.com,,,,,rt-1,,AMD',
      'Boss,boss@rules-test.com,Team Manager,,,,,,AMD',
      'Boss Two,boss2@rules-test.com,Project Manager,Rules Team,4,"Mon, Tue",,,AMD',
      'Existing,aisha@example.com,,,,,,,AMD',
      'Nowhere,nowhere@rules-test.com,,,,,,,Atlantis',
      `${'x'.repeat(101)},long@rules-test.com,,,,,,,AMD`,
      'Spacey   Name,spacey@rules-test.com,,,,,,,AMD',
    ].join('\n'));
    let c = await d.check();
    ok(check(byName(c.rows, 'Ann Able')) === 'Ready', 'people: a good row is ready');
    ok(byName(c.rows, 'Ann Able')[6] === '40', 'people: 8 hours x 5 days is 40 a week');
    ok(/valid email/.test(check(byName(c.rows, 'Bad Mail'))), 'people: a bad email is refused');
    ok(/Same email as row/.test(check(byName(c.rows, 'Ann Again'))), 'people: the same email twice (any capitals) is refused');
    ok(/Unknown role: Wizard/.test(check(byName(c.rows, 'Role Typo'))), 'people: an unknown role is an error, never a silent Team Member');
    ok(/between 0 and 80/.test(check(byName(c.rows, 'Overtime'))), 'people: more than 80 hours a week is refused');
    ok(/future/.test(check(byName(c.rows, 'Future'))), 'people: a joining date in the future is refused');
    ok(/Same employee ID/.test(check(byName(c.rows, 'Dup Emp'))), 'people: the same employee ID twice (any capitals) is refused');
    ok(/need a team/.test(check(byName(c.rows, 'Boss'))), 'people: a manager with no group is refused');
    ok(check(byName(c.rows, 'Boss Two')) === 'Ready' && byName(c.rows, 'Boss Two')[3] === 'Team/Project Manager', 'people: Project Manager with a group becomes a Team/Project Manager');
    ok(byName(c.rows, 'Boss Two')[6] === '8', 'people: 4 hours x 2 days is 8 a week');
    ok(/Already has an account/.test(check(byName(c.rows, 'Existing'))), 'people: someone who already has an account is refused');
    ok(/Unknown office/.test(check(byName(c.rows, 'Nowhere'))), 'people: an unknown office is refused');
    ok(c.rows.some((r) => /up to 100 characters/.test(check(r))), 'people: a 101 character name is refused');
    ok(c.rows.some((r) => r[1] === 'Spacey Name'), 'people: extra spaces in a name are tidied');
    ok(c.ready === 3 && c.adds.some((a) => /Rules Team \(AMD\)/.test(a)), 'people: 3 ready and the new team is announced');
    ok(c.colnotes.length === 0, 'people: a file with only ordinary columns has no column notes');
    const msg = await d.commit();
    ok(/3 people added/.test(msg), 'people: the three good rows were saved: ' + msg);
    ok(sql(`select count(*) from "User" where email like '%@rules-test.com'`) === '3', 'people: only the good rows are in the database');
    ok(sql(`select count(*) from "User" u join "Team" t on t.id=u."teamId" where u.email in ('ann.able@rules-test.com','boss2@rules-test.com') and t.name='Rules Team'`) === '2', 'people: both are on the new Rules Team');
    ok(sql(`select role from "User" where email='boss2@rules-test.com'`) === 'LEADER', 'people: the manager is saved as a Team/Project Manager');
    ok(sql(`select "employeeId" from "User" where email='ann.able@rules-test.com'`) === 'RT-1', 'people: employee ID saved');
    ok(sql(`select count(*) from "User" where email='ann.able@rules-test.com' and "inviteToken" is not null and "passwordHash" is null`) === '1', 'people: saved as an invite, no password');

    // ---------- Admin: clients and projects ----------
    await d.paste('projects', [
      'Project,Client,Tasks,Tags,Budget hours,Access',
      'Rules  Alpha,"Rules  Client",Plan; Build,"Rulesy, Rulesy2",100,Everyone',
      'Rules Alpha,Rules Client,,,,',
      'Rules Beta,Rules Client,,,Infinity,',
      'Rules Gamma,Rules Client,,,,Restriced',
      'Rules Delta,,,,,',
      `Rules Epsilon,Rules Client,,${'t'.repeat(41)},,`,
      'Rules Zeta,Rules Client,,,0x10,',
    ].join('\n'));
    c = await d.check();
    ok(check(byName(c.rows, 'Rules Alpha')) === 'Ready', 'projects: a good row is ready');
    ok(c.rows[0][1] === 'Rules Client' && c.rows[0][2] === 'Rules Alpha', 'projects: extra spaces in names are tidied');
    ok(/Same project as row 2/.test(check(c.rows[1])), 'projects: the same project twice in one file is refused');
    ok(/Budget must be/.test(check(c.rows[2])), 'projects: a budget of Infinity is refused');
    ok(/Access must be/.test(check(c.rows[3])), 'projects: an Access typo is refused instead of opening the project up');
    ok(/Ready/.test(check(c.rows[4])) && /Internal/.test(check(c.rows[4])), 'projects: a blank client goes under Internal');
    ok(/too long/.test(check(c.rows[5])), 'projects: a very long tag is refused');
    ok(/Budget must be/.test(check(c.rows[6])), 'projects: a hex budget is refused');
    ok(c.adds.some((a) => /Rules Client/.test(a)) && c.adds.some((a) => /Rulesy2/.test(a)), 'projects: new client and tags are announced');
    const pmsg = await d.commit();
    ok(/2 projects added/.test(pmsg), 'projects: two saved: ' + pmsg);
    ok(sql(`select count(*) from "Client" where name='Rules Client'`) === '1', 'projects: one tidy client was created');
    ok(sql(`select string_agg(ph.name, ';' order by ph.sort) from "Phase" ph join "Project" p on p.id=ph."projectId" where p.name='Rules Alpha'`) === 'Plan;Build', 'projects: Tasks became phases in order');
    ok(sql(`select "budgetHours" from "Project" where name='Rules Alpha'`) === '100', 'projects: budget saved');
    ok(sql(`select count(*) from "Tag" where name in ('Rulesy','Rulesy2')`) === '2', 'projects: tags created');
    ok(sql(`select count(*) from "AuditLog" where action like 'Imported 2 projects from CSV%Rules Client%'`) === '1', 'projects: the audit line names the new client');

    // ---------- Admin: timesheet ----------
    const sheet = (extra = '') => [
      'Date,Email,Project,Phase,Tag,Description,Hours,Start',
      '2026-10-05,admin@example.com,Website rebuild,Submission 1,CAD,Rules one,8:00:00,9:00 AM',
      '2026-10-05,admin@example.com,Website rebuild,Submission 1,CAD,Rules two,1:75,',
      '2026-10-05,admin@example.com,Website rebuild,Submission 1,CAD,Rules three,1.5,13:00',
      '10/06/2026,admin@example.com,Website rebuild,Submission 1,"CAD, ENG",Rules four,2,5:00 PM',
      "2026-10-07,admin@example.com,Website rebuild,Submission 1,CAD,'=SUM(1),1,",
      '2026-10-07,admin@example.com,Website rebuild,Nope,CAD,Rules six,1,',
      '2026-10-07,admin@example.com,Website rebuild,Submission 1,Nope,Rules seven,1,',
      '2026-10-07,ghost@example.com,Website rebuild,Submission 1,CAD,Rules eight,1,',
      '2026-10-07,admin@example.com,Website rebuild,Submission 1,,Rules nine,1,',
      extra,
    ].filter(Boolean).join('\n');
    await d.paste('time', sheet());
    c = await d.check();
    const find = (t) => c.rows.find((r) => r.some((x) => x === t || x.includes(t))) || [];
    ok(c.rows.length === 9, 'time: nine rows listed');
    ok(c.rows[0][6] === '8:00:00' && check(c.rows[0]) === 'Ready', 'time: 08:00:00 style durations are accepted');
    ok(/Duration must be/.test(check(c.rows[1])), 'time: 1:75 is refused');
    ok(check(c.rows[2]) === 'Ready', 'time: decimal hours and 24 hour start accepted');
    ok(/Only the first tag/.test(check(c.rows[3])), 'time: several tags keep the first, with a heads-up');
    ok(/Ready/.test(check(c.rows[4])), 'time: a description starting with an apostrophe-guarded = is accepted');
    ok(/Task \(phase\) must be one of/.test(check(c.rows[5])), 'time: an unknown phase lists the real ones');
    ok(/Unknown tag: Nope/.test(check(c.rows[6])), 'time: an unknown tag is refused');
    ok(/Unknown person/.test(check(c.rows[7])), 'time: an unknown person is refused');
    ok(/Ready/.test(check(c.rows[8])), 'time: a blank tag is fine when Settings do not require one');
    S.setSettings(true, false, null);
    await d.paste('time', sheet()); c = await d.check();
    ok(/tag is required/i.test(check(c.rows[8])), 'time: a blank tag is refused when Settings require one');
    S.setSettings(false, true, '2026-10-05');
    await d.paste('time', sheet()); c = await d.check();
    ok(/locked/.test(check(c.rows[0])) && /locked/.test(check(c.rows[2])), 'time: dates on or before the lock date are refused');
    ok(/Ready/.test(check(c.rows[3])), 'time: dates after the lock date are fine');
    S.setSettings(false, false, null);
    await d.paste('time', sheet()); c = await d.check();
    const tmsg = await d.commit();
    ok(/5 time entries added/.test(tmsg), 'time: five rows saved: ' + tmsg);
    const rows = sql(`select description, minutes, "startMin" from "TimeEntry" where description like 'Rules %' or description='=SUM(1)' order by description`).split('\n');
    ok(rows.includes('Rules one|480|540') && rows.includes('Rules three|90|780') && rows.includes('Rules four|120|1020') && rows.includes('Rules nine|60|540'), 'time: hours and start times saved correctly: ' + rows.join(' ; '));
    ok(rows.includes('=SUM(1)|60|540'), 'time: the leading apostrophe our exports add is removed on the way back in');
    await d.paste('time', sheet()); c = await d.check();
    ok(c.rows.filter((r) => /Already imported/.test(check(r))).length === 5, 'time: the same rows again are "Already imported"');

    // ---------- Team/Project Manager ----------
    const lead = await login(b, 'aisha@example.com');
    const ld = makeDesk(lead, BASE);
    await ld.open('time');
    ok(await lead.locator('.ikind').count() === 2, 'leader: only Clients and projects and Timesheet are offered');
    ok((await lead.request.get(`${BASE}/import-export/template/people`)).status() === 403, 'leader: the People template is refused');
    ok((await lead.request.get(`${BASE}/import-export/template/time`)).status() === 200, 'leader: the Timesheet template is allowed');
    await ld.paste('time', ['Date,Email,Project,Phase,Tag,Description,Hours', '2026-10-05,daniel@example.com,Website rebuild,Submission 1,CAD,Rules x,1'].join('\n'));
    c = await ld.check();
    ok(/not someone you manage/.test(check(c.rows[0])), 'leader: time for someone outside their team is refused');
    await ld.paste('projects', ['Project,Client,Tags', 'Rules Lead,Brand New Client,', 'Rules Lead 2,Bluebird Health,NoSuchTag'].join('\n'));
    c = await ld.check();
    ok(/only admins add clients/i.test(check(c.rows[0])), 'leader: cannot add a new client');
    ok(/Ready/.test(check(c.rows[1])) && /only admins add tags/.test(check(c.rows[1])), 'leader: a new tag is a heads-up, the project still imports');
    await lead.context().close();

    // ---------- Location manager ----------
    const loc = await login(b, 'oliver@example.com');
    const od = makeDesk(loc, BASE);
    await od.open('people');
    ok(await loc.locator('.ikind').count() === 3, 'location manager: all three imports are offered');
    ok(await loc.locator('#imp-office').count() === 0, 'location manager: no office to choose, only their own');
    await od.paste('people', [
      'Name,Email,Role,Office,Group', 'Lo Member,lo.member@rules-test.com,,,Lo Team',
      'Lo Admin,lo.admin@rules-test.com,Admin,,', 'Lo Other,lo.other@rules-test.com,,KLH,',
    ].join('\n'));
    c = await od.check();
    ok(check(c.rows[0]) === 'Ready' && c.rows[0][4] === 'PNQ', 'location manager: people join their own office');
    ok(/Only admins can make someone an admin/.test(check(c.rows[1])), 'location manager: cannot make an admin');
    ok(/own office/.test(check(c.rows[2])), 'location manager: cannot add to another office');
    await loc.context().close();

    ok(p.errs.length === 0, 'no page errors: ' + p.errs.join(' / '));
    await p.context().close();
  } catch (e) {
    console.log('ERR', e.message.slice(0, 900)); S.bump();
  } finally {
    try { sql(`delete from "TimeEntry" where description like 'Rules %' or description='=SUM(1)'`); } catch {}
    S.cleanup();
    ok(S.added('User').length === 0 && S.added('Project').length === 0 && S.added('Client').length === 0, 'clean-up removed everything this run added');
    await b.close();
  }
  console.log(S.fails() ? `${S.fails()} FAILED` : 'ALL PASSED');
  process.exit(S.fails() ? 1 : 0);
})();
