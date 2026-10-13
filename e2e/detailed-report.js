// The Detailed report: four columns (Time entry, User, Time, Duration), and the Ignore phases switch that reports each project as one
const {start,login,BASE}=require('./helpers');
const ok=(name,cond,detail='')=>{console.log(`${cond?'PASS':'FAIL'} ${name}${detail?' — '+detail:''}`);if(!cond)process.exitCode=1;};
const num=(s)=>{const t=String(s).replace(/,/g,'').trim();const m=/^(\d+):(\d\d)$/.exec(t);return m?Number(m[1])+Number(m[2])/60:parseFloat(t);};
const go=async(p,u)=>{await p.goto(BASE+u);await p.waitForLoadState('networkidle');};
const total=async(p)=>num(await p.locator('.rtotal b').first().innerText());
const heads=async(p)=>(await p.locator('.rtable thead th').allInnerTexts()).map((t)=>t.trim()).join(' | ');
const switchOn=(p)=>p.getByRole('switch',{name:'Ignore phases'}).isChecked();
(async()=>{const b=await start();
 const a=await login(b,'admin@example.com');
 await go(a,'/reports?range=lastmonth&tab=detailed');
 ok('four columns: Time entry, User, Time, Duration',(await heads(a))==='Time entry | User | Time | Duration',await heads(a));
 const row=a.locator('.rtable tbody tr').first();
 const te=row.locator('td[data-l="Time entry"]');
 ok('a row shows its description',(await te.locator('.rdesc').count())===1&&(await te.locator('.rdesc').innerText()).trim().length>0);
 ok('a row shows its project line with a colour dot',(await te.locator('.rmeta .dot').count())===1&&(await te.locator('.rmeta').first().innerText()).trim().length>0,(await te.locator('.rmeta').first().innerText()).trim());
 const time=(await row.locator('td[data-l=Time]').innerText()).trim();
 ok('a row shows its time range, with the date under it',/^\d{2}:\d{2} – \d{2}:\d{2}/.test(time)&&/[A-Z][a-z]{2} \d{1,2}, \d{4}/.test(time),time.replace(/\s+/g,' '));
 ok('a row shows its duration',/^\d[\d,.:]*/.test((await row.locator('td[data-l=Duration]').innerText()).trim()));
 const withPhases=await a.locator('.rtable tbody .rphase').count();
 ok('phases show on the entries that have one',withPhases>0,withPhases+' labels');
 const before=await total(a);

 // the switch sits under the report header on the Detailed tab, and turning it on keeps the total and drops the phase labels
 ok('the switch sits right under the report header',await a.locator('.rhead + .rnophase input[role=switch]').count()===1);
 await Promise.all([a.waitForURL(/nophase=1/),a.click('label.tog:has-text("Ignore phases")')]);await a.waitForLoadState('networkidle');
 ok('the switch puts nophase=1 in the URL',/[?&]nophase=1(&|$)/.test(a.url()),a.url());
 ok('the switch is on',await switchOn(a));
 ok('no phase labels in the rows',await a.locator('.rtable tbody .rphase').count()===0);
 ok('the four columns are still there',(await heads(a))==='Time entry | User | Time | Duration');
 ok('the total does not change',Math.abs((await total(a))-before)<0.01,before+' → '+(await total(a)));

 // the Group by menu sits on the Summary tab, which keeps the switch
 await Promise.all([a.waitForURL((u)=>!/tab=detailed/.test(u.search)),a.click('.rtabs a:has-text("Summary")')]);await a.waitForLoadState('networkidle');
 ok('the switch stays on in Summary',/nophase=1/.test(a.url())&&await switchOn(a));
 const groupOpts=(await a.locator('#rp-group option').allInnerTexts()).map((t)=>t.trim());
 ok('Group by has no Phase choice',!groupOpts.includes('Phase')&&groupOpts.includes('Project'),groupOpts.join(', '));
 const thenOpts=(await a.locator('#rp-group2 option').allInnerTexts()).map((t)=>t.trim());
 ok('then by has no Phase choice',!thenOpts.includes('Phase'),thenOpts.join(', '));
 ok('the Phase filter is still there',await a.locator('.rfilters .fm-b:has-text("Phase")').count()===1);
 ok('Summary rows still show with phases ignored',(await a.locator('.rtable tbody tr').count())>=1);
 await go(a,'/reports?range=lastmonth&nophase=1&group=phase');
 ok('a Phase group falls back to Project when phases are ignored',await a.inputValue('#rp-group')==='project');

 // turning the switch off brings the phases back
 await Promise.all([a.waitForURL((u)=>!/nophase=1/.test(u.search)),a.click('label.tog:has-text("Ignore phases")')]);await a.waitForLoadState('networkidle');
 ok('Group by has Phase again with the switch off',(await a.locator('#rp-group option').allInnerTexts()).some((t)=>t.trim()==='Phase'));
 await go(a,'/reports?range=lastmonth&tab=detailed');
 ok('phase labels come back with the switch off',await a.locator('.rtable tbody .rphase').count()===withPhases,withPhases+' labels');

 // phone: the columns stack under their names, with no sideways scroll
 const ctx=await b.newContext({viewport:{width:390,height:844}});const ph=await ctx.newPage();ph.errs=[];ph.on('pageerror',(e)=>ph.errs.push(e.message));
 await ph.goto(BASE+'/login');await ph.fill('#email','admin@example.com');await ph.fill('#password','password123');await ph.click('button:has-text("Sign in")');await ph.waitForURL((u)=>!u.pathname.startsWith('/login'));
 await go(ph,'/reports?range=lastmonth&tab=detailed');
 const w=await ph.evaluate(()=>[document.documentElement.scrollWidth,window.innerWidth]);
 ok('phone: the Detailed report fits the screen',w[0]<=w[1],w.join(' > '));
 ok('phone: the column names move onto each cell',!(await ph.locator('.rdetail thead').isVisible())&&(await ph.locator('.rdetail td[data-l=Duration]').first().isVisible()));

 ok('no browser errors',a.errs.length+ph.errs.length===0,JSON.stringify([a.errs,ph.errs]));
 await b.close()})().catch((e)=>{console.log('ERR',e.message.slice(0,500));process.exit(1)});
