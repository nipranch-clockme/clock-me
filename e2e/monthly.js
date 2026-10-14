// The monthly tables (contracted hours per client on Clients > Monthly contracts, expected hours per person on People > Monthly hours), a client's work types,
// and the Dashboard changes that came with them: the Inventory / Actual chart per office, the folding "Your numbers", the Top 5 without target hours,
// and admins left out of utilisation. Sets up its own clients, tags and people directly in the local database, and removes them again.
//   BASE=http://localhost:3500 PSQL="psql -h /var/run/postgresql tags_t" node e2e/monthly.js
const {execSync}=require('child_process');
const {start,login,BASE}=require('./helpers');
const PSQL=process.env.PSQL||'psql -h /tmp -U postgres clockme';
const sql=(q)=>execSync(`${PSQL} -v ON_ERROR_STOP=1 -At`,{input:q}).toString().trim();
const ok=(name,cond,detail='')=>{console.log(`${cond?'PASS':'FAIL'} ${name}${detail?' — '+detail:''}`);if(!cond)process.exitCode=1;};
const count=(q)=>+sql(q);

(async()=>{
 const b=await start();
 const t='mg'+process.pid;
 const C1=t+'c1', C2=t+'c2', TA=t+'ta', TB=t+'tb', M=t+'m', LM2=t+'l', OM=t+'o', KA=t+'a';
 const N1=`E2E Contract ${t}`, N2=`E2E Floating ${t}`, WA=`WA${t}`, WB=`WB${t}`;
 const ALLU=[M,LM2,OM,KA];
 const tom=sql(`select "locationId"||'|'||"teamId"||'|'||"passwordHash" from "User" where email='tom@example.com'`).split('|');
 const KLH=tom[0], FLASH=tom[1], hash=tom[2];
 const daniel=sql(`select "locationId"||'|'||"teamId" from "User" where email='daniel@example.com'`).split('|');
 const RAVI=sql(`select id from "User" where email='ravi@example.com'`);
 const tz=sql(`select "timeZone" from "Settings"`), format=sql(`select "timeFormat" from "Settings"`);
 const today=sql(`select to_char(now() at time zone '${tz}','YYYY-MM-DD')`);
 const y=+today.slice(0,4), mi=+today.slice(5,7)-1, ym=today.slice(0,7);
 const ymAt=(i)=>`${y}-${String(i+1).padStart(2,'0')}`;
 const other=mi<11?mi+1:0;                       // another month to change
 const third=[0,1,2,3,4,5,6,7,8,9,10,11].find((i)=>i!==mi&&i!==other);
 const f=(m)=>format==='hhmm'?`${Math.floor(Math.round(m)/60)}:${String(Math.round(m)%60).padStart(2,'0')}`:(m/60).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
 const lastFull=(()=>{const d=new Date(Date.UTC(y,mi-1,1));return d.toISOString().slice(0,7);})();
 const [pa,xa]=sql(`select p.id||'|'||ph.id from "Project" p join "Phase" ph on ph."projectId"=p.id where p.access='PUBLIC' and not p.archived and ph.sort<999 order by p.name, ph.sort limit 1`).split('|');
 const workdaysIn=(m)=>{const [yy,mm]=m.split('-').map(Number);let n=0;for(let d=new Date(Date.UTC(yy,mm-1,1));d.getUTCMonth()===mm-1;d.setUTCDate(d.getUTCDate()+1)){const w=(d.getUTCDay()+6)%7;if(w<5)n++;}return n;};
 // what a client's contract is in a month, straight from the database
 const eff=(id,m)=>+sql(`select coalesce((select hours from "ClientMonth" where "clientId"='${id}' and month='${m}-01'),(select case when type='FIXED' then coalesce("monthlyHours",0) else 0 end from "Client" where id='${id}'),0)`);
 const insU=(uid,name,role,loc,team,target=40)=>sql(`insert into "User"(id,email,name,"passwordHash",role,"locationId","teamId","weeklyTarget","createdAt") values('${uid}','${uid}@example.com','${name}','${hash}','${role}','${loc}',${team?`'${team}'`:'null'},${target},now()-interval '300 days')`);
 const entry=(uid,n,d,minutes)=>sql(`insert into "TimeEntry"(id,"userId","projectId","phaseId","tagIds",date,"startMin",minutes,description,custom,"createdAt") values('${uid}e${n}','${uid}','${pa}','${xa}','{}','${d}',540,${minutes},'work','{}',now())`);
 const watched={};let expecting=null;
 const watch=(page)=>page.on('request',(r)=>{const a=r.headers()['next-action'];if(a&&r.method()==='POST'&&expecting&&!watched[expecting])watched[expecting]=a;});
 const cap=async(name,fn)=>{expecting=name;try{await fn();}finally{expecting=null;}};
 const act=(page,url,name,fields)=>page.evaluate(async({url,action,fields})=>{const fd=new FormData();for(const [k,v] of Object.entries(fields)){if(Array.isArray(v))v.forEach((x)=>fd.append('_1_'+k,x));else fd.append('_1_'+k,v);}fd.append('0','[null,"$K1"]');
  const r=await fetch(url,{method:'POST',headers:{'next-action':action,accept:'text/x-component'},body:fd});return {status:r.status,text:await r.text()};},{url:BASE+url,action:watched[name],fields});
 const refused=(r,sub)=>/"ok":false/.test(r.text)&&(!sub||new RegExp(sub).test(r.text));
// The refusal reads the same whether the person is in another office or an admin, so nobody can tell who exists there.
const GENERIC="isn't in your list|can't change the hours";
 const go=async(p,path)=>{await p.goto(BASE+path);await p.waitForLoadState('networkidle');};
 const saved=async(p,text)=>{await p.waitForFunction((x)=>[...document.querySelectorAll('.mg-save .note[role="status"]')].some((n)=>n.textContent.includes(x)),text,{timeout:20000}).catch(()=>{});};
 const pages=[];
 const signIn=async(email)=>{const p=await login(b,email);watch(p);p.dialogs=[];p.dialogMode='accept';p.on('dialog',async(d)=>{p.dialogs.push(d.message());try{if(p.dialogMode==='dismiss')await d.dismiss();else await d.accept();}catch(e){}});pages.push(p);return p;};
 const inp=(id,i)=>`input[data-cell="m|${id}|${ymAt(i)}"]`;
 const unlockPast=async(p)=>{const btn=p.locator('.mg-save button:has-text("Change past months")');if(!(await btn.count()))return;await btn.click();await p.waitForSelector('.mg-save :text("Past months are unlocked")');};
 const overview=async(p,range,name)=>{await go(p,`/dashboard?tab=clients&crange=${range}`);return p.locator(`tr:has(a:text-is("${name}")) td`).allInnerTexts();};
 try{
  // ---- setup
  sql(`insert into "Tag"(id,name) values('${TA}','${WA}'),('${TB}','${WB}')`);
  sql(`insert into "Client"(id,name,color,type,"monthlyHours","teamId",status) values('${C1}','${N1}','s1','FIXED',10,'${FLASH}','CONTRACTED'),('${C2}','${N2}','s2','FLOATING',null,null,'PROJECT_BASED')`);
  insU(M,'Mg Member','MEMBER',KLH,FLASH);
  insU(LM2,'Mg Manager','LOCATION',KLH,null);
  insU(OM,'Mg Other','MEMBER',daniel[0],daniel[1]);
  insU(KA,'Mg Admin','ADMIN',KLH,null);
  const lastDay=sql(`select (date_trunc('month', date '${lastFull}-01') + interval '9 days')::date`);
  for(let i=0;i<3;i++)entry(M,i,lastDay,120);        // 6 h by the member last full month
  entry(KA,0,lastDay,480);                            // 8 h by an admin, who must not count

  // ================= Monthly contracts =================
  const adm=await signIn('admin@example.com');
  await go(adm,'/clients?view=contracts');
  ok('contracts: the Clients page is the monthly table, with no view tabs (the client overview is on the Dashboard)',(await adm.locator('nav[aria-label="Clients view"]').count())===0&&(await adm.locator('td.cl a').count())>0);
  ok('contracts: the year picker offers last year, this year and next',(await adm.locator('#mg-year option').allInnerTexts()).join()===`${y-1},${y},${y+1}`&&await adm.inputValue('#mg-year')===String(y));
  ok('contracts: twelve boxes per client',await adm.locator(`tr:has(td.cl a:text-is("${N1}")) input.cell`).count()===12&&await adm.locator(`tr:has(td.cl a:text-is("${N2}")) input.cell`).count()===12);
  const vals=async(id)=>adm.$$eval(`input[data-cell^="m|${id}|"]`,(is)=>is.map((i)=>i.value));
  ok('contracts: the usual hours fill every month of a fixed client, and a no-commitment client is empty',(await vals(C1)).every((v)=>v==='10')&&(await vals(C2)).every((v)=>v===''));
  const rowOf=(name)=>adm.locator(`tr:has(td.cl a:text-is("${name}"))`);
  // cells: the client, twelve months, then Current Per day (the work type comes after it)
  ok('contracts: per day, with no year total and no per week column',(await rowOf(N1).locator('td.tot').count())===0&&(await rowOf(N1).locator('td').nth(1+12).innerText())===(10/workdaysIn(ym)).toLocaleString('en-US',{maximumFractionDigits:2})&&!(await adm.locator('table.mgrid thead').innerText()).includes('Year total')&&!(await adm.locator('table.mgrid thead').innerText()).includes('Per week'),(await rowOf(N1).innerText()).replace(/\s+/g,' ').slice(-60));
  ok('contracts: each client has its own status',await adm.inputValue(`select[aria-label="${N1} status"]`)==='CONTRACTED'&&await adm.inputValue(`select[aria-label="${N2} status"]`)==='PROJECT_BASED');
  ok('contracts: the current month is marked in the heading',(await adm.locator('th.now').innerText())===['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][mi]);
  ok('contracts: Save is off until something changes',await adm.locator('.mg-save button.primary').isDisabled());

  // change this month (the contract ends part-way: 6 h), next (ends: 0) and give the floating client a figure
  if(other<mi) await unlockPast(adm);
  await adm.fill(inp(C1,mi),'6');await adm.fill(inp(C1,other),'0');await adm.fill(inp(C2,mi),'20');
  ok('contracts: changed boxes turn blue and per day follows as you type',await adm.locator(inp(C1,mi)).evaluate((e)=>e.classList.contains('chg'))&&(await rowOf(N1).locator('td').nth(1+12).innerText())===(6/workdaysIn(ym)).toLocaleString('en-US',{maximumFractionDigits:2}));
  const numOf=(s)=>Number(s.replace(/,/g,''));
  const perDayAll=numOf(await adm.locator('table.mgrid tfoot td').nth(13).innerText()), monthAll=numOf(await adm.locator('table.mgrid tfoot td').nth(1+mi).innerText());
  ok('contracts: the All clients row shows per day as this month over its working days',perDayAll>0&&Math.abs(perDayAll*workdaysIn(ym)-monthAll)<0.2,`${perDayAll} x ${workdaysIn(ym)} vs ${monthAll}`);
  ok('contracts: Save is on, with a warning about leaving',await adm.locator('.mg-save button.primary').isEnabled()&&/unsaved/i.test(await adm.locator('.mg-save .note[role="status"]').innerText()));
  await cap('saveContracts',()=>adm.click('.mg-save button.primary'));await saved(adm,'Saved changes');
  ok('contracts: saved, with how many clients',/Saved changes for 2 clients/.test(await adm.locator('.mg-save .note[role="status"]').innerText()),await adm.locator('.mg-save .note[role="status"]').innerText());
  ok('contracts: only the months that differ from the usual hours are stored',count(`select count(*) from "ClientMonth" where "clientId"='${C1}'`)===2&&eff(C1,ymAt(mi))===6&&eff(C1,ymAt(other))===0&&count(`select count(*) from "ClientMonth" where "clientId"='${C2}'`)===1&&eff(C2,ymAt(mi))===20);
  ok('contracts: the change log has a line per client with what changed',count(`select count(*) from "AuditLog" where action like 'Changed contracted hours for client ${N1}, ${y}: %'`)===1&&count(`select count(*) from "AuditLog" where action like 'Changed contracted hours for client ${N2}, ${y}: %'`)===1);
  await go(adm,'/clients?view=contracts');
  const v1=await vals(C1), v2=await vals(C2);
  ok('contracts: after a reload the boxes show what was saved',v1[mi]==='6'&&v1[other]==='0'&&v2[mi]==='20'&&v1.filter((v,i)=>i!==mi&&i!==other).every((v)=>v==='10'),v1.join());
  ok('contracts: the floating client keeps its own status',await adm.inputValue(`select[aria-label="${N2} status"]`)==='PROJECT_BASED');
  // past months are locked: both warnings are needed, a dismissed first one changes nothing, and a saved change locks them again
  if(mi>0){
    ok('past months: a past box is locked, the current one is open, and Change past months is offered',await adm.locator(inp(C1,0)).isDisabled()&&await adm.locator(inp(C1,mi)).isEnabled()&&await adm.locator('.mg-save button:has-text("Change past months")').count()===1);
    const seen=adm.dialogs.length;
    adm.dialogMode='dismiss';
    await adm.click('.mg-save button:has-text("Change past months")');await adm.waitForTimeout(400);
    adm.dialogMode='accept';
    ok('past months: dismissing the first warning changes nothing',adm.dialogs.length===seen+1&&adm.dialogs[seen].includes('Warning 1 of 2')&&await adm.locator(inp(C1,0)).isDisabled());
    await adm.click('.mg-save button:has-text("Change past months")');
    await adm.waitForSelector('.mg-save :text("Past months are unlocked")');
    ok('past months: both warnings, then they open',adm.dialogs.length===seen+3&&adm.dialogs[seen+1].includes('Warning 1 of 2')&&adm.dialogs[seen+2].includes('Warning 2 of 2')&&await adm.locator(inp(C1,0)).isEnabled());
    await adm.fill(inp(C1,0),'7');
    await cap('saveContracts',()=>adm.click('.mg-save button.primary'));await saved(adm,'Saved changes');
    ok('past months: the change is saved and logged as a past month',eff(C1,ymAt(0))===7&&count(`select count(*) from "AuditLog" where action like 'Changed contracted hours for client ${N1}, ${y}: %(a past month, after the warning)'`)===1);
    await adm.waitForSelector(`input[data-cell="m|${C1}|${ymAt(0)}"]:disabled`,{timeout:10000}).catch(()=>{});
    ok('past months: they lock again after the save',await adm.locator(inp(C1,0)).isDisabled());
    await unlockPast(adm);await adm.fill(inp(C1,0),'10');
    await cap('saveContracts',()=>adm.click('.mg-save button.primary'));await saved(adm,'Saved changes');
    ok('past months: the usual figure put back, so the month has no figure of its own',count(`select count(*) from "ClientMonth" where "clientId"='${C1}' and month='${ymAt(0)}-01'`)===0);
  }

  // the Clients overview works each month out from its own figure
  let c=await overview(adm,'thismonth',N1);
  ok('overview: this month uses that month\'s contract (6 h), not the usual 10 h',/Fixed/.test(c[1])&&c[3]===f(360),c.join(' | '));
  c=await overview(adm,'thismonth',N2);
  ok('overview: a client with a figure for the month counts as fixed that month',/Fixed/.test(c[1])&&c[3]===f(1200),c.join(' | '));
  c=await overview(adm,'thisyear',N1);
  let sum=0;for(let i=0;i<=mi;i++)sum+=eff(C1,ymAt(i));
  ok('overview: this year adds up each month\'s own figure',c[3]===f(sum*60),c.join(' | ')+' want '+f(sum*60));
  await go(adm,`/clients/${C1}?range=thisyear`);
  ok('client page: contracted hours add up each month\'s own figure',(await adm.locator('.stats').first().innerText()).includes(f(sum*60)),(await adm.locator('.stats').first().innerText()).replace(/\s+/g,' '));

  // typing the usual hours again removes the month's own figure; a blank box means no contract
  await go(adm,'/clients?view=contracts');
  if(third<mi) await unlockPast(adm);
  await adm.fill(inp(C1,mi),'10');await adm.fill(inp(C1,third),'');
  await cap('saveContracts',()=>adm.click('.mg-save button.primary'));await saved(adm,'Saved changes');
  ok('contracts: the usual figure removes that month\'s own one; blank is stored as 0',count(`select count(*) from "ClientMonth" where "clientId"='${C1}' and month='${ymAt(mi)}-01'`)===0&&count(`select hours from "ClientMonth" where "clientId"='${C1}' and month='${ymAt(third)}-01'`)===0&&count(`select count(*) from "ClientMonth" where "clientId"='${C1}'`)===2);
  await go(adm,'/clients?view=contracts'); // read what the server saved, not what was typed
  ok('contracts: a month with no contract shows 0 and the status stays Contracted',(await vals(C1))[third]==='0'&&await adm.inputValue(`select[aria-label="${N1} status"]`)==='CONTRACTED',`box ${JSON.stringify((await vals(C1)))}`);

  // work types
  await go(adm,'/clients?view=contracts');
  await rowOf(N1).locator('details.wtpick summary').click();
  await rowOf(N1).locator(`.tagpick-i:has-text("${WB}") input`).check();await rowOf(N1).locator(`.tagpick-i:has-text("${WA}") input`).check();
  ok('work types: the summary lists them in tag order',(await rowOf(N1).locator('details.wtpick summary').innerText())===`${WA} + ${WB}`);
  await cap('saveContracts',()=>adm.click('.mg-save button.primary'));await saved(adm,'Saved changes');
  ok('work types: saved on the client and in the change log',sql(`select array_to_string(array(select unnest("workTypeIds") order by 1),',') from "Client" where id='${C1}'`)===[TA,TB].sort().join(',')&&count(`select count(*) from "AuditLog" where action='Changed work types for client ${N1} to ${WA} + ${WB}'`)===1);
  await go(adm,'/clients?view=contracts');
  ok('work types: still there after a reload',(await rowOf(N1).locator('td.wt').innerText()).includes(`${WA} + ${WB}`));
  await go(adm,`/clients/${C1}`);
  ok('client page: says the work types',/Work types: WA.* \+ WB/.test(await adm.locator('.phd .sub').innerText()));
  await adm.click(`button[aria-label="Edit ${N1}"]`);await adm.waitForSelector('dialog[open]');
  ok('edit client: the work types are ticked',await adm.locator('dialog[open] input[name=workTypeIds]:checked').count()===2);
  await adm.locator(`dialog[open] .tagpick-i:has-text("${WB}") input`).uncheck();
  await adm.click('dialog[open] button:has-text("Save changes")');await adm.waitForSelector('dialog[open]',{state:'detached'});await adm.waitForLoadState('networkidle');
  ok('edit client: unticking one saves',sql(`select array_to_string("workTypeIds",',') from "Client" where id='${C1}'`)===TA);
  ok('edit client: the months with their own figures are kept',count(`select count(*) from "ClientMonth" where "clientId"='${C1}'`)===2);
  // removing the tag takes it off the client
  await go(adm,'/settings');
  const item=adm.locator(`.item:has-text("${WA}")`);
  adm.dialogMode='accept'; // the dialog recorder from sign-in accepts it
  await item.locator('button:has-text("Remove")').click();await adm.waitForTimeout(400);
  const confirmBtn=adm.locator('dialog[open] button:has-text("Remove")');if(await confirmBtn.count())await confirmBtn.first().click();
  await adm.waitForFunction((n)=>!document.body.innerText.includes(n),WA,{timeout:15000}).catch(()=>{});
  ok('work types: removing a tag takes it off the client',count(`select count(*) from "Tag" where id='${TA}'`)===0&&sql(`select cardinality("workTypeIds") from "Client" where id='${C1}'`)==='0');

  // ---- status, drawing standard and the location filter
  await go(adm,'/clients?view=contracts'); // the steps before left the admin on Settings
  // a status is a choice (Contracted, Project-based, Lost); rows run Contracted first, then Project-based, then Lost, each alphabetical
  const RANK={CONTRACTED:0,PROJECT_BASED:1,LOST:2};
  const orderRows=await adm.$$eval('table.mgrid tbody tr',(trs)=>trs.map((tr)=>({s:tr.querySelector('select[aria-label$=" status"]')?.value,n:tr.querySelector('td.cl a')?.textContent})));
  ok('status: rows run Contracted, then Project-based, then Lost, and alphabetical within each',orderRows.length>=2&&orderRows.every((x,i)=>i===0||RANK[orderRows[i-1].s]<RANK[x.s]||(RANK[orderRows[i-1].s]===RANK[x.s]&&orderRows[i-1].n.localeCompare(x.n)<=0)),orderRows.map((x)=>x.s).join(','));
  ok('status: the choices are Contracted, Project-based and Lost',(await adm.locator(`select[aria-label="${N2} status"] option`).allInnerTexts()).join()==='Contracted,Project-based,Lost');
  ok('drawing standard: the choices are Not set, AVDL, Modified AVDL and Proprietary',(await adm.locator(`select[aria-label="${N1} drawing standard"] option`).allInnerTexts()).join()==='Not set,AVDL,Modified AVDL,Proprietary');
  await rowOf(N1).locator('select[aria-label$=" drawing standard"]').selectOption('MODIFIED_AVDL');
  await rowOf(N2).locator('select[aria-label$=" status"]').selectOption('LOST');
  await cap('saveContracts',()=>adm.click('.mg-save button.primary'));await saved(adm,'Saved changes');
  ok('status and drawing standard: saved on the client',sql(`select "drawingStandard" from "Client" where id='${C1}'`)==='MODIFIED_AVDL'&&sql(`select status from "Client" where id='${C2}'`)==='LOST');
  ok('status and drawing standard: in the change log',count(`select count(*) from "AuditLog" where action='Changed drawing standard for client ${N1} to Modified AVDL'`)===1&&count(`select count(*) from "AuditLog" where action='Changed status for client ${N2} to Lost'`)===1);
  await go(adm,'/clients?view=contracts');
  ok('status: a lost client shows its name in red, and the choices are kept after a reload',((await adm.locator(`tr:has(td.cl a:text-is("${N2}")) td.cl a`).getAttribute('class'))||'').includes('t-bad')&&await adm.inputValue(`select[aria-label="${N2} status"]`)==='LOST'&&await adm.inputValue(`select[aria-label="${N1} drawing standard"]`)==='MODIFIED_AVDL');
  const placeName=sql(`select l.name from "Team" t join "Location" l on l.id=t."locationId" where t.id='${FLASH}'`);
  await adm.click(`.seg button:text-is("${placeName}")`);
  ok('location filter: the chosen location is pressed, and only its clients show',(await adm.getAttribute(`.seg button:text-is("${placeName}")`,'aria-pressed'))==='true'&&await adm.locator(`tr:has(td.cl a:text-is("${N1}")):not(.out)`).count()===1&&await adm.locator(`tr:has(td.cl a:text-is("${N2}")):not(.out)`).count()===0,placeName);
  const visibleMonth=(i)=>adm.evaluate((k)=>[...document.querySelectorAll('table.mgrid tbody tr:not(.out)')].reduce((a,tr)=>{const c=tr.querySelectorAll('td.mc')[k];const el=c&&c.querySelector('input');return a+(Number(el?el.value:(c?c.textContent:''))||0);},0),i);
  const footerMonth=(i)=>adm.evaluate((k)=>Number(document.querySelectorAll('table.mgrid tfoot td')[1+k].textContent.replace(/,/g,'')),i);
  ok('location filter: the total says the location and adds up its clients only',(await adm.locator('tfoot td.tl').innerText())===`${placeName} total`&&Math.abs((await footerMonth(mi))-(await visibleMonth(mi)))<0.01,`${await footerMonth(mi)} vs ${await visibleMonth(mi)}`);
  await adm.click('.seg button:text-is("All offices")');
  ok('location filter: All offices shows everyone again, with the company total',(await adm.locator('table.mgrid tbody tr:not(.out)').count())===(await adm.locator('table.mgrid tbody tr').count())&&(await adm.locator('tfoot td.tl').innerText())==='All clients');
  let r=await act(adm,'/clients','saveContracts',{year:String(y),[`st|${C2}`]:'BOGUS'});
  ok('status: a status that is not on the list is refused',refused(r,'choose a status'));
  r=await act(adm,'/clients','saveContracts',{year:String(y),[`dr|${C2}`]:'NOPE'});
  ok('drawing standard: one that is not on the list is refused',refused(r,'choose a drawing standard'));

  // ---- crafted calls
  const snap=()=>sql(`select string_agg("clientId"||month||hours,',' order by "clientId",month) from "ClientMonth" where "clientId" in ('${C1}','${C2}')`);
  const before=snap();
  r=await act(adm,'/clients','saveContracts',{year:String(y),[`m|${C1}|${ymAt(mi)}`]:'-5',[`m|${C2}|${ymAt(other)}`]:'7'});
  ok('crafted: a negative figure is refused and nothing else in the same save is kept',refused(r,'0 to')&&snap()===before,r.text.slice(-140));
  r=await act(adm,'/clients','saveContracts',{year:String(y),[`m|${C1}|${ymAt(mi)}`]:'abc'});
  ok('crafted: text instead of a number is refused',refused(r,'0 to')&&snap()===before);
  r=await act(adm,'/clients','saveContracts',{year:String(y),[`m|${C1}|${ymAt(mi)}`]:'100001'});
  ok('crafted: more than the ceiling is refused',refused(r,'0 to')&&snap()===before);
  if(mi>0){r=await act(adm,'/clients','saveContracts',{year:String(y),[`m|${C1}|${ymAt(0)}`]:'5'});ok('past months: the server refuses a change to a past month without the confirmation',refused(r,'past months are locked')&&snap()===before,r.text.slice(-140));}
  r=await act(adm,'/clients','saveContracts',{year:String(y),[`w|${C1}`]:['','nosuchtag']});
  ok('crafted: a work type that is not a tag is refused',refused(r,'work types')&&sql(`select cardinality("workTypeIds") from "Client" where id='${C1}'`)==='0');
  r=await act(adm,'/clients','saveContracts',{year:String(y),[`m|nosuchclient|${ymAt(mi)}`]:'5'});
  ok('crafted: a client that does not exist is refused',refused(r,'no longer exists'));
  r=await act(adm,'/clients','saveContracts',{year:String(y),[`m|${C2}|${y+5}-03`]:'9',[`m|${C2}|junk`]:'9'});
  ok('crafted: months outside the year are ignored',snap()===before&&/"ok":true/.test(r.text));
  r=await act(adm,'/clients','saveContracts',{year:'1999',[`m|${C2}|1999-03`]:'9'});
  ok('crafted: a year the table does not offer falls back to this year and stores nothing for 1999',snap()===before);

  // ---- a location manager sees it, but cannot change it
  const rav=await signIn('ravi@example.com');
  await go(rav,'/clients?view=contracts');
  ok('location manager: sees the table with the figures but no boxes and no Save',await rav.locator('table.mgrid').count()===1&&await rav.locator('table.mgrid input.cell').count()===0&&await rav.locator('.mg-save').count()===0&&(await rav.locator(`tr:has(td.cl a:text-is("${N1}"))`).innerText()).includes('10'));
  ok('location manager: is told admins change them',/Admins change these figures/.test(await rav.locator('.panel .note').last().innerText()));
  ok('location manager: has no Add client button',await rav.locator('button:has-text("Add client")').count()===0);
  r=await act(rav,'/clients','saveContracts',{year:String(y),[`m|${C2}|${ymAt(other)}`]:'7'});
  ok('location manager: a crafted save is refused',refused(r,'Only Admins can change contracts')&&snap()===before,r.text.slice(-120));
  const mem=await signIn('priya@example.com');
  r=await act(mem,'/dashboard','saveContracts',{year:String(y),[`m|${C2}|${ymAt(other)}`]:'7'});
  ok('team member: a crafted save changes nothing',snap()===before);

  // ================= Monthly hours =================
  await go(rav,'/people?view=hours');
  ok('hours: two views, this one is current',(await rav.locator('nav[aria-label="People view"] a').allInnerTexts()).join()==='People,Monthly hours'&&await rav.locator('nav[aria-label="People view"] a[aria-current=page]').innerText()==='Monthly hours');
  const rowP=(p,name)=>p.locator(`tr:has(td.cl a:text-is("${name}"))`);
  ok('hours: the manager changes people in their office',await rav.locator(`input[data-cell^="m|${M}|"]`).count()===12);
  const hp=[await rav.locator(`tr:has(a[href="/profile/${LM2}"])`).count(),await rav.locator(`input[data-cell^="m|${LM2}|"]`).count(),await rav.locator(`input[data-cell^="m|${RAVI}|"]`).count(),await rav.locator(`tr:has(a[href="/profile/${RAVI}"])`).count()];
  ok('hours: but not another location manager, nor themselves',hp[0]===1&&hp[1]===0&&hp[2]===0&&hp[3]===1,`rows and boxes ${hp.join(' ')}`);
  ok('hours: nobody from another office, and admins are not listed',await rowP(rav,'Mg Other').count()===0&&await rowP(rav,'Mg Admin').count()===0);
  ok('hours: the usual hours fill the boxes and the average is shown',(await rav.$$eval(`input[data-cell^="m|${M}|"]`,(is)=>is.map((i)=>i.value))).every((v)=>v==='40')&&(await rowP(rav,'Mg Member').locator('td.tot').innerText())==='40');
  await rav.fill(inp(M,mi),'20');
  ok('hours: the average follows as you type',(await rowP(rav,'Mg Member').locator('td.tot').innerText())===((11*40+20)/12).toLocaleString('en-US',{maximumFractionDigits:2}));
  await cap('saveHours',()=>rav.click('.mg-save button.primary'));await saved(rav,'Saved hours');
  ok('hours: saved, one stored month, and the change log names the person',/Saved hours for 1 person/.test(await rav.locator('.mg-save .note[role="status"]').innerText())&&count(`select count(*) from "UserMonth" where "userId"='${M}'`)===1&&+sql(`select "weeklyHours" from "UserMonth" where "userId"='${M}' and month='${ym}-01'`)===20&&count(`select count(*) from "AuditLog" where "userId"='${RAVI}' and "targetUserId"='${M}' and action like 'Changed expected hours per week for Mg Member, ${y}: %'`)===1);
  // the person's own dashboard divides by the month's figure
  const mp=await signIn(M+'@example.com');
  await go(mp,'/dashboard');
  const mbody=await mp.innerText('body');
  ok('the person\'s numbers use this month\'s hours (20 a week)',/20\.00 inventory hours a week/.test(mbody),mbody.match(/[\d.]+ inventory hours a week/)?.[0]);
  await go(rav,'/people?view=hours');
  ok('hours: after a reload the box shows 20',(await rav.inputValue(inp(M,mi)))==='20');
  await rav.fill(inp(M,mi),'40');await rav.fill(inp(M,other),'');
  await cap('saveHours',()=>rav.click('.mg-save button.primary'));await saved(rav,'Saved hours');
  ok('hours: the usual hours remove the month\'s own figure; blank is stored as 0 (nothing expected)',count(`select count(*) from "UserMonth" where "userId"='${M}' and month='${ym}-01'`)===0&&+sql(`select "weeklyHours" from "UserMonth" where "userId"='${M}' and month='${ymAt(other)}-01'`)===0);
  const snapH=()=>sql(`select coalesce(string_agg("userId"||month||"weeklyHours",',' order by "userId",month),'') from "UserMonth" where "userId" in (${ALLU.map((x)=>`'${x}'`).join(',')})`);
  const beforeH=snapH();
  r=await act(rav,'/people','saveHours',{year:String(y),[`m|${M}|${ymAt(mi)}`]:'81'});
  ok('crafted: more than 80 hours a week is refused',refused(r,'0 to 80')&&snapH()===beforeH,r.text.slice(-140));
  r=await act(rav,'/people','saveHours',{year:String(y),[`m|${M}|${ymAt(mi)}`]:'30',[`m|${LM2}|${ymAt(mi)}`]:'30'});
  ok('crafted: a manager cannot change another location manager, and nothing else in that save is kept',refused(r,GENERIC)&&snapH()===beforeH,r.text.slice(-140));
  r=await act(rav,'/people','saveHours',{year:String(y),[`m|${OM}|${ymAt(mi)}`]:'30'});
  ok('crafted: nor someone in another office',refused(r,GENERIC)&&snapH()===beforeH);
  r=await act(rav,'/people','saveHours',{year:String(y),[`m|${KA}|${ymAt(mi)}`]:'30'});
  ok('crafted: nor an admin',refused(r,GENERIC)&&snapH()===beforeH);
  r=await act(rav,'/people','saveHours',{year:String(y),[`m|${RAVI}|${ymAt(mi)}`]:'30'});
  ok('crafted: nor themselves',refused(r,GENERIC)&&snapH()===beforeH);
  r=await act(mp,'/dashboard','saveHours',{year:String(y),[`m|${M}|${ymAt(mi)}`]:'10'});
  ok('crafted: a team member cannot change their own hours',snapH()===beforeH);
  // admin
  await go(adm,'/people?view=hours');
  // admins and guests are not a resource, so the hours table leaves them out
  const listed=count(`select count(*) from "User" where active and role not in ('ADMIN','GUEST')`);
  ok('hours: the admin sees every office and every resource (not admins or guests)',await adm.locator('table.mgrid tbody tr').count()===listed&&await rowP(adm,'Mg Other').count()===1&&await rowP(adm,'Mg Admin').count()===0,`${await adm.locator('table.mgrid tbody tr').count()} vs ${listed}`);
  ok('hours: the admin can change a manager and another office',await adm.locator(`input[data-cell^="m|${LM2}|"]`).count()===12&&await adm.locator(`input[data-cell^="m|${OM}|"]`).count()===12);
  r=await act(adm,'/people','saveHours',{year:String(y),[`m|${KA}|${ymAt(mi)}`]:'30'});
  ok('crafted: even an admin cannot give an admin expected hours (not a resource)',refused(r,'not a resource')&&snapH()===beforeH,r.text.slice(-140));
  await adm.fill(inp(OM,mi),'30');
  await cap('saveHours',()=>adm.click('.mg-save button.primary'));await saved(adm,'Saved hours');
  ok('hours: the admin saved another office\'s figure',+sql(`select "weeklyHours" from "UserMonth" where "userId"='${OM}' and month='${ym}-01'`)===30);
  sql(`delete from "UserMonth" where "userId" in (${ALLU.map((x)=>`'${x}'`).join(',')})`);

  // ================= Dashboard =================
  await go(rav,'/dashboard');
  const inv=rav.locator('section.panel:has(h3:has-text("Inventory vs actual"))');
  ok('dashboard: the location manager has one Inventory vs actual chart for the office',await inv.count()===1&&(await inv.locator('.legend').innerText()).replace(/\s+/g,' ').trim()==='Actual Inventory'&&/KLH/.test(await inv.locator('h3').innerText()));
  const label=new Date(Date.UTC(+lastFull.slice(0,4),+lastFull.slice(5)-1,1)).toLocaleDateString('en-US',{month:'long',year:'numeric',timeZone:'UTC'});
  const pt=async(p,series,office)=>{const t=await p.locator(`section.panel:has(h3:has-text("Inventory vs actual")${office?`:has-text("${office}")`:''}) svg rect title`).allTextContents();const m=t.find((x)=>x.startsWith(`${series}, ${label}:`));return m?+m.split(': ')[1].replace(/[^\d.-]/g,''):null;};
  const loggedSql=`select coalesce(sum(e.minutes),0)/60.0 from "TimeEntry" e join "User" u on u.id=e."userId" where u."locationId"='${KLH}' and u.role<>'ADMIN' and u.active and u."passwordHash" is not null and (u."weeklyTarget">0 or exists(select 1 from "UserMonth" um where um."userId"=u.id and um."weeklyHours">0)) and to_char(e.date,'YYYY-MM')='${lastFull}'`;
  ok('dashboard: Actual for last month is what the office\'s people logged, an admin\'s time left out',(await pt(rav,'Actual'))===Math.round(+sql(loggedSql)),`${await pt(rav,'Actual')} vs ${Math.round(+sql(loggedSql))}`);
  // Inventory is each person's expected hours for the month: positive, and never more than a full month of their weekly hours (holidays and time off only take away)
  const invRav=await pt(rav,'Inventory'), fullMonth=Math.round(+sql(`select coalesce(sum(u."weeklyTarget"),0)*${workdaysIn(lastFull)}/5.0 from "User" u where u."locationId"='${KLH}' and u.role<>'ADMIN' and u.active and u."passwordHash" is not null`));
  ok('dashboard: Inventory for last month is the office\'s expected hours, at most a full month of weekly hours',invRav>0&&invRav<=fullMonth+1,`${invRav} vs at most ${fullMonth}`);
  const kpeople=async()=>rav.locator('section.panel:has(h3:has-text("KLH office")) .stat:has(span:text-is("people")) b').innerText();
  ok('dashboard: the office counts its people, not its admin',+(await kpeople())===count(`select count(*) from "User" where "locationId"='${KLH}' and role<>'ADMIN' and active and "passwordHash" is not null and ("weeklyTarget">0 or exists(select 1 from "UserMonth" um where um."userId"="User".id and um."weeklyHours">0))`),await kpeople());
  await go(adm,'/dashboard');
  const offices=count(`select count(distinct "locationId") from "User" where active and role<>'ADMIN' and "passwordHash" is not null and ("weeklyTarget">0 or exists(select 1 from "UserMonth" um where um."userId"="User".id and um."weeklyHours">0))`);
  ok('dashboard: the admin has one chart for each office',await adm.locator('section.panel:has(h3:has-text("Inventory vs actual"))').count()===offices&&offices>1,`${await adm.locator('section.panel:has(h3:has-text("Inventory vs actual"))').count()} vs ${offices}`);
  ok('dashboard: the admin\'s own chart for KLH matches the office manager\'s',(await pt(adm,'Inventory','KLH'))===invRav&&(await pt(adm,'Actual','KLH'))===(await pt(rav,'Actual')));
  ok('dashboard: an admin is not in the Top 5, the office cards or anywhere on the numbers',!(await adm.innerText('body')).includes('Mg Admin'));
  const dan=await signIn('daniel@example.com');
  await go(dan,'/dashboard');
  ok('dashboard: a Team/Project Manager has no Inventory chart',await dan.locator('h3:has-text("Inventory vs actual")').count()===0);
  await go(mem,'/dashboard');
  ok('dashboard: nor a team member',await mem.locator('h3:has-text("Inventory vs actual")').count()===0);

  // top 5 without target hours
  // the first table in a Top 5 panel is the top five; a location manager's panel also has the bottom five after it
  const heads=async(p)=>(await p.locator('section.panel:has(h3:has-text("Top 5")) .tablebox').first().locator('thead th').allInnerTexts()).map((x)=>x.trim());
  await go(rav,'/dashboard');
  ok('top 5: only Utilisation and Hours for a location manager',(await heads(rav)).join()==='#,Person,Utilisation,Hours',(await heads(rav)).join());
  await go(adm,'/dashboard');
  ok('top 5: only Utilisation and Hours (and Office) for an admin, in every table',(await adm.locator('section.panel:has(h3:has-text("Top 5")) thead').evaluateAll((ts)=>ts.map((t)=>t.innerText.replace(/\s+/g,' ').trim()))).every((x)=>!/target/i.test(x)&&/Utilisation/.test(x)&&/Hours/.test(x)));
  ok('top 5: the same rule on the sentence under the title says admins are left out',/[Aa]dmins \(who are not a resource\)/.test(await adm.locator('.phd .sub').innerText()));
  // bottom 5: for a location manager and for each office, under the top five, never repeating a name from it; never for the whole company
  // the # column holds the place; a row's Productivity and Hours cells are not places, so take the first cell only
  const names=async(p,title,k)=>p.locator(`section.panel:has(h3:has-text("${title}")) .tablebox`).nth(k).locator('tbody tr td:nth-child(2) a').allInnerTexts();
  const places=async(p,title,k)=>p.locator(`section.panel:has(h3:has-text("${title}")) .tablebox`).nth(k).locator('tbody tr td:first-child').allInnerTexts();
  const saysEveryone=async(p,title,k)=>(await p.locator(`section.panel:has(h3:has-text("${title}")) .tablebox`).nth(k).innerText()).includes('Everyone is in the top 5.');
  const lmTop=await names(rav,'Top 5 performers',0), lmBot=await names(rav,'Top 5 performers',1);
  // a location with five people or fewer has nobody left for the bottom five, and says so
  const everyone=await saysEveryone(rav,'Top 5 performers',1);
  const lmOk=everyone ? lmTop.length<=5 : lmTop.length===5&&lmBot.length>0&&(await places(rav,'Top 5 performers',1)).every((x)=>+x>5);
  ok('bottom 5: a location manager gets one after the top five, with the same columns and places after the top five',lmOk&&(everyone||(await rav.locator('section.panel:has(h3:has-text("Top 5 performers")) .tablebox').nth(1).locator('thead th').allInnerTexts()).map((x)=>x.trim()).join()==='#,Person,Utilisation,Hours'),`top ${lmTop.length} | bottom ${lmBot.length}`);
  ok('bottom 5: the whole company has none',(await adm.locator('section.panel:has(h3:has-text("Top 5 performers"))').locator('.tablebox').count())===1);
  const officeSecs=adm.locator('section.panel:has(h3:has-text("Top 5 in "))');
  const offCheck=[];
  for(let i=0;i<await officeSecs.count();i++){
    const sec=officeSecs.nth(i), tops=await sec.locator('.tablebox').nth(0).locator('tbody tr td:first-child').allInnerTexts();
    const bottom=sec.locator('.tablebox').nth(1), pl=await bottom.locator('tbody tr td:first-child').allInnerTexts();
    const empty=(await bottom.innerText()).includes('Everyone is in the top 5.');
    offCheck.push(await sec.locator('.tablebox').count()===2&&(empty||(tops.length===5&&pl.length>0&&pl.every((x)=>+x>5))));
  }
  ok('bottom 5: every office has one, and none repeats its top five',offCheck.length===offices&&offCheck.every(Boolean),offCheck.join(','));

  // folding "Your numbers"
  const body=(p)=>p.locator('#mynumbers-body');
  for(const [who,page] of [['location manager',rav],['admin',adm],['team/project manager',dan]]){
    await go(page,'/dashboard');
    const btn=page.locator('button[aria-controls="mynumbers-body"]');
    const was=await body(page).isVisible();
    await btn.click();
    const hid=!(await body(page).isVisible());
    const cookie=(await page.context().cookies()).find((c)=>c.name==='tsink-mynumbers')?.value;
    await go(page,'/dashboard');
    const stays=!(await body(page).isVisible())&&(await btn.innerText())==='Show'&&(await btn.getAttribute('aria-expanded'))==='false';
    await btn.click();
    const back=await body(page).isVisible()&&(await btn.innerText())==='Hide';
    ok(`your numbers: the ${who} can fold it up, it stays folded after a reload, and opens again`,was&&hid&&cookie==='0'&&stays&&back,JSON.stringify({was,hid,cookie,stays,back}));
  }
  await go(mem,'/dashboard');
  ok('your numbers: a team member has no fold button',await mem.locator('button[aria-controls="mynumbers-body"]').count()===0&&await mem.locator('.panel:has(h3:has-text("Your numbers"))').count()>=1);

  // admins are not reminded or listed as missing
  await go(adm,'/approvals');
  ok('approvals: an admin is not listed among people who have not submitted',!(await adm.innerText('body')).includes('Mg Admin'));
  ok('no browser errors',pages.every((p)=>p.errs.length===0),JSON.stringify(pages.flatMap((p)=>p.errs)).slice(0,300));
 }finally{
  const users=ALLU.map((x)=>`'${x}'`).join(',');
  sql(`delete from "TimeEntry" where "userId" in (${users})`);
  sql(`delete from "AuditLog" where "userId" in (${users}) or "targetUserId" in (${users}) or action like '%${t}%' or action like '%${N1}%' or action like '%${N2}%' or action like '%${WA}%' or action like '%${WB}%' or action like 'Changed expected hours per week for Mg %'`);
  sql(`delete from "User" where id in (${users})`);
  sql(`delete from "Client" where id in ('${C1}','${C2}')`);
  sql(`delete from "Tag" where id in ('${TA}','${TB}')`);
  await b.close();
 }
})().catch((e)=>{console.error(e);process.exit(1);});
