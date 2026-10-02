const {start,login,BASE}=require('./helpers');
const sam=`sam${process.pid}@example.com`;
(async()=>{const b=await start();
 const p=await login(b,'oliver@example.com');
 await p.goto(BASE+'/people');await p.waitForLoadState('networkidle');
 console.log('loc mgr rows:',await p.locator('tbody tr').count(),'role options:',(await p.locator('#pf-role option').allInnerTexts()).length);
 await p.click('button:has-text("Invite person")');await p.waitForSelector('dialog[open]');
 console.log('role options:',(await p.locator('#pf-role option').allInnerTexts()).join('|'),'office options:',(await p.locator('#pf-loc option').allInnerTexts()).join('|'));
 await p.fill('#pf-name','Sam Rivera');await p.fill('#pf-email',sam);await p.selectOption('#pf-role','LEADER');
 await p.click('dialog button:has-text("Create invite")');await p.waitForSelector('dialog .err-text');console.log('validation:',await p.textContent('dialog .err-text'));
 await p.selectOption('#pf-team',{label:'Operations'});await p.click('dialog button:has-text("Create invite")');await p.waitForSelector('#pf-link');
 const link=await p.inputValue('#pf-link');console.log('invite link:',link.replace(/[^/]+$/,'<token>'));
 await p.screenshot({path:'/tmp/claude-0/shots/people-invite.png'});
 await p.click('dialog button:has-text("Done")');await p.waitForTimeout(800);
 console.log('pending row:',(await p.locator(`tr:has-text("${sam}")`).innerText()).replace(/\s+/g,' '));
 // edit a person
 await p.locator('tr:has-text("Jonas Weber") button:has-text("Edit")').click();await p.fill('#pf-target','37.5');await p.click('dialog button:has-text("Save changes")');await p.waitForTimeout(1500);
 console.log('jonas row:',(await p.locator('tr:has-text("Jonas Weber")').innerText()).replace(/\s+/g,' '));
 console.log('errors',p.errs);
 // accept invite in a new context
 const ctx=await b.newContext();const q=await ctx.newPage();await q.goto(link);await q.waitForLoadState('networkidle');console.log('invite page:',await q.textContent('h2'));
 await q.fill('input[name=password]','samsam123');await q.fill('input[name=confirm]','samsam123');await q.click('button');await q.waitForURL(/\/(timesheet|dashboard)$/,{timeout:60000});console.log('invite accepted ->',q.url().replace(BASE,''));
 // forgot password page
 const r=await ctx.newPage();await r.goto(BASE+'/login/forgot');await r.waitForLoadState('networkidle');
 if(await r.isVisible('#email')){await r.fill('#email','priya@example.com');await r.click('button');await r.waitForSelector('[role=status]:not(:empty)');}
 console.log('forgot:',(await r.locator('[role=status]').textContent()).slice(0,60));
 // the used invite link no longer works
 const q2=await (await b.newContext()).newPage();await q2.goto(link);console.log('used link:',await q2.textContent('h2'));
 await b.close()})();
