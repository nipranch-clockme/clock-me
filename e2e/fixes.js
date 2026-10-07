// Checks for sign-in limits, link expiry, "Copy last week", overlapping calendar entries, report filters and reminders.
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
 const email=`copytest${process.pid}@example.com`;
 const proj=sql(`select id from "Project" where name='Patient portal'`);
 const build=sql(`select id from "Phase" where "projectId"='${proj}' and name='Submission 1'`);
 const tag=sql(`select id from "Tag" where name='CAD'`);
 const priya=sql(`select "locationId"||'|'||"teamId"||'|'||"passwordHash" from "User" where email='priya@example.com'`).split('|');
 const uid='copytest'+process.pid, retired='retired'+process.pid;
 try{
  // 1. Sign-in limit: the 11th wrong password in 15 minutes is refused.
  const ctx=await b.newContext();const p=await ctx.newPage();await p.goto(BASE+'/login');await p.waitForLoadState('networkidle');
  let msg='';
  for(let i=0;i<11;i++){await p.fill('#email','nobody-throttle@example.com');await p.fill('#password','wrong'+i);await Promise.all([p.waitForResponse(r=>r.request().method()==='POST'),p.click('button:has-text("Sign in")')]);await p.waitForSelector('button:has-text("Sign in"):enabled');msg=await p.textContent('.err-text');}
  ok('11th wrong sign-in is refused',/Too many/.test(msg),msg);
  sql(`delete from "AuthAttempt" where key like 'login%'`);

  // 2. Expired links stop working; live ones still do.
  sql(`update "User" set "inviteToken"='expired-${uid}', "inviteExpires"=now()-interval '1 hour' where email='priya@example.com'`);
  const q=await ctx.newPage();await q.goto(BASE+'/invite/expired-'+uid);let h=await q.textContent('h2');ok('expired link is refused',/not valid/.test(h),h);
  sql(`update "User" set "inviteExpires"=now()+interval '1 hour' where email='priya@example.com'`);
  await q.goto(BASE+'/invite/expired-'+uid);h=await q.textContent('h2');ok('live reset link opens',/Reset your password/.test(h),h);
  sql(`update "User" set "inviteToken"=null, "inviteExpires"=null where email='priya@example.com'`);

  // 3. Copy last week brings last week's projects as empty rows, not their hours, and leaves out closed projects.
  sql(`insert into "User"(id,email,name,"passwordHash",role,"locationId","teamId","weeklyTarget","createdAt") values('${uid}','${email}','Copy Test','${priya[2]}','MEMBER','${priya[0]}','${priya[1]}',40, now()-interval '30 days')`);
  sql(`insert into "ProjectUserAccess"("projectId","userId") values('${proj}','${uid}')`);
  const client=sql(`select "clientId" from "Project" where id='${proj}'`);
  sql(`insert into "Project"(id,name,"clientId",archived) values('${retired}','Old work ${uid}','${client}',true)`);
  const todayStr=sql(`select to_char(now() at time zone 'UTC','YYYY-MM-DD')`);
  const ws=mondayOf(todayStr), prevTue=addDays(ws,-6), wed=addDays(ws,2);
  sql(`insert into "TimeEntry"(id,"userId","projectId","phaseId","tagIds",date,"startMin",minutes,description) values
   ('${uid}a','${uid}','${proj}','${build}',ARRAY['${tag}'],'${prevTue}',540,120,'kept'),
   ('${uid}b','${uid}','${retired}',null,ARRAY['${tag}'],'${prevTue}',660,60,'left out')`);
  const m=await login(b,email);await m.goto(BASE+'/timesheet');await m.waitForLoadState('networkidle');
  await m.click('button:has-text("Copy last week")');await m.waitForURL(/copied=/);
  const notice=await m.textContent('p[role=status]');
  ok('copy last week copies 1 project and reports 1 left out',/Copied 1 project from last week/.test(notice)&&/1 project was left out/.test(notice),notice.trim());
  ok('no hours were copied',sql(`select count(*) from "TimeEntry" where "userId"='${uid}' and date>='${ws}'`)==='0');
  ok('the project shows as a row',await m.isVisible('tr:has-text("Patient portal")'));
  await m.click('button:has-text("Copy last week")');await m.waitForURL(/copied=0/);
  ok('copying again says the projects are already there',/already on this week/.test(await m.textContent('p[role=status]')));
  // a closed project that still shows this week (it has time on it) isn't reported as left out
  sql(`insert into "TimeEntry"(id,"userId","projectId","phaseId","tagIds",date,"startMin",minutes,description) values ('${uid}w','${uid}','${retired}',null,ARRAY['${tag}'],'${ws}',900,30,'this week')`);
  await m.goto(BASE+'/timesheet');await m.click('button:has-text("Copy last week")');await m.waitForURL(/copied=0/);
  {const n=await m.textContent('p[role=status]');ok('a closed project already on this week is not called left out',/already on this week/.test(n)&&!/left out/.test(n),n.trim());}

  // 4. Overlapping entries sit side by side in the calendar.
  sql(`insert into "TimeEntry"(id,"userId","projectId","phaseId","tagIds",date,"startMin",minutes,description) values
   ('${uid}c','${uid}','${proj}','${build}',ARRAY['${tag}'],'${wed}',600,60,'first'),
   ('${uid}d','${uid}','${proj}','${build}',ARRAY['${tag}'],'${wed}',630,60,'second')`);
  await m.goto(BASE+'/calendar');await m.waitForLoadState('networkidle');
  const widths=await m.$$eval('button.ev',els=>els.filter(e=>/10:00|10:30/.test(e.textContent)).map(e=>[e.style.width,e.style.left]));
  ok('overlapping entries split the column',widths.length===2&&widths.every(w=>w[0].includes('50%'))&&widths[0][1]!==widths[1][1],JSON.stringify(widths));

  // 5. Reports ignore filters the viewer can't use instead of failing.
  const d=await login(b,'daniel@example.com');
  const r=await d.goto(BASE+'/reports?range=all&project=nope&person=nope&phase=nope&tag=nope&client=nope&team=nope&location=nope');
  ok('reports with unknown filters still load',r.status()===200&&!(await d.textContent('body')).includes('Application error'),'status '+r.status());
  ok('no browser errors',[...m.errs,...d.errs].length===0,JSON.stringify([...m.errs,...d.errs]));

  // 6. The reminder call needs the secret.
  const secret=require('fs').readFileSync('.env','utf8').match(/^CRON_SECRET="?([^"\n]+)/m)?.[1];
  const anon=await d.request.get(BASE+'/api/cron/reminders');ok('reminders refuse callers without the secret',anon.status()===401);
  const cron=await d.request.get(BASE+'/api/cron/reminders',{headers:{authorization:'Bearer '+secret}});ok('reminders run with the secret',cron.status()===200,await cron.text());
 }finally{
  sql(`delete from "AuditLog" where "userId"='${uid}' or "targetUserId"='${uid}'`);
  sql(`delete from "User" where id='${uid}'`);
  sql(`delete from "TimeEntry" where "projectId"='${retired}'`);
  sql(`delete from "Project" where id='${retired}'`);
  await b.close();
 }
})();
