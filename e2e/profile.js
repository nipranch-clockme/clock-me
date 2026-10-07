// Profiles: who can open whose profile, the header (photo or initials, employee ID, joining date and experience, expected
// hours), editing those details and pictures (with server-side checks against crafted calls), the Utilisation numbers
// (worked out like Dashboard productivity), and names linking to profiles across the app.
// Sets up its own test people directly in the local database (PSQL defaults to the sample database on this machine).
const {execSync}=require('child_process');
const {start,login,BASE}=require('./helpers');
const PSQL=process.env.PSQL||'psql -h /tmp -U postgres clockme';
const sql=(q)=>execSync(`${PSQL} -v ON_ERROR_STOP=1 -At`,{input:q}).toString().trim();
const ok=(name,cond,detail='')=>{console.log(`${cond?'PASS':'FAIL'} ${name}${detail?' — '+detail:''}`);if(!cond)process.exitCode=1;};
const toD=(s)=>new Date(s+'T00:00:00Z');
const addDays=(s,n)=>{const x=toD(s);x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10);};
const dow=(s)=>(toD(s).getUTCDay()+6)%7;
const mondayOf=(s)=>addDays(s,-dow(s));
const addMonths=(ym,n)=>{const x=toD(ym+'-01');x.setUTCMonth(x.getUTCMonth()+n);return x.toISOString().slice(0,7);};
const endOfMonth=(ym)=>{const x=toD(ym+'-01');x.setUTCMonth(x.getUTCMonth()+1);x.setUTCDate(0);return x.toISOString().slice(0,10);};
const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const dmy=(s)=>`${+s.slice(8)} ${MON[+s.slice(5,7)-1]} ${s.slice(0,4)}`;
const longMonth=(ym)=>toD(ym+'-01').toLocaleDateString('en-US',{month:'long',year:'numeric',timeZone:'UTC'});
const pct=(v)=>`${Math.round(v*100)}%`;

(async()=>{
 const b=await start();
 const t='pf'+process.pid, M=t+'m', L=t+'l', N=t+'n', O=t+'o', ALL=[M,L,N,O];
 const daniel=sql(`select id||'|'||"locationId"||'|'||"teamId"||'|'||"passwordHash" from "User" where email='daniel@example.com'`).split('|');
 const tom=sql(`select id||'|'||"locationId"||'|'||"teamId" from "User" where email='tom@example.com'`).split('|');
 const oliver=sql(`select id||'|'||"teamId"||'|'||"locationId" from "User" where email='oliver@example.com'`).split('|');
 const id=(email)=>sql(`select id from "User" where email='${email}'`);
 const PRIYA=id('priya@example.com'), MARCUS=id('marcus@example.com'), ADMIN=id('admin@example.com'), ROSA=id('rosa@example.com');
 const hash=daniel[3], tz=sql(`select "timeZone" from "Settings"`), format=sql(`select "timeFormat" from "Settings"`);
 const today=sql(`select to_char(now() at time zone '${tz}','YYYY-MM-DD')`), yesterday=addDays(today,-1);
 const f=(m)=>format==='hhmm'?`${Math.floor(Math.round(m)/60)}:${String(Math.round(m)%60).padStart(2,'0')}`:(m/60).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
 // two open projects whose phases have different names
 const [pa,xa,xname]=sql(`select p.id||'|'||ph.id||'|'||ph.name from "Project" p join "Phase" ph on ph."projectId"=p.id where p.access='PUBLIC' and not p.archived and ph.sort<999 order by p.name, ph.sort limit 1`).split('|');
 const [pb,yb,yname]=sql(`select p.id||'|'||ph.id||'|'||ph.name from "Project" p join "Phase" ph on ph."projectId"=p.id where p.access='PUBLIC' and not p.archived and ph.sort<999 and p.id<>'${pa}' and ph.name<>'${xname.replace(/'/g,"''")}' order by p.name, ph.sort limit 1`).split('|');
 const pname=(pid)=>sql(`select name from "Project" where id='${pid}'`);
 const entries=[];
 const addEntry=(d,minutes,p,ph)=>entries.push({d,minutes,p,ph});
 // Last month: 8 hours on each weekday except the first three, plus 2 hours on its first Saturday.
 const lm=addMonths(today.slice(0,7),-1), la=lm+'-01', lb=endOfMonth(lm);
 // Public holidays of the test person's office are taken out of expected hours (whole-day ones; none are set when this suite is run on a fresh database)
 const hols=new Set(sql(`select to_char(date,'YYYY-MM-DD') from "Holiday" where "locationId"='${daniel[1]}'`).split('\n').filter(Boolean));
 const weekdays=(a,z)=>{const out=[];for(let d=a;d<=z&&d<=yesterday;d=addDays(d,1))if(dow(d)<5&&!hols.has(d))out.push(d);return out;};
 const lwd=weekdays(la,lb);
 lwd.slice(3).forEach((d)=>{addEntry(d,300,pa,xa);addEntry(d,180,pb,yb);});
 for(let d=la;d<=lb;d=addDays(d,1))if(dow(d)===5){addEntry(d,120,pa,xa);break;}
 const m2=addMonths(today.slice(0,7),-2);addEntry(m2+'-15',60,pa,xa);
 addEntry(addDays(mondayOf(today),-7),90,pb,yb);
 const sum=(a,z,pred=()=>true)=>entries.filter((e)=>e.d>=a&&e.d<=z&&pred(e)).reduce((s,e)=>s+e.minutes,0);
 const firstDay=addDays(today,-120); // the test person's first day in Clock me
 const ws=mondayOf(today);
 const watched=new Set();const ids={};
 const watch=(page)=>page.on('request',(r)=>{const a=r.headers()['next-action'];if(!a||r.method()!=='POST')return;const buf=r.postDataBuffer(),body=(buf||Buffer.alloc(0)).toString('latin1');const path=new URL(r.url()).pathname;
  if(body.includes('name="_1_photo"')||(!buf&&path.startsWith('/profile')))ids.upload=a; // the browser doesn't hand over bodies with files
  else if(path.startsWith('/profile')&&body.includes('name="_1_employeeId"'))ids.details=a;
  else if(path.startsWith('/profile')&&body.includes('name="_1_id"'))ids.remove=a;
  else if(path==='/people'&&body.includes('name="_1_role"')&&!body.includes('name="_1_email"'))ids.updatePerson=a;});
 // Calls a server action straight from the page, the way a crafted request would.
 const act=(page,path,action,fields,file)=>page.evaluate(async({url,action,fields,file})=>{const fd=new FormData();for(const [k,v] of Object.entries(fields))fd.append('_1_'+k,v);if(file)fd.append('_1_photo',new Blob([new Uint8Array(file)],{type:'image/jpeg'}),'photo.jpg');fd.append('0','[null,"$K1"]');
  const r=await fetch(url,{method:'POST',headers:{'next-action':action,accept:'text/x-component'},body:fd});return {status:r.status,text:await r.text()};},{url:BASE+path,action,fields,file:file?[...file]:null});
 const go=async(p,path)=>{const r=await p.goto(BASE+path);await p.waitForLoadState('networkidle');return r.status();};
 const stats=(p)=>p.$$eval('.stats.spread.five .stat b',(bs)=>bs.map((x)=>x.textContent.trim()));
 const table=(p,h)=>p.locator('section',{has:p.locator('h3',{hasText:new RegExp('^'+h+'$')})}).locator('tbody tr').evaluateAll((trs)=>trs.map((tr)=>[...tr.cells].map((c)=>c.textContent.trim())));
 const head=(p)=>p.textContent('section.panel.full >> nth=0');
 const db=(who,col)=>sql(`select coalesce("${col}"::text,'') from "User" where id='${who}'`);
 const makeImage=(p,type,w,h)=>p.evaluate(({type,w,h})=>{const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.fillStyle='#ff0000';x.fillRect(0,0,w,h);const s=Math.min(w,h);x.fillStyle='#00c000';x.fillRect((w-s)/2,(h-s)/2,s,s);return c.toDataURL(type).split(',')[1];},{type,w,h}).then((b64)=>Buffer.from(b64,'base64'));
 const pixels=(p,src)=>p.evaluate(async(src)=>{const img=new Image();img.src=src;await img.decode();const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const x=c.getContext('2d');x.drawImage(img,0,0);const at=(a,z)=>[...x.getImageData(a,z,1,1).data].slice(0,3);return {w:img.naturalWidth,h:img.naturalHeight,px:[at(3,3),at(252,3),at(3,252),at(252,252),at(128,128)]};},src);
 const green=(px)=>px.every(([r,g,bl])=>g>120&&r<110&&bl<110);
 const pages=[];
 const signIn=async(email)=>{const p=await login(b,email);watch(p);p.on('pageerror',()=>p.errs.push('on '+p.url()));pages.push(p);return p;};
 try{
  const ins=(uid,name,loc,team,role,days,extra='')=>sql(`insert into "User"(id,email,name,title,"passwordHash",role,"locationId","teamId","weeklyTarget","createdAt") values('${uid}','${uid}@example.com','${name}','${extra}','${hash}','${role}','${loc}',${team?`'${team}'`:'null'},40, now()-interval '${days} days')`);
  ins(M,'Profile Test',daniel[1],daniel[2],'MEMBER',120,'Test designer');
  ins(L,'London Test',oliver[2],tom[2],'MEMBER',60);
  ins(N,'Newcomer Test',tom[1],tom[2],'MEMBER',0);sql(`update "User" set "createdAt"=date_trunc('month', now() at time zone '${tz}') where id='${N}'`); // started on the 1st of this month
  ins(O,'Office Test',oliver[2],oliver[1],'LOCATION',60);
  entries.forEach((e,i)=>sql(`insert into "TimeEntry"(id,"userId","projectId","phaseId",date,"startMin",minutes,description,custom,"createdAt") values('${M}e${i}','${M}','${e.p}','${e.ph}','${e.d}',540,${e.minutes},'work','{}',now())`));
  sql(`insert into "Timesheet"(id,"userId","weekStart",status,"updatedAt") values('${M}s1','${M}','${addDays(ws,-7)}','APPROVED',now()),('${M}s2','${M}','${addDays(ws,-14)}','REJECTED',now()),('${M}s3','${M}','${addDays(ws,-21)}','SUBMITTED',now())`);

  // ---- The person's own profile (team member)
  const m=await signIn(M+'@example.com');
  ok('top bar name links to My profile',(await m.getAttribute('a.plink','href'))==='/profile'&&(await m.textContent('a.plink')).includes('Profile Test'));
  await m.click('a.plink');await m.waitForURL(/\/profile$/);await m.waitForLoadState('networkidle');
  let h=await head(m);
  ok('own profile is titled My profile',h.includes('My profile'));
  ok('header shows name, job title, role, team, office and email',['Profile Test','Test designer','Team member','Hulk','AMD',M+'@example.com'].every((x)=>h.includes(x)),h.slice(0,200));
  ok('initials circle when there is no photo',(await m.textContent('.profile-head .av'))==='PT'&&!(await m.$('.profile-head .av img')));
  ok('employee ID and joining date show as not set',h.includes('Employee IDNot set')&&h.includes('Joining date not set'));
  ok('expected hours per week shown',h.includes('Expected hours per week40 h'));
  ok('a member cannot edit their own details',(await m.locator('button:has-text("Edit details")').count())===0);
  ok('a member can add their own photo',(await m.locator('button:has-text("Upload photo")').count())===1);
  ok('default period is This month',(await m.inputValue('#pr-range'))==='thismonth');
  ok('note explains utilisation',(await m.textContent('main')).includes('Utilisation is hours logged divided by expected hours'));

  // ---- Utilisation numbers for last month, worked out like the Dashboard
  await m.selectOption('#pr-range','lastmonth');await m.waitForURL(/range=lastmonth/);await m.waitForLoadState('networkidle');
  const logged=sum(la,lb), expected=40/5*lwd.length*60, noTime=lwd.filter((d)=>!entries.some((e)=>e.d===d)).length;
  let s=await stats(m);
  ok('summary: utilisation, hours, expected, average per workday, workdays with no time',JSON.stringify(s)===JSON.stringify([pct(logged/expected),f(logged),f(expected),f(logged/lwd.length),String(noTime)]),JSON.stringify(s)+' vs '+JSON.stringify([pct(logged/expected),f(logged),f(expected),f(logged/lwd.length),String(noTime)]));
  const proj=await table(m,'Hours by project');
  const wantProj=[[pname(pa),sum(la,lb,(e)=>e.p===pa)],[pname(pb),sum(la,lb,(e)=>e.p===pb)]].sort((x,y)=>y[1]-x[1]);
  ok('hours by project with share of hours',proj.length===2&&proj.every((r,i)=>r[0].startsWith(wantProj[i][0])&&r[1]===f(wantProj[i][1])&&r[2]===((wantProj[i][1]/logged)*100).toFixed(1)+'%'),JSON.stringify(proj));
  const ph=await table(m,'Hours by phase');
  ok('hours by phase',ph.length===2&&ph.some((r)=>r[0]===xname&&r[1]===f(sum(la,lb,(e)=>e.ph===xa)))&&ph.some((r)=>r[0]===yname&&r[1]===f(sum(la,lb,(e)=>e.ph===yb))),JSON.stringify(ph));
  const months=Array.from({length:12},(_,i)=>addMonths(today.slice(0,7),i-12));
  const points=months.filter((mo)=>weekdays(mo+'-01'>firstDay?mo+'-01':firstDay,endOfMonth(mo)).length>0);
  const titles=await m.$$eval('svg[aria-label^="Utilisation of"] circle title',(ts)=>ts.map((x)=>x.textContent));
  const util=(mo)=>sum(mo+'-01',endOfMonth(mo))/(480*weekdays(mo+'-01'>firstDay?mo+'-01':firstDay,endOfMonth(mo)).length);
  ok('monthly chart has a point for each full month since they started',titles.length===points.length,`${titles.length} vs ${points.length}`);
  ok('monthly chart: last month and the month before',titles.includes(`Utilisation, ${longMonth(lm)}: ${pct(util(lm))}`)&&titles.includes(`Utilisation, ${longMonth(m2)}: ${pct(util(m2))}`),JSON.stringify(titles));
  const recent=await table(m,'Recent timesheets');
  ok('recent timesheets: six weeks, newest first',recent.length===6&&recent[0][0].includes('this week'));
  ok('recent timesheets show each week\'s status',recent[0][2]==='Not submitted'&&recent[1][2]==='Approved'&&recent[2][2]==='Sent back'&&recent[3][2]==='Waiting for approval'&&recent[4][2]==='Not submitted',JSON.stringify(recent.map((r)=>r[2])));
  ok('recent timesheets show each week\'s hours',recent.every((r,i)=>r[1]===f(sum(addDays(ws,-7*i),addDays(ws,-7*i+6)))),JSON.stringify(recent.map((r)=>r[1])));
  await go(m,`/profile/${M}?range=lastmonth`);
  ok('opening your own profile by its address goes to My profile',new URL(m.url()).pathname==='/profile'&&new URL(m.url()).search==='?range=lastmonth',m.url());

  // ---- Photo: browser-side checks, then a real upload (cropped to the middle square, 256x256 JPEG)
  await m.goto(BASE+'/profile');await m.waitForLoadState('networkidle');
  const err=()=>m.textContent('.photoform .err-text');
  await m.setInputFiles('.photoform input[type=file]',{name:'notes.txt',mimeType:'text/plain',buffer:Buffer.from('hello')});await m.waitForSelector('.photoform .err-text');
  ok('wrong file type is refused',(await err())==='Choose a JPEG, PNG or WebP picture.',await err());
  await m.setInputFiles('.photoform input[type=file]',{name:'anim.gif',mimeType:'image/gif',buffer:Buffer.from('GIF89a')});
  ok('GIF is refused',(await err())==='Choose a JPEG, PNG or WebP picture.');
  await m.setInputFiles('.photoform input[type=file]',{name:'big.png',mimeType:'image/png',buffer:Buffer.alloc(5*1024*1024+1)});await m.waitForSelector('.photoform .err-text:has-text("5 MB")');
  ok('over 5 MB is refused',(await err())==='That picture is over 5 MB. Choose a smaller one.',await err());
  await m.setInputFiles('.photoform input[type=file]',{name:'broken.png',mimeType:'image/png',buffer:Buffer.from('not really a picture')});await m.waitForSelector('.photoform .err-text:has-text("read")');
  ok('a broken picture is refused',(await err())==="We couldn't read that picture. Try a different one.",await err());
  ok('nothing was saved by refused pictures',db(M,'photoAt')==='');
  const wide=await makeImage(m,'image/png',600,400);
  await m.setInputFiles('.photoform input[type=file]',{name:'me.png',mimeType:'image/png',buffer:wide});await m.waitForSelector('.profile-head .av img',{timeout:15000});
  ok('photo saved',db(M,'photoAt')!==''&&sql(`select substr(encode(data,'hex'),1,6) from "ProfilePhoto" where "userId"='${M}'`)==='ffd8ff');
  let src=await m.getAttribute('.profile-head .av img','src');
  let px=await pixels(m,src);
  ok('photo is a 256x256 square cropped from the middle of a wide picture',px.w===256&&px.h===256&&green(px.px),JSON.stringify(px));
  ok('photo has alt text and shows in the top bar',(await m.getAttribute('.profile-head .av img','alt'))==='Profile picture of Profile Test'&&!!(await m.$('a.plink .av img')));
  ok('photo button now says Change photo, with Remove photo',(await m.locator('button:has-text("Change photo")').count())===1&&(await m.locator('button:has-text("Remove photo")').count())===1);
  const tall=await makeImage(m,'image/webp',400,600);
  await m.setInputFiles('.photoform input[type=file]',{name:'me.webp',mimeType:'image/webp',buffer:tall});await m.waitForFunction((old)=>{const i=document.querySelector('.profile-head .av img');return i&&i.getAttribute('src')!==old;},src,{timeout:15000});
  src=await m.getAttribute('.profile-head .av img','src');px=await pixels(m,src);
  ok('a tall WebP replaces it, cropped from the middle',px.w===256&&px.h===256&&green(px.px),JSON.stringify(px));
  const jpg=await makeImage(m,'image/jpeg',300,300);
  await m.setInputFiles('.photoform input[type=file]',{name:'me.jpg',mimeType:'image/jpeg',buffer:jpg});await m.waitForFunction((old)=>{const i=document.querySelector('.profile-head .av img');return i&&i.getAttribute('src')!==old;},src,{timeout:15000});
  ok('a JPEG works too',sql(`select length(data)>0 from "ProfilePhoto" where "userId"='${M}'`)==='t');
  ok('picture changes are in the change log',sql(`select count(*) from "AuditLog" where "userId"='${M}' and "targetUserId"='${M}' and action='Changed their profile picture'`)==='3');
  const photoUrl=BASE+(await m.getAttribute('.profile-head .av img','src'));
  const pr=await m.request.get(photoUrl);
  ok('picture is served as a JPEG that browsers must not sniff',pr.status()===200&&pr.headers()['content-type']==='image/jpeg'&&pr.headers()['x-content-type-options']==='nosniff');
  await m.click('button:has-text("Remove photo")');await m.waitForSelector('.profile-head span.av');
  ok('remove photo goes back to initials',db(M,'photoAt')===''&&sql(`select count(*) from "ProfilePhoto" where "userId"='${M}'`)==='0'&&(await m.locator('button:has-text("Upload photo")').count())===1);
  ok('removed picture is no longer served',(await m.request.get(photoUrl)).status()===404);
  // the server checks what it's sent, whatever the browser does
  await m.setInputFiles('.photoform input[type=file]',{name:'me.png',mimeType:'image/png',buffer:wide});await m.waitForSelector('.profile-head .av img',{timeout:15000});
  const before=db(M,'photoAt');
  let r=await act(m,'/profile',ids.upload,{id:M},wide);
  ok('server refuses a picture that is not a JPEG',r.text.includes('Choose a JPEG, PNG or WebP picture.')&&db(M,'photoAt')===before,r.text.slice(-120));
  const huge=Buffer.concat([Buffer.from([0xff,0xd8,0xff,0xe0,0x00,0x10]),Buffer.alloc(600*1024)]);
  r=await act(m,'/profile',ids.upload,{id:M},huge);
  ok('server refuses a picture over its size limit',r.text.includes('That picture is too big')&&db(M,'photoAt')===before,r.text.slice(-120));
  const giant=Buffer.from([0xff,0xd8,0xff,0xc0,0x00,0x11,0x08,0x13,0x88,0x13,0x88,0x03,0x01,0x22,0x00,0x02,0x11,0x01,0x03,0x11,0x01,0xff,0xd9]);
  r=await act(m,'/profile',ids.upload,{id:M},giant);
  ok('server refuses a JPEG that claims to be 5000 pixels wide',r.text.includes('That picture is too big')&&db(M,'photoAt')===before,r.text.slice(-120));
  // crafted calls about other people
  sql(`update "User" set "photoAt"=now() where id='${L}'`);sql(`insert into "ProfilePhoto"("userId",data,"updatedAt") select '${L}',data,now() from "ProfilePhoto" where "userId"='${M}'`);
  const lPhoto=db(L,'photoAt');
  r=await act(m,'/profile',ids.upload,{id:L},jpg);
  ok("a member can't change someone else's picture",r.text.includes("You don't have permission to change that.")&&db(L,'photoAt')===lPhoto,r.text.slice(-120));
  r=await act(m,'/profile',ids.remove,{id:L});
  ok("a member can't remove someone else's picture",r.text.includes("You don't have permission to change that.")&&sql(`select count(*) from "ProfilePhoto" where "userId"='${L}'`)==='1');
  ok("a member can't fetch the picture of someone they can't see",(await m.request.get(BASE+`/profile/${L}/photo`)).status()===404);

  // ---- Who can open whose profile
  ok('a member gets not found for anyone else',(await go(m,`/profile/${PRIYA}`))===404&&!(await m.content()).includes('Priya Raman'));
  ok('a made-up profile address is not found',(await go(m,'/profile/nobody-here'))===404);

  const a=await signIn('admin@example.com');
  await go(a,`/profile/${M}`);
  ok('admin can open anyone, with Edit details and photo buttons',(await head(a)).includes('Profile Test')&&(await a.locator('button:has-text("Edit details")').count())===1&&(await a.locator('button:has-text("Change photo")').count())===1);
  await a.click('button:has-text("Edit details")');await a.waitForSelector('dialog[open] #pd-emp');
  ok('details form: Employee ID, Joining date, Expected hours per week',(await a.textContent('dialog[open]')).includes('Expected hours per week')&&(await a.getAttribute('#pd-emp','maxlength'))==='32'&&(await a.getAttribute('#pd-join','max'))===today);
  const j=(()=>{const ym=addMonths(today.slice(0,7),-54);return ym+'-01';})();
  await a.fill('#pd-emp','  PF-'+process.pid+'  ');await a.fill('#pd-join',j);await a.fill('#pd-target','30');
  await a.click('dialog[open] button:has-text("Save changes")');await a.waitForSelector('dialog[open]',{state:'detached'});await a.waitForLoadState('networkidle');
  h=await head(a);
  ok('saved: employee ID (trimmed), joining date and expected hours',db(M,'employeeId')===`PF-${process.pid}`&&db(M,'joiningDate')===j&&db(M,'weeklyTarget')==='30',[db(M,'employeeId'),db(M,'joiningDate'),db(M,'weeklyTarget')].join(' '));
  ok('header shows joining date with years of experience',h.includes(`Joined ${dmy(j)} · 4 years 6 months`),h.slice(0,240));
  ok('header shows employee ID and new expected hours',h.includes(`Employee IDPF-${process.pid}`)&&h.includes('Expected hours per week30 h'));
  ok('change log records the details',sql(`select count(*) from "AuditLog" where "userId"='${ADMIN}' and "targetUserId"='${M}' and action like 'Updated Profile Test: employee ID to PF-${process.pid}, joining date to ${j}, expected hours per week to 30 h'`)==='1');
  await go(a,`/profile/${M}?range=lastmonth`);s=await stats(a);
  ok('expected hours per week changes utilisation',s[0]===pct(logged/(30/5*lwd.length*60))&&s[2]===f(30/5*lwd.length*60),JSON.stringify(s));
  sql(`update "User" set "weeklyTarget"=40, "joiningDate"='${addDays(today,-12)}' where id='${M}'`);
  await go(a,`/profile/${M}?range=lastmonth`);s=await stats(a);
  ok("joining date doesn't change utilisation",s[0]===pct(logged/expected)&&s[2]===f(expected),JSON.stringify(s));
  ok('under a month: Joined this month',(await head(a)).includes('Joined this month'));
  sql(`update "User" set "joiningDate"='${addDays(today,-400)}' where id='${M}'`);await go(a,`/profile/${M}`);
  { const jj=addDays(today,-400),dim=+endOfMonth(today.slice(0,7)).slice(8);const mo=(+today.slice(0,4)-+jj.slice(0,4))*12+(+today.slice(5,7)-+jj.slice(5,7))-(+today.slice(8)<Math.min(+jj.slice(8),dim)?1:0);
    const want=`Joined ${dmy(jj)} · ${Math.floor(mo/12)} year${Math.floor(mo/12)===1?'':'s'}${mo%12?` ${mo%12} month${mo%12===1?'':'s'}`:''}`;ok('years and months of experience read naturally',(await head(a)).includes(want),want); }
  // validation in the details form (browser limits taken off, so the server's checks are what's tested)
  sql(`update "User" set "employeeId"='PFX-${process.pid}' where id='${L}'`);
  const tryDetails=async(fill)=>{await a.click('button:has-text("Edit details")');await a.waitForSelector('dialog[open] #pd-emp');await a.evaluate(()=>document.querySelectorAll('dialog[open] input').forEach((i)=>{i.removeAttribute('max');i.removeAttribute('min');i.removeAttribute('maxlength');}));await fill();await a.click('dialog[open] button:has-text("Save changes")');await a.waitForSelector('dialog[open] .err-text');const e=await a.textContent('dialog[open] .err-text');await a.click('dialog[open] button:has-text("Close")');return e;};
  let e=await tryDetails(()=>a.fill('#pd-emp',`pfx-${process.pid}`));
  ok('employee IDs are unique ignoring case',e==='Someone else already has that employee ID.'&&db(M,'employeeId')===`PF-${process.pid}`,e);
  e=await tryDetails(()=>a.fill('#pd-emp','X'.repeat(33)));
  ok('employee ID up to 32 characters',e==='Employee ID can be up to 32 characters.',e);
  e=await tryDetails(()=>a.fill('#pd-join',addDays(today,2)));
  ok("joining date can't be in the future",e==="Joining date can't be in the future.",e);
  e=await tryDetails(()=>a.fill('#pd-target','90'));
  ok('expected hours between 0 and 80',e==='Expected hours per week should be between 0 and 80.',e);
  ok('nothing changed by refused saves',db(M,'employeeId')===`PF-${process.pid}`&&db(M,'weeklyTarget')==='40');
  // clearing values
  await a.click('button:has-text("Edit details")');await a.waitForSelector('dialog[open] #pd-emp');await a.fill('#pd-emp','');await a.fill('#pd-join','');await a.click('dialog[open] button:has-text("Save changes")');await a.waitForSelector('dialog[open]',{state:'detached'});await a.waitForLoadState('networkidle');
  ok('employee ID and joining date can be cleared',db(M,'employeeId')===''&&db(M,'joiningDate')===''&&(await head(a)).includes('Joining date not set'));
  sql(`update "User" set "weeklyTarget"=0 where id='${M}'`);await go(a,`/profile/${M}?range=lastmonth`);s=await stats(a);
  ok('expected hours 0: no utilisation, with a note',s[0]==='–'&&s[2]===f(0)&&(await a.textContent('main')).includes("Expected hours per week is 0, so there's no utilisation to show."),JSON.stringify(s));
  sql(`update "User" set "weeklyTarget"=40 where id='${M}'`);
  await go(a,'/profile');
  ok("admin can edit their own details",(await a.locator('button:has-text("Edit details")').count())===1);
  await go(a,`/profile/${N}`);
  const nr=await table(a,'Recent timesheets');
  const nWant=[0,1,2,3,4,5].map((i)=>addDays(ws,-7*i+6)<today.slice(0,8)+'01'?'Not started':'Not submitted');
  ok('weeks before someone started say Not started',JSON.stringify(nr.map((x)=>x[2]))===JSON.stringify(nWant),JSON.stringify(nr.map((x)=>x[2])));
  ok('someone new has no full months to chart yet',(await a.textContent('main')).includes('No full months to show yet.'));
  await go(a,`/profile/${MARCUS}`);ok('admin opens people in any office',(await head(a)).includes('Marcus Lee'));

  // People page: Employee ID column, links, renamed field, joining date, CSV
  sql(`update "User" set "employeeId"='PF-${process.pid}' where id='${M}'`);
  await go(a,'/people');
  ok('People list has an Employee ID column',(await a.textContent('thead')).includes('Employee ID')&&(await a.locator(`tr:has-text("Profile Test") td:nth-child(2)`).textContent())===`PF-${process.pid}`);
  ok('People names link to profiles',(await a.locator(`a[href="/profile/${M}"]`).count())===1);
  ok('People search finds employee IDs',await (async()=>{await a.fill('#pp-q',`pf-${process.pid}`);const n=await a.locator('tbody tr').count();await a.fill('#pp-q','');return n===1;})());
  await a.locator('tr:has-text("Profile Test") button:has-text("Edit")').click();await a.waitForSelector('dialog[open] #pf-emp');
  ok('People form calls it Expected hours per week',(await a.textContent('label[for=pf-target]'))==='Expected hours per week');
  await a.fill('#pf-emp',`PFQ-${process.pid}`);await a.fill('#pf-join','2020-02-29');await a.fill('#pf-target','37.5');
  await a.click('dialog button:has-text("Save changes")');await a.waitForSelector('dialog[open]',{state:'detached'});await a.waitForTimeout(500);
  ok('People form saves employee ID, joining date and expected hours',db(M,'employeeId')===`PFQ-${process.pid}`&&db(M,'joiningDate')==='2020-02-29'&&db(M,'weeklyTarget')==='37.5');
  await a.locator('tr:has-text("Profile Test") button:has-text("Edit")').click();await a.waitForSelector('dialog[open] #pf-emp');
  ok('People form shows the saved values',(await a.inputValue('#pf-emp'))===`PFQ-${process.pid}`&&(await a.inputValue('#pf-join'))==='2020-02-29');
  await a.fill('#pf-emp',`pfx-${process.pid}`);await a.click('dialog button:has-text("Save changes")');await a.waitForSelector('dialog[open] .err-text');
  ok('People form refuses a duplicate employee ID',(await a.textContent('dialog[open] .err-text'))==='Someone else already has that employee ID.');
  await a.click('dialog[open] button:has-text("Close")');
  await a.click('button:has-text("Invite person")');await a.waitForSelector('dialog[open] #pf-email');
  await a.fill('#pf-name','Dup Invite');await a.fill('#pf-email',`dup${process.pid}@example.com`);await a.fill('#pf-emp',`PFX-${process.pid}`.toLowerCase());
  await a.click('dialog button:has-text("Create invite")');await a.waitForSelector('dialog[open] .err-text');
  ok('an invite with a taken employee ID is refused',(await a.textContent('dialog[open] .err-text'))==='Someone else already has that employee ID.'&&sql(`select count(*) from "User" where email='dup${process.pid}@example.com'`)==='0');
  await a.click('dialog[open] button:has-text("Close")');
  sql(`update "User" set "weeklyTarget"=40 where id='${M}'`);
  const csv=await (await a.request.get(BASE+'/import-export/export/people')).text();
  const lines=csv.trim().split(/\r?\n/);
  ok('People CSV has Employee ID and Joining date',lines[0]==='Name,Employee ID,Email,Title,Role,Office,Team,Joining date,Expected hours per week,Status'&&lines.some((x)=>x.startsWith(`Profile Test,PFQ-${process.pid},${M}@example.com,Test designer,Team member,AMD,Hulk,2020-02-29,40,Active`)),lines[0]);
  ok('admin can fetch any picture',(await a.request.get(BASE+`/profile/${L}/photo`)).status()===200);

  // ---- Team leader: own team only, read only
  const d=await signIn('daniel@example.com');
  ok('leader opens a team member',(await go(d,`/profile/${M}`))===200&&(await head(d)).includes('Profile Test'));
  ok('leader sees utilisation but has no edit or photo buttons',(await stats(d)).length===5&&(await d.locator('.profile-head button').count())===0);
  ok('leader gets not found outside their team',(await go(d,`/profile/${tom[0]}`))===404&&(await go(d,`/profile/${MARCUS}`))===404&&(await go(d,`/profile/${L}`))===404);
  ok("leader can't fetch pictures outside their team",(await d.request.get(BASE+`/profile/${L}/photo`)).status()===404);
  await go(d,`/profile/${M}`);
  r=await act(d,`/profile/${M}`,ids.details,{id:M,employeeId:'HACK-1',joiningDate:'',weeklyTarget:'1'});
  ok("leader's crafted details save is refused",r.text.includes("You don't have permission to change that.")&&db(M,'employeeId')===`PFQ-${process.pid}`&&db(M,'weeklyTarget')==='40',r.text.slice(-120));
  r=await act(d,`/profile/${M}`,ids.upload,{id:M},jpg);
  ok("leader's crafted picture upload for a team member is refused",r.text.includes("You don't have permission to change that."));
  r=await act(d,'/people',ids.updatePerson,{id:M,name:'Profile Test',title:'',role:'MEMBER',locationId:daniel[1],teamId:daniel[2],employeeId:'HACK-2',joiningDate:'',weeklyTarget:'1',active:'on'});
  ok("leader's crafted People save is refused",db(M,'employeeId')===`PFQ-${process.pid}`&&db(M,'weeklyTarget')==='40');
  await go(d,'/approvals');
  ok('Approvals cards link to profiles',(await d.locator(`section.panel.full .item a[href="/profile/${M}"]`).count())===1);
  await go(d,'/dashboard?range=lastmonth');
  const drow=await d.locator(`tr:has(a[href="/profile/${M}"])`).evaluateAll((trs)=>trs.map((tr)=>[...tr.cells].map((c)=>c.textContent.trim())));
  ok('Dashboard top performers link to profiles',drow.length>=1&&(await d.locator('td a[href^="/profile/"]').count())>=3);
  ok('Dashboard productivity equals profile utilisation',drow.length>=1&&drow[0][2]===pct(logged/expected),JSON.stringify(drow[0]));
  await go(d,'/reports?range=lastmonth&group=person');
  ok('Reports grouped by person link to profiles',(await d.locator(`tbody a[href="/profile/${M}"]`).count())===1);
  await go(d,'/reports?range=lastmonth&group=project');
  ok('Reports grouped by something else have no profile links',(await d.locator('tbody a[href^="/profile/"]').count())===0);
  await go(d,`/profile/${PRIYA}`);const pu=(await stats(d))[0];
  await go(d,'/dashboard');const prow=await d.locator(`tr:has(a[href="/profile/${PRIYA}"]) td`).allTextContents();
  ok('this month too: Dashboard and profile agree for Priya',prow.length>0&&prow[2]===pu,JSON.stringify([prow[2],pu]));

  // ---- Project manager: own team only
  const ro=await signIn('rosa@example.com');
  ok('project manager opens their team',(await go(ro,`/profile/${MARCUS}`))===200&&(await ro.locator('.profile-head button').count())===0);
  ok('project manager gets not found outside their team',(await go(ro,`/profile/${PRIYA}`))===404&&(await go(ro,`/profile/${M}`))===404);
  ok('project manager has their own profile',(await go(ro,'/profile'))===200&&(await head(ro)).includes('Rosa Alvarez')&&(await ro.locator('button:has-text("Edit details")').count())===0);

  // ---- Location manager: own office; edits people there except other managers
  const o=await signIn('oliver@example.com');
  ok('location manager gets not found outside their office',(await go(o,`/profile/${M}`))===404&&(await go(o,`/profile/${PRIYA}`))===404);
  ok("location manager can't fetch pictures from other offices",(await o.request.get(BASE+`/profile/${M}/photo`)).status()===404);
  await go(o,`/profile/${O}`);
  ok("location manager sees another location manager's profile without edit buttons",(await head(o)).includes('Office Test')&&(await o.locator('.profile-head button').count())===0);
  await go(o,'/profile');
  ok('location manager changes their own photo but not their own details',(await o.locator('button:has-text("Edit details")').count())===0&&(await o.locator('button:has-text("Upload photo"), button:has-text("Change photo")').count())===1);
  await go(o,`/profile/${L}`);
  ok('location manager can edit people in their office',(await o.locator('button:has-text("Edit details")').count())===1&&(await o.locator('button:has-text("Change photo")').count())===1);
  await o.click('button:has-text("Edit details")');await o.waitForSelector('dialog[open] #pd-emp');await o.fill('#pd-emp',`PFL-${process.pid}`);await o.fill('#pd-join','2021-03-12');await o.fill('#pd-target','32');
  await o.click('dialog[open] button:has-text("Save changes")');await o.waitForSelector('dialog[open]',{state:'detached'});await o.waitForLoadState('networkidle');
  ok('location manager saved details for their office',db(L,'employeeId')===`PFL-${process.pid}`&&db(L,'joiningDate')==='2021-03-12'&&db(L,'weeklyTarget')==='32'&&(await head(o)).includes('Joined 12 Mar 2021 · '));
  const lsrc=await o.getAttribute('.profile-head .av img','src');
  await o.setInputFiles('.photoform input[type=file]',{name:'l.png',mimeType:'image/png',buffer:wide});await o.waitForFunction((old)=>{const i=document.querySelector('.profile-head .av img');return i&&i.getAttribute('src')!==old;},lsrc,{timeout:15000});
  ok("location manager changed a picture in their office",sql(`select count(*) from "AuditLog" where "userId"='${oliver[0]}' and "targetUserId"='${L}' and action='Changed the profile picture of London Test'`)==='1');
  await o.click('button:has-text("Remove photo")');await o.waitForSelector('.profile-head span.av');
  ok("location manager removed a picture in their office",db(L,'photoAt')==='');
  r=await act(o,`/profile/${L}`,ids.details,{id:M,employeeId:'HACK-3',joiningDate:'',weeklyTarget:'1'});
  ok("location manager's crafted save for another office is refused",r.text.includes("You don't have permission to change that.")&&db(M,'employeeId')===`PFQ-${process.pid}`);
  r=await act(o,`/profile/${L}`,ids.details,{id:O,employeeId:'HACK-4',joiningDate:'',weeklyTarget:'1'});
  ok("location manager's crafted save for another location manager is refused",r.text.includes("You don't have permission to change that.")&&db(O,'employeeId')==='');
  r=await act(o,`/profile/${L}`,ids.upload,{id:M},jpg);
  ok("location manager's crafted picture for another office is refused",r.text.includes("You don't have permission to change that.")&&db(M,'photoAt')===before);
  r=await act(o,`/profile/${L}`,ids.details,{id:oliver[0],employeeId:'HACK-5',joiningDate:'',weeklyTarget:'1'});
  ok("location manager's crafted save of their own details is refused",r.text.includes("You don't have permission to change that.")&&db(oliver[0],'employeeId')!=='HACK-5');
  r=await act(m,'/profile',ids.details,{id:M,employeeId:'HACK-6',joiningDate:'',weeklyTarget:'80'});
  ok("a member's crafted save of their own details is refused",r.text.includes("You don't have permission to change that.")&&db(M,'employeeId')===`PFQ-${process.pid}`&&db(M,'weeklyTarget')==='40');
  await go(o,'/people');
  ok('location manager People list links to profiles in their office',(await o.locator(`a[href="/profile/${L}"]`).count())===1&&(await o.locator(`a[href="/profile/${M}"]`).count())===0);
  const ocsv=await (await o.request.get(BASE+'/import-export/export/people')).text();
  ok("location manager's People CSV has their office's IDs only",ocsv.includes(`PFL-${process.pid}`)&&!ocsv.includes(`PFQ-${process.pid}`));

  // ---- Signed out, and a phone-sized screen
  const anon=await (await b.newContext()).newPage();
  const ar=await anon.request.get(BASE+`/profile/${L}/photo`,{maxRedirects:0});
  ok('signed out: no profiles or pictures',ar.status()!==200&&(await go(anon,'/profile'))===200&&new URL(anon.url()).pathname==='/login');
  await m.setViewportSize({width:390,height:900});await go(m,'/profile');
  await m.screenshot({path:'/tmp/claude-0/shots/profile-phone.png',fullPage:true});
  ok('no sideways scrolling on a phone',(await m.evaluate(()=>document.documentElement.scrollWidth))<=390);
  await a.screenshot({path:'/tmp/claude-0/shots/profile-people.png',fullPage:false});
  const errs=pages.flatMap((p)=>p.errs);
  ok('no browser errors',errs.length===0,JSON.stringify(errs));
 }finally{
  const list=ALL.map((x)=>`'${x}'`).join(',');
  sql(`delete from "AuditLog" where "userId" in (${list}) or "targetUserId" in (${list})`);
  sql(`delete from "User" where id in (${list})`);
  await b.close();
 }
})();
