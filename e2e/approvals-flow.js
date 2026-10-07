// Who approves what: a Team/Project Manager approves their own team and their own week; location managers and admins see first the weeks that
// really need them (nobody on the team can approve, or the week waited more than 3 days) and the rest below, still approvable.
const {start,login,BASE}=require('./helpers');const {execSync}=require('child_process');
const PSQL=process.env.PSQL||'psql -h /tmp -U postgres clockme';
const sql=q=>execSync(`${PSQL} -At -v ON_ERROR_STOP=1`,{input:q}).toString().trim();
let fail=0;const ok=(n,c,x='')=>{console.log((c?'PASS ':'FAIL ')+n+(x?' — '+x:''));if(!c)fail++};
const uid=e=>sql(`select id from "User" where email='${e}'`),nm=e=>sql(`select name from "User" where email='${e}'`);
(async()=>{const b=await start();const T='afl'+process.pid;
 const W1='2027-03-01',W2='2027-03-08';
 const ins=(tag,email,week,age='0 days')=>sql(`insert into "Timesheet"(id,"userId","weekStart",status,comment,"updatedAt") values('${T}${tag}','${uid(email)}','${week}','SUBMITTED','',now()-interval '${age}')`);
 try{
  ins('d','daniel@example.com',W1);ins('p','priya@example.com',W1);       // Hulk (AMD): leader Daniel and a member
  ins('g','grace@example.com',W1);                                     // PNQ Spiderman: no Team/Project Manager
  ins('e1','elena@example.com',W1);ins('e2','elena@example.com',W2,'5 days'); // PNQ Ironman: manager Aisha; one recent, one overdue
  const d=await login(b,'daniel@example.com');await d.goto(BASE+'/approvals');await d.waitForLoadState('networkidle');
  const main=d.locator('section:has(h2:text-is("Waiting for your approval"))');
  ok('manager sees their own week and their team member',(await main.locator(`.item:has-text("${nm('daniel@example.com')}")`).count())>=1&&(await main.locator(`.item:has-text("${nm('priya@example.com')}")`).count())>=1);
  ok('manager does not see other teams',(await main.locator(`.item:has-text("${nm('elena@example.com')}")`).count())===0);
  await main.locator(`.item:has-text("${nm('daniel@example.com')}") button:has-text("Approve")`).first().click();await d.waitForLoadState('networkidle');await d.waitForTimeout(800);
  ok('manager approved their own week',sql(`select status from "Timesheet" where id='${T}d'`)==='APPROVED');
  const o=await login(b,'oliver@example.com');await o.goto(BASE+'/approvals');await o.waitForLoadState('networkidle');
  const omain=o.locator('section:has(h2:text-is("Waiting for your approval"))'),orest=o.locator('section:has(h2:text-is("Waiting with their Team/Project Managers"))');
  ok('location manager: team without a manager is up top',(await omain.locator(`.item:has-text("${nm('grace@example.com')}")`).count())>=1);
  ok('location manager: overdue week is up top',(await omain.locator(`.item:has-text("${nm('elena@example.com')}")`).count())===1);
  ok('location manager: a recent week with a team manager waits below',(await orest.locator(`.item:has-text("${nm('elena@example.com')}")`).count())===1&&(await orest.count())===1);
  await orest.locator('button:has-text("Approve")').first().click();await o.waitForLoadState('networkidle');await o.waitForTimeout(800);
  ok('location manager can still approve one if really needed',sql(`select status from "Timesheet" where id='${T}e1'`)==='APPROVED');
  ok('no browser errors',d.errs.length===0&&o.errs.length===0,JSON.stringify([...d.errs,...o.errs]));
 }finally{sql(`delete from "Timesheet" where id like '${T}%'`);sql(`delete from "AuditLog" where action like '%${W1}%' and at>now()-interval '1 hour'`);await b.close();}
 console.log(fail?`${fail} FAILURES`:'ALL APPROVAL FLOW CHECKS PASSED');
})();
