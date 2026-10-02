const {start,login,BASE}=require('./helpers');
(async()=>{const b=await start();const p=await login(b,'rosa@example.com');
 await p.goto(BASE+'/import-export');await p.waitForLoadState('networkidle');
 const run='run'+process.pid;
 const csv=['Date,Email,Project,Phase,Tag,Description,Hours,Start',
  `2026-09-29,mei@example.com,Patient portal,Build,Development,API work ${run},2.5,10:30`,
  '2026-09-29,priya@example.com,Patient portal,Build,,x,1,',
  '2026-09-30,mei@example.com,Patient portal,Nope,,x,1,',
  'bad,mei@example.com,Patient portal,Build,,x,1,',
  `2026-09-30,marcus@example.com,Website rebuild,Launch,Meetings,"Call, with ""quotes""\nand a second line ${run}",1:15,`,
  `2026-09-30,mei@example.com,Patient portal,Build,Development,'- note ${run},1,9:5`,
  `2026-09-30,mei@example.com,Patient portal,Build,Development,'- note ${run},1,`,
  `2026-09-30,mei@example.com,Patient portal,Build,Development,5" screen ${run},1,`].join('\n');
 const sec='section:has(#imp-text-time)';
 const check=async()=>{await p.fill('#imp-text-time',csv);await p.locator(`${sec} button:has-text("Check file")`).click();await p.waitForSelector(`${sec} table`);await p.waitForTimeout(300);return (await p.locator(`${sec} tbody`).innerText()).replace(/\t/g,' ');};
 console.log(await check());
 await p.screenshot({path:'/tmp/claude-0/shots/import.png',fullPage:true});
 await p.locator(`${sec} button:has-text("Import")`).click();await p.waitForSelector(`${sec} .alert.ok`);console.log(await p.locator(`${sec} .alert.ok`).innerText());
 await p.goto(BASE+'/import-export');await p.waitForLoadState('networkidle');
 console.log('--- same file again:\n'+await check());
 const pc=['Client,Project,Phases,Budget hours,Access,People,Offices,Managers',`Bluebird Health,Annual report ${run},Research;Design,120,Everyone,,,`,'New Client,Thing,,,,,,',`Internal,Office move ${run},Plan;Move,,Restricted,,London,`].join('\n');
 await p.fill('#imp-text-projects',pc);await p.locator('section:has(#imp-text-projects) button:has-text("Check file")').click();await p.waitForSelector('section:has(#imp-text-projects) table');
 console.log((await p.locator('section:has(#imp-text-projects) tbody').innerText()).replace(/\t/g,' '));
 await p.locator('section:has(#imp-text-projects) button:has-text("Import")').click();await p.waitForSelector('section:has(#imp-text-projects) .alert.ok');console.log(await p.locator('section:has(#imp-text-projects) .alert.ok').innerText());
 // Mei isn't in London, so she can't log time on the London-only project
 await p.goto(BASE+'/import-export');await p.waitForLoadState('networkidle');
 await p.fill('#imp-text-time',`Date,Email,Project,Phase,Tag,Hours\n2026-09-30,mei@example.com,Office move ${run},Plan,Development,1`);await p.locator(`${sec} button:has-text("Check file")`).click();await p.waitForSelector(`${sec} table`);
 console.log('restricted:',(await p.locator(`${sec} tbody`).innerText()).replace(/\t/g,' '));
 for(const k of ['projects','people']){const r=await p.request.get(BASE+'/import-export/export/'+k);console.log(k,r.status(),(await r.text()).split('\n').slice(0,2).join(' // ').slice(0,200));}
 console.log('errors',p.errs);await b.close()})();
