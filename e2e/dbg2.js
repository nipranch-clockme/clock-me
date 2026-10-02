const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});const p=await b.newPage();
await p.goto('http://localhost:3000/login');await p.waitForLoadState('networkidle');await p.fill('#email','priya@example.com');await p.fill('#password','wrong');await p.click('button:has-text("Sign in")');await p.waitForSelector('[role=alert]');
console.log('after err email=',await p.inputValue('#email'),'pw=',await p.inputValue('#password'));
await p.fill('#password','password123');console.log('before 2nd email=',await p.inputValue('#email'));await p.click('button:has-text("Sign in")');await p.waitForTimeout(4000);console.log(p.url(), await p.textContent('[role=alert]').catch(()=>'-'));await b.close()})();
