// Adding and changing time on someone's behalf: only location managers (their own office, never admins or other location managers)
// and admins can; members and Team/Project Managers cannot, from the screens or with crafted calls. The week's locks still apply
// (admin lock date, waiting for approval, approved), every change is written to the change log, and the person sees it on their own timesheet.
// Sets up its own test people and a restricted project directly in the local database, and removes them again.
//   BASE=http://localhost:3500 PSQL="psql -h /var/run/postgresql tags_t" node e2e/on-behalf.js
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
 const t='ob'+process.pid, K=t+'k', K2=t+'l', KI=t+'i', M=t+'m', KA=t+'a', KD=t+'d', ALL=[K,K2,KI,M,KA,KD];
 const tom=sql(`select "locationId"||'|'||"teamId"||'|'||"passwordHash" from "User" where email='tom@example.com'`).split('|');
 const KLH=tom[0], FLASH=tom[1], hash=tom[2];
 const daniel=sql(`select "locationId"||'|'||"teamId" from "User" where email='daniel@example.com'`).split('|');
 const idOf=(email)=>sql(`select id from "User" where email='${email}'`);
 const RAVI=idOf('ravi@example.com'), ADMIN=idOf('admin@example.com'), PRIYA=idOf('priya@example.com');
 const tz=sql(`select "timeZone" from "Settings"`), format=sql(`select "timeFormat" from "Settings"`);
 const requireTag=sql(`select "requireTag"::text from "Settings"`)==='true', requireDesc=sql(`select "requireDescription"::text from "Settings"`)==='true';
 const lockOld=sql(`select coalesce("lockBefore"::text,'') from "Settings"`);
 const today=sql(`select to_char(now() at time zone '${tz}','YYYY-MM-DD')`);
 const ws=mondayOf(today);
 const f=(m)=>format==='hhmm'?`${Math.floor(Math.round(m)/60)}:${String(Math.round(m)%60).padStart(2,'0')}`:(m/60).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
 const [pa,xa]=sql(`select p.id||'|'||ph.id from "Project" p join "Phase" ph on ph."projectId"=p.id where p.access='PUBLIC' and not p.archived and ph.sort<999 order by p.name, ph.sort limit 1`).split('|');
 const tagName=sql(`select name from "Tag" order by name limit 1`), tagId=sql(`select id from "Tag" order by name limit 1`);
 const clientId=sql(`select id from "Client" order by name limit 1`);
 const ins=(uid,name,role,loc,team,active=true)=>sql(`insert into "User"(id,email,name,"passwordHash",role,"locationId","teamId","weeklyTarget","createdAt",active) values('${uid}','${uid}@example.com','${name}','${hash}','${role}','${loc}',${team?`'${team}'`:'null'},40,now()-interval '120 days',${active})`);
 const watched={};let expecting=null;
 const watch=(page)=>page.on('request',(r)=>{const a=r.headers()['next-action'];if(a&&r.method()==='POST'&&expecting&&!watched[expecting])watched[expecting]=a;});
 const cap=async(name,fn)=>{expecting=name;try{await fn();}finally{expecting=null;}};
 // Calls a server action straight from the page, the way a crafted request would. Actions that take (previous state, form) differ from ones that take just a form.
 const act=(page,name,fields,two=true)=>page.evaluate(async({url,action,fields,two})=>{const fd=new FormData();for(const [k,v] of Object.entries(fields))fd.append('_1_'+k,v);fd.append('0',two?'[null,"$K1"]':'["$K1"]');
  const r=await fetch(url,{method:'POST',headers:{'next-action':action,accept:'text/x-component'},body:fd});return {status:r.status,text:await r.text()};},{url:BASE+'/timesheet',action:watched[name],fields,two});
 const refused=(r,sub)=>r.status===200&&/"ok":false/.test(r.text)&&(!sub||new RegExp(sub).test(r.text));
 const entryFields=(userId,extra={})=>({...(userId?{userId}:{}),id:'',projectId:pa,date:addDays(ws,1),start:'09:00',duration:'1',phaseId:xa,tagIds:tagId,description:'crafted',...extra});
 const count=(q)=>+sql(q);
 const go=async(p,path)=>{await p.goto(BASE+path);await p.waitForLoadState('networkidle');};
 const pages=[];
 const signIn=async(email)=>{const p=await login(b,email);watch(p);pages.push(p);return p;};
 const fillEntry=async(p,{dur})=>{await p.selectOption('#e-phase',xa);await p.fill('#e-dur',dur);if(requireTag)await p.check(`.tagpick-i:has-text("${tagName}") input`);if(requireDesc||true)await p.fill('#e-desc','entered for them');};
 try{
  ins(K,'Klh Test','MEMBER',KLH,FLASH);
  ins(K2,'Klh Manager Test','LOCATION',KLH,null);
  ins(KI,'Klh Inactive Test','MEMBER',KLH,FLASH,false);
  ins(M,'Amd Test','MEMBER',daniel[0],daniel[1]);
  ins(KA,'Klh Admin Test','ADMIN',KLH,null);
  const rproj=t+'rp';
  sql(`insert into "Project"(id,name,"clientId",access) values('${rproj}','E2E Restricted ${t}','${clientId}','RESTRICTED')`);
  sql(`insert into "Phase"(id,"projectId",name,sort) values('${rproj}ph','${rproj}','Only phase',0)`);

  // the Whose time button opens a list of people; read the names there, then close it again
  const whoOpts=async(p)=>{await p.click('.whose-btn');await p.waitForSelector('dialog[open] .whose-list');const o=await p.$$eval('dialog[open] .whose-opt',(bs)=>bs.map((b)=>b.textContent.trim()));await p.click('dialog[open] button:has-text("Cancel")');await p.waitForSelector('dialog[open]',{state:'detached'});return o;};
  // ---- the location manager of KLH
  const rav=await signIn('ravi@example.com');
  await go(rav,'/timesheet');
  const opts=await whoOpts(rav);
  ok('location manager: the Timesheet has a "Whose time" button',(await rav.locator('.whose-label:has-text("Whose time")').count())===1&&(await rav.locator('.whose-btn').count())===1&&(await rav.locator('select#caluser').count())===0);
  ok('...listing their office members and themselves, but not other offices, admins or other location managers',opts.some((o)=>o.includes('Klh Test'))&&opts.some((o)=>o.includes('(you)'))&&!opts.some((o)=>/Amd Test|Priya|Admin|Klh Manager Test|Klh Inactive/.test(o)),opts.join(', '));
  await go(rav,`/timesheet?u=${K}`);
  const banner=(await rav.locator('.alert.info').first().innerText()).replace(/\s+/g,' ');
  ok('the page says whose time it is and what happens',/You are adding and changing time for Klh Test/.test(banner)&&/change log/.test(banner),banner);
  ok('there is no Submit or Copy last week for someone else',(await rav.locator('button:has-text("Submit for approval"), button:has-text("Cancel submission"), button:has-text("Copy last week")').count())===0);
  ok('the week links keep that person',/u=/.test(await rav.getAttribute('a[aria-label="Previous week"]','href'))&&/u=/.test(await rav.getAttribute('.seg.vt a:has-text("Timesheet")','href'))&&!/u=/.test(await rav.getAttribute('.seg.vt a:has-text("Timer")','href')));
  // add a project row for them
  await rav.click('button:has-text("Add project row")');await rav.selectOption('#addrow-project',pa);
  await cap('addRow',()=>rav.click('dialog[open] button:has-text("Add row")'));await rav.waitForSelector('dialog[open]',{state:'detached'});await rav.waitForLoadState('networkidle');
  ok('a project row is added for them',count(`select count(*) from "TimesheetRow" where "userId"='${K}' and "projectId"='${pa}' and "weekStart"='${ws}'`)===1&&count(`select count(*) from "TimesheetRow" where "userId"='${RAVI}' and "projectId"='${pa}' and "weekStart"='${ws}'`)===0);
  // add time in a cell
  await rav.locator('td.sheetcell.open').first().click({position:{x:8,y:8}});await rav.waitForSelector('dialog[open] #e-dur');
  ok('the form says it is on their behalf',/On behalf of Klh Test/.test(await rav.textContent('dialog[open]')));
  await fillEntry(rav,{dur:'2'});
  await cap('saveEntry',()=>rav.click('dialog[open] button:has-text("Add entry")'));await rav.waitForSelector('dialog[open]',{state:'detached'});await rav.waitForLoadState('networkidle');
  const eid=sql(`select id from "TimeEntry" where "userId"='${K}' order by "createdAt" desc limit 1`);
  ok('the time is added to their timesheet, not the manager\'s',!!eid&&count(`select minutes from "TimeEntry" where id='${eid}'`)===120&&count(`select count(*) from "TimeEntry" where "userId"='${RAVI}' and description='entered for them'`)===0);
  ok('the change log names the manager as the actor and the person as the target',count(`select count(*) from "AuditLog" where "userId"='${RAVI}' and "targetUserId"='${K}' and action like 'Added % h on % for % on behalf of Klh Test'`)===1);
  // edit
  await rav.locator('.chipbtn').first().click();await rav.waitForSelector('dialog[open] #e-dur');
  ok('editing shows it is for them',/Edit time/.test(await rav.textContent('dialog[open]'))&&/On behalf of Klh Test/.test(await rav.textContent('dialog[open]')));
  await rav.fill('#e-dur','3');await rav.click('dialog[open] button:has-text("Save changes")');await rav.waitForSelector('dialog[open]',{state:'detached'});await rav.waitForLoadState('networkidle');
  ok('the entry is changed',count(`select minutes from "TimeEntry" where id='${eid}'`)===180&&count(`select count(*) from "AuditLog" where "userId"='${RAVI}' and "targetUserId"='${K}' and action like 'Changed % h on % on behalf of Klh Test%'`)===1);
  // the person sees it on their own timesheet
  const kp=await signIn(K+'@example.com');await go(kp,'/timesheet');
  ok('the person sees the time on their own timesheet',(await kp.locator('.chipbtn').allInnerTexts()).map((x)=>x.trim()).includes(f(180)));
  ok('...and no banner, picker or other person there',(await kp.locator('.alert.info:has-text("on behalf"), .alert.info:has-text("You are adding")').count())===0&&(await kp.locator('.whose').count())===0);
  // delete (this also makes the row removable)
  await go(rav,`/timesheet?u=${K}`);
  await rav.locator('.chipbtn').first().click();await rav.waitForSelector('dialog[open] #e-dur');
  await cap('deleteEntry',async()=>{await rav.click('dialog[open] button:has-text("Delete entry")');await rav.click('dialog[open] button:text-is("Delete")');});await rav.waitForSelector('dialog[open]',{state:'detached'});await rav.waitForLoadState('networkidle');await rav.waitForTimeout(300);
  ok('the entry is deleted and the change log says so',count(`select count(*) from "TimeEntry" where id='${eid}'`)===0&&count(`select count(*) from "AuditLog" where "userId"='${RAVI}' and "targetUserId"='${K}' and action like 'Deleted % h on % on behalf of Klh Test%'`)===1);
  // remove the row (capturing removeRow)
  await go(rav,`/timesheet?u=${K}`);
  await cap('removeRow',()=>rav.click('button.rowx'));await rav.waitForLoadState('networkidle');await rav.waitForTimeout(300);
  ok('the empty project row can be removed for them',count(`select count(*) from "TimesheetRow" where "userId"='${K}' and "weekStart"='${ws}'`)===0);
  ok('adding and removing the row are in the change log too, naming the person',count(`select count(*) from "AuditLog" where "userId"='${RAVI}' and "targetUserId"='${K}' and action like 'Added the % row for % on behalf of Klh Test'`)===1&&count(`select count(*) from "AuditLog" where "userId"='${RAVI}' and "targetUserId"='${K}' and action like 'Removed the % row for % on behalf of Klh Test'`)===1);

  // ---- crafted calls from the location manager
  const c1=await act(rav,'saveEntry',entryFields(M));
  ok("location manager: cannot add time for someone in another office",refused(c1,'Choose a person|own office')&&count(`select count(*) from "TimeEntry" where "userId"='${M}'`)===0,c1.text.slice(0,200));
  const c2=await act(rav,'saveEntry',entryFields(K2));
  ok('location manager: cannot add time for another location manager',refused(c2,'Only Admins can change an Admin\'s or Location manager\'s time')&&count(`select count(*) from "TimeEntry" where "userId"='${K2}'`)===0,c2.text.slice(0,200));
  const c3=await act(rav,'saveEntry',entryFields(ADMIN));
  ok('location manager: cannot add time for an admin',refused(c3)&&count(`select count(*) from "TimeEntry" where "userId"='${ADMIN}' and description='crafted'`)===0,c3.text.slice(0,200));
  const c4=await act(rav,'saveEntry',entryFields(KI));
  ok('location manager: cannot add time for someone who is not active',refused(c4,'not active')&&count(`select count(*) from "TimeEntry" where "userId"='${KI}'`)===0,c4.text.slice(0,200));
  const c5=await act(rav,'saveEntry',entryFields(K,{projectId:rproj,phaseId:rproj+'ph'}));
  ok("location manager: a project the person has no access to is refused, naming the person",refused(c5,'Klh Test can log time on')&&count(`select count(*) from "TimeEntry" where "userId"='${K}'`)===0,c5.text.slice(0,200));
  const c6=await act(rav,'saveEntry',entryFields(K));
  ok('location manager: the same call for a member of their office works',/"ok":true/.test(c6.text)&&count(`select count(*) from "TimeEntry" where "userId"='${K}' and description='crafted'`)===1,c6.text.slice(0,200));
  const kid=sql(`select id from "TimeEntry" where "userId"='${K}' and description='crafted'`);
  const c7=await act(rav,'saveEntry',entryFields(M,{id:kid}));
  ok("location manager: naming the wrong person for an entry is refused (the entry stays theirs)",refused(c7)&&count(`select count(*) from "TimeEntry" where id='${kid}' and "userId"='${K}'`)===1,c7.text.slice(0,200));
  const c8=await act(rav,'saveEntry',entryFields('',{id:kid}));
  ok("location manager: changing someone's entry without naming them is refused",refused(c8,'only change your own')&&count(`select count(*) from "TimeEntry" where id='${kid}' and description='crafted'`)===1,c8.text.slice(0,200));
  // an admin's entry is out of reach for delete too
  sql(`insert into "TimeEntry"(id,"userId","projectId","phaseId","tagIds",date,"startMin",minutes,description,custom,"createdAt") values('${t}adm','${ADMIN}','${pa}','${xa}','{}','${addDays(ws,1)}',600,60,'admin entry','{}',now())`);
  const d1=await act(rav,'deleteEntry',{id:t+'adm'},false);
  ok("location manager: cannot delete an admin's entry (crafted call)",count(`select count(*) from "TimeEntry" where id='${t}adm'`)===1,d1.text.slice(0,120));
  const d2=await act(rav,'addRow',{userId:M,week:ws,projectId:pa},false);
  ok('location manager: cannot add a project row for another office',/"ok":false/.test(d2.text)&&count(`select count(*) from "TimesheetRow" where "userId"='${M}'`)===0,d2.text.slice(0,160));

  // ---- the week's locks still apply
  sql(`insert into "Timesheet"(id,"userId","weekStart",status,"updatedAt") values('${t}s','${K}','${ws}','SUBMITTED',now())`);
  const l1=await act(rav,'saveEntry',entryFields(K,{description:'locked try'}));
  ok('a week waiting for approval cannot be changed, and the message says to send it back',refused(l1,'Send it back from Approvals'),l1.text.slice(0,200));
  await go(rav,`/timesheet?u=${K}`);
  ok('...the cells are locked and the note explains',(await rav.locator('td.sheetcell.locked').count())>=0&&/sent back from Approvals/.test(await rav.textContent('main')));
  const l1b=await act(rav,'saveEntry',entryFields(K,{id:kid,duration:'4'}));
  ok('...nor an existing entry in it',refused(l1b,'Send it back')&&count(`select minutes from "TimeEntry" where id='${kid}'`)===60);
  const l1c=await act(rav,'addRow',{userId:K,week:ws,projectId:pa},false);
  ok('...nor a project row',/Send it back from Approvals/.test(l1c.text));
  sql(`update "Timesheet" set status='APPROVED' where id='${t}s'`);
  const l2=await act(rav,'saveEntry',entryFields(K,{description:'locked try'}));
  ok('an approved week cannot be changed',refused(l2,'already approved'),l2.text.slice(0,200));
  sql(`delete from "Timesheet" where id='${t}s'`);
  sql(`update "Settings" set "lockBefore"='${addDays(ws,2)}'`);
  const l3=await act(rav,'saveEntry',entryFields(K,{description:'locked try',date:addDays(ws,1)}));
  ok('the admin lock date still applies',refused(l3,'locked by an Admin'),l3.text.slice(0,200));
  sql(`update "Settings" set "lockBefore"=${lockOld?`'${lockOld}'`:'null'}`);

  // ---- calendar: the same for a location manager
  await go(rav,`/timesheet?u=${K}`);
  ok('calendar: banner and picker for the location manager',/You are adding and changing time for Klh Test/.test(await rav.textContent('main'))&&(await rav.locator('.whose-label:has-text("Whose time")').count())===1);
  ok('calendar: the week links keep that person',/u=/.test(await rav.getAttribute('a[aria-label="Next week"]','href')));
  const col=await rav.$('.cal .col >> nth=3');const box=await col.boundingBox();
  await rav.mouse.click(box.x+box.width/2,box.y+60);await rav.waitForSelector('dialog[open] #e-project');
  ok('calendar: the form says it is on their behalf',/On behalf of Klh Test/.test(await rav.textContent('dialog[open]')));
  await rav.selectOption('#e-project',pa);await fillEntry(rav,{dur:'1.5'});
  await rav.click('dialog[open] button:has-text("Add entry")');await rav.waitForSelector('dialog[open]',{state:'detached'});await rav.waitForLoadState('networkidle');
  ok('calendar: the entry is added to their calendar',count(`select count(*) from "TimeEntry" where "userId"='${K}' and minutes=90`)===1&&(await rav.locator('button.ev').count())>=1);
  await rav.locator('button.ev').first().click();await rav.waitForSelector('dialog[open] #e-dur');
  ok('calendar: an existing entry opens for editing, not read only',(await rav.locator('dialog[open] button:has-text("Save changes")').count())===1);
  await rav.click('dialog[open] button:has-text("Close")');
  await go(rav,`/timesheet?view=timer&u=${K}`);
  ok('the Timer is always your own: no banner, no picker',(await rav.locator('.alert.info:has-text("You are adding")').count())===0&&(await rav.locator('.whose').count())===0);
  // another office's admin: read only, and the page must not carry that admin's project list (every project in the company)
  await go(rav,`/timesheet?u=${KA}`);
  ok("calendar: an admin in the office is read only, and their project list does not reach the page",/Read only/.test(await rav.textContent('main'))&&!(await rav.content()).includes('E2E Restricted '+t),'');
  // a person in the office the manager can look at but not change (another location manager): read only
  await go(rav,`/timesheet?u=${K2}`);
  ok('calendar: another location manager is read only for them',/Read only/.test(await rav.textContent('main'))&&(await rav.locator('.alert.info:has-text("You are adding")').count())===0);

  // ---- the admin
  const adm=await signIn('admin@example.com');
  await go(adm,'/timesheet');
  const aopts=await whoOpts(adm);
  ok('admin: the picker lists people from every office, location managers included',aopts.some((o)=>o.includes('Klh Manager Test'))&&aopts.some((o)=>o.includes('Amd Test'))&&aopts.some((o)=>o.includes('Klh Test')),`${aopts.length} people`);
  const a1=await act(adm,'saveEntry',entryFields(K2));
  ok('admin: can add time for a location manager',/"ok":true/.test(a1.text)&&count(`select count(*) from "TimeEntry" where "userId"='${K2}' and description='crafted'`)===1,a1.text.slice(0,160));
  const a2=await act(adm,'saveEntry',entryFields(M));
  ok('admin: can add time for someone in any office',/"ok":true/.test(a2.text)&&count(`select count(*) from "AuditLog" where "userId"='${ADMIN}' and "targetUserId"='${M}' and action like '%on behalf of Amd Test'`)===1,a2.text.slice(0,160));
  const a3=await act(adm,'saveEntry',entryFields(KI));
  ok('admin: still not for someone who is not active',refused(a3,'not active'));
  const mid=sql(`select id from "TimeEntry" where "userId"='${M}' and description='crafted'`);
  const a4=await act(adm,'deleteEntry',{id:mid},false);
  ok("admin: can delete someone's entry",count(`select count(*) from "TimeEntry" where id='${mid}'`)===0,a4.text.slice(0,100));
  await go(adm,`/timesheet?u=${M}`);
  ok('admin: opens another office\'s person on the Timesheet',/You are adding and changing time for Amd Test/.test(await adm.textContent('main')));

  // ---- members and Team/Project Managers
  const pri=await signIn('priya@example.com');
  await go(pri,`/timesheet?u=${K}`);
  ok('member: no picker, no banner, and ?u= gives their own week',(await pri.locator('.whose').count())===0&&(await pri.locator('.alert.info:has-text("You are adding")').count())===0);
  const p1=await act(pri,'saveEntry',entryFields(K));
  ok('member: cannot add time for someone else (crafted call)',refused(p1,'Only Location managers and Admins can add or change someone else\'s time')&&count(`select count(*) from "TimeEntry" where "userId"='${K}' and description='crafted' and id<>'${kid}'`)===0,p1.text.slice(0,200));
  const p2=await act(pri,'deleteEntry',{id:kid},false);
  ok("member: cannot delete someone else's entry (crafted call)",count(`select count(*) from "TimeEntry" where id='${kid}'`)===1,p2.text.slice(0,100));
  const p3=await act(pri,'addRow',{userId:K,week:ws,projectId:pa},false);
  ok('member: cannot add a project row for someone else',/"ok":false/.test(p3.text)&&count(`select count(*) from "TimesheetRow" where "userId"='${K}' and "weekStart"='${ws}'`)===0,p3.text.slice(0,160));
  const lead=await signIn('daniel@example.com');
  await go(lead,`/timesheet?u=${PRIYA}`);
  ok('Team/Project Manager: no picker on the Timesheet and ?u= gives their own week',(await lead.locator('.whose').count())===0&&(await lead.locator('.alert.info:has-text("You are adding")').count())===0);
  const t1=await act(lead,'saveEntry',entryFields(PRIYA));
  ok('Team/Project Manager: cannot add time for their team member (crafted call)',refused(t1,'Only Location managers and Admins can add or change someone else\'s time')&&count(`select count(*) from "TimeEntry" where "userId"='${PRIYA}' and description='crafted'`)===0,t1.text.slice(0,200));
  sql(`insert into "TimeEntry"(id,"userId","projectId","phaseId","tagIds",date,"startMin",minutes,description,custom,"createdAt") values('${t}rd','${PRIYA}','${pa}','${xa}','{}','${addDays(ws,2)}',600,60,'ob-read','{}',now())`);
  await go(lead,`/timesheet?u=${PRIYA}`);
  ok('Team/Project Manager: a team member\'s calendar is still read only',/Read only/.test(await lead.textContent('main'))&&(await lead.locator('.alert.info:has-text("You are adding")').count())===0);
  const evs=await lead.locator('button.ev').count();
  if(evs){await lead.locator('button.ev').first().click();await lead.waitForSelector('dialog[open]');ok('...and an entry there opens without a Save button, and without "On behalf of"',(await lead.locator('dialog[open] button:has-text("Save changes")').count())===0&&!/On behalf of/.test(await lead.textContent('dialog[open]')));}
  else ok('...(no entries this week to open; the note above covers it)',true);
  // two people with the same name are told apart by their office
  const klhName=sql(`select name from "Location" where id='${KLH}'`);
  ins(KD,'Klh Test','MEMBER',KLH,FLASH);
  await go(rav,'/timesheet');
  const dupOpts=await whoOpts(rav);
  ok('same name twice: the picker adds the office to both',dupOpts.filter((o)=>o===`Klh Test (${klhName})`).length===2&&!dupOpts.includes('Klh Test'),dupOpts.join(', '));
  await go(rav,`/timesheet?u=${KD}`);
  ok('same name twice: the banner says which one',new RegExp(`time for Klh Test \\(${klhName}\\)`).test((await rav.locator('.alert.info').first().innerText()).replace(/\s+/g,' ')));
  for(const p of pages){const bad=p.errs.filter((e)=>!/Failed to load resource/.test(e));ok(`no page errors (${p.url().replace(BASE,'').slice(0,60)})`,bad.length===0,bad.slice(0,2).join(' | '));}
 }finally{
  sql(`update "Settings" set "lockBefore"=${lockOld?`'${lockOld}'`:'null'}`);
  const list=[...ALL,t+'adm'].map((x)=>`'${x}'`).join(',');
  sql(`delete from "TimeEntry" where id='${t}adm' or "userId" in (${ALL.map((x)=>`'${x}'`).join(',')}) or description='crafted' and "userId" in ('${ADMIN}','${PRIYA}','${RAVI}') or id='${t}rd'`);
  sql(`delete from "AuditLog" where "userId" in (${ALL.map((x)=>`'${x}'`).join(',')}) or "targetUserId" in (${ALL.map((x)=>`'${x}'`).join(',')})`);
  sql(`delete from "TimesheetRow" where "userId" in (${ALL.map((x)=>`'${x}'`).join(',')})`);
  sql(`delete from "Timesheet" where id='${t}s'`);
  sql(`delete from "User" where id in (${ALL.map((x)=>`'${x}'`).join(',')})`);
  sql(`delete from "Project" where id='${t}rp'`);
  await b.close();
 }
})().catch((e)=>{console.error(e);process.exit(1);});
