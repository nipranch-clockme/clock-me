// Admins can change time in a past week even after it was submitted or approved: the approval stays as it is, and the change is
// written to the change log as made in an approved week. Everyone else is still stopped by the week's status (member, and location
// managers acting on someone's behalf), and the admin lock date still applies to admins.
// Sets up its own test people and entries directly in the local database, and removes them again.
//   BASE=http://localhost:3500 PSQL="psql -h /var/run/postgresql tags_t" node e2e/admin-past.js
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
 const t='ap'+process.pid, K=t+'k', L=t+'l', ALL=[K,L];
 const tom=sql(`select "locationId"||'|'||"teamId"||'|'||"passwordHash" from "User" where email='tom@example.com'`).split('|');
 const KLH=tom[0], FLASH=tom[1], hash=tom[2];
 const idOf=(email)=>sql(`select id from "User" where email='${email}'`);
 const ADMIN=idOf('admin@example.com');
 const tz=sql(`select "timeZone" from "Settings"`);
 const today=sql(`select to_char(now() at time zone '${tz}','YYYY-MM-DD')`);
 const ws=mondayOf(today), pws=addDays(ws,-7);
 const [d1,d2,d3]=[addDays(pws,1),addDays(pws,2),addDays(pws,3)];
 const [pa,xa]=sql(`select p.id||'|'||ph.id from "Project" p join "Phase" ph on ph."projectId"=p.id where p.access='PUBLIC' and not p.archived and ph.sort<999 order by p.name, ph.sort limit 1`).split('|');
 const tagId=sql(`select id from "Tag" order by name limit 1`);
 const lockOld=sql(`select coalesce("lockBefore"::text,'') from "Settings"`);
 const ins=(uid,name,role,loc,team)=>sql(`insert into "User"(id,email,name,"passwordHash",role,"locationId","teamId","weeklyTarget","createdAt",active) values('${uid}','${uid}@example.com','${name}','${hash}','${role}','${loc}',${team?`'${team}'`:'null'},40,now()-interval '120 days',true)`);
 // Calls a server action straight from the page, the way a crafted request would (same helper as the on-behalf suite).
 const watched={};let expecting=null;
 const watch=(page)=>page.on('request',(r)=>{const a=r.headers()['next-action'];if(a&&r.method()==='POST'&&expecting&&!watched[expecting])watched[expecting]=a;});
 const cap=async(name,fn)=>{expecting=name;try{await fn();}finally{expecting=null;}};
 const act=(page,name,fields,two=true)=>page.evaluate(async({url,action,fields,two})=>{const fd=new FormData();for(const [k,v] of Object.entries(fields))fd.append('_1_'+k,v);fd.append('0',two?'[null,"$K1"]':'["$K1"]');
  const r=await fetch(url,{method:'POST',headers:{'next-action':action,accept:'text/x-component'},body:fd});return {status:r.status,text:await r.text()};},{url:BASE+'/timesheet',action:watched[name],fields,two});
 const refused=(r,sub)=>r.status===200&&/"ok":false/.test(r.text)&&(!sub||new RegExp(sub).test(r.text));
 const count=(q)=>+sql(q);
 const go=async(p,path)=>{await p.goto(BASE+path);await p.waitForLoadState('networkidle');};
 const signIn=async(email)=>{const p=await login(b,email);watch(p);return p;};
 const editFields=(id,date,extra={})=>({userId:K,id,projectId:pa,date,start:'09:00',duration:'1',phaseId:xa,tagIds:tagId,description:'crafted try',...extra});
 const pages=[];
 try{
  ins(K,'Ap Member Test','MEMBER',KLH,FLASH);
  ins(L,'Ap Office Test','LOCATION',KLH,null);
  sql(`insert into "Timesheet"(id,"userId","weekStart",status,"updatedAt") values('${t}s','${K}','${pws}','APPROVED',now())`);
  sql(`insert into "TimesheetRow"("userId","weekStart","projectId") values('${K}','${pws}','${pa}')`);
  sql(`insert into "TimeEntry"(id,"userId","projectId","phaseId","tagIds",date,minutes,description) values
    ('${t}e1','${K}','${pa}','${xa}',ARRAY['${tagId}']::text[],'${d1}',60,'approved one'),
    ('${t}e2','${K}','${pa}','${xa}',ARRAY['${tagId}']::text[],'${d2}',30,'approved two'),
    ('${t}e3','${K}','${pa}','${xa}',ARRAY['${tagId}']::text[],'${d3}',45,'approved three')`);

  // 1. The admin opens the approved week, sees that they can still change it, and edits the first entry.
  const adm=await signIn('admin@example.com'); pages.push(adm);
  await go(adm,`/timesheet?u=${K}&w=-1`);
  ok('admin: the approved week says an admin can still change it, and the approval stays',/As an admin you can still change it, and the approval stays/.test(await adm.textContent('main')));
  await cap('saveEntry',async()=>{await adm.locator('button.chipbtn').first().click();await adm.waitForSelector('dialog[open] #e-dur');await adm.fill('#e-dur','2');await adm.click('dialog[open] button:has-text("Save changes")');});
  await adm.waitForSelector('dialog[open]',{state:'detached'});await adm.waitForLoadState('networkidle');
  ok('admin: an entry in an approved week can be changed',count(`select minutes from "TimeEntry" where id='${t}e1'`)===120);
  ok('admin: the week is still approved after the change',sql(`select status from "Timesheet" where id='${t}s'`)==='APPROVED');
  ok('admin: the change is logged as made in an approved week',count(`select count(*) from "AuditLog" where "userId"='${ADMIN}' and "targetUserId"='${K}' and action like 'Changed%' and action like '%already approved%'`)===1);

  // 2. The admin deletes the second entry in the same approved week.
  await cap('deleteEntry',async()=>{await adm.locator('button.chipbtn').nth(1).click();await adm.waitForSelector('dialog[open] button:has-text("Delete entry")');await adm.click('dialog[open] button:has-text("Delete entry")');await adm.click('dialog[open] button:text-is("Delete")');});
  await adm.waitForSelector('dialog[open]',{state:'detached'});await adm.waitForLoadState('networkidle');
  ok('admin: an entry in an approved week can be deleted',count(`select count(*) from "TimeEntry" where id='${t}e2'`)===0);
  ok('admin: the delete is logged as made in an approved week',count(`select count(*) from "AuditLog" where "userId"='${ADMIN}' and "targetUserId"='${K}' and action like 'Deleted%' and action like '%already approved%'`)===1);

  // 3. The member cannot change their own approved week, from the screen or with a crafted call.
  const mem=await signIn(`${K}@example.com`); pages.push(mem);
  await go(mem,`/timesheet?w=-1`);
  ok('member: an approved week says it cannot be changed',/This week can.t be changed/.test(await mem.textContent('main')));
  const memSave=await act(mem,'saveEntry',editFields(`${t}e1`,d1,{description:'member try'}));
  ok('member: cannot change an entry in an approved week',refused(memSave,'already approved'),memSave.text.slice(0,200));
  const memDel=await act(mem,'deleteEntry',{id:`${t}e3`},false);
  ok('member: cannot delete an entry in an approved week',refused(memDel,'already approved'),memDel.text.slice(0,200));
  ok('member: the entries are unchanged',count(`select count(*) from "TimeEntry" where id in ('${t}e1','${t}e3') and description like 'approved%'`)===2);

  // 4. A location manager acting on someone's behalf is stopped too: only admins get past the week's status.
  const loc=await signIn(`${L}@example.com`); pages.push(loc);
  const locSave=await act(loc,'saveEntry',editFields(`${t}e1`,d1,{description:'location try'}));
  ok('location manager: cannot change an approved week, even on someone\'s behalf',refused(locSave,'already approved'),locSave.text.slice(0,200));

  // 5. The admin lock date still applies to admins: days on or before it cannot be changed by anyone.
  sql(`update "Settings" set "lockBefore"='${addDays(pws,6)}'`);
  const admLocked=await act(adm,'saveEntry',editFields(`${t}e1`,d1,{description:'admin locked try'}));
  ok('admin: the admin lock date still applies to admins',refused(admLocked,'locked by an Admin'),admLocked.text.slice(0,200));
  sql(`update "Settings" set "lockBefore"=${lockOld?`'${lockOld}'`:'null'}`);

  ok('no browser errors on the admin, member or location pages',[adm,mem,loc].every((p)=>p.errs.length===0),[adm,mem,loc].flatMap((p)=>p.errs).slice(0,3).join(' | '));
 }finally{
  sql(`update "Settings" set "lockBefore"=${lockOld?`'${lockOld}'`:'null'}`);
  sql(`delete from "TimeEntry" where id like '${t}e%'`);
  sql(`delete from "AuditLog" where "userId" in (${ALL.map((x)=>`'${x}'`).join(',')}) or "targetUserId" in (${ALL.map((x)=>`'${x}'`).join(',')})`);
  sql(`delete from "TimesheetRow" where "userId" in (${ALL.map((x)=>`'${x}'`).join(',')})`);
  sql(`delete from "Timesheet" where id='${t}s'`);
  sql(`delete from "User" where id in (${ALL.map((x)=>`'${x}'`).join(',')})`);
  await b.close();
 }
})().catch((e)=>{console.error(e);process.exitCode=1;});
