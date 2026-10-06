// Client contracts and the Clients tab: fixed monthly hours or no commitment, utilisation per period, pace this month,
// change on the previous period, the client detail page, who can see and change what, and crafted server action calls.
// Sets up its own test people, clients, projects and time directly in the local database (PSQL defaults to the sample
// database on this machine) and removes them at the end.
const {execSync}=require('child_process');
const {start,login,BASE}=require('./helpers');
const PSQL=process.env.PSQL||'psql -h /tmp -U postgres clockme';
const sql=(q)=>execSync(`${PSQL} -v ON_ERROR_STOP=1 -At`,{input:q}).toString().trim();
const ok=(name,cond,detail='')=>{console.log(`${cond?'PASS':'FAIL'} ${name}${detail?' — '+detail:''}`);if(!cond)process.exitCode=1;};
const addDays=(d,n)=>{const x=new Date(d+'T00:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10);};
const addMonths=(ym,n)=>{const x=new Date(ym+'-01T00:00:00Z');x.setUTCMonth(x.getUTCMonth()+n);return x.toISOString().slice(0,7);};
const endOfMonth=(ym)=>addDays(addMonths(ym,1)+'-01',-1);
const workdays=(a,b)=>{let n=0;for(let d=a;d<=b;d=addDays(d,1)){const w=new Date(d+'T00:00:00Z').getUTCDay();if(w>0&&w<6)n++;}return n;};
const pct=(v)=>`${Math.round(v*100)}%`;

(async()=>{
 const b=await start();
 const t='cl'+process.pid;
 const FX=`Test fixed ${t}`, FL=`Test floating ${t}`;
 const tz=sql(`select "timeZone" from "Settings"`), hhmm=sql(`select "timeFormat" from "Settings"`)==='hhmm';
 const f=(min)=>hhmm?`${Math.floor(min/60)}:${String(Math.round(min%60)).padStart(2,'0')}`:(min/60).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
 const todayStr=sql(`select to_char(now() at time zone '${tz}','YYYY-MM-DD')`), ym=todayStr.slice(0,7), m0=ym+'-01';
 const lm=addMonths(ym,-1), lm2=addMonths(ym,-2);
 const priya=sql(`select "locationId"||'|'||"teamId"||'|'||"passwordHash" from "User" where email='priya@example.com'`).split('|');
 const oliver=sql(`select "locationId" from "User" where email='oliver@example.com'`);
 const ldTeam=sql(`select id from "Team" where "locationId"='${oliver}' order by name limit 1`);
 const NY=`NY Person ${t}`, LD=`London Person ${t}`;
 // test time: [id, user, project, phase, date, minutes]
 const E=[['e1','ny','p1','ph1',m0,180],['e2','ld','p1','ph1',m0,120],['e3','ny','p2','ph2',m0,60],['e4','ny','p1','ph1',lm+'-01',720],
  ['e5','ld','p3','ph3',m0,240],['e6','ld','p3','ph3',lm+'-01',120],['e7','ld','p3','ph3',lm2+'-01',60]];
 const projClient={p1:'fx',p2:'fx',p3:'fl'};
 const minutes=(client,from,to)=>E.filter(e=>projClient[e[2]]===client&&e[4]>=from&&e[4]<=to).reduce((a,e)=>a+e[5],0);
 // the periods as the owner described them
 const q0=addMonths(ym,-((+ym.slice(5)-1)%3)), y0=ym.slice(0,4)+'-01';
 const P={thismonth:[m0,todayStr,1],lastmonth:[lm+'-01',endOfMonth(lm),1],thisquarter:[q0+'-01',todayStr,(+ym.slice(5)-1)%3+1],
  lastquarter:[addMonths(q0,-3)+'-01',endOfMonth(addMonths(q0,-1)),3],thisyear:[y0+'-01',todayStr,+ym.slice(5)],last12:[addMonths(ym,-12)+'-01',endOfMonth(lm),12]};
 const cells=async(p,name)=>p.$$eval(`tr:has(a:text-is("${name}")) td`,tds=>tds.map(td=>td.textContent.replace(/\s+/g,' ').trim()));
 const stats=async(p)=>p.$$eval('.stats .stat',s=>s.map(x=>x.innerText.replace(/\s+/g,' ').trim()));
 const go=async(p,path)=>{const r=await p.goto(BASE+path);await p.waitForLoadState('networkidle');return r;};
 const errs=[];
 const t0=sql(`select to_char(now() at time zone 'UTC','YYYY-MM-DD HH24:MI:SS.MS')`);
 try{
  sql(`insert into "User"(id,email,name,"passwordHash",role,"locationId","teamId","weeklyTarget","createdAt") values
   ('${t}ny','${t}ny@example.com','${NY}','${priya[2]}','MEMBER','${priya[0]}','${priya[1]}',40,now()-interval '400 days'),
   ('${t}ld','${t}ld@example.com','${LD}','${priya[2]}','MEMBER','${oliver}','${ldTeam}',40,now()-interval '400 days')`);
  sql(`insert into "Client"(id,name,color,type,"monthlyHours") values ('${t}fx','${FX}','s1','FIXED',10),('${t}fl','${FL}','s3','FLOATING',null)`);
  sql(`insert into "Project"(id,name,"clientId",archived) values ('${t}p1','Live ${t}','${t}fx',false),('${t}p2','Old ${t}','${t}fx',true),('${t}p3','Ad hoc ${t}','${t}fl',false)`);
  sql(`insert into "Phase"(id,"projectId",name,sort) values ('${t}ph1','${t}p1','Build',0),('${t}ph2','${t}p2','Build',0),('${t}ph3','${t}p3','Plan',0)`);
  sql(`insert into "TimeEntry"(id,"userId","projectId","phaseId",date,minutes,description) values ${E.map(e=>`('${t}${e[0]}','${t}${e[1]}','${t}${e[2]}','${t}${e[3]}','${e[4]}',${e[5]},'test')`).join(',')}`);

  // --- sample data values
  ok('sample clients have the agreed contracts',sql(`select string_agg(name||':'||type||':'||coalesce("monthlyHours"::text,'-'),',' order by name) from "Client" where name in ('Northwind Logistics','Bluebird Health','Harbor & Co','Internal')`)==='Bluebird Health:FIXED:200,Harbor & Co:FLOATING:-,Internal:FLOATING:-,Northwind Logistics:FIXED:300');

  // --- who sees the tab
  for(const email of ['daniel@example.com','rosa@example.com','priya@example.com']){
   const p=await login(b,email);
   ok(`${email}: no Clients tab`,!(await p.locator('nav a').allInnerTexts()).includes('Clients'));
   await go(p,'/clients');ok(`${email}: /clients goes to the timesheet`,new URL(p.url()).pathname==='/timesheet');
   await go(p,`/clients/${t}fx`);ok(`${email}: a client page goes to the timesheet`,new URL(p.url()).pathname==='/timesheet');
   errs.push(...p.errs);await p.context().close();
  }
  const anon=await (await b.newContext()).newPage();await go(anon,'/clients');ok('signed out: /clients goes to sign in',new URL(anon.url()).pathname==='/login');

  // --- admin: list page, this month
  const a=await login(b,'admin@example.com');
  ok('admin: Clients tab right after Dashboard',(await a.locator('nav a').allInnerTexts()).slice(0,2).join('|')==='Dashboard|Clients');
  await go(a,'/clients');
  ok('admin: This month is the default period',(await a.inputValue('#cl-range'))==='thismonth');
  {
   const c=await cells(a,FX), exp=minutes('fx',m0,todayStr);
   ok('fixed client: type and monthly hours',c[1].includes('Fixed monthly hours')&&c[1].includes('10 h a month'),c[1]);
   ok('fixed client: hours logged count everyone, archived projects included',c[2]===f(exp),`${c[2]} vs ${f(exp)}`);
   ok('fixed client: this month is one full month of contract',c[3]===f(600),c[3]);
   ok('fixed client: utilisation',c[4].startsWith(pct(exp/600))&&!/over contract/i.test(c[4]),c[4]);
   ok('fixed client: hours left',c[5]===f(600-exp),c[5]);
   // pace: hours up to yesterday against the contract spread over the month's working days so far
   const yest=addDays(todayStr,-1), done=workdays(m0,yest<endOfMonth(ym)?yest:endOfMonth(ym))/workdays(m0,endOfMonth(ym));
   const soFar=minutes('fx',m0,yest), r=soFar/(600*done), want=!done?'Too early to tell':r>1.1?'Ahead of pace':r<0.9?'Behind pace':'On pace';
   ok('fixed client: pace this month',c[6].startsWith(want)&&(!done||c[6].includes(`${f(soFar)} logged by yesterday, ${f(600*done)} expected`)),c[6]);
   const fl=await cells(a,FL);
   ok('no-commitment client: hours and change on the same days last month',fl[1]==='No commitment'&&fl[2]===f(240)&&fl[3].includes('Up 100% on the same days last month')&&fl[3].includes(`(${f(120)} h)`),fl.join(' | '));
   ok('no-commitment client: no contract columns',fl.length===4,String(fl.length));
   const names=await a.$$eval('table.clients tbody tr',rs=>rs.map(r=>r.querySelector('td:nth-child(2)').textContent.startsWith('Fixed')));
   ok('fixed clients are listed first',names.indexOf(false)===-1||names.slice(names.indexOf(false)).every(x=>!x));
   // summary strip against the database
   const rows=sql(`select coalesce(sum(e.minutes),0)/(c."monthlyHours"*60) from "Client" c left join "Project" p on p."clientId"=c.id left join "TimeEntry" e on e."projectId"=p.id and e.date between '${m0}' and '${todayStr}' where c.type='FIXED' and c."monthlyHours">0 group by c.id,c."monthlyHours"`).split('\n').filter(Boolean).map(Number);
   const total=+sql(`select coalesce(sum(minutes),0) from "TimeEntry" where date between '${m0}' and '${todayStr}'`);
   const s=await stats(a), avg=rows.reduce((x,y)=>x+y,0)/rows.length;
   ok('summary: total hours on clients',s[0]===`${f(total)} total hours on clients`,s[0]);
   ok('summary: fixed-hours clients',s[1]===`${rows.length} fixed-hours clients`,s[1]);
   ok('summary: average contract utilisation',s[2]===`${pct(avg)} average contract utilisation`,s[2]);
   ok('summary: clients over contract',s[3]===`${rows.filter(x=>x>1).length} clients over contract`,s[3]);
   ok('summary: clients under 50%',s[4]===`${rows.filter(x=>x<0.5).length} clients under 50% of contract`,s[4]);
  }
  // other periods
  await a.selectOption('#cl-range','lastmonth');await a.waitForURL(/range=lastmonth/);await a.waitForLoadState('networkidle');
  {
   const c=await cells(a,FX), exp=minutes('fx',...P.lastmonth.slice(0,2));
   ok('last month: over contract shown as over',c[2]===f(exp)&&c[4].startsWith(pct(exp/600))&&/over contract/i.test(c[4])&&c[5]===`${f(exp-600)} over`,c.join(' | '));
   ok('last month: the bar shows the part over the contract',(await a.locator(`tr:has(a:text-is("${FX}")) .meter.split i.over`).count())===1);
   ok('last month: no pace column',!(await a.textContent('table.clients thead')).includes('Pace'));
   const fl=await cells(a,FL);ok('last month: change on the month before',fl[3].includes('Up 100% on the month before')&&fl[3].includes(`(${f(60)} h)`),fl[3]);
  }
  for(const k of ['thisquarter','lastquarter','thisyear','last12']){
   await go(a,'/clients?range='+k);
   const [from,to,n]=P[k], c=await cells(a,FX), exp=minutes('fx',from,to), con=600*n;
   ok(`${k}: hours, contract (${n} month${n>1?'s':''}) and utilisation`,c[2]===f(exp)&&c[3]===f(con)&&c[4].startsWith(pct(exp/con)),c.slice(2,6).join(' | '));
  }
  await go(a,'/clients?range=nonsense');ok('an unknown period falls back to This month',(await a.inputValue('#cl-range'))==='thismonth');

  // --- admin: client detail
  await go(a,'/clients?range=thismonth');await a.click(`a:text-is("${FX}")`);await a.waitForURL(new RegExp(`/clients/${t}fx\\?range=thismonth`));await a.waitForLoadState('networkidle');
  {
   const s=await stats(a), exp=minutes('fx',m0,todayStr);
   ok('detail: hours, contract, utilisation and hours left',s[0]===`${f(exp)} hours logged`&&s[1]===`${f(600)} contracted hours`&&s[2]===`${pct(exp/600)} utilisation`&&s[3]===`${f(600-exp)} hours left`,s.join(' | '));
   ok('detail: the chart has the contract line',(await a.locator('.chart svg line.level').count())===1);
   const lmName=new Date(lm+'-01T00:00:00Z').toLocaleDateString('en-US',{month:'long',year:'numeric',timeZone:'UTC'});
   const tips=await a.$$eval('.chart circle title',ts=>ts.map(x=>x.textContent));
   ok('detail: 12 months in the chart, last month with its hours',tips.length===12&&tips.includes(`Hours, ${lmName}: ${f(720)} h`),tips.slice(-2).join(' / '));
   const proj=(await a.locator('section:has(h3:text-is("Hours by project")) tbody').textContent()).replace(/\s+/g,' ');
   ok('detail: hours by project, archived ones included',proj.includes(`Live ${t}`)&&proj.includes(`Old ${t}`)&&/archived/i.test(proj),proj);
   const ph=await a.$$eval('section:has(h3:text-is("Hours by phase")) tbody tr',rs=>rs.map(r=>r.textContent.replace(/\s+/g,' ')));
   ok('detail: phases with the same name are added together',ph.length===1&&ph[0].includes('Build')&&ph[0].includes(f(exp)),ph.join(' / '));
   const per=(await a.locator('section:has(h3:text-is("Hours by person")) tbody').textContent());
   ok('detail: admin sees everyone by name',per.includes(NY)&&per.includes(LD)&&!per.includes('other offices'));
   ok('detail: admin has an Edit button',await a.isVisible('button:has-text("Edit")'));
  }
  await go(a,`/clients/${t}fl?range=thismonth`);
  {
   const s=await stats(a);
   ok('no-commitment detail: no contract line, change on the same days last month',(await a.locator('.chart svg line.level').count())===0&&s[0]===`${f(240)} hours logged`&&s[1]===`${f(120)} hours in the same days last month`&&s[2]==='+100% change'&&s[3]==='1 person with time',s.join(' | '));
   ok('no-commitment detail: no contract wording',!(await a.textContent('main')).includes('Contracted hours'));
  }
  ok('unknown client: not found',(await go(a,'/clients/nope'+t)).status()===404);

  // --- location manager: same company-wide numbers, only own office people by name
  const o=await login(b,'oliver@example.com');
  await go(o,'/clients');
  {
   const c=await cells(o,FX);ok('location manager: hours count the whole company',c[2]===f(minutes('fx',m0,todayStr)),c[2]);
   await go(o,`/clients/${t}fx`);
   const per=(await o.locator('section:has(h3:text-is("Hours by person")) tbody').textContent()).replace(/\s+/g,' ');
   ok('location manager: own office person listed',per.includes(LD));
   ok('location manager: people from other offices not named',!per.includes(NY)&&!(await o.content()).includes(NY));
   ok('location manager: other offices added up in one line',per.includes('People in other offices (1)')&&per.includes(f(240)),per);
   ok('location manager: note says only own office is listed',(await o.textContent('main')).includes('Only people in the London office are listed'));
   ok('location manager: totals still company-wide',(await stats(o))[0]===`${f(minutes('fx',m0,todayStr))} hours logged`);
   ok('location manager: no Edit button',!(await o.isVisible('button:has-text("Edit")')));
  }

  // --- Projects page: types, links, edit controls
  await go(o,'/projects');
  {
   const item=(await o.locator(`.item:has-text("${FX}")`).textContent());
   ok('location manager: Projects shows the client type and links to the client',item.includes('Fixed monthly hours, 10 h a month')&&(await o.locator(`.item a[href="/clients/${t}fx"]`).count())===1);
   ok('location manager: no Edit or add client controls',(await o.locator('.item button:has-text("Edit")').count())===0&&!(await o.isVisible('#nc-name')));
  }
  const d=await login(b,'daniel@example.com');await go(d,'/projects');
  ok('team leader: Projects lists clients without contracts',(await d.locator(`.item:has-text("${FX}")`).count())===1&&!(await d.locator('section:has(h3:text-is("Clients"))').textContent()).includes('Fixed monthly hours')&&(await d.locator('.item a[href^="/clients/"]').count())===0);

  await go(a,'/projects');
  ok('admin: Projects shows both types',(await a.locator(`.item:has-text("${FX}")`).textContent()).includes('Fixed monthly hours, 10 h a month')&&(await a.locator(`.item:has-text("${FL}")`).textContent()).includes('No commitment'));
  // capture server action calls to replay them as other people later
  const calls=[];a.on('request',r=>{if(r.method()==='POST'&&r.headers()['next-action'])calls.push({url:r.url(),headers:r.headers(),body:r.postDataBuffer()});});
  // add a fixed client: the hours are required and must be above 0
  const NEW=`New fixed ${t}`, NEW2=`New open ${t}`;
  await a.fill('#nc-name',NEW);await a.selectOption('#nc-type','FIXED');
  ok('choosing Fixed shows the hours box',await a.isVisible('#nc-hours'));
  await a.fill('#nc-hours','0');await a.click('button:has-text("Add client")');await a.waitForSelector('form:has(#nc-name) .err-text');
  ok('0 hours is refused',(await a.textContent('form:has(#nc-name) .err-text')).includes('more than 0')&&sql(`select count(*) from "Client" where name='${NEW}'`)==='0');
  ok('what was typed stays after an error',(await a.inputValue('#nc-name'))===NEW);
  await a.fill('#nc-hours','120');calls.length=0;await a.click('button:has-text("Add client")');
  await a.waitForSelector(`.item:has-text("${NEW}")`);
  const addCall=calls.find(c=>c.body&&c.body.toString().includes(NEW));
  ok('fixed client saved with its hours',sql(`select type||':'||"monthlyHours" from "Client" where name='${NEW}'`)==='FIXED:120');
  ok('list shows the new contract',(await a.locator(`.item:has-text("${NEW}")`).textContent()).includes('Fixed monthly hours, 120 h a month'));
  ok('form is ready for the next client',(await a.inputValue('#nc-name'))===''&&(await a.inputValue('#nc-type'))==='FLOATING'&&!(await a.isVisible('#nc-hours')));
  ok('change log records it',sql(`select count(*) from "AuditLog" where action='Added client ${NEW} (fixed monthly hours, 120 h a month)'`)==='1');
  await a.fill('#nc-name',NEW2);await a.click('button:has-text("Add client")');await a.waitForSelector(`.item:has-text("${NEW2}")`);
  ok('no-commitment client saved without hours',sql(`select type||':'||coalesce("monthlyHours"::text,'-') from "Client" where name='${NEW2}'`)==='FLOATING:-');
  // edit: floating to fixed, bad hours, then back to no commitment
  const newId=sql(`select id from "Client" where name='${NEW2}'`);
  const edit=async()=>{await a.click(`button[aria-label="Edit ${NEW2}"]`);await a.waitForSelector('dialog[open] form');};
  await edit();
  ok('edit dialog starts with the current type',(await a.inputValue(`#ec-${newId}-type`))==='FLOATING');
  await a.selectOption(`#ec-${newId}-type`,'FIXED');await a.fill(`#ec-${newId}-hours`,'200000');await a.click('dialog[open] button:has-text("Save changes")');await a.waitForSelector('dialog[open] .err-text');
  ok('too many hours refused',(await a.textContent('dialog[open] .err-text')).includes('100,000 or less')&&sql(`select type from "Client" where id='${newId}'`)==='FLOATING');
  await a.fill(`#ec-${newId}-hours`,'50.5');calls.length=0;await a.click('dialog[open] button:has-text("Save changes")');await a.waitForSelector('dialog[open]',{state:'detached'});
  const editCall=calls.find(c=>c.body&&c.body.toString().includes('50.5'));
  ok('edit saves type and hours',sql(`select type||':'||"monthlyHours" from "Client" where id='${newId}'`)==='FIXED:50.5');
  await a.waitForFunction(n=>[...document.querySelectorAll('.item')].some(i=>i.textContent.includes(n)&&i.textContent.includes('50.5 h a month')),NEW2);
  ok('list updates after editing',true);
  ok('change log records the edit',sql(`select count(*) from "AuditLog" where action='Changed client ${NEW2} to fixed monthly hours, 50.5 h a month'`)==='1');
  await edit();ok('edit dialog shows the saved hours',(await a.inputValue(`#ec-${newId}-hours`))==='50.5');
  await a.selectOption(`#ec-${newId}-type`,'FLOATING');ok('No commitment hides the hours box',!(await a.isVisible(`#ec-${newId}-hours`)));
  await a.click('dialog[open] button:has-text("Save changes")');await a.waitForSelector('dialog[open]',{state:'detached'});
  ok('back to no commitment clears the hours',sql(`select type||':'||coalesce("monthlyHours"::text,'-') from "Client" where id='${newId}'`)==='FLOATING:-');

  // --- crafted server action calls
  ok('captured the add and edit calls',!!addCall&&!!editCall);
  if(addCall&&editCall){
   const replay=async(p,call,body)=>{const r=await p.request.post(BASE+'/projects',{headers:{'next-action':call.headers['next-action'],'content-type':call.headers['content-type'],accept:'text/x-component',origin:BASE},data:body});return [r.status(),await r.text()];};
   const before=()=>sql(`select type||':'||coalesce("monthlyHours"::text,'-') from "Client" where id='${newId}'`);
   for(const [who,p] of [['location manager',o],['team leader',d]]){
    const [st,txt]=await replay(p,editCall,editCall.body);
    ok(`${who}: crafted edit call is refused`,before()==='FLOATING:-'&&txt.includes('Only admins can change clients'),`${st} ${before()}`);
    const body=Buffer.from(addCall.body.toString('latin1').split(NEW).join(`Sneaky ${t}`),'latin1');
    const [, txt2]=await replay(p,addCall,body);
    ok(`${who}: crafted add call is refused`,sql(`select count(*) from "Client" where name='Sneaky ${t}'`)==='0'&&txt2.includes('Only admins can add clients'));
   }
   const neg=Buffer.from(editCall.body.toString('latin1').split('50.5').join('-5'),'latin1');
   const [, t3]=await replay(a,editCall,neg);ok('admin: crafted negative hours refused',before()==='FLOATING:-'&&t3.includes('more than 0'));
   const nan=Buffer.from(editCall.body.toString('latin1').split('50.5').join('lots'),'latin1');
   await replay(a,editCall,nan);ok('admin: crafted text hours refused',before()==='FLOATING:-');
   const gone=Buffer.from(editCall.body.toString('latin1').split(newId).join('missing'+t),'latin1');
   const [, t4]=await replay(a,editCall,gone);ok('admin: crafted call for a missing client refused',t4.includes('no longer exists'));
   const [, t5]=await replay(a,editCall,editCall.body);ok('admin: the same call works for an admin',before()==='FIXED:50.5',t5.slice(0,80));
  }

  // --- CSV project import makes new clients with no commitment
  await go(a,'/import-export');
  await a.fill('#imp-text-projects',`Client,Project\nImported ${t},First job ${t}`);
  await a.locator('section:has(#imp-text-projects) button:has-text("Check file")').click();await a.waitForSelector('section:has(#imp-text-projects) table');
  await a.locator('section:has(#imp-text-projects) button:has-text("Import")').click();await a.waitForSelector('section:has(#imp-text-projects) .alert.ok');
  ok('imported client has no commitment',sql(`select type||':'||coalesce("monthlyHours"::text,'-') from "Client" where name='Imported ${t}'`)==='FLOATING:-');

  // --- roles table and phones
  await go(a,'/settings');
  const row=(await a.locator('table.matrix tr:has-text("See the client dashboard")').textContent());
  ok('roles table lists the client dashboard',row.includes('Yes, people in own office only'));
  ok('roles table lists setting contracts',(await a.locator('table.matrix tr:has-text("contracted hours per month")').count())===1);
  const ph=await (await b.newContext({viewport:{width:390,height:800}})).newPage();
  await ph.goto(BASE+'/login');await ph.fill('#email','oliver@example.com');await ph.fill('#password','password123');await ph.click('button:has-text("Sign in")');await ph.waitForURL(u=>!u.pathname.startsWith('/login'));
  for(const path of ['/clients',`/clients/${t}fx`]){await go(ph,path);ok(`phone: ${path.replace(t,'…')} fits the screen`,(await ph.evaluate(()=>document.documentElement.scrollWidth))<=390);}
  await go(a,'/dashboard');ok('dashboard still shows productivity',/\d+%productivity/.test((await a.textContent('.stats')).replace(/\s+/g,'')));
  errs.push(...a.errs,...o.errs,...d.errs);
  ok('no browser errors',errs.length===0,JSON.stringify(errs));
 }finally{
  sql(`delete from "TimeEntry" where "projectId" in (select p.id from "Project" p join "Client" c on c.id=p."clientId" where c.name like '%${t}')`);
  sql(`delete from "Project" where "clientId" in (select id from "Client" where name like '%${t}')`);
  sql(`delete from "Client" where name like '%${t}'`);
  sql(`delete from "AuditLog" where action like '%${t}%' or "userId" like '${t}%' or (at>='${t0}' and action='Imported 1 projects from CSV' and "userId"=(select id from "User" where email='admin@example.com'))`);
  sql(`delete from "User" where id like '${t}%'`);
  await b.close();
 }
})();
