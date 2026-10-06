// Theme picker: pick each theme under Settings and on My profile, it applies at once and survives a reload.
const {start,login,BASE}=require('./helpers');
let fail=0;const ok=(n,c,x='')=>{console.log((c?'PASS ':'FAIL ')+n+(x?' — '+x:''));if(!c)fail++};
(async()=>{const b=await start();
 const a=await login(b,'admin@example.com');
 await a.goto(BASE+'/settings');await a.waitForLoadState('networkidle');
 ok('Settings has five themes',(await a.locator('.themecard').count())===5);
 for(const t of ['Dark','Neon','Minimal','Glass','Light']){
  await a.locator('.themecard',{hasText:t}).first().click();await a.waitForTimeout(150);
  const id=t.toLowerCase();ok(`${t} applies at once`,(await a.evaluate(()=>document.documentElement.dataset.theme))===id);
  await a.reload();await a.waitForLoadState('networkidle');
  ok(`${t} survives a reload`,(await a.evaluate(()=>document.documentElement.dataset.theme))===id&&(await a.locator(`.themecard.on:has-text("${t}")`).count())===1);}
 const m=await login(b,'tom@example.com');
 await m.goto(BASE+'/profile');await m.waitForLoadState('networkidle');
 ok('members can pick a theme on My profile',(await m.locator('.themecard').count())===5);
 ok('no browser errors',a.errs.length===0&&m.errs.length===0,JSON.stringify([...a.errs,...m.errs]));
 console.log(fail?`${fail} FAILURES`:'ALL THEME CHECKS PASSED');await b.close();})();
