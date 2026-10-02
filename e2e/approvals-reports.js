const {start,login,BASE}=require('./helpers');
(async()=>{const b=await start();
 const p=await login(b,'daniel@example.com');
 await p.goto(BASE+'/approvals');await p.waitForLoadState('networkidle');
 await p.screenshot({path:'/tmp/claude-0/shots/approvals.png',fullPage:true});
 console.log('pending cards:',await p.locator('.panel.full .item').count());
 const rem=p.locator('button:has-text("Send reminder")').first();if(await rem.count()){await rem.click();await p.waitForSelector('[role=status]');console.log('remind:',await p.textContent('[role=status]'));}
 const sb=p.locator('button:has-text("Send back")').first();if(await sb.count()){await sb.click();await p.locator('form button:has-text("Send back")').first().click();await p.waitForSelector('[role=alert]');console.log('sendback validation:',await p.textContent('[role=alert]'));}
 await p.goto(BASE+'/reports');await p.waitForLoadState('networkidle');
 console.log('stats:',(await p.locator('.stats').first().innerText()).replace(/\n/g,' '));
 await p.selectOption('#rp-range','all');await p.waitForURL(/range=all/);await p.waitForLoadState('networkidle');await p.waitForTimeout(500);
 await p.selectOption('#rp-group','month');await p.waitForURL(/group=month/);await p.waitForTimeout(800);
 console.log('all-time stats:',(await p.locator('.stats').first().innerText()).replace(/\n/g,' '));
 await p.selectOption('#rp-client',{index:1});await p.waitForURL(/client=/);await p.waitForTimeout(800);
 console.log('url',p.url().replace(BASE,''),'clear btn:',await p.locator('a:has-text("Clear")').innerText());
 await p.screenshot({path:'/tmp/claude-0/shots/reports.png',fullPage:true});
 const [dl]=await Promise.all([p.waitForEvent('download'),p.click('a:has-text("Export CSV")')]);const fs=require('fs');const path=await dl.path();const txt=fs.readFileSync(path,'utf8');console.log('csv:',dl.suggestedFilename(),txt.split('\n').length-2,'rows;',txt.split('\n')[0]);
 await p.click('a:has-text("Clear")');await p.waitForURL(u=>!/client=/.test(u.search));await p.waitForTimeout(500);console.log('after clear client select:',await p.inputValue('#rp-client'));
 console.log('errors',p.errs);
 const a=await login(b,'admin@example.com');await a.goto(BASE+'/reports?range=lastyear&group=location');await a.waitForLoadState('networkidle');
 console.log('admin by location:',(await a.locator('tbody').innerText()).replace(/\n/g,' | ').replace(/\t/g,' '));
 console.log('member location filter?',await (await login(b,'priya@example.com')).goto(BASE+'/reports').then(()=>0), 'done');
 await b.close()})();
