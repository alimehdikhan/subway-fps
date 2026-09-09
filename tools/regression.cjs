const fs = require('node:fs');
const path = require('node:path');
let playwright;
try { playwright = require('playwright'); } catch {
  playwright = require(path.join(process.env.APPDATA, 'npm/node_modules/@playwright/cli/node_modules/playwright'));
}
const { chromium } = playwright;
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const results = [];
  try {
    for (const mobile of [false, true]) {
      const context = await browser.newContext({ viewport: mobile ? { width: 844, height: 390 } : { width: 1280, height: 720 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 3 : 1 });
      const page = await context.newPage();
      const errors=[];page.on('pageerror', e => errors.push(e.message));
      // Deterministic ticks avoid benchmarking the automation host's software GPU.
      await page.addInitScript(() => { const raf=window.requestAnimationFrame.bind(window);window.requestAnimationFrame=fn=>{if(fn.name==='frame'){window.testFrame=fn;return 1;}return raf(fn);}; });
      await page.goto(process.env.GAME_URL || 'http://127.0.0.1:4173');
      // the GLB view models load asynchronously; every check below runs against the swapped weapons
      await page.evaluate(() => window.GAME_READY||(typeof MODELS_READY!=='undefined'?MODELS_READY:null));
      const result=await page.evaluate(() => {
        const checks=[];
        function check(name, value){checks.push({name,pass:!!value});if(!value)throw new Error(name);}
        grab=()=>{};enterFullscreen=()=>{};audioOn=()=>{};
        begin('story');G.queue=[];G.phase='test';clearField();
        check('station batches reduce mesh count',batchStats.before>batchStats.after*2);
        check('render target absent from balanced path',postTarget.width===1&&!postActive);
        for(const q of ['performance','balanced','ultra','auto']){quality=q;applyQuality();check('quality '+q,Number.isFinite(renderer.getPixelRatio())&&renderer.getPixelRatio()<=1.5);if(q==='ultra'){renderer.setRenderTarget(postTarget);renderer.clear();renderer.render(scene,camera);renderPost();}}
        quality='performance';applyQuality();
        P.x=-7;P.z=10;P.y=0;P.pitch=0;P.yaw=0;P.inv=999;
        update(1/60);
        let standing=camera.position.y;
        keys.KeyC=true;for(let i=0;i<40;i++)update(1/60);
        check('crouch changes actual eye height',camera.position.y<standing-.4);
        keys.KeyC=false;for(let i=0;i<40;i++)update(1/60);
        keys.Space=true;for(let i=0;i<120;i++)update(1/60);
        check('held jump does not bunny-hop',P.grounded&&P.y===0);keys.Space=false;update(1/60);
        // Center a real enemy's head on the camera ray and ensure recoil does not move the shot.
        let enemy=makeEnemy('heavy',P.x,P.z-8);enemies.push(enemy);
        enemy.hp=10000;enemy.speed=0;
        let sphere=hitSpheres(enemy);
        camera.position.set(P.x,1.62,P.z);camera.lookAt(sphere.hx,sphere.hy,sphere.hz);camera.updateMatrixWorld(true);
        P.ads=1;P.curWpn=0;P.fireCd=0;P.kick=0;walkSpeed=0;P.grounded=true;
        let hp=enemy.hp,ammo=P.wpnState[0].ammo;
        shoot();check('camera-aligned ADS headshot is immediate',enemy.hp===hp-WEAPONS[0].dmgHead);
        check('one shot consumes one round',P.wpnState[0].ammo===ammo-1);
        // Crouched and rotated shots must use the camera origin, not standing eye height.
        for(const pose of [{x:-7,y:1.14,z:10},{x:-9,y:1.62,z:11},{x:-6,y:2.5,z:12}]){
          camera.position.set(pose.x,pose.y,pose.z);camera.lookAt(sphere.hx,sphere.hy,sphere.hz);camera.updateMatrixWorld(true);
          P.kick=0;P.fireCd=0;let previous=enemy.hp;shoot();check('camera-origin shot '+pose.y+' '+pose.x,enemy.hp===previous-WEAPONS[0].dmgHead);
        }
        camera.position.set(P.x,1.62,P.z);camera.lookAt(sphere.hx,sphere.hy,sphere.hz);camera.updateMatrixWorld(true);
        P.fireCd=0;P.kick=0;hp=enemy.hp;
        let barrier={min:[P.x-1,0,P.z-5],max:[P.x+1,3,P.z-4]};COL.push(barrier);shoot();
        check('walls block bullets',enemy.hp===hp);COL.pop();
        // Visual saturation cannot suppress the immediate damage callback.
        let callbacks=0;for(let i=0;i<TRACER_MAX*2;i++)spawn3DTracer(0,1,0,0,1,-50,0,()=>callbacks++);
        check('tracer pool cannot drop damage',callbacks===TRACER_MAX*2);

        // A visual miss expires without creating impacts or recursive ricochet tracers.
        updateTracers(1);let beforeParticles=pHead;
        spawn3DTracer(0,2,0,0,2,-4,0);updateTracers(.2);
        check('misses do not create impact particles',pHead===beforeParticles);
        check('tracers expire without spawning more tracers',tracerPool.every(t=>!t.active));
        let closeOrigin=new THREE.Vector3(0,2,0),closeTarget=new THREE.Vector3(0,2,-.08);
        spawn3DTracer(0,2,0,0,2,-.08,0);let closeTrail=tracerPool[(tracerHead+TRACER_MAX-1)%TRACER_MAX];
        closeTrail.group.updateMatrixWorld(true);
        let trailFront=closeTrail.group.localToWorld(new THREE.Vector3(0,0,.5));
        let trailBack=closeTrail.group.localToWorld(new THREE.Vector3(0,0,-.5));
        check('close-range trail never extends through its endpoint',trailFront.distanceTo(closeOrigin)<=.0801&&trailBack.distanceTo(closeOrigin)<=.0801&&trailBack.z<=.0001);
        surfaceImpact(-11,2,0,0);
        check('wall impact leaves a surface-aligned mark',impactPool.some(m=>m.visible&&Math.abs(m.position.x+10.992)<.001));
        for(let i=0;i<100;i++)surfaceImpact(-11,2,0,0);
        check('bullet marks stay within fixed pool',impactPool.length===48&&impactPool.every(m=>m.visible));
        clearImpactMarks();check('new match clears impact marks',impactPool.every(m=>!m.visible));
        clearField();
        P.wpnState[0].ammo=0;P.ammo=0;P.fireCd=0;P.ads=0;reload();
        for(let i=0;i<150;i++)update(1/60);
        check('empty reload refills magazine',P.wpnState[0].ammo===30&&P.reload===0);
        for(let wi=0;wi<WEAPONS.length;wi++){
          switchWeapon(wi);for(let i=0;i<30;i++)update(1/60);
          let mesh=wpnMeshes[wi];P.wpnState[wi].ammo=0;P.ammo=0;reload();
          for(let i=0;i<150;i++)update(1/60);
          check('weapon '+wi+' grip restored after reload',mesh.userData.lArm.position.distanceTo(mesh.userData.gripHome)<.001);
          check('weapon '+wi+' magazine complete',P.wpnState[wi].ammo===WEAPONS[wi].magMax);
          check('weapon '+wi+' finger belongs to firing hand',mesh.userData.triggerFinger.parent.parent===mesh.userData.rArm);
        }
        // Muzzle sockets: one per weapon, following every view-model layer, mapped onto the muzzle pixel.
        check('every weapon has a muzzle socket',wpnMeshes.every(w=>w.userData.muzzle&&w.userData.muzzle.parent===w));
        switchWeapon(0);for(let i=0;i<30;i++)update(1/60);
        const socketHip=muzzleState.view.clone();
        adsDown=true;P.ads=1;update(1/60);const socketAds=muzzleState.view.clone();adsDown=false;P.ads=0;
        P.kick=1.6;update(1/60);const socketKick=muzzleState.view.clone();P.kick=0;update(1/60);
        check('socket follows ADS and recoil',socketAds.distanceTo(socketHip)>.01&&socketKick.distanceTo(socketHip)>.003);
        camera.updateMatrixWorld(true);
        const pixGun=muzzleState.view.clone().project(gunCam),pixWorld=muzzleState.world.clone().project(camera);
        check('world muzzle sits on the view-model muzzle pixel',Math.abs(pixGun.x-pixWorld.x)<1e-3&&Math.abs(pixGun.y-pixWorld.y)<1e-3);
        // World-space muzzle smoke: spawns at the barrel, stays put when the camera moves, bounded pool.
        resetMuzzleSmoke();P.fireCd=0;P.kick=0;shoot();
        const puffs=mzSmoke.filter(p=>p.life>0),origin=_shotStart.clone();
        check('shot smoke starts at the muzzle',puffs.length>0&&puffs.every(p=>Math.hypot(p.x-origin.x,p.y-origin.y,p.z-origin.z)<.1));
        const puffPos=puffs.map(p=>({p,x:p.x,y:p.y,z:p.z}));
        P.yaw+=Math.PI/2;P.x-=2;for(let i=0;i<6;i++)update(1/60);
        check('smoke does not follow the camera',puffPos.every(b=>Math.hypot(b.p.x-b.x,b.p.y-b.y,b.p.z-b.z)<.45));
        switchWeapon(1);for(let i=0;i<30;i++)update(1/60);P.wpnState[1].ammo=999;
        for(let i=0;i<220;i++){P.fireCd=0;shoot();update(1/60);}
        check('sustained fire stays inside the smoke pool',mzSmoke.filter(p=>p.life>0).length<=MZ_SMOKE_MAX&&mzHeat[1]>.8);
        for(let i=0;i<500;i++)update(1/60);check('smoke settles and hides',!mzSmokeMesh.visible);
        // Hands: fitted to the grips without clipping, arms proportioned, hands attached in every pose.
        for(let wi=0;wi<WEAPONS.length;wi++){
          const fit=hdFitReport(wpnMeshes[wi]);
          check('weapon '+wi+' fingers do not clip the weapon',fit.minClearance>-.003&&fit.palmMin>-.002);
          check('weapon '+wi+' fingers actually hold the grip',fit.contacts>=4);
        }
        for(let wi=0;wi<WEAPONS.length;wi++){
          switchWeapon(wi);for(let i=0;i<30;i++)update(1/60);
          const poses=[];adsDown=true;P.ads=1;for(let i=0;i<60;i++)update(1/60);poses.push(hdArmReport());adsDown=false;P.ads=0;
          keys.ShiftLeft=true;keys.KeyW=true;for(let i=0;i<60;i++)update(1/60);poses.push(hdArmReport());keys.ShiftLeft=false;keys.KeyW=false;
          for(let i=0;i<60;i++)update(1/60);poses.push(hdArmReport());
          check('weapon '+wi+' sleeves leave the frame',poses.every(r=>!r.leftEndIn&&!r.rightEndIn&&Number.isFinite(r.leftExit)&&Number.isFinite(r.rightExit)));
          check('weapon '+wi+' sleeves keep their proportions',poses.every(r=>r.leftStretch<=1.8&&r.rightStretch<=1.8));
          check('weapon '+wi+' hands stay on their grips',wpnMeshes[wi].userData.lArm.parent===wpnMeshes[wi].userData.gripParent&&wpnMeshes[wi].userData.rArm.parent===wpnMeshes[wi]);
        }
        switchWeapon(0);for(let i=0;i<30;i++)update(1/60);
        const tf=wpnMeshes[0].userData.triggerFinger,restRx=tf.rotation.x;mouseDown=true;P.fireCd=0;for(let i=0;i<12;i++)update(1/60);
        check('trigger finger moves onto the trigger when firing',Math.abs(tf.rotation.x-restRx)>.02);mouseDown=false;
        // Pistol: semi-automatic (one round per press), a magazine the reload can drop, held closer.
        switchWeapon(4);for(let i=0;i<30;i++)update(1/60);P.wpnState[4].ammo=15;P.ammo=15;P.fireCd=0;
        mouseDown=true;for(let i=0;i<40;i++)update(1/60);
        check('pistol fires once per press',P.wpnState[4].ammo===14);
        mouseDown=false;update(1/60);mouseDown=true;update(1/60);mouseDown=false;update(1/60);
        check('pistol fires again on the next press',P.wpnState[4].ammo===13);
        check('pistol has a magazine that can drop',!!wpnMeshes[4].userData.mag);
        check('pistol sits closer than the long guns',gun===wpnMeshes[4]&&gun.position.z>-0.50);
        // Shotgun: the support hand rides the fore-end and the pump comes home after a dry reload.
        switchWeapon(1);for(let i=0;i<30;i++)update(1/60);P.wpnState[1].ammo=0;P.ammo=0;reload();for(let i=0;i<190;i++)update(1/60);
        check('shotgun pump returns home',Math.abs(shotgunPump.position.z+0.44)<1e-6&&wpnMeshes[1].userData.lArm.parent===shotgunPump);
        switchWeapon(3);for(let i=0;i<30;i++)update(1/60);adsDown=true;P.ads=1;update(1/60);
        check('rail scope hides view model',!gunRig.visible&&$('sniper-scope').classList.contains('active'));
        check('scope has actual range readout',/m.*RANGE/.test($('scopereadout').textContent));
        pause();check('pause releases fire and ADS',!mouseDown&&!adsDown&&G.state==='pause');
        unpause();P.ads=0;update(1/60);check('resume restores weapon',gunRig.visible);
        quality='auto';applyQuality();qualityWarmup=0;for(let i=0;i<400;i++)adaptQuality(.03);
        check('auto reduces quality under sustained load',qualityTier===0&&renderScale<1);
        quality='performance';applyQuality();
        begin('story');G.queue=[];G.phase='test';G.callT=0;$('call').style.opacity=0;
        P.x=-7.2;P.z=30;P.inv=999;update(1/60);
        [scene,gunScene].forEach(root=>root.traverse(o=>{if((o.isMesh||o.isSprite||o.isPoints)&&!o.material)throw new Error('Missing material '+o.type+' '+o.geometry?.type+' parent '+o.parent?.type+' tracer '+tracerPool.findIndex(t=>t.outer===o||t.head===o)+' casing '+casingPool.findIndex(t=>t.mesh===o));}));
        renderer.setRenderTarget(null);renderer.clear();renderer.render(scene,camera);renderer.clearDepth();renderer.render(gunScene,gunCam);
        return {checks,batchStats,coarse,scale:renderScale,drawCalls:renderer.info.render.calls};
      });
      await page.screenshot({path:mobile?'mobile-landscape.png':'desktop-updated.png',animations:'disabled'});
      if(!mobile){
        await page.evaluate(()=>{P.wpnState[0].ammo=0;P.ammo=0;reload();for(let i=0;i<66;i++)update(1/60);renderer.clear();renderer.render(scene,camera);renderer.clearDepth();renderer.render(gunScene,gunCam);});
        await page.screenshot({path:'reload-updated.png',animations:'disabled'});
      }
      if(mobile){
        await page.evaluate(()=>{switchWeapon(3);for(let i=0;i<30;i++)update(1/60);P.ads=1;adsDown=true;update(1/60);renderer.clear();renderer.render(scene,camera);});
        await page.screenshot({path:'mobile-scope.png',animations:'disabled'});
        await page.setViewportSize({width:375,height:812});
        await page.evaluate(()=>{resize();$('rotate-prompt').style.display='none';update(1/60);renderer.clear();renderer.render(scene,camera);});
        const layout=await page.evaluate(()=>{
          let ids=['t-fire','t-ads','t-jump','t-crouch','t-reload','t-switch','t-nade','t-sprint'];
          const boxes=ids.map(id=>{let r=$(id).getBoundingClientRect();return {id,x:r.x,y:r.y,w:r.width,h:r.height};});
          let overlap=boxes.some((b,i)=>boxes.some((c,j)=>j>i&&Math.min(b.x+b.w,c.x+c.w)-Math.max(b.x,c.x)>0&&Math.min(b.y+b.h,c.y+c.h)-Math.max(b.y,c.y)>0));
          let service=$('service').getBoundingClientRect(),gunHud=$('gun').getBoundingClientRect();
          return {inside:boxes.every(b=>b.x>=0&&b.y>=0&&b.x+b.w<=innerWidth&&b.y+b.h<=innerHeight),sized:boxes.every(b=>b.w>=48&&b.h>=48),scroll:document.documentElement.scrollWidth<=innerWidth,overlap,hudClear:gunHud.top>=service.bottom};
        });
        if(!layout.inside||!layout.sized||!layout.scroll||layout.overlap||!layout.hudClear)throw new Error('Mobile layout '+JSON.stringify(layout));
        result.layout=layout;
        await page.screenshot({path:'mobile-portrait.png',animations:'disabled'});
      }
      if(errors.length)throw new Error(errors.join('\n'));
      results.push({mobile,...result});await context.close();
    }
    fs.writeFileSync('tests-results.json',JSON.stringify(results,null,2));
    console.log(JSON.stringify(results,null,2));
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
