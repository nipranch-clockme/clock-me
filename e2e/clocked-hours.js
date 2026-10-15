// Monthly contracts: Show clocked hours puts the hours logged for each client under its monthly boxes, with a total row,
// and the month totals line up under their month headings (the footer's label takes only the client column).
const {start,login,BASE}=require('./helpers');
const ok=(name,cond,detail='')=>{console.log(`${cond?'PASS':'FAIL'} ${name}${detail?' — '+detail:''}`);if(!cond)process.exitCode=1;};

(async()=>{
 const b=await start();
 try{
  const p=await login(b,'admin@example.com');
  await p.setViewportSize({width:1400,height:1000});
  await p.goto(BASE+'/clients');await p.waitForLoadState('networkidle');await p.waitForSelector('table.mgrid');
  const show=p.locator('button:has-text("Show clocked hours")');
  ok('the toggle is off by default', await show.count()===1 && (await show.getAttribute('aria-pressed'))==='false');
  ok('no clocked figures before the toggle is on', await p.locator('.clk').count()===0);
  // The footer's first row spans the client column and then one cell per month, so each month total sits under its heading.
  const centres=()=>p.evaluate(()=>{
    const mid=(e)=>{const r=e.getBoundingClientRect();return Math.round((r.left+r.right)/2);};
    const heads=[...document.querySelectorAll('table.mgrid thead th.mo')].map(mid);
    const foot=[...document.querySelector('table.mgrid tfoot tr').querySelectorAll('td.mo')].map(mid);
    return {heads,foot};
  });
  const c0=await centres();
  ok('the month totals sit under their month headings', c0.heads.length===12 && c0.foot.length===12 && c0.heads.every((x,i)=>Math.abs(x-c0.foot[i])<=2));
  await show.click();
  const hide=p.locator('button:has-text("Hide clocked hours")');
  ok('the toggle is pressed and reads Hide clocked hours', await hide.count()===1 && (await hide.getAttribute('aria-pressed'))==='true');
  const figures=await p.locator('table.mgrid tbody td.mc .clk').count();
  ok('each client has a clocked figure under its boxes', figures>0, `${figures} figures`);
  ok('a clocked total row appears under the contracted total', await p.locator('table.mgrid tfoot tr.clkrow').count()===1);
  const total=await p.locator('table.mgrid tfoot tr.clkrow').innerText();
  ok('the clocked total row is labelled', /All clients clocked/.test(total), total.replace(/\s+/g,' ').slice(0,60));
  const c1=await centres();
  ok('the clocked row still lines up under the months', c1.foot.length===12 && c1.heads.every((x,i)=>Math.abs(x-c1.foot[i])<=2));
  await hide.click();
  ok('turning it off removes the clocked figures and row', await p.locator('.clk').count()===0 && await p.locator('table.mgrid tfoot tr.clkrow').count()===0);
  ok('no browser errors', (p.errs||[]).length===0, JSON.stringify(p.errs));
 } finally {
  await b.close();
 }
})().catch((e)=>{console.log('ERR',e.message.slice(0,500));process.exitCode=1;});
