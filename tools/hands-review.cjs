// Hands and sights review: renders every weapon and pose from the eye, hands only, side/rear and hand close-ups,
// and prints hdFitReport/hdArmReport numbers. Needs node tools/serve.cjs running.
// Usage: node tools/hands-review.cjs <outdir> <tag> [port] [weapons 0,1,2,3,4] [poses hip,ads,sprint,reload,inspect] [closeups 1|0]
// Env: VW/VH viewport (default 1280x720), MOBILE=1 for touch + 3x scale, EXP='js snippet' (or EXPFILE=path to one) run before capturing (tuning).
const fs=require('node:fs');const path=require('node:path');
const pw=require(path.join(process.env.APPDATA,'npm/node_modules/@playwright/cli/node_modules/playwright'));
const out=process.argv[2]||'.';const tag=process.argv[3]||'d';const port=process.argv[4]||'4173';
const weapons=(process.argv[5]||'0,1,2,3,4').split(',').map(Number);
const poses=(process.argv[6]||'hip,ads,sprint,reload,inspect').split(',');
const closeups=(process.argv[7]||'1')==='1';
fs.mkdirSync(out,{recursive:true});
function save(name,dataUrl){fs.writeFileSync(path.join(out,name),Buffer.from(dataUrl.split(',')[1],'base64'));}
(async()=>{
 const browser=await pw.chromium.launch({channel:'chrome',headless:true});
 try{
  const mobile=process.env.MOBILE==='1';
  const page=await browser.newPage({viewport:{width:+(process.env.VW||1280),height:+(process.env.VH||720)},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:mobile?3:1});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text());});
  await page.addInitScript(()=>{const raf=window.requestAnimationFrame.bind(window);window.requestAnimationFrame=fn=>{if(fn.name==='frame'){window.testFrame=fn;return 1;}return raf(fn);};});
  await page.goto('http://127.0.0.1:'+port+'/?test=1&nocache='+Date.now());
  await page.evaluate(()=>window.GAME_READY||(typeof MODELS_READY!=='undefined'?MODELS_READY:null));   /* the GLB weapons swap in asynchronously */
  const exp=process.env.EXPFILE?fs.readFileSync(process.env.EXPFILE,'utf8'):(process.env.EXP||'');
  const report=await page.evaluate(({weapons,poses,closeups,exp})=>{
    grab=()=>{};enterFullscreen=()=>{};audioOn=()=>{};
    begin('story');G.queue=[];G.phase='test';clearField();G.callT=0;$('call').style.opacity=0;
    quality='balanced';applyQuality();
    if(exp)(new Function(exp))();          /* EXP env: a snippet run before the captures, for tuning experiments */
    P.x=-7.2;P.z=30;P.inv=999;P.pitch=0;P.yaw=0;
    const R={frames:{}};
    function ndc(v){const p=v.clone().project(gunCam);return {x:+p.x.toFixed(3),y:+p.y.toFixed(3),z:+v.z.toFixed(3)};}
    function view(obj,local){const v=(local||new THREE.Vector3()).clone();obj.updateWorldMatrix(true,false);obj.localToWorld(v);return v;}
    function armInfo(arm){
      const hand=arm.userData.hand,a=arm.userData.arm,st=a.state;
      const info={origin:ndc(view(arm)),wrist:ndc(view(arm,arm.userData.wrist)),end:ndc(st.end),exit:+st.exit.toFixed(3),stretch:+st.stretch.toFixed(2),endIn:st.endIn,dir:st.dir.toArray().map(v=>+v.toFixed(2))};
      info.tips=hand.userData.fingers.concat([hand.userData.thumb]).map(f=>{const j=f.userData.joints,last=j[j.length-1];return ndc(view(last,new THREE.Vector3(0,0,-f.userData.lens[f.userData.lens.length-1])));});
      const box=new THREE.Box3();hand.updateWorldMatrix(true,true);hand.traverse(o=>{if(o.isMesh){o.geometry.computeBoundingBox();const b=o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);box.union(b);}});
      info.handCenterView=box.getCenter(new THREE.Vector3()).toArray().map(v=>+v.toFixed(3));
      info.handCenterNdc=ndc(box.getCenter(new THREE.Vector3()));
      return info;
    }
    function render(){updateStationFx(0);updateViewModelLight(1/60);renderWetReflections(1/30);renderer.setRenderTarget(postActive?postTarget:null);renderer.clear();renderer.render(scene,camera);renderer.clearDepth();renderer.render(gunScene,gunCam);if(postActive)renderPost();}
    function renderGunOnly(cam){renderer.setRenderTarget(null);renderer.clear();renderer.render(gunScene,cam);}
    const dbg=new THREE.PerspectiveCamera(38,gunCam.aspect,0.01,10);
    function closeup(key,w){
      // close-ups of each hand: from the player's eye side (pulled in), and from outside the weapon
      ['lArm','rArm'].forEach((k,i)=>{
        const arm=w.userData[k];const c=new THREE.Vector3().fromArray(armInfo(arm).handCenterView);
        const side=i?1:-1;
        dbg.position.copy(c).add(new THREE.Vector3(side*0.06,0.10,0.22));dbg.up.set(0,1,0);dbg.lookAt(c);dbg.updateMatrixWorld(true);
        renderGunOnly(dbg);window['__cap_'+key+'_'+(i?'R':'L')+'_eye']=captureFrame();
        dbg.position.copy(c).add(new THREE.Vector3(side*0.26,0.06,-0.02));dbg.lookAt(c);dbg.updateMatrixWorld(true);
        renderGunOnly(dbg);window['__cap_'+key+'_'+(i?'R':'L')+'_out']=captureFrame();
        dbg.position.copy(c).add(new THREE.Vector3(side*0.04,-0.24,0.08));dbg.lookAt(c);dbg.updateMatrixWorld(true);
        renderGunOnly(dbg);window['__cap_'+key+'_'+(i?'R':'L')+'_below']=captureFrame();
      });
    }
    /* Structure view: the weapon hidden and every hand material replaced by one flat matte, so the
       pose is judged as anatomy rather than as gloves. Six orbits per hand at a fixed distance. */
    function structure(key,w){
      const hidden=[];
      w.traverse(o=>{if(o.isMesh&&o.visible&&!o.userData.hd){o.visible=false;hidden.push(o);}});
      ['lArm','rArm'].forEach((k,i)=>{
        const arm=w.userData[k],c=new THREE.Vector3().fromArray(armInfo(arm).handCenterView),side=i?1:-1;
        const dirs={front:[0,0,1],back:[0,0,-1],out:[side,0,0],in:[-side,0,0],top:[0,1,0.25],below:[0,-1,0.25]};
        for(const name in dirs){
          const d=new THREE.Vector3().fromArray(dirs[name]).normalize();
          dbg.position.copy(c).addScaledVector(d,0.24);dbg.up.set(0,name==='top'||name==='below'?0:1,name==='top'||name==='below'?-1:0);
          dbg.lookAt(c);dbg.updateMatrixWorld(true);
          renderGunOnly(dbg);window['__cap_'+key+'_'+(i?'R':'L')+'_'+name]=captureFrame();
        }
      });
      hidden.forEach(o=>o.visible=true);
    }
    function snap(key,w,extra){
      const f=Object.assign({left:armInfo(w.userData.lArm),right:armInfo(w.userData.rArm),armReport:hdArmReport(),gunPos:w.position.toArray().map(v=>+v.toFixed(3)),fov:+gunCam.fov.toFixed(1)},extra||{});
      R.frames[key]=f;render();window['__cap_'+key]=captureFrame();
    }
    if(poses.includes('struct')){
      /* one flat matte on every hand part; userData.hd marks what belongs to a hand */
      const flat=new THREE.MeshStandardMaterial({color:0xb9bec4,roughness:0.85,metalness:0});
      wpnMeshes.forEach(w=>['lArm','rArm'].forEach(k=>{
        const a=w.userData[k];if(a)a.traverse(o=>{o.userData.hd=true;if(o.isMesh)o.material=flat;});
      }));
    }
    for(const wi of weapons){
      switchWeapon(wi);for(let i=0;i<40;i++)update(1/60);
      const w=wpnMeshes[wi];
      if(poses.includes('struct')){structure('w'+wi+'_struct',w);continue;}
      if(poses.includes('hip')){
        snap('w'+wi+'_hip',w,{fit:hdFitReport(w)});
        const hiddenList=[];w.children.forEach(c=>{if(c!==w.userData.lArm&&c!==w.userData.rArm&&c.visible){c.visible=false;hiddenList.push(c);}});
        if(w.userData.pump){w.userData.pump.children.forEach(c=>{if(c!==w.userData.lArm&&c.visible){c.visible=false;hiddenList.push(c);}});}
        render();window['__cap_w'+wi+'_handsonly']=captureFrame();
        hiddenList.forEach(c=>c.visible=true);
        if(closeups)closeup('w'+wi+'_hip',w);
        // external views
        const target=new THREE.Vector3(0.1,-0.15,-0.4);
        dbg.position.set(1.1,-0.05,-0.35);dbg.up.set(0,1,0);dbg.lookAt(target);dbg.updateMatrixWorld(true);renderGunOnly(dbg);window['__cap_w'+wi+'_side']=captureFrame();
        dbg.position.set(-0.3,-0.1,0.6);dbg.lookAt(new THREE.Vector3(0.1,-0.15,-0.4));dbg.updateMatrixWorld(true);renderGunOnly(dbg);window['__cap_w'+wi+'_rear']=captureFrame();
      }
      if(poses.includes('ads')){adsDown=true;P.ads=1;for(let i=0;i<60;i++)update(1/60);snap('w'+wi+'_ads',w);if(closeups)closeup('w'+wi+'_ads',w);adsDown=false;P.ads=0;for(let i=0;i<40;i++)update(1/60);}
      if(poses.includes('sprint')){keys.ShiftLeft=true;keys.KeyW=true;for(let i=0;i<70;i++)update(1/60);snap('w'+wi+'_sprint',w);keys.ShiftLeft=false;keys.KeyW=false;for(let i=0;i<60;i++)update(1/60);}
      if(poses.includes('reload')){P.wpnState[wi].ammo=0;P.ammo=0;reload();for(let i=0;i<40;i++)update(1/60);snap('w'+wi+'_reload40',w);for(let i=0;i<30;i++)update(1/60);snap('w'+wi+'_reload70',w);for(let i=0;i<200;i++)update(1/60);}
      if(poses.includes('inspect')){inspectWeapon();for(let i=0;i<35;i++)update(1/60);snap('w'+wi+'_inspect',w);for(let i=0;i<120;i++)update(1/60);}
    }
    switchWeapon(0);for(let i=0;i<40;i++)update(1/60);
    R.drawCalls=(()=>{render();return renderer.info.render.calls;})();
    return R;
  },{weapons,poses,closeups,exp});
  const keys=await page.evaluate(()=>Object.keys(window).filter(k=>k.startsWith('__cap_')));
  for(const k of keys){const d=await page.evaluate(k=>window[k],k);save(tag+'_'+k.slice(6)+'.png',d);}
  fs.writeFileSync(path.join(out,tag+'_report.json'),JSON.stringify(report,null,1));
  const summary={errors,frames:Object.keys(report.frames).length,drawCalls:report.drawCalls};
  for(const k of Object.keys(report.frames)){const f=report.frames[k];summary[k]={L:{wrist:f.left.wrist,exit:f.left.exit,endIn:f.left.endIn,stretch:f.left.stretch,dir:f.left.dir},R:{wrist:f.right.wrist,exit:f.right.exit,endIn:f.right.endIn,stretch:f.right.stretch,dir:f.right.dir}};if(f.fit)summary[k].fit={min:+f.fit.minClearance.toFixed(4),palm:+f.fit.palmMin.toFixed(4),contacts:f.fit.contacts,fingers:f.fit.fingers.map(x=>x.hand[0]+x.finger+':'+x.clearance+':'+x.curls.join('/'))};}
  console.log(JSON.stringify(summary));
  await page.close();
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
