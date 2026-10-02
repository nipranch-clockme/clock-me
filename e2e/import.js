const {start,login,BASE}=require('./helpers');
(async()=>{const b=await start();const p=await login(b,'rosa@example.com');
 await p.goto(BASE+'/import-export');await p.waitForLoadState('networkidle');
 const csv=['Date,Email,Project,Phase,Tag,Description,Hours,Ticket ID','2026-09-29,mei@example.com,Patient portal,Build,Development,API work,2.5,PP-12','2026-09-29,priya@example.com,Patient portal,Build,,x,1,','2026-09-30,mei@example.com,Patient portal,Nope,,x,1,','bad,mei@example.com,Patient portal,Build,,x,1,','2026-09-30,marcus@example.com,Website rebuild,Launch,Meeting,"Call, with ""quotes""",1:15,'].join('\n');
 await p.fill('#imp-text-time',csv);await p.locator('section:has(#imp-text-time) button:has-text("Check file")').click();await p.waitForSelector('section:has(#imp-text-time) table');
 console.log((await p.locator('section:has(#imp-text-time) tbody').innerText()).replace(/\t/g,' '));
 await p.screenshot({path:'/tmp/claude-0/shots/import.png',fullPage:true});
 await p.locator('section:has(#imp-text-time) button:has-text("Import")').click();await p.waitForSelector('section:has(#imp-text-time) .alert.ok');console.log(await p.locator('section:has(#imp-text-time) .alert.ok').innerText());
 const pc=['Client,Project,Phases,Budget hours,Access,People,Offices,Managers','Bluebird Health,Annual report,Research;Design,120,Everyone,,,','New Client,Thing,,,,,,','Internal,Office move,Plan;Move,,Restricted,,London,'].join('\n');
 await p.fill('#imp-text-projects',pc);await p.locator('section:has(#imp-text-projects) button:has-text("Check file")').click();await p.waitForSelector('section:has(#imp-text-projects) table');
 console.log((await p.locator('section:has(#imp-text-projects) tbody').innerText()).replace(/\t/g,' '));
 await p.locator('section:has(#imp-text-projects) button:has-text("Import")').click();await p.waitForSelector('section:has(#imp-text-projects) .alert.ok');console.log(await p.locator('section:has(#imp-text-projects) .alert.ok').innerText());
 for(const k of ['projects','people']){const r=await p.request.get(BASE+'/import-export/export/'+k);console.log(k,r.status(),(await r.text()).split('\n').slice(0,2).join(' // ').slice(0,200));}
 console.log('errors',p.errs);await b.close()})();
