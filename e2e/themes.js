// Theme toggle: the button next to the profile picture flips light and dark, applies at once and survives a reload. Settings has no theme picker any more.
const {start,login,BASE}=require('./helpers');
let fail=0;const ok=(n,c,x='')=>{console.log((c?'PASS ':'FAIL ')+n+(x?' \u2014 '+x:''));if(!c)fail++};
(async()=>{const b=await start();
 for(const email of ['admin@example.com','tom@example.com']){
  const a=await login(b,email);const th=()=>a.evaluate(()=>document.documentElement.dataset.theme);
  await a.goto(BASE+'/timesheet');await a.waitForLoadState('networkidle');
  ok(`${email}: starts light`,(await th())==='light');
  ok(`${email}: toggle sits next to the profile picture`,(await a.locator('.who .plink + .themebtn').count())===1);
  await a.click('.themebtn');await a.waitForTimeout(150);ok(`${email}: dark applies at once`,(await th())==='dark'&&(await a.locator('.themebtn').getAttribute('aria-label'))==='Switch to light theme');
  await a.reload();await a.waitForLoadState('networkidle');ok(`${email}: dark survives a reload`,(await th())==='dark');
  await a.click('.themebtn');await a.waitForTimeout(150);ok(`${email}: back to light`,(await th())==='light');
  ok(`${email}: no browser errors`,a.errs.length===0,JSON.stringify(a.errs));}
 const a2=await login(b,'admin@example.com');await a2.goto(BASE+'/settings');await a2.waitForLoadState('networkidle');
 ok('Settings no longer has an Appearance panel',(await a2.locator('h3:text-is("Appearance")').count())===0);
 console.log(fail?`${fail} FAILURES`:'ALL THEME CHECKS PASSED');await b.close();})();
