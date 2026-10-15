// A typed duration is kept as typed: 1:10 (70 minutes) is saved as 70 minutes, with no quarter-hour step rule.
// Adds one entry for priya in her current week and removes it again at the end.
const {execSync}=require('child_process');
const {start,login,BASE}=require('./helpers');
const PSQL=process.env.PSQL||'psql -h /tmp -U postgres clockme';
const sql=(q)=>execSync(`${PSQL} -v ON_ERROR_STOP=1 -At`,{input:q}).toString().trim();
const ok=(name,cond,detail='')=>{console.log(`${cond?'PASS':'FAIL'} ${name}${detail?' — '+detail:''}`);if(!cond)process.exitCode=1;};

(async()=>{
 const b=await start();
 const desc='Typed minutes '+process.pid;
 try{
  const p=await login(b,'priya@example.com');
  await p.goto(BASE+'/timesheet');await p.waitForLoadState('networkidle');
  await p.click('button:has-text("Add project row")');await p.waitForSelector('dialog[open] #addrow-project');
  const opt=await p.$eval('#addrow-project',s=>[...s.options].find(o=>o.value)?.textContent);
  if(opt){await p.selectOption('#addrow-project',{label:opt});await p.click('dialog[open] button:has-text("Add row")');await p.waitForTimeout(1500);}else{await p.click('dialog[open] button:has-text("Close")');}
  await p.click('button.addcell >> nth=0');await p.waitForSelector('dialog[open] #e-phase');
  const phases=await p.$$eval('#e-phase option',os=>os.map(o=>o.value).filter(Boolean));await p.selectOption('#e-phase',phases[phases.length-1]);await p.locator('.tagpick-i input').first().check();await p.fill('#e-desc',desc);

  await p.fill('#e-dur','1:10');
  await p.click('dialog[open] button:has-text("Add entry")');
  await p.waitForFunction(()=>!document.querySelector('dialog[open]'),null,{timeout:20000});
  await p.waitForLoadState('networkidle');
  const saved=sql(`select minutes from "TimeEntry" where description='${desc}'`);
  ok('1:10 is saved as 70 minutes, not refused or rounded', saved==='70', `saved: ${saved}`);
  ok('no browser errors', (p.errs||[]).length===0, JSON.stringify(p.errs));
 } finally {
  sql(`delete from "TimeEntry" where description='${desc}'`);
 }
 await b.close();
})().catch((e)=>{console.log('ERR',e.message.slice(0,500));process.exitCode=1;});
