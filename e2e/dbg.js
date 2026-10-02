const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});const p=await b.newPage();
p.on('console',m=>console.log('console',m.type(),m.text().slice(0,200)));p.on('pageerror',e=>console.log('pageerror',e.message));
await p.goto('http://localhost:3000/login');await p.fill('#email','priya@example.com');await p.fill('#password','password123');await p.click('button:has-text("Sign in")');await p.waitForTimeout(5000);console.log(p.url(), await p.textContent('body').then(t=>t.slice(0,300)));await b.close()})();
