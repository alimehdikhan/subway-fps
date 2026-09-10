/* Subway FPS — flow.js
   Wave progression, the train, HUD, minimap, run start/pause/finish and best scores.
   All game scripts share one global scope and load in the order listed in index.html. */
'use strict';

/* ============================ waves and the train ============================ */
var stragglers=0;
function beginBoarding(){
  G.phase='board';G.trainT=0;G.doors=0;stragglers=0;G.brake=false;
  train.position.z=-190;
  call('Train inbound','HOLD UNTIL THE DOORS OPEN');
  noiseBurst(1.2,240,0.3,60);
}
function waveClearReward(){
  /* patch up, top every weapon up by a third of its reserve, hand out a grenade */
  P.hp=Math.min(100,P.hp+22);
  for(var wi=0;wi<WEAPONS.length;wi++){
    var ws=P.wpnState[wi];
    ws.reserve=Math.min(WEAPONS[wi].reserveMax,ws.reserve+Math.round(WEAPONS[wi].reserveMax*Math.min(0.50, 0.34 + (G.mode === 'endless' ? G.wave * 0.02 : 0))));
  }
  P.reserve=P.wpnState[P.curWpn].reserve;
  P.nades=Math.min(P.nadeMax,P.nades+1);
}
function waves(dt){
  if(G.phase==='wave'){
    if(G.queue.length){
      G.spawnT-=dt;
      if(G.spawnT<=0&&enemies.length<maxAlive()){
        spawnOne(G.queue.shift());
        G.spawnT=(G.mode==='endless'?0.7:0.85)+Math.random()*0.85;
      }
    }else if(!enemies.length){
      G.phase='gap';G.gap=G.mode==='endless'?5:5.5;
      if(P.hp < 40) G.gap += 2.0;
      var endless=G.mode==='endless';
      if(endless||G.wave<STORY_WAVES){
        var waveBonus=Math.max(50,Math.round(300-G.time*2))+(endless?G.wave*40:0);
        var total=Math.round((250+waveBonus)*D().score);
        waveClearReward();G.score+=total;
        call('Platform clear','+'+total+' · PATCHED UP · +1 FRAG · MORE ON THE WAY');
      }else{
        G.score+=Math.round(600*D().score);
        waveClearReward();
        call('Platform clear','THE TRAIN IS COMING — STAY ALIVE');
      }
      beep(560,0.3,'sine',0.15,780);hud();
    }
  }else if(G.phase==='gap'){
    G.gap-=dt;
    if(G.gap<=0){if(G.mode==='endless'||G.wave<STORY_WAVES)startWave(G.wave+1);else beginBoarding();}
  }else if(G.phase==='board'){
    G.trainT+=dt;
    var p=Math.min(1,G.trainT/9.5),ease=1-Math.pow(1-p,3);
    train.position.z=-190+190*ease;
    if(!G.brake&&G.trainT>6.4){G.brake=true;noiseBurst(1.6,2600,0.24,300);beep(1400,1.4,'sine',0.06,420);}
    if(p>=1){
      G.doors=Math.min(1,G.doors+dt*0.85);
      for(var i=0;i<doorsL.length;i++){
        doorsL[i].position.z=doorsL[i].userData.home-G.doors*1.28;
        doorsR[i].position.z=doorsR[i].userData.home+G.doors*1.28;
      }
      boardMarker.material.opacity=0.35+Math.sin(G.time*4)*0.2;
      boardMarker.position.z=clamp(Math.round(P.z/19),-1,1)*19;
      if(G.doors>0.75){
        var dz=[-19,0,19],near=false;
        for(var k=0;k<3;k++)if(Math.abs(P.z-dz[k])<2.1)near=true;
        if(near&&P.x>-3.5)finish(true);
      }
    }
    G.spawnT-=dt;
    if(G.spawnT<=0&&stragglers<7&&enemies.length<5&&G.doors<0.75){
      var r=Math.random();
      spawnOne(r<0.55?'drone':(r<0.8?'sentry':'charger'));stragglers++;G.spawnT=2.4;
    }
  }
}

/* ============================ screen feedback ============================ */
function screenFx(dt){
  var spread=3+weaponSpread()*innerHeight/(4*Math.tan(camera.fov*Math.PI/360))+P.kick*2;
  var ch=$('crosshair').children;
  ch[0].style.transform='translateY('+(-spread)+'px)';
  ch[1].style.transform='translateY('+spread+'px)';
  ch[2].style.transform='translateX('+(-spread)+'px)';
  ch[3].style.transform='translateX('+spread+'px)';
  $('crosshair').style.opacity=!gunRig.visible?'0':(P.ads>0.75?'0.75':'1');
  $('crosshair').classList.toggle('on-target',!!P.aimTarget);
  $('hitmark').style.opacity=G.hitFlash>0?'1':'0';
  $('hurt').style.opacity=String(Math.min(0.9,G.hurtFlash*1.6));
  $('low').className=P.hp<=30?'on':'';
  $('low').style.opacity=P.hp<=30?'1':'0';
  $('reloadfill').style.width=(P.reload>0?(1-P.reload/(P._reloadTotal||1.55))*100:0)+'%';
  var alert='';
  if(P.reload>0)alert='RELOADING';
  else if(P.ammo===0&&P.reserve===0)alert='NO ROUNDS LEFT — FIND A CRATE';
  else if(G.phase==='board'&&G.doors>0.75)alert='DOORS OPEN — GET ON';
  else{
    for(var i=0;i<enemies.length;i++){
      if(enemies[i].charge>0.6){alert='INCOMING';break;}
      if(enemies[i].cfg.boom&&Math.hypot(enemies[i].x-P.x,enemies[i].z-P.z)<7){alert='CHARGER — KEEP YOUR DISTANCE';break;}
    }
  }
  $('alert').textContent=alert;
  var hint='';
  if(G.phase==='gap')hint=Math.ceil(G.gap)+'s until the next wave';
  else if(G.phase==='board'&&G.doors<0.75)hint='Train arriving on platform 4';
  else if(G.time<14&&G.wave===1)hint=(touchControlsActive?'FRAG button throws a grenade':'G throws a frag')+' · shoot the red barrels';
  $('hint').textContent=hint;
}
function hud(){
  $('hp').textContent=Math.ceil(P.hp);
  $('barfill').style.width=P.hp+'%';
  $('barfill').style.background=P.hp<=30?'#e2452c':(P.hp<=60?'#e8a33d':'#57b391');
  if($('shieldval'))$('shieldval').textContent=Math.ceil(P.shield);
  if($('shieldfill'))$('shieldfill').style.width=(P.shield/P.maxShield*100)+'%';
  var cur=P.curWpn,wcfg=WEAPONS[cur],wstate=P.wpnState[cur];
  $('ammo').innerHTML=wstate.ammo+'<em>/'+wstate.reserve+'</em>';
  $('gunline').textContent=wcfg.name+' • '+wcfg.sub;
  $('score').textContent=String(G.score).padStart(5,'0');
  var wv=Math.max(1,G.wave);
  $('waveline').textContent=G.phase==='board'?'BOARDING':(G.mode==='endless'?'OVERTIME · WAVE '+String(wv).padStart(2,'0'):'WAVE '+String(wv).padStart(2,'0')+' OF '+String(STORY_WAVES).padStart(2,'0'));
  var pending=enemies.length+G.queue.length;
  $('left').textContent=G.phase==='board'?'train inbound':(pending?pending+(pending===1?' unit active':' units active'):'platform clear');
  var pips=$('pips').children;
  var lit=G.mode==='endless'?((wv-1)%5)+1:G.wave;
  for(var i=0;i<5;i++)pips[i].className=i<lit?'on':'';
  var np=$('nades');
  if(np){
    var pipEls=np.getElementsByTagName('i');
    for(var ni=0;ni<pipEls.length;ni++)pipEls[ni].className=ni<P.nades?'on':'';
    np.classList.toggle('throw',P.nadeT>0);
  }
  var tn=$('t-nade-count');if(tn)tn.textContent='FRAG '+P.nades;
  var tb=$('t-nade');if(tb)tb.classList.toggle('empty',P.nades<=0);

  for(var wi=0;wi<WEAPONS.length;wi++){
    var card=$('wc-'+wi),cnt=$('wc-ammo-'+wi);
    if(card)card.className='wcard'+(wi===cur?' active':'');
    if(cnt)cnt.textContent=P.wpnState[wi].ammo+'/'+P.wpnState[wi].reserve;
  }
}

/* ============================ minimap ============================ */
var mapCtx=$('map').getContext('2d');
/* Round minimap, drawn the way a driving game draws one: clipped to a circle, centred on the
   player and rotated so the way you are facing is always up. Everything inside is world space in
   metres, scaled by MAP_PPM, so the map pans and turns under a fixed player marker. */
var MAP_SIZE=220,MAP_PPM=7.4;                 /* canvas pixels, and pixels per metre */
function drawMap(){
  var w=MAP_SIZE,h=MAP_SIZE,cx=w/2,cy=h/2,R=w/2-3;
  mapCtx.clearRect(0,0,w,h);
  mapCtx.save();
  mapCtx.beginPath();mapCtx.arc(cx,cy,R,0,TAU);mapCtx.clip();
  mapCtx.fillStyle='rgba(8,11,12,.72)';mapCtx.fillRect(0,0,w,h);

  mapCtx.save();
  mapCtx.translate(cx,cy);
  mapCtx.rotate(P.yaw);                        /* heading up */
  mapCtx.translate(-P.x*MAP_PPM,-P.z*MAP_PPM);
  function X(x){return x*MAP_PPM;}
  function Y(z){return z*MAP_PPM;}
  /* the platform slab and the platform edge along the track */
  mapCtx.fillStyle='rgba(150,175,168,.14)';
  mapCtx.fillRect(X(-10.6),Y(Z0+1),X(-1.4)-X(-10.6),Y(Z1-1)-Y(Z0+1));
  mapCtx.strokeStyle='rgba(216,164,74,.55)';mapCtx.lineWidth=2;
  mapCtx.beginPath();mapCtx.moveTo(X(-1.4)+3,Y(Z0+1));mapCtx.lineTo(X(-1.4)+3,Y(Z1-1));mapCtx.stroke();
  /* pillars, benches and anything else solid at chest height */
  mapCtx.fillStyle='rgba(178,200,192,.34)';
  for(var i=0;i<COL.length;i++){
    var c=COL[i];
    if(c.ghost||c.min[0]<-10.9||c.max[0]>-1.2||c.min[1]>1.5)continue;
    mapCtx.fillRect(X(c.min[0]),Y(c.min[2]),Math.max(2,X(c.max[0])-X(c.min[0])),Math.max(2,Y(c.max[2])-Y(c.min[2])));
  }
  for(var k=0;k<pickups.length;k++){
    mapCtx.fillStyle=pickups[k].kind==='ammo'?'#d8a44a':'#6fbf9b';
    mapCtx.beginPath();mapCtx.arc(X(pickups[k].x),Y(pickups[k].z),3.4,0,TAU);mapCtx.fill();
  }
  for(var e=0;e<enemies.length;e++){
    var en=enemies[e];
    mapCtx.fillStyle=en.type==='heavy'?'#ff9a6c':'#d4503a';
    mapCtx.beginPath();mapCtx.arc(X(en.x),Y(en.z),en.type==='heavy'?5:3.8,0,TAU);mapCtx.fill();
  }
  mapCtx.restore();

  /* the player never moves: a fixed arrow at the centre, always pointing up */
  mapCtx.fillStyle='#f2f4f2';
  mapCtx.beginPath();mapCtx.moveTo(cx,cy-8);mapCtx.lineTo(cx+5.5,cy+6);mapCtx.lineTo(cx,cy+3);
  mapCtx.lineTo(cx-5.5,cy+6);mapCtx.closePath();mapCtx.fill();
  /* edge falloff so the clipped world does not end on a hard line */
  var vg=mapCtx.createRadialGradient(cx,cy,R*0.62,cx,cy,R);
  vg.addColorStop(0,'rgba(8,11,12,0)');vg.addColorStop(1,'rgba(8,11,12,.55)');
  mapCtx.fillStyle=vg;mapCtx.fillRect(0,0,w,h);
  mapCtx.restore();

  /* rim, and a north tick so the platform's orientation stays readable */
  mapCtx.strokeStyle='rgba(255,255,255,.16)';mapCtx.lineWidth=2;
  mapCtx.beginPath();mapCtx.arc(cx,cy,R,0,TAU);mapCtx.stroke();
  var na=-P.yaw-Math.PI/2;
  mapCtx.strokeStyle='rgba(216,164,74,.85)';mapCtx.lineWidth=2.5;
  mapCtx.beginPath();
  mapCtx.moveTo(cx+Math.cos(na)*(R-1),cy+Math.sin(na)*(R-1));
  mapCtx.lineTo(cx+Math.cos(na)*(R-7),cy+Math.sin(na)*(R-7));
  mapCtx.stroke();
}


/* ============================ flow ============================ */
/* ---- best scores, kept per mode in localStorage ---- */
var BEST={story:0,storyWin:false,endless:0,endlessWave:0};
try{var sb=JSON.parse(localStorage.getItem('lt-best-v1')||'null');if(sb&&typeof sb==='object'){for(var bk in BEST)if(sb[bk]!==undefined)BEST[bk]=sb[bk];}}catch(err){}
function saveBest(){try{localStorage.setItem('lt-best-v1',JSON.stringify(BEST));}catch(err){}}
function bestText(){
  var a=BEST.story?('Subway FPS best <b>'+BEST.story.toLocaleString()+'</b>'+(BEST.storyWin?' · made the train':'')):'Subway FPS best <b>—</b>';
  var b=BEST.endless?('Overtime best <b>wave '+BEST.endlessWave+'</b> · '+BEST.endless.toLocaleString()):'Overtime best <b>—</b>';
  return a+'<br>'+b;
}
function refreshBest(){
  var l1=$('bestline'),l2=$('bestline2');
  if(l1)l1.innerHTML=bestText();
  if(l2)l2.innerHTML=bestText();
}
refreshBest();

function begin(mode){
  clearImpactMarks();
  audioOn();clearField();
  G.mode=(mode==='endless'||(mode!=='story'&&G.mode==='endless'))?'endless':'story';
  P.x=-6;P.z=32;P.y=0;P.vy=0;P.yaw=0;P.pitch=0;P.hp=100;P.shield=P.maxShield;
  P.reload=0;P.fireCd=0;P.ads=0;P.bob=0;P.inv=1.2;P.shake=0;P.kick=0;P.slideT=0;P.barrelHeat=0;
  P.pumpT=0;P.inspectT=0;P.switchT=0;P.lastHurt=99;P.landPunch=0;P.grounded=true;
  P.nades=2;P.nadeT=0;P._nadeSpawn=0;
  if(typeof clearImpactMarks==='function')clearImpactMarks();
  P.crouch=0;P.slideCd=0;P.crouchHeld=false;P.jumpHeld=false;P.jumpBuffer=0;P.aimTarget=null;P.swaySpring=null;
  gunRig.visible=true;resetTouchState();
  /* every weapon comes back fully stocked and the carbine is in hand */
  for(var wi=0;wi<WEAPONS.length;wi++){
    P.wpnState[wi].ammo=WEAPONS[wi].magMax;P.wpnState[wi].reserve=WEAPONS[wi].reserveMax;
    wpnMeshes[wi].visible=(wi===0);
  }
  P.curWpn=0;P.nextWpn=0;P.lastWpn=1;gun=wpnMeshes[0];
  P.ammo=P.wpnState[0].ammo;P.reserve=P.wpnState[0].reserve;
  G.state='play';startAmbience();G.score=0;G.kills=0;G.shots=0;G.hits=0;G.time=0;G.phase='wave';
  G.doors=0;G.trainT=0;G.hitFlash=0;G.hurtFlash=0;G.combo=0;G.comboT=0;G.lastKillT=-9;G.feedT=0;
  G.killTimes=[];G.streakN=0;G.hpScale=1;G.dmgScale=1;G.spdScale=1;G.queue=[];G.hudDirty=false;
  $('combo').style.opacity='0';$('hitfeed').style.opacity='0';$('medal').className='';
  resetBarrels();
  train.position.z=-190;boardMarker.material.opacity=0;
  for(var i=0;i<doorsL.length;i++){doorsL[i].position.z=doorsL[i].userData.home;doorsR[i].position.z=doorsR[i].userData.home;}
  $('menu').hidden=true;$('paused').hidden=true;$('over').hidden=true;
  $('hud').hidden=false;updateTouchUI();updateMobileWpnBadge();
  startWave(1);
  hud();grab();
  /* the Start tap is a user gesture, so phones can go fullscreen and lock to landscape here */
  if(touchControlsActive&&!isFullscreen())enterFullscreen(true);
}
function grab(){
  if(coarse||touchControlsActive)return;
  if(canvas.requestPointerLock){
    var r=canvas.requestPointerLock();
    if(r&&r.catch)r.catch(function(){});
  }
}
function pause(){
  if(G.state!=='play')return;
  G.state='pause';keys={};mouseDown=false;joy.x=joy.y=0;touchRun=false;
  resetTouchState();
  $('paused').hidden=false;$('touch').className='';
  if(document.pointerLockElement)document.exitPointerLock();
  $('resume').focus();
}
function unpause(){
  if(G.state!=='pause')return;
  audioOn();G.state='play';$('paused').hidden=true;updateTouchUI();
  keys={};mouseDown=false;grab();
}
function finish(win){
  if(G.state!=='play')return;
  G.state='over';keys={};mouseDown=false;joy.x=joy.y=0;
  resetTouchState();
  $('hud').hidden=true;$('touch').className='';$('over').hidden=false;
  $('hurt').style.opacity='0';$('low').style.opacity='0';
  if(win)G.score+=Math.round(Math.max(0,1200-Math.floor(G.time)*4)*D().score);
  var endless=G.mode==='endless';
  var newBest=false;
  if(endless){
    if(G.score>BEST.endless||G.wave>BEST.endlessWave){newBest=G.score>BEST.endless;BEST.endless=Math.max(BEST.endless,G.score);BEST.endlessWave=Math.max(BEST.endlessWave,G.wave);}
  }else{
    if(G.score>BEST.story){newBest=true;BEST.story=G.score;}
    if(win)BEST.storyWin=true;
  }
  saveBest();refreshBest();
  $('newbest').className=newBest?'on':'';
  $('overline').textContent=endless?'Overrun':(win?'Doors closing':'End of the line');
  var title=endless?('Held for '+G.wave+(G.wave===1?' wave':' waves')):(win?'You made the train':'Signal lost');
  $('overtitle').childNodes[0].textContent=title;
  $('overtext').textContent=endless?('No train was ever coming. The machines took the platform back on wave '+G.wave+' · '+DIFFS[diffKey].label+'.')
    :(win?'The station is behind you. The platform stays with the machines.'
    :'The units still own the platform. The 04:12 left without you.');
  $('f-score').textContent=G.score.toLocaleString();
  $('f-kills').textContent=G.kills;
  $('f-acc').textContent=(G.shots?Math.round(G.hits/G.shots*100):0)+'%';
  $('f-wave').textContent=G.wave;
  $('f-time').textContent=Math.floor(G.time/60)+':'+String(Math.floor(G.time%60)).padStart(2,'0');
  if(document.pointerLockElement)document.exitPointerLock();
  if(win){beep(520,0.2,'triangle',0.24,780);setTimeout(function(){beep(780,0.5,'triangle',0.22,1040);},180);}
  else{beep(190,0.6,'sawtooth',0.3,44);}
  $('again').focus();
}
function toTitle(){
  G.state='menu';clearField();resetTouchState();
  $('menu').hidden=false;$('hud').hidden=true;$('paused').hidden=true;$('over').hidden=true;$('touch').className='';
  $('hurt').style.opacity='0';$('low').style.opacity='0';
  if(document.pointerLockElement)document.exitPointerLock();
  $('start').focus();
}

