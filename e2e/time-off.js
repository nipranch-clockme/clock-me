// Time off requests and public holidays: who can ask for, approve, add and remove time off and holidays (screens and crafted server calls),
// how only approved time off counts (expected hours, Timesheet badges, reminders), the approvals section, the lock date, rows that came from
// another system, ticking several offices at once and pasting several holidays.
// Sets up its own test people and holidays directly in the local database, and removes them again.
//   BASE=http://localhost:3500 PSQL="psql -h /var/run/postgresql tags_t" node e2e/time-off.js
const {execSync}=require('child_process');
const {start,login,BASE}=require('./helpers');
const PSQL=process.env.PSQL||'psql -h /tmp -U postgres clockme';
const sql=(q)=>execSync(`${PSQL} -v ON_ERROR_STOP=1 -At`,{input:q}).toString().trim();
const ok=(name,cond,detail='')=>{console.log(`${cond?'PASS':'FAIL'} ${name}${detail?' — '+detail:''}`);if(!cond)process.exitCode=1;};
const toD=(s)=>new Date(s+'T00:00:00Z');
const addDays=(s,n)=>{const x=toD(s);x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10);};
const dow=(s)=>(toD(s).getUTCDay()+6)%7;
const mondayOf=(s)=>addDays(s,-dow(s));
const addMonths=(ym,n)=>{const x=toD(ym+'-01');x.setUTCMonth(x.getUTCMonth()+n);return x.toISOString().slice(0,7);};
const endOfMonth=(ym)=>{const x=toD(ym+'-01');x.setUTCMonth(x.getUTCMonth()+1);x.setUTCDate(0);return x.toISOString().slice(0,10);};
const esc=(s)=>String(s).replace(/'/g,"''");

(async()=>{
 const b=await start();
 const t='to'+process.pid, M=t+'m', K=t+'k', K2=t+'k2', ALL=[M,K,K2];
 const id=(email)=>sql(`select id from "User" where email='${email}'`);
 const row=(email)=>sql(`select id||'|'||"locationId"||'|'||coalesce("teamId",'')||'|'||name from "User" where email='${email}'`).split('|');
 const [PRIYA,,,PRIYA_NAME]=row('priya@example.com');
 const daniel=row('daniel@example.com'), tom=row('tom@example.com');
 const DAN=daniel[0], RAVI=id('ravi@example.com'), ADM=id('admin@example.com');
 const AMD=daniel[1], HULK=daniel[2], KLH=tom[1], FLASH=tom[2];
 const AMD_NAME=sql(`select name from "Location" where id='${AMD}'`), KLH_NAME=sql(`select name from "Location" where id='${KLH}'`);
 const NLOC=+sql(`select count(*) from "Location"`);
 const hash=sql(`select "passwordHash" from "User" where email='daniel@example.com'`);
 const tz=sql(`select "timeZone" from "Settings"`), format=sql(`select "timeFormat" from "Settings"`);
 const lockOld=sql(`select coalesce("lockBefore"::text,'') from "Settings"`);
 const today=sql(`select to_char(now() at time zone '${tz}','YYYY-MM-DD')`), yesterday=addDays(today,-1);
 const f=(m)=>format==='hhmm'?`${Math.floor(Math.round(m)/60)}:${String(Math.round(m)%60).padStart(2,'0')}`:(m/60).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
 const [pa,xa]=sql(`select p.id||'|'||ph.id from "Project" p join "Phase" ph on ph."projectId"=p.id where p.access='PUBLIC' and not p.archived and ph.sort<999 order by p.name, ph.sort limit 1`).split('|');
 const tagId=sql(`select id from "Tag" order by name limit 1`);
 const ws=mondayOf(today);
 const lm=addMonths(today.slice(0,7),-1), la=lm+'-01', lb=endOfMonth(lm);
 const weekdays=(a,z)=>{const out=[];for(let d=a;d<=z&&d<=yesterday;d=addDays(d,1))if(dow(d)<5)out.push(d);return out;};
 const lwd=weekdays(la,lb);
 // last month: a holiday for AMD, two days and a half day of PTO for the test member
 const HOL=lwd[10], PTO=[lwd[12],lwd[13]], HALF=lwd[15], PENDING_DAY=lwd[8];
 // holidays the database already has for AMD or KLH last month are part of the sums too
 const have=(loc)=>sql(`select to_char(date,'YYYY-MM-DD')||'|'||fraction from "Holiday" where "locationId"='${loc}' and date between '${la}' and '${lb}' and name not like 'E2E %' and extract(dow from date) between 1 and 5`).split('\n').filter(Boolean).map((l)=>l.split('|'));
 const haveAmd=have(AMD), haveKlh=have(KLH);
 const lost=(extra,have2)=>{const map=new Map();for(const [d,fr] of [...have2,...extra])map.set(d,Math.max(map.get(d)??0,+fr));return [...map.values()].reduce((s,v)=>s+v,0);};
 const watched={};let expecting=null;
 const watch=(page)=>page.on('request',(r)=>{const a=r.headers()['next-action'];if(a&&r.method()==='POST'&&expecting&&!watched[expecting])watched[expecting]=a;});
 const cap=async(name,fn)=>{expecting=name;try{await fn();}finally{expecting=null;}};
 // Calls a server action straight from the page, the way a crafted request would.
 const act=(page,path,name,fields)=>page.evaluate(async({url,action,fields})=>{const fd=new FormData();for(const [k,v] of Object.entries(fields))fd.append('_1_'+k,v);fd.append('0','[null,"$K1"]');
  const r=await fetch(url,{method:'POST',headers:{'next-action':action,accept:'text/x-component'},body:fd});return {status:r.status,text:await r.text()};},{url:BASE+path,action:watched[name],fields});
 const refused=(r,sub)=>r.status===200&&/"ok":false/.test(r.text)&&(!sub||r.text.includes(sub));
 const go=async(p,path)=>{const r=await p.goto(BASE+path);await p.waitForLoadState('networkidle');return r.status();};
 const pages=[];
 const signIn=async(email)=>{const p=await login(b,email);watch(p);pages.push(p);return p;};
 const ins=(uid,name,loc,team,role,days)=>sql(`insert into "User"(id,email,name,"passwordHash",role,"locationId","teamId","weeklyTarget","createdAt") values('${uid}','${uid}@example.com','${name}','${hash}','${role}','${loc}',${team?`'${team}'`:'null'},40, now()-interval '${days} days')`);
 const entry=(uid,n,d,minutes)=>sql(`insert into "TimeEntry"(id,"userId","projectId","phaseId","tagIds",date,"startMin",minutes,description,custom,"createdAt") values('${uid}e${n}','${uid}','${pa}','${xa}','{${tagId}}','${d}',540,${minutes},'work','{}',now())`);
 const hol=(n,loc,d,name,fr=1)=>sql(`insert into "Holiday"(id,"locationId",date,name,fraction) values('${t}h${n}','${loc}','${d}','${esc(name)}',${fr})`);
 const off=(n,uid,a,z,fr=1,source='manual',label='PTO',ext=null)=>sql(`insert into "TimeOff"(id,"userId","startDate","endDate",fraction,label,source,"externalId","updatedAt") values('${t}o${n}','${uid}','${a}','${z}',${fr},'${label}','${source}',${ext?`'${ext}'`:'null'},now())`);
 // status | who asked | who decided | decision note, for the time off on that day (empty when there is none)
 const timeOffOf=(uid,a)=>sql(`select status||'|'||coalesce("createdById",'')||'|'||coalesce("decidedById",'')||'|'||coalesce("decisionNote",'') from "TimeOff" where "userId"='${uid}' and "startDate"='${a}'`);
 const idOf=(uid,a)=>sql(`select id from "TimeOff" where "userId"='${uid}' and "startDate"='${a}'`);

 try{
  ins(M,'Timeoff Test',AMD,HULK,'MEMBER',120);
  ins(K,'Klh Test',KLH,FLASH,'MEMBER',120);
  ins(K2,'Klh Manager Test',KLH,null,'LOCATION',120);
  const mp=await signIn(M+'@example.com');

  // ---- expected hours: approved time off and holidays come off, a request still waiting does not
  const wdM=lwd.length;
  [0,1,2].forEach((i)=>entry(M,i,lwd[i],480)); // last month: 8 hours on three ordinary days
  hol('1',AMD,HOL,'E2E Founders Day');
  off('1',M,PTO[0],PTO[1]);
  off('2',M,HALF,HALF,0.5,'manual','Sick leave');
  sql(`insert into "TimeOff"(id,"userId","startDate","endDate",fraction,label,source,status,"updatedAt") values('${t}p1','${M}','${PENDING_DAY}','${PENDING_DAY}',1,'PTO','manual','PENDING',now())`);
  const lostM=lost([[HOL,1],...PTO.map((d)=>[d,1]),[HALF,0.5]],haveAmd);
  const wantM=480*(wdM-lostM), wantK=480*(wdM-lost([],haveKlh));
  const adm=await signIn('admin@example.com');
  await go(adm,`/profile/${M}`);
  await adm.selectOption('#pr-range','lastmonth');await adm.waitForLoadState('networkidle');await adm.waitForTimeout(600);
  let stats=await adm.$$eval('.stats.spread.five .stat b',(bs)=>bs.map((x)=>x.textContent.trim()));
  ok('profile: expected hours last month take out the office holiday and the approved time off, not the request waiting on that day',stats[2]===f(wantM),`${stats[2]} vs ${f(wantM)} (${wdM} weekdays, ${lostM} off)`);
  ok('profile: utilisation is hours over those expected hours',stats[0]===`${Math.round(1440/wantM*100)}%`,`${stats[0]} vs ${Math.round(1440/wantM*100)}%`);
  await go(adm,`/profile/${K}`);await adm.selectOption('#pr-range','lastmonth');await adm.waitForLoadState('networkidle');await adm.waitForTimeout(600);
  stats=await adm.$$eval('.stats.spread.five .stat b',(bs)=>bs.map((x)=>x.textContent.trim()));
  ok("profile: another office's holiday does not change this person's expected hours",stats[2]===f(wantK),`${stats[2]} vs ${f(wantK)}`);
  await go(mp,'/dashboard');
  const tiles=(await mp.locator('.insights .insight').allInnerTexts()).map((x)=>x.replace(/\s+/g,' '));
  ok('"Your numbers": last month is out of the reduced expected hours',tiles[1]?.includes(`(${f(1440)} of ${f(wantM)} h)`),tiles[1]);

  // ---- public holidays: admins only, for one office, several offices, or every office
  const submitHoliday=async()=>{await cap('addHoliday',()=>adm.click('button:has-text("Add holiday")'));await adm.waitForLoadState('networkidle');await adm.waitForTimeout(700);};
  const onlyOffices=async(ids)=>{await adm.click('fieldset button:has-text("None")');for(const x of ids)await adm.check(`input[name="locationId"][value="${x}"]`);};
  const hA=addDays(today,200), hB=addDays(today,201), hC=addDays(today,202), hD=addDays(today,203), hE=addDays(today,204);
  await go(adm,'/time-off?view=holidays');
  ok('admin: the form has a box for every office, all ticked to start with',(await adm.locator('input[name="locationId"]').count())===NLOC&&(await adm.$$eval('input[name="locationId"]',(bs)=>bs.every((x)=>x.checked))));
  await adm.fill('#ho-date',hA);await adm.fill('#ho-name','E2E Common Day');
  await submitHoliday();
  ok('admin: a holiday with every office ticked is added to each office',sql(`select count(*) from "Holiday" where name='E2E Common Day'`)===String(NLOC));
  const common=adm.locator('table.ctable tbody tr',{hasText:'E2E Common Day'});
  ok('admin: the list shows it once, with "All offices" in the Offices column',(await common.count())===1&&/All offices/.test(await common.innerText()));
  await adm.fill('#ho-date',hB);await adm.fill('#ho-name','E2E Exception Day');
  await onlyOffices([AMD]);
  await submitHoliday();
  ok('admin: ticking one office adds the holiday to that office only',sql(`select "locationId" from "Holiday" where name='E2E Exception Day'`)===AMD);
  await adm.fill('#ho-date',hC);await adm.fill('#ho-name','E2E Two Offices');
  await onlyOffices([AMD,KLH]);
  await submitHoliday();
  ok('admin: ticking two offices adds it to exactly those two',sql(`select count(*) from "Holiday" where name='E2E Two Offices' and "locationId" in ('${AMD}','${KLH}')`)==='2'&&sql(`select count(*) from "Holiday" where name='E2E Two Offices'`)==='2');
  const two=adm.locator('table.ctable tbody tr',{hasText:'E2E Two Offices'});
  const twoText=(await two.count())?await two.innerText():'';
  ok('admin: that is one line naming both offices',(await two.count())===1&&(NLOC>2?twoText.includes(AMD_NAME)&&twoText.includes(KLH_NAME):true),twoText.replace(/\s+/g,' '));
  await adm.locator('details summary').click();
  await onlyOffices([KLH]);
  await adm.fill('#ho-bulk',`${hD}, E2E Bulk One\n${hE};E2E Bulk Half (half)\nnot a date, Oops`);
  await adm.click('button:has-text("Add holiday")');await adm.waitForSelector('.err-text');
  ok('bulk: a line that cannot be read is named, and nothing is added',/couldn't read this line/.test(await adm.textContent('.err-text'))&&sql(`select count(*) from "Holiday" where name like 'E2E Bulk%'`)==='0',await adm.textContent('.err-text'));
  await adm.fill('#ho-bulk',`${hD}, E2E Bulk One\n${hE}, E2E Bulk Half (half)`);
  await submitHoliday();
  ok('bulk: every line goes to each office ticked, and "(half)" makes a half day',sql(`select string_agg(name||':'||fraction, ',' order by name) from "Holiday" where name like 'E2E Bulk%' and "locationId"='${KLH}'`)==='E2E Bulk Half:0.5,E2E Bulk One:1');
  await adm.fill('#ho-date',hA);await adm.fill('#ho-name','E2E Again');
  await onlyOffices([AMD]);
  await submitHoliday();
  ok('a holiday the office already has that day is refused, with a plain message',/already has a holiday/.test((await adm.locator('.err-text').allTextContents()).join(' ')));
  // admin removes a holiday that is listed for two offices: it goes from both
  await go(adm,'/time-off?view=holidays');
  adm.once('dialog',(d)=>d.accept());
  await cap('removeHoliday',()=>adm.click('table.ctable tbody tr:has-text("E2E Two Offices") button:has-text("Remove")'));
  await adm.waitForLoadState('networkidle');await adm.waitForTimeout(700);
  ok('admin: removing a holiday takes it out of every office it was listed for',sql(`select count(*) from "Holiday" where name='E2E Two Offices'`)==='0');
  // members, location managers and team managers see the list and cannot change it
  await go(mp,'/time-off?view=holidays');
  ok("member: sees every office's holidays, with the offices for each, and can't add one",(await mp.locator('#ho-date').count())===0&&/Only admins can add or change public holidays/.test(await mp.textContent('main'))&&(await mp.locator('table.ctable tbody tr',{hasText:'E2E Exception Day'}).innerText()).includes(AMD_NAME));
  const rav=await signIn('ravi@example.com');
  await go(rav,'/time-off?view=holidays');
  ok('location manager: no holiday form, the same list',(await rav.locator('#ho-date').count())===0);
  const r1=await act(rav,'/time-off','addHoliday',{locationId:KLH,date:addDays(today,205),name:'E2E Crafted'});
  ok('location manager: adding a holiday is refused, even by a crafted call',refused(r1,'Only admins')&&sql(`select count(*) from "Holiday" where name='E2E Crafted'`)==='0',r1.text.slice(0,160));
  const dan=await signIn('daniel@example.com');
  const r2=await act(dan,'/time-off','removeHoliday',{id:sql(`select id from "Holiday" where name='E2E Common Day' and "locationId"='${AMD}'`)});
  ok('team manager: removing a holiday is refused, even by a crafted call',refused(r2,'Only admins')&&sql(`select count(*) from "Holiday" where name='E2E Common Day'`)===String(NLOC),r2.text.slice(0,160));

  // ---- time off requests: a member asks; a location manager or an admin decides
  const reqA=addDays(ws,3), reqP=addDays(ws,-11), reqWd=addDays(ws,4), reqWe=addDays(ws,5);
  const openRequest=async(p)=>{await p.click('main button.btn.primary:has-text("Request time off")');await p.waitForSelector('dialog[open] #to-from');};
  const sendRequest=async(p)=>{await cap('addTimeOff',()=>p.click('dialog[open] button.btn.primary:has-text("Send request")'));await p.waitForTimeout(800);};
  await go(mp,'/time-off');
  ok('member: the button asks for time off, rather than adding it',(await mp.locator('main button.btn.primary:has-text("Request time off")').count())===1);
  await openRequest(mp);
  ok('member: no person picker when asking for their own time off',(await mp.locator('dialog[open] #to-person').count())===0);
  await mp.fill('#to-from',reqA);await mp.fill('#to-note','E2E first');
  await sendRequest(mp);
  await mp.waitForLoadState('networkidle');
  ok('member: the request waits for approval, and records who asked',timeOffOf(M,reqA).startsWith(`PENDING|${M}|`),timeOffOf(M,reqA));
  ok('member: the list says it is waiting',(await mp.locator('table.ctable tbody tr',{hasText:'Waiting for approval'}).count())===1);
  await openRequest(mp);
  await mp.fill('#to-from',reqP);await mp.fill('#to-note','E2E past one');
  await sendRequest(mp);
  ok('member: a past date can be asked for too',timeOffOf(M,reqP).startsWith('PENDING|'));
  await openRequest(mp);
  await mp.fill('#to-from',reqWe);await mp.fill('#to-to',addDays(reqWe,1));
  await sendRequest(mp);
  ok('a weekend on its own is refused',/weekend/.test(await mp.textContent('dialog[open] .err-text')));
  await mp.click('dialog[open] button:has-text("Close")');
  await openRequest(mp);
  await mp.fill('#to-from',reqA);
  await sendRequest(mp);
  ok('a request overlapping one already waiting is refused',/already have a request for time off/.test(await mp.textContent('dialog[open] .err-text')));
  await mp.click('dialog[open] button:has-text("Close")');
  await openRequest(mp);
  await mp.fill('#to-from',reqWd);await mp.fill('#to-note','E2E withdraw me');
  await sendRequest(mp);
  mp.once('dialog',(d)=>d.accept());
  await cap('removeTimeOff',()=>mp.click('table.ctable tbody tr:has-text("E2E withdraw me") button:has-text("Withdraw")'));
  await mp.waitForLoadState('networkidle');await mp.waitForTimeout(700);
  ok('member: withdraws their own request, which is removed and logged',timeOffOf(M,reqWd)===''&&sql(`select count(*) from "AuditLog" where "userId"='${M}' and action like 'Withdrew the request%'`)==='1');

  // a Klh member and a Klh location manager ask too
  const kp=await signIn(K+'@example.com');
  await go(kp,'/time-off');
  await openRequest(kp);
  await kp.fill('#to-from',reqA);await kp.fill('#to-note','E2E klh');
  await sendRequest(kp);
  // a location manager asks for their own time off from the same dialog: it is the person picker's default, and waits for an admin
  const kp2=await signIn(K2+'@example.com');
  await go(kp2,'/time-off');
  await kp2.click('main button.btn.primary:has-text("Add time off")');await kp2.waitForSelector('dialog[open] #to-from');
  await kp2.fill('#to-from',reqA);await kp2.fill('#to-note','E2E manager');
  await cap('addTimeOff',()=>kp2.click('dialog[open] button.btn.primary:has-text("Save")'));
  await kp2.waitForTimeout(800);
  ok("location manager: their own request waits for an admin, not their office",timeOffOf(K2,reqA).startsWith(`PENDING|${K2}|`),timeOffOf(K2,reqA));

  // ---- approvals: a location manager decides their office's requests; an admin decides the rest, and their own is for another admin
  await go(rav,'/approvals');
  const rsec=rav.locator('section:has(h2:has-text("Time off requests"))');
  ok('location manager: sees a member of their office asking for time off',(await rsec.locator('.item',{hasText:'Klh Test'}).count())===1);
  ok("location manager: does not see another location manager's request",(await rsec.locator('.item',{hasText:'Klh Manager Test'}).count())===0);
  await cap('approveTimeOff',()=>rsec.locator('.item',{hasText:'Klh Test'}).locator('button:has-text("Approve")').click());
  await rav.waitForLoadState('networkidle');await rav.waitForTimeout(700);
  ok("location manager: approving a member's request makes it approved, with them as the one who decided",timeOffOf(K,reqA).startsWith(`APPROVED|${K}|${RAVI}|`),timeOffOf(K,reqA));
  const craftApprove=await act(rav,'/approvals','approveTimeOff',{id:idOf(K2,reqA)});
  ok("location manager: cannot approve another location manager's request, even by a crafted call",refused(craftApprove)&&timeOffOf(K2,reqA).startsWith('PENDING|'),craftApprove.text.slice(0,160));
  await go(dan,'/approvals');
  ok('team manager: no time off requests section, since they do not decide them',(await dan.locator('h2:has-text("Time off requests")').count())===0);
  await go(mp,'/approvals');
  const selfApprove=await act(mp,'/time-off','approveTimeOff',{id:idOf(M,reqA)});
  ok('member: cannot approve their own request, even by a crafted call',timeOffOf(M,reqA).startsWith('PENDING|'),selfApprove.text.slice(0,120));
  await go(adm,'/approvals');
  const asec=adm.locator('section:has(h2:has-text("Time off requests"))');
  ok("admin: sees everyone's requests, including a location manager's",(await asec.locator('.item',{hasText:'Klh Manager Test'}).count())===1&&(await asec.locator('.item',{hasText:'Timeoff Test'}).count())>=1);
  await cap('approveTimeOff',()=>asec.locator('.item',{hasText:'Klh Manager Test'}).locator('button:has-text("Approve")').click());
  await adm.waitForLoadState('networkidle');await adm.waitForTimeout(700);
  ok("admin: approves a location manager's request",timeOffOf(K2,reqA).startsWith(`APPROVED|${K2}|${ADM}|`),timeOffOf(K2,reqA));
  // the Timesheet shows time off only once approved
  hol('W',AMD,addDays(ws,2),'E2E Spring Festival');
  const badges=async()=>mp.$$eval('table.sheet thead th',(ths)=>ths.map((th)=>th.querySelector('.dmark')?.textContent??null));
  await go(mp,'/timesheet?view=sheet');
  const before=await badges();
  ok('timesheet: a request still waiting shows no day off',before[4]!=='PTO',JSON.stringify(before));
  await cap('approveTimeOff',()=>asec.locator('.item',{hasText:'E2E first'}).locator('button:has-text("Approve")').click());
  await adm.waitForLoadState('networkidle');await adm.waitForTimeout(700);
  ok('admin: approving a request makes it approved, recorded as theirs',timeOffOf(M,reqA).startsWith(`APPROVED|${M}|${ADM}|`),timeOffOf(M,reqA));
  await go(mp,'/timesheet?view=sheet');
  const after=await badges();
  ok('timesheet: once approved, that day shows PTO, and the holiday shows too',after[4]==='PTO'&&after[3]==='Holiday',JSON.stringify(after));
  // a declined request, with the reason
  const past=asec.locator('.item',{hasText:'E2E past one'});
  await past.locator('button:has-text("Decline")').click();
  await past.locator('input[name="note"]').fill('Please use the leave form next time');
  await cap('declineTimeOff',()=>past.locator('form button:has-text("Decline")').click());
  await adm.waitForLoadState('networkidle');await adm.waitForTimeout(700);
  ok('admin: declines a request with a reason',timeOffOf(M,reqP)===`DECLINED|${M}|${ADM}|Please use the leave form next time`,timeOffOf(M,reqP));
  await go(mp,'/time-off?show=thisyear');
  const declined=mp.locator('table.ctable tbody tr',{hasText:'E2E past one'});
  ok('member: sees the request declined, with the reason',(await declined.count())===1&&/Declined/.test(await declined.innerText())&&(await declined.innerText()).includes('Please use the leave form next time'));

  // ---- the lock date: a request on a locked day can't be approved, and no time off can be added on or before it
  const lockReq=lwd[5];
  const asked=await act(mp,'/time-off','addTimeOff',{from:lockReq,to:lockReq});
  ok('member: asks for a day last month, before the lock',/"ok":true/.test(asked.text)&&timeOffOf(M,lockReq).startsWith('PENDING|'),asked.text.slice(0,120));
  sql(`update "Settings" set "lockBefore"='${lb}'`);
  const lk1=await act(adm,'/approvals','approveTimeOff',{id:idOf(M,lockReq)});
  ok("lock date: a request on or before it can't be approved",refused(lk1,'locked')&&timeOffOf(M,lockReq).startsWith('PENDING|'),lk1.text.slice(0,160));
  const lk2=await act(adm,'/time-off','addTimeOff',{userId:M,from:lwd[6],to:lwd[6]});
  ok('lock date: no time off can be added on or before it',refused(lk2,'locked'),lk2.text.slice(0,160));
  const lk3=await act(adm,'/time-off','addHoliday',{locationId:AMD,date:lb,name:'E2E Locked Add'});
  ok('lock date: no holiday can be added on or before it',refused(lk3,'locked')&&sql(`select count(*) from "Holiday" where name='E2E Locked Add'`)==='0',lk3.text.slice(0,160));
  hol('L',AMD,lb,'E2E Locked Day');
  const lk4=await act(adm,'/time-off','removeHoliday',{id:`${t}hL`});
  ok('lock date: a holiday on or before it can not be removed',refused(lk4,'locked')&&sql(`select count(*) from "Holiday" where id='${t}hL'`)==='1',lk4.text.slice(0,160));
  sql(`update "Settings" set "lockBefore"=${lockOld?`'${lockOld}'`:'null'}`);

  // ---- on someone's behalf: a location manager or admin adds time off for someone in their scope, and it counts at once
  const hb=addDays(ws,10);
  await go(rav,'/time-off');
  ok('location manager: the button says Add time off, since they can add it for others',(await rav.locator('main button.btn.primary:has-text("Add time off")').count())===1);
  await rav.click('main button.btn.primary:has-text("Add time off")');await rav.waitForSelector('dialog[open] #to-person');
  const opts=await rav.$$eval('dialog[open] #to-person option',(os)=>os.map((o)=>o.textContent.trim()));
  ok("location manager: the person picker lists their office, not another location manager",opts.some((o)=>o.includes('Klh Test'))&&!opts.some((o)=>o.includes('Klh Manager Test')),opts.join(', '));
  await rav.selectOption('#to-person',{label:'Klh Test'});
  await rav.fill('#to-from',hb);await rav.fill('#to-to',hb);
  await rav.selectOption('#to-type','Sick leave');
  await cap('addTimeOff',()=>rav.click('dialog[open] button.btn.primary:has-text("Save")'));
  await rav.waitForSelector('dialog[open]',{state:'detached'});await rav.waitForLoadState('networkidle');
  ok('location manager: time off added for a member counts at once, recorded as theirs',timeOffOf(K,hb).startsWith(`APPROVED|${RAVI}|${RAVI}|`),timeOffOf(K,hb));
  const lmK2=await act(rav,'/time-off','addTimeOff',{userId:K2,from:addDays(ws,12),to:addDays(ws,12)});
  ok('location manager: cannot add time off for another location manager (crafted call)',refused(lmK2,'Only admins')&&sql(`select count(*) from "TimeOff" where "userId"='${K2}' and "startDate"='${addDays(ws,12)}'`)==='0',lmK2.text.slice(0,160));
  await go(dan,'/time-off');
  ok('team manager: the button asks for their own time off, with no person picker',(await dan.locator('main button.btn.primary:has-text("Request time off")').count())===1);
  const dr=await act(dan,'/time-off','addTimeOff',{userId:PRIYA,from:addDays(ws,12),to:addDays(ws,12)});
  ok("team manager: cannot add time off for a team member (crafted call)",refused(dr,'Only location managers and admins')&&sql(`select count(*) from "TimeOff" where "userId"='${PRIYA}' and "startDate"='${addDays(ws,12)}'`)==='0',dr.text.slice(0,160));
  const ar=await act(adm,'/time-off','addTimeOff',{userId:M,from:addDays(ws,12),to:addDays(ws,12),type:'PTO'});
  ok('admin: adds time off for anyone at once',/"ok":true/.test(ar.text)&&timeOffOf(M,addDays(ws,12)).startsWith(`APPROVED|${ADM}|${ADM}|`),ar.text.slice(0,120));
  const rm=await act(mp,'/time-off','removeTimeOff',{id:idOf(K,hb)});
  ok("member: cannot remove someone else's time off (crafted call)",refused(rm)&&sql(`select count(*) from "TimeOff" where "userId"='${K}' and "startDate"='${hb}'`)==='1',rm.text.slice(0,120));

  // ---- rows from another system: shown with a badge, never changed from the app
  off('5',M,addDays(ws,20),addDays(ws,20),1,'keka','PTO','K-1001');
  await go(adm,'/time-off');
  const keka=adm.locator('table.ctable tbody tr',{hasText:'Keka'});
  ok('a row from another system shows its source and has no Remove',(await keka.count())===1&&(await keka.locator('button:has-text("Remove")').count())===0);
  const kr=await act(adm,'/time-off','removeTimeOff',{id:`${t}o5`});
  ok("...and even an admin can't remove it (crafted call)",refused(kr,'another system')&&sql(`select count(*) from "TimeOff" where id='${t}o5'`)==='1',kr.text.slice(0,160));

  // ---- reminders skip the days someone is approved off (weekdays only)
  const dailyOn=sql(`select "remindDaily"::text||'|'||"dailyMinimum" from "Settings"`).split('|');
  if(dow(today)<5&&dailyOn[0]==='true'&&+dailyOn[1]>0){
   const secret=(require('fs').readFileSync(process.env.ENVFILE||'/tmp/cm-demo/.env','utf8').match(/^CRON_SECRET="?([^"\n]+)"?/m)||[])[1];
   const cron=async()=>(await (await fetch(BASE+'/api/cron/reminders',{headers:{authorization:`Bearer ${secret}`}})).json()).sent.daily;
   const pv=dow(today)===0?addDays(today,-3):addDays(today,-1);
   sql(`update "User" set "createdAt"=now()-interval '200 days' where id='${M}'`);
   sql(`delete from "TimeEntry" where "userId"='${M}' and date='${pv}'`);
   const c0=await cron();
   off('6',M,pv,pv);
   const c1=await cron();
   ok('reminders: a person with the day approved off is not reminded',c1===c0-1,`${c0} then ${c1}`);
   sql(`delete from "TimeOff" where id='${t}o6'`);off('7',M,pv,pv,0.5);
   const c2=await cron();
   ok('reminders: half a day off halves the minimum, so someone with no time is still reminded',c2===c0,`${c0} then ${c2}`);
   sql(`delete from "TimeOff" where id='${t}o7'`);
  } else ok('reminders: skipped (weekend or reminders off)',true);

  // ---- the page after it all
  for(const p of pages){const bad=p.errs.filter((e)=>!/Failed to load resource/.test(e));ok(`no page errors (${p.url().replace(BASE,'')})`,bad.length===0,bad.slice(0,2).join(' | '));}
 }finally{
  sql(`update "Settings" set "lockBefore"=${lockOld?`'${lockOld}'`:'null'}`);
  const list=ALL.map((x)=>`'${x}'`).join(',');
  sql(`delete from "Holiday" where name like 'E2E %'`);
  sql(`delete from "TimeOff" where "userId" in (${list}) or id like '${t}%' or ("userId" in ('${PRIYA}') and "createdById" in ('${DAN}','${RAVI}','${ADM}') and "createdAt" > now() - interval '1 day')`);
  sql(`delete from "AuditLog" where "userId" in (${list}) or "targetUserId" in (${list}) or action like '%E2E %' or action like 'Added % public holiday%' or action like 'Removed public holiday E2E%' or ("targetUserId" in ('${PRIYA}') and (action like 'Added Sick leave for%' or action like 'Removed Sick leave for%'))`);
  sql(`delete from "User" where id in (${list})`);
  await b.close();
 }
})().catch((e)=>{console.error(e);process.exit(1);});
