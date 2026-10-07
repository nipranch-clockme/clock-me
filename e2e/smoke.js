const {chromium}=require('playwright');
const BASE=process.env.BASE||'http://localhost:3000';
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});const p=await b.newPage({viewport:{width:1200,height:1000}});
const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/fonts|ERR_CERT/.test(m.text()))errs.push(m.text())});
await p.goto(BASE+'/login');await p.waitForLoadState('networkidle');await p.fill('#email','priya@example.com');await p.fill('#password','wrong');await p.click('button:has-text("Sign in")');await p.waitForSelector('[role=alert]');await p.waitForTimeout(800);
await p.fill('#password','password123');await p.click('button:has-text("Sign in")');await p.waitForURL('**/timesheet',{timeout:90000});
await p.screenshot({path:'/tmp/claude-0/a-sheet.png',fullPage:true});
await p.click('button:has-text("Add project row")');await p.waitForSelector('dialog[open] #addrow-project');
const opt=await p.$eval('#addrow-project',s=>[...s.options].find(o=>o.value)?.textContent);
if(opt){await p.selectOption('#addrow-project',{label:opt});await p.click('dialog[open] button:has-text("Add row")');await p.waitForTimeout(1500);}else{await p.click('dialog[open] button:has-text("Close")');}
await p.click('button.addcell >> nth=0');await p.waitForSelector('dialog[open] #e-phase');
await p.click('dialog button:has-text("Add entry")');await p.waitForSelector('dialog [role=alert]');console.log('validation:',await p.textContent('dialog [role=alert]'));
await p.selectOption('#e-phase',{index:1});await p.locator('.tagpick-i input').first().check();await p.fill('#e-desc','Logo options');await p.fill('#e-dur','1:30');
await p.click('dialog button:has-text("Add entry")');await p.waitForTimeout(2500);
await p.screenshot({path:'/tmp/claude-0/a-sheet2.png',fullPage:true});
console.log('errors',errs);await b.close()})();
