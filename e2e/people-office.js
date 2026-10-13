// The People list has an office filter for admins, like the Clients page: All offices, then one office at a time, with search working alongside it.
const {start,login,BASE}=require('./helpers');
const ok=(name,cond,detail='')=>{console.log(`${cond?'PASS':'FAIL'} ${name}${detail?' — '+detail:''}`);if(!cond)process.exitCode=1;};
const go=async(p,u)=>{await p.goto(BASE+u);await p.waitForLoadState('networkidle');};
(async()=>{const b=await start();
 const a=await login(b,'admin@example.com');
 await go(a,'/people');
 const seg=a.locator('[role="group"][aria-label="Office"] .seg');
 const names=(await seg.locator('button').allInnerTexts()).map((t)=>t.trim());
 ok('admin: an office filter that starts with All offices and lists every office',names[0]==='All offices'&&names.length>=3,names.join(', '));
 const officeRows=async()=>a.$$eval('table.pptable tbody tr',(trs)=>trs.map((tr)=>{const c=tr.querySelector('td[data-l="Office and team"]');return c?c.childNodes[0].textContent.trim():null;}).filter(Boolean));
 const all=(await officeRows()).length;
 const office=names[1];
 await seg.locator('button').nth(1).click();
 const inOffice=await officeRows();
 ok('admin: picking an office lists only its people',inOffice.length>0&&inOffice.length<all&&inOffice.every((x)=>x===office),`${inOffice.length} of ${all} in ${office}`);
 ok('admin: the office is pressed and the count says how many',(await seg.locator('button').nth(1).getAttribute('aria-pressed'))==='true'&&(await a.locator('[role="group"][aria-label="Office"] .note').innerText()).includes(`${inOffice.length} of ${all}`));
 await a.fill('#pp-q','zzz-no-such-person');
 ok('office and search together: a search with no match shows nobody',(await a.locator('table.pptable td.empty').innerText()).includes('Nobody matches'));
 await a.fill('#pp-q','');
 await seg.locator('button').nth(0).click();
 ok('admin: All offices shows everyone again',(await officeRows()).length===all&&(await seg.locator('button').nth(0).getAttribute('aria-pressed'))==='true');

 const rav=await login(b,'ravi@example.com');
 await go(rav,'/people');
 ok('location manager: one office, so no office filter',await rav.locator('[role="group"][aria-label="Office"]').count()===0);
 ok('no browser errors',(a.errs||[]).length+(rav.errs||[]).length===0,JSON.stringify([a.errs,rav.errs]));
 await b.close();
})().catch((e)=>{console.log('ERR',e.message.slice(0,500));process.exit(1);});
