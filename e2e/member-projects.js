// Projects tab for team members: only the projects they've been added to (directly, through their team or office, or as
// a manager), and no clients, client filter or phase templates. Others keep the full page.
// Sets up its own test person and projects directly in the local database (PSQL defaults to the sample database on this machine).
const {execSync}=require('child_process');
const {start,login,BASE}=require('./helpers');
const PSQL=process.env.PSQL||'psql -h /tmp -U postgres clockme';
const sql=(q)=>execSync(`${PSQL} -v ON_ERROR_STOP=1 -At`,{input:q}).toString().trim();
const ok=(name,cond,detail='')=>{console.log(`${cond?'PASS':'FAIL'} ${name}${detail?' — '+detail:''}`);if(!cond)process.exitCode=1;};
(async()=>{
 const b=await start();
 const t='mp'+process.pid, email=t+'@example.com';
 const priya=sql(`select "locationId"||'|'||"teamId"||'|'||"passwordHash" from "User" where email='priya@example.com'`).split('|');
 const [loc,team,hash]=priya;
 const otherLoc=sql(`select id from "Location" where id<>'${loc}' limit 1`);
 const otherTeam=sql(`select id from "Team" where id<>'${team}' limit 1`);
 const client=sql(`select id from "Client" order by name limit 1`);
 const P=(k,access,archived=false)=>{sql(`insert into "Project"(id,name,"clientId",access,archived) values('${t}${k}','${t} ${k}','${client}','${access}',${archived})`);return `${t} ${k}`;};
 const names={};
 try{
  sql(`insert into "User"(id,email,name,"passwordHash",role,"locationId","teamId","weeklyTarget","createdAt") values('${t}','${email}','Member Projects Test','${hash}','MEMBER','${loc}','${team}',40, now())`);
  names.direct=P('direct','RESTRICTED');sql(`insert into "ProjectUserAccess"("projectId","userId") values('${t}direct','${t}')`);
  names.team=P('team','RESTRICTED');sql(`insert into "ProjectTeamAccess"("projectId","teamId") values('${t}team','${team}')`);
  names.office=P('office','RESTRICTED');sql(`insert into "ProjectLocationAccess"("projectId","locationId") values('${t}office','${loc}')`);
  names.managed=P('managed','RESTRICTED');sql(`insert into "ProjectManager"("projectId","userId") values('${t}managed','${t}')`);
  names.managedPublic=P('managedpub','PUBLIC');sql(`insert into "ProjectManager"("projectId","userId") values('${t}managedpub','${t}')`);
  names.public=P('public','PUBLIC');
  names.publicLeftover=P('leftover','PUBLIC');sql(`insert into "ProjectUserAccess"("projectId","userId") values('${t}leftover','${t}')`);
  names.otherTeam=P('otherteam','RESTRICTED');sql(`insert into "ProjectTeamAccess"("projectId","teamId") values('${t}otherteam','${otherTeam}')`);
  names.otherOffice=P('otheroffice','RESTRICTED');sql(`insert into "ProjectLocationAccess"("projectId","locationId") values('${t}otheroffice','${otherLoc}')`);
  names.archived=P('archived','RESTRICTED',true);sql(`insert into "ProjectUserAccess"("projectId","userId") values('${t}archived','${t}')`);

  const p=await login(b,email);await p.goto(BASE+'/projects');await p.waitForLoadState('networkidle');
  const rows=await p.$$eval('tbody tr td:first-child',tds=>tds.map(td=>td.childNodes[1]?.textContent?.trim()||td.textContent.trim()));
  const mine=rows.filter(r=>r.startsWith(t));
  const want=[names.direct,names.team,names.office,names.managed].sort();
  ok('member sees only projects they were added to',JSON.stringify(mine.sort())===JSON.stringify(want),JSON.stringify(mine));
  const sample=sql(`select name from "Project" p where not archived and access='RESTRICTED' and ((exists(select 1 from "ProjectManager" m where m."projectId"=p.id and m."userId"='${t}') or (exists(select 1 from "ProjectUserAccess" u where u."projectId"=p.id and u."userId"='${t}') or exists(select 1 from "ProjectTeamAccess" x where x."projectId"=p.id and x."teamId"='${team}') or exists(select 1 from "ProjectLocationAccess" l where l."projectId"=p.id and l."locationId"='${loc}'))))`).split('\n').filter(Boolean).sort();
  ok('row count matches the rule',rows.length===sample.length,`${rows.length} vs ${sample.length}`);
  const body=await p.textContent('main');
  ok('no Clients section',!(await p.$('h3:text-is("Clients")')));
  ok('no Phase templates section',!(await p.$('h3:text-is("Phase templates")')));
  ok('no client filter',!body.includes('All clients'));
  ok('no New project button',(await p.locator('button:has-text("New project")').count())===0);
  ok('note explains open-to-everyone projects',body.includes("you've been added to")&&body.includes('open to everyone'));
  const html=await p.content();
  const stranger=sql(`select name from "User" u where active and id<>'${t}' and not exists(select 1 from "ProjectUserAccess" a where a."userId"=u.id) and not exists(select 1 from "ProjectManager" m where m."userId"=u.id) order by name limit 1`);
  ok('page data has no list of everyone in the company',stranger&&!html.includes(stranger),stranger);
  // the client filter in the address bar is ignored for members
  const otherClient=sql(`select id from "Client" where id<>'${client}' limit 1`);
  await p.goto(BASE+'/projects?client='+otherClient);await p.waitForLoadState('networkidle');
  ok('client in the address bar does not hide their projects',(await p.$$eval('tbody tr',r=>r.length))===rows.length);
  // they can still log time on public projects
  await p.goto(BASE+'/timesheet');await p.waitForLoadState('networkidle');
  await p.click('button:has-text("Add project row")');await p.waitForSelector('dialog[open] #addrow-project');
  const opts=await p.$$eval('#addrow-project option',o=>o.map(x=>x.textContent));
  ok('timesheet still offers public projects',opts.includes(names.public)&&opts.includes(names.publicLeftover),'');
  ok('timesheet still offers added projects',opts.includes(names.direct)&&opts.includes(names.team));
  ok('no browser errors',p.errs.length===0,JSON.stringify(p.errs));

  // a member with no added projects (moved to a new office with no team) gets a clear empty message, outside the table
  sql(`insert into "Location"(id,name) values('${t}loc','Test office ${t}'); update "User" set "teamId"=null, "locationId"='${t}loc' where id='${t}'; delete from "ProjectUserAccess" where "userId"='${t}'; delete from "ProjectManager" where "userId"='${t}'`);
  await p.goto(BASE+'/projects');await p.waitForLoadState('networkidle');
  ok('empty message for a member with no projects',(await p.textContent('main')).includes("You haven't been added to any projects yet")&&(await p.locator('table').count())===0);

  // a project manager still sees clients, templates and every visible project
  const r=await login(b,'rosa@example.com');await r.goto(BASE+'/projects');await r.waitForLoadState('networkidle');
  ok('project manager sees Phase templates; clients are on the Clients tab',!(await r.$('h3:text-is("Clients")'))&&!!(await r.$('h3:text-is("Phase templates")')));
  ok('project manager still sees public projects',(await r.textContent('main')).includes(names.public));
 }finally{
  sql(`delete from "Project" where id like '${t}%'`);
  sql(`delete from "AuditLog" where "userId"='${t}' or "targetUserId"='${t}'`);
  sql(`delete from "User" where id='${t}'`);
  sql(`delete from "Location" where id='${t}loc'`);
  await b.close();
 }
})();
