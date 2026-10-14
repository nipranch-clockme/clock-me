// People can be archived but never deleted: an archived person can't sign in and drops out of the Active list,
// their time stays, and restoring them brings everything back. Admins and location managers can both do it,
// and the People page has a Status filter (Active, Archived, All) beside the office filter.
// Creates its own test people in the local database (PSQL defaults to the sample database on this machine).
const {execSync}=require('child_process');
const {start,login,BASE}=require('./helpers');
const PSQL=process.env.PSQL||'psql -h /tmp -U postgres clockme';
const sql=(q)=>execSync(`${PSQL} -v ON_ERROR_STOP=1 -At`,{input:q}).toString().trim();
const ok=(name,cond,detail='')=>{console.log(`${cond?'PASS':'FAIL'} ${name}${detail?' — '+detail:''}`);if(!cond)process.exitCode=1;};

(async()=>{
 const b=await start();
 const t='pa'+process.pid;
 const priya=sql(`select "locationId"||'|'||"passwordHash" from "User" where email='priya@example.com'`).split('|');
 const [loc,hash]=priya;
 const ravi=sql(`select "locationId" from "User" where email='ravi@example.com'`);
 const mk=(id,name,locId)=>sql(`insert into "User"(id,email,name,"passwordHash",role,"locationId","teamId","weeklyTarget","createdAt") values('${id}','${id}@example.com','${name}','${hash}','MEMBER','${locId}',null,40, now())`);
 const adminName=`Archive A ${process.pid}`, riviName=`Archive R ${process.pid}`;
 try{
  mk(t+'a',adminName,loc);
  mk(t+'r',riviName,ravi);

  // Admin: archive from the edit dialog, check the lists, sign-in, then restore.
  const a=await login(b,'admin@example.com');
  await a.goto(BASE+'/people');await a.waitForLoadState('networkidle');
  const statusOn=(p)=>p.locator('[role="group"][aria-label="Status"] button[aria-pressed="true"]').innerText();
  const rowOf=(p,name)=>p.locator('table.pptable tbody tr',{hasText:name});
  ok('Status starts at Active', (await statusOn(a))==='Active');
  ok('a new person is in the Active list', await rowOf(a,adminName).count()===1);
  await rowOf(a,adminName).locator('button:has-text("Edit")').click();
  await a.waitForSelector('dialog[open] button:has-text("Archive person")');
  ok('the edit dialog offers archive and no delete button', await a.locator('dialog[open] button:has-text("Delete"), dialog[open] button:has-text("Remove")').count()===0);
  await a.click('dialog[open] button:has-text("Archive person")');
  await a.waitForFunction(()=>!document.querySelector('dialog[open]'),null,{timeout:20000});
  await a.waitForLoadState('networkidle');
  ok('archived person leaves the Active list', await rowOf(a,adminName).count()===0);
  await a.click('[role="group"][aria-label="Status"] button:has-text("Archived")');
  const archivedRow=rowOf(a,adminName);
  ok('Archived lists them with an Archived pill', await archivedRow.count()===1 && (await archivedRow.locator('.pill').innerText()).includes('Archived'));
  ok('the count line shows the filter result', (await a.locator('.pfilter .note').innerText()).includes('1 of'));
  ok('archived rows show the restore button in the dialog', await (async()=>{await archivedRow.locator('button:has-text("Edit")').click();await a.waitForSelector('dialog[open] button:has-text("Restore person")');const has=await a.locator('dialog[open] button:has-text("Restore person")').count()===1;await a.keyboard.press('Escape');await a.waitForFunction(()=>!document.querySelector('dialog[open]'));return has;})());

  const c=await b.newContext();const p=await c.newPage();
  // Signs in on a fresh page each time; true when the app takes them past the login page.
  const signIn=async(email)=>{await p.goto(BASE+'/login');await p.waitForLoadState('networkidle');await p.fill('#email',email);await p.fill('#password','password123');await p.click('button:has-text("Sign in")');try{await p.waitForURL(u=>!u.pathname.startsWith('/login'),{timeout:30000});return true;}catch(e){return false;}};
  // A refused sign-in stays on the login page; wait a few seconds so a slow redirect can't be mistaken for it.
  await p.goto(BASE+'/login');await p.waitForLoadState('networkidle');await p.fill('#email',t+'a@example.com');await p.fill('#password','password123');await p.click('button:has-text("Sign in")');await p.waitForTimeout(4000);
  ok('an archived person cannot sign in', /\/login/.test(p.url()));

  await a.click('[role="group"][aria-label="Status"] button:has-text("Archived")');
  await rowOf(a,adminName).locator('button:has-text("Edit")').click();
  await a.waitForSelector('dialog[open] button:has-text("Restore person")');
  await a.click('dialog[open] button:has-text("Restore person")');
  await a.waitForFunction(()=>!document.querySelector('dialog[open]'),null,{timeout:20000});
  await a.waitForLoadState('networkidle');
  await a.click('[role="group"][aria-label="Status"] button:has-text("Active")');
  ok('restored person is back in the Active list without the Archived pill', await rowOf(a,adminName).count()===1 && await rowOf(a,adminName).locator('.pill:has-text("Archived")').count()===0);
  ok('a restored person can sign in again', await signIn(t+'a@example.com'));

  // Admins can't archive themselves: their own edit dialog has no archive control.
  await a.click('[role="group"][aria-label="Status"] button:has-text("All")');
  await rowOf(a,'admin@example.com').locator('button:has-text("Edit")').click();
  await a.waitForSelector('dialog[open]');
  ok('you cannot archive yourself', await a.locator('dialog[open] button:has-text("Archive person")').count()===0);
  await a.keyboard.press('Escape');
  await a.waitForFunction(()=>!document.querySelector('dialog[open]'));

  // Location manager: archives and restores a person in their own office.
  const r=await login(b,'ravi@example.com');
  await r.goto(BASE+'/people');await r.waitForLoadState('networkidle');
  ok('location manager has no office filter (one office)', await r.locator('[role="group"][aria-label="Office"]').count()===0);
  ok('location manager has the Status filter', await r.locator('[role="group"][aria-label="Status"]').count()===1);
  await rowOf(r,riviName).locator('button:has-text("Edit")').click();
  await r.waitForSelector('dialog[open] button:has-text("Archive person")');
  await r.click('dialog[open] button:has-text("Archive person")');
  await r.waitForFunction(()=>!document.querySelector('dialog[open]'),null,{timeout:20000});
  await r.waitForLoadState('networkidle');
  ok('location manager archives a person in their office', await rowOf(r,riviName).count()===0);
  await r.click('[role="group"][aria-label="Status"] button:has-text("Archived")');
  await rowOf(r,riviName).locator('button:has-text("Edit")').click();
  await r.waitForSelector('dialog[open] button:has-text("Restore person")');
  await r.click('dialog[open] button:has-text("Restore person")');
  await r.waitForFunction(()=>!document.querySelector('dialog[open]'),null,{timeout:20000});
  await r.waitForLoadState('networkidle');
  await r.click('[role="group"][aria-label="Status"] button:has-text("Active")');
  ok('location manager restores a person', await rowOf(r,riviName).count()===1);

  ok('no browser errors', (a.errs||[]).length+(r.errs||[]).length===0, JSON.stringify([a.errs,r.errs]));
 } finally {
  // Nothing is deleted from the product; the throwaway test people are left in the test database, active.
  sql(`update "User" set active=true where id in ('${t}a','${t}r')`);
 }
 await b.close();
})().catch((e)=>{console.log('ERR',e.message.slice(0,500));process.exitCode=1;});
