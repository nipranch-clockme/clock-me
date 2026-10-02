const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});const p=await b.newPage();
await p.goto('http://localhost:3000/login');await p.waitForLoadState('networkidle');await p.fill('#email','priya@example.com');await p.fill('#password','password123');await p.click('button:has-text("Sign in")');await p.waitForURL('**/timesheet',{timeout:60000});await p.waitForTimeout(2000);
const btn=await p.$('nextjs-portal');if(btn){const t=await p.evaluate(()=>document.querySelector('nextjs-portal').shadowRoot.textContent);console.log(t.slice(0,300));}
await p.evaluate(()=>{const r=document.querySelector('nextjs-portal')?.shadowRoot;r?.querySelector('[data-issues-open]')?.click?.()});await p.waitForTimeout(1000);
const t2=await p.evaluate(()=>document.querySelector('nextjs-portal')?.shadowRoot?.textContent||'');console.log(t2.slice(0,800));await b.close()})();
