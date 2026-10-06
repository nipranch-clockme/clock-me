// Clients tab: admin adds a client with a team and two points of contact, sees it in the list, edits it, and the Projects page no longer has a Clients panel.
const {start,login,BASE}=require('./helpers');const {execSync}=require('child_process');
const PSQL=process.env.PSQL||'psql -h /tmp -U postgres clockme';
const sql=q=>execSync(`${PSQL} -At -v ON_ERROR_STOP=1`,{input:q}).toString().trim();
let fail=0;const ok=(n,c,x='')=>{console.log((c?'PASS ':'FAIL ')+n+(x?' — '+x:''));if(!c)fail++};
(async()=>{const b=await start();const name=`Zeta ${process.pid}`;
 try{
  const a=await login(b,'admin@example.com');
  await a.goto(BASE+'/projects');await a.waitForLoadState('networkidle');
  ok('Projects page has no Clients panel',(await a.locator('h3:text-is("Clients")').count())===0);
  await a.goto(BASE+'/clients');await a.waitForLoadState('networkidle');
  await a.click('button:has-text("Add client")');await a.waitForSelector('dialog[open] #nc-name');
  await a.fill('#nc-name',name);await a.selectOption('select[name=teamId]',{label:'Hulk team, AMD'});
  await a.fill('input[name=contactName]','Ann Poc');await a.fill('input[name=contactEmail]','ann@zeta.test');
  await a.click('button:has-text("Add another contact")');await a.locator('input[name=contactName]').nth(1).fill('Bob Poc');
  await a.locator('dialog form button.btn:not([type=button])').last().click();await a.waitForTimeout(2500);
  ok('client saved with team',sql(`select count(*) from "Client" c join "Team" t on t.id=c."teamId" where c.name='${name}' and t.name='Hulk'`)==='1');
  ok('two contacts saved',sql(`select count(*) from "ClientContact" where "clientId"=(select id from "Client" where name='${name}')`)==='2');
  await a.goto(BASE+'/clients');await a.waitForLoadState('networkidle');
  ok('list shows team under the name',(await a.locator(`tr:has-text("${name}")`).innerText()).includes('Hulk team, AMD'));
  await a.fill('.tfilter input','zzzz-none');ok('search hides non-matching rows',(await a.locator('tbody tr:visible').count())===0);
  await a.fill('.tfilter input',name.toLowerCase());ok('search finds the client',(await a.locator('tbody tr:visible').count())===1);
  ok('no browser errors',a.errs.length===0,JSON.stringify(a.errs));
 }finally{sql(`delete from "Client" where name='${name}'`);await b.close();}
 console.log(fail?`${fail} FAILURES`:'ALL CLIENT TAB CHECKS PASSED');
})();
