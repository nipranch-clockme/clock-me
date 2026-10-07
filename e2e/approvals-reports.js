const {start,login,BASE}=require('./helpers');
(async()=>{const b=await start();
 const p=await login(b,'daniel@example.com');
 await p.goto(BASE+'/approvals');await p.waitForLoadState('networkidle');
 await p.screenshot({path:'/tmp/claude-0/shots/approvals.png',fullPage:true});
 console.log('pending cards:',await p.locator('.panel.full .item').count());
 const rem=p.locator('button:has-text("Send reminder")').first();if(await rem.count()){await rem.click();await p.waitForSelector('[role=status]');console.log('remind:',await p.textContent('[role=status]'));}
 const sb=p.locator('button:has-text("Send back")').first();if(await sb.count()){await sb.click();await p.locator('form button:has-text("Send back")').first().click();await p.waitForSelector('[role=alert]');console.log('sendback validation:',await p.textContent('[role=alert]'));}
 console.log('errors',p.errs);
 const a=await login(b,'admin@example.com');await a.goto(BASE+'/reports?range=lastyear&group=location');await a.waitForLoadState('networkidle');
 console.log('admin by location:',(await a.locator('tbody').innerText()).replace(/\n/g,' | ').replace(/\t/g,' '));
 console.log('member location filter?',await (await login(b,'priya@example.com')).goto(BASE+'/reports').then(()=>0), 'done');
 await b.close()})();
