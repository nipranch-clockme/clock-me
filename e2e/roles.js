// Visits every tab as each role: allowed tabs must load without errors, others must redirect to the timesheet.
const {start,login,BASE}=require('./helpers');
const TABS=['dashboard','timesheet','calendar','approvals','reports','projects','people','import-export','audit','settings'];
const ALLOWED={MEMBER:['timesheet','calendar','reports','projects'],LEADER:['dashboard','timesheet','calendar','approvals','reports','projects','audit'],PM:['dashboard','timesheet','calendar','reports','projects','import-export'],LOCATION:['dashboard','timesheet','calendar','approvals','reports','projects','people','import-export','audit'],ADMIN:TABS};
const USERS={MEMBER:'priya@example.com',LEADER:'daniel@example.com',PM:'rosa@example.com',LOCATION:'oliver@example.com',ADMIN:'admin@example.com'};
(async()=>{const b=await start();let fail=0;
 for(const [role,email] of Object.entries(USERS)){const p=await login(b,email);const nav=(await p.locator('nav a').allInnerTexts()).length;
  for(const t of TABS){const r=await p.goto(BASE+'/'+t);await p.waitForLoadState('networkidle');const path=new URL(p.url()).pathname;const ok=ALLOWED[role].includes(t);
   const good=ok?(r.status()===200&&path==='/'+t):path==='/timesheet';if(!good){fail++;console.log('FAIL',role,t,r.status(),path)}}
  await p.goto(BASE+'/reports?range=all&group=person');await p.waitForLoadState('networkidle');const people=await p.locator('tbody tr').count();
  console.log(role.padEnd(8),'tabs',nav,'people visible in reports',people,'errors',p.errs.length?p.errs:'none');if(p.errs.length)fail++;}
 const anon=await (await b.newContext()).newPage();await anon.goto(BASE+'/dashboard');console.log('signed out ->',new URL(anon.url()).pathname);
 const r=await anon.request.get(BASE+'/reports/export?range=all',{maxRedirects:0});console.log('signed-out export ->',r.status());
 console.log(fail?`${fail} FAILURES`:'ALL ROLE CHECKS PASSED');await b.close()})();
