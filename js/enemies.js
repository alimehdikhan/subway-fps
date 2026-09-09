/* Last Train — enemies.js
   Enemy types, difficulty, damage numbers, medals, deaths, enemy bolts and pickups.
   All game scripts share one global scope and load in the order listed in index.html. */
'use strict';

/* ============================ hostiles ============================ */
/* Difficulty scales enemy toughness, the damage they deal and the score they pay out. */
var DIFFS={
  easy  :{hp:0.80,dmg:0.70,score:0.80,label:'Easy'},
  normal:{hp:1.00,dmg:1.00,score:1.00,label:'Normal'},
  hard  :{hp:1.25,dmg:1.35,score:1.30,label:'Hard'}
};
var diffKey='normal';
try{var sd=localStorage.getItem('lt-diff');if(sd&&DIFFS[sd])diffKey=sd;}catch(err){}
function D(){return DIFFS[diffKey];}

var TYPES={
  drone  :{hp:58, speed:3.45,scale:0.82,melee:12,score:100,name:'scrubber'},
  sprint :{hp:35, speed:5.8, scale:0.70,melee:18,score:120,name:'runner',zigzag:true},
  sentry :{hp:98, speed:1.95,scale:1.00,ranged:true,dmg:11,cool:2.3,keep:9, burst:1,score:150,name:'sentry'},
  heavy  :{hp:205,speed:1.30,scale:1.34,ranged:true,dmg:9, cool:3.1,keep:12,burst:3,score:300,name:'gantry unit',stomp:true},
  /* Warden: slow, turns slowly, carries a frontal energy shield. Flank it, shoot its legs,
     crack the shield with the railgun, or hit it with something that explodes. */
  warden :{hp:250,speed:1.55,scale:1.18,melee:26,score:350,name:'warden',shield:true,shieldHp:140,turnRate:1.75,stomp:true},
  /* Charger: fast suicide drone. Detonates when it reaches you, and also when it dies, so
     killing one next to its friends is very much the idea. */
  charger:{hp:30, speed:6.3, scale:0.62,melee:0, score:90, name:'charger',boom:true,zigzag:true,blastR:3.6,blastE:95,blastP:30}
};
var enemies=[],bolts=[],pickups=[],dying=[];

/* ============================ unit senses and behaviour ============================
   Until now a unit walked at the player's exact position whether or not it had any way of knowing
   where that was: line of sight gated shooting, never awareness. These give it senses and a
   memory. It sees in a cone in front of itself, it hears gunfire and explosions, its confidence in
   the last fix decays, and once the trail is cold it sweeps instead of tracking. Sight is the
   expensive part - one ray against every collider - so each unit re-runs it a few times a second,
   staggered by its own timer rather than every unit on the same frame. */
var AI_VIEW_COS=Math.cos(1.15);          /* a 132 degree cone, so going round one actually works */
var AI_VIEW_FAR=34, AI_HEAR_GUN=26, AI_HEAR_BOOM=46;
var AI_SENSE=1/6, AI_FORGET=0.16;
/* Four stances around every free-standing solid thing tall enough to hide behind, worked out once
   at load. The long walls and the end caps are excluded by size: they are the room, not cover. */
var COVER=[];
(function buildCover(){
  if(typeof COL==='undefined')return;
  for(var i=0;i<COL.length;i++){
    var b=COL[i];if(b.ghost)continue;
    var w=b.max[0]-b.min[0],dp=b.max[2]-b.min[2],h=b.max[1]-b.min[1];
    if(h<1.9||w>4||dp>4)continue;
    var cx=(b.min[0]+b.max[0])*0.5,cz=(b.min[2]+b.max[2])*0.5;
    var ox=w*0.5+0.8,oz=dp*0.5+0.8;
    COVER.push({x:cx-ox,z:cz},{x:cx+ox,z:cz},{x:cx,z:cz-oz},{x:cx,z:cz+oz});
  }
  COVER=COVER.filter(function(c){return !blockedAt(c.x,c.z,0.5);});
})();
/* one unit's sight, memory and resulting state; returns its distance to the player */
function aiSense(e,dt){
  var d=Math.hypot(P.x-e.x,P.z-e.z);
  e.senseT-=dt;
  if(e.senseT<=0){
    e.senseT=AI_SENSE;
    var seen=false;
    if(d<AI_VIEW_FAR){
      var inv=1/Math.max(d,1e-4),tx=(P.x-e.x)*inv,tz=(P.z-e.z)*inv;
      /* anything closer than a few metres is felt rather than seen, so you cannot stand on a
         unit's toes inside its blind spot */
      if(tx*Math.sin(e.face)+tz*Math.cos(e.face)>AI_VIEW_COS||d<3)
        seen=sees(e.x,1.2*e.scale,e.z,P.x,P.y+1.62-P.crouch*0.48,P.z);
    }
    e.canSee=seen;
  }
  if(e.canSee){e.lkpX=P.x;e.lkpZ=P.z;e.conf=1;e.lostT=0;}
  else{e.conf=Math.max(0,e.conf-dt*AI_FORGET);e.lostT+=dt;}
  e.heard=Math.max(0,e.heard-dt);
  e.state=e.canSee?'engage':(e.conf>0.3?'hunt':'search');
  /* a cold trail: strike out for somewhere new instead of standing on the last sighting. Without
     this a wave stalls the moment the player breaks contact and keeps quiet. */
  if(e.state==='search'&&Math.hypot(e.lkpX-e.x,e.lkpZ-e.z)<1.6){
    e.lkpX=clamp(P.x+(Math.random()-0.5)*9,-10.2,-1.7);
    e.lkpZ=clamp(P.z+(Math.random()-0.5)*22,Z0+2,Z1-2);
  }
  return d;
}
/* gunfire and explosions carry: anything close enough gets a fix on where the noise came from */
function aiHear(x,z,loud){
  for(var i=0;i<enemies.length;i++){
    var e=enemies[i];if(!e||e.dead)continue;
    var d=Math.hypot(x-e.x,z-e.z);
    if(d>loud)continue;
    var c=0.35+0.6*(1-d/loud);
    if(c>e.conf){e.conf=c;e.lkpX=x;e.lkpZ=z;e.heard=0.8;}
  }
}
/* Spread the units that actually have you around you, instead of letting them file in along one
   line. Sorting by bearing and dealing out an approach angle each is enough to make a group read
   as a group; anything cleverer is not legible at this speed. */
function aiSquad(){
  var live=[];
  for(var i=0;i<enemies.length;i++){var e=enemies[i];if(e&&!e.dead&&e.state==='engage')live.push(e);}
  if(live.length<2){if(live.length)live[0].slot=0;return;}
  live.sort(function(a,b){return Math.atan2(a.x-P.x,a.z-P.z)-Math.atan2(b.x-P.x,b.z-P.z);});
  for(var k=0;k<live.length;k++)live[k].slot=((k/(live.length-1))-0.5)*1.30;
}
/* The eye says what the unit is doing: hot when it has you, amber while it hunts the last fix,
   cold while it sweeps. Ranged units drive their own eye while charging a shot, so leave those. */
function aiEyeTell(e){
  if(e.cfg.ranged&&e.charge>0.01)return;
  var m=e.eye&&e.eye.material;if(!m)return;
  if(e.state==='engage')m.color.setRGB(1,0.13,0.08);
  else if(e.state==='hunt')m.color.setRGB(1,0.55,0.10);
  else m.color.setRGB(0.18,0.55,0.85);
  if(e.eyeGlow){
    e.eyeGlow.material.color.copy(m.color);
    e.eyeGlow.material.opacity=e.state==='engage'?0.85:(e.state==='hunt'?0.55:0.30);
  }
}

/* ---- floating damage numbers: a DOM pool projected from world space every frame ---- */
var DN_MAX=28,dnPool=[],dnHead=0,dnRoot=$('dmgnums'),_dnV=new THREE.Vector3();
for(var dni=0;dni<DN_MAX;dni++){
  var dnS=document.createElement('span');dnS.className='dn';dnRoot.appendChild(dnS);
  dnPool.push({el:dnS,life:0,age:0,x:0,y:0,z:0,vx:0,vy:0,vz:0,val:0,cls:'',pop:0,text:null});
}
function dmgNum(x,y,z,val,cls,target){
  cls=cls||'';
  var it;
  /* several pellets landing on one target within a few frames merge into one growing number */
  if(target&&typeof val==='number'&&target._dn&&target._dn.life>0&&target._dn.age<0.24&&target._dn.cls===cls){
    it=target._dn;it.val+=val;it.pop=1;
    it.el.textContent=(cls==='score'?'+':'')+Math.round(it.val);
    return;
  }
  it=dnPool[dnHead];dnHead=(dnHead+1)%DN_MAX;
  /* start a little to one side and drift outward so the number clears the crosshair */
  var side=(Math.random()<0.5?-1:1)*(cls==='score'?0:1);
  var rx=Math.cos(P.yaw),rz=-Math.sin(P.yaw);
  it.x=x+rx*side*0.28+(Math.random()-0.5)*0.12;it.y=y+(cls==='score'?0.25:0);it.z=z+rz*side*0.28+(Math.random()-0.5)*0.12;
  it.vx=rx*side*0.9;it.vz=rz*side*0.9;
  it.vy=cls==='score'?1.1:2.1;it.life=0.9;it.age=0;it.pop=1;it.cls=cls;
  it.val=typeof val==='number'?val:0;
  it.el.className='dn'+(cls?' '+cls:'');
  it.el.textContent=typeof val==='number'?((cls==='score'?'+':'')+Math.round(val)):String(val);
  if(target&&typeof val==='number')target._dn=it;
}
function updateDmgNums(dt){
  var w=window.innerWidth,h=window.innerHeight;
  for(var i=0;i<DN_MAX;i++){
    var it=dnPool[i];
    if(it.life<=0)continue;
    it.life-=dt;it.age+=dt;it.y+=it.vy*dt;it.vy-=3.2*dt;it.pop=Math.max(0,it.pop-dt*5);
    it.x+=(it.vx||0)*dt;it.z+=(it.vz||0)*dt;it.vx=(it.vx||0)*(1-dt*3);it.vz=(it.vz||0)*(1-dt*3);
    if(it.life<=0){it.el.style.opacity='0';continue;}
    _dnV.set(it.x,it.y,it.z).project(camera);
    if(_dnV.z>1||_dnV.z<-1){it.el.style.opacity='0';continue;}
    var sx=(_dnV.x*0.5+0.5)*w,sy=(-_dnV.y*0.5+0.5)*h;
    var sc=1+it.pop*0.35;
    it.el.style.transform='translate('+sx.toFixed(1)+'px,'+sy.toFixed(1)+'px) translate(-50%,-50%) scale('+sc.toFixed(3)+')';
    it.el.style.opacity=String(Math.min(1,it.life*2.6));
  }
}
function hideDmgNums(){for(var i=0;i<DN_MAX;i++){dnPool[i].life=0;dnPool[i].el.style.opacity='0';}}

/* ---- kill medals ---- */
function showMedal(text,sub,tier){
  var el=$('medal');if(!el)return;
  $('medaltext').textContent=text;$('medalsub').textContent=sub||'';
  el.className='';void el.offsetWidth;   /* restart the CSS animation */
  el.className='show'+(tier>=3?' t3':(tier===2?' t2':''));
  sfxMedal(tier||1);
}
/* Painted machine steel with panel lines and scratches; the per-enemy clone carries the hit flash. */
var shellMat=new THREE.MeshStandardMaterial({color:0xc4ccc8,map:TX.enemyShell,normalMap:TX.enemyNormal,normalScale:new THREE.Vector2(0.55,0.55),roughnessMap:TX.enemyRough,roughness:0.92,metalness:0.50});
shellMat.envMapIntensity=.55;shellMat.userData.envSet=true;
function own(m){m.userData=m.userData||{};m.userData.own=true;return m;}
function scrub(obj){
  if(!obj)return;
  if(obj.material&&obj.material.userData&&obj.material.userData.own)obj.material.dispose();
  if(obj.isMesh&&obj.userData.merged&&obj.geometry)obj.geometry.dispose();   /* per-unit batched geometry */
  var kids=obj.children||[];
  for(var i=0;i<kids.length;i++)scrub(kids[i]);
}
var jointMat=new THREE.MeshStandardMaterial({color:0x182022,roughness:0.78,metalness:0.42,normalMap:TX.weaponNormal,normalScale:new THREE.Vector2(0.45,0.45)});
jointMat.envMapIntensity=.38;jointMat.userData.envSet=true;
var plateMat=new THREE.MeshStandardMaterial({color:0xd94e18,roughness:0.88,metalness:0.28,normalMap:TX.enemyNormal,normalScale:new THREE.Vector2(0.5,0.5),roughnessMap:TX.enemyRough});
plateMat.envMapIntensity=.42;plateMat.userData.envSet=true;
var wardenPlateMat=plateMat.clone();wardenPlateMat.color.setHex(0x32567a);           /* deep tempered blue-steel */
var hazardPayloadMat=new THREE.MeshStandardMaterial({color:0xffffff,map:TX.hazard,roughness:0.55,metalness:0.35});
hazardPayloadMat.envMapIntensity=.35;hazardPayloadMat.userData.envSet=true;

function makeEnemy(type,x,z){
  var cfg=TYPES[type],g=new THREE.Group(),skin=own(shellMat.clone());
  function b(px,py,pz,sx,sy,sz,m,parent){
    var mesh=new THREE.Mesh(bg(sx,sy,sz),m||skin);mesh.position.set(px,py,pz);
    /* The units are the only articulated things in the station and cast nothing at all today.
       The shells cast and receive; the unlit eye, core and shield quads are skipped, since a
       MeshBasicMaterial has no light to lose and would only throw a solid black cut-out. */
    if(!(mesh.material&&mesh.material.isMeshBasicMaterial)){mesh.castShadow=true;mesh.receiveShadow=true;}
    (parent||g).add(mesh);return mesh;
  }
  var hipL=new THREE.Group(),hipR=new THREE.Group();
  hipL.position.set(-0.19,0.78,0);hipR.position.set(0.19,0.78,0);g.add(hipL,hipR);
  b(0,-0.3,0,0.2,0.62,0.2,skin,hipL);b(0,-0.62,0.06,0.26,0.14,0.4,jointMat,hipL);
  b(0,-0.3,0,0.2,0.62,0.2,skin,hipR);b(0,-0.62,0.06,0.26,0.14,0.4,jointMat,hipR);
  b(0,0.86,0,0.44,0.2,0.3,jointMat);
  var torso=b(0,1.16,0,0.68,0.54,0.4,skin);
  b(0,1.16,0.205,0.46,0.24,0.03,plateMat);
  var core=b(0,1.16,0.218,0.32,0.11,0.02,own(new THREE.MeshBasicMaterial({color:0xff5a2a})));
  b(0,1.44,0,0.14,0.16,0.14,jointMat);
  var head=new THREE.Group();head.position.set(0,1.62,0);g.add(head);
  b(0,0,0,0.42,0.32,0.36,skin,head);
  b(0,0.17,0,0.22,0.06,0.22,jointMat,head);
  /* Cybernetic scanning eye visor */
  var eye=b(0,0.02,0.19,0.32,0.07,0.04,own(new THREE.MeshBasicMaterial({color:0xff2214})),head);
  var eyeGlow=glow(0,0.02,0.25,0.62,0xff2818,0.85,head);
  /* a soft contact shadow keeps every unit planted on the floor at any quality level */
  var blob=new THREE.Mesh(shadowPlaneGeo,contactShadowMat);blob.rotation.x=-Math.PI/2;blob.position.y=0.02;blob.scale.set(1.5,1.5,1);g.add(blob);g.userData.blob=blob;
  /* Heavy armor pauldrons */
  var armour=cfg.shield?wardenPlateMat:plateMat;
  b(-0.36,1.42,0,0.22,0.14,0.28,armour);
  b(0.36,1.42,0,0.22,0.14,0.28,armour);
  if(cfg.ranged&&!cfg.stomp)b(0.12,0.28,-0.05,0.02,0.32,0.02,jointMat,head);   /* sentry aerial */
  if(cfg.zigzag&&!cfg.boom)b(0,0.2,-0.08,0.04,0.12,0.22,armour,head);         /* runner dorsal fin */
  if(type==='heavy'){b(-0.18,1.5,-0.26,0.08,0.34,0.08,jointMat);b(0.18,1.5,-0.26,0.08,0.34,0.08,jointMat);}   /* exhaust stacks */
  var armL=new THREE.Group(),armR=new THREE.Group();
  armL.position.set(-0.44,1.34,0);armR.position.set(0.44,1.34,0);g.add(armL,armR);
  b(0,-0.24,0,0.18,0.52,0.2,skin,armL);b(0,-0.24,0,0.18,0.52,0.2,skin,armR);
  if(cfg.ranged){
    b(0,-0.5,0.3,0.16,0.18,0.62,jointMat,armR);
    var tip=b(0,-0.5,0.62,0.1,0.1,0.06,own(new THREE.MeshBasicMaterial({color:0x8fd8c0})),armR);
    g.userData.tip=tip;
  }else{
    b(0,-0.54,0.14,0.24,0.26,0.34,plateMat,armL);
    b(0,-0.54,0.14,0.24,0.26,0.34,plateMat,armR);
  }
  if(type==='heavy'){
    b(-0.42,1.36,0,0.28,0.2,0.44,plateMat);b(0.42,1.36,0,0.28,0.2,0.44,plateMat);
    b(0,1.44,-0.24,0.5,0.4,0.16,jointMat);
  }
  var plate=null;
  if(cfg.shield){
    /* extra armour and the frontal energy shield */
    b(-0.44,1.36,0,0.30,0.22,0.46,wardenPlateMat);b(0.44,1.36,0,0.30,0.22,0.46,wardenPlateMat);
    b(0,1.42,-0.22,0.56,0.44,0.16,jointMat);
    b(0,0.56,0.12,0.5,0.16,0.3,wardenPlateMat);
    plate=new THREE.Group();plate.position.set(0,1.12,0.5);g.add(plate);
    var shieldMat=own(new THREE.MeshBasicMaterial({color:0x1fb8d8,transparent:true,opacity:0.22,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));
    var pl=new THREE.Mesh(bg(1.04,1.36,0.03),shieldMat);plate.add(pl);
    /* thin frame instead of a second full plate, so the hexagonal glow reads as a shield not a wall */
    var rimMat=own(new THREE.MeshBasicMaterial({color:0x6fe8ff,transparent:true,opacity:0.5,blending:THREE.AdditiveBlending,depthWrite:false}));
    var rt=new THREE.Mesh(bg(1.10,0.04,0.02),rimMat);rt.position.y=0.69;plate.add(rt);
    var rb=new THREE.Mesh(bg(1.10,0.04,0.02),rimMat);rb.position.y=-0.69;plate.add(rb);
    var rl=new THREE.Mesh(bg(0.04,1.42,0.02),rimMat);rl.position.x=-0.53;plate.add(rl);
    var rr2=new THREE.Mesh(bg(0.04,1.42,0.02),rimMat);rr2.position.x=0.53;plate.add(rr2);
    glow(0,0,0.04,1.4,0x3ae0ff,0.18,plate);
    plate.userData.mat=shieldMat;
    /* the shield emitters on each pauldron */
    b(-0.46,1.46,0.14,0.08,0.08,0.10,own(new THREE.MeshBasicMaterial({color:0x5fe8ff})));
    b(0.46,1.46,0.14,0.08,0.08,0.10,own(new THREE.MeshBasicMaterial({color:0x5fe8ff})));
    core.material.color.setHex(0x40e8ff);
  }
  if(cfg.boom){
    /* explosive payload strapped to the back, amber warning lamp on top */
    b(0,1.12,-0.30,0.40,0.42,0.24,hazardPayloadMat);
    b(0,1.12,-0.30,0.44,0.06,0.28,jointMat);                                     /* strap */
    b(0,1.12,-0.43,0.26,0.26,0.03,own(new THREE.MeshBasicMaterial({color:0xffb020})));
    b(0,1.86,0,0.10,0.14,0.10,own(new THREE.MeshBasicMaterial({color:0xffc040})));
    g.userData.lamp=glow(0,1.92,0,1.1,0xffa020,0.8,g);
    core.material.color.setHex(0xffb020);
    eye.material.color.setHex(0xffa020);eyeGlow.material.color.setHex(0xffa020);
  }
  g.scale.setScalar(cfg.scale);
  g.position.set(x,0,z);
  /* merge the static plates of each limb group by material: fewer draw calls per unit, and the
     animated groups (hips, arms, head) and the flash-carrying skin material are untouched */
  if(typeof batchHandParts==='function')batchHandParts(g);
  world.add(g);
  var hpScale=D().hp*(G.hpScale||1);
  var hp0=Math.round(cfg.hp*hpScale);
  return {
    type:type,cfg:cfg,obj:g,skin:skin,core:core,eye:eye,eyeGlow:eyeGlow,head:head,plate:plate,
    hipL:hipL,hipR:hipR,armR:armR,x:x,z:z,hp:hp0,max:hp0,flash:0,cool:1+Math.random()*1.6,
    speed:cfg.speed*(G.spdScale||1),
    charge:0,burst:0,phase:Math.random()*TAU,strafe:Math.random()<0.5?1:-1,stuck:0,melee:0,radius:0.4*cfg.scale,
    face:Math.atan2(P.x-x,P.z-z),shieldHp:cfg.shieldHp?Math.round(cfg.shieldHp*hpScale):0,shieldMax:cfg.shieldHp?Math.round(cfg.shieldHp*hpScale):0,
    shieldDown:0,shieldFlash:0,stagger:0,tick:0.3,dead:false,lastZone:'body',knockVx:0,knockVz:0,flinch:0,spawnT:0,
    /* senses and memory: a unit arrives knowing roughly where you are, and loses you from there */
    state:'engage',canSee:false,conf:1,lkpX:P.x,lkpZ:P.z,lostT:0,heard:0,
    senseT:Math.random()*AI_SENSE,slot:0
  };
}
function hitSpheres(e){
  var s=e.cfg.scale;
  return {hx:e.x,hy:1.62*s,hz:e.z,hr:0.28*s, bx:e.x,by:1.1*s,bz:e.z,br:0.46*s, lx:e.x,ly:0.5*s,lz:e.z,lr:0.34*s};
}

/* ---- death: the frame goes dark and keels over before it is removed ---- */
function startDying(e){
  var d={obj:e.obj,t:0,dur:0.75,skin:e.skin,x:e.x,z:e.z,s:e.cfg.scale,
    tipX:(Math.random()<0.62?1:-1)*(1.15+Math.random()*0.3),tipZ:(Math.random()-0.5)*0.8};
  e.eye.material.color.setHex(0x1a0806);e.eyeGlow.material.opacity=0;
  e.core.material.color.setHex(0x2a1008);
  if(e.plate)e.plate.visible=false;
  if(e.obj.userData.lamp)e.obj.userData.lamp.material.opacity=0;
  if(e.obj.userData.blob)e.obj.userData.blob.visible=false;
  e.obj.rotation.order='YXZ';
  dying.push(d);
}
function updateDying(dt){
  for(var i=dying.length-1;i>=0;i--){
    var d=dying[i];d.t+=dt;
    var tip=Math.min(1,d.t/0.36),et=1-Math.pow(1-tip,3);
    d.obj.rotation.x=d.tipX*et*1.42;
    d.obj.rotation.z=d.tipZ*et;
    d.obj.position.y=Math.sin(tip*Math.PI)*0.10*d.s;
    var fl=Math.max(0,1-d.t*2.6);
    d.skin.emissive.setRGB(fl*1.6,fl*1.0,fl*0.4);
    if(d.t>=d.dur){
      world.remove(d.obj);scrub(d.obj);dying.splice(i,1);
      smoke(d.x,0.35,d.z,3);
    }
  }
}
function clearDying(){
  for(var i=dying.length-1;i>=0;i--){world.remove(dying[i].obj);scrub(dying[i].obj);}
  dying.length=0;
}

/* Charger detonation: hurts everything nearby, including other chargers (chain reactions) */
function chargerBlast(e){
  var cfg=e.cfg,x=e.x,z=e.z;
  sfxAt(x,z,sfxNadeBlast);
  var pd=Math.hypot(P.x-x,P.z-z);
  P.shake=Math.max(P.shake,clamp(0.45-pd*0.04,0.08,0.45));
  spark(x,0.9,z,26,1,0.7,0.15,7,5);
  spark(x,0.8,z,14,1,0.95,0.4,4,4);
  smoke(x,0.8,z,5);
  blastFx(x,0.9,z,0.75);
  sfxAt(x,z,sfxChargerBlast);
  blastDamage(x,z,cfg.blastR,cfg.blastE,Math.round(cfg.blastP*D().dmg*(G.dmgScale||1)),e);
}

function killEnemy(e){
  if(!e||e.dead)return;
  e.dead=true;
  var idx=enemies.indexOf(e);
  if(idx>=0)enemies.splice(idx,1);
  var s=e.cfg.scale,head=e.lastZone==='head';
  spawnGibs(e.x,1.1*s,e.z,e.type==='heavy'||e.type==='warden'?7:(e.cfg.boom?2:4));
  spark(e.x,1*s,e.z,28,1,0.5,0.14,6,5);
  spark(e.x,0.6,e.z,14,0.6,0.8,0.85,5,3);
  spark(e.x,1.3*s,e.z,10,1,0.35,0.08,3.5,6);
  muzzleLight.position.set(e.x,1.2,e.z);muzzleLight.intensity=3.0;
  puff(e.x,1.0*s,e.z,3,0.5*s,0,0.6,0,0x8a8e8c,0.9,0.45);
  P.shake=Math.max(P.shake,0.14); /* Hit crunch */
  var now=G.time;
  if(now-G.lastKillT<3){G.combo++;} else {G.combo=1;}
  G.lastKillT=now;G.comboT=1.8;
  if(G.combo>1){
    $('combo').textContent='x'+G.combo+' COMBO';
    $('combo').style.opacity='1';$('combo').style.color=G.combo>=4?'#ff3a20':'#ff6a3a';
  }
  if(e.cfg.boom){
    /* chargers do not collapse, they go up */
    world.remove(e.obj);scrub(e.obj);
    chargerBlast(e);
  }else{
    sfxAt(e.x,e.z,sfxDown);
    startDying(e);
  }
  /* score: base × combo, ×1.5 for a headshot finish, scaled by difficulty */
  var comboMul=Math.min(G.combo,5);
  var pts=e.cfg.score*comboMul*(head?1.5:1);
  var dist=Math.hypot(e.x-P.x,e.z-P.z);
  if(dist>26&&!e.cfg.boom&&e.lastZone!=='blast'){pts+=60;showMedal('LONG SHOT','+60 · '+Math.round(dist)+'M',1);}
  /* multi-kill medals: kills landing within 1.1s of each other */
  G.killTimes.push(now);
  while(G.killTimes.length&&now-G.killTimes[0]>1.1)G.killTimes.shift();
  var n=G.killTimes.length;
  if(n>=2&&n>G.streakN){
    var bonus=n===2?50:(n===3?100:200);
    pts+=bonus;
    showMedal(n===2?'DOUBLE KILL':(n===3?'TRIPLE KILL':'MULTI KILL ×'+n),'+'+bonus,Math.min(3,n-1));
  }
  G.streakN=n;
  pts=Math.round(pts*D().score);
  G.score+=pts;G.kills++;
  dmgNum(e.x,1.95*s,e.z,pts,'score');
  var starved=P.reserve+P.ammo<14;
  if(starved||Math.random()<0.32){
    var r=Math.random();
    dropPickup(e.x,e.z,starved?'ammo':(r<0.48?'ammo':(r<0.82?'med':'nade')));
  }
  hud();
}

/* projectiles fired at the player */
var boltGeo=new THREE.SphereGeometry(0.11,8,6);
var boltMat=new THREE.MeshBasicMaterial({color:0xff6b3a});
function fireBolt(e,dmg){
  var s=e.cfg.scale,ox=e.x,oy=1.3*s,oz=e.z;
  var dx=P.x-ox,dy=(P.y+1.45)-oy,dz=P.z-oz,len=Math.hypot(dx,dy,dz);
  var sp=e.type==='heavy'?15:19;
  var m=new THREE.Mesh(boltGeo,boltMat);m.position.set(ox,oy,oz);world.add(m);
  glow(0,0,0,0.9,0xff7a3a,0.85,m);
  bolts.push({m:m,x:ox,y:oy,z:oz,ox:ox,oz:oz,vx:dx/len*sp+ (Math.random()-0.5)*1.4,
    vy:dy/len*sp+(Math.random()-0.5)*0.7,vz:dz/len*sp+(Math.random()-0.5)*1.4,life:3,dmg:dmg});
  sfxAt(ox,oz,sfxBolt);
}

/* ============================ pickups ============================ */
var pickupNadeGeo=new THREE.SphereGeometry(0.13,10,8);
function dropPickup(x,z,kind){
  if(pickups.length>=9)return;
  /* keep drops on the platform where they can be reached */
  x=clamp(x,-10.1,-1.9);z=clamp(z,Z0+2,Z1-2);
  var col=kind==='ammo'?0xe8a33d:(kind==='nade'?0xe2452c:0x57b391);
  var g=new THREE.Group();
  if(kind==='nade'){
    var ball=new THREE.Mesh(pickupNadeGeo,new THREE.MeshStandardMaterial({color:0x22302c,roughness:0.45,metalness:0.7}));
    g.add(ball);
    var band=new THREE.Mesh(bg(0.30,0.05,0.30),new THREE.MeshBasicMaterial({color:col}));
    g.add(band);
    var pin=new THREE.Mesh(bg(0.05,0.10,0.05),new THREE.MeshBasicMaterial({color:0xf2f5ec}));
    pin.position.y=0.16;g.add(pin);
  }else{
    var box=new THREE.Mesh(bg(0.34,0.24,0.24),new THREE.MeshStandardMaterial({color:col,roughness:0.5,metalness:0.3}));
    g.add(box);
    var cross=new THREE.Mesh(bg(0.06,0.16,0.26),new THREE.MeshBasicMaterial({color:0xf2f5ec}));
    g.add(cross);
    if(kind==='ammo'){cross.scale.set(2.4,0.35,1.02);cross.position.y=0.02;}
  }
  g.position.set(x,0.45,z);world.add(g);
  glow(0,0,0,1.2,col,0.5,g);
  pickups.push({obj:g,x:x,z:z,kind:kind,t:Math.random()*TAU});
}
var DROPS=[[-9.2,-30],[-2.4,-16],[-8.6,-2],[-2.6,12],[-9,24],[-5.2,-38]];
function seedPickups(){
  for(var i=0;i<DROPS.length;i++){
    if(pickups.length>=7)break;
    var x=DROPS[i][0],z=DROPS[i][1],taken=false;
    for(var k=0;k<pickups.length;k++)if(Math.hypot(pickups[k].x-x,pickups[k].z-z)<3)taken=true;
    if(!taken&&Math.random()<0.75)dropPickup(x,z,i%2?'ammo':(Math.random()<0.25?'nade':'med'));
  }
}
function clearField(){
  var i;
  for(i=enemies.length-1;i>=0;i--){world.remove(enemies[i].obj);scrub(enemies[i].obj);}
  for(i=bolts.length-1;i>=0;i--){world.remove(bolts[i].m);scrub(bolts[i].m);}
  for(i=pickups.length-1;i>=0;i--){world.remove(pickups[i].obj);scrub(pickups[i].obj);}
  for(i=0;i<TRACER_MAX;i++)if(tracerPool[i]){tracerPool[i].active=false;tracerPool[i].hitCallback=null;tracerPool[i].group.visible=false;}
  for(i=0;i<CASING_MAX;i++)if(casingPool[i]){casingPool[i].life=0;casingPool[i].mesh.visible=false;}
  for(i=0;i<GIBS_MAX;i++){gibsPool[i].life=0;gibsPool[i].mesh.visible=false;}
  /* empty in place so the debug handles on window keep pointing at the live arrays */
  enemies.length=0;bolts.length=0;pickups.length=0;
  clearDying();clearNades();hideDmgNums();
  for(i=0;i<PMAX;i++)parts[i].life=0;
  if(typeof resetMuzzleSmoke==='function')resetMuzzleSmoke();
}

