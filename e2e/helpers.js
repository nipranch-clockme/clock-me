const {chromium}=require('playwright');
const BASE=process.env.BASE||'http://localhost:3000';
async function start(){const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});return b;}
async function login(b,email){const ctx=await b.newContext({viewport:{width:1280,height:1000}});const p=await ctx.newPage();
 p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/fonts|ERR_CERT|favicon|404/.test(m.text()))p.errs.push(m.text())});
 await p.goto(BASE+'/login');await p.waitForLoadState('networkidle');await p.fill('#email',email);await p.fill('#password','password123');
 await p.click('button:has-text("Sign in")');await p.waitForURL(u=>!u.pathname.startsWith('/login'),{timeout:90000});return p;}
module.exports={start,login,BASE};
