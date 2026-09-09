/* Last Train — player.js
   Player and match state, waves tables, shooting, grenades, damage intake and the per-frame update.
   All game scripts share one global scope and load in the order listed in index.html. */
'use strict';

/* ============================ state ============================ */
var P={x:-6,z:32,y:0,vy:0,yaw:0,pitch:0,hp:100,shield:50,maxShield:50,ammo:30,reserve:120,reload:0,fireCd:0,
       curWpn:0,lastWpn:1,switchT:0,pumpT:0,inspectT:0,_pumpSoundPlayed:false,
       wpnState:[
         {ammo:30,reserve:120},
         {ammo:8, reserve:40},
         {ammo:36,reserve:160},
         {ammo:4, reserve:20},
         {ammo:15,reserve:90}
       ],
       nades:2,nadeMax:4,nadeT:0,_nadeSpawn:0,
       ads:0,bob:0,step:0,inv:0,grounded:true,shake:0,kick:0,kickY:0,speedFade:0,lastHurt:0};
var mouseVelX=0,mouseVelY=0,swayX=0,swayY=0;
var G={state:'menu',mode:'story',wave:0,score:0,kills:0,shots:0,hits:0,time:0,phase:'wave',combo:0,comboT:0,lastKillT:0,
       queue:[],spawnT:0,gap:0,trainT:0,doors:0,hitFlash:0,hurtFlash:0,callT:0,brake:false,
       killTimes:[],streakN:0,hpScale:1,dmgScale:1,spdScale:1,hudDirty:false,feedT:0};
var _elCrosshair, _elScopeVignette, _elSniperScope;
var _laserFrom = new THREE.Vector3();
var _laserUp = new THREE.Vector3(0, 1, 0);
var WAVES=[
  ['drone','drone','sprint','drone','sentry'],
  ['sprint','drone','charger','drone','sentry','sprint','charger','drone','sentry'],
  ['drone','sentry','sprint','charger','warden','drone','sentry','sprint','charger','drone','sentry'],
  ['sprint','sentry','charger','drone','heavy','sprint','warden','drone','sentry','charger','drone','sprint','sentry','charger','drone'],
  ['sprint','drone','sentry','charger','heavy','warden','sprint','sentry','charger','drone','heavy','sprint','warden','sentry','charger','drone','sprint','charger','sentry','drone']
];
var MAXALIVE=[5,6,8,9,11];
var STORY_WAVES=WAVES.length;
function maxAlive(){
  if(G.mode==='endless')return Math.min(14,5+G.wave);
  return MAXALIVE[Math.min(MAXALIVE.length,Math.max(1,G.wave))-1];
}
/* Overtime: waves are rolled from a weighted pool that leans harder every round, and every
   unit gets a little tougher, meaner and quicker than the last batch. */
function genWave(n){
  var pool=[
    ['drone',5],
    ['sprint',1.5+n*0.35],
    ['sentry',n>=2?1.2+n*0.40:0.6],   /* the opening wave is mostly melee so you can learn the room */
    ['charger',n>=2?1+n*0.45:0],
    ['heavy',n>=3?0.4+n*0.22:0],
    ['warden',n>=3?0.35+n*0.18:0]
  ];
  var total=0,k;
  for(k=0;k<pool.length;k++)total+=pool[k][1];
  var count=Math.min(30,7+n*2),out=[];
  for(var i=0;i<count;i++){
    var r=Math.random()*total,acc=0;
    for(k=0;k<pool.length;k++){acc+=pool[k][1];if(r<=acc){out.push(pool[k][0]);break;}}
  }
  /* shuffle, then make sure the first three units of a wave are never the nasty ones */
  for(var j=out.length-1;j>0;j--){var q=Math.floor(Math.random()*(j+1)),tmp=out[j];out[j]=out[q];out[q]=tmp;}
  var light=[],nasty=[];
  for(k=0;k<out.length;k++)(out[k]==='drone'||out[k]==='sprint'?light:nasty).push(out[k]);
  var head=light.splice(0,3);
  var rest=light.concat(nasty);
  for(j=rest.length-1;j>0;j--){var q2=Math.floor(Math.random()*(j+1)),tmp2=rest[j];rest[j]=rest[q2];rest[q2]=tmp2;}
  return head.concat(rest);
}
var _fwdArr = [0, 0, 0];
function forward(y,p){ var cp=Math.cos(p); _fwdArr[0]=-Math.sin(y)*cp; _fwdArr[1]=Math.sin(p); _fwdArr[2]=-Math.cos(y)*cp; return _fwdArr; }

function call(title,sub){
  $('calltitle').textContent=title;$('callsub').textContent=sub;
  $('call').style.opacity='1';G.callT=3.2;
}
function startWave(n){
  sfxPAChime();
  G.wave=n;G.spawnT=0.6;G.phase='wave';
  if(G.mode==='endless'){
    G.hpScale = Math.min(2.4, 1 + Math.log2(Math.max(1,n)) * 0.18);
    G.dmgScale=Math.min(1.9,1+(n-1)*0.03);
    G.spdScale=Math.min(1.22,1+(n-1)*0.012);
    G.queue=genWave(n);
    call('Overtime · wave '+n,n===1?'NO TRAIN IS COMING. HOLD AS LONG AS YOU CAN':(G.queue.length+' UNITS COMING UP THE TUNNEL'));
  }else{
    G.queue=WAVES[n-1].slice();
    call('Wave '+n,n===STORY_WAVES?'LAST ONE — HOLD THE PLATFORM':'UNITS COMING UP THE TUNNEL');
  }
  seedPickups();
  beep(400,0.3,'sine',0.16,620);
  hud();
}
function spawnOne(type){
  var best=null,bestD=-1;
  var candidates=[];
  for(var i=0;i<SPAWNS.length;i++){
    var s=SPAWNS[i],d=Math.hypot(s[0]-P.x,s[1]-P.z);
    if(!blockedAt(s[0],s[1],0.5)){
      candidates.push(s);
      var jitter=d+Math.random()*6;
      if(jitter>bestD){bestD=jitter;best=s;}
    }
  }
  if(!best)best=[-6,Z0+4];
  if(Math.random()<0.3&&candidates.length>1){
    best=candidates[Math.floor(Math.random()*candidates.length)];
  }
  enemies.push(makeEnemy(type,best[0]+(Math.random()-0.5)*1.4,best[1]+(Math.random()-0.5)*1.4));
}

/* ============================ shooting & arsenal mechanics ============================ */
function switchWeapon(idx){
  if(idx<0||idx>=WEAPONS.length||idx===P.curWpn||P.switchT>0||P.nadeT>0)return;
  P.reload=0;
  P.lastWpn=P.curWpn;
  P.nextWpn=idx;
  P.switchT=0.26;
  sfxSwitch();
  if(typeof updateMobileWpnBadge==='function')updateMobileWpnBadge();
}
/* Every top-level var and function in these scripts is a global, so there is no need to
   copy anything onto window; the console (and the test harness) can reach P, G, enemies,
   killEnemy, throwNade and friends directly. */
function inspectWeapon(){
  if(P.inspectT<=0&&P.reload<=0&&P.switchT<=0){P.inspectT=1.35;sfxInspect();}
}

function reload(){
  if(G.state!=='play'||P.reload>0||P.switchT>0||P.nadeT>0)return;
  var cur=P.curWpn,wcfg=WEAPONS[cur],wstate=P.wpnState[cur];
  if(wstate.ammo>=wcfg.magMax||wstate.reserve<=0)return;
  var isTac=wstate.ammo>0;
  P._reloadIsDry=!isTac;
  P._reloadTotal=isTac?wcfg.reloadTac:wcfg.reloadDry;
  P.reload=P._reloadTotal;
  P._reloadStage=0;
  P._shellFeedSound=false;
  P.inspectT=0;
  hud();
}

var _shotDir = new THREE.Vector3();
var _shotStart = new THREE.Vector3();
function shoot(){
  if(G.state!=='play'||P.reload>0||P.fireCd>0||P.switchT>0||P.nadeT>0.25)return;
  var cur=P.curWpn,wcfg=WEAPONS[cur],wstate=P.wpnState[cur];
  if(wcfg.semi){if(P._semiLatch)return;P._semiLatch=true;}   /* semi-automatic: one round per press, released in update() */
  if(wstate.ammo<=0){
    if(wstate.reserve>0)reload();
    else beep(140,0.05,'square',0.09,90);
    P.fireCd=0.18;
    return;
  }
  wstate.ammo--;P.ammo=wstate.ammo;P.fireCd=wcfg.fireRate+Math.min(0,P.fireCd);G.shots++;
  if(cur===1){P.pumpT=0.35;P._pumpSoundPlayed=false;}
  triggerHaptic([14, [28,20,20], 9, [45,25,60]][cur] || 14);

  // Audio, casing ejection & barrel heating
  sfxShot(cur);
  spawnCasing(wcfg.casingType);
  if(!P.barrelHeat)P.barrelHeat=0;
  P.barrelHeat=Math.min(1.0, P.barrelHeat + (cur===2 ? 0.08 : (cur===1 ? 0.25 : 0.12)));

  var pellets=wcfg.pellets||1;
  // Shoot from the rendered camera before recoil, including crouch and camera bob.
  camera.updateMatrixWorld(true);
  var aimDir=camera.getWorldDirection(_shotDir);
  var shotYaw=Math.atan2(-aimDir.x,-aimDir.z),shotPitch=Math.asin(clamp(aimDir.y,-1,1));
  var shotSpread=weaponSpread();
  var ox=camera.position.x,oy=camera.position.y,oz=camera.position.z;
  P.inspectT=0;
  var shotStart=_shotStart.copy(shotMuzzle());
  spawnMuzzleSmoke(cur,shotStart);
  if(typeof gunMuzzleLight!=='undefined')gunMuzzleLight.intensity=cur===1?6.0:(cur===3?8.0:4.0);
  if(wcfg.tracerCol===0x00ffff)flash.material.color.setHex(0x55ffff);
  else if(cur===1)flash.material.color.setHex(0xffaa44);
  else flash.material.color.setHex(0xffcf88);
  muzzleFlashFx(cur,P.ads);

  /* the world light sits just ahead of the muzzle socket, so it lights what the barrel points at */
  muzzleLight.position.copy(muzzleState.world).addScaledVector(muzzleState.dir,0.35);
  muzzleLight.intensity=cur===1?4.5:(cur===3?6:3.2);
  P.kick=wcfg.recoilKick;
  P.kickY=0.6+Math.random()*0.3;
  P.pitch=Math.min(1.25,P.pitch+wcfg.recoilPitch*(1-P.ads*0.55));
  P.yaw+=wcfg.recoilYaw*(1-P.ads*0.6)*(0.7+Math.random()*0.3)*(Math.random()>0.5?1:-1);
  P.shake=Math.max(P.shake,cur===1?0.18:(cur===3?0.24:0.09));
  if(!gunRig.visible){var scEl2=$('sniper-scope');if(scEl2){scEl2.classList.remove('kick');void scEl2.offsetWidth;scEl2.classList.add('kick');}}

  /* APEX-50 RAILGUN PIERCING BEAM WITH HYPERSONIC TRACER */
  if(wcfg.pierce){
    var f=forward(shotYaw,shotPitch);
    var wallDist=rayWorld(ox,oy,oz,f[0],f[1],f[2]);
    var hits=[];
    for(var i=0;i<enemies.length;i++){
      var e=enemies[i],s=hitSpheres(e);
      var th=raySphere(ox,oy,oz,f[0],f[1],f[2],s.hx,s.hy,s.hz,s.hr);
      var tb=raySphere(ox,oy,oz,f[0],f[1],f[2],s.bx,s.by,s.bz,s.br);
      var tl=raySphere(ox,oy,oz,f[0],f[1],f[2],s.lx,s.ly,s.lz,s.lr);
      var t=Math.min(th,tb,tl);
      if(t<wallDist){
        hits.push({e:e,dist:t,zone:(t===th)?'head':(t===tb?'body':'legs')});
      }
    }
    hits.sort(function(a,b){return a.dist-b.dist;});
    for(var bi=0;bi<barrels.length;bi++){
      var bObj=barrels[bi];
      if(bObj.alive&&raySphere(ox,oy,oz,f[0],f[1],f[2],bObj.x,bObj.y+0.44,bObj.z,0.48)<wallDist)
        damageBarrel(bObj,wcfg.dmgBody);
    }
    var beamEnd=wallDist;
    for(var hi=0;hi<hits.length;hi++){
      var h=hits[hi];
      var dmg=h.zone==='head'?wcfg.dmgHead:(h.zone==='legs'?wcfg.dmgLegs:wcfg.dmgBody);
      var res=applyHit(h.e,dmg,h.zone,ox+f[0]*h.dist,oy+f[1]*h.dist,oz+f[2]*h.dist,f[0],f[2],hi===0,true);
      if(res==='shield'){beamEnd=h.dist;break;}   /* a raised shield soaks the beam */
    }
    var hx=ox+f[0]*beamEnd,hy=oy+f[1]*beamEnd,hz=oz+f[2]*beamEnd;
    spawn3DTracer(shotStart.x,shotStart.y,shotStart.z,hx,hy,hz,3);
    if(beamEnd<200)railImpactFx(hx,hy,hz);
    if(beamEnd===wallDist&&wallDist<200)surfaceImpact(hx,hy,hz,3);
  }else{
    /* STANDARD & SHOTGUN 3D SUPERSONIC BALLISTICS SPREAD */
    var shotgunAnyHit=false;
    for(var p=0;p<pellets;p++){
      var spread=shotSpread;
      var radius=Math.sqrt(Math.random())*spread*.5,angle=Math.random()*TAU;
      var f=forward(shotYaw+Math.cos(angle)*radius,shotPitch+Math.sin(angle)*radius);
      var dist=rayWorld(ox,oy,oz,f[0],f[1],f[2]),target=null,zone='body',targetBarrel=null;
      for(var bi=0;bi<barrels.length;bi++){
        var bObj=barrels[bi];
        if(bObj.alive){
          var tb=raySphere(ox,oy,oz,f[0],f[1],f[2],bObj.x,bObj.y+0.44,bObj.z,0.48);
          if(tb<dist){dist=tb;target=null;targetBarrel=bObj;}
        }
      }
      for(var i=0;i<enemies.length;i++){
        var e=enemies[i],s=hitSpheres(e);
        var th=raySphere(ox,oy,oz,f[0],f[1],f[2],s.hx,s.hy,s.hz,s.hr);
        var tb=raySphere(ox,oy,oz,f[0],f[1],f[2],s.bx,s.by,s.bz,s.br);
        var tl=raySphere(ox,oy,oz,f[0],f[1],f[2],s.lx,s.ly,s.lz,s.lr);
        var t=Math.min(th,tb,tl);
        if(t<dist){dist=t;target=e;targetBarrel=null;zone=(t===th)?'head':(t===tb?'body':'legs');}
      }
      var hx=ox+f[0]*dist,hy=oy+f[1]*dist,hz=oz+f[2]*dist;
      if(!target&&!targetBarrel&&dist<200)surfaceImpact(hx,hy,hz,cur);
      var mx=ox+f[0]*0.6+Math.cos(shotYaw)*0.12*(1-P.ads);
      var my=oy-0.14+P.ads*0.08;
      var mz=oz+f[2]*0.6-Math.sin(shotYaw)*0.12*(1-P.ads);

      var isFirst=false;
      if(target&&!shotgunAnyHit){shotgunAnyHit=true;isFirst=true;}

      (function(curTgt,curBarrel,cZone,hitX,hitY,hitZ,isFirstPellet,fx,fz){
        spawn3DTracer(shotStart.x,shotStart.y,shotStart.z,hitX,hitY,hitZ,cur,function(){
          if(curBarrel){
            damageBarrel(curBarrel,wcfg.dmgBody);
          }else if(curTgt){
            var dmg=cZone==='head'?wcfg.dmgHead:(cZone==='legs'?wcfg.dmgLegs:wcfg.dmgBody);
            var r=applyHit(curTgt,dmg,cZone,hitX,hitY,hitZ,fx,fz,isFirstPellet,false);
            if(r==='hit'){
              curTgt.knockVx=fx*(cur===1?4.5:2.0);
              curTgt.knockVz=fz*(cur===1?4.5:2.0);
            }
          }
        });
      })(target,targetBarrel,zone,hx,hy,hz,cur===1?isFirst:(p===0),f[0],f[2]);
    }
  }
  hud();
}

/* Scope sway: slow breathing plus a fine tremor. Shift holds the breath for about three seconds
   (nearly still), after which the sight shakes until you let go. Crouching halves the sway and
   moving doubles it. Returns radians to add to the camera pitch and yaw. */
var scopePhase=0,scopeHoldT=0,scopeSwayAmp=1;
var _swayResult = {y:0, p:0};
function scopeDrift(dt){
  scopePhase+=dt;
  var holding=!!(keys['ShiftLeft']||keys['ShiftRight']);
  scopeHoldT=holding?scopeHoldT+dt:Math.max(0,scopeHoldT-dt*2);
  scopeHoldT = Math.min(scopeHoldT, 4.5);
  var winded=scopeHoldT>3.2;
  var target=(P.crouch>0.5?0.5:1)*(walkSpeed>0.3?2.2:1)*(winded?2.0:(holding?0.15:1));
  scopeSwayAmp=slerp(scopeSwayAmp,target,6,dt);
  var y=(Math.sin(scopePhase*0.9)*0.0030+Math.sin(scopePhase*2.3)*0.0011+Math.sin(scopePhase*13)*0.00022)*scopeSwayAmp;
  var p=(Math.cos(scopePhase*0.7)*0.0022+Math.sin(scopePhase*1.9)*0.0009+Math.cos(scopePhase*11)*0.00022)*scopeSwayAmp;
  var lbl=$('scopebreath');
  if(lbl){var txt=winded?'BREATHE':(holding?'HOLDING · STEADY':'SHIFT · HOLD BREATH');if(lbl.textContent!==txt)lbl.textContent=txt;lbl.classList.toggle('warn',winded);}
  _swayResult.y=y; _swayResult.p=p; return _swayResult;
}
function weaponSpread(){
  var w=WEAPONS[P.curWpn],steady=P.ads>0.95&&walkSpeed<0.1&&P.grounded;
  var base=steady&&w.pellets===1?0:w.spreadBase;
  return (base+walkSpeed*w.spreadWalk+(P.grounded?0:w.spreadAir)+P.kick*.004)*(1-P.ads*(w.pellets>1?0.22:0.85))*(P.crouch>0.5?0.75:1);
}

/* One place where a bullet meets a machine. Returns 'dead' (target was already gone),
   'shield' (a warden's shield took it) or 'hit'. */
function applyHit(e,dmg,zone,hx,hy,hz,fx,fz,isFirst,rail){
  if(!e||e.dead)return 'dead';
  G.hits++;
  var feedEl=$('hitfeed');
  if(e.cfg.shield&&e.shieldDown<=0&&zone!=='legs'){
    /* dot(-shotDir, facing): the shield covers a ±66° cone in front of the warden */
    var toShooter=-(fx*Math.sin(e.face)+fz*Math.cos(e.face));
    if(toShooter>0.40){
      e.shieldHp-=dmg;e.shieldFlash=0.22;
      spark(hx,hy,hz,rail?18:6,0.3,0.9,1.0,3.5,2.0);
      sfxAt(e.x,e.z,sfxShieldHit);
      dmgNum(hx,hy+0.1,hz,dmg,'block',e);
      if(isFirst){G.hitFlash=0.10;$('hitmark').className='blocked';}
      if(e.shieldHp<=0)breakShield(e);
      return 'shield';
    }
  }
  e.flinch=0.22;e.hp-=dmg;e.flash=0.18;e.lastZone=zone;
  elecSpark(hx,hy,hz);
  dmgNum(hx,hy+0.12,hz,dmg,rail?'rail':(zone==='head'?'head':''),e);
  if(isFirst){
    G.hitFlash=zone==='head'?0.22:0.12;
    G.hitFlash=Math.max(G.hitFlash, 0.15);
    $('hitmark').className=zone==='head'?'headshot':'';
    sfxHit(zone==='head');
    if(zone==='head'){feedEl.textContent=rail?'RAIL HEADSHOT':'HEADSHOT';feedEl.style.color=rail?'#00ffff':'#ff4030';feedEl.style.opacity='1';G.feedT=0.8;}
    else if(rail){feedEl.textContent='RAIL PIERCE';feedEl.style.color='#00ffff';feedEl.style.opacity='1';G.feedT=0.7;}
  }
  spark(hx,hy,hz,zone==='head'?14:7,1,0.4,0.12,3.5,2.5);
  if(e.hp<=0)killEnemy(e);
  return 'hit';
}
function breakShield(e){
  e.shieldHp=0;e.shieldDown=5.5;e.stagger=1.1;
  if(e.plate)e.plate.visible=false;
  sfxAt(e.x,e.z,sfxShieldBreak);
  spark(e.x,1.2*e.cfg.scale,e.z,34,0.3,0.9,1.0,6,4);
  dmgNum(e.x,1.9*e.cfg.scale,e.z,'SHIELD DOWN','block');
  var feedEl=$('hitfeed');
  feedEl.textContent='SHIELD DOWN';feedEl.style.color='#5fe8ff';feedEl.style.opacity='1';G.feedT=0.9;
}

/* ============================ frag grenades ============================ */
var nades=[];
var nadeGeo=new THREE.SphereGeometry(0.085,10,8);
var nadeMat=new THREE.MeshStandardMaterial({color:0x1d2a26,roughness:0.5,metalness:0.7});
function throwNade(){
  if(G.state!=='play'||P.nades<=0||P.nadeT>0||P.reload>0||P.switchT>0)return;
  P.nades--;P.nadeT=0.62;P._nadeSpawn=0.2;
  sfxNadeThrow();triggerHaptic(18);
  hud();
}
function spawnNadeNow(){
  var f=forward(P.yaw,P.pitch);
  var m=new THREE.Mesh(nadeGeo,nadeMat);m.castShadow=true;
  var led=glow(0,0.07,0,0.26,0xff3020,0.9,m);
  var ox=P.x+f[0]*0.5+Math.cos(P.yaw)*0.16,oy=P.y+1.5,oz=P.z+f[2]*0.5-Math.sin(P.yaw)*0.16;
  m.position.set(ox,oy,oz);world.add(m);
  var sp=11.5;
  nades.push({m:m,led:led,x:ox,y:oy,z:oz,vx:f[0]*sp,vy:f[1]*sp+3.0,vz:f[2]*sp,fuse:2.1,t:0,
    rx:(Math.random()-0.5)*9,rz:(Math.random()-0.5)*9});
}
/* grenades bounce off the same boxes feet do, but can drop onto the track bed */
function nadeBlocked(x,y,z){
  if(x<-10.6||x>6.85||z<Z0+0.45||z>Z1-0.45)return true;
  for(var i=0;i<COL.length;i++){
    var b=COL[i];
    if(b.ghost)continue;
    if(y<b.min[1]-0.09||y>b.max[1]+0.09)continue;
    if(x>b.min[0]-0.09&&x<b.max[0]+0.09&&z>b.min[2]-0.09&&z<b.max[2]+0.09)return true;
  }
  return false;
}
function updateNades(dt){
  if(P._nadeSpawn>0){P._nadeSpawn-=dt;if(P._nadeSpawn<=0)spawnNadeNow();}
  for(var i=nades.length-1;i>=0;i--){
    var n=nades[i];n.t+=dt;n.fuse-=dt;
    n.vy-=19*dt;
    var nx=n.x+n.vx*dt,nz=n.z+n.vz*dt,bounced=false;
    if(nadeBlocked(nx,n.y,n.z)){n.vx*=-0.45;nx=n.x;bounced=true;}
    if(nadeBlocked(nx,n.y,nz)){n.vz*=-0.45;nz=n.z;bounced=true;}
    n.x=nx;n.z=nz;n.y+=n.vy*dt;
    var floor=n.x>-1.3?-1.0:0.085;
    if(n.y<floor){n.y=floor;if(n.vy<-1.0)bounced=true;n.vy=-n.vy*0.38;n.vx*=0.72;n.vz*=0.72;n.rx*=0.5;n.rz*=0.5;}
    if(n.y>5.4){n.y=5.4;n.vy=-Math.abs(n.vy)*0.3;bounced=true;}
    if(bounced)sfxAt(n.x,n.z,sfxNadeBounce);
    n.m.position.set(n.x,n.y,n.z);n.m.rotation.x+=n.rx*dt;n.m.rotation.z+=n.rz*dt;
    var blink=Math.sin(n.t*(7+(2.1-n.fuse)*10))>0;
    n.led.material.opacity=blink?0.95:0.12;
    if(n.fuse<=0){
      explodeNade(n);
      world.remove(n.m);scrub(n.m);nades.splice(i,1);
    }
  }
}
function explodeNade(n){
  sfxAt(n.x,n.z,sfxNadeBlast);
  var pd=Math.hypot(P.x-n.x,P.z-n.z);
  P.shake=Math.max(P.shake,clamp(0.6-pd*0.035,0.15,0.6));
  spark(n.x,n.y+0.3,n.z,34,1,0.6,0.14,9,6);
  spark(n.x,n.y+0.5,n.z,18,1,0.85,0.25,5,4);
  smoke(n.x,n.y+0.4,n.z,8);
  blastFx(n.x,n.y+0.35,n.z,0.9);
  sfxAt(n.x,n.z,sfxGrenadeBlast);          /* the grenade used to detonate silently */
  blastDamage(n.x,n.z,5.6,170,48,null);
}
function clearNades(){
  for(var i=nades.length-1;i>=0;i--){world.remove(nades[i].m);scrub(nades[i].m);}
  nades.length=0;P.nadeT=0;P._nadeSpawn=0;
}


function hurt(dmg,fromX,fromZ){
  if(G.state!=='play')return;
  P.lastHurt=0;
  if(P.inv>0)return;
  if(P.shield>0){
    var absorbed=Math.min(P.shield,dmg);
    P.shield-=absorbed;dmg-=absorbed;
    if(P.shield<=0)sfxShieldBreak();
    else beep(720,0.06,'sawtooth',0.24,340);
    if(dmg<=0){ P.inv=0.12; return; }
  }
  if(dmg>0){
    P.hp=Math.max(0,P.hp-dmg);P.inv=0.28;G.hurtFlash=0.5;P.shake=Math.max(P.shake,0.18);
    sfxHurt();
  }
  hud();
  /* Directional damage indicator */
  if(fromX!==undefined){
    var angle=Math.atan2(fromX-P.x,fromZ-P.z)-P.yaw;
    var deg=((angle*180/Math.PI)%360+360)%360;
    $('hurt').style.background='radial-gradient(90% 70% at 50% 50%,transparent 35%,rgba(210,35,18,.75))';
    if(deg>45&&deg<135)$('hurt').style.background='radial-gradient(90% 70% at 100% 50%,transparent 20%,rgba(210,35,18,.8))';
    else if(deg>225&&deg<315)$('hurt').style.background='radial-gradient(90% 70% at 0% 50%,transparent 20%,rgba(210,35,18,.8))';
    else if(deg>=135&&deg<=225)$('hurt').style.background='radial-gradient(90% 70% at 50% 0%,transparent 20%,rgba(210,35,18,.8))';
  }
  if(P.hp<=0)finish(false);
}

/* ============================ per-frame update ============================ */
var keys={},walkSpeed=0,mouseDown=false,adsDown=false,joy={x:0,y:0},touchRun=false,touchCrouch=false,touchSlideReq=false;

/* Damped spring step (symplectic Euler with implicit damping, sub-stepped to <=12ms) so the
   view-model sway cannot blow up on a slow frame. Any non-finite state snaps to the target. */
function springStep(s,posKey,velKey,target,w,z,dt){
  var n=Math.max(1,Math.ceil(dt/0.012)),h=dt/n,x=s[posKey],v=s[velKey],w2=w*w,c=2*z*w;
  for(var i=0;i<n;i++){v=(v+(target-x)*w2*h)/(1+c*h);x+=v*h;}
  if(!isFinite(x)||!isFinite(v)){x=target;v=0;}
  s[posKey]=x;s[velKey]=v;
}
function update(dt){
  G.time+=dt;
  P.fireCd=Math.max(mouseDown?-dt:0,P.fireCd-dt);
  P.inv=Math.max(0,P.inv-dt);
  P.shake=Math.max(0,P.shake-dt*0.6);
  P.kick=Math.max(0,P.kick-dt*14);
  G.hitFlash=Math.max(0,G.hitFlash-dt);
  G.hurtFlash=Math.max(0,G.hurtFlash-dt);
  P.lastHurt=(P.lastHurt||0)+dt;
  /* Emergency strobe pulse during active waves */
  if(G.phase==='wave'&&typeof strobes!=='undefined'){
    for(var si=0;si<strobes.length;si++){
      var s=strobes[si];s.phase+=dt*4.5;
      var pulse=Math.pow(Math.max(0,Math.sin(s.phase)),12)*1.8;
      s.glow.material.opacity=pulse*0.85;
      s.glow.scale.setScalar(0.7+pulse*0.3);
    }
  }else if(typeof strobes!=='undefined'){
    for(var si=0;si<strobes.length;si++){strobes[si].glow.material.opacity=0;}
  }
  if(G.callT>0){G.callT-=dt;if(G.callT<=0)$('call').style.opacity='0';}
  muzzleLight.intensity=Math.max(0,muzzleLight.intensity-dt*26);
  /* Shield & Health Tactical Regen */
  if(P.lastHurt>3.8&&P.shield<P.maxShield&&P.hp>0){
    P.shield=Math.min(P.maxShield,P.shield+22*dt);G.hudDirty=true;
  }
  if(P.lastHurt>5&&P.hp<35&&P.hp>0){P.hp=Math.min(35,P.hp+3*dt);G.hudDirty=true;}
  if(G.hudDirty){G._hudAcc=(G._hudAcc||0)+dt;if(G._hudAcc>0.1){G._hudAcc=0;G.hudDirty=false;hud();}}
  updateGibs(dt);
  updateDying(dt);
  updateNades(dt);
  if(P.nadeT>0)P.nadeT=Math.max(0,P.nadeT-dt);
  var nadeEl = $('t-nade'); if(nadeEl) nadeEl.classList.toggle('empty', P.nades <= 0);
  /* Combo timer decay */
  if(G.comboT>0){G.comboT-=dt;if(G.comboT<=0){$('combo').style.opacity='0';G.combo=0;}}
  /* Hit feed decay */
  if(G.feedT>0){G.feedT-=dt;if(G.feedT<=0)$('hitfeed').style.opacity='0';}
  flash.material.opacity=Math.max(0,flash.material.opacity-dt*14);

  if(P.reload>0){
    P.reload=Math.max(0,P.reload-dt);
    var cur=P.curWpn,wcfg=WEAPONS[cur],wstate=P.wpnState[cur];
    var rTotal=P._reloadTotal||(wstate.ammo>0?wcfg.reloadTac:wcfg.reloadDry);
    var rProg=1-P.reload/rTotal;

    if(rProg>=0.18&&P._reloadStage<1){
      P._reloadStage=1;
      if(cur===1&&wstate.reserve>0&&wstate.ammo<wcfg.magMax){wstate.ammo++;wstate.reserve--;P.ammo=wstate.ammo;P.reserve=wstate.reserve;}
      sfxMagOut(cur);
    }
    if(rProg>=0.38&&P._reloadStage<2){
      P._reloadStage=2;
      if(cur===1&&wstate.reserve>0&&wstate.ammo<wcfg.magMax){wstate.ammo++;wstate.reserve--;P.ammo=wstate.ammo;P.reserve=wstate.reserve;}
      if(cur!==1)spawnDroppedMag(cur===2?2:(cur===3?3:0));
      sfxPouchDraw();
    }
    if(rProg>=0.68&&P._reloadStage<3){
      P._reloadStage=3;
      if(cur===1&&wstate.reserve>0&&wstate.ammo<wcfg.magMax){wstate.ammo++;wstate.reserve--;P.ammo=wstate.ammo;P.reserve=wstate.reserve;}
      sfxMagIn(cur);
      P.kick=0.15;P.kickY=-0.02;
    }
    if(rProg>=0.86&&P._reloadStage<4){
      P._reloadStage=4;
      if(P._reloadIsDry){
        if(cur===1){
          sfxPumpAction();
          if(shotgunPump)shotgunPump.position.z=-0.32;
        }else if(cur===3){
          sfxRailCoreLock();
        }else{
          sfxBoltRelease();
          if(rifleBolt)rifleBolt.position.z=-0.20;
        }
      }
    }

    if(P.reload===0){
      var need=wcfg.magMax-wstate.ammo,take=Math.min(need,wstate.reserve);
      wstate.ammo+=take;wstate.reserve-=take;
      P.ammo=wstate.ammo;P.reserve=wstate.reserve;
      hud();
    }
  }
  /* Weapon Switching Interpolation */
  if(P.switchT>0){
    P.switchT-=dt;
    if(P.switchT<=0.13&&P.curWpn!==P.nextWpn){
      P.curWpn=P.nextWpn;
      for(var wi=0;wi<WEAPONS.length;wi++)wpnMeshes[wi].visible=(wi===P.curWpn);
      gun=wpnMeshes[P.curWpn];
      P.ammo=P.wpnState[P.curWpn].ammo;
      P.reserve=P.wpnState[P.curWpn].reserve;
      hud();
    }
  }
  /* Shotgun Pump Slide Cycle */
  if(P.pumpT>0){
    P.pumpT-=dt;
    var pumpProg=1-P.pumpT/0.35;
    if(pumpProg>0.45&&!P._pumpSoundPlayed){P._pumpSoundPlayed=true;sfxPumpRack();}
    if(shotgunPump){
      var poff=Math.sin(pumpProg*Math.PI)*0.07;
      shotgunPump.position.z=-0.44+poff;
    }
  }
  /* movement */
  var fx = (keys['KeyW']||keys['ArrowUp']?1:0) - (keys['KeyS']||keys['ArrowDown']?1:0) - joy.y;
  var sx = (keys['KeyD']||keys['ArrowRight']?1:0) - (keys['KeyA']||keys['ArrowLeft']?1:0) + joy.x;
  var mag=Math.hypot(fx,sx);
  if(mag>1){fx/=mag;sx/=mag;}
  walkSpeed=Math.min(1,mag);

  /* Tactical Sprint */
  var crouchDown=keys['KeyC']||keys['ControlLeft']||touchCrouch;
  var sprint=(keys['ShiftLeft']||keys['ShiftRight']||touchRun)&&!mouseDown&&!adsDown&&P.ads<0.25&&fx>0.2;
  if(P.curWpn===3 && (keys['ShiftLeft']||keys['ShiftRight'])) sprint = false;
  P.slideCd=Math.max(0,(P.slideCd||0)-dt);
  P.crouch=slerp(P.crouch||0,(crouchDown||P.slideT>0)?1:0,16,dt);
  var speed=(sprint?6.6:4.0)*(P.ads>0.5?0.60:1)*(1-P.crouch*.38)*dt;
  var cy=Math.cos(P.yaw),sy=Math.sin(P.yaw);
  if(P.slideT<=0) slide(P,(-sy*fx+cy*sx)*speed,(-cy*fx-sy*sx)*speed,0.34);

  /* Jump, Slide, Gravity & Landing Impact */
  if(P.grounded) P.coyoteT = 0.08;
  else P.coyoteT = Math.max(0, (P.coyoteT||0) - dt);
  P.jumpBuffer=Math.max(0,(P.jumpBuffer||0)-dt);
  if(keys['Space']&&!P.jumpHeld)P.jumpBuffer=0.12;
  P.jumpHeld=!!keys['Space'];
  if(P.jumpBuffer>0 && (P.grounded || P.coyoteT>0)){
    P.jumpBuffer=0; P.slideT=0;
    P.vy=5.2;P.grounded=false;
    beep(140,0.08,'sine',0.07,90);
  }
  if(!P.slideT)P.slideT=0;
  if(((crouchDown&&!P.crouchHeld)||touchSlideReq)&&sprint&&P.slideT<=0&&P.slideCd<=0&&P.grounded){
    P.slideT=0.55;P.slideCd=1.1;beep(70,0.15,'triangle',0.06,35);noiseBurst(0.1,400,0.04);
  }
  P.crouchHeld=!!crouchDown;
  touchSlideReq=false;
  if(P.slideT>0 && P.grounded){
    P.slideT-=dt;
    if(P.slideT<=0 && typeof touchCrouch !== 'undefined') touchCrouch = false;
    var sdir=1-P.slideT/0.55;
    slide(P,(-sy)*8.2*dt*(1-sdir*0.7),(-cy)*8.2*dt*(1-sdir*0.7),0.34);
    walkSpeed=1;
  }
  P.vy-=19*dt;P.y+=P.vy*dt;
  if(P.y<=0){
    var prevVy=P.vy;
    P.y=0;P.vy=0;
    if(!P.grounded){
      P.grounded=true;
      if(prevVy<-2.5){
        var imp=Math.min(0.12,(-prevVy-2.5)*0.022);
        P.landPunch=imp;
        P.shake=Math.max(P.shake,imp*0.8);
        beep(55,0.1,'triangle',0.08,30);noiseBurst(0.06,600,0.06);
      }
    }
  }
  if(!P.landPunch)P.landPunch=0;
  P.landPunch=slerp(P.landPunch,0,10,dt);

  /* Dual-Frequency Lissajous Figure-8 Bobbing */
  if(walkSpeed>0.15&&P.grounded){
    var bobRate=sprint?13.5:8.8;
    P.bob+=dt*bobRate;
    if(!P._lastBob)P._lastBob=0;
    var sinPrev=Math.sin(P._lastBob*2),sinNow=Math.sin(P.bob*2);
    if(sinPrev>0&&sinNow<=0&&walkSpeed>0.25){
      var fvol=(sprint?0.08:0.04)+walkSpeed*0.03;
      beep(rr(55,80),0.05,'triangle',fvol,rr(25,40));
      noiseBurst(0.04,rr(600,1100),fvol*0.4);
    }
    P._lastBob=P.bob;
  }

  /* Head & Camera Lissajous Bobbing */
  var camBobX=(!reduceMotion&&walkSpeed>0.15&&P.grounded)?Math.cos(P.bob)*(sprint?0.018:0.009):0;
  var camBobY=(!reduceMotion&&walkSpeed>0.15&&P.grounded)?Math.sin(P.bob*2)*(sprint?0.032:0.016):0;
  camBobY-=P.landPunch*0.8;

  var shake=P.shake>0&&!reduceMotion?P.shake*(1-P.ads*.92):0;
  camBobX*=1-P.ads*.92;camBobY*=1-P.ads*.92;
  var strafeInput=(keys['KeyD']?1:0)-(keys['KeyA']?1:0)+joy.x;
  var targetRoll=reduceMotion?0:-strafeInput*0.024*(1-P.ads);
  if(!P._camRoll)P._camRoll=0;
  P._camRoll=slerp(P._camRoll,targetRoll,9,dt);

  /* scoped breathing drift is applied to the camera itself, so the beam goes exactly where the
     reticle is drawn, wobble included */
  var sway=(P.curWpn===3&&P.ads>0.5)?scopeDrift(dt):null;
  camera.rotation.set(P.pitch+(sway?sway.p:0),P.yaw+(sway?sway.y:0),P._camRoll,'YXZ');
  camera.position.set(
    P.x+camBobX+(Math.random()-0.5)*shake,
    P.y+1.62-P.crouch*.48+camBobY+(Math.random()-0.5)*shake,
    P.z+(Math.random()-0.5)*shake
  );
  carry.position.set(P.x,P.y+1.7,P.z);
  updateLights(P.x,P.z);
  if(mouseDown)shoot();else P._semiLatch=false;

  if(!mouseDown && P.ammo <= 0 && P.wpnState[P.curWpn].reserve > 0 && P.reload <= 0 && P.switchT <= 0 && P.nadeT <= 0){
    P._autoReloadT = (P._autoReloadT || 0) + dt;
    if(P._autoReloadT > 0.5) reload();
  } else { P._autoReloadT = 0; }

  /* ============================ AAA Kinematic Viewmodel & Hand Mechanics ============================ */
if(!_elCrosshair){ _elCrosshair=$('crosshair'); _elScopeVignette=$('scope-vignette'); _elSniperScope=$('sniper-scope'); }
var ads=P.ads;
var curWcfg=WEAPONS[P.curWpn];

/* Per-weapon dynamic ADS FOV: Railgun uses 44 deg with RTT, falls back to 24 deg on low tier */
var effectiveAdsFov=(P.curWpn===3&&(typeof scopeRT==='undefined'||!scopeRT||quality==='performance'))?24:curWcfg.adsFov;
var sprintFov=(keys['ShiftLeft']||keys['ShiftRight']||touchRun)&&walkSpeed>0.5&&ads<0.2?84:76;
var targetFov=lerp(sprintFov,effectiveAdsFov,ads);
if(Math.abs(camera.fov-targetFov)>0.01){camera.fov=targetFov;camera.updateProjectionMatrix();}
// Smoothstep kinematic ease for natural ADS acceleration and deceleration
var adsEase = ads * ads * (3 - 2 * ads);

/* HUD Crosshair & Scope Vignette: Hide 2D crosshair during ADS so 3D optic is used */
if(_elCrosshair) _elCrosshair.classList.toggle('ads', ads>0.15);
if(_elScopeVignette) _elScopeVignette.classList.toggle('active', ads>0.35);
/* Per-weapon dynamic ADS FOV */
var effectiveAdsFov = (P.curWpn === 3 && (typeof scopeRT === 'undefined' || !scopeRT || quality === 'performance')) ? 24 : curWcfg.adsFov;
var sprintFov = (keys['ShiftLeft'] || keys['ShiftRight'] || touchRun) && walkSpeed > 0.5 && ads < 0.2 ? 84 : 76;
var targetFov = lerp(sprintFov, effectiveAdsFov, adsEase);
if(Math.abs(camera.fov - targetFov) > 0.01){ camera.fov = targetFov; camera.updateProjectionMatrix(); }

/* 3D Scope Assembly: Always keep viewmodel visible for immersive 3D optics */
gunRig.visible=true;
document.body.classList.remove('scoped');
if(_elSniperScope) _elSniperScope.classList.remove('active');
/* HUD Crosshair & Scope Vignette: Smooth optical handoff so 3D/cybernetic sights take over */
if(_elCrosshair){
  _elCrosshair.classList.toggle('ads', ads > 0.15);
  _elCrosshair.style.opacity = String(clamp(1.0 - ads * 2.8, 0, 1));
}
if(_elScopeVignette){
  var vigActive = ads > 0.20;
  _elScopeVignette.classList.toggle('active', vigActive);
  _elScopeVignette.style.opacity = String(clamp((ads - 0.15) * 1.25, 0, 0.88));
}

/* Railgun High-Power Cybernetic Sniper Scope vs 3D Holo/Reflex Optics */
var isRailScoped = (P.curWpn === 3 && ads >= 0.70);
gunRig.visible = !isRailScoped;
document.body.classList.toggle('scoped', isRailScoped);
if(_elSniperScope){
  _elSniperScope.classList.toggle('active', isRailScoped);
}

updateAimReadout(dt);

/* ADS Tactile Audio Feedback */
if(!P._lastAds)P._lastAds=0;
if(ads>=0.45&&P._lastAds<0.45){
  beep(520,0.02,'sine',0.06,680);
}else if(ads<0.45&&P._lastAds>=0.45){
  beep(400,0.02,'sine',0.05,300);
}
P._lastAds=ads;

/* Tactical Sprint Transition Blending */
if(!P._sprintProg)P._sprintProg=0;
var targetSprintProg=(sprint&&walkSpeed>0.35&&ads<0.25&&P.switchT<=0&&P.reload<=0)?1:0;
P._sprintProg=slerp(P._sprintProg,targetSprintProg,9.0,dt);
var spProg=P._sprintProg;

/* 6-DOF Physical Spring-Damper Inertia System (Hooke's Law with Viscous Damping) */
if(!P.swaySpring){
  P.swaySpring={posX:0,posY:0,posZ:0,rotX:0,rotY:0,rotZ:0,velX:0,velY:0,velZ:0,vRotX:0,vRotY:0,vRotZ:0};
  P.barrelHeat=0;
  P.triggerPull=0;
}

var springFreq=19.0;
var springDamp=1.12;

// Mouse angular momentum input
var targetRotY=clamp(-mouseVelX*0.00042,-0.045,0.045);
var targetRotX=clamp(-mouseVelY*0.00042,-0.035,0.035);
var targetRotZ=clamp(mouseVelX*0.00068,-0.065,0.065); // Dynamic roll banking into turn

// Translational lag
var targetPosX=clamp(-mouseVelX*0.00018,-0.025,0.025);
var targetPosY=clamp(mouseVelY*0.00018,-0.020,0.020);

// Strafe velocity coupling (weapon tilts opposite to strafe direction)
var strafeSpeed=(keys['KeyA']?-1:0)+(keys['KeyD']?1:0);
var strafeTilt=strafeSpeed*0.065*(1-ads*0.7);
targetRotZ+=strafeTilt;
targetPosX+=strafeSpeed*-0.014*(1-ads*0.7);

// Integration of the second-order spring. This has to stay stable at any frame rate: the old
// explicit Euler step diverged below ~25 FPS (2·ζ·ω·dt > 2) and flung the view model out of
// frame the moment the mouse moved. springStep() sub-steps and damps implicitly.
springStep(P.swaySpring,'rotX','vRotX',targetRotX,springFreq,springDamp,dt);
springStep(P.swaySpring,'rotY','vRotY',targetRotY,springFreq,springDamp,dt);
springStep(P.swaySpring,'rotZ','vRotZ',targetRotZ,springFreq,springDamp,dt);
springStep(P.swaySpring,'posX','velX',targetPosX,springFreq,springDamp,dt);
springStep(P.swaySpring,'posY','velY',targetPosY,springFreq,springDamp,dt);

mouseVelX=slerp(mouseVelX,0,18,dt);
mouseVelY=slerp(mouseVelY,0,18,dt);

/* Dual-Harmonic Bio-Mechanical Breathing & Heartbeat Pulse with per-weapon adsSway */
var swayMul=lerp(1.0,curWcfg.adsSway!==undefined?curWcfg.adsSway:0.15,ads);
var breathScale=(1-ads*0.75)*swayMul;
var breathRate=lerp(1.5,2.5,Math.min(1,walkSpeed/6));
var breathX=Math.sin(G.time*breathRate)*0.0016*breathScale;
var breathY=Math.cos(G.time*breathRate*2.0)*0.0011*breathScale;
var microTremorX=(Math.sin(G.time*16)+Math.cos(G.time*24))*0.00012*breathScale;
var microTremorY=(Math.cos(G.time*18)+Math.sin(G.time*22))*0.00012*breathScale;

/* Jump, Heavy Landing Shockwave & Crouch / Slide Kinematics */
if(!P._jumpLag)P._jumpLag=0;
if(!P._landImpact)P._landImpact=0;
if(!P._crouchLag)P._crouchLag=0;

// Aerial weightless float & jump inertia
if(!P.grounded){
  P._jumpLag=slerp(P._jumpLag,-0.048,9.5,dt);
}else{
  P._jumpLag=slerp(P._jumpLag,0,14,dt);
}

// Kinetic landing floor compression with multi-frequency bounce
if(P.landPunch>0.01){
  P._landImpact=slerp(P._landImpact,-P.landPunch*0.72,26,dt);
}else{
  P._landImpact=slerp(P._landImpact,0,11,dt);
}

// Low-profile tactical crouch / slide weapon tuck
var isCrouching = keys['KeyC'] || keys['ControlLeft'] || touchCrouch;
var targetCrouch = isCrouching ? 1.0 : 0.0;
P._crouchLag = slerp(P._crouchLag, targetCrouch, 12.0, dt);
var crouchOffsetY = P._crouchLag * -0.035;
var crouchTiltRoll = P._crouchLag * 0.045;
var crouchTiltPitch = P._crouchLag * 0.025;

/* Organic Figure-8 Gait Bobbing with Phase Offset */
var gunBobPhase=P.bob-0.25;
var gunBobX=(!reduceMotion&&walkSpeed>0.15&&P.grounded)?Math.cos(gunBobPhase)*(sprint?0.018:0.009)*(1-ads*0.8):0;
var gunBobY=(!reduceMotion&&walkSpeed>0.15&&P.grounded)?Math.sin(gunBobPhase*2)*(sprint?0.024:0.012)*(1-ads*0.8):0;

/* Near-Wall Weapon Lowering & Tucking Proximity Sensing */
var fwdAim=forward(P.yaw,P.pitch);
var wallDist=rayWorld(camera.position.x,camera.position.y,camera.position.z,fwdAim[0],fwdAim[1],fwdAim[2]);
if(!P._wallTuck)P._wallTuck=0;
var targetWallTuck=(wallDist<0.85)?clamp((0.85-wallDist)/0.50,0,1):0;
P._wallTuck=slerp(P._wallTuck,targetWallTuck,14.0,dt);
var wallTuck=P._wallTuck;

/* Responsive Mobile Viewmodel Scaling & Edge Repositioning */
var isMobileView=coarse||(window.innerWidth<768)||(window.innerWidth/window.innerHeight<1.15);
var targetRigScale=isMobileView?0.82:1.0;
if(!gunRig.userData.curScale)gunRig.userData.curScale=1.0;
gunRig.userData.curScale=slerp(gunRig.userData.curScale,targetRigScale,10.0,dt);
gunRig.scale.setScalar(gunRig.userData.curScale);

/* Target Spatial Coordinates: Hip, Tactical Sprint, ADS */
var hipX=isMobileView?0.185:0.16,hipY=isMobileView?-0.175:-0.155,hipZ=-0.56;
if(curWcfg.hip){hipX+=curWcfg.hip[0];hipY+=curWcfg.hip[1];hipZ+=curWcfg.hip[2];}   /* per-weapon hip offset: the pistol is held closer */
var sprintX=isMobileView?0.185:0.16,sprintY=isMobileView?-0.235:-0.22,sprintZ=-0.44;
var adsX=0.0,adsY=curWcfg.adsY,adsZ=curWcfg.adsZ||-0.22;
// Ergonomic shoulder mount arc: weapon dips slightly in Y and pulls back in Z during raise
var adsArc = Math.sin(ads * Math.PI);
var arcY = -0.012 * adsArc;
var arcZ = 0.016 * adsArc;
var arcRoll = -0.024 * adsArc;
var arcPitch = 0.010 * adsArc;

var basePosX=lerp(lerp(hipX,sprintX,spProg),adsX,adsEase);
var basePosY=lerp(lerp(hipY,sprintY,spProg),adsY,adsEase)+arcY-wallTuck*0.12;
var basePosZ=lerp(lerp(hipZ,sprintZ,spProg),adsZ,adsEase)+arcZ+wallTuck*0.18;

var reloadProgress=P.reload>0?clamp(1-P.reload/P._reloadTotal,0,1):0;
var reloadPose=P.reload>0?easePhase(reloadProgress,0,.18)*(1-easePhase(reloadProgress,.78,1)):0;
var reloadDrop=reloadPose*.035;
var switchDrop=P.switchT>0?Math.sin((1-P.switchT/0.26)*Math.PI)*0.18:0;
/* grenade throw: the gun swings down and out to the left while the off hand lobs it */
var nadeProg=P.nadeT>0?1-P.nadeT/0.62:0;
var nadeDrop=P.nadeT>0?Math.sin(nadeProg*Math.PI)*0.20:0;
var nadeSwing=P.nadeT>0?Math.sin(Math.min(1,nadeProg*1.3)*Math.PI)*0.38:0;
switchDrop+=nadeDrop;

var adsRecoilKickMul=curWcfg.adsRecoilKick!==undefined?curWcfg.adsRecoilKick:1.0;
var kickZ=P.kick*lerp(0.022,0.016*adsRecoilKickMul,ads);

/* Tactical Multi-Phase Weapon Inspection Sequence (`I`, `T`, `F`) */
var inspectRotX=0,inspectRotY=0,inspectRotZ=0,inspectPosX=0,inspectPosY=0;
if(P.inspectT>0){
  P.inspectT-=dt;
  var insTotal=1.35;
  var insProg=1-Math.max(0,P.inspectT/insTotal);
  if(insProg<0.28){
    var p1=insProg/0.28;
    var ease1=Math.sin(p1*Math.PI*0.5);
    inspectRotZ=ease1*0.55;
    inspectRotY=ease1*0.35;
    inspectRotX=ease1*-0.12;
    inspectPosX=ease1*-0.04;
    inspectPosY=ease1*0.02;
  }else if(insProg<0.65){
    var p2=(insProg-0.28)/0.37;
    inspectRotZ=0.55+Math.sin(p2*Math.PI)*0.08;
    inspectRotY=0.35-Math.sin(p2*Math.PI)*0.05;
    inspectRotX=-0.12+Math.sin(p2*Math.PI)*0.06;
    inspectPosX=-0.04+Math.sin(p2*Math.PI)*0.01;
    inspectPosY=0.02;
  }else if(insProg<0.86){
    var p3=(insProg-0.65)/0.21;
    var ease3=Math.sin(p3*Math.PI);
    inspectRotZ=0.55*(1-p3)-ease3*0.32;
    inspectRotY=0.35*(1-p3)-ease3*0.22;
    inspectRotX=-0.12*(1-p3)+ease3*0.14;
    inspectPosX=-0.04*(1-p3)+ease3*0.03;
  }else{
    var p4=(insProg-0.86)/0.14;
    var snap=1-Math.sin(p4*Math.PI*0.5);
    inspectRotZ=-0.32*snap*0.5;
    inspectRotY=-0.22*snap*0.5;
    inspectRotX=0.14*snap*0.5;
  }
}

/* Apply All Kinematic Translations */
gun.position.x=basePosX+gunBobX+inspectPosX+P.swaySpring.posX*(1-ads*.95)-reloadPose*.035;
gun.position.y=basePosY+gunBobY+inspectPosY+P.swaySpring.posY*(1-ads*.95)+P._jumpLag+P._landImpact+crouchOffsetY-reloadDrop-switchDrop;
gun.position.z=basePosZ+kickZ;

/* Base Rotations */
/* At rest the weapon is carried canted, muzzle up and across the body, the way it is held when
   nobody is aiming; it blends fully straight at ADS because adsRot is zero. */
var carryRot=curWcfg.carryRot||[0.06,0.16,0.09];
var hipRotX=carryRot[0],hipRotY=carryRot[1],hipRotZ=carryRot[2];
var sprintRotX=-0.42,sprintRotY=-0.28,sprintRotZ=0.24;
var adsRotX=0.0,adsRotY=0.0,adsRotZ=0.0;

var baseRotX=lerp(lerp(hipRotX,sprintRotX,spProg),adsRotX,adsEase)+arcPitch-wallTuck*0.38;
var baseRotY=lerp(lerp(hipRotY,sprintRotY,spProg),adsRotY,adsEase);
var baseRotZ=lerp(lerp(hipRotZ,sprintRotZ,spProg),adsRotZ,adsEase)+arcRoll-wallTuck*0.14;

var kickPitch=P.kick*lerp(0.065,curWcfg.adsRecoilPitch||0.018,ads);
var kickRoll=P.kick*P.kickY*lerp(0.016,0.005,ads);
var kickYaw=P.kick*P.kickY*lerp(0.010,0.003,ads);
var reloadRotZ=reloadPose*.28;
var reloadRotX=reloadPose*.10;

gun.rotation.x=baseRotX+kickPitch+reloadRotX+inspectRotX+P.swaySpring.rotX*(1-ads*.95)+nadeSwing*0.35;
gun.rotation.y=baseRotY+kickYaw+inspectRotY+P.swaySpring.rotY*(1-ads*.95)+nadeSwing*0.5;
gun.rotation.z=baseRotZ+kickRoll+inspectRotZ-reloadRotZ+P.swaySpring.rotZ*(1-ads*.95)+crouchTiltRoll+nadeSwing;
gun.rotation.x+=crouchTiltPitch;

gunRig.position.x=breathX+microTremorX;
gunRig.position.y=breathY+microTremorY;
gunRig.rotation.z=P.swaySpring.rotZ*0.6*(1-ads*.95);

/* safety net: if anything upstream ever produces a non-finite transform, reset the sway state
   instead of losing the weapon for the rest of the run */
if(!isFinite(gun.position.x+gun.position.y+gun.position.z+gun.rotation.x+gun.rotation.y+gun.rotation.z+gunRig.rotation.z)){
  P.swaySpring=null;mouseVelX=0;mouseVelY=0;
  gun.position.set(hipX,hipY,hipZ);gun.rotation.set(hipRotX,hipRotY,hipRotZ);
  gunRig.position.set(0,0,0);gunRig.rotation.set(0,0,0);
}

/* Progressive Trigger Pull & Finger Micro-Flexing */
var targetTrigger=mouseDown&&G.state==='play'?1.0:0.0;
P.triggerPull=slerp(P.triggerPull,targetTrigger,targetTrigger>P.triggerPull?28:16,dt);
if(gunTrigger){
  gunTrigger.position.z=-0.125+P.triggerPull*0.014+P.kick*0.008;
}
if(gunTriggerFinger){
  gunTriggerFinger.position.z=-0.025+P.triggerPull*0.012+P.kick*0.010;
  gunTriggerFinger.rotation.x=P.triggerPull*0.20;
}

/* Animated Bolt Kickback */
if(rifleBolt)rifleBolt.position.z=-0.20+P.kick*0.055;
if(gun.userData.holo)gun.userData.holo.material.opacity=lerp(0.80,1.0,ads);

/* Collimated 3D Optical Reticle Parallax Compensation */
var actReticle = gun.userData.opticReticle;
if(actReticle){
  var opticY = gun.userData.opticY || 0.068;
  var opticZ = (gun.userData.opticZ || -0.20) - 0.005;
  // Sight parallax counter-movement: reticle counteracts weapon sway during ADS
  var parX = -P.swaySpring.posX * 0.45 * ads;
  var parY = -P.swaySpring.posY * 0.45 * ads;
  actReticle.position.set(parX, opticY + parY, opticZ);
  if(actReticle.material){
    actReticle.material.opacity = lerp(0.70, 1.0, ads);
  }
}
if(gunMuzzleLight)gunMuzzleLight.intensity=Math.max(0,gunMuzzleLight.intensity-dt*26);

/* Barrel Heat Dissipation (the hot-barrel wisps themselves come from the muzzle socket, see
   updateMuzzleSmoke in weapons.js) */
/* Barrel Heat Dissipation */
P.barrelHeat=Math.max(0,P.barrelHeat-dt*0.18);


/* Tactical Laser Dot & Collimated Atmospheric Dust Beam */
  if(laserDot){
    if(curWcfg.hasLaser){
      var fAim=forward(P.yaw,P.pitch);
      var hitD=P.aimDistance||200;
      laserDot.position.copy(camera.position).addScaledVector(aimVector,Math.max(0,hitD-0.04));
      laserDot.visible=true;
      laserDot.material.opacity=lerp(0.85,0.12,ads);
      laserDot.scale.setScalar(0.045+Math.sin(G.time*15)*0.006);
      if(P.curWpn===3)laserDot.material.color.setHex(0x00ffff);
      else laserDot.material.color.setHex(0x00ff88);

      if(laserBeam){
        var startX=P.x+fAim[0]*0.45,startY=P.y+1.55+fAim[1]*0.45,startZ=P.z+fAim[2]*0.45;
        var endX=P.x+fAim[0]*(hitD-0.05),endY=P.y+1.62+fAim[1]*(hitD-0.05),endZ=P.z+fAim[2]*(hitD-0.05);
        var beamLen=Math.max(0.1,hitD-0.5);
        laserBeam.position.set((startX+endX)*0.5,(startY+endY)*0.5,(startZ+endZ)*0.5);
        var bDir=_laserFrom.set(endX-startX,endY-startY,endZ-startZ).normalize();
        laserBeam.quaternion.setFromUnitVectors(_laserUp,bDir);
        laserBeam.scale.set(1,beamLen,1);
        laserBeam.visible=qualityTier>0&&ads<0.5;
        laserBeam.material.opacity=lerp(0.20,0.04,ads);
        laserBeam.material.color.copy(laserDot.material.color);
      }
    }else{
      laserDot.visible=false;
      if(laserBeam)laserBeam.visible=false;
    }
  }
  if(shotgunPump&&P.pumpT<=0&&P.reload<=0)shotgunPump.position.z=-.44;
  animateHandling(dt);
  /* the socket is synced after every view-model layer above, then the world-space smoke steps */
  updateMuzzleTransform();
  updateMuzzleSmoke(dt);
  updateCasings(dt);
  /* Dust motes subtle drift (throttled to 30Hz for 120 FPS efficiency) */
  if(typeof dustPos!=='undefined'&&(_frameCount%4===0)){
    for(var di=0;di<DUST_MAX;di++){
      dustPos[di*3+1]+=Math.sin(G.time*0.8+di)*0.0024;
      if(dustPos[di*3+1]>4.2)dustPos[di*3+1]=0.3;
    }
    dustGeo.attributes.position.needsUpdate=true;
  }

  /* hostiles: iterate a snapshot, because a charger going off mid-loop can remove several
     units from the live array at once */
  var dmgMul=D().dmg*(G.dmgScale||1);
  var roster=enemies.slice();
  for(var ei=roster.length-1;ei>=0;ei--){
    var e=roster[ei],cfg=e.cfg;
    if(e.dead)continue;
    e.flash=Math.max(0,e.flash-dt);
    e.melee=Math.max(0,e.melee-dt);
    e.spawnT+=dt;
    if(!e.flinch)e.flinch=0;
    if(e.flinch>0){
      e.flinch-=dt;
      e.head.rotation.x=-0.4*(e.flinch/0.22);
    }
    if(e.knockVx||e.knockVz){
      slide(e,e.knockVx*dt,e.knockVz*dt,e.radius);
      e.knockVx*=Math.max(0,1-dt*8);e.knockVz*=Math.max(0,1-dt*8);
      if(Math.abs(e.knockVx)<0.01)e.knockVx=0;if(Math.abs(e.knockVz)<0.01)e.knockVz=0;
    }
    e.skin.emissive.setRGB(e.flash*2.2,e.flash*1.7,e.flash*0.8);
    var pdx=P.x-e.x,pdz=P.z-e.z;
    var dx=pdx,dz=pdz,d=Math.max(0.01,Math.hypot(dx,dz));
    var los=sees(e.x,1.2*e.scale,e.z,P.x,P.y+1.62-P.crouch*0.48,P.z);
    var keep=cfg.ranged?cfg.keep:(cfg.boom?0.9:1.1);
    var want=(d>keep||!los)?1:(d<keep*0.62?-0.8:0);
    if(cfg.boom)want=1;                                  /* chargers never back off */
    /* staggered wardens crawl; stagger fades */
    var spdMul=1;
    if(e.stagger>0){e.stagger-=dt;spdMul=0.42;}
    /* Sprinter / charger zigzag movement */
    if(cfg.zigzag&&d>2){
      e.phase+=dt*5;
      var zig=Math.sin(e.phase)*(cfg.boom?0.45:0.7);
      dx+=zig*dz/d;dz-=zig*dx/d;
    }
    /* Sentry flanking: strafe sideways when in range with LOS */
    if(cfg.ranged&&los&&d<cfg.keep&&d>cfg.keep*0.5){
      var fx2=-dz/d*e.strafe,fz2=dx/d*e.strafe;
      dx=dx/d*0.3+fx2*0.7;dz=dz/d*0.3+fz2*0.7;
    }
    if(want!==0){
      var sp=e.speed*spdMul*dt*(want>0?1:0.7),ox=e.x,oz=e.z;
      slide(e,dx/d*sp*Math.sign(want),dz/d*sp*Math.sign(want),e.radius);
      if(Math.hypot(e.x-ox,e.z-oz)<sp*0.3){
        e.stuck+=dt;
        slide(e,-dz/d*sp*e.strafe,dx/d*sp*e.strafe,e.radius);
        if(e.stuck>1.4){e.strafe*=-1;e.stuck=0;}
      }else e.stuck=Math.max(0,e.stuck-dt);
    }else if(cfg.ranged){
      slide(e,-dz/d*e.speed*dt*0.55*e.strafe,dx/d*e.speed*dt*0.55*e.strafe,e.radius);
    }
    /* keep them from stacking */
    for(var j=0;j<enemies.length;j++){
      var o=enemies[j];
      if(!o||o===e||o.dead)continue;   /* the live array can shrink while a chain reaction runs */
      var ax=e.x-o.x,az=e.z-o.z,ad=Math.hypot(ax,az),want2=e.radius+o.radius+0.15;
      if(ad>0.001&&ad<want2)slide(e,ax/ad*dt*1.4,az/ad*dt*1.4,e.radius);
    }
    /* facing: wardens turn slowly so you can get round the shield; everyone else snaps */
    var wantFace=Math.atan2(cfg.shield?pdx:dx,cfg.shield?pdz:dz);
    if(cfg.shield){
      var diff=wantFace-e.face;
      while(diff>Math.PI)diff-=TAU;while(diff<-Math.PI)diff+=TAU;
      var maxTurn=cfg.turnRate*dt*(e.stagger>0?0.45:1);
      e.face+=clamp(diff,-maxTurn,maxTurn);
      /* shield state */
      if(e.shieldDown>0){
        e.shieldDown-=dt;
        if(e.shieldDown<=0){e.shieldHp=Math.round(e.shieldMax*0.6);if(e.plate)e.plate.visible=true;sfxAt(e.x,e.z,sfxShieldHit);}
      }
      if(e.plate&&e.plate.visible){
        e.shieldFlash=Math.max(0,e.shieldFlash-dt*3);
        var frac=e.shieldHp/Math.max(1,e.shieldMax);
        e.plate.userData.mat.opacity=0.12+frac*0.14+e.shieldFlash*0.5+Math.sin(G.time*9)*0.025;
      }
    }else{
      if(e.cfg.keep>2){
        var maxTurn=(e.type==='heavy'?2.5:4.0)*dt;
        var diff=wantFace-e.face;
        while(diff>Math.PI)diff-=Math.PI*2;
        while(diff<-Math.PI)diff+=Math.PI*2;
        e.face+=Math.max(-maxTurn,Math.min(maxTurn,diff));
      }else{
        e.face=wantFace;
      }
    }
    /* attack */
    e.cool-=dt;
    if(cfg.ranged){
      e.charge=(e.cool<0.55&&d<26&&los)?1-e.cool/0.55:0;
      var c=e.charge;
      e.eye.material.color.setRGB(1,0.16+c*0.6,0.11+c*0.3);
      e.eyeGlow.material.opacity=0.7+c*0.6;
      e.eyeGlow.scale.setScalar(0.6+c*0.5);
      if(e.cool<=0){
        if(d<26&&los){
          fireBolt(e,Math.round(cfg.dmg*dmgMul));
          e.burst=(cfg.burst||1)-1;
          e.cool=e.burst>0?0.16:cfg.cool-Math.min(0.9,G.wave*0.16);
        }else e.cool=0.5;
      }
    }else if(cfg.boom){
      /* ticking gets faster as it closes in; goes off at arm's length */
      e.tick-=dt;
      if(e.tick<=0){sfxAt(e.x,e.z,sfxChargerTick,d<6);e.tick=clamp(d/18,0.10,0.55);}
      var pulse=0.5+0.5*Math.sin(G.time*(6+Math.max(0,14-d)*1.2));
      e.eyeGlow.material.opacity=0.6+pulse*0.6;
      if(e.obj.userData.lamp){e.obj.userData.lamp.material.opacity=0.35+pulse*0.65;e.obj.userData.lamp.scale.setScalar(0.9+pulse*0.6);}
      if(d<1.55&&los&&e.spawnT>0.6){killEnemy(e);continue;}
    }else if(d<1.35&&e.melee<=0&&los&&e.spawnT>0.5){
      /* wardens only swing when they are actually facing you */
      var facingOk=true;
      if(cfg.shield){var fd=wantFace-e.face;while(fd>Math.PI)fd-=TAU;while(fd<-Math.PI)fd+=TAU;facingOk=Math.abs(fd)<1.0;}
      if(facingOk){
        hurt(Math.round(cfg.melee*dmgMul),e.x,e.z);e.melee=cfg.shield?1.3:1;
        spark(e.x,1.1,e.z,5,1,0.35,0.2,2.5,2);
      }
    }
    /* animation */
    var moving=want!==0||cfg.ranged;
    var sPrev=Math.sin(e.phase);
    e.phase+=dt*(moving?e.speed*2.4:1.4);
    if(cfg.stomp&&moving&&sPrev>0&&Math.sin(e.phase)<=0&&d<22)sfxAt(e.x,e.z,sfxStomp);
    var swing=Math.sin(e.phase)*(moving?0.5:0.06);
    e.hipL.rotation.x=swing;e.hipR.rotation.x=-swing;
    e.obj.position.set(e.x,Math.abs(Math.sin(e.phase))*0.03,e.z);
    e.obj.rotation.y=e.face;
    e.head.rotation.x=clamp(Math.atan2(1.55-(P.y+1.5),d)*-0.6,-0.4,0.4);
    if(!cfg.boom&&!cfg.shield)e.core.material.color.setRGB(1,0.3+Math.sin(e.phase*2)*0.1,0.14);

    if(e.melee !== undefined && e.melee > 0 && e.melee < 0.25 && !cfg.boom && e.obj.children[0]) {
      e.obj.children[0].rotation.x = -0.3 * (1 - e.melee / 0.25);
    } else if(e.obj.children[0] && !e.dead) {
      e.obj.children[0].rotation.x = 0;
    }
  }
  /* their fire */
  for(var b=bolts.length-1;b>=0;b--){
    var o=bolts[b],travel=Math.hypot(o.vx,o.vy,o.vz)*dt,inv=1/Math.hypot(o.vx,o.vy,o.vz);
    var dxn=o.vx*inv,dyn=o.vy*inv,dzn=o.vz*inv;
    var wall=rayWorld(o.x,o.y,o.z,dxn,dyn,dzn);
    if(!o._whiz&&Math.hypot(o.x-P.x,o.y-(P.y+1.5),o.z-P.z)<1.5){o._whiz=true;sfxBulletWhiz();}
    var pl=raySphere(o.x,o.y,o.z,dxn,dyn,dzn,P.x,P.y+1.25,P.z,0.42);
    if(pl<=travel&&pl<wall){hurt(o.dmg,o.ox,o.oz);world.remove(o.m);scrub(o.m);bolts.splice(b,1);continue;}
    if(wall<=travel){spark(o.x+dxn*wall,o.y+dyn*wall,o.z+dzn*wall,4,1,0.4,0.15,2.5,2);
      world.remove(o.m);scrub(o.m);bolts.splice(b,1);continue;}
    o.x+=o.vx*dt;o.y+=o.vy*dt;o.z+=o.vz*dt;o.m.position.set(o.x,o.y,o.z);
    o.life-=dt;if(o.life<=0){world.remove(o.m);scrub(o.m);bolts.splice(b,1);}
  }
  /* supplies */
  for(var k=pickups.length-1;k>=0;k--){
    var pu=pickups[k];pu.t+=dt;
    pu.obj.rotation.y+=dt*1.6;pu.obj.position.y=0.45+Math.sin(pu.t*2)*0.07;
    if(Math.hypot(pu.x-P.x,pu.z-P.z)<1.15){
      if(pu.kind==='ammo'){
        P.wpnState[0].reserve=Math.min(WEAPONS[0].reserveMax,P.wpnState[0].reserve+45);
        P.wpnState[1].reserve=Math.min(WEAPONS[1].reserveMax,P.wpnState[1].reserve+16);
        P.wpnState[2].reserve=Math.min(WEAPONS[2].reserveMax,P.wpnState[2].reserve+60);
        P.wpnState[3].reserve=Math.min(WEAPONS[3].reserveMax,P.wpnState[3].reserve+8);
        P.wpnState[4].reserve=Math.min(WEAPONS[4].reserveMax,P.wpnState[4].reserve+30);
        P.reserve=P.wpnState[P.curWpn].reserve;
        dmgNum(pu.x,1.2,pu.z,'AMMO','score');
      }
      else if(pu.kind==='nade'){
        if(P.nades>=P.nadeMax)continue;
        P.nades++;dmgNum(pu.x,1.2,pu.z,'+1 FRAG','score');
      }
      else{if(P.hp>=100)continue;P.hp=Math.min(100,P.hp+32);dmgNum(pu.x,1.2,pu.z,'+32 HP','score');}
      world.remove(pu.obj);scrub(pu.obj);pickups.splice(k,1);sfxPickup();hud();
    }
  }
  updateTracers(dt);
  stepParticles(dt);
  updateDmgNums(dt);
  waves(dt);
  screenFx(dt);
}

