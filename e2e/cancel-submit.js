// Cancel submission: after submitting a week, the person can take it back until it's approved, change it and submit again.
// Sets up its own test person directly in the local database (PSQL defaults to the sample database on this machine).
const {execSync}=require('child_process');
const {start,login,BASE}=require('./helpers');
const PSQL=process.env.PSQL||'psql -h /tmp -U postgres clockme';
const sql=(q)=>execSync(`${PSQL} -v ON_ERROR_STOP=1 -At`,{input:q}).toString().trim();
const ok=(name,cond,detail='')=>{console.log(`${cond?'PASS':'FAIL'} ${name}${detail?' — '+detail:''}`);if(!cond)process.exitCode=1;};
const addDays=(d,n)=>{const x=new Date(d+'T00:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10);};
const mondayOf=(d)=>{const x=new Date(d+'T00:00:00Z');return addDays(d,-((x.getUTCDay()+6)%7));};
(async()=>{
 const b=await start();
 const uid='cancel'+process.pid, email=uid+'@example.com';
 const pr=sql(`select p.id||'|'||ph.id||'|'||(select id from "Tag" order by name limit 1) from "Project" p join "Phase" ph on ph."projectId"=p.id where p.access='PUBLIC' and not p.archived and ph.sort<999 order by p.name, ph.sort limit 1`).split('|');
 const daniel=sql(`select "locationId"||'|'||"teamId"||'|'||"passwordHash" from "User" where email='daniel@example.com'`).split('|');
 const todayStr=sql(`select to_char(now() at time zone 'UTC','YYYY-MM-DD')`), ws=mondayOf(todayStr);
 const status=()=>sql(`select status from "Timesheet" where "userId"='${uid}' and "weekStart"='${ws}'`);
 try{
  // a member on Daniel's team, so Daniel approves them
  sql(`insert into "User"(id,email,name,"passwordHash",role,"locationId","teamId","weeklyTarget","createdAt") values('${uid}','${email}','Cancel Test','${daniel[2]}','MEMBER','${daniel[0]}','${daniel[1]}',40, now()-interval '30 days')`);
  sql(`insert into "TimeEntry"(id,"userId","projectId","phaseId","tagId",date,"startMin",minutes,description,custom,"createdAt") values('${uid}e','${uid}','${pr[0]}','${pr[1]}','${pr[2]}','${ws}',540,120,'work','{}',now())`);
  const p=await login(b,email);await p.goto(BASE+'/timesheet');await p.waitForLoadState('networkidle');
  ok('no cancel button before submitting',(await p.locator('button:has-text("Cancel submission")').count())===0);
  await p.click('button:has-text("Submit for approval")');await p.waitForSelector('button:has-text("Cancel submission")');
  ok('submitted week shows Cancel submission instead of Submit',(await p.locator('button:has-text("Submit for approval")').count())===0&&status()==='SUBMITTED');
  ok('note explains how to make changes',(await p.textContent('main')).includes('Cancel the submission if you need to change something'));
  ok('no + buttons while waiting',(await p.locator('button.addcell').count())===0);
  // Daniel sees it waiting
  const d=await login(b,'daniel@example.com');await d.goto(BASE+'/approvals');await d.waitForLoadState('networkidle');
  const waiting=async()=>(await d.textContent('section.panel.full')).includes('Cancel Test');
  ok('approver sees the submitted week',await waiting());
  // cancel
  await p.click('button:has-text("Cancel submission")');await p.waitForSelector('text=Submission cancelled');
  ok('cancelling puts the week back to draft',status()==='DRAFT',status());
  ok('Submit is back and the grid is editable',(await p.locator('button:has-text("Submit for approval")').isEnabled())&&(await p.locator('button.addcell').count())>0);
  ok('change log records it',sql(`select count(*) from "AuditLog" where "userId"='${uid}' and action like 'Cancelled the submission%'`)==='1');
  await d.reload();await d.waitForLoadState('networkidle');
  ok('approver no longer sees it waiting',!(await waiting()));
  // submit again, then cancel from a stale page after it was approved
  await p.click('button:has-text("Submit for approval")');await p.waitForSelector('button:has-text("Cancel submission")');
  ok('can submit again',status()==='SUBMITTED');
  sql(`update "Timesheet" set status='APPROVED' where "userId"='${uid}' and "weekStart"='${ws}'`);
  await p.click('button:has-text("Cancel submission")');await p.waitForSelector('text=approved before you cancelled');
  ok('an approved week stays approved',status()==='APPROVED');
  ok('approved week has no cancel or submit button',(await p.locator('button:has-text("Cancel submission")').count())===0&&!(await p.locator('button:has-text("Submit for approval")').isEnabled()));
  // a week sent back before cancelling
  sql(`update "Timesheet" set status='SUBMITTED' where "userId"='${uid}' and "weekStart"='${ws}'`);await p.goto(BASE+'/timesheet');await p.waitForLoadState('networkidle');
  sql(`update "Timesheet" set status='REJECTED', comment='Fix Monday' where "userId"='${uid}' and "weekStart"='${ws}'`);
  await p.click('button:has-text("Cancel submission")');await p.waitForSelector('text=sent back before you cancelled');
  ok('a sent-back week stays sent back with its reason',status()==='REJECTED'&&(await p.textContent('main')).includes('Fix Monday'));
  // someone else can't cancel your week: the action only touches the signed-in person's sheet
  sql(`update "Timesheet" set status='SUBMITTED' where "userId"='${uid}' and "weekStart"='${ws}'`);
  await d.goto(BASE+'/timesheet');await d.waitForLoadState('networkidle');
  ok("another person's timesheet page doesn't show this week",!(await d.textContent('main')).includes('Cancel Test'));

  // stale approvals: an open Approvals page only acts on the version of the week it showed
  const fmtOk=(t,h)=>t.includes(h.toFixed(2))||t.includes(`${Math.floor(h)}:${String(Math.round(h%1*60)).padStart(2,'0')}`);
  sql(`update "Timesheet" set status='DRAFT', comment='' where "userId"='${uid}' and "weekStart"='${ws}'`);
  await p.goto(BASE+'/timesheet');await p.waitForLoadState('networkidle');
  await p.click('button:has-text("Submit for approval")');await p.waitForSelector('button:has-text("Cancel submission")');
  await d.goto(BASE+'/approvals');await d.waitForLoadState('networkidle');
  const card=()=>d.locator('section.panel.full .item:has-text("Cancel Test")');
  ok('approver sees 2 hours',fmtOk(await card().innerText(),2));
  await p.click('button:has-text("Cancel submission")');await p.waitForSelector('text=Submission cancelled');
  sql(`update "TimeEntry" set minutes=180 where id='${uid}e'`);
  await p.click('button:has-text("Submit for approval")');await p.waitForSelector('button:has-text("Cancel submission")');
  await card().locator('button:has-text("Approve")').click();await d.waitForSelector('text=changed their timesheet');
  ok('a stale Approve does not approve a changed week',status()==='SUBMITTED',status());
  ok('the approver now sees the new hours',fmtOk(await card().innerText(),3));
  // cancelled and not sent again
  await p.click('button:has-text("Cancel submission")');await p.waitForSelector('text=Submission cancelled');
  await card().locator('button:has-text("Approve")').click();await d.waitForSelector('text=cancelled their submission');
  ok('Approve after the person cancelled says so and changes nothing',status()==='DRAFT'&&(await card().count())===0);
  // Send back on a stale card
  await p.click('button:has-text("Submit for approval")');await p.waitForSelector('button:has-text("Cancel submission")');
  await d.goto(BASE+'/approvals');await d.waitForLoadState('networkidle');
  await card().locator('button:has-text("Send back")').click();await card().locator('input[name=reason]').fill('Check Monday');
  await p.click('button:has-text("Cancel submission")');await p.waitForSelector('text=Submission cancelled');
  await card().locator('form button:has-text("Send back")').click();await d.waitForSelector('text=cancelled their submission');
  ok('Send back after the person cancelled says so and changes nothing',status()==='DRAFT');
  // Approve all skips a week that changed after the page was opened
  const before=sql(`select t.id from "Timesheet" t join "User" u on u.id=t."userId" where t.status='SUBMITTED' and u."teamId"='${daniel[1]}' and u.id<>'${uid}'`).split('\n').filter(Boolean);
  const t0=sql(`select to_char(now() at time zone 'UTC','YYYY-MM-DD HH24:MI:SS.MS')`);
  try{
   await p.click('button:has-text("Submit for approval")');await p.waitForSelector('button:has-text("Cancel submission")');
   await d.goto(BASE+'/approvals');await d.waitForLoadState('networkidle');
   if(await d.isVisible('button:has-text("Approve all")')){
    await p.click('button:has-text("Cancel submission")');await p.waitForSelector('text=Submission cancelled');
    await p.click('button:has-text("Submit for approval")');await p.waitForSelector('button:has-text("Cancel submission")');
    await d.click('button:has-text("Approve all")');await d.waitForSelector('text=wasn\'t approved');
    ok('Approve all leaves a changed week waiting',status()==='SUBMITTED');
    ok('Approve all still approves the unchanged ones',!before.length||sql(`select count(*) from "Timesheet" where status='APPROVED' and id in (${before.map(x=>`'${x}'`).join(',')})`)===String(before.length));
   }else console.log('SKIP Approve all (only one week waiting)');
  }finally{
   if(before.length)sql(`update "Timesheet" set status='SUBMITTED' where id in (${before.map(x=>`'${x}'`).join(',')})`);
   sql(`delete from "AuditLog" where "userId"=(select id from "User" where email='daniel@example.com') and at>='${t0}' and action like 'Approved%'`);
  }
  // a week an admin has locked completely can't be taken back
  const lock0=sql(`select coalesce(to_char("lockBefore",'YYYY-MM-DD'),'') from "Settings"`);
  try{
   sql(`update "Settings" set "lockBefore"='${addDays(ws,6)}'`);await p.goto(BASE+'/timesheet');await p.waitForLoadState('networkidle');
   ok('fully locked week offers no Cancel submission',(await p.locator('button:has-text("Cancel submission")').count())===0&&(await p.textContent('main')).includes('locked by an admin'));
  }finally{sql(`update "Settings" set "lockBefore"=${lock0?`'${lock0}'`:'null'}`);}
  ok('no browser errors',p.errs.length===0&&d.errs.length===0,JSON.stringify([p.errs,d.errs]));
 }finally{
  sql(`delete from "AuditLog" where "userId"='${uid}' or "targetUserId"='${uid}'`);
  sql(`delete from "User" where id='${uid}'`);
  await b.close();
 }
})();
