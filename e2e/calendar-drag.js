// Calendar: drag down a day to add exactly the dragged time; click still adds an hour; Escape cancels; read-only calendars ignore drags.
// Sets up its own test person directly in the local database (PSQL defaults to the sample database on this machine).
const {execSync}=require('child_process');
const {start,login,BASE}=require('./helpers');
const PSQL=process.env.PSQL||'psql -h /tmp -U postgres clockme';
const sql=(q)=>execSync(`${PSQL} -v ON_ERROR_STOP=1 -At`,{input:q}).toString().trim();
const ok=(name,cond,detail='')=>{console.log(`${cond?'PASS':'FAIL'} ${name}${detail?' — '+detail:''}`);if(!cond)process.exitCode=1;};
const H0=7,PX=40;
(async()=>{
 const b=await start();
 const uid='caldrag'+process.pid, email=uid+'@example.com';
 const proj=sql(`select id from "Project" where name='Patient portal'`);
 const priya=sql(`select "locationId"||'|'||"teamId"||'|'||"passwordHash" from "User" where email='priya@example.com'`).split('|');
 const fmt0=sql(`select "timeFormat" from "Settings"`);
 try{
  sql(`insert into "User"(id,email,name,"passwordHash",role,"locationId","teamId","weeklyTarget","createdAt") values('${uid}','${email}','Drag Test','${priya[2]}','MEMBER','${priya[0]}','${priya[1]}',40, now()-interval '30 days')`);
  sql(`insert into "ProjectUserAccess"("projectId","userId") values('${proj}','${uid}')`);
  const p=await login(b,email);await p.goto(BASE+'/calendar');await p.waitForLoadState('networkidle');
  const col=await p.$('.cal .col >> nth=2');const box=await col.boundingBox();const x=box.x+box.width/2;
  const Y=(h)=>box.y+(h-H0)*PX;
  const drag=async(h1,h2,{check,release=true}={})=>{await p.mouse.move(x,Y(h1)+1);await p.mouse.down();await p.mouse.move(x+30,Y(h2),{steps:12});const label=await p.textContent('.draglabel').catch(()=>null);if(release)await p.mouse.up();return label;};
  const closeDialog=async()=>{if(await p.isVisible('dialog[open]'))await p.click('dialog[open] button:has-text("Close")');await p.waitForTimeout(150);};

  ok('help text mentions dragging',(await p.textContent('main')).includes('drag down the day'));
  ok('crosshair cursor on days you can add to',await col.evaluate(e=>getComputedStyle(e).cursor)==='crosshair');

  // drag 10:00 to 12:30
  let label=await drag(10,12.5);
  ok('drag shows the block with times and length',label&&label.includes('10:00 to 12:30')&&label.includes('2.50 h'),label);
  await p.waitForSelector('dialog[open] #e-start');
  const day0=await p.inputValue('#e-date');
  ok('dialog opens at 10:00 for 2.50 hours',(await p.inputValue('#e-start'))==='10:00'&&(await p.inputValue('#e-dur'))==='2.50',`${await p.inputValue('#e-start')} ${await p.inputValue('#e-dur')}`);
  ok('block disappears when the dialog opens',(await p.$$('.dragsel')).length===0);
  await p.selectOption('#e-project',proj);await p.selectOption('#e-phase',{label:'Submission 1'});await p.selectOption('#e-tag',{label:'CAD'});await p.fill('#e-desc','dragged');
  await p.click('dialog[open] button:has-text("Add entry")');await p.waitForSelector('button.ev');
  ok('saved entry has the dragged start and length',sql(`select "startMin"||','||minutes from "TimeEntry" where "userId"='${uid}'`)==='600,150');

  // upwards, and past the bottom edge
  label=await drag(15,13);await p.waitForSelector('dialog[open] #e-start');
  ok('dragging upwards works',(await p.inputValue('#e-start'))==='13:00'&&(await p.inputValue('#e-dur'))==='2.00',label);await closeDialog();
  label=await drag(18,23);await p.waitForSelector('dialog[open] #e-start');
  ok('dragging past the bottom stops at the grid edge',(await p.inputValue('#e-start'))==='18:00'&&(await p.inputValue('#e-dur'))==='2.00',label);await closeDialog();

  // a short drag keeps its label readable: not cut off, inside the window
  await drag(17,17.25,{release:false});
  const lb=await p.$eval('.draglabel',e=>{const r=e.getBoundingClientRect();return {h:r.height,w:r.width,sw:e.scrollWidth,cw:e.clientWidth,right:r.right,vw:innerWidth,text:e.textContent}});
  await p.mouse.up();await p.waitForSelector('dialog[open] #e-start');
  ok('a 15-minute drag shows its whole label',lb.h>=14&&lb.sw<=lb.cw&&lb.right<=lb.vw&&lb.text.includes('17:00 to 17:15'),JSON.stringify(lb));
  ok('a 15-minute drag opens 0.25 hours',(await p.inputValue('#e-start'))==='17:00'&&(await p.inputValue('#e-dur'))==='0.25');await closeDialog();
  // on Sunday the label lines up on the right so it stays inside the grid
  {const sun=await (await p.$('.cal .col >> nth=6')).boundingBox();const sx=sun.x+sun.width/2;
   await p.mouse.move(sx,Y(9)+1);await p.mouse.down();await p.mouse.move(sx,Y(9.25),{steps:6});
   const r=await p.$eval('.draglabel',e=>{const a=e.getBoundingClientRect(),c=e.parentElement.getBoundingClientRect();return {l:a.left,r:a.right,cl:c.left,cr:c.right}});
   await p.keyboard.press('Escape');await p.mouse.up();await p.waitForTimeout(200);
   ok('Sunday label stays inside the grid',r.r<=r.cr+1,JSON.stringify(r));await closeDialog();}

  // a drag that loses the mouse (switching windows, or the browser taking the pointer) is dropped, not stuck
  await drag(8,9.5,{release:false});
  await p.evaluate(()=>{const el=[...document.querySelectorAll('.cal .col')].find(c=>c.hasPointerCapture(1));el&&el.releasePointerCapture(1);});
  await p.mouse.move(x+2,Y(9.5)+2);await p.waitForTimeout(100);const selLost=(await p.$$('.dragsel')).length;await p.mouse.up();await p.waitForTimeout(300);
  ok('losing the pointer cancels the drag',selLost===0&&!(await p.isVisible('dialog[open]')),`selection ${selLost}`);
  await drag(8,9.5,{release:false});await p.evaluate(()=>window.dispatchEvent(new Event('blur')));await p.waitForTimeout(100);
  const selBlur=(await p.$$('.dragsel')).length;await p.mouse.up();await p.waitForTimeout(300);
  ok('switching windows cancels the drag',selBlur===0&&!(await p.isVisible('dialog[open]')),`selection ${selBlur}`);
  await p.mouse.move(x,Y(10)+5);await p.mouse.click(x,Y(14)+5);await p.waitForSelector('dialog[open] #e-start');
  ok('entries and clicks work after a cancelled drag',(await p.inputValue('#e-start'))==='14:00');await closeDialog();

  // a click in the last hour starts at 19:00 so the hour ends at 20:00
  await p.mouse.click(x,Y(19.6));await p.waitForSelector('dialog[open] #e-start');
  ok('a click at 19:30 opens 19:00 to 20:00',(await p.inputValue('#e-start'))==='19:00'&&(await p.inputValue('#e-dur'))==='1.00',await p.inputValue('#e-start'));await closeDialog();

  // plain click still adds an hour
  await p.mouse.click(x,Y(14)+5);await p.waitForSelector('dialog[open] #e-start');
  ok('a click opens an hour at that slot',(await p.inputValue('#e-start'))==='14:00'&&(await p.inputValue('#e-dur'))==='1.00');await closeDialog();

  // Escape cancels
  await drag(8,9,{release:false});await p.keyboard.press('Escape');await p.waitForTimeout(100);
  const selAfterEsc=(await p.$$('.dragsel')).length;await p.mouse.up();await p.waitForTimeout(300);
  ok('Escape cancels the drag with no dialog',selAfterEsc===0&&!(await p.isVisible('dialog[open]')));

  // releasing outside the grid still ends the drag
  await p.mouse.move(x,Y(16)+1);await p.mouse.down();await p.mouse.move(x+400,Y(17),{steps:8});await p.mouse.up();await p.waitForSelector('dialog[open] #e-start');
  ok('letting go outside the column keeps the drag in its day',(await p.inputValue('#e-date'))===day0&&(await p.inputValue('#e-start'))==='16:00'&&(await p.inputValue('#e-dur'))==='1.00');await closeDialog();

  // starting on an entry opens it instead
  const ev=await p.$('button.ev');const eb=await ev.boundingBox();await p.mouse.move(eb.x+10,eb.y+8);await p.mouse.down();await p.mouse.move(eb.x+10,eb.y+90,{steps:6});await p.mouse.up();await p.waitForSelector('dialog[open] h2');
  ok('pressing on an entry opens it, no drag',(await p.textContent('dialog[open] h2'))==='Edit time');await closeDialog();

  // hh:mm format
  sql(`update "Settings" set "timeFormat"='hhmm'`);await p.reload();await p.waitForLoadState('networkidle');
  label=await drag(9,11.5);await p.waitForSelector('dialog[open] #e-dur');
  ok('hh:mm format shows 2:30',label&&label.includes('2:30 h')&&(await p.inputValue('#e-dur'))==='2:30',label);await closeDialog();
  sql(`update "Settings" set "timeFormat"='${fmt0}'`);
  ok('no browser errors',p.errs.length===0,JSON.stringify(p.errs));

  // a leader viewing someone else's calendar can't drag
  const d=await login(b,'daniel@example.com');const priyaId=sql(`select id from "User" where email='priya@example.com'`);
  await d.goto(BASE+'/calendar?u='+priyaId);await d.waitForLoadState('networkidle');
  const c2=await d.$('.cal .col >> nth=2');const b2=await c2.boundingBox();
  await d.mouse.move(b2.x+20,b2.y+(10-H0)*PX+1);await d.mouse.down();await d.mouse.move(b2.x+20,b2.y+(12-H0)*PX,{steps:8});
  const sel2=(await d.$$('.dragsel')).length;await d.mouse.up();await d.waitForTimeout(300);
  const h2=await d.isVisible('dialog[open]')?await d.textContent('dialog[open] h2'):'';
  ok("someone else's calendar ignores drags",sel2===0&&h2!=='Add time',`selection ${sel2}, dialog ${await d.isVisible('dialog[open]')}, note: ${(await d.textContent('p.note')).slice(0,60)}`);
 }finally{
  sql(`update "Settings" set "timeFormat"='${fmt0}'`);
  sql(`delete from "AuditLog" where "userId"='${uid}' or "targetUserId"='${uid}'`);
  sql(`delete from "User" where id='${uid}'`);
  await b.close();
 }
})();
