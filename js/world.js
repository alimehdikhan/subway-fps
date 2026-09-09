/* Last Train — world.js
   The station geometry, train, props, explosive barrels, lighting, baked light, gibs and
   collision maths. All game scripts share one global scope and load in the order listed in
   index.html. */
'use strict';

/* ============================ the station ============================ */
var world=new THREE.Group();scene.add(world);
var COL=[];           /* axis aligned boxes: ghost boxes stop feet but not bullets */
var FIXTURES=[];      /* lamp positions for the roaming light pool */
var SPAWNS=[[-6,-37],[-9.2,-34],[-3.4,-36],[-6.5,36],[-9.4,33],[-3.2,34.5]];
var Z0=-42,Z1=42,LEN=84;   /* platform extents; must be set before anything below reads them */

/* Atmospheric floating dust motes */
var DUST_MAX=90;
var dustGeo=new THREE.BufferGeometry();
var dustPos=new Float32Array(DUST_MAX*3);
for(var di=0;di<DUST_MAX;di++){
  dustPos[di*3]=rr(-10.5,-1.5);
  dustPos[di*3+1]=rr(0.3,3.8);
  dustPos[di*3+2]=rr(Z0+2,Z1-2);
}
dustGeo.setAttribute('position',new THREE.BufferAttribute(dustPos,3));
var dustMat=new THREE.PointsMaterial({size:0.04,map:TX.glow,transparent:true,opacity:0.32,
  color:0xdfebe7,blending:THREE.AdditiveBlending,depthWrite:false});
var dustPoints=new THREE.Points(dustGeo,dustMat);
dustPoints.frustumCulled=false;scene.add(dustPoints);

/* Subway tunnel railway signals in distance */
glow(2.2, 0.4, -44, 2.8, 0xff2014, 0.95); /* North tunnel red signal */
glow(2.2, 1.1, -44, 2.2, 0xe8a33d, 0.85); /* North tunnel amber signal */
glow(2.2, 0.4, 44, 2.8, 0xff2014, 0.95);  /* South tunnel red signal */
glow(2.2, 1.1, 44, 2.2, 0xe8a33d, 0.85);  /* South tunnel amber signal */

/* Platform safety edge markers: one point cloud instead of a sprite per lamp */
(function edgeMarkers(){
  var n=0,pos=[];
  for(var sj=Z0+4;sj<Z1;sj+=3.5){pos.push(-1.48,0.03,sj);n++;}
  var g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(pos),3));
  var pts=new THREE.Points(g,new THREE.PointsMaterial({size:0.42,map:TX.glow,color:0xe8a33d,transparent:true,opacity:0.6,blending:THREE.AdditiveBlending,depthWrite:false}));
  pts.frustumCulled=false;world.add(pts);
})();

function collide(x,y,z,sx,sy,sz,ghost){COL.push({min:[x-sx/2,y-sy/2,z-sz/2],max:[x+sx/2,y+sy/2,z+sz/2],ghost:!!ghost});}
var geoCache={};
/* every static box carries uv2 so baked light and occlusion maps can address it */
function bg(sx,sy,sz){
  var k=sx+'|'+sy+'|'+sz;
  if(!geoCache[k]){geoCache[k]=new THREE.BoxGeometry(sx,sy,sz);geoCache[k].setAttribute('uv2',geoCache[k].attributes.uv);}
  return geoCache[k];
}
function add(x,y,z,sx,sy,sz,material,opt){
  opt=opt||{};
  var m=new THREE.Mesh(bg(sx,sy,sz),material);
  m.position.set(x,y,z);
  if(opt.ry)m.rotation.y=opt.ry;
  if(opt.rz)m.rotation.z=opt.rz;
  m.castShadow=true;m.receiveShadow=true;
  (opt.parent||world).add(m);
  if(!opt.parent)m.userData.stationStatic=true;
  if(opt.solid)collide(x,y,z,sx,sy,sz,opt.ghost);
  return m;
}
/* round section pieces (pipes, conduits, rods); batched with the boxes by material */
var pipeCache={};
function pipe(x,y,z,r,len,material,axis,parent){
  var k=r+'|'+len;
  if(!pipeCache[k])pipeCache[k]=new THREE.CylinderGeometry(r,r,len,10);
  var m=new THREE.Mesh(pipeCache[k],material);
  m.position.set(x,y,z);
  if(axis==='z')m.rotation.x=Math.PI/2;else if(axis==='x')m.rotation.z=Math.PI/2;
  m.castShadow=true;m.receiveShadow=true;
  (parent||world).add(m);
  if(!parent)m.userData.stationStatic=true;
  return m;
}
function plane(x,y,z,w,d,material,rx,ry,rz){
  var g=new THREE.PlaneGeometry(w,d);g.setAttribute('uv2',g.attributes.uv);
  var m=new THREE.Mesh(g,material);
  /* the ballast bed, the tactile strip and the worn paint line are all planes, and none of them
     took a real-time shadow before: only floorMesh was patched afterwards */
  m.receiveShadow=true;
  m.position.set(x,y,z);m.rotation.set(rx||0,ry||0,rz||0);world.add(m);return m;
}
function sign(x,y,z,w,h,tex,ry){
  var m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),signMat(tex));
  m.position.set(x,y,z);m.rotation.y=ry||0;world.add(m);return m;
}
/* a wall sign in a shallow steel frame so it no longer reads as a paper-thin plane */
function framedSign(x,y,z,w,h,tex,ry){
  var nx=Math.sin(ry||0),nz=Math.cos(ry||0);          /* facing direction of the plane */
  add(x-nx*0.035,y,z-nz*0.035,Math.abs(nx)>0.5?0.06:w+0.10,h+0.10,Math.abs(nx)>0.5?w+0.10:0.06,M.benchMetal);
  return sign(x,y,z,w,h,tex,ry);
}
function glow(x,y,z,size,color,opacity,parent){
  var s=new THREE.Sprite(new THREE.SpriteMaterial({map:TX.glow,color:color,transparent:true,
    blending:THREE.AdditiveBlending,depthWrite:false,opacity:opacity===undefined?1:opacity}));
  s.material.userData={own:true};
  s.position.set(x,y,z);s.scale.set(size,size,1);(parent||world).add(s);return s;
}

/* floor, edge, track bed */
var floorMesh=plane(-6,0,0,10,LEN,M.floor,-Math.PI/2);
floorMesh.receiveShadow=true;
plane(-1.52,0.014,0,0.78,LEN,M.tactile,-Math.PI/2);
plane(-2.02,0.012,0,0.12,LEN,M.paintLine,-Math.PI/2);       /* worn "stand behind" line */
add(-1.1,-0.02,0,0.24,0.1,LEN,M.metalLong);                  /* steel nosing */
add(-1,-0.56,0,0.2,1.12,LEN,M.face);
plane(2.9,-1.1,0,7.7,LEN,M.gravel,-Math.PI/2);
/* Standing water on the track bed and damp patches on the platform (masked in graphics.js) */
var puddleMat=new THREE.MeshStandardMaterial({color:0x0a1418,roughness:0.05,metalness:0.95,
  transparent:true,opacity:0.7,envMap:envCube,envMapIntensity:1.2});
for(var pdi=0;pdi<5;pdi++){
  var px=rr(1,5),pz=rr(Z0+8,Z1-8),ps=rr(1.4,3.2);
  var puddle=new THREE.Mesh(new THREE.PlaneGeometry(ps,ps*rr(0.5,1.2)),puddleMat);
  puddle.position.set(px,-1.08,pz);puddle.rotation.x=-Math.PI/2;puddle.rotation.z=rr(0,TAU);
  puddle.receiveShadow=true;world.add(puddle);
}
var platPuddleMat=new THREE.MeshStandardMaterial({color:0x121a1d,roughness:0.10,metalness:0.75,
  transparent:true,opacity:0.42,envMap:envCube,envMapIntensity:1.5});
for(var ppi=0;ppi<7;ppi++){
  /* damp patches sit under the fixtures where the reflections have something to show */
  var ppx=rr(-9.4,-2.4),ppz=Z0+5+7*Math.floor(rr(0,12))+rr(-2.2,2.2),pps=rr(1.6,3.6);
  var ppuddle=new THREE.Mesh(new THREE.PlaneGeometry(pps,pps*rr(0.6,1.4)),platPuddleMat);
  ppuddle.position.set(ppx,0.006,clamp(ppz,Z0+5,Z1-5));ppuddle.rotation.x=-Math.PI/2;ppuddle.rotation.z=rr(0,TAU);
  world.add(ppuddle);
}
/* rails: rusted web, polished running surface, baseplates and a third rail on insulators */
[0.55,2.45].forEach(function(rx){
  add(rx,-0.985,0,0.12,0.13,LEN,M.railRust);
  add(rx,-0.905,0,0.072,0.03,LEN,M.rail);
});
add(4.6,-0.9,0,0.09,0.09,LEN,M.railRust);
add(4.6,-0.855,0,0.1,0.012,LEN,M.rail);
(function sleepers(){
  var g=bg(2.9,0.14,0.32),inst=new THREE.InstancedMesh(g,M.sleeper,66),d=new THREE.Object3D();
  var plate=bg(0.26,0.03,0.34),plates=new THREE.InstancedMesh(plate,M.railRust,132);
  var pot=new THREE.CylinderGeometry(0.05,0.065,0.11,8),pots=new THREE.InstancedMesh(pot,M.paint,22),pi=0;
  for(var i=0;i<66;i++){
    var z=Z0+2+i*1.26;
    d.position.set(1.5,-1.04,z);d.rotation.set(0,0,0);d.updateMatrix();inst.setMatrixAt(i,d.matrix);
    d.position.set(0.55,-0.96,z);d.updateMatrix();plates.setMatrixAt(i*2,d.matrix);
    d.position.set(2.45,-0.96,z);d.updateMatrix();plates.setMatrixAt(i*2+1,d.matrix);
    if(i%3===0&&pi<22){d.position.set(4.6,-0.985,z);d.updateMatrix();pots.setMatrixAt(pi++,d.matrix);}
  }
  inst.receiveShadow=true;world.add(inst);world.add(plates);world.add(pots);
})();

/* walls and ceiling */
add(-11.3,3.1,0,0.6,6.2,LEN,M.tile,{solid:true});
add(-10.92,0.62,0,0.16,1.24,LEN,M.wainscot);
add(-10.92,1.3,0,0.2,0.1,LEN,M.metalLong);
add(7.2,3.2,0,0.6,7.4,LEN,M.tileFar,{solid:true});
add(-2,5.62,0,19,0.34,LEN,M.panel);
add(-11.05,5.2,0,0.5,0.5,LEN,M.metalLong);
var CEIL_OCC=[];
for(var bz=Z0+3;bz<Z1;bz+=4){
  add(-2,5.36,bz,18.6,0.24,0.3,M.paint);
  CEIL_OCC.push({min:[-11.3,5.24,bz-0.15],max:[7.3,5.48,bz+0.15],reach:0.4,strength:0.55});
}
for(var cz=0;cz<3;cz++)add(-10.75,4.35+cz*0.22,0,0.16,0.16,LEN,M.metalLong);
/* ceiling services: conduits with junction boxes, a cable tray and a ventilation duct */
pipe(-9.35,5.34,0,0.05,LEN,M.conduit,'z');
pipe(-9.12,5.36,0,0.032,LEN,M.conduit,'z');
pipe(-0.55,5.35,0,0.06,LEN,M.conduit,'z');
add(0.75,5.38,0,0.42,0.05,LEN,M.metalLong);
add(1.9,5.08,0,0.8,0.46,LEN,M.duct);
for(var sz2=Z0+1;sz2<Z1;sz2+=6){
  add(1.9,5.08,sz2,0.86,0.52,0.06,M.metalLong);                          /* duct flanges */
  add(-10.75,4.7,sz2+2,0.04,0.86,0.04,M.conduit);                       /* cable tray hangers */
  add(-9.35,5.4,sz2+3,0.14,0.05,0.05,M.metalLong);add(-0.55,5.41,sz2+3,0.16,0.05,0.05,M.metalLong);   /* pipe saddles */
  if((sz2-Z0-1)%12===0)add(-9.35,5.32,sz2+1,0.18,0.13,0.22,M.conduit);  /* junction boxes */
}
/* ends of the platform */
add(-6,3,Z0-0.3,10.6,6.2,0.6,M.tileEnd,{solid:true});
add(-6,3,Z1+0.3,10.6,6.2,0.6,M.tileEnd,{solid:true});
collide(3.05,1.6,0,8.0,5.6,LEN,true);        /* the drop to the track: feet only */

/* strip lighting */
var coneMat=new THREE.MeshBasicMaterial({map:TX.lightBeam,transparent:true,opacity:0.06,
  blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide});
var coneGeo=new THREE.CylinderGeometry(0.34,1.7,4.7,12,1,true);
var cones=[],FLICKER_INDEX=4,flickerLamp=null,flickerGlow=null,flickerCone=null;
/* Every tube in the station, so a bullet can find one and put it out. The main row is index
   aligned with FIXTURES, which is what the roaming light pool and the volumetric march read; the
   second row over the far track has no pool light of its own, so its `fixture` is -1. */
var LAMPS=[],FIXTURE_DEAD={};
var fixtureIndex=0;
for(var lz=Z0+5;lz<Z1;lz+=7){
  var isFlicker=fixtureIndex===FLICKER_INDEX;
  add(-6,5.18,lz,0.78,0.14,3.06,M.paint);
  add(-6,5.12,lz-1.5,0.7,0.1,0.06,M.metalLong);add(-6,5.12,lz+1.5,0.7,0.1,0.06,M.metalLong);
  var lampMesh=add(-6,5.105,lz,0.6,0.03,2.76,isFlicker?M.lamp.clone():M.lamp);
  /* Keep every diffuser out of batchStation. It merges same-material static meshes into one and
     removes the originals, so a batched tube cannot be turned off on its own: swapping its
     material would recolour an object that is no longer in the scene, which is why a shot tube
     used to drop its glass and its beam and stay lit. Twenty-four extra draw calls buys the
     ability to put them out one at a time. */
  lampMesh.userData.stationStatic=false;
  var g1=glow(-6,5.0,lz,2.4,0xe6f0ff,0.16);
  FIXTURES.push([-6,4.9,lz]);
  var cone=new THREE.Mesh(coneGeo,isFlicker?coneMat.clone():coneMat);
  cone.position.set(-6,2.65,lz);world.add(cone);cones.push(cone);
  if(isFlicker){flickerLamp=lampMesh;flickerGlow=g1;flickerCone=cone;}
  LAMPS.push({x:-6,y:5.14,z:lz,mesh:lampMesh,glow:g1,cone:cone,fixture:fixtureIndex,broken:false,
    min:[-6.42,4.98,lz-1.60],max:[-5.58,5.30,lz+1.60]});
  add(3,5.2,lz+3.5,0.42,0.12,1.8,M.paint);
  var lamp2=add(3,5.125,lz+3.5,0.3,0.03,1.6,M.lamp);
  lamp2.userData.stationStatic=false;
  var glow2=glow(3,5.08,lz+3.5,2.2,0xe6f0ff,0.2);
  LAMPS.push({x:3,y:5.14,z:lz+3.5,mesh:lamp2,glow:glow2,cone:null,fixture:-1,broken:false,
    min:[2.72,4.98,lz+3.5-0.95],max:[3.28,5.30,lz+3.5+0.95]});
  fixtureIndex++;
}
/* amber emergency lamps on the platform wall: the only warm light in the room */
var AMBER=[-28,-4,20];
AMBER.forEach(function(z){
  add(-10.8,3.75,z,0.18,0.2,0.36,M.paint);
  add(-10.69,3.75,z,0.03,0.15,0.3,M.amberLamp);
  glow(-10.6,3.75,z,1.8,0xffb040,0.42);
});
/* pillars, each with a platform number plate, a steel band and a contact shadow */
for(var pz=-36;pz<=36;pz+=12){
  add(-4.6,2.75,pz,0.95,5.5,0.95,M.tileCol,{solid:true});
  add(-4.6,0.16,pz,1.14,0.32,1.14,M.paint);
  add(-4.6,0.36,pz,1.02,0.08,1.02,M.paint);
  add(-4.6,5.35,pz,1.2,0.3,1.2,M.paint);
  add(-4.6,2.32,pz,1.0,0.06,1.0,M.metalLong);
  framedSign(-4.11,3.1,pz,0.6,0.44,TX.times,Math.PI/2);
  framedSign(-5.09,3.1,pz,0.6,0.44,TX.times,-Math.PI/2);
  if(pz===-12||pz===24){                                                /* fire extinguisher on a bracket */
    add(-5.16,1.25,pz+0.2,0.06,0.16,0.14,M.metalLong);
    pipe(-5.2,1.15,pz+0.2,0.07,0.5,M.redBox,'y');
    pipe(-5.2,1.44,pz+0.2,0.02,0.1,M.metalLong,'y');
  }
  if(pz===0||pz===-24){add(-4.6,4.85,pz+0.55,0.14,0.12,0.2,M.paint);add(-4.6,4.85,pz+0.68,0.06,0.06,0.06,M.black);}   /* camera */
}
/* benches, bins, machines, crates */
function bench(z){
  add(-9.55,0.30,z-1.6,0.14,0.60,0.45,M.benchMetal,{solid:true});
  add(-9.55,0.30,z+1.6,0.14,0.60,0.45,M.benchMetal,{solid:true});
  add(-9.55,0.65,z-1.6,0.12,0.40,0.10,M.benchMetal);
  add(-9.55,0.65,z+1.6,0.12,0.40,0.10,M.benchMetal);
  for(var si=0;si<4;si++){
    add(-9.9+si*0.14,0.58,z,0.10,0.045,3.6,M.benchWood);
  }
  for(var bi=0;bi<3;bi++){
    add(-10.42+bi*0.04,0.85+bi*0.12,z,0.04,0.09,3.6,M.benchWood);
  }
}
bench(-26);bench(4);bench(30);

function bin(x,z){
  var binBody=new THREE.Mesh(new THREE.CylinderGeometry(0.36,0.32,0.92,14),M.metal);
  binBody.position.set(x,0.46,z);binBody.castShadow=true;binBody.receiveShadow=true;
  world.add(binBody);
  var binLid=new THREE.Mesh(new THREE.CylinderGeometry(0.38,0.38,0.08,14),M.benchMetal);
  binLid.position.set(x,0.94,z);world.add(binLid);
  var binHole=new THREE.Mesh(new THREE.CylinderGeometry(0.16,0.16,0.10,10),M.black);
  binHole.position.set(x,0.95,z);world.add(binHole);
  collide(x,0.46,z,0.76,0.95,0.76);
}
bin(-9.6,-12);bin(-9.6,16);bin(-2.6,-30);

/* illuminated beverage machine */
function machine(z,tex,color){
  add(-10.2,1.15,z,1.35,2.30,1.55,M.vendingChassis,{solid:true});
  add(-9.52,2.15,z,0.04,0.22,1.40,M.lamp);
  glow(-9.50,2.15,z,2.0,0x00f0ff,0.2);
  sign(-9.51,1.25,z,1.38,1.50,TX.vendingFront,Math.PI/2);
  add(-9.49,1.25,z,0.02,1.52,1.40,M.glass);
  glow(-9.48,1.25,z,2.4,0x3ae0e8,0.16);
  add(-9.51,0.28,z,0.04,0.38,1.10,M.benchMetal);
  add(-9.505,0.28,z,0.01,0.14,0.7,M.black);
}
machine(-18,TX.ad2);machine(22,TX.ad3,M.vendingChassis);

/* ticket kiosk */
function ticketKiosk(z){
  add(-10.3,1.20,z,1.15,2.40,1.15,M.ticketKiosk,{solid:true});
  sign(-9.71,1.45,z,0.85,0.95,TX.ticketScreen,Math.PI/2);
  add(-9.70,1.45,z,0.02,0.88,0.98,M.glass);
  glow(-9.66,1.45,z,1.8,0x00e5ff,0.22);
  add(-9.71,0.85,z,0.05,0.12,0.50,M.benchMetal);
  add(-9.71,0.55,z,0.08,0.22,0.40,M.vendingChassis);
}
ticketKiosk(10);ticketKiosk(-32);

for(var i=0;i<5;i++){
  var cx=[-8.4,-3.1,-8.4,-2.9,-9.2][i],cz=[-20,-8,6,22,-28][i];
  add(cx,0.55,cz,1.3,1.1,1.25,M.metal,{solid:true});
  add(cx,1.14,cz,1.36,0.1,1.3,M.paint);
  add(cx,0.55,cz,1.34,0.06,1.29,M.paint);                                /* banding strap */
  add(cx,0.55,cz,1.31,1.12,0.06,M.paint);
}

/* wall graphics */
framedSign(-10.94,3.3,-20,4.4,2.2,TX.name,Math.PI/2);
framedSign(-10.94,3.3,14,4.4,2.2,TX.name,Math.PI/2);
framedSign(-10.94,2.5,-6,3,1.5,TX.map,Math.PI/2);
framedSign(-10.94,2.5,26,3,1.5,TX.ad1,Math.PI/2);
framedSign(-10.94,2.5,-32,3,1.5,TX.ad3,Math.PI/2);
framedSign(-10.94,2.5,0,3,1.5,TX.times,Math.PI/2);
framedSign(6.87,3.4,-14,4.6,2.3,TX.ad1,-Math.PI/2);
framedSign(6.87,3.4,18,4.6,2.3,TX.ad2,-Math.PI/2);
framedSign(6.87,3.4,2,4.6,2.3,TX.name,-Math.PI/2);
/* hanging signs */
[[-14],[16]].forEach(function(a){
  var z=a[0];
  add(-7.4,4.9,z,0.05,1.2,0.05,M.metalLong);add(-4.6,4.9,z,0.05,1.2,0.05,M.metalLong);
  add(-6,4.14,z,3.6,0.9,0.1,M.paint);
  sign(-6,4.14,z-0.06,3.5,0.82,TX.hang,Math.PI);
  sign(-6,4.14,z+0.06,3.5,0.82,TX.hang,0);
  glow(-6,4.14,z,2.6,0xffd79a,0.08);
});
/* stairs up to the street, sealed */
(function stairwell(){
  var z=37.4;
  add(-8,2.4,z,6,4.8,3.4,M.tileEnd,{solid:true});
  add(-8,0.2,z-1.75,5.6,0.4,0.2,M.paint);
  for(var s=0;s<7;s++)add(-8,0.24+s*0.34,z-1.4+s*0.32,4.6,0.34,0.34,M.grime);
  var dark=new THREE.Mesh(new THREE.PlaneGeometry(3.4,2.6),M.black);
  dark.position.set(-8,1.35,z-1.71);dark.rotation.y=Math.PI;world.add(dark);
  add(-8,2.72,z-1.7,3.8,0.16,0.1,M.metalLong);
  framedSign(-8,3.42,z-1.72,2.1,1.05,TX.exit,Math.PI);
  glow(-8,3.42,z-1.7,2.6,0x57b391,0.3);
  add(-5.6,1,z-1.8,0.1,2,0.1,M.metal);
  add(-10.4,1,z-1.8,0.1,2,0.1,M.metal);
  add(-8,1.98,z-1.8,4.9,0.1,0.1,M.metal);
  add(-8,1.5,z-1.9,5.0,0.9,0.02,M.metalLong);                               /* roller shutter */
})();
/* tunnel mouths */
[Z0,Z1].forEach(function(z,i){
  var s=i?1:-1;
  add(2.8,1.9,z+s*0.4,8.4,6.4,0.5,M.grime);
  var hole=new THREE.Mesh(new THREE.PlaneGeometry(6.2,4.4),M.black);
  hole.position.set(2.8,0.9,z+s*0.14);hole.rotation.y=i?Math.PI:0;world.add(hole);
  add(2.8,3.3,z+s*0.1,6.8,0.5,0.2,M.paint);
  add(-0.5,1.0,z+s*0.1,0.4,3.9,0.2,M.paint);add(6.1,1.0,z+s*0.1,0.4,3.9,0.2,M.paint);
  glow(0.4,2.6,z+s*0.2,1.5,i?0xff3a2a:0x3ad07f,0.7);
});
/* signal mast and a stranded maintenance cart */
add(6.2,0.4,-24,0.16,2.6,0.16,M.metal);
add(6.2,1.6,-24,0.4,0.9,0.3,M.paint);
glow(6.02,1.85,-24,0.9,0xff3a2a,0.9);
glow(6.02,1.45,-24,0.7,0x2a3f3a,0.5);
add(1.5,-0.62,-24,2.2,0.5,3.4,M.metal);
add(1.5,-0.2,-24.9,1.9,0.4,0.9,M.orange);
add(0.6,-0.3,-23,0.1,0.7,0.1,M.metal);
add(2.4,-0.3,-23,0.1,0.7,0.1,M.metal);

/* ============================ the train ============================ */
var train=new THREE.Group();train.position.set(-1.4,0,-190);world.add(train);
var doorsL=[],doorsR=[],trainLights=[];
(function buildTrain(){
  var wheelGeo=new THREE.CylinderGeometry(0.42,0.42,0.12,14);
  for(var c=0;c<3;c++){
    var z=(c-1)*19;
    add(2.9,1.55,z,3.5,3.1,18.4,M.train,{parent:train});
    add(2.9,3.2,z,3.2,0.4,18,M.paint,{parent:train});
    add(2.9,3.5,z,1.6,0.3,3.4,M.duct,{parent:train});                       /* roof air handler */
    add(2.9,3.45,z-6,1.2,0.2,1.6,M.duct,{parent:train});
    add(2.9,-0.1,z,3.3,0.5,18,M.dark,{parent:train});
    add(1.16,0.9,z,0.04,0.12,18,M.paint,{parent:train});                    /* rub rail */
    for(var w=0;w<5;w++){
      var wz=z-7.4+w*3.7;
      if(w===2)continue;
      add(1.13,2.05,wz,0.1,1.15,2.5,M.glass,{parent:train});
      add(1.12,2.05,wz,0.05,1.25,2.6,M.benchMetal,{parent:train});          /* window frame */
      var lit=add(1.2,2.05,wz,0.02,1.05,2.35,new THREE.MeshBasicMaterial({color:0xffebb0}),{parent:train});
      trainLights.push(lit);
    }
    /* the doors that matter */
    var dz=z;
    add(1.14,1.6,dz,0.08,3,2.9,M.paint,{parent:train});
    var l=add(1.1,1.6,dz-0.72,0.1,2.6,1.4,M.glass,{parent:train});
    var r=add(1.1,1.6,dz+0.72,0.1,2.6,1.4,M.glass,{parent:train});
    l.userData.home=dz-0.72;r.userData.home=dz+0.72;
    doorsL.push(l);doorsR.push(r);
    add(1.08,0.22,dz,0.12,0.14,2.8,new THREE.MeshBasicMaterial({color:0xe8a33d}),{parent:train});
    /* bogies */
    [-6,6].forEach(function(bz2){
      add(2.9,-0.5,z+bz2,2.4,0.36,1.9,M.dark,{parent:train});
      [[1.75,-0.55],[1.75,0.55],[4.05,-0.55],[4.05,0.55]].forEach(function(wp){
        var wheel=new THREE.Mesh(wheelGeo,M.metalLong);wheel.rotation.z=Math.PI/2;
        wheel.position.set(wp[0],-0.62,z+bz2+wp[1]);train.add(wheel);
      });
    });
  }
  add(2.9,1.6,28.4,3.3,3,0.4,M.paint,{parent:train});
  add(2.9,1.6,-28.4,3.3,3,0.4,M.paint,{parent:train});
  add(2.9,2.4,28.62,2.2,1.0,0.06,M.glass,{parent:train});                 /* cab windscreen */
  add(2.0,1.0,28.62,0.34,0.22,0.06,M.lamp,{parent:train});add(3.8,1.0,28.62,0.34,0.22,0.06,M.lamp,{parent:train});
  add(2.9,3.05,28.62,1.4,0.3,0.06,M.amberLamp,{parent:train});             /* destination blind */
  glow(1.4,1.2,28.6,1.6,0xffd08a,0.9,train);
  glow(1.4,1.2,-28.6,1.4,0xff4030,0.9,train);
})();
var boardMarker=glow(-2,1.2,0,2.6,0x6fe0b8,0);

/* Emergency wall strobe beacons (visual sprites only, zero shader light cost) */
var strobes=[];
var strobePoss=[[-10.5,3.2,-20],[-10.5,3.2,0],[-10.5,3.2,20]];
for(var si=0;si<strobePoss.length;si++){
  var sp=strobePoss[si];
  add(sp[0]-0.2,sp[1],sp[2],0.14,0.16,0.16,M.paint);
  var sGlow=glow(sp[0]+0.1,sp[1],sp[2],0.7,0xff2818,0);
  strobes.push({glow:sGlow,phase:si*2.1});
}

/* Extra props: neon-fronted machines and slatted benches */
(function buildProps(){
  var vmGeo=bg(1.2,2.3,0.8);
  var vmMat=plain(0x122228,0.3,0.8,0.5);
  var neonCyan=new THREE.MeshBasicMaterial({color:0x00f3ff});
  var neonPink=new THREE.MeshBasicMaterial({color:0xff1493});
  [[-10.6,-14],[-10.6,14]].forEach(function(pos,idx){
    var vm=new THREE.Mesh(vmGeo,vmMat);vm.position.set(pos[0],1.15,pos[1]);vm.castShadow=true;vm.receiveShadow=true;world.add(vm);
    collide(pos[0],1.15,pos[1],1.3,2.3,0.9);
    var hdr=new THREE.Mesh(bg(1.0,0.35,0.06),idx===0?neonCyan:neonPink);
    hdr.position.set(pos[0]+0.42,1.9,pos[1]);hdr.rotation.y=Math.PI/2;world.add(hdr);
    glow(pos[0]+0.5,1.9,pos[1],1.2,idx===0?0x00f3ff:0xff1493,0.35);
  });
  var benchMat=plain(0x222a28,0.5,0.7,0.4);
  var seatMat=plain(0x6e4827,0.8,0.1,0.2);
  [-24,0,24].forEach(function(bz){
    var bx=-6.8;
    add(bx,0.45,bz,0.85,0.08,2.4,seatMat,{solid:true});
    add(bx-0.38,0.75,bz,0.08,0.65,2.4,seatMat);
    add(bx,0.22,bz-0.95,0.8,0.42,0.1,benchMat);
    add(bx,0.22,bz+0.95,0.8,0.42,0.1,benchMat);
  });
})();

/* Explosive Hazard Barrels */
var barrels=[];
var barrelGeo=new THREE.CylinderGeometry(0.32,0.32,0.88,12);
var barrelMat=new THREE.MeshStandardMaterial({color:0xb01e10,roughness:0.55,metalness:0.5,map:rep(TX.metal,2,1),roughnessMap:rep(TX.metalRough,2,1)});
barrelMat.envMapIntensity=.4;
var hazardMat=new THREE.MeshBasicMaterial({color:0xffcc00});
var BARREL_POS=[[-8.5,0.44,-24],[-3.5,0.44,-8],[-8.5,0.44,8],[-3.5,0.44,24],[-7.5,0.44,-36]];
var ringGeo=new THREE.CylinderGeometry(0.33,0.33,0.06,12);
var stumpGeo=new THREE.CylinderGeometry(0.34,0.38,0.22,10);
var stumpMat=new THREE.MeshStandardMaterial({color:0x111113,roughness:0.95});
var barrelRibGeo=new THREE.CylinderGeometry(0.335,0.335,0.03,12),barrelRibMat=plain(0x7a1a10,0.5,0.55,0.4);
function buildBarrels(){
  for(var bi=0;bi<BARREL_POS.length;bi++){
    var bp=BARREL_POS[bi];
    var bgGroup=new THREE.Group();bgGroup.position.set(bp[0],bp[1],bp[2]);
    var bMesh=new THREE.Mesh(barrelGeo,barrelMat);bMesh.castShadow=true;bgGroup.add(bMesh);
    var ring1=new THREE.Mesh(ringGeo,hazardMat);ring1.position.y=0.22;bgGroup.add(ring1);
    var ring2=new THREE.Mesh(ringGeo,hazardMat);ring2.position.y=-0.22;bgGroup.add(ring2);
    var rib1=new THREE.Mesh(barrelRibGeo,barrelRibMat);rib1.position.y=0.1;bgGroup.add(rib1);
    var rib2=new THREE.Mesh(barrelRibGeo,barrelRibMat);rib2.position.y=-0.1;bgGroup.add(rib2);
    world.add(bgGroup);
    collide(bp[0],bp[1],bp[2],0.65,0.9,0.65);
    barrels.push({obj:bgGroup,x:bp[0],y:bp[1],z:bp[2],hp:25,alive:true,col:COL[COL.length-1],stump:null});
  }
}
buildBarrels();
/* a fresh run gets its barrels back (and their colliders), and the old stumps go away */
function resetBarrels(){
  for(var bi=0;bi<barrels.length;bi++){
    var b=barrels[bi];
    if(b.stump){world.remove(b.stump);b.stump=null;}
    if(!b.alive){
      b.alive=true;b.hp=25;world.add(b.obj);
      if(COL.indexOf(b.col)<0)COL.push(b.col);
    }
  }
}

function damageBarrel(b,dmg){
  if(!b.alive)return;
  b.hp-=dmg;
  spark(b.x,b.y+0.3,b.z,6,1,0.4,0.1,3,2);
  if(b.hp<=0)explodeBarrel(b);
}
/* Shared explosion: barrels, grenades and charger drones all route through here so chain
   reactions work everywhere. Enemy damage ignores warden shields (it's a blast, not a shot). */
function blastDamage(x,z,radius,eDmg,pDmg,source){
  var roster=enemies.slice();   /* kills in here can cascade and reshape the live array */
  for(var ei=roster.length-1;ei>=0;ei--){
    var e=roster[ei];
    if(e===source||e.dead)continue;
    var dist=Math.hypot(e.x-x,e.z-z);
    if(dist>=radius)continue;
    var factor=1-dist/radius,dmg=Math.round(eDmg*(0.25+0.75*factor));
    e.hp-=dmg;e.flash=0.35;e.lastZone='blast';
    var angle=Math.atan2(e.x-x,e.z-z);
    e.knockVx=(e.knockVx||0)+Math.sin(angle)*7.0*factor;e.knockVz=(e.knockVz||0)+Math.cos(angle)*7.0*factor;
    spark(e.x,1.2,e.z,12,1,0.4,0.1,4,3);
    dmgNum(e.x,1.55*e.cfg.scale,e.z,dmg,'',e);
    if(e.hp<=0)killEnemy(e);
  }
  for(var bi=0;bi<barrels.length;bi++){
    var b=barrels[bi];
    if(b.alive&&Math.hypot(b.x-x,b.z-z)<radius*0.8)damageBarrel(b,60);
  }
  if(pDmg>0){
    var pR=radius*0.85,pDist=Math.hypot(P.x-x,P.z-z);
    if(pDist<pR)hurt(Math.round(pDmg*(1-pDist/pR)),x,z);
  }
}
function explodeBarrel(b){
  if(!b.alive)return;
  b.alive=false;
  sfxAt(b.x,b.z,sfxBarrelExplode);
  var pd=Math.hypot(P.x-b.x,P.z-b.z);
  P.shake=Math.max(P.shake,clamp(0.55-pd*0.03,0.12,0.55));
  spark(b.x,b.y+0.4,b.z,30,1,0.55,0.12,8,6);
  spark(b.x,b.y+0.6,b.z,16,1,0.8,0.2,5,4);
  smoke(b.x,b.y+0.5,b.z,8);
  if(typeof blastFx==='function')blastFx(b.x,b.y+0.5,b.z,1.0);
  else{muzzleLight.position.set(b.x,b.y+1,b.z);muzzleLight.intensity=6.0;}
  world.remove(b.obj);
  var ci=COL.indexOf(b.col);if(ci>=0)COL.splice(ci,1);
  b.stump=new THREE.Mesh(stumpGeo,stumpMat);
  b.stump.position.set(b.x,b.y-0.33,b.z);world.add(b.stump);
  blastDamage(b.x,b.z,6.5,180,35,null);
}

/* ============================ lighting ============================ */
/* Low, cool base light. The fixtures themselves are baked into the surfaces below, so the
   dynamic lights only have to carry specular response and the things that move. */
scene.add(new THREE.AmbientLight(0x151f24,0.28));
var hemi=new THREE.HemisphereLight(0x8ea2b0,0x161e22,0.38);scene.add(hemi);

/* Overhead key that follows the player and casts the only real-time shadows */
/* 0.58 was set while this light was reaching nothing: it sat above the ceiling slab, so every
   surface below was in its shadow and only ambient and the bake were lighting the room. Now that
   it actually lands, it is dialled back to sit alongside the baked light rather than double it. */
var sunKey=new THREE.DirectionalLight(0xdce8f2,0.30);
sunKey.position.set(-6,5.0,2);
sunKey.castShadow=true;
sunKey.shadow.mapSize.width=coarse?1024:2048;
sunKey.shadow.mapSize.height=coarse?1024:2048;
sunKey.shadow.camera.near=0.5;
sunKey.shadow.camera.far=16;
sunKey.shadow.camera.left=-12;
sunKey.shadow.camera.right=12;
sunKey.shadow.camera.top=12;
sunKey.shadow.camera.bottom=-12;
sunKey.shadow.bias=-0.0004;
sunKey.shadow.normalBias=0.038;
/* r128's LightShadow.updateMatrices never calls updateProjectionMatrix, and only the spot and
   point subclasses do it themselves, so every frustum value above was inert and the shadow camera
   stayed at DirectionalLightShadow's default 10x10 box with a 0.5-500 depth range. One call makes
   the numbers real; a range that tight is also what gives 2048 texels something to spend. */
sunKey.shadow.camera.updateProjectionMatrix();
scene.add(sunKey);

var poolCount=3,pool=[],POOL_INTENSITY=[2.3,1.7,1.3],POOL_COLORS=[0xe4eff7,0xdfecf5,0xe8f0f6],poolActive=coarse?2:3;
for(var p=0;p<poolCount;p++){
  var pl=new THREE.PointLight(POOL_COLORS[p],0,15,2);
  pl.castShadow=false;pl.userData.fixture=-1;pl.userData.base=0;scene.add(pl);pool.push(pl);
}
var carry=new THREE.PointLight(0x95c8d2,0.26,9.5,2);scene.add(carry);
var muzzleLight=new THREE.PointLight(0xffb84a,0,14,2);scene.add(muzzleLight);

var lightAnchorX=Infinity,lightAnchorZ=Infinity;
function updateLights(px,pz){
  // Fixture selection only changes as the player moves, never randomly per frame.
  if(Math.hypot(px-lightAnchorX,pz-lightAnchorZ)<1.5)return;
  lightAnchorX=px;lightAnchorZ=pz;
  /* under the ceiling slab (y 5.45-5.79), or it shadows the whole station with the roof */
  sunKey.position.set(px-1.5,5.0,pz+2.5);
  sunKey.target.position.set(px,0,pz-1);
  sunKey.target.updateMatrixWorld();
  var best=[];
  for(var i=0;i<FIXTURES.length;i++){
    var f=FIXTURES[i],d=(f[0]-px)*(f[0]-px)+(f[2]-pz)*(f[2]-pz);
    best.push([d,i]);
  }
  best.sort(function(a,b){return a[0]-b[0];});
  for(var k=0;k<pool.length;k++){
    if(k<best.length&&k<poolActive&&!FIXTURE_DEAD[best[k][1]]){
      var fi=best[k][1],f2=FIXTURES[fi];
      pool[k].position.set(f2[0],f2[1],f2[2]);
      pool[k].color.setHex(POOL_COLORS[k%POOL_COLORS.length]);
      pool[k].userData.fixture=fi;pool[k].userData.base=POOL_INTENSITY[k];
      pool[k].intensity=POOL_INTENSITY[k];
    }else{pool[k].intensity=0;pool[k].userData.fixture=-1;pool[k].userData.base=0;}
  }
}
/* a failing tube: one fixture dips and stutters; its pool light follows when it is nearby */
var flickerT=0,flickerLevel=1;
function updateStationFx(dt){
  /* the parked train sits on the far plane; only draw it while it is arriving or in */
  train.visible=typeof G!=='undefined'&&G.phase==='board';
  if(!flickerLamp)return;
  if(reduceMotion){flickerLevel=0.8;}
  else{
    flickerT-=dt;
    if(flickerT<=0){
      var r=Math.random();
      if(flickerLevel>0.9){flickerLevel=r<0.22?0.12+Math.random()*0.5:1;flickerT=flickerLevel<0.9?0.03+Math.random()*0.1:0.5+Math.random()*3;}
      else{flickerLevel=r<0.55?1:0.05+Math.random()*0.5;flickerT=0.03+Math.random()*0.14;}
    }
  }
  var L=flickerLevel;
  /* x3.4 to sit in the same range as M.lamp, or the failing tube is the one that never blooms */
  flickerLamp.material.color.setRGB((0.28+0.72*L)*3.4,(0.28+0.72*L)*3.4,(0.3+0.7*L)*3.4);
  flickerGlow.material.opacity=0.16*L;
  flickerCone.material.opacity=0.06*L;
  for(var k=0;k<pool.length;k++)if(pool[k].userData.fixture===FLICKER_INDEX)pool[k].intensity=pool[k].userData.base*(0.25+0.75*L);
}

/* ============================ baked station light ============================ */
/* Every fixture, emergency lamp and lit sign contributes falloff to the big static surfaces
   once at load, so the whole platform reads as lit by its own fittings at zero frame cost. */
(function bakeStation(){
  var MAIN=[],EMIT=[];
  for(var i=0;i<FIXTURES.length;i++){
    var f=FIXTURES[i];
    MAIN.push({x:f[0],y:5.0,z:f[2],r:0.88,g:0.95,b:1.0,power:25,down:true,samples:3,length:2.4});
    EMIT.push({x:3,y:5.05,z:f[2]+3.5,r:0.88,g:0.95,b:1.0,power:8,down:true,samples:2,length:1.4});
  }
  EMIT=EMIT.concat(MAIN);
  AMBER.forEach(function(z){EMIT.push({x:-10.62,y:3.75,z:z,r:1,g:0.64,b:0.22,power:6});});
  [-18,22].forEach(function(z){EMIT.push({x:-9.4,y:1.3,z:z,r:0.3,g:0.88,b:0.95,power:0.5});});
  [10,-32].forEach(function(z){EMIT.push({x:-9.6,y:1.45,z:z,r:0.3,g:0.85,b:0.95,power:0.3});});
  EMIT.push({x:-10.1,y:1.9,z:-14,r:0.2,g:0.9,b:1,power:0.25});
  EMIT.push({x:-10.1,y:1.9,z:14,r:1,g:0.2,b:0.6,power:0.25});
  EMIT.push({x:-8,y:3.4,z:35.6,r:0.34,g:0.72,b:0.57,power:0.5});
  [-14,16].forEach(function(z){EMIT.push({x:-6,y:4.14,z:z,r:1,g:0.85,b:0.6,power:0.2});});
  var props=[];
  for(var c=0;c<COL.length;c++){
    var b=COL[c];if(b.ghost)continue;
    var hgt=b.max[1]-b.min[1];
    props.push({min:b.min,max:b.max,reach:clamp(0.3+0.2*hgt,0.4,1.25),strength:hgt>2?0.72:0.55});
  }
  var floorOcc={min:[-30,-2,-60],max:[30,0,60],reach:1.0,strength:0.7};
  var trackOcc={min:[-30,-3,-60],max:[30,-1.1,60],reach:1.2,strength:0.7};
  var ceilOcc={min:[-30,5.45,-60],max:[30,9,60],reach:0.6,strength:0.5};
  var lipOcc={min:[-1.2,-1.2,-42],max:[-0.9,0,42],reach:1.3,strength:0.8};
  var wallL={min:[-11.6,-1,-42],max:[-11.0,6.3,42],reach:0.9,strength:0.6};
  var wallR={min:[6.9,-2,-42],max:[7.5,7,42],reach:0.9,strength:0.6};
  var floorBake=bakeSurface(96,768,function(u,v){return [-11+10*u,0,42-84*v];},0,1,0,EMIT,props,{gain:1});
  applyBake(M.floor,floorBake,1.35,1.0);
  var gravelBake=bakeSurface(64,512,function(u,v){return [-0.95+7.7*u,-1.1,42-84*v];},0,1,0,EMIT,[lipOcc,wallR],{gain:1});
  applyBake(M.gravel,gravelBake,1.0,1.0);
  /* only things standing in front of the platform wall can shade it (not the wall's own collider) */
  var wallProps=props.filter(function(b){return b.max[0]>-10.99&&b.min[0]<-8.5;});
  var wallBake=bakeSurface(768,96,function(u,v){return [-11.0,6.2*v,42-84*u];},1,0,0,EMIT,wallProps.concat([floorOcc,ceilOcc]),{gain:1});
  applyBake(M.tile,wallBake,0.85,1.0);
  var farBake=bakeSurface(768,96,function(u,v){return [6.9,-0.5+7.4*v,-42+84*u];},-1,0,0,EMIT,[trackOcc,ceilOcc],{gain:1});
  applyBake(M.tileFar,farBake,1.0,1.0);
  var ceilBake=bakeSurface(128,768,function(u,v){return [-11.5+19*u,5.45,-42+84*v];},0,-1,0,MAIN.concat(EMIT.slice(0,FIXTURES.length)),CEIL_OCC.concat([wallL,wallR]),{gain:0.9});
  applyBake(M.panel,ceilBake,1.0,1.0);
  var wainBake=bakeSurface(768,32,function(u,v){return [-10.84,1.24*v,42-84*u];},1,0,0,EMIT,wallProps.concat([floorOcc]),{gain:1});
  applyBake(M.wainscot,wainBake,1.0,1.0);
  /* pillars and end walls share one vertical profile each: fixture above, floor and ceiling creases */
  var colBake=bakeSurface(8,64,function(u,v){return [-5.08,5.5*v,0];},-1,0,0,
    [{x:-6,y:5.0,z:-3.5,r:0.88,g:0.95,b:1.0,power:21,down:true},{x:-6,y:5.0,z:3.5,r:0.88,g:0.95,b:1.0,power:21,down:true}],
    [floorOcc,{min:[-30,5.5,-60],max:[30,9,60],reach:0.5,strength:0.5}],{gain:1});
  applyBake(M.tileCol,colBake,1.0,1.0);
  var endBake=bakeSurface(8,64,function(u,v){return [-6,6.2*v,-41.7];},0,0,1,
    [{x:-6,y:5.0,z:-37,r:0.88,g:0.95,b:1.0,power:21,down:true,samples:3,length:2.4}],[floorOcc,ceilOcc],{gain:1});
  applyBake(M.tileEnd,endBake,1.0,1.0);
})();

/* Mechanical Dismemberment / Gibs Physics Pool */
var GIBS_MAX=24;
var gibsPool=[];
var gibGeos=[
  new THREE.BoxGeometry(0.22,0.18,0.20),
  new THREE.BoxGeometry(0.36,0.26,0.14),
  new THREE.BoxGeometry(0.14,0.36,0.14),
  new THREE.BoxGeometry(0.12,0.12,0.22)
];
var gibMat=new THREE.MeshStandardMaterial({color:0x3a4642,roughness:0.6,metalness:0.65,map:TX.enemyShell,roughnessMap:TX.enemyRough});
var gibArmorMat=new THREE.MeshStandardMaterial({color:0xbf4220,roughness:0.7,metalness:0.3,map:TX.enemyShell});
for(var gi=0;gi<GIBS_MAX;gi++){
  var gm=new THREE.Mesh(gibGeos[gi%4],(gi%2===0)?gibMat:gibArmorMat);
  gm.visible=false;world.add(gm);
  gibsPool.push({mesh:gm,life:0,vx:0,vy:0,vz:0,rx:0,ry:0,rz:0});
}
var gibHead=0;
function spawnGibs(x,y,z,count){
  for(var i=0;i<count;i++){
    var gib=gibsPool[gibHead];
    gibHead=(gibHead+1)%GIBS_MAX;
    gib.mesh.position.set(x+(Math.random()-0.5)*0.3,y+(Math.random()-0.5)*0.4,z+(Math.random()-0.5)*0.3);
    gib.mesh.rotation.set(Math.random()*TAU,Math.random()*TAU,Math.random()*TAU);
    gib.mesh.visible=true;
    gib.life=3.5;
    var spd=2.5+Math.random()*4.5;
    var angle=Math.random()*TAU;
    gib.vx=Math.cos(angle)*spd;gib.vy=2.5+Math.random()*4.0;gib.vz=Math.sin(angle)*spd;
    gib.rx=(Math.random()-0.5)*15;gib.ry=(Math.random()-0.5)*15;gib.rz=(Math.random()-0.5)*15;
  }
}
function updateGibs(dt){
  for(var i=0;i<GIBS_MAX;i++){
    var g=gibsPool[i];
    if(g.life>0){
      g.life-=dt;g.vy-=16*dt;
      g.mesh.position.x+=g.vx*dt;g.mesh.position.y+=g.vy*dt;g.mesh.position.z+=g.vz*dt;
      g.mesh.rotation.x+=g.rx*dt;g.mesh.rotation.y+=g.ry*dt;
      if(g.mesh.position.y<0.08){
        g.mesh.position.y=0.08;
        if(Math.abs(g.vy)>1.2)sfxGibClatter();
        g.vy*=-0.32;g.vx*=0.65;g.vz*=0.65;g.rx*=0.6;
      }
      if(g.life<=0)g.mesh.visible=false;
    }
  }
}

/* ============================ maths and collision ============================ */
function rayBox(ox,oy,oz,dx,dy,dz,b){
  var lo=0,hi=1e4,o=[ox,oy,oz],d=[dx,dy,dz],i,a,c,t;
  for(i=0;i<3;i++){
    if(Math.abs(d[i])<1e-7){if(o[i]<b.min[i]||o[i]>b.max[i])return Infinity;}
    else{a=(b.min[i]-o[i])/d[i];c=(b.max[i]-o[i])/d[i];if(a>c){t=a;a=c;c=t;}
      if(a>lo)lo=a;if(c<hi)hi=c;if(hi<lo)return Infinity;}
  }
  return lo;
}
function rayWorld(ox,oy,oz,dx,dy,dz){
  var best=200;
  for(var i=0;i<COL.length;i++){
    if(COL[i].ghost)continue;
    var t=rayBox(ox,oy,oz,dx,dy,dz,COL[i]);
    if(t<best)best=t;
  }
  return best;
}
/* nearest unbroken tube along a shot, or -1. Tubes are not in COL - add() only collides when it
   is told to - so they are tested on their own rather than through rayWorld. */
var _lampHit={t:Infinity,i:-1};
function rayLamp(ox,oy,oz,dx,dy,dz){
  _lampHit.t=Infinity;_lampHit.i=-1;
  for(var i=0;i<LAMPS.length;i++){
    if(LAMPS[i].broken)continue;
    var t=rayBox(ox,oy,oz,dx,dy,dz,LAMPS[i]);
    if(t<_lampHit.t){_lampHit.t=t;_lampHit.i=i;}
  }
  return _lampHit;
}
/* put one out: the diffuser goes dark, its glow and beam stop, the pool light that was sitting on
   it is released, and the volumetric march stops asking it for light. The bake cannot be undone,
   so the room keeps the light this tube contributed at load - what goes away is everything the
   fixture was still doing live. */
function breakLamp(i){
  var L=LAMPS[i];
  if(!L||L.broken)return false;
  L.broken=true;
  L.mesh.material=M.lampDead;
  if(L.glow)L.glow.visible=false;
  if(L.cone)L.cone.visible=false;
  if(L.fixture>=0){
    FIXTURE_DEAD[L.fixture]=true;
    for(var k=0;k<pool.length;k++)if(pool[k].userData.fixture===L.fixture){pool[k].intensity=0;pool[k].userData.fixture=-1;}
    lightAnchorX=Infinity;                      /* force updateLights to pick a live fixture */
  }
  if(L.mesh===flickerLamp)flickerLamp=null;     /* stop the failing-tube animation driving it */
  /* glass down, and a short arc where the ballast lets go */
  if(typeof elecSpark==='function'){elecSpark(L.x,L.y-0.1,L.z);elecSpark(L.x,L.y-0.25,L.z);}
  if(typeof parts!=='undefined'&&typeof pHead!=='undefined'){
    for(var g=0;g<10;g++){
      var p=parts[pHead];pHead=(pHead+1)%PMAX;
      p.life=0.5+Math.random()*0.5;
      p.x=L.x+(Math.random()-0.5)*0.5;p.y=L.y-0.08;p.z=L.z+(Math.random()-0.5)*2.2;
      p.vx=(Math.random()-0.5)*1.6;p.vy=-0.6-Math.random()*1.2;p.vz=(Math.random()-0.5)*1.6;
      p.r=0.80;p.g=0.88;p.b=0.95;
    }
  }
  if(typeof sfxAt==='function'&&typeof sfxLampBreak==='function')sfxAt(L.x,L.z,sfxLampBreak);
  return true;
}
function raySphere(ox,oy,oz,dx,dy,dz,cx,cy,cz,r){
  var ex=ox-cx,ey=oy-cy,ez=oz-cz;
  var b=ex*dx+ey*dy+ez*dz, c=ex*ex+ey*ey+ez*ez-r*r, disc=b*b-c;
  if(disc<0)return Infinity;
  var t=-b-Math.sqrt(disc);
  return t>=0?t:Infinity;
}
function blockedAt(x,z,r){
  if(x<-10.62+r||x>-1.32-r||z<Z0+1.2+r||z>Z1-1.2-r)return true;
  for(var i=0;i<COL.length;i++){
    var b=COL[i];
    if(b.min[1]>1.5||b.max[1]<0.25)continue;
    if(x>b.min[0]-r&&x<b.max[0]+r&&z>b.min[2]-r&&z<b.max[2]+r)return true;
  }
  return false;
}
function slide(pos,dx,dz,r){
  var ox=pos.x, oz=pos.z;
  if(!blockedAt(pos.x+dx,pos.z,r))pos.x+=dx;
  if(!blockedAt(pos.x,pos.z+dz,r))pos.z+=dz;
  if(pos.x!==ox && pos.z!==oz && blockedAt(pos.x,pos.z,r)){
    pos.x=ox; pos.z=oz;
  }
}
function sees(ax,ay,az,bx,by,bz){
  var dx=bx-ax,dy=by-ay,dz=bz-az,len=Math.hypot(dx,dz);
  if(len<0.5) return true;
  var len3=Math.sqrt(dx*dx+dy*dy+dz*dz);
  return rayWorld(ax,ay,az,dx/len3,dy/len3,dz/len3)>len-0.45;
}
