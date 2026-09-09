const path=require('node:path');
let pw;try{pw=require('playwright');}catch{pw=require(path.join(process.env.APPDATA,'npm/node_modules/@playwright/cli/node_modules/playwright'));}
(async()=>{
  for(const type of ['chromium','firefox','webkit']){
    let browser;
    try{
      browser=await pw[type].launch(type==='chromium'?{channel:'chrome',headless:true}:{headless:true});
      const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true});
      const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.addInitScript(()=>{localStorage.setItem('lt-quality','performance');});
      await page.goto(process.env.GAME_URL||'http://127.0.0.1:4173');
      await page.waitForFunction(()=>typeof P!=='undefined'&&document.getElementById('load').hidden);
      await page.evaluate(()=>{grab=()=>{};enterFullscreen=()=>{};touchMode='on';begin('story');P.inv=999;G.queue=[];G.phase='test';});
      await page.waitForFunction(()=>G.time>.5);
      const before=await page.evaluate(()=>P.z);
      await page.keyboard.down('w');await page.waitForFunction(z=>P.z<z-.25,before);await page.keyboard.up('w');
      const input=await page.evaluate(()=>{
        const send=(id,type,n,x,y)=>$(id).dispatchEvent(new PointerEvent(type,{pointerId:n,pointerType:'touch',clientX:x,clientY:y,bubbles:true}));
        send('touch-zone-left','pointerdown',51,100,230);send('touch-zone-left','pointermove',51,100,190);
        send('touch-zone-right','pointerdown',52,400,130);let yaw=P.yaw;send('touch-zone-right','pointermove',52,430,140);
        let ammo=P.ammo;send('t-fire','pointerdown',53,800,340);
        let simultaneous=joy.y<0&&P.yaw!==yaw&&mouseDown;
        send('t-fire','pointercancel',53,800,340);send('touch-zone-left','pointercancel',51,100,190);send('touch-zone-right','pointercancel',52,430,140);
        return {simultaneous,released:!mouseDown&&joy.y===0&&lookId===null,finite:Number.isFinite(camera.position.y+gun.position.x)};
      });
      if(!input.simultaneous||!input.released||!input.finite)throw new Error('Input '+JSON.stringify(input));
      await page.evaluate(()=>pause());
      let t=await page.evaluate(()=>G.time);await page.waitForTimeout(150);
      if(await page.evaluate(()=>G.time)!==t)throw new Error('Pause advances simulation');
      if(errors.length)throw new Error(errors.join('; '));
      console.log(type+': live rendering, movement, multitouch, cancel, pause PASS');
    }finally{if(browser)await browser.close();}
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
