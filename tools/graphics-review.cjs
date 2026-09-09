// Graphics and grip regression against the loaded models, including the Ultra render path.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
let pw;try{pw=require('playwright');}catch{pw=require(path.join(process.env.APPDATA,'npm/node_modules/@playwright/cli/node_modules/playwright'));}
const out='.playwright-cli/upgrade';fs.mkdirSync(out,{recursive:true});
(async()=>{
  const browser=await pw.chromium.launch({channel:'chrome',headless:true});
  const results=[];
  try{
    for(const mobile of [false,true]){
      const page=await browser.newPage({viewport:mobile?{width:844,height:390}:{width:1280,height:720},hasTouch:mobile,isMobile:mobile,deviceScaleFactor:mobile?3:1});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('404'))errors.push(m.text());});
      await page.addInitScript(()=>{
        const raf=requestAnimationFrame.bind(window);
        window.requestAnimationFrame=fn=>fn.name==='frame'?1:raf(fn);
        localStorage.setItem('lt-quality','balanced');
      });
      await page.goto('http://127.0.0.1:4173/?test=1');
      await page.evaluate(()=>GAME_READY);
      const result=await page.evaluate(()=>{
        grab=()=>{};enterFullscreen=()=>{};audioOn=()=>{};
        begin('story');clearField();G.queue=[];G.phase='test';G.callT=0;$('call').style.opacity=0;
        P.x=-7.2;P.z=30;P.inv=999;
        const checks=[];
        function check(name,pass){checks.push({name,pass:!!pass});if(!pass)throw new Error(name);}
        check('all four GLB models loaded',[0,1,2,4].every(i=>wpnMeshes[i].userData.model));
        const uvModels=[];
        wpnMeshes.forEach(w=>w.traverse(o=>{if(o.isMesh&&o.userData.model)uvModels.push(o);}));
        check('GLB bodies have usable UVs',uvModels.length>=4&&uvModels.every(o=>o.geometry.attributes.uv?.count===o.geometry.attributes.position.count));
        check('station reflection capture exists',!!stationReflectionTarget&&scene.environment===gunScene.environment);
        for(let wi=0;wi<WEAPONS.length;wi++){
          switchWeapon(wi);for(let i=0;i<60;i++)update(1/60);
          const w=wpnMeshes[wi],fit=hdFitReport(w);
          check('weapon '+wi+' grip contact',fit.minClearance>-.002&&fit.palmMin>-.002&&fit.contacts>=4);
          for(const k of ['lArm','rArm']){
            const arm=w.userData[k],hand=arm.userData.hand;
            const wrist=hand.localToWorld(hand.userData.wrist.clone());
            check('weapon '+wi+' '+k+' sleeve meets fitted wrist',wrist.distanceTo(arm.userData.arm.state.wrist)<1e-5);
          }
          P.kick=WEAPONS[wi].recoilKick;animateHandling(1/60);
          check('weapon '+wi+' support grip stays anchored under recoil',w.userData.lArm.position.distanceTo(w.userData.gripHome)<1e-6);
          P.kick=0;animateHandling(0);
        }
        switchWeapon(0);for(let i=0;i<60;i++)update(1/60);
        quality='ultra';applyQuality();updateStationFx(0);updateViewModelLight(.1);renderWetReflections(1);
        check('Ultra creates bounded reflection target',wetReflectionRT.width<=640&&wetReflectionRT.height<=640);
        check('reflection restores renderer state',renderer.clippingPlanes.length===0&&wetSurfaces.every(m=>m.visible));
        renderer.info.autoReset=false;renderer.info.reset();
        renderer.setRenderTarget(postTarget);renderer.clear();renderer.render(scene,camera);renderer.clearDepth();renderer.render(gunScene,gunCam);renderPost();
        const calls=renderer.info.render.calls;
        const pixels=new Uint8Array(wetReflectionRT.width*wetReflectionRT.height*4);
        renderer.readRenderTargetPixels(wetReflectionRT,0,0,wetReflectionRT.width,wetReflectionRT.height,pixels);
        let bright=0,dark=0;for(let i=0;i<pixels.length;i+=4){if(pixels[i]+pixels[i+1]+pixels[i+2]>280)bright++;else dark++;}
        check('water reflection contains rendered station',bright>100&&dark>100);
        window.__ultra=captureFrame();
        const reflectionVersion=wetReflectionRT.texture.version;
        quality='performance';applyQuality();renderWetReflections(1);
        check('Performance restores inexpensive water material',wetSurfaces.every(m=>m.material===platPuddleMat)&&!postActive);
        check('Performance skips reflection rendering',reflectionVersion===wetReflectionRT.texture.version);
        quality='balanced';applyQuality();renderWetReflections(1);renderer.setRenderTarget(null);renderer.clear();renderer.render(scene,camera);renderer.clearDepth();renderer.render(gunScene,gunCam);
        return {mobile:coarse,checks,calls,reflectionBrightPixels:bright};
      });
      const prefix=mobile?'mobile':'desktop';
      fs.writeFileSync(path.join(out,prefix+'-ultra.png'),Buffer.from((await page.evaluate(()=>window.__ultra)).split(',')[1],'base64'));
      await page.screenshot({path:path.join(out,prefix+'-balanced.png')});
      assert.equal(errors.length,0,errors.join('\n'));
      results.push(result);await page.close();
    }
    fs.writeFileSync(path.join(out,'graphics-checks.json'),JSON.stringify(results,null,2));
    console.log(JSON.stringify(results.map(r=>({mobile:r.mobile,checks:r.checks.length,pass:r.checks.every(c=>c.pass),calls:r.calls,reflectionBrightPixels:r.reflectionBrightPixels}))));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
