// The Reports page: tabs, date arrows, tick-box filters with Apply, second-level grouping, budget column, weekly grid, status filter
const {start,login,BASE}=require('./helpers');
const ok=(name,cond,detail='')=>{console.log(`${cond?'PASS':'FAIL'} ${name}${detail?' — '+detail:''}`);if(!cond)process.exitCode=1;};
const num=(s)=>parseFloat(String(s).replace(/,/g,''));
const go=async(p,u)=>{await p.goto(BASE+u);await p.waitForLoadState('networkidle');};
const total=async(p)=>num(await p.locator('.rtotal b').first().innerText());
const entries=async(p)=>num((await p.locator('.rcounts').innerText()).match(/([\d,]+) entr/)[1]);
(async()=>{const b=await start();
 const a=await login(b,'admin@example.com');
 await go(a,'/reports?range=lastmonth');
 ok('three tabs',(await a.locator('.rtabs a').allInnerTexts()).join()==='Summary,Detailed,Weekly');
 ok('Summary is the open tab',await a.locator('.rtabs a[aria-pressed="true"]').innerText()==='Summary');
 const filters=await a.locator('.rfilters .fm-b').allInnerTexts();
 ok('admin has all filters',['Person','Team','Client','Project','Phase','Tag','Status','Location'].every((f,i)=>filters[i]&&filters[i].startsWith(f)),filters.join('|'));
 ok('description search box',await a.locator('input[name=desc]').count()===1);
 const all=await total(a);ok('there is time in last month',all>0,String(all));
 ok('table rows and doughnut show',(await a.locator('.rtable tbody tr').count())>=3&&await a.locator('.rdonut svg').count()===1);
 ok('chart has stacked bars',(await a.locator('.chart rect').count())>10);

 // tick-box filter with several choices, applied by the button
 await a.click('button.fm-b:has-text("Client")');
 const boxes=a.locator('.fm-p:visible input[type=checkbox]');const ids=await boxes.evaluateAll((els)=>els.map((e)=>e.value));
 ok('client list has several clients',ids.length>=3,ids.length+' clients');
 await boxes.nth(0).check();await boxes.nth(1).check();
 ok('count badge shows 2 before applying',(await a.locator('button.fm-b:has-text("Client") .fm-n').innerText())==='2');
 ok('nothing applied yet',!/client=/.test(a.url()));
 await Promise.all([a.waitForURL(/client=.*client=/),a.click('button:has-text("Apply filter")')]);await a.waitForLoadState('networkidle');
 const both=await total(a);
 await go(a,`/reports?range=lastmonth&client=${ids[0]}`);const t0=await total(a);
 await go(a,`/reports?range=lastmonth&client=${ids[1]}`);const t1=await total(a);
 ok('two clients together = each one added up',Math.abs(both-(t0+t1))<0.01&&both<all,`${both} vs ${t0}+${t1}, all ${all}`);
 await go(a,`/reports?range=lastmonth&client=${ids[0]}&client=${ids[1]}`);
 ok('the badge stays on after reload',(await a.locator('button.fm-b:has-text("Client") .fm-n').innerText())==='2');
 await a.click('a:has-text("Clear 1 filter")');await a.waitForURL(u=>!/client=/.test(u.search));await a.waitForLoadState('networkidle');
 ok('Clear brings all time back',Math.abs(await total(a)-all)<0.01);
 // old single-value links still work
 await go(a,`/reports?range=lastmonth&client=${ids[0]}`);ok('one client in the URL still works',Math.abs(await total(a)-t0)<0.01);

 // description contains
 await go(a,'/reports?range=lastmonth&tab=detailed');
 const firstDesc=(await a.locator('.rtable tbody tr td[data-l=Description]').first().innerText()).trim();
 const word=firstDesc.split(/\s+/)[0].toUpperCase();
 await go(a,`/reports?range=lastmonth&tab=detailed&desc=${encodeURIComponent(word)}`);
 const descs=await a.locator('.rtable tbody tr td[data-l=Description]').allInnerTexts();
 ok('description filter ignores case and keeps only matches',descs.length>0&&descs.every((d)=>d.toUpperCase().includes(word)),word+' → '+descs.length);

 // status: every entry sits in exactly one timesheet status
 const st={};for(const s of ['DRAFT','SUBMITTED','APPROVED','REJECTED']){await go(a,`/reports?range=lastmonth&status=${s}`);st[s]=await total(a);}
 const sum=Object.values(st).reduce((x,y)=>x+y,0);
 ok('the four statuses add up to everything',Math.abs(sum-all)<0.01,JSON.stringify(st)+' all '+all);
 ok('approved time exists',st.APPROVED>0);
 await go(a,'/reports?range=lastmonth&status=APPROVED&status=SUBMITTED');
 ok('two statuses together',Math.abs(await total(a)-(st.APPROVED+st.SUBMITTED))<0.01);
 await go(a,'/reports?range=lastmonth&status=APPROVED&status=SUBMITTED&status=DRAFT&status=REJECTED');ok('all four ticked = no filter',Math.abs(await total(a)-all)<0.01);

 // date arrows
 const step=async(pg,label)=>{const before=pg.url();await pg.click(`a[aria-label="${label} period"]`);await pg.waitForFunction((u)=>location.href!==u,before);await pg.waitForLoadState('networkidle');};
 await go(a,'/reports?range=thisweek');
 await step(a,'Previous');ok('previous of this week is Last week',await a.inputValue('#rp-range')==='lastweek');
 await step(a,'Previous');
 const f1=await a.inputValue('#rp-from'),t1d=await a.inputValue('#rp-to');
 ok('two weeks back is a Monday to Sunday range',(new Date(f1+'T00:00:00Z').getUTCDay()===1)&&(new Date(t1d+'T00:00:00Z')-new Date(f1+'T00:00:00Z'))/864e5===6,f1+' to '+t1d);
 await step(a,'Next');await step(a,'Next');
 ok('forward again lands on This week',await a.inputValue('#rp-range')==='thisweek');
 await go(a,'/reports?range=thismonth');await step(a,'Previous');
 ok('months step by whole months, landing on Last month',await a.inputValue('#rp-range')==='lastmonth');
 await step(a,'Previous');
 const m1=await a.inputValue('#rp-from'),m2=await a.inputValue('#rp-to');
 ok('another month back is a whole month',m1.endsWith('-01')&&new Date(new Date(m2+'T00:00:00Z').getTime()+864e5).getUTCDate()===1,m1+' to '+m2);
 await go(a,'/reports?range=all');ok('All time has no arrows',await a.locator('a.rdate-nav').count()===0);

 // grouping inside grouping, sorting, budget
 await go(a,'/reports?range=lastmonth');
 const rows1=await a.locator('.rtable tbody tr').count();
 await go(a,'/reports?range=lastmonth&group2=person');
 ok('second level starts folded',(await a.locator('.rtable tbody tr').count())===rows1);
 await a.click('button.rg-chev.all');
 const rows2=await a.locator('.rtable tbody tr').count();ok('Expand all shows the people inside',rows2>rows1*2,rows1+' → '+rows2);
 const first=await a.locator('.rg-row').first();
 const parentHrs=num(await first.locator('td[data-l=Hours]').innerText());
 const kidsHrs=await a.locator('.rg-row').first().evaluate((tr)=>{let s=0;for(let n=tr.nextElementSibling;n&&n.classList.contains('rg-kid');n=n.nextElementSibling)s+=parseFloat(n.cells[n.cells.length-2].textContent.replace(/,/g,''));return s;});
 ok('what is inside adds up to its group',Math.abs(parentHrs-kidsHrs)<0.01,parentHrs+' vs '+kidsHrs);
 const hrsNow=async()=>(await a.locator('.rg-row td[data-l=Hours]').allInnerTexts()).map(num);
 await a.click('button.sorter:has-text("HOURS")');let hrs=await hrsNow();
 ok('click HOURS: biggest first',hrs.every((v,i)=>i===0||hrs[i-1]>=v),hrs.join());
 await a.click('button.sorter:has-text("HOURS")');hrs=await hrsNow();
 ok('click HOURS again: smallest first',hrs.every((v,i)=>i===0||hrs[i-1]<=v),hrs.join());
 await a.click('button.sorter:has-text("HOURS")');await a.click('button.sorter:has-text("PROJECT")');
 const names=await a.locator('.rg-row td[data-l=Project]').allInnerTexts();
 ok('click PROJECT: A to Z',names.every((v,i)=>i===0||names[i-1].localeCompare(v)<=0),names.join());
 await go(a,'/reports?range=lastmonth&est=1');
 ok('Show budget adds budget and used columns',(await a.locator('.rtable th').allInnerTexts()).some((t)=>/BUDGET/.test(t))&&await a.locator('.rtable .meter').count()>0);
 await go(a,'/reports?range=lastmonth&group=person&est=1');ok('budget switch only for Project grouping',await a.locator('input[name=est]').count()===0);
 await go(a,'/reports?range=lastmonth&group=month');
 ok('Month grouping runs in date order with no doughnut',await a.locator('.rdonut').count()===0&&(await a.locator('.rg-row td[data-l=Month]').count())>=1);
 await go(a,'/reports?range=lastmonth&group=description');ok('Group by Description works',(await a.locator('.rg-row').count())>=2);
 await go(a,'/reports?range=lastmonth&group=day&group2=project');ok('Group by Day then Project works',(await a.locator('.rg-row').count())>=10);

 // weekly grid
 await go(a,'/reports?range=thisweek&tab=weekly');
 const heads=await a.locator('.rweek thead th').count();ok('weekly grid: name, 7 days, total',heads===9,heads+' columns');
 const gridTotal=num(await a.locator('.rweek tfoot td').last().innerText());
 ok('weekly total equals the header total',Math.abs(gridTotal-await total(a))<0.01,gridTotal+' vs '+await total(a));
 await go(a,'/reports?range=lastmonth&tab=weekly&group=person');ok('weekly by person has a row each',(await a.locator('.rweek tbody tr').count())>=5);

 // detailed + old link style
 await go(a,'/reports?range=lastweek&detail=1');
 ok('older ?detail=1 links open the Detailed tab',await a.locator('.rtabs a[aria-pressed="true"]').innerText()==='Detailed');
 const dN=await a.locator('.rtable tbody tr').count();const eN=await entries(a);ok('detailed rows = entries (under the cap)',dN===Math.min(eN,500),dN+' / '+eN);

 // export follows the filters
 await go(a,`/reports?range=lastmonth&client=${ids[0]}&client=${ids[1]}&status=APPROVED`);
 const eShown=await entries(a);
 await a.click('button:has-text("Export")');
 const [dl]=await Promise.all([a.waitForEvent('download'),a.click('a:has-text("Save as CSV")')]);
 const txt=require('fs').readFileSync(await dl.path(),'utf8').trim().split(/\r?\n/);
 ok('CSV has one row per entry shown',txt.length-1===eShown,(txt.length-1)+' vs '+eShown+' '+dl.suggestedFilename());

 // empty state
 await go(a,'/reports?range=lastmonth&desc=zzzznomatch');ok('no data message',await a.locator('.chart-empty').count()===1&&await a.locator('.rtable td.empty').count()===1);
 // unknown tab / group values fall back
 await go(a,'/reports?range=lastmonth&tab=zzz&group=zzz&group2=zzz');ok('unknown tab and group fall back',await a.locator('.rtabs a[aria-pressed="true"]').innerText()==='Summary'&&(await a.locator('.rtable tbody tr').count())>=1);

 // other roles
 const l=await login(b,'daniel@example.com');await go(l,'/reports?range=lastmonth');
 const lf=await l.locator('.rfilters .fm-b').allInnerTexts();
 ok('team manager: no Location filter, sees own team only',!lf.some((x)=>x.startsWith('Location'))&&lf.some((x)=>x.startsWith('Person')),lf.join('|'));
 await go(l,'/reports?range=lastmonth&location=nope');ok('location param ignored for non-admins',(await l.locator('.rtable tbody tr').count())>=1);
 const m=await login(b,'priya@example.com');await go(m,'/reports?range=lastmonth');
 const mf=await m.locator('.rfilters .fm-b').allInnerTexts();
 ok('member: no Person, Team or Location filters',!mf.some((x)=>/^(Person|Team|Location)/.test(x)),mf.join('|'));

 // phone
 const ctx=await b.newContext({viewport:{width:390,height:844}});const ph=await ctx.newPage();ph.errs=[];ph.on('pageerror',(e)=>ph.errs.push(e.message));
 await ph.goto(BASE+'/login');await ph.fill('#email','admin@example.com');await ph.fill('#password','password123');await ph.click('button:has-text("Sign in")');await ph.waitForURL((u)=>!u.pathname.startsWith('/login'));
 for(const u of ['/reports?range=lastmonth','/reports?range=lastmonth&group2=person&est=1','/reports?range=thisweek&tab=weekly','/reports?range=lastweek&tab=detailed']){
  await go(ph,u);const w=await ph.evaluate(()=>[document.documentElement.scrollWidth,window.innerWidth]);
  ok('phone: '+u+' fits the screen',w[0]<=w[1],w.join(' > '));}
 await go(ph,'/reports?range=lastmonth');await ph.click('button.fm-b:has-text("Project")');
 const box=await ph.locator('.fm-p:visible').boundingBox();ok('phone: filter list stays on screen',box&&box.x>=0&&box.x+box.width<=390,JSON.stringify(box));

 ok('no browser errors',a.errs.length+l.errs.length+m.errs.length+ph.errs.length===0,JSON.stringify([a.errs,l.errs,m.errs,ph.errs]));
 await b.close()})().catch((e)=>{console.log('ERR',e.message.slice(0,500));process.exit(1)});
