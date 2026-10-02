// Timesheet rows: add a project row, click a day to add time, hover for details, edit, delete, remove rows, copy rows, read-only once submitted.
// Sets up its own test person directly in the local database (PSQL defaults to the sample database on this machine).
const {execSync}=require('child_process');
const {start,login,BASE}=require('./helpers');
const PSQL=process.env.PSQL||'psql -h /tmp -U postgres clockme';
const sql=(q)=>execSync(`${PSQL} -v ON_ERROR_STOP=1 -At`,{input:q}).toString().trim();
const ok=(name,cond,detail='')=>{console.log(`${cond?'PASS':'FAIL'} ${name}${detail?' — '+detail:''}`);if(!cond)process.exitCode=1;};
const addDays=(d,n)=>{const x=new Date(d+'T00:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10);};
const mondayOf=(d)=>{const x=new Date(d+'T00:00:00Z');return addDays(d,-((x.getUTCDay()+6)%7));};

(async()=>{
 const b=await start();
 const uid='tsrow'+process.pid, email=uid+'@example.com';
 const proj=sql(`select id from "Project" where name='Patient portal'`);
 const pub=sql(`select p.id||'|'||p.name from "Project" p where access='PUBLIC' and not archived order by name limit 2`).split('\n').map(x=>x.split('|'));
 const priya=sql(`select "locationId"||'|'||"teamId"||'|'||"passwordHash" from "User" where email='priya@example.com'`).split('|');
 const todayStr=sql(`select to_char(now() at time zone 'UTC','YYYY-MM-DD')`), ws=mondayOf(todayStr), wed=addDays(ws,2);
 try{
  sql(`insert into "User"(id,email,name,"passwordHash",role,"locationId","teamId","weeklyTarget","createdAt") values('${uid}','${email}','Row Test','${priya[2]}','MEMBER','${priya[0]}','${priya[1]}',40, now()-interval '30 days')`);
  sql(`insert into "ProjectUserAccess"("projectId","userId") values('${proj}','${uid}')`);
  // last week: a row with no time, to be copied
  sql(`insert into "TimesheetRow"("userId","weekStart","projectId") values('${uid}','${addDays(ws,-7)}','${pub[1][0]}')`);
  const p=await login(b,email);await p.goto(BASE+'/timesheet');await p.waitForLoadState('networkidle');
  ok('empty week explains what to do',(await p.textContent('table.sheet tbody')).includes('Add project row'));
  ok('old "Add entry with details" button is gone',!(await p.isVisible('button:has-text("Add entry with details")')));

  // add a row
  await p.click('button:has-text("Add project row")');await p.waitForSelector('dialog[open] #addrow-project');
  await p.selectOption('#addrow-project',proj);await p.click('dialog[open] button:has-text("Add row")');
  await p.waitForSelector('button[aria-label="Remove Patient portal row"]');
  ok('added row shows with a remove button',true);
  await p.click('button:has-text("Add project row")');await p.waitForSelector('dialog[open] #addrow-project');
  const opts=await p.$$eval('#addrow-project option',os=>os.map(o=>o.value));
  ok('added project is no longer offered',!opts.includes(proj),`${opts.length} options`);
  ok('add row dialog starts with nothing chosen',(await p.inputValue('#addrow-project'))==='');
  await p.click('dialog[open] button:has-text("Close")');

  // click a day to add time
  await p.click(`tr:has-text("Patient portal") button.addcell[aria-label*="Wed"]`);await p.waitForSelector('dialog[open] #e-phase');
  const ctx=await p.textContent('dialog[open] .sub');
  ok('add dialog names the project, client and day',/Patient portal · Bluebird Health · Wed, \w+ \d+/.test(ctx),ctx);
  ok('add dialog has no project, date or start pickers',!(await p.isVisible('dialog[open] #e-project'))&&!(await p.isVisible('dialog[open] #e-date'))&&!(await p.isVisible('dialog[open] #e-start')));
  const labels=await p.$$eval('dialog[open] label',ls=>ls.map(l=>l.textContent.replace(' *','').trim()));
  ok('add dialog asks phase, tag, duration and description, and no Ticket ID',['Phase','Tag','Duration','Description'].every(x=>labels.includes(x))&&!labels.includes('Ticket ID'),labels.join(', '));
  await p.click('dialog[open] button:has-text("Add entry")');await p.waitForSelector('dialog[open] [role=alert]');
  ok('phase is required',/Phase/.test(await p.textContent('dialog[open] [role=alert]')));
  await p.selectOption('#e-phase',{label:'Build'});await p.selectOption('#e-tag',{label:'Development'});await p.fill('#e-dur','2');await p.fill('#e-desc','API work');
  await p.click('dialog[open] button:has-text("Add entry")');await p.waitForSelector('dialog[open]',{state:'detached'}).catch(()=>{});await p.waitForSelector('tr:has-text("Patient portal") button.chipbtn');
  ok('chip appears in the day cell',(await p.textContent('tr:has-text("Patient portal") button.chipbtn'))==='2.00');
  ok('remove button hides once the row has time',!(await p.isVisible('button[aria-label="Remove Patient portal row"]')));

  // second entry in the same cell starts after the first
  await p.click(`tr:has-text("Patient portal") button.addcell[aria-label*="Wed"]`);await p.waitForSelector('dialog[open] #e-phase');
  await p.selectOption('#e-phase',{label:'Design'});await p.selectOption('#e-tag',{label:'Design'});await p.fill('#e-dur','1:30');await p.fill('#e-desc','Screens');
  await p.click('dialog[open] button:has-text("Add entry")');await p.waitForFunction(()=>document.querySelectorAll('button.chipbtn').length===2);
  ok('two entries stack in one cell',(await p.$$eval('button.chipbtn',bs=>bs.map(b=>b.textContent))).join(',')==='2.00,1.50');
  ok('second entry starts where the first ends',sql(`select string_agg("startMin"::text, ',' order by "startMin") from "TimeEntry" where "userId"='${uid}'`)==='540,660');

  // hover shows details
  await p.hover('button.chipbtn >> nth=0');await p.waitForSelector('.sheettip');
  const tip=await p.textContent('.sheettip');
  ok('hover shows phase, tag and description',/Build/.test(tip)&&/Development/.test(tip)&&/API work/.test(tip),tip);
  const box=await p.$eval('.sheettip',e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight});
  ok('tooltip is fully on screen',box);
  await p.mouse.move(5,5);await p.waitForSelector('.sheettip',{state:'detached'});

  // edit and delete
  await p.click('button.chipbtn >> nth=0');await p.waitForSelector('dialog[open] #e-dur');
  ok('clicking a chip opens it for editing',(await p.textContent('dialog[open] h2'))==='Edit time'&&(await p.inputValue('#e-desc'))==='API work');
  await p.fill('#e-dur','2.5');await p.click('dialog[open] button:has-text("Save changes")');await p.waitForFunction(()=>document.querySelector('button.chipbtn')?.textContent==='2.50');
  ok('edited time shows on the chip',true);
  await p.click('button.chipbtn >> nth=1');await p.waitForSelector('dialog[open] button:has-text("Delete entry")');await p.click('dialog[open] button:has-text("Delete entry")');
  await p.waitForFunction(()=>document.querySelectorAll('button.chipbtn').length===1);
  ok('deleted entry disappears',true);
  await p.waitForTimeout(600);
  ok('no tooltip left behind after deleting',(await p.$$('.sheettip')).length===0);

  // remove an empty row, and rows survive a reload
  await p.click('button:has-text("Add project row")');await p.waitForSelector('dialog[open] #addrow-project');await p.selectOption('#addrow-project',pub[0][0]);await p.click('dialog[open] button:has-text("Add row")');
  await p.waitForSelector(`button[aria-label="Remove ${pub[0][1]} row"]`);await p.click(`button[aria-label="Remove ${pub[0][1]} row"]`);
  await p.waitForSelector(`button[aria-label="Remove ${pub[0][1]} row"]`,{state:'detached'});
  await p.reload();await p.waitForLoadState('networkidle');
  ok('rows are remembered after reload, removed row stays gone',(await p.isVisible('tr:has-text("Patient portal")'))&&!(await p.isVisible(`tr:has-text("${pub[0][1]}")`)));

  // the whole free part of a cell is clickable, even in a tall row
  const cellBox=await p.$eval(`tr:has-text("Patient portal") td.sheetcell >> nth=0`,td=>{const r=td.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+4}}).catch(()=>null);
  if(cellBox){await p.mouse.click(cellBox.x,cellBox.y);}
  ok('clicking the top edge of an empty cell opens Add time',!!cellBox&&await p.isVisible('dialog[open] #e-phase'));
  if(await p.isVisible('dialog[open] #e-phase'))await p.click('dialog[open] button:has-text("Close")');

  // a day that starts early: new time follows the last entry, not 09:00
  const fri=addDays(ws,4);
  sql(`insert into "TimeEntry"(id,"userId","projectId","phaseId","tagId",date,"startMin",minutes,description) values('${uid}e','${uid}','${proj}',(select id from "Phase" where "projectId"='${proj}' and name='Build'),(select id from "Tag" where name='Development'),'${fri}',360,120,'early')`);
  await p.reload();await p.waitForLoadState('networkidle');
  await p.click(`tr:has-text("Patient portal") button.addcell[aria-label*="Fri"]`);await p.waitForSelector('dialog[open] #e-phase');
  await p.selectOption('#e-phase',{label:'Build'});await p.selectOption('#e-tag',{label:'Development'});await p.fill('#e-dur','1');await p.fill('#e-desc','after early');
  await p.click('dialog[open] button:has-text("Add entry")');await p.waitForFunction(()=>[...document.querySelectorAll('button.chipbtn')].length>=3);
  ok('time after an early entry starts at 08:00',sql(`select "startMin" from "TimeEntry" where "userId"='${uid}' and description='after early'`)==='480');

  // deleting the only entry on a row that came from the calendar keeps the row
  const thu=addDays(ws,3);
  sql(`insert into "TimeEntry"(id,"userId","projectId","phaseId",date,"startMin",minutes,description) values('${uid}f','${uid}','${pub[0][0]}',(select id from "Phase" where "projectId"='${pub[0][0]}' order by sort limit 1),'${thu}',540,60,'from calendar')`);
  await p.reload();await p.waitForLoadState('networkidle');
  await p.click(`tr:has-text("${pub[0][1]}") button.chipbtn`);await p.waitForSelector('dialog[open] button:has-text("Delete entry")');await p.click('dialog[open] button:has-text("Delete entry")');
  await p.waitForSelector(`button[aria-label="Remove ${pub[0][1]} row"]`);
  ok('deleting the last entry keeps the row',await p.isVisible(`tr:has-text("${pub[0][1]}")`));
  await p.click(`button[aria-label="Remove ${pub[0][1]} row"]`);await p.waitForSelector(`button[aria-label="Remove ${pub[0][1]} row"]`,{state:'detached'});

  // time on an archived project stays visible but takes no new time, and can be moved
  const client=sql(`select "clientId" from "Project" where id='${proj}'`);
  sql(`insert into "Project"(id,name,"clientId",archived) values('arch${uid}','Old work ${uid}','${client}',true); insert into "Phase"(id,"projectId",name,sort) values('archph${uid}','arch${uid}','Wrap up',0);
       insert into "TimeEntry"(id,"userId","projectId","phaseId",date,"startMin",minutes,description) values('${uid}g','${uid}','arch${uid}','archph${uid}','${thu}',600,60,'old')`);
  await p.reload();await p.waitForLoadState('networkidle');
  const archRow=`tr:has-text("Old work ${uid}")`;
  ok('archived project row says it is closed and has no add buttons',(await p.textContent(archRow)).includes('closed for new time')&&(await p.$$(`${archRow} button.addcell`)).length===0);
  await p.click(`${archRow} button.chipbtn`);await p.waitForSelector('dialog[open] h2');
  ok('its entry opens with a project picker so it can be moved',await p.isVisible('dialog[open] #e-project'));
  await p.click('dialog[open] button:has-text("Close")');
  sql(`delete from "TimeEntry" where id='${uid}g'`);

  // copy last week brings last week's rows
  await p.click('button:has-text("Copy last week")');await p.waitForURL(/copied=/);
  const notice=await p.textContent('p[role=status]');
  ok('copy last week copies the empty row',/Copied 1 project row/.test(notice)&&(await p.isVisible(`tr:has-text("${pub[1][1]}")`)),notice.trim());

  // once submitted, everything is read-only
  await p.click('button:has-text("Submit for approval")');await p.waitForLoadState('networkidle');await p.waitForTimeout(500);
  ok('submitted week has no add buttons',(await p.$$('button.addcell')).length===0&&!(await p.isVisible('button:has-text("Add project row")'))&&(await p.$$('button.rowx')).length===0);
  await p.click('button.chipbtn >> nth=0');await p.waitForSelector('dialog[open] h2');
  ok('chip opens read-only',(await p.textContent('dialog[open] h2'))==='Time entry'&&(await p.$eval('dialog[open] fieldset',f=>f.disabled)));
  await p.click('dialog[open] button:has-text("Close")');
  // calendar still works with its own picker
  await p.goto(BASE+'/calendar');await p.waitForLoadState('networkidle');
  ok('calendar still shows the entry',(await p.$$('button.ev')).length>=1);
  ok('no browser errors',p.errs.length===0,JSON.stringify(p.errs));
  await p.screenshot({path:'/tmp/claude-0/shots/timesheet-rows.png'}).catch(()=>{});
 }finally{
  sql(`delete from "AuditLog" where "userId"='${uid}' or "targetUserId"='${uid}'`);
  sql(`delete from "User" where id='${uid}'`);
  sql(`delete from "TimeEntry" where "projectId"='arch${uid}'; delete from "Project" where id='arch${uid}'`);
  await b.close();
 }
})();
