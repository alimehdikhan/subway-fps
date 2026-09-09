/* Adaptive rendering, resize handling and time-based simulation. */
'use strict';
function resize(){
  var w=Math.max(1,innerWidth),h=Math.max(1,innerHeight);
  renderer.setSize(w,h,false);
  camera.aspect=w/h;camera.updateProjectionMatrix();
  gunCam.aspect=w/h;gunCam.fov=Math.min(110,2*Math.atan(Math.tan(58*Math.PI/360)*Math.max(1,1.4/(w/h)))*180/Math.PI);gunCam.updateProjectionMatrix();
  if(postTarget){
    var pr=renderer.getPixelRatio(),tw=postActive?Math.max(1,Math.floor(w*pr)):1,th=postActive?Math.max(1,Math.floor(h*pr)):1;
    resizePost(tw,th);
  }
}
var resizeQueued=false;
function queueResize(){if(resizeQueued)return;resizeQueued=true;requestAnimationFrame(function(){resizeQueued=false;setRenderScale(renderScale);});}
window.addEventListener('resize',queueResize);
if(window.visualViewport)visualViewport.addEventListener('resize',queueResize);
applyQuality();
function menuShot(t){
  camera.position.set(-7.2,1.78,22);
  camera.rotation.set(0.01,reduceMotion?0.05:0.05+Math.sin(t*.12)*.08,0,'YXZ');
  if(camera.fov!==68){camera.fov=68;camera.updateProjectionMatrix();}
  updateLights(camera.position.x,camera.position.z);
}
var last=performance.now(),lastRender=0,fpsCount=0,fpsTimer=0,fpsWorst=0,mapTimer=0,_frameCount=0,shadowTimer=0;
function frame(now){
  requestAnimationFrame(frame);
  if(document.hidden){last=now;return;}
  var playing=G.state==='play';
  if(!playing&&now-lastRender<1000/20){last=now;return;}
  var rawDt=Math.max(0,(now-last)/1000);last=now;lastRender=now;
  if(rawDt>0.5){fpsTimer=fpsCount=0;qualityWarmup=2;return;}
  var dt=Math.min(rawDt,.1);_frameCount++;
  if(playing){
    /* FPS counter: average over half a second, plus the slowest frame in that window */
    fpsCount++;fpsTimer+=rawDt;if(rawDt>fpsWorst)fpsWorst=rawDt;
    if(fpsTimer>=.5){
      var fps=Math.round(fpsCount/fpsTimer);
      $('fpsval').textContent=fps;$('msval').textContent=(fpsTimer/fpsCount*1000).toFixed(1);
      if($('lowval'))$('lowval').textContent=Math.round(1/Math.max(fpsWorst,1e-3));
      $('fpsval').style.color=fps>=55?'#77d9b2':fps>=40?'#e8a33d':'#f28470';
      fpsCount=fpsTimer=0;fpsWorst=0;
    }
    adaptQuality(rawDt);
    var steps=Math.max(1,Math.ceil(dt/.025)),step=dt/steps;
    for(var i=0;i<steps&&G.state==='play';i++){
      var aiming=adsDown&&P.reload<=0&&P.switchT<=0&&P.nadeT<=0;
      var adsTarget = aiming ? 1 : 0;
      var curSpeed = (typeof WEAPONS!=='undefined'&&WEAPONS[P.curWpn]&&WEAPONS[P.curWpn].adsSpeed)?WEAPONS[P.curWpn].adsSpeed:18;
      P.ads = Math.abs(P.ads - adsTarget) < 0.005 ? adsTarget : slerp(P.ads, adsTarget, curSpeed, step);
      update(step);
    }
    mapTimer+=dt;if(mapTimer>=.075){drawMap();mapTimer=0;}
  }else{
    $('sniper-scope').classList.remove('active');$('scope-vignette').classList.remove('active');
    if(G.state==='menu'){menuShot(now/1000);stepParticles(dt);}
  }
  shadowTimer+=rawDt;
  renderer.shadowMap.autoUpdate=false;
  if(shadowTimer>=1/30){renderer.shadowMap.needsUpdate=true;shadowTimer=0;}
  /* station ambience (failing tube) and the view-model light that tracks the nearest fixture */
  if(typeof updateStationFx==='function')updateStationFx(dt);
  if(typeof updateViewModelLight==='function')updateViewModelLight(dt);
  renderer.info.autoReset=false;renderer.info.reset();
  if(typeof renderWetReflections==='function')renderWetReflections(dt);
  renderer.setRenderTarget(postActive?postTarget:null);renderer.clear();renderer.render(scene,camera);
  if(G.state!=='menu'&&gunRig.visible){renderer.clearDepth();renderer.render(gunScene,gunCam);}
  if(postActive)renderPost();
}
window.captureFrame=function(){return canvas.toDataURL('image/png');};
canvas.addEventListener('webglcontextlost',function(e){e.preventDefault();pause();$('failtext').textContent='The graphics context was interrupted. Reload to reconnect.';$('fail').hidden=false;});
canvas.addEventListener('webglcontextrestored',function(){$('fail').hidden=true;applyQuality();});
/* the boot screen owns the hand-off: it waits for the weapon models before showing the menu */
if(window.BOOT&&BOOT.finish)BOOT.finish();
else{$('load').hidden=true;$('load').style.display='none';$('menu').hidden=false;$('start').focus();}
requestAnimationFrame(frame);
