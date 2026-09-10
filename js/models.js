/* Subway FPS — models.js
   Swaps procedural view models for the GLB models in /models: the AK-47 takes the rifle slot,
   the pump shotgun the shotgun slot, the Quaternius assault rifle the third slot and the pistol
   the sidearm slot. Each model is loaded with THREE.GLTFLoader, re-oriented and scaled into weapon
   space (bore along -Z, +Y up), baked into weapon coordinates, given the game's finishes instead
   of its flat GLB colours, has the iron sights that would sit in a red dot's picture flattened,
   has moving parts carved out of the mesh (the magazine the reload drops, the shotgun's fore-end
   the pump rides), gets any optic and the muzzle socket re-seated, and has its hands rebuilt with
   contact volumes that match the new shape. If a model fails to load the procedural weapon simply
   stays. Tests await MODELS_READY before they start.
   All game scripts share one global scope and load in the order listed in index.html. */
'use strict';

var weaponWood=paint(512,256,function(g,w,h){
  g.fillStyle='#67402b';g.fillRect(0,0,w,h);
  for(var i=0;i<340;i++){
    var y=i*h/340;
    g.strokeStyle=i%5===0?'rgba(28,12,7,.32)':'rgba(196,133,72,.16)';g.lineWidth=i%5===0?1.2:.65;
    g.beginPath();
    for(var x=0;x<=w;x+=4){var gy=y+Math.sin(x*.016+i*.7)*1.8+Math.sin(x*.043+i)*.55;if(x===0)g.moveTo(x,gy);else g.lineTo(x,gy);}
    g.stroke();
  }
});
var woodMat=new THREE.MeshStandardMaterial({color:0xffffff,map:weaponWood,roughness:0.48,metalness:0.02,bumpMap:weaponWood,bumpScale:0.00018});
woodMat.envMapIntensity=.22;woodMat.userData.envSet=true;

/* Everything below is in weapon space after the wrapper transform (scale, rotY, pos).
   flatten: vertices inside the z range and above yAbove are pressed down to yAbove.
   carve: triangles matching a test (material names, centre below y, centre inside a z range)
   become a separate part pivoted at `pivot`: 'mag' is the detachable magazine the reload drops
   and re-seats, 'pump' the shotgun's fore-end that the pump animation slides (the game drives it
   to z -0.44 at rest, so its pivot sits there).
   magBuild: a procedural magazine added inside a grip the model does not model one for. */
var MODEL_CFG={
  0:{file:'models/ak47.glb',scale:0.205,rotY:0,pos:[0,-0.013,-0.32],adsZ:-0.20,
     mats:{Black_AssaultRIfle_01:'body',Brown_AssaultRIfle_01:'wood',Gray_AssaultRIfle_01:'steel'},
     flatten:[{z:[-0.36,-0.26],yAbove:0.052},{z:[-0.74,-0.66],yAbove:0.045}],
     carve:[{key:'mag',yBelow:-0.045,z:[-0.35,-0.175],pivot:[0,-0.045,-0.23]}],
     optic:{y:0.068,z:-0.22},muzzle:[0,-0.004,-0.725],adsY:-0.068,
     spec:{
       /* the AK grip is a 50 mm deep wedge (front raked more than the back); the stock is a
          slab whose underside runs from just behind the grip down to the toe of the butt, so the
          thumb has room to pass over the backstrap under it */
       grip:{c:[0,-0.095,-0.063],half:[0.013,0.050,0.025],tilt:-0.20,hand:-0.010,yaw:-0.30,droop:-0.18},
       /* indexed alongside the receiver just ahead of the guard — within a finger's reach of the
          knuckle, or the finger straightens out into a point */
       trigger:{rest:[0.031,-0.050,-0.150],pull:[0.009,-0.058,-0.148]},
       thumb:{target:[-0.019,-0.062,-0.036],shape:[0.35,1,0.6],kMax:1.4},
       fireVols:[{box:[0,-0.095,-0.063,0.013,0.050,0.025,-0.20]},{box:[0,0.0075,-0.170,0.019,0.0425,0.150]},{box:[0,-0.075,-0.150,0.006,0.002,0.030]},{box:[0,-0.060,-0.150,0.002,0.012,0.003]},
         {box:[0,-0.069,0.097,0.020,0.022,0.116,0.316]},{box:[0,-0.140,-0.270,0.014,0.100,0.045,0.40]}],
       /* the handguard is a tall wide block: the palm goes flat under it, the fingers close up
          its far side and the thumb lies forward along its lower left edge (aimed up the face it
          would stand in the sight picture) */
       support:{kind:'cyl',axis:[0,0.007,-0.40],r:0.041,angle:4.30,lean:0.35,knuckle:0.028,spread:0.015,
         thumb:{target:[-0.040,-0.022,-0.520],shape:[0.2,0.5,0.4],kMax:0.9},
         vols:[{box:[0,0.007,-0.410,0.028,0.040,0.078]},{cyl:[0,-0.004,-0.600,0.009,0.120,'z']},{box:[0,0.020,-0.695,0.008,0.030,0.015]},{box:[0,0.010,-0.170,0.019,0.040,0.150]},{box:[0,-0.140,-0.270,0.014,0.100,0.045,0.40]}],
         inspect:{pos:[-0.025,-0.055,0.06],rot:[-0.30,0.10,0.45]}},
       reload:{grab:[-0.030,-0.200,-0.270],grabRot:[0.15,-0.35,1.25],pouch:[-0.06,-0.40,-0.15],bolt:[0.020,0.060,-0.170],boltRot:[0.2,-0.4,1.4]}
     }},
  /* ADS: the butt (273 mm behind the origin) must end up behind the eye, or it fills the bottom of
     the frame; adsY puts the eye on the barrel rib, which is the sight line on this bead gun */
  /* ADS distance is set by the FIRING hand, not the sight: this stock puts that hand a hand's
     breadth from the eye, and nothing that close can be hidden by zoom or by the weapon in front
     of it, so the gun is held out far enough that the hand clears the frame's bottom edge. */
  1:{file:'models/shotgun.glb',scale:0.185,rotY:Math.PI/2,pos:[0,-0.006,0],adsZ:-0.30,
     mats:{Wood:'wood',Metal:'body',DarkMetal:'steel',Black:'dark'},
     carve:[{key:'pump',mats:['Wood'],z:[-0.52,-0.28],pivot:[0,0,-0.44]}],
     /* A standing rear leaf and a front bead of the SAME height, so the line through them runs
        parallel to the bore and therefore straight down the middle of the screen: shots resolve
        from the camera, so a sloping sight line would put the bead below the point of impact.
        adsY is exactly that height, which also lifts the eye clear of the firing hand. */
     sights:{y:0.078,rear:{z:-0.105},bead:{z:-0.780}},
     muzzle:[0,0.030,-0.797],adsY:-0.078,
     spec:{
       /* a classic stock: the firing hand wraps the wrist of the stock behind the trigger guard
          (fingers under it, thumb over the comb), so the "grip" box lies almost along the bore */
       grip:{c:[0,-0.016,0.022],half:[0.015,0.036,0.020],tilt:-0.95,hand:0.000,yaw:-0.20,droop:-0.10},
       /* the hand is on the stock's wrist, so the finger indexes on the receiver behind the guard */
       trigger:{rest:[0.027,-0.036,-0.072],pull:[0.010,-0.050,-0.082]},
       thumb:{target:[-0.014,0.040,0.028],shape:[0.35,1,0.6],kMax:1.4},   /* over the top of the wrist, onto the comb */
       exit:{l:[-0.38,-0.85,0.35],r:[0.30,-0.95,0.0]},
       fireVols:[{box:[0,-0.016,0.022,0.015,0.036,0.020,-0.95]},{box:[0,0.011,-0.127,0.021,0.041,0.080]},{box:[0,-0.047,-0.087,0.006,0.013,0.020]},{box:[0,-0.052,-0.087,0.002,0.008,0.003]},
         {box:[0,-0.054,0.050,0.014,0.010,0.020]},{box:[0,0.026,0.060,0.014,0.008,0.030]},{box:[0,-0.030,0.170,0.016,0.045,0.100,0.30]}],
       /* support hand under the wooden fore-end, in pump space (pivot z -0.44): the barrel and
          magazine tube run through it, the receiver sits behind it */
       support:{kind:'cyl',parent:'pump',axis:[0,-0.015,0.046],r:0.025,angle:4.60,lean:0.35,knuckle:0.020,spread:0.015,
         thumb:{target:[-0.032,-0.012,-0.020],shape:[0.2,0.5,0.4],kMax:0.9},
         vols:[{box:[0,-0.015,0.046,0.022,0.025,0.074]},{cyl:[0,0.025,0.04,0.013,0.40,'z']},{cyl:[0,-0.010,-0.195,0.010,0.165,'z']},{box:[0,0.011,0.313,0.021,0.041,0.080]},{box:[0,0.010,0.208,0.023,0.040,0.006]},{box:[0,0.055,-0.272,0.005,0.010,0.006]}],
         inspect:{pos:[-0.025,-0.055,0.06],rot:[-0.30,0.10,0.45]}},
       reload:{feed:[-0.012,-0.072,0.310],feedRot:[0.55,0.35,-0.45]}
     }},
  2:{file:'models/assault-rifle.glb',scale:0.162,rotY:Math.PI/2,pos:[0,-0.080,0],adsZ:-0.23,
     mats:{Main:'body',MainDark:'dark',MainLight:'steel'},
     flatten:[{z:[-0.07,0.02],yAbove:0.053},{z:[-0.44,-0.37],yAbove:0.060}],
     carve:[{key:'mag',yBelow:-0.020,z:[-0.21,-0.10],pivot:[0,-0.020,-0.15]}],
     optic:{y:0.068,z:-0.14},muzzle:[0,0.024,-0.585],adsY:-0.068,
     spec:{
       /* the stock is a tall block above y -17 with a wedge-shaped butt under its rear half:
          nothing sits behind the grip below the receiver, which is where the thumb goes */
       grip:{c:[0,-0.067,-0.008],half:[0.015,0.050,0.024],tilt:-0.35,hand:-0.010,yaw:-0.30,droop:-0.18},
       trigger:{rest:[0.026,-0.030,-0.105],pull:[0.009,-0.040,-0.072]},
       thumb:{target:[-0.020,-0.045,0.020],shape:[0.35,1,0.6],kMax:1.4},
       fireVols:[{box:[0,-0.067,-0.008,0.015,0.050,0.024,-0.35]},{box:[0,0.018,-0.095,0.019,0.035,0.105]},{box:[0,-0.050,-0.074,0.006,0.002,0.022]},{box:[0,-0.035,-0.074,0.002,0.012,0.003]},
         {box:[0,0.015,0.150,0.017,0.032,0.100]},{box:[0,-0.039,0.207,0.016,0.020,0.057,0.66]},{box:[0,-0.100,-0.150,0.016,0.090,0.030,0.12]}],
       /* held well forward on the handguard: at ADS this rifle's sight sits 11 cm from the eye,
          so a hand any nearer would loom */
       support:{kind:'cyl',axis:[0,0.027,-0.315],r:0.031,angle:4.20,lean:0.40,knuckle:0.026,spread:0.015,
         thumb:{target:[-0.036,0.004,-0.375],shape:[0.2,0.5,0.4],kMax:1.1},
         vols:[{box:[0,0.027,-0.288,0.028,0.031,0.084]},{cyl:[0,0.024,-0.480,0.008,0.110,'z']},{box:[0,0.060,-0.405,0.006,0.035,0.025]},{box:[0,0.020,-0.095,0.019,0.033,0.105]},{box:[0,-0.100,-0.150,0.016,0.090,0.030,0.12]}],
         inspect:{pos:[-0.02,-0.05,0.05],rot:[-0.25,0.15,0.40]}},
       reload:{grab:[-0.030,-0.160,-0.150],grabRot:[0.10,-0.30,1.20],pouch:[-0.06,-0.36,-0.12],bolt:[0.020,0.060,-0.050],boltRot:[0.2,-0.4,1.4]}
     }},
  4:{file:'models/pistol.glb',scale:0.118,rotY:Math.PI/2,pos:[0,-0.0194,0],adsZ:-0.40,   /* full size: the model is a compact, and real-sized hands dwarfed it */
     mats:{Metal:'body',Black:'dark',LightMetal:'steel'},
     magBuild:{pos:[0,-0.055,0.000],size:[0.024,0.074,0.034],plate:[0.028,0.007,0.040]},
     muzzle:[0,0.046,-0.172],adsY:-0.066,
     spec:HD_SPECS.pistol          /* the stand-in in weapons.js was built to the model's dimensions */
    }
};
var MODEL_MATS={body:bodyMat,dark:darkMat,steel:steelMat,wood:woodMat};

// Uniform physical texture scale, including the unwrapped shotgun and pistol assets.
// Project each face in weapon space so grain follows the stock and pump along the bore.
function mdlSurfaceUV(g){
  var p=g.attributes.position,n=g.attributes.normal,uv=new Float32Array(p.count*2);
  for(var t=0;t<p.count;t+=3){
    var nx=Math.abs(n.getX(t)),ny=Math.abs(n.getY(t)),nz=Math.abs(n.getZ(t));
    for(var k=0;k<3;k++){
      var i=t+k,x=p.getX(i),y=p.getY(i),z=p.getZ(i);
      uv[i*2]=(nz>nx&&nz>ny?x:-z)*3;
      uv[i*2+1]=(ny>nx&&ny>nz?x:y)*6;
    }
  }
  g.setAttribute('uv',new THREE.BufferAttribute(uv,2));
}

function mdlHardware(w,idx){
  var parts=new THREE.Group();parts.userData.model=true;w.add(parts);
  function plate(x,y,z,sx,sy,sz,mat){return gMesh(x,y,z,sx,sy,sz,mat,parts);}
  function pin(x,y,z){
    var m=new THREE.Mesh(cg(.0025,.0025,.0014,10),steelMat);m.rotation.z=Math.PI/2;m.position.set(x,y,z);parts.add(m);
    plate(x*1.025,y,z,.001,.00065,.003,darkMat);
  }
  if(idx===0){
    [-1,1].forEach(function(s){[-.11,-.19,-.275].forEach(function(z){pin(s*.0205,.007,z);});});
    plate(.021,.010,-.192,.0015,.012,.043,darkMat);
    plate(.023,.012,-.160,.004,.005,.016,steelMat);
  }else if(idx===2){
    [-1,1].forEach(function(s){[-.07,-.175].forEach(function(z){pin(s*.0205,.008,z);});});
    plate(.0205,.023,-.09,.0015,.016,.054,darkMat);
    plate(.022,.014,-.09,.0015,.002,.054,steelMat);
    for(var i=0;i<7;i++)plate(0,.060,-.225-i*.019,.043,.004,.006,darkMat);
  }else if(idx===1){
    pin(.022,.007,-.1);pin(-.022,.007,-.1);
    plate(.022,.027,-.13,.0015,.013,.065,darkMat);
  }else if(idx===4){
    [-1,1].forEach(function(s){
      for(var i=0;i<7;i++)plate(s*.0158,.044,.016-i*.005,.0013,.027,.0018,darkMat);
    });
    plate(.0158,.048,-.074,.0014,.012,.031,darkMat);
    plate(0,.0665,-.146,.003,.002,.003,steelMat);
  }
  // Only fixed hardware is merged; moving magazines and the pump keep their own transforms.
  hdMergeGroup(parts);
}

/* copy the listed triangles of a non-indexed geometry into a new one, optionally shifting the
   positions so `pivot` becomes the origin */
function mdlSubGeometry(g,tris,pivot){
  var p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv,count=tris.length*3;
  var pos=new Float32Array(count*3),nor=new Float32Array(count*3),tex=uv?new Float32Array(count*2):null,k=0;
  tris.forEach(function(t){
    for(var i=0;i<3;i++){var v=t+i;
      pos[k*3]=p.getX(v)-(pivot?pivot[0]:0);pos[k*3+1]=p.getY(v)-(pivot?pivot[1]:0);pos[k*3+2]=p.getZ(v)-(pivot?pivot[2]:0);
      nor[k*3]=n.getX(v);nor[k*3+1]=n.getY(v);nor[k*3+2]=n.getZ(v);
      if(tex){tex[k*2]=uv.getX(v);tex[k*2+1]=uv.getY(v);}
      k++;}
  });
  var out=new THREE.BufferGeometry();
  out.setAttribute('position',new THREE.BufferAttribute(pos,3));out.setAttribute('normal',new THREE.BufferAttribute(nor,3));
  if(tex)out.setAttribute('uv',new THREE.BufferAttribute(tex,2));
  out.computeBoundingSphere();return out;
}
/* which carve (if any) claims a triangle with this centre and material */
function mdlCarveIndex(carves,matName,cy,cz){
  for(var i=0;i<carves.length;i++){
    var c=carves[i];
    if(c.mats&&c.mats.indexOf(matName)<0)continue;
    if(c.yBelow!==undefined&&cy>=c.yBelow)continue;
    if(c.z&&(cz<c.z[0]||cz>c.z[1]))continue;
    return i;
  }
  return -1;
}
function mdlMagHome(mag){mag.userData.homePosition=mag.position.clone();mag.userData.homeRotation=mag.rotation.clone();mag.userData.initialY=mag.position.y;}
function mdlSwap(idx,cfg,gltf){
  var w=wpnMeshes[idx],key=WEAPONS[idx].id,carves=cfg.carve||[];
  /* bake the model into weapon space */
  var wrap=new THREE.Group();wrap.rotation.y=cfg.rotY;wrap.scale.setScalar(cfg.scale);wrap.position.fromArray(cfg.pos);wrap.add(gltf.scene);
  w.add(wrap);w.updateWorldMatrix(true,true);
  var toWeapon=new THREE.Matrix4().copy(w.matrixWorld).invert();
  var meshes=[];gltf.scene.traverse(function(o){if(o.isMesh)meshes.push(o);});
  var groups=carves.map(function(c){var g=new THREE.Group();g.position.fromArray(c.pivot);return g;});
  var parts=[];
  meshes.forEach(function(m){
    var g=m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone();
    g.applyMatrix4(new THREE.Matrix4().copy(toWeapon).multiply(m.matrixWorld));
    var p=g.attributes.position,i,t;
    (cfg.flatten||[]).forEach(function(f){for(i=0;i<p.count;i++){var z=p.getZ(i);if(z>=f.z[0]&&z<=f.z[1]&&p.getY(i)>f.yAbove)p.setY(i,f.yAbove);}});
    mdlSurfaceUV(g);
    var bodyTris=[],carveTris=carves.map(function(){return [];});
    for(t=0;t<p.count;t+=3){
      var cy=(p.getY(t)+p.getY(t+1)+p.getY(t+2))/3,cz=(p.getZ(t)+p.getZ(t+1)+p.getZ(t+2))/3;
      var ci=mdlCarveIndex(carves,m.material.name,cy,cz);
      (ci<0?bodyTris:carveTris[ci]).push(t);
    }
    var mat=MODEL_MATS[cfg.mats[m.material.name]]||bodyMat;
    if(bodyTris.length){var bg=mdlSubGeometry(g,bodyTris,null);var body=new THREE.Mesh(bg,mat);body.userData.keep=true;body.userData.model=true;parts.push(body);}
    carveTris.forEach(function(tris,ci){
      if(!tris.length)return;
      var cg2=mdlSubGeometry(g,tris,carves[ci].pivot);
      var partMat=carves[ci].key==='mag'?(idx===0?bodyMat:magMat):mat;
      var cm=new THREE.Mesh(cg2,partMat);cm.userData.keep=true;groups[ci].add(cm);
    });
    g.dispose();
  });
  w.remove(wrap);
  /* drop the procedural weapon (its static batches, magazine, pump, trigger, bolt, extras); keep
     the arms (rebuilt below), the sight, its dot and the muzzle socket */
  var keep=[w.userData.rArm,w.userData.lArm,w.userData.optic,w.userData.opticReticle,w.userData.muzzle];
  w.children.slice().forEach(function(c){if(keep.indexOf(c)<0)w.remove(c);});
  parts.forEach(function(b){w.add(b);});
  mdlHardware(w,idx);
  w.userData.mag=null;w.userData.pump=null;w.userData.triggerMesh=null;
  carves.forEach(function(c,ci){
    var grp=groups[ci];if(!grp.children.length)return;
    w.add(grp);
    if(c.key==='mag'){w.userData.mag=grp;mdlMagHome(grp);}
    else if(c.key==='pump'){w.userData.pump=grp;}
  });
  if(cfg.magBuild){
    var mb=cfg.magBuild,mag=new THREE.Group();mag.position.fromArray(mb.pos);w.add(mag);
    var magBody=gMesh(0,0,0,mb.size[0],mb.size[1],mb.size[2],magMat,mag);magBody.userData.keep=true;
    var plate=gMesh(0,-mb.size[1]/2-mb.plate[1]/2,0.002,mb.plate[0],mb.plate[1],mb.plate[2],darkMat,mag);plate.userData.keep=true;
    w.userData.mag=mag;mdlMagHome(mag);
  }
  /* sight, dot, muzzle */
  if(cfg.optic){
    if(w.userData.optic)w.userData.optic.position.set(0,cfg.optic.y,cfg.optic.z);
    if(w.userData.opticReticle)w.userData.opticReticle.position.set(0,cfg.optic.y,cfg.optic.z-0.004);
    w.userData.opticY=cfg.optic.y;w.userData.opticZ=cfg.optic.z;
  }
  if(cfg.sights){
    /* A standing leaf with a notch, and a bead on a post at the muzzle. The line through them is
       already down the middle of the screen, but in bare steel none of it reads: the bead is four
       pixels of dark grey on a dark platform, so the gun aims like it has no sights at all. It
       carries tritium instead, the way a real ghost ring does — one lamp in the bead, one either
       side of the notch. The three sit level when the gun is lined up, and the bead lamp is the
       brightest of them because it is the one standing on the point of impact. The bead is sized
       to read about as large as the rifle's dot at ADS without covering what it points at; the
       rear pair sit outboard of the notch so they frame the aperture instead of filling it. */
    var s=cfg.sights,sy=s.y;
    gMesh(0,sy-0.012,s.rear.z,0.012,0.014,0.0035,steelMat,w);                  /* leaf base */
    gMesh(-0.0075,sy+0.002,s.rear.z,0.0035,0.009,0.0030,darkMat,w);            /* notch, left wing */
    gMesh( 0.0075,sy+0.002,s.rear.z,0.0035,0.009,0.0030,darkMat,w);            /* notch, right wing */
    gMesh(0,sy-0.004,s.rear.z,0.0075,0.003,0.0030,darkMat,w);                  /* notch floor */
    sMesh(-0.0080,sy,s.rear.z+0.0018,0.0015,greenGlowMat,w,8);                 /* rear lamp, left */
    sMesh( 0.0080,sy,s.rear.z+0.0018,0.0015,greenGlowMat,w,8);                 /* rear lamp, right */
    gMesh(0,sy-0.014,s.bead.z,0.0028,0.016,0.0030,steelMat,w);                 /* bead post */
    sMesh(0,sy,s.bead.z,0.0045,greenGlowMat,w,10);                             /* tritium bead */
  }
  if(w.userData.muzzle)w.userData.muzzle.position.fromArray(cfg.muzzle);
  if(typeof MUZZLE_SOCKET_LOCAL!=='undefined'&&MUZZLE_SOCKET_LOCAL[idx])MUZZLE_SOCKET_LOCAL[idx].fromArray(cfg.muzzle);
  WEAPONS[idx].adsY=cfg.adsY;if(cfg.adsZ!==undefined)WEAPONS[idx].adsZ=cfg.adsZ;
  /* hands: new contact volumes, fitted again */
  ['rArm','lArm'].forEach(function(k){var a=w.userData[k];if(a&&a.parent)a.parent.remove(a);});
  HD_SPECS[key]=cfg.spec;
  hdBuildHands(w,key);
  w.userData.lPose=null;
  if(idx===1){shotgunPump=w.userData.pump;shotgunLeftHand=w.userData.lArm;}   /* the pump animation and reload drive these globals */
  if(gun===w)animateHandling(0);
  w.userData.model=cfg.file;
}
var MODELS_READY=Promise.all(Object.keys(MODEL_CFG).map(function(k){
  var idx=+k,cfg=MODEL_CFG[k];
  if(typeof THREE.GLTFLoader!=='function'){console.warn('models: GLTFLoader missing, keeping the procedural weapon',idx);return Promise.resolve(false);}
  return new Promise(function(resolve){
    new THREE.GLTFLoader().load(cfg.file,function(gltf){
      try{mdlSwap(idx,cfg,gltf);resolve(true);}
      catch(e){console.warn('models: swap failed for weapon '+idx,e);resolve(false);}
    },undefined,function(e){console.warn('models: could not load '+cfg.file,e);resolve(false);});
  });
}));
