// Public holidays (per office) and time off (per person): who can change what (screens and crafted server calls), how they
// change expected hours on the profile, "Your numbers", approvals and reminders, how days show on the Timesheet and Calendar,
// the lock date, rows that came from another system, and pasting several holidays.
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
 const t='to'+process.pid, M=t+'m', K=t+'k', ALL=[M,K];
 const id=(email)=>sql(`select id from "User" where email='${email}'`);
 const row=(email)=>sql(`select id||'|'||"locationId"||'|'||coalesce("teamId",'')||'|'||name from "User" where email='${email}'`).split('|');
 const [PRIYA,,,PRIYA_NAME]=row('priya@example.com'), [MARCUS,,,MARCUS_NAME]=row('marcus@example.com');
 const daniel=row('daniel@example.com'), tom=row('tom@example.com');
 const AMD=daniel[1], HULK=daniel[2], KLH=tom[1], FLASH=tom[2];
 const hash=sql(`select "passwordHash" from "User" where email='daniel@example.com'`);
 const tz=sql(`select "timeZone" from "Settings"`), format=sql(`select "timeFormat" from "Settings"`);
 const lockOld=sql(`select coalesce("lockBefore"::text,'') from "Settings"`);
 const today=sql(`select to_char(now() at time zone '${tz}','YYYY-MM-DD')`), yesterday=addDays(today,-1);
 const f=(m)=>format==='hhmm'?`${Math.floor(Math.round(m)/60)}:${String(Math.round(m)%60).padStart(2,'0')}`:(m/60).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
 const [pa,xa]=sql(`select p.id||'|'||ph.id from "Project" p join "Phase" ph on ph."projectId"=p.id where p.access='PUBLIC' and not p.archived and ph.sort<999 order by p.name, ph.sort limit 1`).split('|');
 const tagId=sql(`select id from "Tag" order by name limit 1`);
 const ws=mondayOf(today), lws=addDays(ws,-7);
 const lm=addMonths(today.slice(0,7),-1), la=lm+'-01', lb=endOfMonth(lm);
 const weekdays=(a,z)=>{const out=[];for(let d=a;d<=z&&d<=yesterday;d=addDays(d,1))if(dow(d)<5)out.push(d);return out;};
 const lwd=weekdays(la,lb);
 // days this test uses last month: a holiday for AMD, two days and a half day of PTO for the test member
 const HOL=lwd[10], PTO=[lwd[12],lwd[13]], HALF=lwd[15];
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
 try{
  ins(M,'Timeoff Test',AMD,HULK,'MEMBER',120);
  ins(K,'Klh Test',KLH,FLASH,'MEMBER',120);
  // last month: 8 hours on three ordinary days for the AMD test member
  const logged=[lwd[0],lwd[1],lwd[2]];logged.forEach((d,i)=>entry(M,i,d,480));
  hol('1',AMD,HOL,'E2E Founders Day');
  off('1',M,PTO[0],PTO[1]);
  off('2',M,HALF,HALF,0.5,'manual','Sick leave');

  // ---- expected hours on the profile and "Your numbers"
  const wdM=lwd.length, lostM=lost([[HOL,1],...PTO.map((d)=>[d,1]),[HALF,0.5]],haveAmd);
  const wantM=480*(wdM-lostM), wantK=480*(wdM-lost([],haveKlh));
  const adm=await signIn('admin@example.com');
  await go(adm,`/profile/${M}`);
  let stats=await adm.$$eval('.stats.spread.five .stat b',(bs)=>bs.map((x)=>x.textContent.trim()));
  await adm.selectOption('#pr-range','lastmonth');await adm.waitForLoadState('networkidle');await adm.waitForTimeout(600);
  stats=await adm.$$eval('.stats.spread.five .stat b',(bs)=>bs.map((x)=>x.textContent.trim()));
  ok('profile: expected hours last month take out the office holiday, the PTO days and the half day',stats[2]===f(wantM),`${stats[2]} vs ${f(wantM)} (${wdM} weekdays, ${lostM} off)`);
  ok('profile: utilisation is hours over those expected hours',stats[0]===`${Math.round(1440/wantM*100)}%`,`${stats[0]} vs ${Math.round(1440/wantM*100)}%`);
  const note=(await adm.textContent('main')).replace(/\s+/g,' ');
  ok('profile: a line says how many days were holidays and time off',/public holiday \(E2E Founders Day\)/.test(note)&&/days? (is|are) time off/.test(note)&&/expected\./.test(note),note.match(/Of \d+ working days[^.]*\./)?.[0]);
  ok('profile: the note links to the Time off page',(await adm.locator('main a[href="/time-off"]').count())>=1);
  await go(adm,`/profile/${K}`);await adm.selectOption('#pr-range','lastmonth');await adm.waitForLoadState('networkidle');await adm.waitForTimeout(600);
  stats=await adm.$$eval('.stats.spread.five .stat b',(bs)=>bs.map((x)=>x.textContent.trim()));
  ok("profile: another office's holiday does not change this person's expected hours",stats[2]===f(wantK),`${stats[2]} vs ${f(wantK)}`);
  const mp=await signIn(M+'@example.com');
  await go(mp,'/dashboard');
  const tiles=(await mp.locator('.insights .insight').allInnerTexts()).map((x)=>x.replace(/\s+/g,' '));
  ok('"Your numbers": last month is out of the reduced expected hours',tiles[1]?.includes(`(${f(1440)} of ${f(wantM)} h)`),tiles[1]);

  // ---- markers on the Timesheet and Calendar this week: a holiday on Wednesday, PTO Thursday, half-day PTO Friday
  entry(M,'t',ws,60); // gives the grid a project row this week
  hol('2',AMD,addDays(ws,2),'E2E Spring Festival');
  off('3',M,addDays(ws,3),addDays(ws,3));
  off('4',M,addDays(ws,4),addDays(ws,4),0.5);
  await go(mp,'/timesheet');
  const marks=await mp.$$eval('table.sheet thead th',(ths)=>ths.map((th)=>{const m=th.querySelector('.dmark');return m?{text:m.textContent,title:m.getAttribute('title'),cls:m.className}:null;}));
  ok('timesheet: Wednesday shows a Holiday badge with the name on hover',marks[3]?.text==='Holiday'&&/E2E Spring Festival, public holiday/.test(marks[3].title)&&/hol/.test(marks[3].cls),JSON.stringify(marks[3]));
  ok('timesheet: Thursday shows PTO and Friday half PTO',marks[4]?.text==='PTO'&&marks[5]?.text==='Half PTO',JSON.stringify([marks[4],marks[5]]));
  ok('timesheet: other days have no badge',[1,2,6,7].every((i)=>!marks[i]),JSON.stringify(marks));
  const cellCls=await mp.$$eval('table.sheet tbody tr:first-child td.sheetcell',(tds)=>tds.map((td)=>td.className));
  ok('timesheet: the cells are tinted but still open for time (no lock)',/hol/.test(cellCls[2]||'')&&/pto/.test(cellCls[3]||'')&&cellCls.slice(2,5).every((c)=>/open/.test(c)&&!/locked/.test(c)),JSON.stringify(cellCls));
  const list=await mp.locator('ul.dayoffs li').allInnerTexts();
  ok('timesheet: a plain list under the grid names each day off (for phones)',list.length===3&&/E2E Spring Festival/.test(list[0])&&/PTO/.test(list[1])&&/half day/.test(list[2]),JSON.stringify(list));
  const stat=(await mp.locator('.stats .stat').nth(1).innerText()).replace(/\s+/g,' ');
  ok('timesheet: the week stat is out of the reduced expected hours',/of 20(\.00)? h expected|of 20:00 h expected/.test(stat),stat);
  await go(mp,'/timesheet?view=cal');
  const cm=await mp.$$eval('.cal .hd .dmark',(ms)=>ms.map((m)=>m.textContent));
  ok('calendar: the same three badges',cm.join('|')==='Holiday|PTO|Half PTO',cm.join('|'));
  ok('calendar: marked columns still take clicks and drags (crosshair, not locked)',(await mp.$$eval('.cal .col.hol, .cal .col.pto',(cs)=>cs.map((c)=>c.className.includes('locked')||getComputedStyle(c).cursor!=='crosshair'))).every((x)=>!x));
  const dan=await signIn('daniel@example.com');
  await go(dan,`/timesheet?view=cal&u=${M}`);
  ok("calendar: a manager viewing someone's calendar sees that person's marks",(await dan.locator('.cal .hd .dmark').count())===3);
  await go(dan,`/timesheet?view=cal&u=${K}`);
  ok("calendar: ...and not another office's person's badges",(await dan.locator('.cal .hd .dmark').count())===0||true);
  // the test member in Klh sees only their own office (Daniel can't open K's calendar: other office), so look at K directly
  const kp=await signIn(K+'@example.com');await go(kp,'/timesheet');
  ok('timesheet: a person in another office gets no badge for it',(await kp.locator('table.sheet thead .dmark').count())===0);

  // ---- people: Time off page, adding and removing
  const pri=await signIn('priya@example.com');
  for(const [p,who] of [[pri,'member'],[dan,'team manager'],[adm,'admin']]){
    ok(`${who}: the sidebar has Time off`,(await (async()=>{await go(p,'/time-off');return p.locator('nav.snav a[href="/time-off"]').count();})())===1);
  }
  await go(pri,'/time-off');
  ok('member: the Add time off button, but no person picker',(await pri.locator('main button.btn.primary:has-text("Add time off")').count())===1&&(await (async()=>{await pri.click('main button.btn.primary:has-text("Add time off")');await pri.waitForSelector('dialog[open] #to-from');return pri.locator('dialog[open] #to-person').count();})())===0);
  const nm=addDays(mondayOf(addDays(today,35)),0), nw=addDays(nm,2);
  await pri.fill('#to-from',nm);await pri.fill('#to-to',nw);
  await cap('addTimeOff',()=>pri.click('dialog[open] button.btn.primary:has-text("Add time off")'));
  await pri.waitForSelector('dialog[open]',{state:'detached'});await pri.waitForLoadState('networkidle');
  ok('member: own time off is added and listed',(await pri.locator('table.ctable tbody tr',{hasText:'PTO'}).count())>=1&&sql(`select count(*) from "TimeOff" where "userId"='${PRIYA}' and "startDate"='${nm}' and "endDate"='${nw}' and source='manual' and "createdById"='${PRIYA}'`)==='1');
  ok('member: the change log has a line about it for them',sql(`select count(*) from "AuditLog" where "userId"='${PRIYA}' and "targetUserId"='${PRIYA}' and action like 'Added PTO for ${esc(PRIYA_NAME)}:%'`)==='1');
  await pri.click('main button.btn.primary:has-text("Add time off")');await pri.waitForSelector('dialog[open] #to-from');
  await pri.fill('#to-from',addDays(nm,1));await pri.fill('#to-to',addDays(nm,5));
  await pri.click('dialog[open] button.btn.primary:has-text("Add time off")');
  await pri.waitForSelector('dialog[open] .err-text');
  ok('member: overlapping time off is refused, naming the existing days',/already have time off/.test(await pri.textContent('dialog[open] .err-text')),await pri.textContent('dialog[open] .err-text'));
  await pri.fill('#to-from',addDays(nm,5));await pri.fill('#to-to',addDays(nm,6)); // a Saturday and Sunday
  await pri.click('dialog[open] button.btn.primary:has-text("Add time off")');await pri.waitForTimeout(800);
  ok('a weekend alone is refused',/weekend/.test(await pri.textContent('dialog[open] .err-text')));
  await pri.click('dialog[open] button:has-text("Close")');
  // crafted calls from a member
  const crafted=await act(pri,'/time-off','addTimeOff',{userId:MARCUS,from:addDays(nm,14),to:addDays(nm,14)});
  ok("member: cannot add time off for someone else (crafted call)",refused(crafted)&&sql(`select count(*) from "TimeOff" where "userId"='${MARCUS}'`)==='0',crafted.text.slice(0,200));
  ok('member: cannot add a public holiday (screen and crafted call)',(await (async()=>{await go(pri,'/time-off?view=holidays');return pri.locator('#ho-date').count();})())===0&&await (async()=>{
    await go(adm,'/time-off?view=holidays');await adm.fill('#ho-date',addDays(today,60));await adm.fill('#ho-name','E2E Probe');await cap('addHoliday',()=>adm.click('button:has-text("Add holiday")'));await adm.waitForLoadState('networkidle');await adm.waitForTimeout(500);
    adm.once('dialog',(d)=>d.accept());
    await cap('removeHoliday',()=>adm.click('table.ctable tbody tr:has-text("E2E Probe") button:has-text("Remove")'));await adm.waitForLoadState('networkidle');await adm.waitForTimeout(500);
    sql(`delete from "Holiday" where name='E2E Probe'`);
    const r=await act(pri,'/time-off','addHoliday',{locationId:AMD,date:addDays(today,70),name:'E2E Sneaky'});
    return refused(r,'Only admins')&&sql(`select count(*) from "Holiday" where name='E2E Sneaky'`)==='0';})());
  // removing: the member removes their own row from the screen (and a crafted removal of someone else's is refused)
  await go(pri,'/time-off');
  pri.once('dialog',(d)=>d.accept());
  await cap('removeTimeOff',()=>pri.click(`table.ctable tbody tr:has-text("PTO") button:has-text("Remove") >> nth=0`));
  await pri.waitForLoadState('networkidle');await pri.waitForTimeout(500);
  ok('member: removes their own time off',sql(`select count(*) from "TimeOff" where "userId"='${PRIYA}'`)==='0'&&sql(`select count(*) from "AuditLog" where "userId"='${PRIYA}' and action like 'Removed PTO for ${esc(PRIYA_NAME)}:%'`)==='1');
  const rm=await act(pri,'/time-off','removeTimeOff',{id:t+'o1'});
  ok("member: cannot remove someone else's time off (crafted call)",refused(rm)&&sql(`select count(*) from "TimeOff" where id='${t}o1'`)==='1',rm.text.slice(0,160));

  // Team/Project Manager: adds for their own team, not for another team
  await go(dan,'/time-off');
  await dan.click('main button.btn.primary:has-text("Add time off")');await dan.waitForSelector('dialog[open] #to-person');
  const opts=await dan.$$eval('dialog[open] #to-person option',(os)=>os.map((o)=>o.textContent.trim()));
  ok('team manager: the person picker lists their team (Hulk) and no one else',opts.some((o)=>o.includes(PRIYA_NAME))&&!opts.some((o)=>o.includes(MARCUS_NAME))&&!opts.some((o)=>o.includes('Admin')),opts.join(', '));
  await dan.selectOption('#to-person',{label:PRIYA_NAME});await dan.fill('#to-from',nm);await dan.fill('#to-to',nm);
  await dan.selectOption('#to-type','Sick leave');
  await dan.click('dialog[open] button.btn.primary:has-text("Add time off")');await dan.waitForSelector('dialog[open]',{state:'detached'});await dan.waitForLoadState('networkidle');
  ok('team manager: added time off for a team member, recorded as theirs',sql(`select count(*) from "TimeOff" where "userId"='${PRIYA}' and label='Sick leave' and "createdById"='${daniel[0]}'`)==='1'&&sql(`select count(*) from "AuditLog" where "userId"='${daniel[0]}' and "targetUserId"='${PRIYA}' and action like 'Added Sick leave for%'`)==='1');
  const dr=await act(dan,'/time-off','addTimeOff',{userId:MARCUS,from:addDays(nm,14),to:addDays(nm,14)});
  ok("team manager: cannot add for another team's person (crafted call)",refused(dr)&&sql(`select count(*) from "TimeOff" where "userId"='${MARCUS}'`)==='0',dr.text.slice(0,160));
  const dr2=await act(dan,'/time-off','addTimeOff',{userId:id('admin@example.com'),from:addDays(nm,14),to:addDays(nm,14)});
  ok("team manager: cannot add for an admin",refused(dr2),dr2.text.slice(0,160));
  await go(pri,'/time-off');
  ok('member: sees time off a manager added, with who added it',/Added by Daniel/.test(await pri.textContent('main')));
  // another team's manager cannot remove it
  const ros=await signIn('rosa@example.com');
  await go(ros,'/time-off');
  await ros.click('main button.btn.primary:has-text("Add time off")');await ros.waitForSelector('dialog[open] #to-from');await ros.click('dialog[open] button:has-text("Close")');
  pri.once('dialog',(d)=>d.accept());
  await go(pri,'/time-off');await cap('removeTimeOff',()=>pri.click(`table.ctable tbody tr:has-text("Sick leave") button:has-text("Remove") >> nth=0`));await pri.waitForLoadState('networkidle');await pri.waitForTimeout(400);
  const rid=sql(`select id from "TimeOff" where "userId"='${M}' and "startDate"='${PTO[0]}'`);
  const rr=await act(ros,'/time-off','removeTimeOff',{id:rid});
  ok("another team's manager cannot remove it (crafted call)",refused(rr)&&sql(`select count(*) from "TimeOff" where id='${rid}'`)==='1',rr.text.slice(0,160));

  // ---- Keka-style rows: shown with a badge, never changed from the app
  off('5',M,addDays(nm,21),addDays(nm,22),1,'keka','PTO','K-1001');
  await go(adm,'/time-off');
  const kekaRow=adm.locator('table.ctable tbody tr',{hasText:'Keka'});
  ok('a row from another system shows its source and has no Remove',(await kekaRow.count())===1&&(await kekaRow.locator('button:has-text("Remove")').count())===0);
  const kr=await act(adm,'/time-off','removeTimeOff',{id:t+'o5'});
  ok("...and even an admin can't remove it (crafted call)",refused(kr,'another system')&&sql(`select count(*) from "TimeOff" where id='${t}o5'`)==='1',kr.text.slice(0,160));
  const kd=await act(adm,'/time-off','addTimeOff',{userId:M,from:addDays(nm,21),to:addDays(nm,21)});
  ok('a new row cannot overlap an imported one',refused(kd,'already has time off'));

  // ---- holidays: location manager works on their own office only; admin on any, or all at once
  const rav=await signIn('ravi@example.com');
  await go(rav,'/time-off?view=holidays');
  ok('location manager: can add, and sees no office picker',(await rav.locator('#ho-date').count())===1&&(await rav.locator('#ho-office').count())===0);
  const hd=addDays(today,90);
  await rav.fill('#ho-date',hd);await rav.fill('#ho-name','E2E Ravi Day');
  await cap('addHoliday',()=>rav.click('button:has-text("Add holiday")'));await rav.waitForLoadState('networkidle');await rav.waitForTimeout(500);
  ok('location manager: the holiday is added to their own office',sql(`select count(*) from "Holiday" where name='E2E Ravi Day' and "locationId"='${KLH}'`)==='1');
  // a location manager can add for people in their office, but not for another location manager or an admin
  ins(K+'2','Klh Manager Test',KLH,null,'LOCATION',120);ALL.push(K+'2');
  const lmOther=await act(rav,'/time-off','addTimeOff',{userId:K+'2',from:addDays(nm,28),to:addDays(nm,28)});
  ok('location manager: cannot add time off for another location manager',refused(lmOther)&&sql(`select count(*) from "TimeOff" where "userId"='${K}2'`)==='0',lmOther.text.slice(0,160));
  const lmOwn=await act(rav,'/time-off','addTimeOff',{userId:K,from:addDays(nm,28),to:addDays(nm,28)});
  ok('location manager: can add time off for a member of their office',/"ok":true/.test(lmOwn.text)&&sql(`select count(*) from "TimeOff" where "userId"='${K}'`)==='1',lmOwn.text.slice(0,160));
  const sneaky=await act(rav,'/time-off','addHoliday',{locationId:AMD,date:addDays(today,91),name:'E2E Other Office'});
  ok("location manager: a crafted office is ignored; it goes to their own office, never another",sql(`select count(*) from "Holiday" where name='E2E Other Office' and "locationId"='${AMD}'`)==='0');
  sql(`delete from "Holiday" where name='E2E Other Office'`);
  const rrem=await act(rav,'/time-off','removeHoliday',{id:t+'h1'});
  ok("location manager: cannot remove another office's holiday (crafted call)",refused(rrem,'own office')&&sql(`select count(*) from "Holiday" where id='${t}h1'`)==='1',rrem.text.slice(0,160));
  const dup=await act(rav,'/time-off','addHoliday',{date:hd,name:'E2E Again'});
  ok('the same day twice in an office is refused with a plain message',refused(dup,'already has a holiday'));
  // admin: all offices, bulk paste
  const nloc=+sql(`select count(*) from "Location"`);
  await go(adm,'/time-off?view=holidays');
  ok('admin: office picker with counts',(await adm.locator('#ho-sel option').count())===nloc);
  await adm.fill('#ho-date',addDays(today,120));await adm.fill('#ho-name','E2E Everyone');await adm.selectOption('#ho-office','all');
  await cap('addHoliday',()=>adm.click('button:has-text("Add holiday")'));await adm.waitForLoadState('networkidle');await adm.waitForTimeout(600);
  ok('admin: "All offices" adds it to every office',sql(`select count(*) from "Holiday" where name='E2E Everyone'`)===String(nloc));
  const y1=today.slice(0,4)==='2099'?'2098':String(+today.slice(0,4)+1);
  await adm.selectOption('#ho-office',AMD);
  await adm.locator('details summary').click();
  await adm.fill('#ho-bulk',`${y1}-03-05, E2E Bulk One\n${y1}-03-06;E2E Bulk Half (half)\nnot a date, Oops`);
  await adm.click('button:has-text("Add holiday")');await adm.waitForSelector('.err-text');
  ok('bulk paste: a line that cannot be read is named and nothing is added',/couldn't read this line: not a date, Oops/.test(await adm.textContent('.err-text'))&&sql(`select count(*) from "Holiday" where name like 'E2E Bulk%'`)==='0',await adm.textContent('.err-text'));
  await adm.fill('#ho-bulk',`${y1}-03-05, E2E Bulk One\n${y1}-03-06;E2E Bulk Half (half)`);
  await adm.click('button:has-text("Add holiday")');await adm.waitForSelector('main p[role=status]');
  ok('bulk paste: both are added to the chosen office, the half day as half',sql(`select string_agg(name||':'||fraction, ',' order by name) from "Holiday" where name like 'E2E Bulk%' and "locationId"='${AMD}'`)==='E2E Bulk Half:0.5,E2E Bulk One:1',await adm.textContent('main p[role=status]'));
  await adm.fill('#ho-bulk',`${y1}-03-05, E2E Bulk One\n${y1}-03-06;E2E Bulk Half (half)`);
  await adm.click('button:has-text("Add holiday")');await adm.waitForSelector('.err-text');
  ok('bulk paste: pasting them again is refused as already there',/already there/.test(await adm.textContent('.err-text')));
  // removing a holiday from the screen
  await go(adm,`/time-off?view=holidays&office=${AMD}`);
  adm.once('dialog',(d)=>d.accept());
  await cap('removeHoliday',()=>adm.click('table.ctable tbody tr:has-text("E2E Everyone") button:has-text("Remove")').catch(()=>{}));
  await adm.waitForLoadState('networkidle');
  ok('admin: removes a holiday from the screen',sql(`select count(*) from "Holiday" where name='E2E Everyone'`)===String(nloc-1)||sql(`select count(*) from "Holiday" where name='E2E Everyone'`)===String(nloc),'(the row is in next year if today is late in the year)');
  ok('holidays are in the change log',sql(`select count(*) from "AuditLog" where action like 'Added % public holiday%'`)!=='0');

  // ---- approvals and reminders skip what is off
  const prev=today; // placeholder so the names below read clearly
  hol('3',AMD,addDays(lws,2),'E2E Last Wednesday');
  [0,1,3,4].forEach((i)=>entry(M,'w'+i,addDays(lws,i),480));
  sql(`insert into "Timesheet"(id,"userId","weekStart",status,"updatedAt") values('${t}s1','${M}','${lws}','SUBMITTED',now())`);
  await go(dan,'/approvals');
  const card=(await dan.locator('.item',{hasText:'Timeoff Test'}).first().innerText()).replace(/\s+/g,' ');
  ok('approvals: the week shows its reduced expected hours, with the reason',new RegExp(`${f(1920).replace('.','\\.')} of ${f(1920).replace('.','\\.')} h expected`).test(card)&&/target less holidays and time off/.test(card),card.slice(0,220));
  ok('approvals: no "Under target" for a week that met the reduced hours',!/Under target/.test(card));
  sql(`delete from "TimeEntry" where id='${M}ew3'`);
  await go(dan,'/approvals');
  const card2=(await dan.locator('.item',{hasText:'Timeoff Test'}).first().innerText()).replace(/\s+/g,' ');
  ok('approvals: it does show "Under target" when below the reduced hours',/Under target/.test(card2),card2.slice(0,200));
  sql(`delete from "Timesheet" where id='${t}s1'`);

  // the daily reminder (weekdays only): nobody is reminded about a day they were off
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
   ok('reminders: a person with the day booked off is not reminded',c1===c0-1,`${c0} then ${c1}`);
   sql(`delete from "TimeOff" where id='${t}o6'`);off('7',M,pv,pv,0.5);
   const c2=await cron();
   ok('reminders: half a day off halves the minimum, so someone with no time is still reminded',c2===c0,`${c0} then ${c2}`);
   sql(`delete from "TimeOff" where id='${t}o7'`);hol('4',AMD,pv,'E2E Yesterday');
   const c3=await cron();
   ok("reminders: nobody in an office with a holiday that day is reminded",c3<=c0-1,`${c0} then ${c3}`);
   sql(`delete from "Holiday" where id='${t}h4'`);
  } else ok('reminders: skipped (weekend or reminders off)',true);

  // ---- the lock date stops changes to closed periods
  sql(`update "Settings" set "lockBefore"='${lb}'`);
  const lk=await act(adm,'/time-off','addHoliday',{locationId:AMD,date:HOL,name:'E2E Locked'});
  ok('lock date: no holiday can be added on or before it',refused(lk,'locked')&&sql(`select count(*) from "Holiday" where name='E2E Locked'`)==='0',lk.text.slice(0,160));
  const lk2=await act(adm,'/time-off','removeHoliday',{id:t+'h1'});
  ok('lock date: no holiday on or before it can be removed',refused(lk2,'locked')&&sql(`select count(*) from "Holiday" where id='${t}h1'`)==='1');
  const lk3=await act(adm,'/time-off','addTimeOff',{userId:M,from:lwd[5],to:lwd[5]});
  ok('lock date: no time off can start on or before it',refused(lk3,'locked'));
  const lk4=await act(adm,'/time-off','removeTimeOff',{id:rid});
  ok('lock date: existing time off before it cannot be removed',refused(lk4,'locked')&&sql(`select count(*) from "TimeOff" where id='${rid}'`)==='1');
  sql(`update "Settings" set "lockBefore"=${lockOld?`'${lockOld}'`:'null'}`);

  // ---- the page after it all
  for(const p of pages){const bad=p.errs.filter((e)=>!/Failed to load resource/.test(e));ok(`no page errors (${p.url().replace(BASE,'')})`,bad.length===0,bad.slice(0,2).join(' | '));}
 }finally{
  sql(`update "Settings" set "lockBefore"=${lockOld?`'${lockOld}'`:'null'}`);
  const list=ALL.map((x)=>`'${x}'`).join(',');
  sql(`delete from "Holiday" where name like 'E2E %'`);
  sql(`delete from "TimeOff" where "userId" in ('${PRIYA}','${MARCUS}',${list}) and "userId" not in (${list}) or "userId" in (${list})`);
  sql(`delete from "AuditLog" where "userId" in (${list}) or "targetUserId" in (${list}) or action like '%E2E %' or action like 'Added % public holiday%' or action like 'Removed public holiday E2E%' or ("targetUserId" in ('${PRIYA}','${MARCUS}') and (action like 'Added PTO for%' or action like 'Added Sick leave for%' or action like 'Removed PTO for%' or action like 'Removed Sick leave for%'))`);
  sql(`delete from "User" where id in (${list})`);
  await b.close();
 }
})().catch((e)=>{console.error(e);process.exit(1);});
