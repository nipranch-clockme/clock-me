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
  ok('no browser errors',p.errs.length===0&&d.errs.length===0,JSON.stringify([p.errs,d.errs]));
 }finally{
  sql(`delete from "AuditLog" where "userId"='${uid}' or "targetUserId"='${uid}'`);
  sql(`delete from "User" where id='${uid}'`);
  await b.close();
 }
})();
