const {start,login,BASE}=require('./helpers');
(async()=>{const b=await start();
 // Calendar: leader views a teammate
 let p=await login(b,'daniel@example.com');
 await p.goto(BASE+'/calendar');await p.waitForLoadState('networkidle');
 await p.screenshot({path:'/tmp/claude-0/shots/cal.png',fullPage:true});
 const opts=await p.$$eval('select option',os=>os.map(o=>o.textContent));console.log('person picker:',opts.slice(0,10).join(' | '));
 // Projects as leader: create a restricted project
 await p.goto(BASE+'/projects');await p.waitForLoadState('networkidle');
 await p.click('button:has-text("New project")');await p.waitForSelector('dialog[open]');
 await p.click('dialog button:has-text("Create project")');await p.waitForTimeout(300);
 await p.fill('#p-name','Spring campaign');await p.selectOption('#p-client',{index:1});await p.selectOption('#p-tpl',{index:1});
 console.log('phases from template:',await p.inputValue('#p-phases'));
 await p.click('button:has-text("Only chosen")');await p.click('dialog button:has-text("Create project")');await p.waitForSelector('dialog [role=alert]');
 console.log('restricted validation:',await p.textContent('dialog [role=alert]'));
 await p.check('input[name=team] >> nth=0');await p.screenshot({path:'/tmp/claude-0/shots/proj-new.png'});
 await p.click('dialog button:has-text("Create project")');await p.waitForSelector('dialog[open]',{state:'detached',timeout:10000}).catch(()=>{});await p.waitForTimeout(1500);
 console.log('created row:',await p.locator('tr:has-text("Spring campaign")').innerText().catch(()=>'MISSING'));
 await p.screenshot({path:'/tmp/claude-0/shots/proj.png',fullPage:true});
 console.log('leader errors',p.errs);
 // Member: read-only list
 const m=await login(b,'priya@example.com');await m.goto(BASE+'/projects');await m.waitForLoadState('networkidle');
 console.log('member new button:',await m.locator('button:has-text("New project")').count(),'edit links:',await m.locator('a:has-text("Edit")').count(),'rows:',await m.locator('tbody tr').count());
 console.log('member errors',m.errs);
 await b.close()})();
