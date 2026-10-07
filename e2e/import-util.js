// Shared by the import tests: SQL access, a snapshot taken before a run, and clean-up of everything the run added.
const { execFileSync } = require('child_process');
const path = require('path');

const PSQL = process.env.PSQL || 'psql -h /var/run/postgresql clockme';
const [bin, ...psqlArgs] = PSQL.split(' ');
const sql = (q) => execFileSync(bin, [...psqlArgs, '-At', '-c', q]).toString().trim();
const ids = (table) => new Set(sql(`select id from "${table}"`).split('\n').filter(Boolean));
const FX = path.join(__dirname, 'fixtures', 'original');
const FILES = {
  people: ['users.csv', 'the-time-sink-people-template.csv'],
  projects: ['clients_projects.csv', 'the-time-sink-clients-projects-template.csv'],
  time: ['timesheet.csv', 'the-time-sink-timesheet-template.csv'],
};

function session() {
  let fails = 0;
  const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
  // What was there before, so everything this run adds can be removed again.
  const before = { Team: ids('Team'), Client: ids('Client'), Tag: ids('Tag'), Project: ids('Project'), User: ids('User') };
  const settings = sql(`select "requireTag", "requireDescription", coalesce("lockBefore"::text, '') from "Settings" where id=1`).split('|');
  const added = (table) => [...ids(table)].filter((i) => !before[table].has(i));
  const inList = (a) => a.map((i) => `'${i}'`).join(',') || "''";
  const setSettings = (tag, desc, lock) => sql(`update "Settings" set "requireTag"=${tag}, "requireDescription"=${desc}, "lockBefore"=${lock ? `'${lock}'` : 'null'} where id=1`);
  function cleanup() {
    setSettings(settings[0] === 't', settings[1] === 't', settings[2]);
    const users = added('User'), projects = added('Project');
    if (projects.length) sql(`delete from "TimeEntry" where "projectId" in (${inList(projects)})`);
    if (users.length) sql(`delete from "AuditLog" where "targetUserId" in (${inList(users)})`);
    if (users.length) sql(`delete from "User" where id in (${inList(users)})`);
    if (projects.length) sql(`delete from "Project" where id in (${inList(projects)})`);
    for (const t of ['Client', 'Tag', 'Team']) { const a = added(t); if (a.length) sql(`delete from "${t}" where id in (${inList(a)})`); }
    sql(`delete from "AuditLog" where action like 'Imported % from CSV%' and at > now() - interval '1 hour'`);
  }
  return { ok, fails: () => fails, bump: () => { fails++; }, added, cleanup, setSettings };
}

/** Drives the import page for one kind: load a file or pasted text, check it, import it. */
const desk = (p, BASE) => ({
  async open(kind) { await p.goto(`${BASE}/import-export?import=${kind}`); await p.waitForLoadState('networkidle'); },
  async load(kind, { create, file } = {}) {
    await this.open(kind);
    await p.setInputFiles(`#imp-file-${kind}`, file ?? path.join(FX, FILES[kind][0]));
    await p.waitForSelector('.ichip');
    if (create) await p.check('.icheck input');
  },
  async paste(kind, text, { create, office } = {}) {
    await this.open(kind);
    await p.click('summary:has-text("Paste CSV text instead")');
    await p.fill(`#imp-text-${kind}`, text);
    if (create) await p.check('.icheck input');
    if (office) await p.selectOption('#imp-office', { label: office });
  },
  async check() {
    await p.click('button:has-text("Check file"), button:has-text("Check again")');
    await p.waitForSelector('.itiles, .alert.bad');
    if (await p.locator('.alert.bad').count()) return { error: await p.locator('.alert.bad').first().innerText(), ready: 0, bad: 0, rows: [], reasons: [], adds: [], notes: 0, colnotes: [] };
    const tiles = (await p.locator('.itile b').allInnerTexts()).map(Number);
    const rows = await p.locator('.ipreview tbody tr').evaluateAll((trs) => trs.map((tr) => [...tr.cells].map((c) => c.textContent.trim())));
    return {
      ready: tiles[0], notes: tiles[1], bad: tiles[2], rows,
      reasons: await p.locator('.ireasons li').allInnerTexts(), adds: await p.locator('.alert.info').allInnerTexts(),
      colnotes: await p.locator('.icolnotes li').allInnerTexts(),
    };
  },
  async commit() {
    // A file that still holds the template's example rows has to be confirmed first.
    if (await p.locator('.alert.warn .icheck input').count()) await p.check('.alert.warn .icheck input');
    await p.click('button.primary:has-text("Import")');
    await p.waitForSelector('.idone, .alert.bad', { timeout: 90000 });
    return (await p.locator('.idone, .alert.bad').first().innerText()).replace(/\n/g, ' | ');
  },
});

module.exports = { sql, session, desk, FX, FILES };
