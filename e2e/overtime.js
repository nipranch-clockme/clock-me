// Overtime (OT) is highlighted while a timesheet is reviewed (Approvals, and Review Time from there) and nowhere else:
// time above the week's expected hours, with a day off or holiday lowering those hours. The other reports never show it.
// Sets up its own test people, submitted weeks and a day off directly in the local database, and removes them again.
// (An office holiday lowers the hours in exactly the same way, but it would lower them for the whole office, so a day off is used here.)
//   BASE=http://localhost:3500 PSQL="psql -h /var/run/postgresql tags_t" node e2e/overtime.js
const {execSync}=require('child_process');
const {start,login,BASE}=require('./helpers');
const PSQL=process.env.PSQL||'psql -h /tmp -U postgres clockme';
const sql=(q)=>execSync(`${PSQL} -v ON_ERROR_STOP=1 -At`,{input:q}).toString().trim();
const ok=(name,cond,detail='')=>{console.log(`${cond?'PASS':'FAIL'} ${name}${detail?' — '+detail:''}`);if(!cond)process.exitCode=1;};
const toD=(s)=>new Date(s+'T00:00:00Z');
const addDays=(s,n)=>{const x=toD(s);x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10);};
const dow=(s)=>(toD(s).getUTCDay()+6)%7;
const mondayOf=(s)=>addDays(s,-dow(s));
const esc=(s)=>String(s).replace(/'/g,"''");

(async()=>{
 const b=await start();
 const t='ot'+process.pid, A=t+'a', B=t+'b', C=t+'c', Z=t+'z', ALL=[A,B,C,Z];
 const daniel=sql(`select id||'|'||"locationId"||'|'||"teamId"||'|'||"passwordHash" from "User" where email='daniel@example.com'`).split('|');
 const tz=sql(`select "timeZone" from "Settings"`), format=sql(`select "timeFormat" from "Settings"`);
 const today=sql(`select to_char(now() at time zone '${tz}','YYYY-MM-DD')`);
 const f=(m)=>format==='hhmm'?`${Math.floor(Math.round(m)/60)}:${String(Math.round(m)%60).padStart(2,'0')}`:(m/60).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
 const [pa,xa]=sql(`select p.id||'|'||ph.id from "Project" p join "Phase" ph on ph."projectId"=p.id where p.access='PUBLIC' and not p.archived and ph.sort<999 order by p.name, ph.sort limit 1`).split('|');
 const W=addDays(mondayOf(today),-14); // two weeks ago, Monday to Sunday
 const WE=addDays(W,6);
 const ins=(uid,name,target)=>sql(`insert into "User"(id,email,name,"passwordHash",role,"locationId","teamId","weeklyTarget","createdAt") values('${uid}','${uid}@example.com','${name}','${daniel[3]}','MEMBER','${daniel[1]}','${daniel[2]}',${target},now()-interval '200 days')`);
 const entry=(uid,n,d,start,minutes)=>sql(`insert into "TimeEntry"(id,"userId","projectId","phaseId","tagIds",date,"startMin",minutes,description,custom,"createdAt") values('${uid}e${n}','${uid}','${pa}','${xa}','{}','${d}',${start},${minutes},'work','{}',now())`);
 const submit=(uid)=>sql(`insert into "Timesheet"(id,"userId","weekStart",status,"updatedAt") values('${uid}s','${uid}','${W}','SUBMITTED',now())`);
 try{
  // A: 40 h week, 9 hours Monday to Friday = 45 h, so 5 h over (all of it from Friday's entry).
  ins(A,'Overtime Alpha',40);for(let i=0;i<5;i++)entry(A,i,addDays(W,i),540,540);submit(A);
  // B: exactly 40 h, no overtime.
  ins(B,'Overtime Bravo',40);for(let i=0;i<5;i++)entry(B,i,addDays(W,i),540,480);submit(B);
  // C: a day off on Wednesday makes the week 32 h; 40 h logged is 8 h over (Friday's whole entry).
  ins(C,'Overtime Charlie',40);for(let i=0;i<5;i++)entry(C,i,addDays(W,i),540,480);submit(C);
  sql(`insert into "TimeOff"(id,"userId","startDate","endDate",fraction,label,note,source,"updatedAt") values('${t}h','${C}','${addDays(W,2)}','${addDays(W,2)}',1,'PTO','','manual',now())`);
  // Z: no weekly target at all, so there is no overtime to speak of.
  ins(Z,'Overtime Zulu',0);entry(Z,0,addDays(W,0),540,600);submit(Z);

  const lead=await login(b,'daniel@example.com');
  await lead.goto(BASE+'/approvals');await lead.waitForLoadState('networkidle');
  const card=async(name)=>(await lead.locator('.item',{hasText:name}).first().innerText()).replace(/\s+/g,' ');
  const cA=await card('Overtime Alpha'), cB=await card('Overtime Bravo'), cC=await card('Overtime Charlie'), cZ=await card('Overtime Zulu');
  ok('approvals: 45 h against 40 h shows OT 5 h on the card',cA.includes(`OT ${f(300)} h`)&&cA.includes(`${f(2700)} of ${f(2400)} h target`),cA.slice(0,160));
  ok('approvals: the card is highlighted',(await lead.locator('.item.ot',{hasText:'Overtime Alpha'}).count())===1);
  ok('approvals: exactly 40 h has no OT and is not highlighted',!/\bOT\b/.test(cB)&&(await lead.locator('.item.ot',{hasText:'Overtime Bravo'}).count())===0,cB.slice(0,160));
  ok('approvals: a week with a day off expects 32 h, so 40 h logged is OT 8 h',cC.includes(`OT ${f(480)} h`)&&cC.includes(`${f(2400)} of ${f(1920)} h expected`),cC.slice(0,200));
  ok('approvals: no weekly target means no OT',!/\bOT\b/.test(cZ),cZ.slice(0,160));
  const pill=await lead.locator('.item',{hasText:'Overtime Alpha'}).locator('.pill.p-ot');
  ok('approvals: the OT pill is not styled like "Under target"',(await pill.count())===1&&(await lead.locator('.item',{hasText:'Overtime Alpha'}).locator('.p-warn').count())===0);

  // Review Time from the card
  const href=await lead.locator('.item',{hasText:'Overtime Alpha'}).locator('a:has-text("Review Time")').getAttribute('href');
  ok('review link carries the way back',/ref=approvals/.test(href),href);
  await lead.goto(BASE+href);await lead.waitForLoadState('networkidle');
  let banner=(await lead.locator('.alert.ot').allInnerTexts()).join(' ').replace(/\s+/g,' ');
  ok('review: a banner names the overtime, the hours logged and the expected hours',banner.includes(`OT ${f(300)} h`)&&banner.includes('Overtime Alpha')&&banner.includes(`${f(2700)} h`)&&banner.includes(`${f(2400)} h expected`),banner);
  // the banner and marks stay on while moving between the report's views
  await lead.click('nav.rtabs a:has-text("Detailed")');await lead.waitForURL(/tab=detailed/);await lead.waitForSelector('table.rtable td[data-l="Date"]');await lead.waitForLoadState('networkidle');
  ok('review: the Detailed view keeps the review link',/ref=approvals/.test(lead.url()));
  banner=(await lead.locator('.alert.ot').allInnerTexts()).join(' ');
  ok('review: the banner is still there on Detailed',/OT/.test(banner));
  const rows=await lead.$$eval('table.rtable tbody tr',(trs)=>trs.map((tr)=>({ot:tr.classList.contains('otrow'),hours:tr.querySelector('td[data-l="Hours"]')?.textContent.replace(/\s+/g,' ').trim(),date:tr.querySelector('td[data-l="Date"]')?.textContent.trim()})));
  const marked=rows.filter((r)=>r.ot);
  ok('review: exactly one entry is marked, the last one worked (Friday), with the part that is OT',rows.length===5&&marked.length===1&&/Fri|Oct|Sep/.test(marked[0].date)&&marked[0].hours===`${f(540)} OT ${f(300)}`,JSON.stringify(rows));
  ok('review: that row is the Friday of the week',marked[0]&&marked[0].date.startsWith(new Date(addDays(W,4)+'T00:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'})),marked[0]?.date);
  await lead.click('nav.rtabs a:has-text("Weekly")');await lead.waitForURL(/tab=weekly/);await lead.waitForLoadState('networkidle');
  ok('review: still on the review after another view',/ref=approvals/.test(lead.url())&&(await lead.locator('.alert.ot').count())===1);
  // Charlie: a week with a day off; Friday is the whole 8 h
  await lead.goto(BASE+`/reports?range=custom&from=${W}&to=${WE}&person=${C}&group=project&tab=detailed&ref=approvals`);await lead.waitForLoadState('networkidle');
  const rowsC=await lead.$$eval('table.rtable tbody tr',(trs)=>trs.map((tr)=>({ot:tr.classList.contains('otrow'),hours:tr.querySelector('td[data-l="Hours"]')?.textContent.replace(/\s+/g,' ').trim()})));
  ok('review: a week with a day off marks the whole last entry as OT',rowsC.filter((r)=>r.ot).length===1&&rowsC.find((r)=>r.ot).hours===`${f(480)} OT`,JSON.stringify(rowsC));
  // A different period or more than one person: no banner (OT is for one person and one whole week)
  await lead.goto(BASE+`/reports?range=custom&from=${W}&to=${addDays(WE,7)}&person=${A}&group=project&tab=detailed&ref=approvals`);await lead.waitForLoadState('networkidle');
  ok('review: two weeks together show no overtime (it is worked out a week at a time)',(await lead.locator('.alert.ot').count())===0&&(await lead.locator('tr.otrow').count())===0);
  await lead.goto(BASE+`/reports?range=custom&from=${W}&to=${WE}&group=project&tab=detailed&ref=approvals`);await lead.waitForLoadState('networkidle');
  ok('review: a whole team (no single person) shows no overtime',(await lead.locator('.alert.ot').count())===0&&(await lead.locator('tr.otrow').count())===0);

  // The reports themselves never show it
  const reportUrl=(extra)=>`/reports?range=custom&from=${W}&to=${WE}&person=${A}&group=project${extra}`;
  for(const [label,extra] of [['Summary',''],['Detailed','&tab=detailed'],['Weekly','&tab=weekly']]){
    await lead.goto(BASE+reportUrl(extra));await lead.waitForLoadState('networkidle');
    const text=await lead.textContent('main');
    ok(`reports: ${label} has no overtime highlight`,!/\bOT\b/.test(text)&&(await lead.locator('.alert.ot, tr.otrow, .p-ot').count())===0);
  }
  const csv=await lead.evaluate(async(u)=>(await fetch(u)).text(),BASE+`/reports/export?${reportUrl('&tab=detailed').split('?')[1]}`);
  ok('reports: the CSV export has no overtime column or marks',!/\bOT\b/.test(csv)&&csv.split('\n')[0].toLowerCase().includes('hours'),csv.split('\n')[0]);
  // a team member never reaches the review screen's banner even with the address typed in
  const mem=await login(b,A+'@example.com');
  await mem.goto(BASE+`/reports?range=custom&from=${W}&to=${WE}&person=${A}&group=project&tab=detailed&ref=approvals`);await mem.waitForLoadState('networkidle');
  ok('a team member typing the review address gets no overtime view (it is for people who approve)',(await mem.locator('.alert.ot, tr.otrow, .p-ot').count())===0&&!/\bOT\b/.test(await mem.textContent('main')));
  for(const p of [lead,mem]){const bad=p.errs.filter((e)=>!/Failed to load resource/.test(e));ok(`no page errors (${p.url().replace(BASE,'').slice(0,50)})`,bad.length===0,bad.slice(0,2).join(' | '));}
 }finally{
  const list=ALL.map((x)=>`'${x}'`).join(',');
  sql(`delete from "AuditLog" where "userId" in (${list}) or "targetUserId" in (${list})`);
  sql(`delete from "User" where id in (${list})`);
  await b.close();
 }
})().catch((e)=>{console.error(e);process.exit(1);});
