/* Last Train — weapons.js
   Weapon definitions, first-person view models and hands, casings, particles and tracers.
   All game scripts share one global scope and load in the order listed in index.html. */
'use strict';

/* ============================ weapon view model & arsenal ============================ */
var WEAPONS=[
  {
    id:'carbine',name:'AK-47 RIFLE',sub:'SELECT FIRE · 7.62×39MM',
    magMax:30,reserveMax:120,fireRate:0.096,reloadTac:1.15,reloadDry:1.70,
    dmgHead:80,dmgBody:32,dmgLegs:20,pellets:1,spreadBase:0.010,spreadWalk:0.008,spreadAir:0.018,
    adsFov:50,adsY:-0.068,adsZ:-0.14,recoilKick:1.0,recoilPitch:0.016,recoilYaw:0.004,casingType:0,tracerCol:0xffe4b8,hasLaser:true,adsSpeed:19,
    hip:[0.025,-0.014,0.025],carryRot:[0.055,0.18,0.09]
  },
  {
    id:'shotgun',name:'S1897 SHOTGUN',sub:'12-GAUGE BUCK · PUMP ACTION',
    magMax:8,reserveMax:40,fireRate:0.65,reloadTac:1.40,reloadDry:2.05,
    dmgHead:36,dmgBody:18,dmgLegs:11,pellets:8,spreadBase:0.046,spreadWalk:0.016,spreadAir:0.032,
    adsFov:62,adsY:-0.066,adsZ:-0.16,recoilKick:1.8,recoilPitch:0.038,recoilYaw:0.007,casingType:1,tracerCol:0xffaa33,hasLaser:false,adsSpeed:16,
    hip:[0.035,-0.025,-0.015],carryRot:[0.045,0.20,0.08]
  },
  {
    /* 0.0706 s between rounds is 850 rpm, the HK416's factory cyclic rate; it was 0.056 (1071 rpm)
       while this slot was a 9 mm SMG, which is far faster than the rifle it now is */
    id:'smg',name:'M416 ASSAULT RIFLE',sub:'5.56×45MM · 850 RPM',
    magMax:36,reserveMax:160,fireRate:0.0706,reloadTac:1.05,reloadDry:1.45,
    dmgHead:46,dmgBody:19,dmgLegs:13,pellets:1,spreadBase:0.016,spreadWalk:0.012,spreadAir:0.024,
    adsFov:56,adsY:-0.065,adsZ:-0.11,recoilKick:0.62,recoilPitch:0.010,recoilYaw:0.005,casingType:2,tracerCol:0xfff2a8,hasLaser:true,adsSpeed:23,
    hip:[0.018,-0.012,0.025],carryRot:[0.05,0.17,0.085]
  },
  {
    id:'railgun',name:'APEX-50 RAILGUN',sub:'15KV HYPER-VELOCITY ION',
    magMax:4,reserveMax:20,fireRate:1.15,reloadTac:1.75,reloadDry:2.35,
    dmgHead:450,dmgBody:185,dmgLegs:120,pellets:1,pierce:true,spreadBase:0.002,spreadWalk:0.024,spreadAir:0.055,
    adsFov:26,adsY:-0.074,adsZ:-0.34,recoilKick:2.3,recoilPitch:0.046,recoilYaw:0.002,casingType:3,tracerCol:0x00ffff,hasLaser:true,adsSpeed:14,
    hip:[0.02,-0.016,-0.01],carryRot:[0.06,0.16,0.08]
  },
  {
    /* semi-automatic sidearm: one round per press; held closer than the long guns (hip offset) */
    id:'pistol',name:'P-9 SIDEARM',sub:'9×19MM · SEMI-AUTO · 15 RD',
    magMax:15,reserveMax:90,fireRate:0.13,reloadTac:1.05,reloadDry:1.45,semi:true,
    dmgHead:72,dmgBody:27,dmgLegs:16,pellets:1,spreadBase:0.013,spreadWalk:0.009,spreadAir:0.020,
    adsFov:60,adsY:-0.066,adsZ:-0.40,recoilKick:0.9,recoilPitch:0.020,recoilYaw:0.006,casingType:2,tracerCol:0xffe0a8,hasLaser:false,adsSpeed:24,
    hip:[-0.03,0.02,0.10],carryRot:[0.035,0.10,0.035]
  }
];

var gunRig=new THREE.Group();
gunScene.add(gunRig);
/* View-model lighting: a cool overhead key (the fluorescents), a cool rim from behind, and a soft
   fill from the camera side so the hands and sleeves (which face the player) are never black.
   The key follows the nearest fixture, so the weapon brightens under a lamp and dims between. */
var gunAmbient=new THREE.AmbientLight(0x2a3438,0.46);gunScene.add(gunAmbient);
var gunKey=new THREE.DirectionalLight(0xe8f0f6,0.95);gunKey.position.set(-0.9,0.75,-0.35);gunScene.add(gunKey);
var gunFill=new THREE.DirectionalLight(0xcdc6b8,0.42);gunFill.position.set(0.35,0.20,1.0);gunScene.add(gunFill);
var gunUnder=new THREE.DirectionalLight(0x3e4a50,0.22);gunUnder.position.set(0.2,-1.0,0.3);gunScene.add(gunUnder);
var gunRim=new THREE.DirectionalLight(0xadd6e4,0.48);gunRim.position.set(0.75,0.75,-0.9);gunScene.add(gunRim);
var GUN_KEY_BASE=0.95,GUN_FILL_BASE=0.42,gunLightLevel=1;
function updateViewModelLight(dt){
  var f=pool[0],near=0;
  if(f&&f.intensity>0){var d=Math.hypot(f.position.x-camera.position.x,f.position.z-camera.position.z);near=clamp(1-d/8,0,1);}
  var target=0.62+0.48*near;
  gunLightLevel=slerp(gunLightLevel,target,4,dt);
  gunKey.intensity=GUN_KEY_BASE*gunLightLevel;
  gunFill.intensity=GUN_FILL_BASE*(0.75+0.25*gunLightLevel);
}

/* Dynamic Viewmodel Muzzle Flash Light */
var gunMuzzleLight=new THREE.PointLight(0xffdf88,0,3.5);
gunMuzzleLight.position.set(0,0.03,-0.65);
gunScene.add(gunMuzzleLight);

/* Cached Geometry Generators */
var cylCache={};
function cg(rt,rb,h,seg){
  seg=seg||8;var k=rt+'|'+rb+'|'+h+'|'+seg;
  if(!cylCache[k])cylCache[k]=new THREE.CylinderGeometry(rt,rb,h,seg);
  return cylCache[k];
}
var sphCache={};
function sg(r,seg){
  var k=r+'_'+(seg||8);
  if(!sphCache[k])sphCache[k]=new THREE.SphereGeometry(r,seg||8,seg||8);
  return sphCache[k];
}
function sMesh(x,y,z,r,m,parent,seg){
  var s=new THREE.Mesh(sg(r,seg),m);s.position.set(x,y,z);
  if(parent)parent.add(s);return s;
}
function cMesh(x,y,z,rt,rb,h,m,parent,rx,ry,rz,seg){
  var c=new THREE.Mesh(cg(rt,rb,h,seg),m);c.position.set(x,y,z);
  if(rx||ry||rz)c.rotation.set(rx||0,ry||0,rz||0);
  if(parent)parent.add(c);return c;
}

/* Object-Pooled Casings System (0 GC Overhead) */
var CASING_MAX=36;
var casingPool=[];
var cGeos=[
  new THREE.CylinderGeometry(0.004,0.004,0.022,8),
  new THREE.CylinderGeometry(0.008,0.008,0.028,8),
  new THREE.CylinderGeometry(0.0035,0.0035,0.016,8),
  new THREE.BoxGeometry(0.012,0.012,0.024)
];
var cMats=[
  new THREE.MeshStandardMaterial({color:0xdfa638,metalness:0.94,roughness:0.18}),
  new THREE.MeshStandardMaterial({color:0xaa1818,metalness:0.35,roughness:0.45}),
  new THREE.MeshStandardMaterial({color:0xd49b36,metalness:0.92,roughness:0.20}),
  new THREE.MeshStandardMaterial({color:0x00d0ff,emissive:0x0066aa,roughness:0.3,metalness:0.7})
];
for(var ci=0;ci<CASING_MAX;ci++){
  var ctype=ci%4;
  var cm=new THREE.Mesh(cGeos[ctype],cMats[ctype]);
  cm.visible=false;gunRig.add(cm);
  casingPool.push({mesh:cm,type:ctype,life:0,vx:0,vy:0,vz:0,rx:0,ry:0});
}
var casingHead=0;
function spawnCasing(type){
  if(type===undefined)type=WEAPONS[P.curWpn].casingType;
  for(var i=0;i<CASING_MAX;i++){
    var idx=(casingHead+i)%CASING_MAX;
    var c=casingPool[idx];
    if(c.type===type&&c.life<=0){
      casingHead=(idx+1)%CASING_MAX;
      c.life=0.75;
      c.mesh.position.set(0.024,0.022,-0.20);
      c.mesh.rotation.set(Math.random()*TAU,Math.random()*TAU,Math.random()*TAU);
      c.mesh.visible=true;
      c.vx=1.20+Math.random()*0.4;
      c.vy=0.90+Math.random()*0.35;
      c.vz=-0.15+Math.random()*0.3;
      c.rx=(Math.random()-0.5)*28;c.ry=(Math.random()-0.5)*28;
      break;
    }
  }
}

/* Physical Dropped Magazine Floor Physics (0 GC Object Pool) */
var MAG_POOL_MAX=8;
var magPool=[];
var magGeos=[
  new THREE.BoxGeometry(0.024,0.16,0.065),
  new THREE.CylinderGeometry(0.009,0.009,0.055,8),
  new THREE.BoxGeometry(0.020,0.18,0.032),
  new THREE.BoxGeometry(0.036,0.08,0.060)
];
var magMats=[darkMat,shellRedMat,darkMat,steelMat];
var magHead=0;

for(var mi=0;mi<MAG_POOL_MAX;mi++){
  var mm=new THREE.Mesh(magGeos[0],magMats[0]);
  mm.visible=false;scene.add(mm);
  magPool.push({mesh:mm,type:0,life:0,vx:0,vy:0,vz:0,rx:0,ry:0,rz:0,bounced:false});
}

function spawnDroppedMag(type){
  // These materials are declared after the pool; resolve them when actually used.
  magMats=[darkMat,shellRedMat,darkMat,steelMat];
  var it=magPool[magHead];
  magHead=(magHead+1)%MAG_POOL_MAX;
  it.mesh.geometry=magGeos[type]||magGeos[0];
  it.mesh.material=magMats[type]||magMats[0];
  var fAim=forward(P.yaw,0);
  var rAim=[-fAim[2],0,fAim[0]];
  it.mesh.position.set(
    P.x+fAim[0]*0.35+rAim[0]*0.15,
    P.y+1.25,
    P.z+fAim[2]*0.35+rAim[2]*0.15
  );
  it.mesh.rotation.set(Math.random()*Math.PI,P.yaw+Math.random()*0.5,Math.random()*Math.PI);
  it.vx=rAim[0]*-0.20+(Math.random()-0.5)*0.1;
  it.vy=-0.6;
  it.vz=rAim[2]*-0.20+(Math.random()-0.5)*0.1;
  it.rx=(Math.random()-0.5)*8;
  it.ry=(Math.random()-0.5)*8;
  it.rz=(Math.random()-0.5)*8;
  it.life=7.0;
  it.bounced=false;
  it.mesh.visible=true;
}

function updateDroppedMags(dt){
  for(var mi=0;mi<MAG_POOL_MAX;mi++){
    var it=magPool[mi];
    if(it.life<=0||!it.mesh.visible)continue;
    it.life-=dt;
    if(it.life<=0){it.mesh.visible=false;continue;}
    it.vy-=9.8*dt;
    it.mesh.position.x+=it.vx*dt;
    it.mesh.position.y+=it.vy*dt;
    it.mesh.position.z+=it.vz*dt;
    it.mesh.rotation.x+=it.rx*dt;
    it.mesh.rotation.y+=it.ry*dt;
    it.mesh.rotation.z+=it.rz*dt;
    if(it.mesh.position.y<=0.05){
      it.mesh.position.y=0.05;
      if(Math.abs(it.vy)>0.35){
        it.vy=-it.vy*0.38;
        it.vx*=0.65;it.vz*=0.65;
        it.rx*=0.5;it.ry*=0.5;it.rz*=0.5;
        if(!it.bounced){it.bounced=true;sfxMagClatter();}
      }else{
        it.vy=0;it.vx*=0.90;it.vz*=0.90;it.rx=0;it.rz=0;
      }
    }
  }
}
function updateCasings(dt){
  for(var i=0;i<CASING_MAX;i++){
    var c=casingPool[i];
    if(c.life>0){
      c.life-=dt;
      if(c.life<=0){c.mesh.visible=false;continue;}
      c.vy-=9.8*dt*0.45;
      c.mesh.position.x+=c.vx*dt;c.mesh.position.y+=c.vy*dt;c.mesh.position.z+=c.vz*dt;
      c.mesh.rotation.x+=c.rx*dt;c.mesh.rotation.y+=c.ry*dt;
    }
  }
}

/* 5 first-person weapon view models & anatomical hands (three of them are stand-ins that
   js/models.js replaces with GLB models once those load) */
var wpnMeshes=[];
var shotgunPump=null,shotgunLeftHand=null,rifleBolt=null,gunTrigger=null,gunTriggerFinger=null;

/* Weapon finishes. Each family answers light differently so parts separate at a glance:
   anodised receiver, bare steel, polymer furniture, rubber, painted plate, tan polymer. */
function finish(o){
  var m=new THREE.MeshStandardMaterial({color:o.color,roughness:o.rough,metalness:o.metal});
  if(o.normal){m.normalMap=o.normal;m.normalScale=new THREE.Vector2(o.ns,o.ns);}
  if(o.roughMap)m.roughnessMap=o.roughMap;
  if(o.map)m.map=o.map;
  m.envMapIntensity=o.env;m.userData.envSet=true;
  return m;
}
var bodyMat=finish({color:0x23282c,normal:TX.weaponNormal,ns:0.35,roughMap:TX.weaponRough,rough:0.92,metal:0.72,env:.55});   /* anodised aluminium */
var darkMat=finish({color:0x17191b,normal:TX.polymerNormal,ns:0.45,rough:0.78,metal:0.06,env:.22});                             /* polymer furniture */
var steelMat=finish({color:0x8e979e,normal:TX.weaponNormal,ns:0.2,roughMap:TX.weaponRough,rough:0.62,metal:0.94,env:.75});     /* bare steel */
var brassMat=finish({color:0xdfa638,rough:0.16,metal:0.96,env:.8});
var magMat=finish({color:0x1a1c1e,normal:TX.polymerNormal,ns:0.35,rough:0.72,metal:0.08,env:.22});
var shellRedMat=finish({color:0xb01818,rough:0.35,metal:0.30,env:.4});
var rubberMat=finish({color:0x0c0d0e,rough:0.97,metal:0,env:.08});                                                              /* recoil pads, grip inserts */
var railPaintMat=finish({color:0x2b3330,normal:TX.weaponNormal,ns:0.3,roughMap:TX.weaponRough,rough:1.0,metal:0.42,env:.35});   /* painted heavy plate */
var fdeMat=finish({color:0x4a3f30,normal:TX.polymerNormal,ns:0.4,rough:0.82,metal:0.04,env:.2});                                 /* tan polymer */
var bodyMat=finish({color:0x1f2327,normal:TX.weaponNormal,ns:0.38,roughMap:TX.weaponRough,rough:0.88,metal:0.78,env:.62});   /* anodised aluminium / cerakote */
var darkMat=finish({color:0x141618,normal:TX.polymerNormal,ns:0.50,rough:0.82,metal:0.04,env:.20});                             /* stippled polymer furniture */
var steelMat=finish({color:0x98a2aa,normal:TX.weaponNormal,ns:0.22,roughMap:TX.weaponRough,rough:0.52,metal:0.96,env:.85});     /* bare machined steel */
var brassMat=finish({color:0xe2a838,rough:0.12,metal:0.98,env:.90});                                                             /* polished cartridge brass */
var magMat=finish({color:0x181a1c,normal:TX.polymerNormal,ns:0.38,rough:0.74,metal:0.06,env:.22});
var shellRedMat=finish({color:0xb21818,rough:0.32,metal:0.32,env:.45});
var rubberMat=finish({color:0x0b0c0d,rough:0.98,metal:0,env:.06});                                                              /* recoil pads, grip inserts */
var railPaintMat=finish({color:0x262e2c,normal:TX.weaponNormal,ns:0.32,roughMap:TX.weaponRough,rough:0.95,metal:0.46,env:.40}); /* painted heavy plate */
var fdeMat=finish({color:0x5a4d3b,normal:TX.polymerNormal,ns:0.42,rough:0.80,metal:0.04,env:.22});                             /* flat dark earth polymer */
var copperMat=finish({color:0xd97543,rough:0.18,metal:0.95,env:.85});                                                          /* polished copper accelerator rails */
var opticLensMat=new THREE.MeshStandardMaterial({
  color:0x2ae8bc,
  roughness:0.02,
  metalness:0.10,
  metalness:0.12,
  transparent:true,
  opacity:0.32
});
opticLensMat.envMapIntensity=1.4;opticLensMat.userData.envSet=true;

var opticLensRubyMat=new THREE.MeshStandardMaterial({
  color:0xff3344,
  roughness:0.02,
  metalness:0.25,
  transparent:true,
  opacity:0.38
});
opticLensRubyMat.envMapIntensity=1.6;opticLensRubyMat.userData.envSet=true;

var opticLensAmberMat=new THREE.MeshStandardMaterial({
  color:0xffaa33,
  roughness:0.02,
  metalness:0.18,
  transparent:true,
  opacity:0.34
});
opticLensAmberMat.envMapIntensity=1.5;opticLensAmberMat.userData.envSet=true;

/* Reflex-sight glass (carbine holographic sight, shotgun and SMG red dots): nearly clear with a
   faint coating tint, so the target stays sharp behind the reticle; a shade plane just inside the
   rear glass darkens the rim of the window the way coated glass does. depthWrite stays off so the
   reticle behind the glass is never lost to sorting. */
var reflexGlassMat=new THREE.MeshStandardMaterial({color:0xbfe6ff,roughness:0.03,metalness:0.10,transparent:true,opacity:0.09,depthWrite:false});
reflexGlassMat.envMapIntensity=1.1;reflexGlassMat.userData.envSet=true;
var reflexGlassRedMat=new THREE.MeshStandardMaterial({color:0xff5a66,roughness:0.03,metalness:0.10,transparent:true,opacity:0.06,depthWrite:false});
reflexGlassRedMat.envMapIntensity=1.1;reflexGlassRedMat.userData.envSet=true;
var reflexGlassAmberMat=new THREE.MeshStandardMaterial({color:0xffc060,roughness:0.03,metalness:0.10,transparent:true,opacity:0.10,depthWrite:false});
reflexGlassAmberMat.envMapIntensity=1.1;reflexGlassAmberMat.userData.envSet=true;
var reflexLinerMat=new THREE.MeshStandardMaterial({color:0x0b0c0d,roughness:0.92,metalness:0.08,side:THREE.BackSide});   /* matte inside of the tube sights */
reflexLinerMat.envMapIntensity=.05;reflexLinerMat.userData.envSet=true;
var lensShadeMat=new THREE.MeshBasicMaterial({map:TX.lensShade,transparent:true,depthWrite:false});
var lensShadeRoundMat=new THREE.MeshBasicMaterial({map:TX.lensShadeRound,transparent:true,depthWrite:false});
function lensShade(parent,x,y,z,w,h,round){var m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),round?lensShadeRoundMat:lensShadeMat);m.position.set(x,y,z);parent.add(m);return m;}

/* Operator materials: ripstop sleeves and synthetic-leather gloves with millimetre-scale
   texture. Mid-dark base tones keep them readable on small primitives. */
var sleeveMat=new THREE.MeshStandardMaterial({
  color:0xffffff,
  map:rep(TX.sleeve,4,3),
  normalMap:rep(TX.sleeveNormal,4,3),
  normalScale:new THREE.Vector2(0.60,0.60),
  roughness:0.94,
  metalness:0
});
sleeveMat.envMapIntensity=.14;sleeveMat.userData.envSet=true;

var gloveMat=new THREE.MeshStandardMaterial({
  color:0xffffff,
  map:rep(TX.glove,2,2),
  normalMap:rep(TX.gloveNormal,2,2),
  normalScale:new THREE.Vector2(0.55,0.55),
  roughness:0.82,
  metalness:0.03
});
gloveMat.envMapIntensity=.22;gloveMat.userData.envSet=true;

var knuckleMat=new THREE.MeshStandardMaterial({color:0x16181a,roughness:0.52,metalness:0.18});
knuckleMat.envMapIntensity=.30;knuckleMat.userData.envSet=true;

var knuckleCarbonMat=new THREE.MeshStandardMaterial({
  color:0x202428,
  map:rep(TX.carbonFiber,2,2),
  normalMap:rep(TX.carbonNormal,2,2),
  normalScale:new THREE.Vector2(0.85,0.85),
  roughness:0.30,
  metalness:0.42
});
knuckleCarbonMat.envMapIntensity=.65;knuckleCarbonMat.userData.envSet=true;

var palmPadMat=new THREE.MeshStandardMaterial({color:0x888e88,map:rep(TX.glove,2,2),roughness:0.95,metalness:0});
palmPadMat.envMapIntensity=.12;palmPadMat.userData.envSet=true;

var palmGripMat=new THREE.MeshStandardMaterial({
  color:0x2a2e2b,
  map:rep(TX.glove,3,3),
  normalMap:rep(TX.polymerNormal,2,2),
  roughness:0.96,
  metalness:0.02
});
palmGripMat.envMapIntensity=.10;palmGripMat.userData.envSet=true;

var cuffMat=new THREE.MeshStandardMaterial({color:0x848e8a,map:rep(TX.sleeve,3,1),roughness:0.90,metalness:0.02});
cuffMat.envMapIntensity=.12;cuffMat.userData.envSet=true;

var watchDialMat=new THREE.MeshBasicMaterial({map:TX.watchDial});
var holoMat=new THREE.MeshBasicMaterial({map:TX.holo,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false});
var shotgunReticleMat=new THREE.MeshBasicMaterial({map:TX.shotgunReticle,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false});
var reflexDotMat=new THREE.MeshBasicMaterial({map:TX.reflexDot,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false});
var railReticleMat=new THREE.MeshBasicMaterial({map:TX.railReticle,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false});
var cyanGlowMat=new THREE.MeshBasicMaterial({color:0x00f3ff});
var greenGlowMat=new THREE.MeshBasicMaterial({color:0x00ff88});
var redGlowMat=new THREE.MeshBasicMaterial({color:0xff2233});

/* Rounded machined edges catch the light without changing the weapon silhouette. */
var weaponBoxCache={};
function weaponBox(sx,sy,sz){
  if(Math.min(sx,sy,sz)<.012)return bg(sx,sy,sz);
  var key=sx+'|'+sy+'|'+sz;if(weaponBoxCache[key])return weaponBoxCache[key];
  var g=new THREE.BoxGeometry(sx,sy,sz,4,4,4),p=g.attributes.position,n=g.attributes.normal;
  var radius=Math.min(.003,Math.min(sx,sy,sz)*.16),v=new THREE.Vector3(),q=new THREE.Vector3();
  for(var i=0;i<p.count;i++){
    v.fromBufferAttribute(p,i);
    q.set(clamp(v.x,-sx/2+radius,sx/2-radius),clamp(v.y,-sy/2+radius,sy/2-radius),clamp(v.z,-sz/2+radius,sz/2-radius));
    v.sub(q).normalize();n.setXYZ(i,v.x,v.y,v.z);q.addScaledVector(v,radius);p.setXYZ(i,q.x,q.y,q.z);
  }
  g.computeBoundingSphere();weaponBoxCache[key]=g;return g;
}
function gMesh(x,y,z,sx,sy,sz,m,parent,rx,ry,rz){
  var b=new THREE.Mesh(weaponBox(sx,sy,sz),m);
  b.position.set(x,y,z);
  if(rx||ry||rz)b.rotation.set(rx||0,ry||0,rz||0);
  if(parent)parent.add(b);
  return b;
}

/* /* Forearm sleeve: an anatomically proportioned tapered cloth sleeve along local +Y (elbow at -Y, wrist at +Y)
   with realistic fabric folds, smooth tapering, and a snug cuff meeting the tactical glove cuff.
   handling.js dynamically anchors the elbow below screen frame and maintains realistic human arm length. */
function createAlignedForearm(parent,startPos,endPos,rElbow,rWrist,sleeveM,cuffM){
  var armGroup=new THREE.Group();
  armGroup.userData.skipBatch=true;
  parent.add(armGroup);
  var dir=new THREE.Vector3().subVectors(endPos,startPos),len=dir.length();
  armGroup.position.copy(startPos).add(endPos).multiplyScalar(0.5);
  armGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.clone().normalize());
  var profile=[[-.5,1],[-.42,1.01],[-.32,.94],[-.24,.96],[-.15,.88],[-.02,.84],[.10,.78],[.25,.72],[.38,.65],[.50,rWrist/rElbow]];
  var sleeveGeometry=new THREE.LatheGeometry(profile.map(function(p){return new THREE.Vector2(rElbow*p[1],len*p[0]);}),14);
  var sleeveBody=new THREE.Mesh(sleeveGeometry,sleeveM);sleeveBody.scale.z=.88;sleeveBody.userData.keep=true;armGroup.add(sleeveBody);
  for(var wi=0;wi<2;wi++){
    var fy=-len*0.28+wi*len*0.22,fr=rWrist+(rElbow-rWrist)*(0.45+wi*0.18);
    var fold=new THREE.Mesh(cg(fr*1.02,fr*1.002,len*0.032,12),sleeveM);
    fold.position.y=fy;fold.userData.keep=true;armGroup.add(fold);
  }
  var cuff=new THREE.Mesh(cg(rWrist*1.08,rWrist*1.04,len*0.06,14),cuffM||knuckleMat);
  cuff.position.y=len*0.47;cuff.userData.keep=true;armGroup.add(cuff);
  var band=gMesh(rWrist*0.96,len*0.47,0,0.006,len*0.05,0.020,knuckleMat,armGroup);
  band.userData.keep=true;
  armGroup.userData.baseLength=len;
  return armGroup;
}

/* One finger: nested segment groups so each joint curls about its own knuckle.
   Preserves joint hierarchy and avoids merging so knuckles can animate during reloads,
   trigger pulls, and weapon inspection. */
function makeFinger(parent,pos,yaw,pitch,roll,lens,r,curls,noPlates){
  var root=new THREE.Group();
  root.userData.skipBatch=true;
  root.position.copy(pos);root.rotation.set(pitch,yaw,roll,'YXZ');parent.add(root);
  var cur=root,n=lens.length,segs=[];
  for(var i=0;i<n;i++){
    var seg=new THREE.Group();
    seg.userData.skipBatch=true;
    if(i>0)seg.position.z=-lens[i-1];
    seg.rotation.x=-curls[i];
    seg.userData.baseRotX=-curls[i];
    cur.add(seg);
    segs.push(seg);
    var ri=r*(1-i*0.10),last=i===n-1;
    // Anatomical finger shaft with Kevlar weave
    var shaft=new THREE.Mesh(cg(ri*0.94,ri,lens[i],10),last?palmPadMat:gloveMat);
    shaft.userData.keep=true;
    shaft.rotation.x=-Math.PI/2;shaft.position.z=-lens[i]/2;seg.add(shaft);
    // Articulated joint capsule
    var joint=new THREE.Mesh(sg(ri*1.02,10),gloveMat);
    joint.userData.keep=true;
    seg.add(joint);
    // High-friction silicone grip pad on inside contact surface
    var gripPad=gMesh(0,-ri*0.75,-lens[i]/2,ri*1.3,ri*0.42,lens[i]*0.80,palmGripMat,seg);
    gripPad.userData.keep=true;
    // Reinforced tactile fingertip on distal phalanx
    if(last){
      var tip=new THREE.Mesh(sg(ri*0.94,10),palmPadMat);tip.userData.keep=true;tip.position.z=-lens[i];seg.add(tip);
      var seam=cMesh(0,-ri*0.3,-lens[i]*0.85,ri*0.96,ri*0.96,lens[i]*0.24,knuckleMat,seg,1.57,0,0,8);seam.userData.keep=true;
    }
    // Molded carbon-fiber protective knuckle shield on proximal & intermediate phalanges
    if(i<2&&!noPlates){
      var plateMat = (i===0) ? knuckleCarbonMat : knuckleMat;
      var plate=gMesh(0,ri*0.72,-lens[i]/2,ri*1.55,ri*0.58,lens[i]*0.72,plateMat,seg);
      plate.userData.keep=true;
      // Chamfered side facets
      var plateChamfer=gMesh(0,ri*0.90,-lens[i]/2,ri*1.1,ri*0.25,lens[i]*0.60,knuckleMat,seg);
      plateChamfer.userData.keep=true;
    }
    cur=seg;
  }
  root.userData.joints=segs;
  root.userData.baseCurls=curls.slice();
  return root;
}

/* A tactical gloved hand in canonical space: palm facing -Y, fingers toward -Z, wrist at +Z.
   side is +1 for right hand, -1 for left hand. */
var HAND_W=0.054,HAND_T=0.022,HAND_L=0.068;
function makeHand(parent,side,pose){
  var h=new THREE.Group();h.userData.skipBatch=true;parent.add(h);
  var W=HAND_W,T=HAND_T,L=pose.L||HAND_L;
  // Ergonomic palm core with breathable Kevlar fabric
  var palm=gMesh(0,0,0,W,T,L,gloveMat,h);palm.userData.keep=true;
  // Contoured thenar & hypothenar muscular pads
  var hypothenar=gMesh(side*W*0.26,-T*0.5+0.002,L*0.12,W*0.42,0.008,L*0.50,palmGripMat,h);hypothenar.userData.keep=true;
  var thenarPad=gMesh(side*-W*0.20,-T*0.5+0.003,L*0.16,W*0.44,0.007,L*0.42,palmGripMat,h);thenarPad.userData.keep=true;
  // Molded carbon-fiber main knuckle armor plate across the 4 metacarpophalangeal joints
  var mainKnuckle=gMesh(0,T*0.5+0.001,-L*0.18,W*0.86,0.011,L*0.32,knuckleCarbonMat,h);mainKnuckle.userData.keep=true;
  for(var ki=0;ki<4;ki++){
    var kx=(ki-1.5)*(W*0.20);
    var kridge=cMesh(kx,T*0.5+0.008,-L*0.18,0.0045,0.0045,L*0.26,knuckleMat,h,1.57,0,0,8);
    kridge.userData.keep=true;
  }
  // Breathable dorsal flex vents behind the knuckle shield
  for(var vi=0;vi<3;vi++){
    var vz=L*0.06+vi*0.010;
    var vent=gMesh(0,T*0.5-0.001,vz,W*0.62,0.004,0.005,knuckleMat,h);vent.userData.keep=true;
  }
  // Tactical cinch strap with velcro and stainless steel D-ring buckle
  var strap=gMesh(0,T*0.5-0.001,L*0.34,W*0.68,0.007,L*0.16,knuckleMat,h);strap.userData.keep=true;
  var buckle=gMesh(side*W*0.32,T*0.5+0.003,L*0.34,0.008,0.005,0.016,steelMat,h);buckle.userData.keep=true;
  // Snug neoprene wrist cuff
  var cuff=new THREE.Mesh(cg(0.021,0.020,0.022,14),cuffMat);cuff.userData.keep=true;
  cuff.rotation.x=Math.PI/2;cuff.position.set(0,0.001,L*0.5+0.006);cuff.scale.set(1.22,1,0.74);h.add(cuff);

  var fx=[-0.0190,-0.0063,0.0063,0.0190];
  var fl=[[0.020,0.012,0.010],[0.022,0.013,0.010],[0.020,0.012,0.010],[0.015,0.010,0.008]];
  var fr=[0.0058,0.0060,0.0056,0.0048];
  var kz=-L*0.5+0.003,fingers=[];
  for(var i=0;i<4;i++){
    var c=pose.curls[Math.min(i,pose.curls.length-1)];
    var yaw=side*(1.5-i)*0.035;
    if(i===0&&pose.trigger){
      var tg=new THREE.Group();tg.userData.skipBatch=true;tg.position.set(side*fx[i],-0.002,kz);h.add(tg);
      var tf=makeFinger(tg,new THREE.Vector3(0,0,0),yaw+side*(pose.triggerYaw||0),pose.triggerPitch||0,0,fl[i],fr[i],pose.triggerCurls||c);
      h.userData.trigger=tg;
      tg.userData.homePos=tg.position.clone();
      tg.userData.homeRot=tg.rotation.clone();
      tg.userData.finger=tf;
      fingers.push(tg);
    }else{
      fingers.push(makeFinger(h,new THREE.Vector3(side*fx[i],-0.002,kz),yaw,0,0,fl[i],fr[i],c));
    }
  }
  var tb=pose.thumbBase||[-0.028,0.002,0.24];
  var thumb=makeFinger(h,new THREE.Vector3(side*tb[0],tb[1],L*tb[2]),side*(pose.thumbYaw||0),
    pose.thumbPitch||0,side*(pose.thumbRoll||0),pose.thumbLens||[0.020,0.016,0.013],0.0068,pose.thumbCurls||[0.18,0.30,0.22],true);
  var thenar=sMesh(side*-0.020,-0.002,L*tb[2],0.012,gloveMat,h,10);thenar.userData.keep=true;
  h.userData.fingers=fingers;h.userData.thumb=thumb;
  h.userData.wrist=new THREE.Vector3(0,0.002,L*0.5+0.010);
  return h;
}

function orientHand(group,n,f){
  var y=n.clone().normalize().negate(),z=f.clone().normalize().negate(),x=new THREE.Vector3().crossVectors(y,z).normalize();
  group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z));
}

/* Arms and hands for one weapon.
   Firing hand: ergonomically wrapped around pistol grip with index finger on trigger and thumb along receiver.
   Support hand: customized per weapon type (C-clamp for rifle, pump grip for shotgun, compact foregrip for SMG, chassis hold for railgun). */
function buildRealisticHands(parent,leftHandPos,rightHandPos,leftParent,gripTilt,wpnType){
  gripTilt=gripTilt===undefined?-0.32:gripTilt;
  wpnType=wpnType||'carbine';

  // --- 1. FIRING HAND (Right Hand - firmly on pistol grip) ---
  var rArm=new THREE.Group();rArm.userData.skipBatch=true;
  rArm.position.copy(rightHandPos||new THREE.Vector3(0.025,-0.070,-0.074));
  orientHand(rArm,new THREE.Vector3(-1,0,0),new THREE.Vector3(0,Math.sin(gripTilt),-Math.cos(gripTilt)));
  parent.add(rArm);

  var rHand=makeHand(rArm,1,{
    curls:[[1.36,0.40,0.90],[1.38,0.42,0.85],[1.38,0.40,0.70],[1.35,0.38,0.60]],
    trigger:true,triggerCurls:[0.28,0.68,0.45],triggerYaw:1.08,triggerPitch:0.0,
    thumbBase:[-0.028,-0.005,0.26],thumbLens:[0.026,0.016,0.013],
    thumbYaw:0.12,thumbPitch:-1.25,thumbRoll:0,thumbCurls:[0,-0.65,-0.65]
  });
  var triggerFinger=rHand.userData.trigger;
  rArm.userData.wrist=rHand.userData.wrist.clone();
  rArm.userData.hand=rHand;
  rArm.userData.forearm=createAlignedForearm(rArm,new THREE.Vector3(0.06,-0.26,0.16),rArm.userData.wrist,0.035,0.021,sleeveMat,cuffMat);

  // --- 2. SUPPORT HAND (Left Hand - customized per weapon) ---
  var lArm=new THREE.Group();lArm.userData.skipBatch=true;
  (leftParent||parent).add(lArm);

  var lHand;
  if(wpnType==='shotgun'){
    // Breacher-12 Shotgun: Tactical cylindrical pump wrap
    lArm.position.copy(leftHandPos||new THREE.Vector3(-0.024,-0.014,0.01));
    orientHand(lArm,new THREE.Vector3(0.707,0.707,0),new THREE.Vector3(0.707,-0.707,0));
    lHand=makeHand(lArm,-1,{
      L:0.056,
      curls:[[1.30,0.65,0.50],[1.30,0.65,0.50],[1.32,0.68,0.50],[1.35,0.70,0.50]],
      thumbBase:[-0.027,0.002,0.12],thumbYaw:1.40,thumbPitch:-0.22,thumbRoll:0,thumbCurls:[0.15,0.25,0.20]
    });
  }else if(wpnType==='smg'){
    // Vector-9 SMG: Compact CQB foregrip / magwell hold
    lArm.position.copy(leftHandPos||new THREE.Vector3(-0.024,-0.006,-0.23));
    orientHand(lArm,new THREE.Vector3(0.92,0.38,0),new THREE.Vector3(0,-0.85,-0.52));
    lHand=makeHand(lArm,-1,{
      L:0.054,
      curls:[[1.10,0.48,0.42],[1.10,0.48,0.42],[1.12,0.50,0.42],[1.15,0.52,0.42]],
      thumbBase:[-0.026,0.002,0.10],thumbYaw:1.48,thumbPitch:-0.18,thumbRoll:0,thumbCurls:[0.10,0.12,0.08]
    });
  }else if(wpnType==='railgun'){
    // Apex-50 Railgun: Heavy industrial chassis hold
    lArm.position.copy(leftHandPos||new THREE.Vector3(-0.032,-0.008,-0.36));
    orientHand(lArm,new THREE.Vector3(0.78,0.62,0),new THREE.Vector3(0.62,-0.78,-0.05));
    lHand=makeHand(lArm,-1,{
      L:0.058,
      curls:[[1.05,0.40,0.35],[1.05,0.40,0.35],[1.08,0.42,0.35],[1.12,0.45,0.38]],
      thumbBase:[-0.028,0.003,0.12],thumbYaw:1.52,thumbPitch:-0.10,thumbRoll:0,thumbCurls:[0.05,0.08,0.06]
    });
  }else{
    // RM-4 Viper Carbine: Modern operator C-clamp / thumb-over-bore on handguard
    lArm.position.copy(leftHandPos||new THREE.Vector3(-0.028,0.016,-0.34));
    orientHand(lArm,new THREE.Vector3(0.85,0.52,0),new THREE.Vector3(0.15,-0.85,-0.50));
    lHand=makeHand(lArm,-1,{
      L:0.056,
      curls:[[1.15,0.55,0.45],[1.15,0.55,0.45],[1.18,0.58,0.45],[1.22,0.60,0.45]],
      thumbBase:[-0.028,0.002,0.12],thumbYaw:1.55,thumbPitch:-0.10,thumbRoll:0,thumbCurls:[0.05,0.08,0.05]
    });
  }

  lArm.userData.wrist=lHand.userData.wrist.clone();
  lArm.userData.hand=lHand;
  lArm.userData.forearm=createAlignedForearm(lArm,new THREE.Vector3(-0.06,-0.26,0.16),lArm.userData.wrist,0.035,0.021,sleeveMat,cuffMat);

  // Tactical OLED Combat Wrist Watch on Operator's Left Wrist (Facing Camera)
  var watchGroup=new THREE.Group();watchGroup.userData.skipBatch=true;
  watchGroup.position.set(0,0.014,HAND_L*0.5+0.012);
  lArm.add(watchGroup);
  // Rugged titanium armor chassis & knurled buttons
  var watchCase=gMesh(0,0,0,0.026,0.008,0.022,darkMat,watchGroup);watchCase.userData.keep=true;
  var watchBezel=gMesh(0,0.0042,0,0.022,0.002,0.018,steelMat,watchGroup);watchBezel.userData.keep=true;
  var watchScreen=new THREE.Mesh(new THREE.PlaneGeometry(0.019,0.015),watchDialMat);
  watchScreen.userData.keep=true;watchScreen.rotation.x=-Math.PI/2;watchScreen.position.y=0.0055;watchGroup.add(watchScreen);
  var watchBtn=cMesh(0.014,0,0,0.0025,0.0025,0.004,steelMat,watchGroup,0,0,1.57,8);watchBtn.userData.keep=true;
  var statusLed=sMesh(-0.008,0.0055,-0.007,0.0015,greenGlowMat,watchGroup,8);statusLed.userData.keep=true;

  gunTriggerFinger=triggerFinger;
  parent.userData.rArm=rArm;parent.userData.lArm=lArm;parent.userData.triggerFinger=triggerFinger;
  return {rArm:rArm,lArm:lArm,triggerFinger:triggerFinger};
}

/* 1. BUILD CARBINE (RM-4 VIPER - AAA TACTICAL M4A1 / HK416) */
(function buildCarbine(){
  var gRifle=new THREE.Group();

  /* Upper Receiver with CNC Chamfers & Brass Deflector */
  gMesh(0, 0.022, -0.18, 0.032, 0.036, 0.22, bodyMat, gRifle);
  // Top 45-degree chamfers
  gMesh(-0.012, 0.038, -0.18, 0.008, 0.008, 0.22, bodyMat, gRifle, 0, 0, 0.785);
  gMesh( 0.012, 0.038, -0.18, 0.008, 0.008, 0.22, bodyMat, gRifle, 0, 0, -0.785);
  // Full-length Picatinny rail with individually milled cross-slots
  gMesh(0, 0.043, -0.22, 0.022, 0.007, 0.32, darkMat, gRifle);
  for(var ti=0;ti<12;ti++){
    gMesh(0, 0.046, -0.08 - ti*0.022, 0.024, 0.003, 0.011, darkMat, gRifle);
  }
  // Ambidextrous T-charging handle with release latch
  gMesh(0, 0.038, -0.05, 0.038, 0.008, 0.016, steelMat, gRifle);
  cMesh(0.016, 0.038, -0.05, 0.003, 0.003, 0.014, steelMat, gRifle, 0, 0, 1.57);
  // Right-side Brass deflector wedge & Forward assist
  gMesh(0.020, 0.024, -0.10, 0.012, 0.018, 0.026, bodyMat, gRifle, 0, 0.2, 0);
  cMesh(0.022, 0.026, -0.08, 0.0055, 0.0055, 0.022, steelMat, gRifle, 0, 0, -0.6, 8);
  // Ejection port cavity, hinged dust cover & bolt carrier group
  gMesh(0.017, 0.024, -0.19, 0.004, 0.020, 0.065, darkMat, gRifle);
  gMesh(0.019, 0.013, -0.19, 0.003, 0.008, 0.062, darkMat, gRifle, 0.35, 0, 0);
  var bolt = gMesh(0.016, 0.024, -0.19, 0.006, 0.016, 0.050, steelMat, gRifle);
  bolt.userData.keep = true;
  gMesh(0.016, 0.020, -0.18, 0.004, 0.008, 0.024, brassMat, bolt);
  rifleBolt = bolt; window.rifleBolt = bolt;

  /* Lower Receiver with Flared Magwell & Engravings */
  gMesh(0, -0.015, -0.16, 0.034, 0.046, 0.20, bodyMat, gRifle);
  // Flared magazine well lips
  gMesh(0, -0.040, -0.22, 0.036, 0.012, 0.082, bodyMat, gRifle);
  gMesh(0.018, -0.015, -0.21, 0.004, 0.014, 0.014, darkMat, gRifle);
  cMesh(-0.018, -0.008, -0.11, 0.004, 0.004, 0.008, steelMat, gRifle, 0, 0, 1.57, 6);
  // Integrated trigger guard & curved steel trigger
  gMesh(0, -0.044, -0.125, 0.012, 0.004, 0.045, darkMat, gRifle);
  var trig = gMesh(0, -0.034, -0.125, 0.004, 0.016, 0.006, steelMat, gRifle);
  trig.userData.keep = true;   /* animated: stays out of the static batch */
  gunTrigger = trig;

  /* M-LOK Free-Float Handguard with Cooling Slots & Gas System */
  cMesh(0, 0.024, -0.38, 0.022, 0.022, 0.20, bodyMat, gRifle, 1.57, 0, 0, 8);
  for(var si=0; si<4; si++){
    var sz = -0.31 - si*0.038;
    gMesh(-0.023, 0.024, sz, 0.003, 0.010, 0.024, darkMat, gRifle);
    gMesh( 0.023, 0.024, sz, 0.003, 0.010, 0.024, darkMat, gRifle);
    gMesh(0, 0.002, sz, 0.012, 0.003, 0.024, darkMat, gRifle);
  }
  // Match-grade steel barrel & low-profile gas block
  cMesh(0, 0.024, -0.47, 0.0075, 0.0075, 0.34, steelMat, gRifle, 1.57, 0, 0, 12);
  cMesh(0, 0.032, -0.48, 0.0035, 0.0035, 0.26, steelMat, gRifle, 1.57, 0, 0, 8);
  gMesh(0, 0.028, -0.52, 0.018, 0.024, 0.022, darkMat, gRifle);
  // A2 Birdcage Flash Hider with 5 compensation slots
  cMesh(0, 0.024, -0.66, 0.011, 0.011, 0.046, steelMat, gRifle, 1.57, 0, 0, 10);
  for(var csi=0; csi<5; csi++){
    gMesh(0, 0.024, -0.66, 0.024, 0.005, 0.024, darkMat, gRifle, 0, 0, csi*0.628);
  }

  /* Tactical Accessories: PEQ-15 ATPIAL & Surefire Weapon Light */
  gMesh(0.018, 0.046, -0.34, 0.026, 0.018, 0.065, bodyMat, gRifle);
  cMesh(0.018, 0.057, -0.32, 0.007, 0.007, 0.008, darkMat, gRifle, 0, 0, 0, 8);
  cMesh(0.022, 0.046, -0.375, 0.0045, 0.0045, 0.006, brassMat, gRifle, 1.57, 0, 0, 8);
  cMesh(-0.032, 0.035, -0.42, 0.0085, 0.0085, 0.080, darkMat, gRifle, 1.57, 0, 0, 10);
  cMesh(-0.032, 0.035, -0.465, 0.0105, 0.009, 0.015, steelMat, gRifle, 1.57, 0, 0, 10);
  cMesh(-0.032, 0.035, -0.472, 0.008, 0.008, 0.002, opticLensMat, gRifle, 1.57, 0, 0, 10);

  /* Magpul PMAG 30-Round Curved Magazine with Round-Count Window */
  var mag = new THREE.Group();
  mag.position.set(0, -0.040, -0.21);
  mag.rotation.x = 0.14;
  gRifle.add(mag);
  gMesh(0, -0.075, 0, 0.024, 0.15, 0.065, magMat, mag);
  gMesh(0, -0.155, 0.004, 0.028, 0.012, 0.074, darkMat, mag);
  for(var ri=0; ri<5; ri++){
    gMesh(0, -0.035 - ri*0.022, 0, 0.026, 0.006, 0.062, darkMat, mag);
  }
  gMesh(0.013, -0.075, 0.002, 0.002, 0.09, 0.022, brassMat, mag);
  gMesh(0.0135, -0.075, 0.002, 0.002, 0.095, 0.025, opticLensMat, mag);
  mag.userData.initialY = -0.040;
  gRifle.userData.mag = mag;

  /* Magpul MOE Pistol Grip & CTR Collapsible Stock */
  var grip = gMesh(0, -0.085, -0.085, 0.028, 0.11, 0.048, darkMat, gRifle);
  grip.rotation.x = -0.32;
  var gripPanel = gMesh(0.0145, -0.09, -0.085, 0.002, 0.06, 0.03, rubberMat, gRifle); gripPanel.rotation.x = -0.32;   /* rubber side insert */
  gMesh(0, -0.038, -0.07, 0.024, 0.025, 0.020, darkMat, gRifle);
  cMesh(0, 0.024, 0.03, 0.012, 0.012, 0.16, steelMat, gRifle, 1.57, 0, 0, 10);                                          /* buffer tube */
  gMesh(0, 0.015, 0.07, 0.036, 0.068, 0.14, darkMat, gRifle);
  gMesh(0, 0.008, 0.145, 0.038, 0.095, 0.018, rubberMat, gRifle);                                                       /* butt pad */
  gMesh(-0.019, -0.012, -0.11, 0.003, 0.004, 0.018, steelMat, gRifle, 0, 0, 0.5);                                       /* selector lever */
  cMesh(0.018, -0.02, -0.215, 0.004, 0.004, 0.004, steelMat, gRifle, 0, 0, 1.57, 8);                                    /* mag release */
  gMesh(0.020, 0.005, -0.16, 0.002, 0.012, 0.03, steelMat, gRifle);                                                     /* serial plate */
  cMesh(0, 0.004, 0.03, 0.005, 0.005, 0.01, steelMat, gRifle, 0, 0, 1.57, 8);                                           /* QD sling cup */

  /* Tube red dot (the same MRO-style sight as the SMG): a hollow tube looked through at ADS, with
     a flared front bell, a matte liner, nearly clear glass and a crisp 2 MOA dot */
  var opticZ = -0.20, opticY = 0.068;
  // The sight lives in its own group so it can be re-seated on a different rifle model
  var optic=new THREE.Group();optic.position.set(0,opticY,opticZ);gRifle.add(optic);gRifle.userData.optic=optic;
  // Riser mount with QD throw-lever clamp and a saddle under the tube
  gMesh(0, 0.048-opticY, 0, 0.030, 0.008, 0.070, darkMat, optic);
  cMesh(0.018, 0.048-opticY, -0.01, 0.0045, 0.0045, 0.010, steelMat, optic, 0, 0, 1.57, 8);
  gMesh(0.022, 0.048-opticY, -0.01, 0.003, 0.006, 0.022, steelMat, optic, 0, 0, 0.35);
  gMesh(0, 0.057-opticY, 0, 0.020, 0.010, 0.040, darkMat, optic);
  var rdTube=new THREE.Mesh(new THREE.CylinderGeometry(0.015,0.015,0.054,14,1,true),bodyMat);rdTube.rotation.x=1.57;optic.add(rdTube);
  var rdBell=new THREE.Mesh(new THREE.CylinderGeometry(0.0175,0.015,0.014,14,1,true),bodyMat);rdBell.rotation.x=1.57;rdBell.position.z=-0.028;optic.add(rdBell);
  var rdLiner=new THREE.Mesh(new THREE.CylinderGeometry(0.0142,0.0142,0.066,14,1,true),reflexLinerMat);rdLiner.rotation.x=1.57;rdLiner.position.z=-0.004;optic.add(rdLiner);
  // Brightness dial on top, windage turret on the side
  cMesh(0, 0.016, 0, 0.007, 0.007, 0.008, darkMat, optic, 0, 0, 0, 12);
  cMesh(0.016, 0, 0, 0.005, 0.005, 0.006, steelMat, optic, 0, 0, 1.57, 10);
  // Glass: red notch-coated objective, clear ocular, shaded rim
  cMesh(0, 0, -0.026, 0.0145, 0.0145, 0.002, reflexGlassRedMat, optic, 1.57, 0, 0, 14);
  cMesh(0, 0, 0.024, 0.0135, 0.0135, 0.002, reflexGlassMat, optic, 1.57, 0, 0, 14);
  lensShade(optic, 0, 0, 0.020, 0.029, 0.029, true);
  // 2 MOA red dot
  var holo = new THREE.Mesh(new THREE.PlaneGeometry(0.018, 0.018), reflexDotMat);
  holo.position.set(0, opticY, opticZ - 0.004);
  gRifle.add(holo);
  gRifle.userData.holo = holo;
  gRifle.userData.opticReticle = holo;
  gRifle.userData.opticY = opticY;
  gRifle.userData.opticZ = opticZ;

  var arms = buildRealisticHands(gRifle, new THREE.Vector3(-0.028, 0.016, -0.34), new THREE.Vector3(0.025, -0.070, -0.077), null, -0.32, 'carbine');
  gRifle.userData.lArm = arms.lArm;
  gunRig.add(gRifle);
  wpnMeshes.push(gRifle);
})();

/* 2. BUILD SHOTGUN (S1897 PUMP 12-GAUGE) */
(function buildShotgun(){
  var gShot=new THREE.Group();
  // Heavy milled steel receiver
  gMesh(0,0.01,-0.16,0.038,0.052,0.26,bodyMat,gShot);
  gMesh(0,0.038,-0.16,0.024,0.006,0.22,darkMat,gShot);
  // Ghost ring rear sight: an actual ring on a short base, level with the front blade, so the
  // shotgun is aimed through it and over the bead (no optic on this gun)
  gMesh(0,0.049,-0.08,0.012,0.016,0.008,darkMat,gShot);
  var ghostRing=new THREE.Mesh(new THREE.RingGeometry(0.0080,0.0102,16),darkMat);ghostRing.position.set(0,0.066,-0.0785);gShot.add(ghostRing);
  var ghostRim=new THREE.Mesh(new THREE.CylinderGeometry(0.0102,0.0102,0.003,16,1,true),darkMat);ghostRim.rotation.x=1.57;ghostRim.position.set(0,0.066,-0.08);gShot.add(ghostRim);
  // Receiver top Picatinny optic rail
  for(var si=0;si<6;si++) gMesh(0, 0.041, -0.09 - si*0.022, 0.024, 0.003, 0.010, steelMat, gShot);

  // Heavy 12-Gauge Tactical Barrel & Magazine Tube
  cMesh(0,0.024,-0.48,0.012,0.012,0.48,steelMat,gShot,1.57,0,0,12);
  cMesh(0,0.002,-0.44,0.010,0.010,0.40,darkMat,gShot,1.57,0,0,10);
  cMesh(0,0.002,-0.645,0.011,0.011,0.015,steelMat,gShot,1.57,0,0,10); // Knurled magazine endcap
  // Barrel clamp bracket with QD sling swivel mount
  gMesh(0, 0.013, -0.62, 0.028, 0.032, 0.014, steelMat, gShot);
  cMesh(0.016, 0.013, -0.62, 0.0035, 0.0035, 0.006, steelMat, gShot, 0, 0, 1.57, 8);

  // Ventilated top rib on barrel
  gMesh(0, 0.038, -0.48, 0.008, 0.004, 0.44, steelMat, gShot);
  for(var ri=0;ri<6;ri++) gMesh(0, 0.038, -0.30 - ri*0.06, 0.009, 0.005, 0.012, bodyMat, gShot);

  // Door-breaching aggressive jagged muzzle brake with radial compensation ports
  cMesh(0,0.024,-0.73,0.0145,0.014,0.048,steelMat,gShot,1.57,0,0,12);
  for(var bi=0;bi<6;bi++) cMesh(0, 0.024, -0.73, 0.0175, 0.0175, 0.006, darkMat, gShot, 1.57, 0, bi*1.047, 8);

  // Co-witnessed front combat sight with luminous green tritium vial
  // (raised to the ghost ring's height: the bead sits just above the ring's centre at ADS)
  var frontY = 0.068;
  gMesh(0, 0.052, -0.725, 0.010, 0.030, 0.018, steelMat, gShot);
  cMesh(0, frontY, -0.725, 0.0025, 0.0025, 0.010, greenGlowMat, gShot, 1.57, 0, 0, 8);
  gMesh(-0.006, frontY, -0.725, 0.002, 0.012, 0.012, steelMat, gShot);
  gMesh( 0.006, frontY, -0.725, 0.002, 0.012, 0.012, steelMat, gShot);
  // No optic on the shotgun: it is aimed through the ghost ring over the tritium bead.

  // Tactical Ribbed Forend Pump with Handstop
  var pump=new THREE.Group();pump.position.set(0,0.002,-0.38);gShot.add(pump);
  cMesh(0,0,0,0.021,0.021,0.18,darkMat,pump,1.57,0,0,10);
  for(var pi=0;pi<8;pi++)cMesh(0,0,-0.07+pi*0.02,0.023,0.023,0.008,bodyMat,pump,1.57,0,0,10);
  gMesh(0,-0.025,-0.08,0.018,0.022,0.016,darkMat,pump); // Front handstop
  // Dual steel action bars connecting pump to receiver bolt
  gMesh( 0.019, 0.014, 0.04, 0.003, 0.006, 0.14, steelMat, pump);
  gMesh(-0.019, 0.014, 0.04, 0.003, 0.006, 0.14, steelMat, pump);
  shotgunPump=pump;gShot.userData.pump=pump;

  // Receiver-Mounted Side-Saddle Shell Carrier with 6 Red 12-Gauge Magnum Shells
  gMesh(-0.023,0.01,-0.16,0.006,0.038,0.22,darkMat,gShot);
  for(var ssi=0;ssi<6;ssi++){
    var sz=-0.245+ssi*0.034;
    cMesh(-0.026,0.01,sz,0.009,0.009,0.052,shellRedMat,gShot,1.57,0,0,8);
    cMesh(-0.026,0.01,sz+0.024,0.0092,0.0092,0.010,brassMat,gShot,1.57,0,0,8);
    cMesh(-0.026,0.01,sz+0.029,0.003,0.003,0.001,copperMat,gShot,1.57,0,0,6); // primer
  }

  // Ergonomic Pistol Grip & Tactical Stock
  var grip=gMesh(0,-0.075,-0.08,0.028,0.11,0.048,darkMat,gShot);grip.rotation.x=-0.35;
  gMesh(0,0.01,0.08,0.032,0.065,0.16,darkMat,gShot);
  gMesh(0,0.005,0.165,0.034,0.090,0.016,rubberMat,gShot); // Rubber recoil pad
  gMesh(0,0.048,0.05,0.016,0.006,0.05,steelMat,gShot);     // steel receiver top strap
  cMesh(0.02,0.0,-0.13,0.004,0.004,0.004,steelMat,gShot,0,0,1.57,8);   // action release button
  gMesh(0.021,0.004,-0.20,0.002,0.02,0.05,steelMat,gShot); // ejection port lip

  var arms = buildRealisticHands(gShot, new THREE.Vector3(-0.024, -0.014, 0.01), new THREE.Vector3(0.025, -0.062, -0.073), pump, -0.35, 'shotgun');
  shotgunLeftHand = arms.lArm;
  gShot.userData.lArm = arms.lArm;
  gShot.visible=false;gunRig.add(gShot);wpnMeshes.push(gShot);
})();

/* 3. BUILD SMG (VECTOR-9 SUPER-V RECOIL MITIGATION) */
(function buildSMG(){
  var gSmg=new THREE.Group();
  // Super-V Angled Recoil Mitigation Receiver Housing
  gMesh(0,0.02,-0.16,0.032,0.045,0.22,bodyMat,gSmg);
  gMesh(0,-0.035,-0.19,0.030,0.075,0.10,darkMat,gSmg,0.40,0,0); // downward angled inertia block housing
  // Super-V mechanical slider inspection window & silver inertia bolt
  gMesh(0.017, -0.035, -0.19, 0.002, 0.050, 0.065, steelMat, gSmg, 0.40, 0, 0);
  gMesh(-0.017, -0.035, -0.19, 0.002, 0.050, 0.065, steelMat, gSmg, 0.40, 0, 0);
  // Full-length top Picatinny rail
  gMesh(0,0.045,-0.18,0.022,0.006,0.24,darkMat,gSmg);
  for(var ti=0;ti<10;ti++)gMesh(0,0.048,-0.08-ti*0.022,0.024,0.003,0.010,darkMat,gSmg);

  // Ejection port with extractor claw & silver bolt carrier
  gMesh(0.017, 0.022, -0.18, 0.004, 0.018, 0.055, steelMat, gSmg);
  gMesh(0.018, 0.022, -0.16, 0.003, 0.005, 0.014, darkMat, gSmg); // extractor

  // Match Barrel & Aggressive Multi-Port CQB Compensator
  cMesh(0,0.02,-0.34,0.0075,0.0075,0.18,steelMat,gSmg,1.57,0,0,10);
  cMesh(0,0.02,-0.44,0.0135,0.0135,0.045,steelMat,gSmg,1.57,0,0,10);
  for(var cpi=0;cpi<3;cpi++) gMesh(0, 0.030, -0.43 - cpi*0.010, 0.012, 0.004, 0.004, darkMat, gSmg);

  // Extended 36-round 9mm stick magazine with brass witness holes
  var mag=new THREE.Group();mag.position.set(0,-0.08,-0.20);mag.rotation.x=-0.22;gSmg.add(mag);
  gMesh(0,-0.08,0,0.018,0.18,0.038,magMat,mag);
  gMesh(0,-0.175,0.002,0.022,0.012,0.044,darkMat,mag);
  for(var wi=0;wi<5;wi++) cMesh(0.010, -0.035 - wi*0.028, 0.008, 0.0022, 0.0022, 0.002, brassMat, mag, 0, 0, 1.57, 6);
  mag.userData.initialY=-0.08;gSmg.userData.mag=mag;

  // Precision Trijicon MRO Style Wide-Aperture Reflex Sight
  var opticZ=-0.17,opticY=0.065;
  // The sight lives in its own group so it can be re-seated on a different weapon model
  var optic=new THREE.Group();optic.position.set(0,opticY,opticZ);gSmg.add(optic);gSmg.userData.optic=optic;
  gMesh(0, 0.048-opticY, 0, 0.024, 0.008, 0.048, darkMat, optic); // Picatinny riser mount
  cMesh(0.014, 0.048-opticY, 0, 0.004, 0.004, 0.008, steelMat, optic, 0, 0, 1.57, 6); // clamp bolt
  // Cylindrical sight body with flared front objective bell: open-ended tubes with a matte
  // inner liner, so the sight is looked through at ADS instead of showing its end cap
  var mroTube=new THREE.Mesh(new THREE.CylinderGeometry(0.015,0.015,0.054,14,1,true),bodyMat);mroTube.rotation.x=1.57;optic.add(mroTube);
  var mroBell=new THREE.Mesh(new THREE.CylinderGeometry(0.0175,0.015,0.014,14,1,true),bodyMat);mroBell.rotation.x=1.57;mroBell.position.z=-0.028;optic.add(mroBell);
  var mroLiner=new THREE.Mesh(new THREE.CylinderGeometry(0.0142,0.0142,0.066,14,1,true),reflexLinerMat);mroLiner.rotation.x=1.57;mroLiner.position.z=-0.004;optic.add(mroLiner);
  // Top rotary brightness dial turret & side coin-slot windage turret
  cMesh(0, 0.016, 0, 0.007, 0.007, 0.008, darkMat, optic, 0, 0, 0, 12);
  cMesh(0.016, 0, 0, 0.005, 0.005, 0.006, steelMat, optic, 0, 0, 1.57, 10);
  // Multi-coated optical glass: red notch-coated front lens & clear rear lens, shaded rim
  cMesh(0, 0, -0.026, 0.0145, 0.0145, 0.002, reflexGlassRedMat, optic, 1.57, 0, 0, 14);
  cMesh(0, 0, 0.024, 0.0135, 0.0135, 0.002, reflexGlassMat, optic, 1.57, 0, 0, 14);
  lensShade(optic, 0, 0, 0.020, 0.029, 0.029, true);
  // Illuminated 2-MOA Sharp CQB Red Dot Reticle
  var dot=new THREE.Mesh(new THREE.PlaneGeometry(0.018,0.018),reflexDotMat);
  dot.position.set(0,opticY,opticZ-0.004);gSmg.add(dot);
  gSmg.userData.opticReticle = dot;
  gSmg.userData.opticY = opticY;
  gSmg.userData.opticZ = opticZ;

  // Two-tone FDE polymer lower receiver, grip and tactical stock
  var grip=gMesh(0,-0.075,-0.08,0.026,0.10,0.042,fdeMat,gSmg);grip.rotation.x=-0.28;
  gMesh(0,0.01,0.06,0.028,0.05,0.14,fdeMat,gSmg);                     /* tan polymer stock */
  gMesh(0,0.005,0.132,0.03,0.055,0.012,rubberMat,gSmg);               /* butt pad */
  gMesh(0,-0.006,-0.13,0.034,0.016,0.10,fdeMat,gSmg);                 /* tan lower shell */
  cMesh(-0.017,0.01,-0.10,0.004,0.004,0.004,steelMat,gSmg,0,0,1.57,8); /* selector */
  gMesh(-0.018, 0.015, -0.10, 0.002, 0.005, 0.004, redGlowMat, gSmg); // fire mode marker

  var arms=buildRealisticHands(gSmg,new THREE.Vector3(-0.024,-0.006,-0.23),new THREE.Vector3(0.024,-0.062,-0.073),null,-0.28,'smg');
  gSmg.userData.lArm=arms.lArm;
  gSmg.visible=false;gunRig.add(gSmg);wpnMeshes.push(gSmg);
})();

/* 4. BUILD RAILGUN (APEX-50 ELECTROMAGNETIC HEAVY PLATFORM) */
(function buildRailgun(){
  var gRail=new THREE.Group();
  // Reinforced painted heavy receiver chassis
  gMesh(0,0.015,-0.16,0.046,0.074,0.28,railPaintMat,gRail);
  cMesh(0.032,0.035,-0.11,0.005,0.005,0.045,steelMat,gRail,0,0,0.8);
  for(var bi2=0;bi2<4;bi2++)cMesh(0.0235,0.04-bi2*0.02,-0.06,0.0035,0.0035,0.003,steelMat,gRail,0,0,1.57,6);   /* chassis bolts */
  gMesh(0.0235,-0.01,-0.2,0.002,0.03,0.06,steelMat,gRail);                                                       /* data plate */
  // Hazard caution yellow accent strip on chassis
  gMesh(0.0235, 0.022, -0.16, 0.002, 0.008, 0.16, brassMat, gRail);

  // Power capacitor bank battery cell with active LED energy gauge
  var batt=gMesh(0,-0.065,-0.18,0.034,0.080,0.080,darkMat,gRail);
  gMesh(0.018,-0.065,-0.18,0.003,0.050,0.050,cyanGlowMat,gRail);
  // 4 segmented capacitor charge LEDs
  for(var li=0;li<4;li++){
    gMesh(0.0185, -0.045 - li*0.012, -0.15, 0.002, 0.006, 0.014, cyanGlowMat, gRail);
  }
  batt.userData.initialY=-0.065;gRail.userData.mag=batt;

  // High-voltage insulated heavy power conduits linking capacitor to rail accelerators
  cMesh( 0.022, -0.02, -0.28, 0.005, 0.005, 0.16, darkMat, gRail, 0.35, 0, 0, 8);
  cMesh(-0.022, -0.02, -0.28, 0.005, 0.005, 0.16, darkMat, gRail, 0.35, 0, 0, 8);

  // Twin Electromagnetic Acceleration Rails
  gMesh(0,0.034,-0.52,0.030,0.016,0.48,steelMat,gRail);
  gMesh(0,-0.006,-0.52,0.030,0.016,0.48,steelMat,gRail);
  // Polished copper conductor rails along inside track
  gMesh(0.012, 0.014, -0.52, 0.003, 0.022, 0.46, copperMat, gRail);
  gMesh(-0.012, 0.014, -0.52, 0.003, 0.022, 0.46, copperMat, gRail);
  // High-voltage central ionization tube
  cMesh(0,0.014,-0.52,0.008,0.008,0.46,cyanGlowMat,gRail,1.57,0,0,8);
  // Transverse thermal radiator fins with energy vents
  for(var fi=0;fi<8;fi++)gMesh(0,0.038,-0.34-fi*0.045,0.032,0.004,0.015,darkMat,gRail);
  for(var ri=0;ri<5;ri++){
    var rz=-0.32-ri*0.085;
    cMesh(0,0.014,rz,0.026,0.026,0.014,darkMat,gRail,1.57,0,0,8);
    cMesh(0,0.014,rz,0.027,0.027,0.006,cyanGlowMat,gRail,1.57,0,0,8);
  }
  // Heavy muzzle stabilizer & ion shunt
  gMesh(0,0.014,-0.76,0.038,0.046,0.048,steelMat,gRail);
  cMesh(0,0.014,-0.785,0.012,0.012,0.010,cyanGlowMat,gRail,1.57,0,0,8);

  // Heavy 34mm Sniper Scope Assembly with Knurled Turrets & Sunshade
  var scopeZ=-0.18,scopeY=0.074;
  // Dual heavy mounting rings with torx bolts
  gMesh(0,0.052,-0.11,0.028,0.020,0.018,darkMat,gRail);
  gMesh(0,0.052,-0.25,0.028,0.020,0.018,darkMat,gRail);
  cMesh(0,scopeY,-0.11,0.0165,0.0165,0.016,steelMat,gRail,1.57,0,0,12);
  cMesh(0,scopeY,-0.25,0.0165,0.0165,0.016,steelMat,gRail,1.57,0,0,12);
  // Main tube & oversized objective bell
  cMesh(0,scopeY,scopeZ,0.014,0.014,0.22,steelMat,gRail,1.57,0,0,14);
  cMesh(0,scopeY,-0.30,0.022,0.014,0.060,darkMat,gRail,1.57,0,0,14);
  cMesh(0,scopeY,-0.335,0.022,0.022,0.016,steelMat,gRail,1.57,0,0,14); // sunshade
  // Tactical elevation and windage turrets with knurling
  cMesh(0,scopeY+0.017,scopeZ,0.008,0.008,0.010,steelMat,gRail,0,0,0,12);
  cMesh(0.017,scopeY,scopeZ,0.008,0.008,0.010,steelMat,gRail,0,0,1.57,12);
  // Rubberized accordion eye-cup & multi-coated lens
  cMesh(0,scopeY,-0.06,0.014,0.018,0.045,rubberMat,gRail,1.57,0,0,14);
  cMesh(0,scopeY,-0.04,0.016,0.016,0.002,opticLensMat,gRail,1.57,0,0,14);
  // 3D Glass Mil-Dot Reticle for intermediate aim
  var railReticle = new THREE.Mesh(new THREE.PlaneGeometry(0.026, 0.026), railReticleMat);
  railReticle.position.set(0, scopeY, -0.044);
  gRail.add(railReticle);
  gRail.userData.opticReticle = railReticle;
  gRail.userData.opticY = scopeY;
  gRail.userData.opticZ = scopeZ;

  var grip=gMesh(0,-0.08,-0.08,0.032,0.11,0.052,darkMat,gRail);grip.rotation.x=-0.26;
  gMesh(0,0.01,0.06,0.038,0.08,0.18,railPaintMat,gRail);
  gMesh(0,0.005,0.152,0.04,0.09,0.014,rubberMat,gRail);               /* recoil pad */

  var arms=buildRealisticHands(gRail,new THREE.Vector3(-0.032,-0.008,-0.36),new THREE.Vector3(0.027,-0.068,-0.073),null,-0.26,'railgun');
  gRail.userData.lArm=arms.lArm;
  gRail.visible=false;gunRig.add(gRail);wpnMeshes.push(gRail);
})();

/* 5. BUILD PISTOL (P-9 SIDEARM): the stand-in for models/pistol.glb, built to the same
   dimensions so the hand spec fits either. Compact 9 mm: slide, frame, raked grip, guard,
   trigger, iron sights and a magazine the reload can drop. */
(function buildPistol(){
  var gPis=new THREE.Group();
  /* the parts were laid out for a compact; the body group scales them to the full-size frame
     the hand spec and the GLB use (the hands are children of gPis, so they stay real size) */
  var body=new THREE.Group();body.scale.setScalar(1.124);body.position.y=-0.0082;gPis.add(body);
  gMesh(0,0.052,-0.058,0.027,0.028,0.190,steelMat,body);                 /* slide */
  gMesh(0,0.061,-0.100,0.022,0.006,0.060,darkMat,body);                  /* slide top flat */
  gMesh(0,0.020,-0.046,0.027,0.036,0.128,bodyMat,body);                  /* frame and dust cover */
  var grip=gMesh(0,-0.035,0.000,0.027,0.052,0.044,darkMat,body);grip.rotation.x=-0.15;
  gMesh(0,0.018,0.024,0.024,0.016,0.016,bodyMat,body);                   /* rear tang */
  gMesh(0,-0.001,-0.045,0.008,0.003,0.040,bodyMat,body);                 /* trigger guard, bottom bar */
  gMesh(0,0.008,-0.066,0.008,0.020,0.003,bodyMat,body);                  /* trigger guard, front */
  var trig=gMesh(0,0.010,-0.045,0.004,0.016,0.005,steelMat,body);trig.userData.keep=true;trig.userData.homeZ=trig.position.z;gPis.userData.triggerMesh=trig;
  cMesh(0,0.048,-0.150,0.0065,0.0065,0.014,steelMat,body,1.57,0,0,10);   /* barrel crown */
  gMesh(0,0.066,-0.145,0.003,0.006,0.004,darkMat,body);                  /* front sight */
  gMesh(-0.006,0.066,0.028,0.003,0.006,0.005,darkMat,body);gMesh(0.006,0.066,0.028,0.003,0.006,0.005,darkMat,body);   /* rear notch */
  var mag=new THREE.Group();mag.position.set(0,-0.045,0.000);body.add(mag);
  var magBody=gMesh(0,0,0,0.021,0.066,0.030,magMat,mag);magBody.userData.keep=true;
  var plate=gMesh(0,-0.036,0.002,0.025,0.006,0.036,darkMat,mag);plate.userData.keep=true;
  mag.userData.homePosition=mag.position.clone();mag.userData.homeRotation=mag.rotation.clone();mag.userData.initialY=mag.position.y;gPis.userData.mag=mag;
  gPis.visible=false;gunRig.add(gPis);wpnMeshes.push(gPis);
})();

var gun=wpnMeshes[0];

/* ============================ muzzle sockets ============================ */
/* Every weapon carries an empty at its barrel tip; local -Z is the bore. Because it is a child of
   the weapon group, its world matrix already contains every layer of view-model animation (sway,
   bob, sprint, ADS, recoil, reload, inspect, the switch drop and the rig scale), so nothing has to
   be re-derived per pose. The view model is drawn in gunScene through gunCam, so the socket is
   carried into the main scene through the screen: the pixel the muzzle occupies is unprojected
   through the world camera at a plausible eye distance. Smoke spawned there stays in the world. */
var MUZZLE_SOCKET_LOCAL=[new THREE.Vector3(0,.024,-.70),new THREE.Vector3(0,.024,-.755),new THREE.Vector3(0,.020,-.465),new THREE.Vector3(0,.014,-.787),new THREE.Vector3(0,.046,-.172)];
for(var msi=0;msi<wpnMeshes.length;msi++){
  var msock=new THREE.Object3D();msock.name='muzzle';
  msock.position.copy(MUZZLE_SOCKET_LOCAL[msi]);
  wpnMeshes[msi].add(msock);wpnMeshes[msi].userData.muzzle=msock;
}
var MUZZLE_EYE_DIST=0.65;             /* how far in front of the eye the mapped muzzle sits */
var muzzleState={
  socket:null,                        /* the active weapon's socket */
  view:new THREE.Vector3(),           /* socket position in gunScene (gunCam view) space */
  viewDir:new THREE.Vector3(0,0,-1),  /* bore axis in view space */
  world:new THREE.Vector3(),          /* socket position in the main scene */
  dir:new THREE.Vector3(0,0,-1),      /* bore axis in the main scene */
  onScreen:true                       /* false while the rail scope hides the view model */
};
var muzzleView=muzzleState.view,muzzleScreen=new THREE.Vector3(),muzzleWorld=new THREE.Vector3();
/* map a gunScene point onto the main scene: same pixel, `dist` metres from the eye */
function muzzleViewToWorld(v,out,dist){
  muzzleScreen.copy(v).project(gunCam);
  out.set(muzzleScreen.x,muzzleScreen.y,.5).unproject(camera).sub(camera.position);
  if(out.lengthSq()<1e-10||!isFinite(out.x+out.y+out.z))camera.getWorldDirection(out);
  return out.normalize().multiplyScalar(dist).add(camera.position);
}
function updateMuzzleTransform(){
  var sock=gun.userData.muzzle;muzzleState.socket=sock;
  sock.updateWorldMatrix(true,false);
  var e=sock.matrixWorld.elements;
  muzzleView.set(e[12],e[13],e[14]);
  muzzleState.viewDir.set(-e[8],-e[9],-e[10]);
  if(muzzleState.viewDir.lengthSq()<1e-10)muzzleState.viewDir.set(0,0,-1);else muzzleState.viewDir.normalize();
  flash.position.copy(muzzleView);gunRig.worldToLocal(flash.position);
  flashHalo.position.copy(flash.position);
  gunMuzzleLight.position.copy(muzzleView);
  camera.updateMatrixWorld();
  muzzleState.onScreen=!!gunRig.visible;
  if(!muzzleState.onScreen){
    /* scoped: the weapon is hidden, so the muzzle sits low-right of the lens */
    muzzleState.world.set(0.24,-0.17,-0.55).applyMatrix4(camera.matrixWorld);
    camera.getWorldDirection(muzzleState.dir);
    return;
  }
  muzzleViewToWorld(muzzleView,muzzleState.world,MUZZLE_EYE_DIST);
  /* directions are barely affected by the FOV mismatch, so the bore axis is just rotated */
  muzzleState.dir.copy(muzzleState.viewDir).applyQuaternion(camera.quaternion).normalize();
}
/* world-space origin for tracers and smoke: the socket, pulled back if a wall is closer */
function shotMuzzle(){
  updateMuzzleTransform();
  if(!muzzleState.onScreen)return muzzleWorld.copy(muzzleState.world);
  muzzleWorld.copy(muzzleState.world).sub(camera.position);
  var len=muzzleWorld.length();if(len<1e-6)return muzzleWorld.copy(muzzleState.world);
  muzzleWorld.multiplyScalar(1/len);
  var clear=rayWorld(camera.position.x,camera.position.y,camera.position.z,muzzleWorld.x,muzzleWorld.y,muzzleWorld.z);
  return muzzleWorld.multiplyScalar(Math.max(.02,Math.min(len,clear-.02))).add(camera.position);
}
/* Muzzle flash: a petal-shaped flash (two variants swapped per shot) inside a soft halo. It
   shrinks when aiming so it never sits over the target. */
/* the flash is the brightest thing that ever happens in the station; in a linear float buffer it
   can finally say so, and it is what the bloom threshold at 1.02 is there to catch */
var flash=new THREE.Sprite(new THREE.SpriteMaterial({map:TX.flash,color:new THREE.Color(0xffcf88).multiplyScalar(5.0),transparent:true,
  blending:THREE.AdditiveBlending,depthWrite:false,opacity:0}));
flash.position.set(0,0.024,-0.70);flash.scale.set(0.12,0.12,1);gunRig.add(flash);
var flashHalo=new THREE.Sprite(new THREE.SpriteMaterial({map:TX.glow,color:0xffb060,transparent:true,
  blending:THREE.AdditiveBlending,depthWrite:false,opacity:0}));
flashHalo.scale.set(0.3,0.3,1);gunRig.add(flashHalo);
function muzzleFlashFx(cur,ads){
  flash.material.map=Math.random()<0.5?TX.flash:TX.flash2;
  var s=((cur===1?.17:cur===3?.14:.105)+Math.random()*.04)*(1-0.4*ads);
  var baseS=cur===1?0.19:cur===3?0.15:cur===2?0.10:0.125;
  var s=(baseS+Math.random()*0.04)*(1-0.42*ads);
  if(cur===3){
    flash.material.color.setHex(0x55e8ff);
    flashHalo.material.color.setHex(0x20b4ff);
  }else{
    flash.material.color.setHex(cur===1?0xffbb66:0xffe299);
    flashHalo.material.color.setHex(cur===1?0xff9933:0xffcc66);
  }
  flash.scale.set(s,s,1);flash.material.rotation=Math.random()*TAU;flash.material.opacity=1;
  flashHalo.scale.set(s*1.5,s*1.5,1);flashHalo.material.color.copy(flash.material.color);flashHalo.material.opacity=0.3;
  flashHalo.scale.set(s*1.8,s*1.8,1);flashHalo.material.opacity=0.45;
}

/* Active Tactical Laser Dot */

/* Collimated Tactical Dust Laser Beam */
var laserBeamMat=new THREE.MeshBasicMaterial({
  color:0x00ff88,
  transparent:true,
  opacity:0.20,
  blending:THREE.AdditiveBlending,
  depthWrite:false
});
var laserBeam=new THREE.Mesh(new THREE.CylinderGeometry(0.0010,0.0018,1,6),laserBeamMat);
laserBeam.visible=false;
scene.add(laserBeam);

/* ============================ muzzle smoke (world space) ============================ */
/* Propellant smoke leaves the muzzle socket and then belongs to the station: each particle is a
   world-space billboard that drags to a stop, expands, rises a little, wanders on turbulence and
   thins out. Turning or walking after the shot leaves the trail hanging where the barrel was.
   One instanced mesh draws the whole pool (a single call, no per-particle objects); the pool is
   fixed and reused in order, and every scratch value below is preallocated. */
var MZ_SMOKE_MAX=96;
/* four soft wisps in a 2x2 atlas so particles do not all share one silhouette. A private
   generator keeps the atlas deterministic without advancing the station's shared texture seed. */
var mzSmokeTex=paint(256,256,function(g,w,h){
  var ls=7261994;function lr(a,b){ls=(Math.imul(ls,1664525)+1013904223)>>>0;return a+(ls/4294967296)*(b-a);}
  g.clearRect(0,0,w,h);
  for(var cell=0;cell<4;cell++){
    var cx=(cell%2)*128+64,cy=Math.floor(cell/2)*128+64;
    for(var i=0;i<8;i++){
      var ox=lr(-20,20),oy=lr(-20,20),r=lr(16,38),a=lr(.18,.42);
      var gr=g.createRadialGradient(cx+ox,cy+oy,1,cx+ox,cy+oy,r);
      gr.addColorStop(0,'rgba(255,255,255,'+a+')');gr.addColorStop(.45,'rgba(255,255,255,'+(a*.45)+')');gr.addColorStop(1,'rgba(255,255,255,0)');
      g.fillStyle=gr;g.fillRect(cx-64,cy-64,128,128);
    }
    /* a couple of thin spots so the wisp reads as rolling rather than as a disc */
    g.globalCompositeOperation='destination-out';
    for(var k=0;k<3;k++){
      var hx=cx+lr(-26,26),hy=cy+lr(-26,26),hr=lr(8,18);
      var hg=g.createRadialGradient(hx,hy,0,hx,hy,hr);
      hg.addColorStop(0,'rgba(0,0,0,.55)');hg.addColorStop(1,'rgba(0,0,0,0)');
      g.fillStyle=hg;g.fillRect(hx-hr,hy-hr,hr*2,hr*2);
    }
    g.globalCompositeOperation='source-over';
  }
});
mzSmokeTex.wrapS=mzSmokeTex.wrapT=THREE.ClampToEdgeWrapping;
var mzSmokeGeo=new THREE.InstancedBufferGeometry();
mzSmokeGeo.setAttribute('position',new THREE.Float32BufferAttribute([-.5,-.5,0,.5,-.5,0,.5,.5,0,-.5,.5,0],3));
mzSmokeGeo.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,1,1,0,1],2));
mzSmokeGeo.setIndex([0,1,2,0,2,3]);
var mzPosArr=new Float32Array(MZ_SMOKE_MAX*3),mzDataArr=new Float32Array(MZ_SMOKE_MAX*4),mzColArr=new Float32Array(MZ_SMOKE_MAX*3);
var mzPosAttr=new THREE.InstancedBufferAttribute(mzPosArr,3).setUsage(THREE.DynamicDrawUsage);
var mzDataAttr=new THREE.InstancedBufferAttribute(mzDataArr,4).setUsage(THREE.DynamicDrawUsage);   /* size, rotation, alpha, atlas cell */
var mzColAttr=new THREE.InstancedBufferAttribute(mzColArr,3).setUsage(THREE.DynamicDrawUsage);
mzSmokeGeo.setAttribute('iPos',mzPosAttr);mzSmokeGeo.setAttribute('iData',mzDataAttr);mzSmokeGeo.setAttribute('iCol',mzColAttr);
var mzSmokeMat=new THREE.ShaderMaterial({
  uniforms:{map:{value:mzSmokeTex},uLight:{value:1}},
  vertexShader:[
    'attribute vec3 iPos;attribute vec4 iData;attribute vec3 iCol;',
    'varying vec2 vUv;varying float vA;varying vec3 vCol;',
    'void main(){',
    '  float cell=iData.w;',
    '  vUv=uv*0.5+vec2(mod(cell,2.0),floor(cell*0.5+0.001))*0.5;',
    '  vA=iData.z;vCol=iCol;',
    '  float c=cos(iData.y),s=sin(iData.y);',
    '  vec2 q=vec2(position.x*c-position.y*s,position.x*s+position.y*c)*iData.x;',
    '  vec4 mv=modelViewMatrix*vec4(iPos,1.0);',
    '  mv.xy+=q;',                                   /* camera-facing quad, rotated in the view plane */
    '  gl_Position=projectionMatrix*mv;',
    '}'
  ].join('\n'),
  fragmentShader:[
    'uniform sampler2D map;uniform float uLight;',
    'varying vec2 vUv;varying float vA;varying vec3 vCol;',
    'void main(){',
    '  float a=texture2D(map,vUv).a*vA;',
    '  if(a<0.004)discard;',
    '  gl_FragColor=vec4(vCol*uLight,a);',
    '  #include <tonemapping_fragment>',
    '  #include <encodings_fragment>',
    '}'
  ].join('\n'),
  transparent:true,depthWrite:false,depthTest:true,blending:THREE.NormalBlending
});
var mzSmokeMesh=new THREE.Mesh(mzSmokeGeo,mzSmokeMat);
mzSmokeMesh.frustumCulled=false;mzSmokeMesh.matrixAutoUpdate=false;mzSmokeMesh.renderOrder=6;mzSmokeMesh.visible=false;
scene.add(mzSmokeMesh);
var mzSmoke=[],mzSmokeHead=0,mzSmokeActive=0;
for(var mzi=0;mzi<MZ_SMOKE_MAX;mzi++){
  mzSmoke.push({life:0,max:1,x:0,y:-500,z:0,vx:0,vy:0,vz:0,s0:.05,s1:.3,rot:0,rotV:0,a:.25,seed:0,cell:0,
    r:.5,g:.5,b:.5,tr:1,tg:.6,tb:.3,tint:0,tintT:.12,drag:4,buoy:.35,turb:.5});
}
/* per-weapon smoke character: n puffs per shot, jet speed, cone (radians), start/end size, life,
   peak alpha, the flash-lit tint (linear colour) and how long it lasts, barrel heat gained per
   shot and shed per second, and the alpha of the between-shot wisps from a hot barrel. */
var MZ_SMOKE_CFG=[
  {n:5, spd:2.3,cone:.16,s0:.05, s1:.30,life:1.10,a:.26,tint:[1.0,.62,.30],tintT:.12,heat:.060,cool:.30,wisp:.14,base:[.50,.52,.54]},   /* carbine */
  {n:11,spd:1.9,cone:.26,s0:.09, s1:.58,life:1.90,a:.36,tint:[1.0,.55,.25],tintT:.14,heat:.200,cool:.20,wisp:.18,base:[.48,.50,.51]},   /* shotgun: big rolling cloud */
  {n:3, spd:2.5,cone:.14,s0:.035,s1:.20,life:.85, a:.20,tint:[1.0,.70,.35],tintT:.10,heat:.035,cool:.32,wisp:.12,base:[.50,.52,.54]},   /* smg: light, but it stacks */
  {n:7, spd:4.4,cone:.07,s0:.04, s1:.34,life:1.20,a:.30,tint:[.45,.92,1.0],tintT:.36,heat:.320,cool:.18,wisp:.16,base:[.60,.66,.70]},   /* railgun: ionised vapour */
  {n:3, spd:2.4,cone:.15,s0:.035,s1:.22,life:.90, a:.22,tint:[1.0,.68,.34],tintT:.10,heat:.050,cool:.30,wisp:.12,base:[.50,.52,.54]}    /* pistol: a short puff */
];
var mzHeat=WEAPONS.map(function(){return 0;});   /* sustained-fire barrel heat per weapon, 0..1 */
var mzWispAcc=0;
var _mzRight=new THREE.Vector3(),_mzUp=new THREE.Vector3(),_mzTmp=new THREE.Vector3(),_mzLastP=new THREE.Vector3(0,-999,0),_mzVel=new THREE.Vector3();
/* one particle from the pool at (x,y,z) with velocity v, sizes s0->s1, life, alpha, atlas cell */
function mzEmit(x,y,z,vx,vy,vz,s0,s1,life,alpha,cfg,tintK,drag,turb){
  var p=mzSmoke[mzSmokeHead];mzSmokeHead=(mzSmokeHead+1)%MZ_SMOKE_MAX;
  p.life=p.max=life;p.x=x;p.y=y;p.z=z;p.vx=vx;p.vy=vy;p.vz=vz;
  p.s0=s0;p.s1=s1;p.a=alpha;p.rot=Math.random()*TAU;p.rotV=(Math.random()-.5)*1.4;
  p.seed=Math.random()*100;p.cell=(Math.random()*4)|0;
  var shade=.85+Math.random()*.3;
  p.r=cfg.base[0]*shade;p.g=cfg.base[1]*shade;p.b=cfg.base[2]*shade;
  p.tr=cfg.tint[0];p.tg=cfg.tint[1];p.tb=cfg.tint[2];p.tint=tintK;p.tintT=cfg.tintT;
  p.drag=drag;p.buoy=.30+Math.random()*.15;p.turb=turb;
}
/* the burst for one shot: a fast jet down the bore that opens into a slower cloud. Density grows
   with barrel heat (sustained fire) and shrinks a little while aiming so the sight stays usable. */
function spawnMuzzleSmoke(cur,origin){
  if(cur===undefined)cur=P.curWpn;
  var cfg=MZ_SMOKE_CFG[cur]||MZ_SMOKE_CFG[0],heat=mzHeat[cur],ads=P.ads||0;
  mzHeat[cur]=Math.min(1,heat+cfg.heat);
  var o=origin||shotMuzzle(),d=muzzleState.dir;
  _mzRight.set(d.z,0,-d.x);if(_mzRight.lengthSq()<1e-6)_mzRight.set(1,0,0);_mzRight.normalize();
  _mzUp.crossVectors(_mzRight,d).normalize();
  var scale=typeof fxScale==='number'?fxScale:1;
  var n=Math.max(1,Math.round(cfg.n*(1+.9*heat)*(1-.3*ads)*scale));
  var aMul=(1+.3*heat)*(1-.35*ads),sMul=1+.45*heat,lMul=1+.4*heat,spd=cfg.spd*(1-.3*heat);
  for(var i=0;i<n;i++){
    var k=i/n;                                  /* early particles form the jet, later ones the cloud */
    var v=spd*(.45+.7*Math.random())*(1-.55*k);
    var cone=cfg.cone*(.4+1.2*Math.random())*(.6+.8*k);
    var ax=(Math.random()-.5)*2*cone,ay=(Math.random()-.5)*2*cone+.05;
    var vx=d.x*v+_mzRight.x*ax*v+_mzUp.x*ay*v+_mzVel.x*.35;
    var vy=d.y*v+_mzRight.y*ax*v+_mzUp.y*ay*v+_mzVel.y*.35+.12;
    var vz=d.z*v+_mzRight.z*ax*v+_mzUp.z*ay*v+_mzVel.z*.35;
    var along=.01+Math.random()*.05;
    var x=o.x+d.x*along+(_mzRight.x*(Math.random()-.5)+_mzUp.x*(Math.random()-.5))*.02;
    var y=o.y+d.y*along+(_mzRight.y*(Math.random()-.5)+_mzUp.y*(Math.random()-.5))*.02;
    var z=o.z+d.z*along+(_mzRight.z*(Math.random()-.5)+_mzUp.z*(Math.random()-.5))*.02;
    var s0=cfg.s0*(.7+.6*Math.random())*(1+.3*k),s1=cfg.s1*sMul*(.75+.5*Math.random())*(.7+.6*k);
    var life=cfg.life*lMul*(.7+.6*Math.random())*(.8+.4*k);
    var alpha=Math.min(.6,cfg.a*aMul*(.8+.4*Math.random()));
    mzEmit(x,y,z,vx,vy,vz,s0,s1,life,alpha,cfg,1-.6*k,4.5+2.5*(1-k),.55);
  }
  mzSmokeActive=1;mzSmokeMesh.visible=true;
}
function resetMuzzleSmoke(){
  for(var i=0;i<MZ_SMOKE_MAX;i++){var p=mzSmoke[i];p.life=0;p.y=-500;}
  for(var w=0;w<WEAPONS.length;w++)mzHeat[w]=0;
  mzWispAcc=0;mzSmokeActive=0;mzSmokeMesh.visible=false;_mzLastP.set(0,-999,0);
}
function updateMuzzleSmoke(dt){
  flashHalo.material.opacity=Math.max(0,flashHalo.material.opacity-dt*9);
  if(dt<=0)return;
  /* shooter velocity (without head bob): fresh smoke inherits a little of it, then drag takes over */
  if(_mzLastP.y<-900||_mzLastP.distanceToSquared(_mzTmp.set(P.x,P.y,P.z))>9)_mzVel.set(0,0,0);
  else _mzVel.set((P.x-_mzLastP.x)/dt,(P.y-_mzLastP.y)/dt,(P.z-_mzLastP.z)/dt);
  _mzLastP.set(P.x,P.y,P.z);
  /* barrels cool; a hot one breathes thin wisps between shots */
  for(var w=0;w<WEAPONS.length;w++)mzHeat[w]=Math.max(0,mzHeat[w]-MZ_SMOKE_CFG[w].cool*dt);
  var cur=P.curWpn,cfg=MZ_SMOKE_CFG[cur]||MZ_SMOKE_CFG[0],heat=mzHeat[cur];
  if(heat>.25&&G.state==='play'&&P.switchT<=0){
    mzWispAcc+=heat*heat*11*(typeof fxScale==='number'?fxScale:1)*dt;
    if(mzWispAcc>=1){
      var o=muzzleState.world,d=muzzleState.dir;
      var clear=rayWorld(camera.position.x,camera.position.y,camera.position.z,d.x,d.y,d.z);
      while(mzWispAcc>=1){
        mzWispAcc-=1;
        if(clear<.15)continue;
        var wv=.10+Math.random()*.14;
        mzEmit(o.x+d.x*.02+(Math.random()-.5)*.015,o.y+d.y*.02+(Math.random()-.5)*.01,o.z+d.z*.02+(Math.random()-.5)*.015,
          d.x*wv+(Math.random()-.5)*.08,.14+Math.random()*.10+d.y*wv,d.z*wv+(Math.random()-.5)*.08,
          .025,.12+.12*heat,1.0+Math.random()*.7,cfg.wisp*heat,cfg,0,1.6,.35);
      }
      mzSmokeActive=1;mzSmokeMesh.visible=true;
    }
  }else mzWispAcc=0;
  if(!mzSmokeActive)return;
  var t0=G.time,camX=camera.position.x,camY=camera.position.y,camZ=camera.position.z,live=0;
  for(var i=0;i<MZ_SMOKE_MAX;i++){
    var p=mzSmoke[i],i3=i*3,i4=i*4;
    if(p.life<=0){mzDataArr[i4]=0;mzDataArr[i4+2]=0;continue;}
    p.life-=dt;
    if(p.life<=0){mzDataArr[i4]=0;mzDataArr[i4+2]=0;continue;}
    live++;
    var t=1-p.life/p.max;
    /* drag brings the jet to a stop, buoyancy lifts it, turbulence takes over as it ages */
    var drag=Math.max(0,1-(p.drag*(1-t)+1.2*t)*dt);
    p.vx*=drag;p.vy*=drag;p.vz*=drag;
    p.vy+=p.buoy*dt;if(p.vy>.45)p.vy=.45;
    var turb=p.turb*(.4+.9*t);
    p.vx+=Math.sin(p.seed*6.1+t0*1.9+p.y*4.0)*turb*dt;
    p.vy+=Math.sin(p.seed*4.3+t0*1.3+p.x*3.0)*turb*.5*dt;
    p.vz+=Math.cos(p.seed*5.7+t0*1.6+p.z*3.5)*turb*dt;
    p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;
    p.rot+=p.rotV*(1-.6*t)*dt;
    var grow=1-(1-t)*(1-t),size=p.s0+(p.s1-p.s0)*grow;
    var fade=Math.min(1,t/.05)*Math.pow(1-t,1.35);
    /* thin out right at the eye so walking through the cloud is a haze, not a grey wall */
    var dx=p.x-camX,dy=p.y-camY,dz=p.z-camZ,near=clamp((Math.sqrt(dx*dx+dy*dy+dz*dz)-.12)/.35,0,1);
    var alpha=p.a*fade*near;
    /* the first tenth of a second is lit by the flash: warm for powder, cyan for the rail */
    var tintK=p.tint*Math.max(0,1-t/p.tintT);tintK*=tintK;
    mzColArr[i3]=p.r+(p.tr*1.5-p.r)*tintK;mzColArr[i3+1]=p.g+(p.tg*1.5-p.g)*tintK;mzColArr[i3+2]=p.b+(p.tb*1.5-p.b)*tintK;
    mzPosArr[i3]=p.x;mzPosArr[i3+1]=p.y;mzPosArr[i3+2]=p.z;
    mzDataArr[i4]=size;mzDataArr[i4+1]=p.rot;mzDataArr[i4+2]=alpha;mzDataArr[i4+3]=p.cell;
  }
  mzPosAttr.needsUpdate=true;mzDataAttr.needsUpdate=true;mzColAttr.needsUpdate=true;
  mzSmokeMat.uniforms.uLight.value=.55+.45*(typeof gunLightLevel==='number'?gunLightLevel:1);
  mzSmokeActive=live>0?1:0;mzSmokeMesh.visible=live>0;
}
var laserDot=new THREE.Sprite(new THREE.SpriteMaterial({map:TX.glow,color:0x00ff88,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,opacity:0.85}));
laserDot.scale.setScalar(0.05);scene.add(laserDot);

/* ============================ world-space puffs and blasts ============================ */
/* Smoke puffs (normal blending, so they darken and hide what is behind them) for impacts,
   explosions and railgun hits. Fixed pool, reused in order. */
var PUFF_MAX=28,puffPool=[],puffHead=0;
for(var pfi=0;pfi<PUFF_MAX;pfi++){
  var pfs=new THREE.Sprite(new THREE.SpriteMaterial({map:TX.puff,color:0xb9bdbb,transparent:true,depthWrite:false,opacity:0}));
  pfs.visible=false;scene.add(pfs);
  puffPool.push({s:pfs,life:0,max:1,vx:0,vy:0,vz:0,size:1,grow:1,a:.5});
}
function puff(x,y,z,n,size,vx,vy,vz,color,life,alpha){
  n=Math.max(1,Math.ceil(n*(typeof fxScale==='number'?fxScale:1)));
  for(var i=0;i<n;i++){
    var p=puffPool[puffHead];puffHead=(puffHead+1)%PUFF_MAX;
    p.s.position.set(x+(Math.random()-.5)*size*.5,y+(Math.random()-.5)*size*.3,z+(Math.random()-.5)*size*.5);
    p.s.material.color.setHex(color||0xb9bdbb);p.s.material.rotation=Math.random()*TAU;
    p.max=p.life=(life||0.9)*(0.75+Math.random()*0.5);
    p.size=size*(0.7+Math.random()*0.6);p.grow=size*1.5;p.a=alpha||0.5;
    p.vx=(vx||0)+(Math.random()-.5)*size;p.vy=(vy||0)+Math.random()*size*.4;p.vz=(vz||0)+(Math.random()-.5)*size;
    p.s.scale.set(p.size,p.size,1);p.s.visible=true;
  }
}
function updatePuffs(dt){
  for(var i=0;i<PUFF_MAX;i++){
    var p=puffPool[i];if(!p.s.visible)continue;
    p.life-=dt;
    if(p.life<=0){p.s.visible=false;continue;}
    var t=1-p.life/p.max;
    p.s.position.x+=p.vx*dt;p.s.position.y+=p.vy*dt;p.s.position.z+=p.vz*dt;
    p.vx*=1-dt*1.5;p.vz*=1-dt*1.5;p.vy=p.vy*(1-dt)+dt*0.25;
    var sc=p.size+p.grow*t;p.s.scale.set(sc,sc,1);
    p.s.material.opacity=p.a*(1-t)*(t<0.12?t/0.12:1);
  }
}
/* Explosions: a fast fireball sprite, a shockwave ring on the floor, rising smoke and a brief,
   sane point light. The rail impact reuses the pool with a cyan, camera-facing ring. */
var BLAST_MAX=6,blastPool=[],blastHead=0;
var ringFlatGeo=new THREE.PlaneGeometry(1,1);ringFlatGeo.rotateX(-Math.PI/2);
for(var bfi=0;bfi<BLAST_MAX;bfi++){
  var fire=new THREE.Sprite(new THREE.SpriteMaterial({map:TX.flash,color:new THREE.Color(0xffc070).multiplyScalar(4.2),transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,opacity:0}));
  var ringFlat=new THREE.Mesh(ringFlatGeo,new THREE.MeshBasicMaterial({map:TX.ring,color:0xffb070,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,opacity:0}));
  var ringSprite=new THREE.Sprite(new THREE.SpriteMaterial({map:TX.ring,color:0x7af4ff,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,opacity:0}));
  fire.visible=ringFlat.visible=ringSprite.visible=false;scene.add(fire);scene.add(ringFlat);scene.add(ringSprite);
  blastPool.push({fire:fire,ring:ringFlat,ringS:ringSprite,t:99,scale:1,cyan:false});
}
function blastFx(x,y,z,scale,cyan){
  var b=blastPool[blastHead];blastHead=(blastHead+1)%BLAST_MAX;
  b.t=0;b.scale=scale||1;b.cyan=!!cyan;
  b.fire.position.set(x,y,z);b.fire.material.rotation=Math.random()*TAU;b.fire.visible=true;
  b.fire.material.map=Math.random()<0.5?TX.flash:TX.flash2;
  if(cyan){b.ringS.position.set(x,y,z);b.ringS.visible=true;b.ring.visible=false;}
  else{
    b.ring.position.set(x,x>-1.3?-1.02:0.06,z);b.ring.visible=true;b.ringS.visible=false;
    puff(x,y+0.15,z,6*b.scale,1.3*b.scale,0,0.8,0,0x55585a,1.9,0.72);
    puff(x,y+0.05,z,4*b.scale,0.8*b.scale,0,1.7,0,0xa9a39a,0.55,0.5);
    muzzleLight.position.set(x,y+0.5,z);muzzleLight.intensity=6.5*b.scale;
  }
}
function updateBlasts(dt){
  for(var i=0;i<BLAST_MAX;i++){
    var b=blastPool[i];if(b.t>1)continue;
    b.t+=dt;
    var kf=Math.min(1,b.t/(b.cyan?0.18:0.34)),kr=Math.min(1,b.t/(b.cyan?0.3:0.45));
    var fs=(b.cyan?(0.5+1.4*kf):(1.3+3.4*kf))*b.scale;
    b.fire.scale.set(fs,fs,1);b.fire.material.opacity=Math.pow(1-kf,1.2);
    if(b.cyan)b.fire.material.color.setRGB(0.6+0.4*(1-kf),1,1);
    else b.fire.material.color.setRGB(1,0.45+0.55*(1-kf),0.1+0.75*(1-kf)*(1-kf));
    if(kf>=1)b.fire.visible=false;
    var rs=(b.cyan?(0.3+2.2*kr):(0.6+7.5*kr))*b.scale,ro=Math.pow(1-kr,2)*(b.cyan?0.9:0.7);
    if(b.cyan){b.ringS.scale.set(rs,rs,1);b.ringS.material.opacity=ro;if(kr>=1)b.ringS.visible=false;}
    else{b.ring.scale.set(rs,1,rs);b.ring.material.opacity=ro;if(kr>=1)b.ring.visible=false;}
    if(kf>=1&&kr>=1)b.t=99;
  }
}
function railImpactFx(x,y,z){
  blastFx(x,y,z,0.42,true);
  puff(x,y,z,2,0.35,0,0.3,0,0x9fd8e0,0.6,0.35);
}
/* ============================ particles and tracers ============================ */
var PMAX=480;
var pGeo=new THREE.BufferGeometry();
var pPos=new Float32Array(PMAX*3),pCol=new Float32Array(PMAX*3);
pGeo.setAttribute('position',new THREE.BufferAttribute(pPos,3));
pGeo.setAttribute('color',new THREE.BufferAttribute(pCol,3));
var points=new THREE.Points(pGeo,new THREE.PointsMaterial({size:0.12,map:TX.glow,vertexColors:true,
  transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,sizeAttenuation:true}));
points.frustumCulled=false;scene.add(points);
var parts=[];
for(var pi=0;pi<PMAX;pi++)parts.push({life:0,x:0,y:-500,z:0,vx:0,vy:0,vz:0,r:1,g:1,b:1});
var pHead=0;
function spark(x,y,z,n,r,g,b,spread,up){
  n=Math.max(1,Math.ceil(n*(typeof fxScale==='number'?fxScale:1)));
  for(var i=0;i<n;i++){
    var p=parts[pHead];pHead=(pHead+1)%PMAX;
    p.life=0.35+Math.random()*0.55;p.x=x;p.y=y;p.z=z;
    var angle=Math.random()*TAU,spd=Math.random()*spread;
    p.vx=Math.cos(angle)*spd;p.vy=Math.random()*(up||3)+0.5;p.vz=Math.sin(angle)*spd;
    var v=0.85+Math.random()*0.3;
    p.r=Math.min(1,r*v);p.g=Math.min(1,g*v);p.b=Math.min(1,b*v);
  }
}
/* Slow-rising gun smoke particles */
function smoke(x,y,z,n){
  n=Math.max(1,Math.ceil(n*(typeof fxScale==='number'?fxScale:1)));
  for(var i=0;i<n;i++){
    var p=parts[pHead];pHead=(pHead+1)%PMAX;
    p.life=0.7+Math.random()*0.8;p.x=x+(Math.random()-0.5)*0.3;p.y=y;p.z=z+(Math.random()-0.5)*0.3;
    p.vx=(Math.random()-0.5)*0.3;p.vy=0.4+Math.random()*0.6;p.vz=(Math.random()-0.5)*0.3;
    p.r=0.5;p.g=0.55;p.b=0.52;
  }
}
/* Electrical arc sparks on damaged enemies */
function elecSpark(x,y,z){
  for(var i=0;i<5;i++){
    var p=parts[pHead];pHead=(pHead+1)%PMAX;
    p.life=0.12+Math.random()*0.18;p.x=x;p.y=y;p.z=z;
    p.vx=(Math.random()-0.5)*6;p.vy=Math.random()*4;p.vz=(Math.random()-0.5)*6;
    p.r=0.4;p.g=0.8;p.b=1.0;
  }
}
var _particlesActive=false;
function stepParticles(dt){
  updatePuffs(dt);updateBlasts(dt);
  var hasActive=false;
  for(var i=0;i<PMAX;i++){
    var p=parts[i];
    if(p.life>0){
      hasActive=true;
      p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;p.vy-=13*dt;
      var floorY=(p.x<=-1.48)?0.04:-1.05;
      if(p.y<floorY){p.y=floorY;p.vy*=-0.38;p.vx*=0.65;p.vz*=0.65;}
      var f=Math.max(0,Math.min(1,p.life*2.2));
      pPos[i*3]=p.x;pPos[i*3+1]=p.y;pPos[i*3+2]=p.z;
      pCol[i*3]=p.r*f;pCol[i*3+1]=p.g*f;pCol[i*3+2]=p.b*f;
    }else if(pPos[i*3+1]>-400){
      pPos[i*3+1]=-500;pCol[i*3]=pCol[i*3+1]=pCol[i*3+2]=0;
      hasActive=true;
    }
  }
  if(hasActive||_particlesActive){
    pGeo.attributes.position.needsUpdate=true;
    pGeo.attributes.color.needsUpdate=true;
    _particlesActive=hasActive;
  }
}
/* ============================ tracers ============================ */
/* Camera-facing ribbons: a wide coloured streak with a white-hot core and a glowing head, always
   spanning from the muzzle toward the exact hit point so every shot visibly converges on the
   crosshair. Damage is hitscan and applied on spawn; this is purely the visual. The railgun draws
   its whole beam at once and lets it fade. */
var TRACER_MAX=36,tracerPool=[],tracerHead=0;
var TRACER_CFG=[
  {speed:420,length:3.2,width:0.065,color:0xffca66},   /* carbine: bright amber-white */
  {speed:320,length:1.6,width:0.048,color:0xff8833},   /* shotgun pellets: fiery orange */
  {speed:390,length:2.4,width:0.054,color:0xffe47a},   /* smg: bright golden */
  {speed:0,  length:0,  width:0.14, color:0x40e8ff},   /* railgun beam: intense cyan plasma */
  {speed:380,length:2.0,width:0.050,color:0xffd97a}    /* pistol: short warm tracer */
];
var tracerTex=paint(64,256,function(g,w,h){
  g.clearRect(0,0,w,h);
  var v=g.createLinearGradient(0,0,0,h);               /* head at the top, tail fades out */
  v.addColorStop(0,'rgba(255,255,255,1)');v.addColorStop(0.16,'rgba(255,255,255,.95)');
  v.addColorStop(0.5,'rgba(255,255,255,.42)');v.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle=v;g.fillRect(0,0,w,h);
  var e=g.createLinearGradient(0,0,w,0);               /* soft edges across the width */
  e.addColorStop(0,'rgba(0,0,0,1)');e.addColorStop(0.38,'rgba(0,0,0,0)');e.addColorStop(0.62,'rgba(0,0,0,0)');e.addColorStop(1,'rgba(0,0,0,1)');
  g.globalCompositeOperation='destination-out';g.fillStyle=e;g.fillRect(0,0,w,h);
});
tracerTex.wrapS=tracerTex.wrapT=THREE.ClampToEdgeWrapping;tracerTex.repeat.set(1,1);
var ribbonGeo=new THREE.PlaneGeometry(1,1);ribbonGeo.rotateX(Math.PI/2);   /* XZ plane, head (uv top) at +Z */
for(var ti=0;ti<TRACER_MAX;ti++){
  var tGroup=new THREE.Group();
  var matOuter=new THREE.MeshBasicMaterial({map:tracerTex,color:0xffc266,transparent:true,opacity:0.95,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide});
  var matCore=new THREE.MeshBasicMaterial({map:tracerTex,color:0xffffff,transparent:true,opacity:1,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide});
  var outerMesh=new THREE.Mesh(ribbonGeo,matOuter);tGroup.add(outerMesh);
  var coreMesh=new THREE.Mesh(ribbonGeo,matCore);coreMesh.scale.set(0.34,1,0.9);coreMesh.position.z=0.05;tGroup.add(coreMesh);
  var headSprite=new THREE.Sprite(new THREE.SpriteMaterial({map:TX.glow,color:0xffffff,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));
  headSprite.position.z=0.5;headSprite.scale.set(1.6,1.6,1);tGroup.add(headSprite);
  tGroup.visible=false;tGroup.renderOrder=5;scene.add(tGroup);
  tracerPool.push({group:tGroup,outer:outerMesh,core:coreMesh,head:headSprite,matOuter:matOuter,matCore:matCore,
    active:false,beam:false,x:0,y:0,z:0,dx:0,dy:0,dz:1,vx:0,vy:0,vz:0,speed:400,length:2,width:0.04,baseWidth:0.04,
    distance:0,travel:0,age:0,caliber:0,hitCallback:null});
}
var _tDir=new THREE.Vector3(),_tCam=new THREE.Vector3(),_tX=new THREE.Vector3(),_tY=new THREE.Vector3(),_tM=new THREE.Matrix4();
function orientRibbon(t){
  _tDir.set(t.dx,t.dy,t.dz);
  _tCam.copy(camera.position).sub(t.group.position);
  _tX.crossVectors(_tDir,_tCam);
  if(_tX.lengthSq()<1e-8)_tX.set(1,0,0);else _tX.normalize();
  _tY.crossVectors(_tX,_tDir).normalize();
  _tM.makeBasis(_tX,_tY,_tDir);
  t.group.quaternion.setFromRotationMatrix(_tM);
}
function positionTracer(t){
  /* the streak lives between the muzzle and the hit point; once the head arrives the tail catches up */
  var head=Math.min(t.distance,t.travel),tail=t.beam?0:Math.max(0,t.travel-t.length);
  var len=Math.max(0.03,head-tail),center=tail+len*0.5;
  t.group.position.set(t.x+t.dx*center,t.y+t.dy*center,t.z+t.dz*center);
  t.group.scale.set(t.width,t.width,len);
  t.head.visible=head<t.distance-0.05||t.beam;
  orientRibbon(t);
}
function spawn3DTracer(ox,oy,oz,tx,ty,tz,caliber,callback){
  if(callback)callback(tx,ty,tz);
  var dx=tx-ox,dy=ty-oy,dz=tz-oz,dist=Math.hypot(dx,dy,dz);
  if(!Number.isFinite(dist)||dist<.02)return;
  var t=tracerPool[tracerHead];tracerHead=(tracerHead+1)%TRACER_MAX;
  var cfg=TRACER_CFG[caliber]||TRACER_CFG[0];
  t.caliber=caliber;t.beam=caliber===3;t.speed=cfg.speed;t.length=t.beam?dist:cfg.length;t.width=t.baseWidth=cfg.width;
  t.x=ox;t.y=oy;t.z=oz;t.dx=dx/dist;t.dy=dy/dist;t.dz=dz/dist;t.vx=t.dx*t.speed;t.vy=t.dy*t.speed;t.vz=t.dz*t.speed;
  t.distance=dist;t.travel=t.beam?dist:Math.min(dist,0.3);t.age=0;t.hitCallback=null;
  t.matOuter.color.setHex(cfg.color);t.matOuter.opacity=0.95;t.matCore.opacity=1;
  t.head.material.color.setHex(cfg.color);t.head.material.opacity=1;
  t.group.visible=true;t.active=true;positionTracer(t);
}
function updateTracers(dt){
  for(var i=0;i<TRACER_MAX;i++){
    var t=tracerPool[i];if(!t.active)continue;
    t.age+=dt;
    if(t.beam){
      /* the rail beam hangs in the air for a third of a second, thinning and dimming */
      var k=1-t.age/0.34;
      if(k<=0){t.active=false;t.group.visible=false;continue;}
      t.matOuter.opacity=0.95*k;t.matCore.opacity=k*k;t.head.material.opacity=k;
      t.width=t.baseWidth*(0.45+0.55*k);
      positionTracer(t);continue;
    }
    t.travel+=t.speed*dt;
    if(t.travel-t.length>=t.distance){t.active=false;t.group.visible=false;continue;}
    positionTracer(t);
  }
}

/* Kinetic Surface Impact Dynamics: Ricochets, Debris Fountains, & Audio Cracks */
function triggerKineticImpact(hx, hy, hz, caliber) {
  var count = caliber === 1 ? 3 : (caliber === 3 ? 12 : 6);
  var r = caliber === 3 ? 0.15 : 1.0;
  var g = caliber === 3 ? 0.92 : 0.68;
  var b = caliber === 3 ? 1.0 : 0.22;
  spark(hx, hy, hz, count, r, g, b, 4.8, 3.4);
  smoke(hx, hy, hz, caliber === 3 ? 3 : 1);

  // Surface gouge spark bounce
  for(var bi=0; bi<3; bi++){
    var angle = Math.random() * TAU;
    var bSpd = 3.5 + Math.random() * 4.0;
    var p = parts[pHead]; pHead = (pHead + 1) % PMAX;
    p.life = 0.45 + Math.random() * 0.45;
    p.x = hx; p.y = hy; p.z = hz;
    p.vx = Math.cos(angle) * bSpd;
    p.vy = 2.0 + Math.random() * 3.5;
    p.vz = Math.sin(angle) * bSpd;
    p.r = r; p.g = g; p.b = b;
  }

  var distToPlayer = Math.hypot(hx - P.x, hz - P.z);
  if (distToPlayer < 9.5 && distToPlayer > 1.0) {
    sfxBulletSnap();
  }
}

/* High-Pitched Supersonic Metal Ricochet Ping Sound */
function sfxRicochetPing(){
  if(typeof actx === 'undefined') return;
  try {
    var osc = actx.createOscillator();
    var gn = actx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(3200 + Math.random() * 800, actx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800 + Math.random() * 300, actx.currentTime + 0.12);
    gn.gain.setValueAtTime(0.08, actx.currentTime);
    gn.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.12);
    osc.connect(gn);
    gn.connect(masterGain);
    osc.start();
    osc.stop(actx.currentTime + 0.13);
  } catch(e) {}
}

function sfxBulletSnap() {
  if (typeof actx === 'undefined') return;
  try {
    var osc = actx.createOscillator();
    var gn = actx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(2600, actx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(120, actx.currentTime + 0.038);
    gn.gain.setValueAtTime(0.14, actx.currentTime);
    gn.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.038);
    osc.connect(gn);
    gn.connect(masterGain);
    osc.start();
    osc.stop(actx.currentTime + 0.040);
  } catch(e) {}
}
