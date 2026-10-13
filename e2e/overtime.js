// Overtime (OT) is time tagged "OT". It is highlighted while a timesheet is reviewed (Approvals, and Review time from there)
// and nowhere else: the reports, the CSV and every other screen treat the tag like any other tag.
// Sets up its own test people, submitted weeks and tags directly in the local database, and removes them again.
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

(async()=>{
 const b=await start();
 const t='ot'+process.pid, A=t+'a', B=t+'b', C=t+'c', Z=t+'z', D=t+'d', ALL=[A,B,C,Z,D];
 const TOT=t+'T', TLOW=t+'t', TCAD=t+'c1'; // the OT tag, a tag called "ot", and another tag
 const daniel=sql(`select id||'|'||"locationId"||'|'||"teamId"||'|'||"passwordHash" from "User" where email='daniel@example.com'`).split('|');
 const tz=sql(`select "timeZone" from "Settings"`), format=sql(`select "timeFormat" from "Settings"`);
 const today=sql(`select to_char(now() at time zone '${tz}','YYYY-MM-DD')`);
 const f=(m)=>format==='hhmm'?`${Math.floor(Math.round(m)/60)}:${String(Math.round(m)%60).padStart(2,'0')}`:(m/60).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
 const [pa,xa]=sql(`select p.id||'|'||ph.id from "Project" p join "Phase" ph on ph."projectId"=p.id where p.access='PUBLIC' and not p.archived and ph.sort<999 order by p.name, ph.sort limit 1`).split('|');
 const W=addDays(mondayOf(today),-14); // two weeks ago, Monday to Sunday
 const WE=addDays(W,6);
 const hadOt=sql(`select count(*) from "Tag" where lower(name)='ot'`)!=='0';
 if(hadOt){console.log('SKIP the database already has a tag called OT; this test needs to create its own');await b.close();return;}
 const ins=(uid,name,target)=>sql(`insert into "User"(id,email,name,"passwordHash",role,"locationId","teamId","weeklyTarget","createdAt") values('${uid}','${uid}@example.com','${name}','${daniel[3]}','MEMBER','${daniel[1]}','${daniel[2]}',${target},now()-interval '200 days')`);
 const entry=(uid,n,d,minutes,tags=[])=>sql(`insert into "TimeEntry"(id,"userId","projectId","phaseId","tagIds",date,"startMin",minutes,description,custom,"createdAt") values('${uid}e${n}','${uid}','${pa}','${xa}','{${[...tags].sort().join(',')}}','${d}',540,${minutes},'work','{}',now())`);
 const submit=(uid)=>sql(`insert into "Timesheet"(id,"userId","weekStart",status,"updatedAt") values('${uid}s','${uid}','${W}','SUBMITTED',now())`);
 try{
  sql(`insert into "Tag"(id,name) values('${TOT}','OT'),('${TCAD}','E2E Other Tag')`);
  // A: 40 h as usual, plus Thursday's 2 h and Friday's 3 h tagged OT: 5 h OT in 2 entries (45 h in all).
  ins(A,'Overtime Alpha',40);for(let i=0;i<5;i++)entry(A,i,addDays(W,i),480);entry(A,5,addDays(W,3),120,[TOT]);entry(A,6,addDays(W,4),180,[TOT]);submit(A);
  // B: 40 h, every entry has some other tag, none is OT.
  ins(B,'Overtime Bravo',40);for(let i=0;i<5;i++)entry(B,i,addDays(W,i),480,[TCAD]);submit(B);
  // C: one entry with two tags, one of them OT.
  ins(C,'Overtime Charlie',40);for(let i=0;i<4;i++)entry(C,i,addDays(W,i),480);entry(C,4,addDays(W,4),120,[TCAD,TOT]);submit(C);
  // Z: no weekly target at all; the tag still decides.
  ins(Z,'Overtime Zulu',0);entry(Z,0,addDays(W,0),600,[TOT]);submit(Z);

  const lead=await login(b,'daniel@example.com');
  await lead.goto(BASE+'/approvals');await lead.waitForLoadState('networkidle');
  const card=async(name)=>(await lead.locator('.item',{hasText:name}).first().innerText()).replace(/\s+/g,' ');
  const cA=await card('Overtime Alpha'), cB=await card('Overtime Bravo'), cC=await card('Overtime Charlie'), cZ=await card('Overtime Zulu');
  ok('approvals: 5 h tagged OT shows OT 5 h on the card',cA.includes(`OT ${f(300)} h`),cA.slice(0,160));
  ok('approvals: the card is highlighted',(await lead.locator('.item.ot',{hasText:'Overtime Alpha'}).count())===1);
  ok('approvals: no OT tag means no OT and no highlight, whatever other tags it has',!/\bOT\b/.test(cB)&&(await lead.locator('.item.ot',{hasText:'Overtime Bravo'}).count())===0,cB.slice(0,160));
  ok('approvals: an entry with several tags counts when one of them is OT',cC.includes(`OT ${f(120)} h`)&&(await lead.locator('.item.ot',{hasText:'Overtime Charlie'}).count())===1,cC.slice(0,160));
  ok('approvals: the tag decides even with no weekly target',cZ.includes(`OT ${f(600)} h`),cZ.slice(0,160));
  const pill=await lead.locator('.item',{hasText:'Overtime Alpha'}).locator('.pill.p-ot');
  ok('approvals: the OT pill has its own look, not "Under target"',(await pill.count())===1&&(await lead.locator('.item',{hasText:'Overtime Alpha'}).locator('.p-warn').count())===0,`pills ${await pill.count()}, warn ${await lead.locator('.item',{hasText:'Overtime Alpha'}).locator('.p-warn').count()}`);

  // Review time from the card
  const href=await lead.locator('.item',{hasText:'Overtime Alpha'}).locator('a:has-text("Review time")').getAttribute('href');
  ok('review link carries the way back',/ref=approvals/.test(href),href);
  await lead.goto(BASE+href);await lead.waitForLoadState('networkidle');
  let banner=(await lead.locator('.alert.ot').allInnerTexts()).join(' ').replace(/\s+/g,' ');
  ok('review: a banner gives the OT hours, the entries and the person',banner.includes(`OT ${f(300)} h`)&&/2 entries tagged OT in this view \(Overtime Alpha\)/.test(banner),banner);
  // the banner and marks stay on while moving between the report's views
  await lead.click('nav.rtabs a:has-text("Detailed")');await lead.waitForURL(/tab=detailed/);await lead.waitForSelector('table.rtable td[data-l="Date"]');await lead.waitForLoadState('networkidle');
  ok('review: the Detailed view keeps the review link',/ref=approvals/.test(lead.url()));
  banner=(await lead.locator('.alert.ot').allInnerTexts()).join(' ').replace(/\s+/g,' ');
  ok('review: the banner is still there on Detailed, saying the entries are marked below',/OT/.test(banner)&&/marked below/.test(banner),banner);
  const rows=await lead.$$eval('table.rtable tbody tr',(trs)=>trs.map((tr)=>({ot:tr.classList.contains('otrow'),pill:!!tr.querySelector('.p-ot'),hours:tr.querySelector('td[data-l="Hours"]')?.textContent.replace(/\s+/g,' ').trim(),tags:tr.querySelector('td[data-l="Tags"]')?.textContent.trim(),date:tr.querySelector('td[data-l="Date"]')?.textContent.trim()})));
  const marked=rows.filter((r)=>r.ot);
  ok('review: exactly the two entries tagged OT are marked, each with an OT pill and the tag still listed',rows.length===7&&marked.length===2&&marked.every((r)=>r.pill&&r.tags==='OT'&&/OT$/.test(r.hours)),JSON.stringify(rows));
  ok('review: the entries that are not tagged OT are plain',rows.filter((r)=>!r.ot).every((r)=>!r.pill&&!/OT/.test(r.hours)));
  await lead.click('nav.rtabs a:has-text("Summary")');await lead.waitForURL((u)=>!/tab=detailed/.test(u.search));await lead.waitForLoadState('networkidle');
  ok('review: still on the review after another view, and the banner points to Detailed',/ref=approvals/.test(lead.url())&&(await lead.locator('.alert.ot').count())===1&&/Detailed view marks each one/.test(await lead.locator('.alert.ot').innerText()));
  // Charlie: the entry has two tags, and one of them is OT
  await lead.goto(BASE+`/reports?range=custom&from=${W}&to=${WE}&person=${C}&group=project&tab=detailed&ref=approvals`);await lead.waitForLoadState('networkidle');
  const rowsC=await lead.$$eval('table.rtable tbody tr',(trs)=>trs.map((tr)=>({ot:tr.classList.contains('otrow'),tags:tr.querySelector('td[data-l="Tags"]')?.textContent.trim()})));
  ok('review: an entry with two tags is marked, and both tags are listed',rowsC.filter((r)=>r.ot).length===1&&/OT/.test(rowsC.find((r)=>r.ot).tags)&&/E2E Other Tag/.test(rowsC.find((r)=>r.ot).tags),JSON.stringify(rowsC));
  // A person with none tagged OT
  await lead.goto(BASE+`/reports?range=custom&from=${W}&to=${WE}&person=${B}&group=project&tab=detailed&ref=approvals`);await lead.waitForLoadState('networkidle');
  ok('review: a person with nothing tagged OT has no banner and no marks',(await lead.locator('.alert.ot').count())===0&&(await lead.locator('tr.otrow').count())===0);
  // A whole team and a longer period: the same marks (the tag decides, not the length of the period)
  await lead.goto(BASE+`/reports?range=custom&from=${W}&to=${addDays(WE,7)}&group=project&tab=detailed&ref=approvals`);await lead.waitForLoadState('networkidle');
  banner=(await lead.locator('.alert.ot').allInnerTexts()).join(' ').replace(/\s+/g,' ');
  ok('review: two weeks for the whole team still mark every OT entry, with the number of people',/OT/.test(banner)&&/from 3 people/.test(banner)&&(await lead.locator('tr.otrow').count())===4,banner+' / rows '+(await lead.locator('tr.otrow').count()));
  // A tag called "ot" in other capitals counts too
  sql(`insert into "Tag"(id,name) values('${TLOW}','ot')`);ins(D,'Overtime Delta',40);entry(D,0,addDays(W,0),60,[TLOW]);submit(D);
  await lead.goto(BASE+'/approvals');await lead.waitForLoadState('networkidle');
  ok('approvals: a tag written "ot" counts as OT as well',(await card('Overtime Delta')).includes(`OT ${f(60)} h`));
  sql(`update "Tag" set name='Overtime pay' where id='${TOT}'`);sql(`update "Tag" set name='Overtime hours' where id='${TLOW}'`);
  await lead.goto(BASE+'/approvals');await lead.waitForLoadState('networkidle');
  ok('approvals: with no tag called OT, nothing is marked',(await lead.locator('.item.ot, .p-ot').count())===0&&!/\bOT\b/.test(await lead.textContent('main')));
  sql(`update "Tag" set name='OT' where id='${TOT}'`);sql(`delete from "Tag" where id='${TLOW}'`);

  // The reports themselves never show it, with the tag in the data
  const reportUrl=(extra)=>`/reports?range=custom&from=${W}&to=${WE}&person=${A}&group=project${extra}`;
  for(const [label,extra] of [['Summary',''],['Detailed','&tab=detailed']]){
    await lead.goto(BASE+reportUrl(extra));await lead.waitForLoadState('networkidle');
    ok(`reports: ${label} has no overtime highlight`,(await lead.locator('.alert.ot, tr.otrow, .p-ot').count())===0);
  }
  const csv=await lead.evaluate(async(u)=>(await fetch(u)).text(),BASE+`/reports/export?${reportUrl('&tab=detailed').split('?')[1]}`);
  ok('reports: the CSV export has the same columns as ever (OT is only a tag name there)',csv.replace(/^\uFEFF/,'').split(/\r?\n/)[0]==='Date,Person,Email,Office,Team,Client,Project,Phase,Tags,Description,Start,Hours',csv.split('\n')[0]);
  // a team member never reaches the review marks even with the address typed in
  const mem=await login(b,A+'@example.com');
  await mem.goto(BASE+`/reports?range=custom&from=${W}&to=${WE}&person=${A}&group=project&tab=detailed&ref=approvals`);await mem.waitForLoadState('networkidle');
  ok('a team member typing the review address gets no overtime marks (it is for people who approve)',(await mem.locator('.alert.ot, tr.otrow, .p-ot').count())===0);
  for(const p of [lead,mem]){const bad=p.errs.filter((e)=>!/Failed to load resource/.test(e));ok(`no page errors (${p.url().replace(BASE,'').slice(0,50)})`,bad.length===0,bad.slice(0,2).join(' | '));}
 }finally{
  const list=ALL.map((x)=>`'${x}'`).join(',');
  sql(`delete from "AuditLog" where "userId" in (${list}) or "targetUserId" in (${list})`);
  sql(`delete from "User" where id in (${list})`);
  sql(`delete from "Tag" where id in ('${TOT}','${TLOW}','${TCAD}')`);
  await b.close();
 }
})().catch((e)=>{console.error(e);process.exit(1);});
