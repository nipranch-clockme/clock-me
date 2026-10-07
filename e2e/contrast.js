// Text stays readable in both themes: every visible piece of text on the main pages (also with menus and pop-ups open, and on a phone)
// is measured against the colour behind it, and every dropdown list must name its own option colours (the browser draws the open
// list from those, so without them dark mode gives light text on a white list).
// Run: BASE=http://localhost:3100 NODE_PATH=$(npm root -g) PSQL="psql -h /var/run/postgresql clockme" node e2e/contrast.js    (VERBOSE=1 lists everything)
const { execFileSync } = require('child_process');
const { start, login, BASE } = require('./helpers');

const PSQL = (process.env.PSQL || 'psql -h /var/run/postgresql clockme').split(' ');
const sql = (q) => execFileSync(PSQL[0], [...PSQL.slice(1), '-Atc', q]).toString().trim();
const ROLES = {
  'admin@example.com': ['/dashboard', '/timesheet', '/calendar', '/projects', '/clients', '/people', '/approvals', '/reports', '/reports?tab=detailed', '/reports?tab=weekly', '/import-export', '/settings', '/profile'],
  'aisha@example.com': ['/dashboard', '/timesheet', '/approvals', '/reports', '/people', '/projects'],
  'fatima@example.com': ['/dashboard', '/approvals', '/reports', '/people', '/clients'],
  'priya@example.com': ['/dashboard', '/timesheet', '/calendar', '/projects', '/profile'],
};
const MIN = 4.5; // WCAG AA for normal text; large text (18px, or 14px bold) only needs 3
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log((c ? 'ok   ' : 'FAIL ') + m); };

// Runs inside the page: the low-contrast text found, and the dropdown options that leave their colours to the browser.
function measure(min) {
  const parse = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const [r, g, b, a = 1] = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r, g, b, a }; };
  const over = (top, bot) => ({ r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1 });
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const page = parse(getComputedStyle(document.body).backgroundColor);
  const bodyBg = page && page.a > 0 ? page : { r: 255, g: 255, b: 255, a: 1 };
  const backdrop = (el) => { // the colour a text sits on: the nearest opaque backgrounds, blended
    const layers = [];
    let hasImage = false;
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage !== 'none' && !/^url\("data:image\/svg/.test(cs.backgroundImage)) hasImage = true;
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
    }
    let bg = layers.length && layers[layers.length - 1].a >= 1 ? layers.pop() : bodyBg;
    while (layers.length) bg = over(layers.pop(), bg);
    return { bg, hasImage };
  };
  const opacityOf = (el) => { let o = 1; for (let e = el; e; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity); return o; };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return false; }
    return true;
  };
  const name = (el) => el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
  const found = new Map();
  const test = (el, text, color) => {
    if (!text.trim() || !visible(el) || el.closest(':disabled, [aria-disabled="true"]')) return; // switched-off controls are meant to look faded
    const cs = getComputedStyle(el);
    const fgRaw = parse(color);
    if (!fgRaw || fgRaw.a === 0) return; // see-through text is a hidden hint (the + in an empty timesheet cell shows on hover)
    const { bg, hasImage } = backdrop(el);
    if (hasImage) return; // gradients and pictures: judged by eye
    const fg = over({ ...fgRaw, a: fgRaw.a * opacityOf(el) }, bg);
    const big = parseFloat(cs.fontSize) >= 18 || (parseFloat(cs.fontSize) >= 14 && parseInt(cs.fontWeight, 10) >= 700);
    const r = ratio(fg, bg);
    if (r >= (big ? 3 : min)) return;
    const f = `rgb(${fg.r | 0},${fg.g | 0},${fg.b | 0})`;
    const key = name(el) + '|' + f;
    if (!found.has(key)) found.set(key, { el: name(el), text: text.trim().slice(0, 40), fg: f, bg: `rgb(${bg.r | 0},${bg.g | 0},${bg.b | 0})`, why: r.toFixed(2) + ':1', n: 0 });
    found.get(key).n++;
  };
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const el = n.parentElement;
    if (!el || /^(SCRIPT|STYLE|NOSCRIPT|OPTION|OPTGROUP|TEXTAREA)$/.test(el.tagName)) continue;
    const svgText = el.tagName === 'text' || el.tagName === 'tspan';
    if (el.closest('svg') && !svgText) continue;
    test(el, n.textContent, svgText ? getComputedStyle(el).fill : getComputedStyle(el).color);
  }
  for (const el of document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=file]), textarea, select')) {
    const cs = getComputedStyle(el);
    const val = el.tagName === 'SELECT' ? (el.selectedOptions[0] ? el.selectedOptions[0].textContent : '') : el.value;
    if (val) test(el, val, cs.color);
    if (el.placeholder && !el.value) { const ph = getComputedStyle(el, '::placeholder'); test(el, el.placeholder, ph.color); }
  }
  const optionProblems = new Map();
  for (const sel of document.querySelectorAll('select')) {
    for (const op of sel.querySelectorAll('option')) {
      const cs = getComputedStyle(op);
      const bg = parse(cs.backgroundColor), fg = parse(cs.color);
      const key = name(sel);
      if (!bg || bg.a < 1) { optionProblems.set(key + '|nobg', { sel: key, why: 'option has no background of its own (the browser picks white, whatever the text colour is)' }); continue; }
      if (op.disabled) continue;
      const r = ratio(over(fg, bg), bg);
      if (r < min) optionProblems.set(key + '|low', { sel: key, why: `option text ${r.toFixed(2)}:1 on its list` });
    }
  }
  return { text: [...found.values()], options: [...optionProblems.values()] };
}

const report = (label, res) => {
  const bad = res.text.length + res.options.length;
  ok(bad === 0, `${label}: ${res.text.length} low-contrast texts, ${res.options.length} dropdown problems`);
  if (process.env.VERBOSE || bad) {
    for (const x of res.text.slice(0, 12)) console.log(`       ${x.el} "${x.text}" ${x.fg} on ${x.bg} = ${x.why} (x${x.n})`);
    for (const x of res.options.slice(0, 6)) console.log(`       ${x.sel}: ${x.why}`);
  }
};
const merge = (a, b) => ({ text: [...a.text, ...b.text.filter((x) => !a.text.some((y) => y.el === x.el && y.fg === x.fg))], options: [...a.options, ...b.options.filter((x) => !a.options.some((y) => y.sel === x.sel && y.why === x.why))] });

// Opens each menu and each "New / Add / Invite" pop-up on the page in turn and measures it with it open.
async function withOverlays(p, path) {
  let all = { text: [], options: [] };
  const menus = await p.locator('[aria-haspopup="true"]:visible').count();
  for (let i = 0; i < Math.min(menus, 8); i++) {
    await p.goto(BASE + path, { waitUntil: 'networkidle' });
    const b = p.locator('[aria-haspopup="true"]:visible').nth(i);
    await b.click().catch(() => {});
    await p.waitForTimeout(150);
    all = merge(all, await p.evaluate(measure, MIN));
  }
  const adders = await p.locator('main button:visible, .pagehead button:visible').evaluateAll((els) => els.map((e, i) => [i, e.textContent.trim()]).filter(([, t]) => /^(\+ ?)?(New|Add|Invite|Create|Edit)\b/i.test(t)).map(([i]) => i));
  for (const i of adders.slice(0, 4)) {
    await p.goto(BASE + path, { waitUntil: 'networkidle' });
    await p.locator('main button:visible, .pagehead button:visible').nth(i).click().catch(() => {});
    await p.waitForTimeout(250);
    if (await p.locator('dialog[open], [role=dialog]').count()) all = merge(all, await p.evaluate(measure, MIN));
  }
  return all;
}

(async () => {
  const b = await start();
  const clientId = sql(`select id from "Client" where name <> 'Internal' order by name limit 1`);
  const token = 'contrastcheck' + 'x'.repeat(19);
  sql(`update "Client" set "shareToken"='${token}' where id='${clientId}' and "shareToken" is null`);
  try {
    for (const theme of ['light', 'dark']) {
      for (const [email, pages] of Object.entries(ROLES)) {
        const p = await login(b, email);
        await p.context().addCookies([{ name: 'tsink-theme', value: theme, url: BASE }]);
        for (const path of pages) {
          await p.goto(BASE + path, { waitUntil: 'networkidle' });
          const th = await p.evaluate(() => document.documentElement.dataset.theme);
          if (th !== theme) { ok(false, `${theme} ${email} ${path}: page is in the ${th} theme`); continue; }
          let res = await p.evaluate(measure, MIN);
          if (email === 'admin@example.com' || path === '/timesheet') res = merge(res, await withOverlays(p, path));
          report(`${theme} ${email.split('@')[0]} ${path}`, res);
        }
        if (email === 'admin@example.com') {
          await p.goto(`${BASE}/clients/${clientId}`, { waitUntil: 'networkidle' });
          report(`${theme} admin client page`, await p.evaluate(measure, MIN));
        }
        await p.context().close();
      }
      // Pages with no login, at desktop and phone width.
      for (const [label, vp] of [['desktop', { width: 1280, height: 900 }], ['phone', { width: 390, height: 800 }]]) {
        const ctx = await b.newContext({ viewport: vp });
        await ctx.addCookies([{ name: 'tsink-theme', value: theme, url: BASE }]);
        const p = await ctx.newPage();
        for (const path of ['/login', `/share/${token}`]) {
          await p.goto(BASE + path, { waitUntil: 'networkidle' });
          let res = await p.evaluate(measure, MIN);
          if (path.startsWith('/share')) res = merge(res, await withOverlays(p, path));
          report(`${theme} ${label} ${path.startsWith('/share') ? '/share/<token>' : path}`, res);
        }
        await ctx.close();
      }
      // Phone: the main pages as a team member and as an admin.
      for (const [email, pages] of [['priya@example.com', ['/dashboard', '/timesheet', '/projects']], ['admin@example.com', ['/reports', '/people', '/import-export']]]) {
        const ctx = await b.newContext({ viewport: { width: 390, height: 800 } });
        const p = await ctx.newPage();
        await p.goto(BASE + '/login'); await p.waitForLoadState('networkidle'); await p.fill('#email', email); await p.fill('#password', 'password123'); await p.click('button:has-text("Sign in")');
        await p.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 90000 });
        await ctx.addCookies([{ name: 'tsink-theme', value: theme, url: BASE }]);
        for (const path of pages) { await p.goto(BASE + path, { waitUntil: 'networkidle' }); report(`${theme} phone ${email.split('@')[0]} ${path}`, await p.evaluate(measure, MIN)); }
        await ctx.close();
      }
    }
  } catch (e) { console.log('ERR', e.message.slice(0, 600)); fails++; }
  finally { sql(`update "Client" set "shareToken"=null where "shareToken"='${token}'`); await b.close(); }
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})();
