const fs=require('node:fs'),path=require('node:path');
const pw=require(path.join(process.env.APPDATA,'npm/node_modules/@playwright/cli/node_modules/playwright'));
(async()=>{const browser=await pw.chromium.launch({channel:'chrome',headless:true});try{
const page=await browser.newPage();await page.addInitScript(()=>{const raf=requestAnimationFrame.bind(window);requestAnimationFrame=fn=>fn.name==='frame'?1:raf(fn);});
await page.goto('http://127.0.0.1:4173/?test=1');await page.evaluate(()=>GAME_READY);
const results=await page.evaluate(()=>{
grab=()=>{};audioOn=()=>{};begin('story');G.queue=[];G.phase='test';clearField();switchWeapon(4);for(let i=0;i<60;i++)update(1/60);
const w=wpnMeshes[4],s=HD_SPECS.pistol,results=[];
for(const back of [-.018,-.006,.006,.021])for(const y of [-.022,-.014,.002]){
  for(const k of ['lArm','rArm'])w.userData[k].parent.remove(w.userData[k]);
  s.grip.thumbBack=back;s.thumb.target=[-.024,y,.008];hdBuildHands(w,'pistol');animateHandling(0);w.updateWorldMatrix(true,true);
  const arm=w.userData.rArm,hand=arm.userData.hand,th=hand.userData.thumb;
  const inv=new THREE.Matrix4().copy(w.matrixWorld).invert();
  const root=th.localToWorld(new THREE.Vector3()).applyMatrix4(inv);
  const tip=th.userData.joints[2].localToWorld(new THREE.Vector3(0,0,-th.userData.lens[2])).applyMatrix4(inv);
  const fit=hdFitReport(w);
  results.push({back,y,root:root.toArray(),tip:tip.toArray(),target:s.thumb.target.slice(),clearance:fit.minClearance,curls:th.userData.baseCurls});
}
return results;
});fs.writeFileSync('.playwright-cli/upgrade/grip-tuning.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
