/* Last Train — hands.js
   First-person hands and arms. Loads after handling.js and rebuilds the hands on every weapon:
   real-scale gloved hands whose fingers are wrapped numerically around each weapon's contact
   volumes (a finger curls joint by joint until it meets the grip, the palm is pushed out of the
   grip, the trigger finger and the thumb are aimed at their rest points), a two-bone arm for each
   hand whose elbow hangs below the frame and whose forearm never stretches, and the hand
   animation for the trigger pull, reloads, inspection and the pump. It replaces the hands built
   in weapons.js and animateHandling/anchorSleeve from handling.js.
   All game scripts share one global scope and load in the order listed in index.html. */
'use strict';

/* ============================ materials ============================ */
/* Coyote synthetic-leather gloves and olive ripstop sleeves: mid tones so the hands read against
   the dark station instead of vanishing into it. A private generator keeps the textures
   deterministic without touching the station's shared texture seed. */
var _hdSeed=90210;
function hdRnd(){_hdSeed=(Math.imul(_hdSeed,1664525)+1013904223)>>>0;return _hdSeed/4294967296;}
function hdRR(a,b){return a+hdRnd()*(b-a);}
var TX_gloveTan=paint(256,256,function(g,w,h){
  g.fillStyle='#6f6957';g.fillRect(0,0,w,h);
  for(var i=0;i<6000;i++){g.fillStyle=hdRnd()>.5?'rgba(255,248,230,'+hdRR(.03,.10).toFixed(3)+')':'rgba(24,20,14,'+hdRR(.04,.16).toFixed(3)+')';g.fillRect(hdRnd()*w,hdRnd()*h,hdRR(1,2.5),hdRR(1,2.5));}
  for(var b=0;b<7;b++){var bx=hdRnd()*w,by=hdRnd()*h,br=hdRR(18,60);var gr=g.createRadialGradient(bx,by,1,bx,by,br);gr.addColorStop(0,'rgba(30,26,20,.22)');gr.addColorStop(1,'rgba(30,26,20,0)');g.fillStyle=gr;g.fillRect(bx-br,by-br,br*2,br*2);}
  g.strokeStyle='rgba(36,32,24,.4)';g.lineWidth=1.2;g.setLineDash([4,3]);
  g.beginPath();g.moveTo(0,64);g.lineTo(w,64);g.moveTo(0,192);g.lineTo(w,192);g.moveTo(128,0);g.lineTo(128,h);g.stroke();g.setLineDash([]);
});
var TX_sleeveOlive=paint(256,256,function(g,w,h){
  g.fillStyle='#4b5549';g.fillRect(0,0,w,h);
  for(var b=0;b<12;b++){var bx=hdRnd()*w,by=hdRnd()*h,br=hdRR(30,90),dark=hdRnd()>.5;var gr=g.createRadialGradient(bx,by,1,bx,by,br);gr.addColorStop(0,dark?'rgba(26,32,28,.30)':'rgba(96,108,96,.28)');gr.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gr;g.fillRect(bx-br,by-br,br*2,br*2);}
  g.strokeStyle='rgba(255,255,255,.06)';g.lineWidth=1;
  for(var x=0;x<w;x+=8){g.beginPath();g.moveTo(x,0);g.lineTo(x,h);g.stroke();}
  for(var y=0;y<h;y+=8){g.beginPath();g.moveTo(0,y);g.lineTo(w,y);g.stroke();}
  g.strokeStyle='rgba(255,255,255,.10)';
  for(var x2=0;x2<w;x2+=32){g.beginPath();g.moveTo(x2,0);g.lineTo(x2,h);g.stroke();}
  for(var y2=0;y2<h;y2+=32){g.beginPath();g.moveTo(0,y2);g.lineTo(w,y2);g.stroke();}
  for(var i=0;i<1500;i++){g.fillStyle='rgba(0,0,0,'+hdRR(.02,.08).toFixed(3)+')';g.fillRect(hdRnd()*w,hdRnd()*h,1,1);}
});
var hdGloveMat=new THREE.MeshStandardMaterial({color:0xffffff,map:rep(TX_gloveTan,2,2),normalMap:rep(TX.gloveNormal,2,2),normalScale:new THREE.Vector2(0.5,0.5),roughness:0.80,metalness:0.02});
hdGloveMat.envMapIntensity=.20;hdGloveMat.userData.envSet=true;
var hdPadMat=new THREE.MeshStandardMaterial({color:0x8d8674,map:rep(TX_gloveTan,2,2),roughness:0.96,metalness:0});
hdPadMat.envMapIntensity=.10;hdPadMat.userData.envSet=true;
var hdPlateMat=new THREE.MeshStandardMaterial({color:0x1b1d1f,roughness:0.55,metalness:0.15});
hdPlateMat.envMapIntensity=.30;hdPlateMat.userData.envSet=true;
var hdSleeveMat=new THREE.MeshStandardMaterial({color:0xffffff,map:rep(TX_sleeveOlive,4,3),normalMap:rep(TX.sleeveNormal,4,3),normalScale:new THREE.Vector2(0.75,0.75),roughness:0.94,metalness:0});
hdSleeveMat.envMapIntensity=.12;hdSleeveMat.userData.envSet=true;
var hdCuffMat=new THREE.MeshStandardMaterial({color:0x6c746e,map:rep(TX_sleeveOlive,3,1),roughness:0.92,metalness:0.02});
hdCuffMat.envMapIntensity=.10;hdCuffMat.userData.envSet=true;

/* ============================ hand geometry ============================ */
/* Canonical hand space: palm faces -Y, fingers point -Z, wrist at +Z; side is +1 for the right
   hand and -1 for the left, mirroring X (the thumb sits at -X·side). Sizes are real-world so the
   hands match the 1:1 weapons. Every phalanx is its own group (userData.joints / baseCurls, the
   contract handling.js's setFingerCurl already uses). */
/* Adult male hand, measured: 86 mm across the knuckles, 30 mm thick, 98 mm from the wrist crease
   to the knuckle line. Finger lengths are the real ones (index 74, middle 81, ring 75, little 59
   from the knuckle) split 47/30/23 across the phalanges — the earlier set was a tenth too long,
   which is what made the fingers read as sausages. */
var HD_W=0.086,HD_T=0.030,HD_L=0.098;
var HD_FLEN=[[0.035,0.022,0.017],[0.038,0.024,0.019],[0.035,0.022,0.018],[0.028,0.017,0.014]];
var HD_FR=[0.0097,0.0100,0.0094,0.0082];   /* gloved finger radii: index, middle, ring, little */
var HD_FX=[-0.030,-0.010,0.010,0.030];
/* the knuckle line is an arc, not a straight edge: the middle knuckle leads, the little trails */
var HD_FZ=[0.004,0,0.003,0.010];
/* thumb from the base of the thenar: metacarpal head, proximal, distal */
var HD_TLEN=[0.027,0.023,0.018],HD_TR=0.0098;
/* sleeve: a single tapered tube from the wrist that always leaves the bottom of the frame; the
   far end (a stand-in for the elbow) is never on screen, so there is no upper arm to draw */
var HD_SLEEVE_LEN=0.66,HD_RW=0.0235,HD_RE=0.0375;   /* wrist and widest-forearm radii (the tube is 0.86 flat) */
/* preferred sleeve directions in view space: mostly down (the support elbow tucks under the
   rifle), a little out toward the screen corner, and back toward the player's body, which
   foreshortens the tube instead of laying it across the frame */
/* the support forearm runs out to the lower-left corner rather than straight down, so it reads as
   one slim diagonal limb instead of a post under the gun */
var HD_EXIT_L=new THREE.Vector3(-0.38,-0.84,0.38).normalize(),HD_EXIT_R=new THREE.Vector3(0.35,-0.88,0.34).normalize();
/* merge the direct child meshes of a group by material (their local transforms are baked in), so
   a finger segment or a palm costs one draw per material instead of one per primitive */
function hdMergeGroup(group){
  var buckets={};
  group.children.slice().forEach(function(m){if(m.isMesh&&!m.children.length)(buckets[m.material.uuid]||(buckets[m.material.uuid]=[])).push(m);});
  Object.keys(buckets).forEach(function(k){
    var list=buckets[k];if(list.length<2)return;
    var count=0,chunks=list.map(function(m){m.updateMatrix();var g=m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone();g.applyMatrix4(m.matrix);count+=g.attributes.position.count;return g;});
    var merged=new THREE.BufferGeometry();
    ['position','normal','uv'].forEach(function(name){
      var stride=name==='uv'?2:3,data=new Float32Array(count*stride),off=0;
      chunks.forEach(function(g){var a=g.attributes[name];if(a)data.set(a.array,off);off+=g.attributes.position.count*stride;});
      merged.setAttribute(name,new THREE.BufferAttribute(data,stride));
    });
    merged.computeBoundingSphere();
    var mesh=new THREE.Mesh(merged,list[0].material);mesh.userData.keep=true;group.add(mesh);
    list.forEach(function(m){group.remove(m);});chunks.forEach(function(g){g.dispose();});
  });
}
/* a box with real rounded edges (weaponBox only rounds by 3 mm): vertices are pushed out from an
   inner box by r, so a large r turns a slab into a pillow; hands are built from these so the
   palm and heel read as flesh under a glove rather than as blocks */
function hdRoundBox(sx,sy,sz,r,seg){
  seg=seg||6;r=Math.min(r,Math.min(sx,sy,sz)/2-1e-4);
  var g=new THREE.BoxGeometry(sx,sy,sz,seg,seg,seg),p=g.attributes.position,n=g.attributes.normal,v=new THREE.Vector3(),q=new THREE.Vector3();
  for(var i=0;i<p.count;i++){
    v.fromBufferAttribute(p,i);
    q.set(clamp(v.x,-sx/2+r,sx/2-r),clamp(v.y,-sy/2+r,sy/2-r),clamp(v.z,-sz/2+r,sz/2-r));
    v.sub(q).normalize();n.setXYZ(i,v.x,v.y,v.z);q.addScaledVector(v,r);p.setXYZ(i,q.x,q.y,q.z);
  }
  g.computeBoundingSphere();return g;
}
function hdRMesh(x,y,z,sx,sy,sz,r,m,parent){var b=new THREE.Mesh(hdRoundBox(sx,sy,sz,r),m);b.position.set(x,y,z);parent.add(b);return b;}
function hdMakeFinger(parent,pos,lens,r,plates){
  var root=new THREE.Group();root.userData.skipBatch=true;root.position.copy(pos);parent.add(root);
  var cur=root,segs=[];
  for(var i=0;i<lens.length;i++){
    var seg=new THREE.Group();seg.userData.skipBatch=true;
    if(i>0)seg.position.z=-lens[i-1];
    cur.add(seg);segs.push(seg);
    /* each phalanx tapers along its own length and the next starts narrower, so the finger
       narrows from knuckle to tip the way a real one does instead of reading as one tube */
    var ri=r*(1-i*0.10),last=i===lens.length-1;
    var shaft=new THREE.Mesh(cg(ri*0.88,ri,lens[i],10),last?hdPadMat:hdGloveMat);shaft.rotation.x=-Math.PI/2;shaft.position.z=-lens[i]/2;seg.add(shaft);
    seg.add(new THREE.Mesh(sg(ri*1.02,10),hdGloveMat));                        /* the joint, a touch proud of the shaft */
    if(last){var tip=new THREE.Mesh(sg(ri*0.86,10),hdPadMat);tip.position.z=-lens[i]*0.94;seg.add(tip);}
    if(plates&&i===0)hdRMesh(0,ri*0.58,-lens[i]*0.34,ri*1.02,ri*0.42,lens[i]*0.30,ri*0.20,hdPadMat,seg);   /* a soft padded knuckle per finger, glove material rather than a hard shell */
    hdMergeGroup(seg);
    cur=seg;
  }
  root.userData.joints=segs;root.userData.lens=lens.slice();root.userData.r=r;root.userData.baseCurls=[0,0,0];
  return root;
}
function hdMakeHand(parent,side,thumbBack,thumbIn){
  /* thumbBack moves the thumb root toward the wrist and thumbIn toward the palm side: on a
     pistol the web of the hand wraps the backstrap, so the thumb starts behind the grip and
     nearer its far side rather than beside the palm */
  thumbBack=thumbBack||0;thumbIn=thumbIn||0;
  var h=new THREE.Group();h.userData.skipBatch=true;h.userData.side=side;parent.add(h);
  var W=HD_W,T=HD_T,L=HD_L;
  /* The palm is three blocks tapering from the knuckle line back to the wrist, plus the two muscle
     masses every hand has: the thenar under the thumb and the hypothenar along the little finger's
     edge. One slab, which is what this was, reads as a brick from every angle. The corner radii are
     large enough that the blocks merge into a single form. */
  hdRMesh(0,0,-L*0.30,W,T,L*0.36,T*0.44,hdGloveMat,h);                        /* across the knuckles: widest */
  hdRMesh(0,-0.0005,-L*0.02,W*0.95,T*0.97,L*0.34,T*0.44,hdGloveMat,h);        /* mid palm */
  hdRMesh(0,-0.001,L*0.28,W*0.76,T*0.88,L*0.34,T*0.42,hdGloveMat,h);          /* heel, narrowing to the wrist */
  var thenar=sMesh(side*-0.028,-T*0.16+thumbIn*0.5,L*0.04+thumbBack*0.5,0.019,hdGloveMat,h,10);
  thenar.scale.set(0.80,0.78,1.70);                                            /* thenar: the thumb's muscle belly */
  var hypo=sMesh(side*0.031,-T*0.14,L*0.10,0.016,hdGloveMat,h,10);
  hypo.scale.set(0.72,0.80,1.85);                                              /* hypothenar, along the little finger's edge */
  var cuff=new THREE.Mesh(cg(0.026,0.025,0.026,14),hdCuffMat);cuff.rotation.x=Math.PI/2;cuff.position.set(0,0.001,L*0.5+0.008);cuff.scale.set(1.14,0.86,0.95);h.add(cuff);   /* a snug cuff: the wrist reads narrower than palm and forearm */
  var kz=-L*0.5+0.004,fingers=[];
  for(var i=0;i<4;i++){
    /* the metacarpal head stands proud of the palm: that bump is what makes a knuckle read */
    var p=new THREE.Vector3(side*HD_FX[i],-0.002,kz+HD_FZ[i]);
    var mcp=new THREE.Mesh(sg(HD_FR[i]*1.16,10),hdGloveMat);mcp.position.copy(p);mcp.position.y+=0.0025;mcp.scale.set(1,0.94,1.15);h.add(mcp);
    fingers.push(hdMakeFinger(h,p,HD_FLEN[i],HD_FR[i],true));
  }
  /* The thumb leaves the palm from inside the thenar, well down the hand, so it opposes the
     fingers instead of standing beside them as a fifth digit. */
  var thumb=hdMakeFinger(h,new THREE.Vector3(side*-0.041,0.004+thumbIn,L*0.18+thumbBack),HD_TLEN,HD_TR,false);
  hdMergeGroup(h);
  h.userData.fingers=fingers;h.userData.thumb=thumb;
  h.userData.wrist=new THREE.Vector3(0,0.001,L*0.5+0.016);
  return h;
}

/* ============================ contact volumes ============================ */
/* Signed distance to the parts a hand can touch, in the hand parent's space:
   {box:[cx,cy,cz,hx,hy,hz,tiltX]}, {cyl:[cx,cy,cz,r,halfLen,axis]} (both axis-aligned), or
   {seg:[ax,ay,az,bx,by,bz,r]}, a capsule in any direction — that one exists so one hand can be
   given the other hand's fitted fingers to wrap onto. */
function hdVolDist(v,p){
  if(v.seg){
    var s=v.seg,ex=s[3]-s[0],ey=s[4]-s[1],ez=s[5]-s[2],wx=p.x-s[0],wy=p.y-s[1],wz=p.z-s[2];
    var ee=ex*ex+ey*ey+ez*ez,t=ee>1e-12?clamp((wx*ex+wy*ey+wz*ez)/ee,0,1):0;
    var dx=wx-ex*t,dy=wy-ey*t,dz=wz-ez*t;
    return Math.sqrt(dx*dx+dy*dy+dz*dz)-s[6];
  }
  if(v.box){
    var b=v.box,x=p.x-b[0],y=p.y-b[1],z=p.z-b[2];
    if(b[6]){var c=Math.cos(b[6]),s=Math.sin(b[6]),y2=y*c+z*s,z2=-y*s+z*c;y=y2;z=z2;}
    var qx=Math.abs(x)-b[3],qy=Math.abs(y)-b[4],qz=Math.abs(z)-b[5];
    var ox=Math.max(qx,0),oy=Math.max(qy,0),oz=Math.max(qz,0);
    return Math.sqrt(ox*ox+oy*oy+oz*oz)+Math.min(Math.max(qx,Math.max(qy,qz)),0);
  }
  var c2=v.cyl,dx=p.x-c2[0],dy=p.y-c2[1],dz=p.z-c2[2],axis=c2[5]||'z',rad,along;
  if(axis==='z'){rad=Math.sqrt(dx*dx+dy*dy);along=dz;}else if(axis==='y'){rad=Math.sqrt(dx*dx+dz*dz);along=dy;}else{rad=Math.sqrt(dy*dy+dz*dz);along=dx;}
  var qr=rad-c2[3],qa=Math.abs(along)-c2[4],orr=Math.max(qr,0),oa=Math.max(qa,0);
  return Math.sqrt(orr*orr+oa*oa)+Math.min(Math.max(qr,qa),0);
}
function hdVolsDist(vols,p){var d=Infinity;for(var i=0;i<vols.length;i++){var e=hdVolDist(vols[i],p);if(e<d)d=e;}return d;}

/* ============================ fitting ============================ */
var _hdP=new THREE.Vector3(),_hdT=new THREE.Vector3(),_hdM=new THREE.Matrix4();
/* smallest clearance between a finger segment's surface and the weapon (negative = inside) */
function hdClearance(finger,vols,toVol,fromSeg,toSeg){
  var segs=finger.userData.joints,lens=finger.userData.lens,r=finger.userData.r,best=Infinity;
  finger.updateWorldMatrix(true,true);
  var from=fromSeg===undefined?0:fromSeg,to=toSeg===undefined?segs.length-1:toSeg;
  for(var i=from;i<=to;i++){
    var seg=segs[i],ri=r*(1-i*0.08);
    for(var k=1;k<=4;k++){
      _hdP.set(0,0,-lens[i]*k/4).applyMatrix4(seg.matrixWorld).applyMatrix4(toVol);
      var d=hdVolsDist(vols,_hdP)-ri;if(d<best)best=d;
    }
  }
  return best;
}
/* curl each joint in turn until the phalanges beyond it would touch the weapon, or its limit is
   reached; a second pass tightens the base joints once the tip has curled out of the way */
function hdWrap(finger,vols,toVol,limits,gap,seed){
  var segs=finger.userData.joints,curls=[0,0,0],j,pass;
  if(seed){
    /* start from a pre-bent pose (a hand already closed around a grip), backing the base joint
       off if that pose already touches the weapon */
    for(j=0;j<3;j++){curls[j]=Math.min(seed[j],limits[j]);segs[j].rotation.x=-curls[j];}
    /* open the distal joints first: they are what usually sits inside the far side of a grip,
       and keeping the base closed lets the finger stay wrapped instead of falling open */
    var guard=0,triedUp=false;
    while(hdClearance(finger,vols,toVol,0,2)<gap&&guard++<160){
      if(curls[2]>0){curls[2]=Math.max(0,curls[2]-0.04);segs[2].rotation.x=-curls[2];}
      else if(curls[1]>0){curls[1]=Math.max(0,curls[1]-0.04);segs[1].rotation.x=-curls[1];}
      else if(!triedUp){
        /* a first phalanx angled into the front of a grip clears by closing further, not by
           opening: try the base joint upward before giving the wrap up */
        triedUp=true;var c0=curls[0],found=-1;
        for(var c=c0+0.02;c<=limits[0]+1e-6;c+=0.02){segs[0].rotation.x=-c;if(hdClearance(finger,vols,toVol,0,2)>=gap){found=c;break;}}
        if(found>=0)curls[0]=found;segs[0].rotation.x=-curls[0];
      }
      else{curls[0]=Math.max(0,curls[0]-0.02);segs[0].rotation.x=-curls[0];}
    }
  }else{
    /* no seed: close the whole finger on a natural ratio until a phalanx meets the weapon, so a
       finger that reaches free space folds like a relaxed hand instead of hooking at the knuckle */
    var ratio=[1,1.15,0.7],k=0,maxK=Math.min(limits[0]/ratio[0],limits[1]/ratio[1],limits[2]/ratio[2]);
    while(k+0.02<=maxK){
      for(j=0;j<3;j++)segs[j].rotation.x=-ratio[j]*(k+0.02);
      if(hdClearance(finger,vols,toVol,0,2)<gap)break;
      k+=0.02;
    }
    for(j=0;j<3;j++){curls[j]=ratio[j]*k;segs[j].rotation.x=-curls[j];}
  }
  for(pass=0;pass<2;pass++){
    for(j=0;j<3;j++){
      var c=curls[j],step=0.02;
      while(c+step<=limits[j]){
        segs[j].rotation.x=-(c+step);
        if(hdClearance(finger,vols,toVol,j,2)<gap)break;
        c+=step;
      }
      segs[j].rotation.x=-c;curls[j]=c;
    }
  }
  for(j=0;j<3;j++)segs[j].userData.baseRotX=-curls[j];
  finger.userData.baseCurls=curls.slice();
  return curls;
}
function hdSetCurls(finger,curls){for(var i=0;i<3;i++){finger.userData.joints[i].rotation.x=-curls[i];finger.userData.joints[i].userData.baseRotX=-curls[i];}finger.userData.baseCurls=curls.slice();}
function hdChainTip(lens,curls,out){var y=0,z=0,phi=0;for(var i=0;i<lens.length;i++){phi+=curls[i];y-=lens[i]*Math.sin(phi);z-=lens[i]*Math.cos(phi);}return out.set(0,y,z);}
/* point the finger so that its TIP (with the given curls) sits on the ray to target (hand space) */
function hdAim(finger,target,curls){
  hdChainTip(finger.userData.lens,curls,_hdT);
  var beta=Math.atan2(-_hdT.y,-_hdT.z);
  _hdP.copy(target).sub(finger.position);var D=_hdP.length();_hdP.normalize();
  finger.rotation.set(Math.asin(clamp(_hdP.y,-1,1))+beta,Math.atan2(-_hdP.x,-_hdP.z),0,'YXZ');
  hdSetCurls(finger,curls);
  return D;
}
/* fold the finger (curl profile `shape` scaled by k) until its tip reaches the target, then aim it */
function hdReach(finger,target,shape,kMin,kMax){
  var lens=finger.userData.lens,D=_hdP.copy(target).sub(finger.position).length(),lo=kMin||0,hi=kMax||1.6;
  for(var it=0;it<36;it++){var mid=(lo+hi)/2;var len=hdChainTip(lens,[shape[0]*mid,shape[1]*mid,shape[2]*mid],_hdT).length();if(len>D)lo=mid;else hi=mid;}
  var k=(lo+hi)/2,curls=[shape[0]*k,shape[1]*k,shape[2]*k];
  hdAim(finger,target,curls);
  return curls;
}
/* reach a target (given in the volume space), then push the target out of the weapon along the
   distance gradient until the whole finger is clear of it */
var _hdG=new THREE.Vector3(),_hdTv=new THREE.Vector3();
function hdReachClear(finger,hand,space,targetArr,shape,kMax,vols,toVol,kMin){
  _hdTv.fromArray(targetArr);
  var target=hdToHand(hand,space,targetArr),curls=null;
  for(var tries=0;tries<10;tries++){
    curls=hdReach(finger,target,shape,kMin||0,kMax);
    var c=hdClearance(finger,vols,toVol);
    if(c>=-0.0005)break;
    var e=0.002,d0=hdVolsDist(vols,_hdTv);
    _hdG.set(hdVolsDist(vols,_hdP.set(_hdTv.x+e,_hdTv.y,_hdTv.z))-d0,hdVolsDist(vols,_hdP.set(_hdTv.x,_hdTv.y+e,_hdTv.z))-d0,hdVolsDist(vols,_hdP.set(_hdTv.x,_hdTv.y,_hdTv.z+e))-d0);
    if(_hdG.lengthSq()<1e-12)_hdG.set(0,1,0);else _hdG.normalize();
    _hdTv.addScaledVector(_hdG,Math.max(0.002,-c));
    target=hdToHand(hand,space,_hdTv.toArray());
  }
  return curls;
}
function hdPose(finger){return {rx:finger.rotation.x,ry:finger.rotation.y,rz:finger.rotation.z,curls:finger.userData.baseCurls.slice()};}
// A thumb has to oppose the fingers around the backstrap. Opening all its joints to avoid a
// collision can send it straight through the grip. Fit base direction and curl together instead.
function hdFitThumb(thumb,vols,toVol,target){
  var base=[thumb.rotation.x,thumb.rotation.y,thumb.rotation.z];
  var best=base.concat(thumb.userData.baseCurls),tip=new THREE.Vector3();
  var original=thumb.userData.baseCurls.slice(),joints=thumb.userData.joints,lens=thumb.userData.lens;
  function pose(a){thumb.rotation.set(a[0],a[1],a[2],'YXZ');for(var j=0;j<3;j++)joints[j].rotation.x=-a[j+3];}
  function score(a){
    pose(a);var clearance=hdClearance(thumb,vols,toVol),penetration=Math.max(0,.0015-clearance);
    var error=penetration*penetration*800;
    if(target){tip.set(0,0,-lens[2]).applyMatrix4(joints[2].matrixWorld).applyMatrix4(toVol);error+=tip.distanceToSquared(target)*.4;}
    for(var j=0;j<3;j++)error+=Math.pow(a[j]-base[j],2)*.000015+Math.pow(a[j+3]-original[j],2)*.000004;
    return error;
  }
  var bestScore=score(best);
  [.24,.12,.06,.03,.015].forEach(function(step){
    for(var pass=0;pass<5;pass++)for(var axis=0;axis<6;axis++){
      for(var dir=-1;dir<=1;dir+=2){
        var candidate=best.slice();candidate[axis]+=step*dir;
        if(axis>=3)candidate[axis]=clamp(candidate[axis],.06,axis===4?1.65:1.15);
        var value=score(candidate);if(value<bestScore){best=candidate;bestScore=value;}
      }
    }
  });
  pose(best);hdSetCurls(thumb,best.slice(3));
}
function hdBlendPose(finger,a,b,k){
  finger.rotation.set(a.rx+(b.rx-a.rx)*k,a.ry+(b.ry-a.ry)*k,a.rz+(b.rz-a.rz)*k,'YXZ');
  var j=finger.userData.joints;
  for(var i=0;i<3;i++)j[i].rotation.x=-(a.curls[i]+(b.curls[i]-a.curls[i])*k);
}
/* push the whole hand out along its palm normal until the palm no longer sits inside the weapon */
function hdSettle(hand,vols,toVol){
  for(var iter=0;iter<4;iter++){
    hand.updateWorldMatrix(true,false);
    var worst=Infinity;
    for(var ix=0;ix<4;ix++)for(var iz=0;iz<5;iz++){
      _hdP.set(-HD_W/2+0.008+ix*(HD_W-0.016)/3,-HD_T/2,-HD_L/2+0.008+iz*(HD_L-0.016)/4).applyMatrix4(hand.matrixWorld).applyMatrix4(toVol);
      var d=hdVolsDist(vols,_hdP);if(d<worst)worst=d;
    }
    if(worst>=0.0005)return worst;
    _hdT.set(0,1,0).transformDirection(hand.matrixWorld);
    _hdP.setFromMatrixPosition(hand.matrixWorld).addScaledVector(_hdT,0.0005-worst);
    hand.parent.updateWorldMatrix(true,false);hand.parent.worldToLocal(_hdP);hand.position.copy(_hdP);
  }
  return 0;
}
/* The fitted hand as contact volumes in `space`: one capsule per phalanx and a few across the
   palm slab. The support hand of a handgun holds the firing hand as much as the grip, so it is
   fitted against these as well as the weapon — that is what makes its fingers land on the firing
   fingers instead of closing on empty air beside them. */
function hdHandVols(hand,space){
  space.updateWorldMatrix(true,true);
  var toSpace=new THREE.Matrix4().copy(space.matrixWorld).invert(),vols=[],a=new THREE.Vector3(),b=new THREE.Vector3();
  hand.updateWorldMatrix(true,true);
  hand.userData.fingers.concat([hand.userData.thumb]).forEach(function(f){
    var segs=f.userData.joints,lens=f.userData.lens,r=f.userData.r;
    for(var i=0;i<segs.length;i++){
      a.set(0,0,0).applyMatrix4(segs[i].matrixWorld).applyMatrix4(toSpace);
      b.set(0,0,-lens[i]).applyMatrix4(segs[i].matrixWorld).applyMatrix4(toSpace);
      vols.push({seg:[a.x,a.y,a.z,b.x,b.y,b.z,r*(1-i*0.08)]});
    }
  });
  /* the palm and heel: three capsules across the slab, thick enough to stand for its depth */
  var W=HD_W,T=HD_T,L=HD_L;
  for(var k=-1;k<=1;k++){
    a.set(k*W*0.30,0,-L*0.44).applyMatrix4(hand.matrixWorld).applyMatrix4(toSpace);
    b.set(k*W*0.30,0,L*0.46).applyMatrix4(hand.matrixWorld).applyMatrix4(toSpace);
    vols.push({seg:[a.x,a.y,a.z,b.x,b.y,b.z,T*0.5]});
  }
  return vols;
}
function hdToHand(hand,space,arr){var p=new THREE.Vector3().fromArray(arr);space.updateWorldMatrix(true,false);space.localToWorld(p);hand.updateWorldMatrix(true,false);return hand.worldToLocal(p);}
function hdFitHand(hand,vols,space,cfg){
  space.updateWorldMatrix(true,true);
  var toVol=new THREE.Matrix4().copy(space.matrixWorld).invert();
  hdSettle(hand,vols,toVol);
  var fingers=hand.userData.fingers,side=hand.userData.side,i;
  for(i=0;i<4;i++){fingers[i].rotation.set(cfg.pitch||0,side*(1.5-i)*(cfg.spread||0.04),0,'YXZ');hdSetCurls(fingers[i],[0,0,0]);}
  for(i=0;i<4;i++){if(i===0&&cfg.trigger)continue;hdWrap(fingers[i],vols,toVol,cfg.limits,cfg.gap,cfg.seed);}
  if(cfg.trigger){
    /* the fold profile is capped, and a finger that cannot fold far enough to reach its target
       overshoots past it — on a handgun, where the trigger sits barely a finger's length from the
       knuckle, that turned the indexed finger into a point. A weapon may raise the cap. */
    /* A target further away than the finger can reach leaves it bolt straight and still short of
       the mark, which is the "pointing" finger no hand ever makes. The floor keeps a living bend
       in every pose; the reach still folds further when the target is close. */
    var tf=fingers[0],tg=cfg.trigger,pShape=tg.pullShape||[0.45,1,0.55],rShape=tg.restShape||[0.30,0.70,0.45];
    hdReachClear(tf,hand,space,tg.pull,pShape,tg.pullK||2.0,vols,toVol,tg.pullMin||0.55);tf.userData.pull=hdPose(tf);
    hdReachClear(tf,hand,space,tg.rest,rShape,tg.restK||1.9,vols,toVol,tg.restMin||0.40);tf.userData.rest=hdPose(tf);
    hand.userData.trigger=tf;tf.userData.finger=tf;
  }
  if(cfg.thumb){
    /* the reach decides how the thumb approaches its rest point (over a backstrap, under a
       handguard); the wrap then starts from that pose, backs off if it touches and closes each
       joint a little further onto the surface. Closing from straight instead would leave the thumb
       lying along whatever its base happens to point at (the AK's stock). */
    var th=hand.userData.thumb,planned;
    if(cfg.thumb.pose){
      /* an explicit start pose in hand space (a pistol thumb crossing behind the backstrap and
         curling forward along the frame is not a pose a target reach converges on): `dir` is
         where the base phalanx points, `curl` the direction the joints fold toward */
      var ps=cfg.thumb.pose,ez=new THREE.Vector3().fromArray(ps.dir).normalize().negate(),ey=new THREE.Vector3().fromArray(ps.curl).normalize().negate();
      ey.addScaledVector(ez,-ey.dot(ez)).normalize();var ex=new THREE.Vector3().crossVectors(ey,ez).normalize();
      th.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(ex,ey,ez));th.rotation.setFromQuaternion(th.quaternion,'YXZ');
      planned=ps.curls.slice();
    }else planned=hdReachClear(th,hand,space,cfg.thumb.target,cfg.thumb.shape,cfg.thumb.kMax||1.4,vols,toVol);
    hdWrap(th,vols,toVol,[Math.min(0.9,planned[0]+0.3),Math.min(1.5,planned[1]+0.4),Math.min(0.95,planned[2]+0.3)],cfg.gap,planned);
    if(hdClearance(th,vols,toVol)<.0005){
      hdSetCurls(th,planned);
      hdFitThumb(th,vols,toVol,cfg.thumb.target?new THREE.Vector3().fromArray(cfg.thumb.target):null);
    }
  }
  hand.userData.vols=vols;hand.userData.space=space;
}

/* ============================ placement ============================ */
var _hdUp=new THREE.Vector3(),_hdFwd=new THREE.Vector3(),_hdRight=new THREE.Vector3(),_hdN=new THREE.Vector3(),_hdF=new THREE.Vector3(),_hdC=new THREE.Vector3(),_hdAx=new THREE.Vector3();
function hdOrient(group,n,f){
  var y=n.clone().normalize().negate(),z=f.clone().normalize().negate(),x=new THREE.Vector3().crossVectors(y,z).normalize();
  z.crossVectors(x,y).normalize();
  group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z));
}
/* pistol grip (or a vertical foregrip with side -1): palm on the side face, heel tucked behind the
   backstrap, knuckles at the front corner so the fingers can wrap the front strap */
function hdPlacePistol(arm,g,side){
  var t=g.tilt||0,ct=Math.cos(t),st=Math.sin(t);
  _hdUp.set(0,ct,st);_hdFwd.set(0,st,-ct);_hdRight.set(side,0,0);
  /* the knuckle line sits on the front strap (plus `knuckle`), so the first phalanx runs across
     the front of the grip and the rest of the finger closes round the far side */
  var kn=g.knuckle===undefined?HD_FR[1]+0.004:g.knuckle,fwd=-(HD_L*0.5-0.004-g.half[2]-kn);
  _hdC.fromArray(g.c).addScaledVector(_hdRight,g.half[0]).addScaledVector(_hdUp,g.hand||0).addScaledVector(_hdFwd,fwd);
  _hdN.copy(_hdRight).negate();_hdF.copy(_hdFwd);
  var yaw=(g.yaw||0)*side;_hdN.applyAxisAngle(_hdUp,yaw);_hdF.applyAxisAngle(_hdUp,yaw);
  _hdAx.crossVectors(_hdN,_hdF).normalize();var droop=g.droop||0;
  _hdF.applyAxisAngle(_hdAx,droop);_hdN.applyAxisAngle(_hdAx,droop);
  arm.position.copy(_hdC).addScaledVector(_hdN,-(HD_T/2+0.001));
  hdOrient(arm,_hdN,_hdF);
}
/* wrapping a cylinder (handguard, pump): the palm touches the surface at `angle` around the axis
   (0 = +X, π/2 = +Y) and the fingers head along the tangent, leaning forward a little */
function hdPlaceCylinder(arm,s){
  var th=s.angle,cx=Math.cos(th),sy=Math.sin(th);
  _hdC.fromArray(s.axis);_hdC.x+=cx*s.r;_hdC.y+=sy*s.r;
  _hdN.set(-cx,-sy,0);
  _hdF.set(-sy,cx,0).addScaledVector(_hdUp.set(0,0,-1),s.lean||0).normalize();
  /* a bar this thin is held in the fingers, not the middle of the palm: the contact sits just
     behind the knuckle line so the fingers meet the surface at once and wrap it evenly */
  var kn=s.knuckle===undefined?0.028:s.knuckle;
  arm.position.copy(_hdC).addScaledVector(_hdN,-(HD_T/2+0.001)).addScaledVector(_hdF,-(HD_L*0.5-0.004-kn));
  hdOrient(arm,_hdN,_hdF);
}
/* palm up under a beam, fingers heading right so they hook up the far side */
function hdPlaceBeam(arm,s){
  _hdN.set(0,1,0);_hdF.set(1,0,0).addScaledVector(_hdUp.set(0,0,-1),s.lean||0).normalize();
  _hdC.fromArray(s.c);_hdC.x=s.knuckleX-HD_L/2*_hdF.x;
  arm.position.copy(_hdC).addScaledVector(_hdN,-(HD_T/2+0.001));
  hdOrient(arm,_hdN,_hdF);
}

/* ============================ per-weapon grips ============================ */
/* Everything is in the weapon group's space (the shotgun support hand lives in pump space).
   fireVols/vols are what the hands may touch; trigger/thumb are fingertip rest points; reload
   poses are hand-origin targets with a local wrist rotation. */
var HD_SPECS={
  carbine:{
    grip:{c:[0,-0.085,-0.085],half:[0.014,0.055,0.024],tilt:-0.32,hand:-0.012,yaw:-0.30,droop:-0.18},
    trigger:{rest:[0.027,-0.024,-0.152],pull:[0.010,-0.033,-0.121]},
    thumb:{target:[-0.022,-0.054,-0.068],shape:[0.35,1,0.6],kMax:1.4},
    fireVols:[{box:[0,-0.085,-0.085,0.014,0.055,0.024,-0.32]},{box:[0,-0.015,-0.16,0.017,0.023,0.10]},{box:[0,0.022,-0.18,0.016,0.018,0.11]},{box:[0,-0.040,-0.22,0.018,0.006,0.041]},
      {box:[0,-0.044,-0.125,0.006,0.002,0.0225]},{box:[0,-0.034,-0.125,0.002,0.008,0.003]},{cyl:[0,0.024,0.03,0.012,0.08,'z']},{box:[0,0.015,0.07,0.018,0.034,0.07]},{box:[0,-0.115,-0.20,0.012,0.075,0.0325,0.14]}],
    support:{kind:'cyl',axis:[0,0.024,-0.35],r:0.022,angle:3.95,lean:0.40,knuckle:0.024,spread:0.015,
      thumb:{target:[-0.033,0.012,-0.44],shape:[0.2,0.5,0.4],kMax:0.9},
      vols:[{cyl:[0,0.024,-0.38,0.022,0.10,'z']},{box:[0.018,0.046,-0.34,0.013,0.009,0.0325]},{cyl:[-0.032,0.035,-0.42,0.0085,0.04,'z']},{cyl:[-0.032,0.035,-0.465,0.0105,0.0075,'z']},
        {cyl:[0,0.024,-0.47,0.0075,0.17,'z']},{box:[0,0.028,-0.52,0.009,0.012,0.011]},{box:[0,-0.015,-0.16,0.017,0.023,0.10]},{box:[0,-0.040,-0.22,0.018,0.006,0.041]},{box:[0,-0.115,-0.20,0.012,0.075,0.0325,0.14]},{box:[0,0.022,-0.18,0.016,0.018,0.11]}],
      inspect:{pos:[-0.025,-0.055,0.06],rot:[-0.30,0.10,0.45]}},
    reload:{grab:[-0.030,-0.150,-0.205],grabRot:[0.15,-0.35,1.25],pouch:[-0.06,-0.36,-0.12],bolt:[-0.052,0.046,-0.045],boltRot:[0.2,-0.4,1.4]}
  },
  shotgun:{
    grip:{c:[0,-0.075,-0.08],half:[0.014,0.055,0.024],tilt:-0.35,hand:-0.002,yaw:-0.30,droop:-0.18},
    trigger:{rest:[0.029,-0.020,-0.146],pull:[0.010,-0.030,-0.118]},
    thumb:{target:[-0.022,-0.038,-0.064],shape:[0.35,1,0.6],kMax:1.4},
    extras:'shotgun',
    fireVols:[{box:[0,-0.075,-0.08,0.014,0.055,0.024,-0.35]},{box:[0,0.01,-0.16,0.019,0.026,0.13]},{box:[0,0.01,0.08,0.016,0.0325,0.08]},{box:[0,-0.042,-0.118,0.006,0.002,0.0225]},
      {box:[0,-0.031,-0.118,0.002,0.008,0.003]},{box:[-0.028,0.01,-0.15,0.008,0.012,0.12]},{cyl:[0.02,0,-0.13,0.004,0.004,'x']}],
    support:{kind:'cyl',parent:'pump',axis:[0,0,0.005],r:0.023,angle:4.60,lean:0.35,knuckle:0.018,spread:0.015,
      thumb:{target:[-0.031,0.010,-0.075],shape:[0.2,0.5,0.4],kMax:0.9},
      vols:[{cyl:[0,0,0,0.023,0.09,'z']},{box:[0,-0.025,-0.08,0.009,0.011,0.008]},{cyl:[0,0.022,-0.10,0.012,0.24,'z']},{cyl:[0,0,-0.06,0.010,0.20,'z']},{box:[0,0.036,-0.10,0.0045,0.0025,0.22]}],
      inspect:{pos:[-0.025,-0.055,0.06],rot:[-0.30,0.10,0.45]}},
    reload:{feed:[-0.012,-0.078,0.235],feedRot:[0.55,0.35,-0.45]}
  },
  smg:{
    grip:{c:[0,-0.075,-0.08],half:[0.013,0.05,0.021],tilt:-0.28,hand:0.000,yaw:-0.30,droop:-0.18},
    trigger:{rest:[0.026,-0.022,-0.142],pull:[0.009,-0.030,-0.115]},
    thumb:{target:[-0.021,-0.036,-0.065],shape:[0.35,1,0.6],kMax:1.4},
    extras:'smg',
    fireVols:[{box:[0,-0.075,-0.08,0.013,0.05,0.021,-0.28]},{box:[0,0.02,-0.16,0.016,0.0225,0.11]},{box:[0,-0.035,-0.19,0.015,0.0375,0.05,0.40]},{box:[0,-0.006,-0.13,0.017,0.008,0.05]},{box:[0,0.01,0.06,0.014,0.025,0.07]},
      {box:[0,-0.040,-0.115,0.006,0.002,0.0225]},{box:[0,-0.030,-0.115,0.002,0.008,0.003]},{box:[0,-0.16,-0.215,0.009,0.09,0.019,-0.22]}],
    support:{kind:'vgrip',c:[0,-0.046,-0.30],half:[0.0135,0.026,0.0135],tilt:0,hand:0.002,fwd:-0.004,yaw:-0.25,droop:-0.10,
      thumb:{target:[-0.026,-0.014,-0.286],shape:[0.3,0.8,0.5],kMax:1.2},
      vols:[{cyl:[0,-0.046,-0.30,0.0135,0.026,'y']},{box:[0,-0.004,-0.30,0.014,0.016,0.025]},{cyl:[0,0.02,-0.34,0.0075,0.09,'z']},{box:[0,0.02,-0.16,0.016,0.0225,0.11]},{box:[0,-0.035,-0.19,0.015,0.0375,0.05,0.40]},
        {box:[0,-0.006,-0.13,0.017,0.008,0.05]},{box:[0,-0.16,-0.215,0.009,0.09,0.019,-0.22]},{cyl:[0,0.02,-0.44,0.0135,0.0225,'z']},{box:[0,-0.074,-0.30,0.015,0.004,0.015]}],
      inspect:{pos:[-0.02,-0.05,0.05],rot:[-0.25,0.15,0.40]}},
    reload:{grab:[-0.030,-0.175,-0.215],grabRot:[0.10,-0.30,1.20],pouch:[-0.06,-0.36,-0.14],bolt:[-0.046,0.032,-0.095],boltRot:[0.2,-0.4,1.4]}
  },
  railgun:{
    grip:{c:[0,-0.08,-0.08],half:[0.016,0.055,0.026],tilt:-0.26,hand:-0.002,yaw:-0.30,droop:-0.18,knuckle:0.0125,seed:[1.5,1.1,0.4]},
    trigger:{rest:[0.033,-0.024,-0.150],pull:[0.012,-0.034,-0.121]},
    thumb:{target:[-0.024,-0.042,-0.058],shape:[0.35,1,0.6],kMax:1.4},
    extras:'railgun',
    fireVols:[{box:[0,-0.08,-0.08,0.016,0.055,0.026,-0.26]},{box:[0,0.015,-0.16,0.023,0.037,0.14]},{box:[0,-0.065,-0.18,0.017,0.04,0.04]},{box:[0,0.01,0.06,0.019,0.04,0.09]},{box:[0,-0.046,-0.12,0.006,0.002,0.0225]},{box:[0,-0.035,-0.12,0.002,0.008,0.003]}],
    support:{kind:'beam',c:[0,-0.014,-0.375],knuckleX:0.026,lean:0.30,
      thumb:{target:[-0.028,-0.004,-0.455],shape:[0.2,0.5,0.4],kMax:0.9},
      vols:[{box:[0,-0.006,-0.52,0.015,0.008,0.24]},{box:[0,0.034,-0.52,0.015,0.008,0.24]},{cyl:[0,0.014,-0.52,0.008,0.23,'z']},{box:[0,0.038,-0.475,0.016,0.002,0.17]},{cyl:[0,0.014,-0.32,0.027,0.007,'z']},{cyl:[0,0.014,-0.34,0.025,0.009,'z']},
        {cyl:[0,0.014,-0.405,0.027,0.007,'z']},{cyl:[0,0.014,-0.43,0.025,0.009,'z']},{box:[0,-0.065,-0.18,0.017,0.04,0.04]},{box:[0,0.015,-0.16,0.023,0.037,0.14]}],
      inspect:{pos:[-0.03,-0.06,0.05],rot:[-0.30,0.10,0.40]}},
    reload:{grab:[-0.034,-0.125,-0.18],grabRot:[0.10,-0.30,1.20],pouch:[-0.06,-0.36,-0.12],bolt:[-0.048,0.02,-0.06],boltRot:[0.2,-0.4,1.4]}
  },
  /* two-handed pistol hold: the firing hand high on the grip with its thumb over the backstrap,
     the support hand's palm on the left grip panel with its fingers wrapped over the firing
     fingers (a box in front of the grip stands in for them) and its thumb forward along the
     frame under the slide. The stand-in and the GLB pistol share these dimensions. */
  pistol:{
    /* full-size 9 mm (grip 56 mm tall, 30 wide, 51 deep; sights 66 mm above the origin) */
    grip:{c:[0,-0.0475,0.000],half:[0.015,0.028,0.025],tilt:-0.15,hand:-0.011,yaw:-0.18,droop:-0.08,thumbBack:0.021,thumbIn:0.010},
    /* rest is a finger radius clear of the frame's side (x 15 mm) so the solver does not shove the
       indexed finger up off the gun; pull sits on the trigger inside the guard's opening */
    trigger:{rest:[0.028,-0.004,-0.062],pull:[0.008,-0.008,-0.050],
      restShape:[0.35,0.8,0.5],restK:2.2,pullShape:[0.45,1,0.55],pullK:2.2},
    /* hand space: the base phalanx heads left behind the backstrap (hand -Y is toward the grip,
       -X is up for the right hand), the joints fold forward (hand -Z) and back in toward the
       frame, so the thumb lies along the left panel on top of the support hand */
    thumb:{target:[-0.022,-0.014,0.022],shape:[0.35,1,0.55],kMax:1.8},
    exit:{l:[-0.42,-0.82,0.38],r:[0.44,-0.82,0.38]},
    /* the trigger guard is a hoop, not a solid: the dust cover stops at y +6 and the guard bar at
       y -20, leaving the opening the trigger finger reaches into */
    fireVols:[{box:[0,-0.0475,0.000,0.015,0.028,0.025,-0.15]},   /* grip */
      {box:[0,0.046,-0.065,0.015,0.020,0.107]},                  /* slide */
      {box:[0,0.016,-0.072,0.015,0.010,0.052]},                  /* dust cover, above the guard */
      {box:[0,0.010,0.005,0.015,0.016,0.025]},                   /* frame rear and tang */
      {box:[0,-0.023,-0.052,0.0045,0.003,0.026]},                /* trigger guard, bottom bar */
      {box:[0,-0.010,-0.077,0.0045,0.016,0.003]},                /* trigger guard, front post */
      {box:[0,-0.008,-0.051,0.002,0.006,0.003]},                 /* trigger */
      {box:[0,-0.093,0.002,0.014,0.0035,0.020]}],                /* magazine floorplate */
    /* the support hand holds the firing hand as much as the grip (`overFiring` adds the fitted
       firing hand to its contact volumes): its palm goes on the exposed left panel and the backs
       of the firing fingers, and its own fingers close over them */
    support:{kind:'vgrip',overFiring:true,c:[-0.004,-0.047,-0.008],half:[0.014,0.028,0.028],tilt:-0.15,hand:-0.012,yaw:-0.22,droop:-0.08,knuckle:0.014,
      thumb:{target:[-0.030,-0.007,-0.070],shape:[0.25,0.7,0.5],kMax:1.3},
      vols:[{box:[0,-0.0475,0.000,0.015,0.028,0.025,-0.15]},{box:[0,0.046,-0.065,0.015,0.020,0.107]},{box:[0,0.016,-0.072,0.015,0.010,0.052]},{box:[0,0.010,0.005,0.015,0.016,0.025]},
        {box:[0,-0.023,-0.052,0.0045,0.003,0.026]},{box:[0,-0.010,-0.077,0.0045,0.016,0.003]},{box:[0,-0.093,0.002,0.014,0.0035,0.020]}],
      inspect:{pos:[-0.02,-0.05,0.05],rot:[-0.25,0.15,0.40]}},
    reload:{grab:[-0.030,-0.165,-0.010],grabRot:[0.15,-0.35,1.25],pouch:[-0.06,-0.40,-0.15],bolt:[-0.036,0.075,0.024],boltRot:[0.2,-0.4,1.4]}
  }
};
/* small parts the hands need that the models did not have: trigger guards and triggers on the
   shotgun, SMG and railgun, and a stubby vertical foregrip under the SMG's barrel */
function hdAddExtras(w,kind){
  var trig=null;
  if(kind==='shotgun'){gMesh(0,-0.042,-0.118,0.012,0.004,0.045,darkMat,w);trig=gMesh(0,-0.031,-0.118,0.004,0.016,0.006,steelMat,w);}
  else if(kind==='smg'){
    gMesh(0,-0.040,-0.115,0.012,0.004,0.045,darkMat,w);trig=gMesh(0,-0.030,-0.115,0.004,0.016,0.006,steelMat,w);
    gMesh(0,-0.004,-0.30,0.028,0.032,0.050,darkMat,w);
    cMesh(0,-0.046,-0.30,0.0135,0.015,0.052,darkMat,w,0,0,0,12);
    gMesh(0,-0.074,-0.30,0.030,0.008,0.030,rubberMat,w);
  }else if(kind==='railgun'){gMesh(0,-0.046,-0.12,0.012,0.004,0.045,darkMat,w);trig=gMesh(0,-0.035,-0.12,0.004,0.016,0.006,steelMat,w);}
  if(trig){trig.userData.keep=true;trig.userData.homeZ=trig.position.z;w.userData.triggerMesh=trig;}
}

/* ============================ arms ============================ */
/* Each hand owns one sleeve: a tapered ripstop tube that starts at the wrist and runs, in view
   space, down and out toward the player's body until it has left the bottom of the frame. Its far
   end stands in for the elbow and is never on screen, so nothing above it is modelled (a real arm
   cannot reach a weapon held this far from the eye anyway). The tube is long enough to leave the
   frame from every grip pose and is only stretched if a pose ever needs more. hdSolveArm points it
   every frame. */
function hdCreateArm(arm,side,exit){
  var fore=new THREE.Group();fore.userData.skipBatch=true;arm.add(fore);
  var L=HD_SLEEVE_LEN,rW=HD_RW,rE=HD_RE;
  /* profile listed from the far end up to the wrist (y=0): outward normals need increasing y.
     A forearm: narrow at the wrist, swelling to its widest about 22 cm up (just below the elbow),
     then easing off; beyond that the tube only exists to leave the frame */
  var prof=[[-L,rE*0.88],[-0.56,rE*0.92],[-0.44,rE*0.95],[-0.34,rE*0.99],[-0.26,rE],[-0.20,rE],[-0.15,rE*0.96],[-0.11,rE*0.90],[-0.075,rE*0.80],[-0.045,rW*1.14],[-0.02,rW*1.04],[0,rW]];
  var lathe=new THREE.LatheGeometry(prof.map(function(p){return new THREE.Vector2(p[1],p[0]);}),16);
  var sleeve=new THREE.Mesh(lathe,hdSleeveMat);sleeve.scale.z=0.86;fore.add(sleeve);
  var cap=new THREE.Mesh(sg(rE*0.90,10),hdSleeveMat);cap.position.y=-L;cap.scale.set(1,0.5,0.86);fore.add(cap);   /* closes the tube should its far end ever show */
  /* bunched fabric: three folds at the radius the profile has there, each a little proud of it */
  var foldY=[-0.062,-0.115,-0.185],foldR=[rE*0.84,rE*0.92,rE*0.99];
  for(var i=0;i<3;i++){var fold=new THREE.Mesh(cg(foldR[i]*1.04,foldR[i]*1.01,0.012,16),hdSleeveMat);fold.position.y=foldY[i];fold.rotation.z=(i%2?-1:1)*0.06;fold.scale.z=0.86;fore.add(fold);}
  var cuff=new THREE.Mesh(cg(rW*1.10,rW*1.07,0.024,14),hdCuffMat);cuff.position.y=-0.013;cuff.scale.z=0.86;fore.add(cuff);
  var ball=new THREE.Mesh(sg(rW*1.02,12),hdSleeveMat);ball.scale.set(1,1,0.86);fore.add(ball);   /* wrist joint: hides the angle between hand and sleeve */
  hdMergeGroup(fore);
  arm.userData.arm={fore:fore,side:side,exit:exit?new THREE.Vector3().fromArray(exit).normalize():null,state:{exit:0,endIn:false,stretch:1,dir:new THREE.Vector3(),wrist:new THREE.Vector3(),end:new THREE.Vector3()}};
}
var _hdW=new THREE.Vector3(),_hdHz=new THREE.Vector3(),_hdD=new THREE.Vector3(),_hdA=new THREE.Vector3(),_hdDown=new THREE.Vector3(0,-1,0);
function hdTanHalf(){return Math.tan(gunCam.fov*Math.PI/360);}
/* is a gunScene-space point inside the view-model camera's frustum? */
function hdInFrame(p){if(p.z>=-0.001)return false;var hh=-p.z*hdTanHalf();return Math.abs(p.y)<hh&&Math.abs(p.x)<hh*gunCam.aspect;}
/* distance along dir from p (view space) to a line just below the bottom edge of the frame;
   Infinity when the ray never gets there */
function hdExitDist(p,dir){
  var k=hdTanHalf()*1.10,den=dir.y-k*dir.z;
  if(den>=-1e-6)return Infinity;
  return (k*p.z-p.y)/den;
}
function hdFadeToward(dir,near,side){
  if(near>=1)return;
  /* Close to the eye the forearm must not swing wide or toward the lens: both the camera-ward and
     the sideways components fade out, so it drops away behind the weapon instead of crossing the
     frame. Far from the eye (the carry pose) nothing changes and the diagonal stays. */
  if(dir.z>0)dir.z*=near;
  dir.x*=0.30+0.70*near;
  if(dir.lengthSq()<1e-6)dir.set(side*0.3,-1,0);
  dir.normalize();
}
function hdSolveArm(arm){
  var a=arm.userData.arm;if(!a)return;
  var right=a.side>0,st=a.state,rs=gunRig.scale.x||1,len=HD_SLEEVE_LEN*rs;
  arm.updateWorldMatrix(true,false);
  /* gunScene is the view-model camera's space, so "world" here is view space */
  _hdW.copy(arm.userData.wrist);arm.localToWorld(_hdW);
  _hdHz.set(0,0,1).transformDirection(arm.matrixWorld);                    /* the hand's own wrist axis */
  var E=a.exit||(right?HD_EXIT_R:HD_EXIT_L);   /* a weapon may set its own (the pistol's isosceles splay) */
  /* lean the sleeve toward the wrist axis so the joint does not kink, unless that would aim it
     up into the frame or straight at the camera */
  _hdD.copy(E).multiplyScalar(right?0.72:0.84).addScaledVector(_hdHz,right?0.28:0.16).normalize();
  if(_hdD.y>-0.35||_hdD.z>0.72)_hdD.copy(E);
  /* a hand held close to the face must not send its sleeve toward the camera: inside 65 cm the
     camera-ward component fades out (gone at 10 cm), so the tube drops away below the frame at
     ADS instead of swelling toward the lens or, for the shotgun's stock wrist, filling it */
  var near=clamp((-_hdW.z-0.10)/0.55,0,1);
  hdFadeToward(_hdD,near,a.side);
  var t=hdExitDist(_hdW,_hdD);
  if(!(t<len*0.92)){_hdD.copy(E);hdFadeToward(_hdD,near,a.side);t=hdExitDist(_hdW,_hdD);}
  st.stretch=(isFinite(t)&&t>len*0.92)?Math.min(1.8,t/(len*0.92)):1;
  st.exit=t;st.dir.copy(_hdD);st.wrist.copy(_hdW);
  st.end.copy(_hdW).addScaledVector(_hdD,len*st.stretch);
  st.endIn=hdInFrame(st.end);
  /* into hand space for the mesh */
  _hdA.copy(_hdW).add(_hdD);arm.worldToLocal(_hdA);_hdA.sub(arm.userData.wrist);
  if(_hdA.lengthSq()<1e-12)_hdA.set(0,0,1);_hdA.normalize();
  a.fore.position.copy(arm.userData.wrist);
  a.fore.quaternion.setFromUnitVectors(_hdDown,_hdA);
  /* The sleeve is a stand-in whose whole job is to leave the frame. Once the wrist is closer to
     the eye than the sleeve is wide — a stocked weapon at the shoulder puts the firing hand
     there — it cannot leave the frame in any direction, and drawing it buries the sight picture.
     It recedes over the last few centimetres instead. The hand itself is always drawn. */
  var recede=clamp((-_hdW.z-0.24)/0.10,0,1);
  st.recede=recede;
  a.fore.visible=recede>0.02;
  a.fore.scale.set(recede,st.stretch*Math.max(recede,0.001),recede);
  if(arm.userData.wristKit)arm.userData.wristKit.visible=recede>0.02;
}

/* ============================ build ============================ */
function hdBuildHands(w,key){
  var spec=HD_SPECS[key];
  hdAddExtras(w,spec.extras);
  var rArm=new THREE.Group();rArm.userData.skipBatch=true;w.add(rArm);
  hdPlacePistol(rArm,spec.grip,1);
  var rHand=hdMakeHand(rArm,1,spec.grip.thumbBack||0,spec.grip.thumbIn||0);
  rArm.userData.hand=rHand;rArm.userData.wrist=rHand.userData.wrist.clone();
  /* the seed is an almost closed fist: the first phalanx already lies across the front strap, so
     the search never has to sweep a straight finger through whatever sits ahead of the grip */
  hdFitHand(rHand,spec.fireVols,w,{trigger:spec.trigger,thumb:spec.thumb,limits:[1.55,1.6,1.0],gap:0.0015,spread:0.05,pitch:-0.05,seed:spec.grip.seed||[1.35,1.1,0.4]});
  /* the wrist unit belongs to the arm kit, so it goes away with the sleeve when the arm recedes */
  var kit=new THREE.Group();kit.userData.skipBatch=true;rArm.add(kit);
  gMesh(0,0.013,HD_L*0.5+0.014,0.026,0.006,0.020,steelMat,kit);
  gMesh(0,0.0165,HD_L*0.5+0.014,0.020,0.002,0.014,cyanGlowMat,kit);
  rArm.userData.wristKit=kit;
  var s=spec.support,lParent=s.parent==='pump'?w.userData.pump:w;
  var lArm=new THREE.Group();lArm.userData.skipBatch=true;lParent.add(lArm);
  if(s.kind==='cyl')hdPlaceCylinder(lArm,s);else if(s.kind==='vgrip')hdPlacePistol(lArm,s,-1);else hdPlaceBeam(lArm,s);
  var lHand=hdMakeHand(lArm,-1);
  lArm.userData.hand=lHand;lArm.userData.wrist=lHand.userData.wrist.clone();
  /* a two-hand handgun hold: the support hand is fitted against the firing hand too, so its
     fingers close onto the firing fingers and its palm sits on their backs */
  var lVols=s.overFiring?s.vols.concat(hdHandVols(rHand,lParent)):s.vols;
  hdFitHand(lHand,lVols,lParent,{thumb:s.thumb,limits:s.limits||[1.5,1.7,1.1],gap:0.0015,spread:s.spread||0.03,pitch:s.pitch||0,seed:s.seed||(s.kind==='vgrip'?[1.3,1.2,0.5]:[0.5,0.6,0.35])});
  // Palm fitting can translate the hand; the sleeve must start at that fitted wrist.
  rArm.userData.wrist.copy(rHand.userData.wrist).add(rHand.position);
  lArm.userData.wrist.copy(lHand.userData.wrist).add(lHand.position);
  kit.position.copy(rHand.position);
  hdCreateArm(rArm,1,spec.exit&&spec.exit.r);hdCreateArm(lArm,-1,spec.exit&&spec.exit.l);
  w.userData.rArm=rArm;w.userData.lArm=lArm;w.userData.triggerFinger=rHand.userData.trigger;
  w.userData.gripHome=lArm.position.clone();w.userData.gripRotation=lArm.rotation.clone();w.userData.gripQuat=lArm.quaternion.clone();w.userData.gripParent=lParent;
  w.userData.handSpec=spec;w.userData.hands=true;w.userData.lPose=null;
  return {rArm:rArm,lArm:lArm};
}
/* replace the hands weapons.js built with fitted ones */
wpnMeshes.forEach(function(w,i){
  ['rArm','lArm'].forEach(function(k){var old=w.userData[k];if(old&&old.parent)old.parent.remove(old);});
  hdBuildHands(w,WEAPONS[i].id);
});
gunTriggerFinger=null;                 /* the legacy per-frame finger nudge in player.js no longer applies */
shotgunLeftHand=wpnMeshes[1].userData.lArm;

/* ============================ per-frame animation ============================ */
var _hdTPos=new THREE.Vector3(),_hdTQuat=new THREE.Quaternion(),_hdQ=new THREE.Quaternion(),_hdV=new THREE.Vector3(),_hdEul=new THREE.Euler();
function hdSmooth(dt,k){return 1-Math.exp(-k*dt);}
/* blend a local wrist rotation (about the fitted grip pose) into the running rotation target */
function hdTargetRot(homeQ,rot,k){
  if(k<=0)return;
  var q=_hdQ.setFromEuler(_hdEul.set(rot[0],rot[1],rot[2]));
  q.premultiply(homeQ);
  _hdTQuat.slerp(q,k);
}
/* view-model framing: the view-model camera tightens while aiming so the sight fills the eye
   (per weapon: how much of the base field of view is taken away at full ADS) */
/* how much of the base field of view ADS takes away, per weapon. Negative widens: a stocked
   shotgun is held with the firing hand ~24 cm from the eye, and any magnification there turns the
   hand and the comb into the whole frame, so it aims at the hip field of view instead. */
var HD_ADS_TIGHTEN=[0.26,0.14,0.24,0.18,0.12];
function hdFraming(){
  var aspect=gunCam.aspect||(innerWidth/Math.max(1,innerHeight));
  var base=Math.min(110,2*Math.atan(Math.tan(58*Math.PI/360)*Math.max(1,1.4/aspect))*180/Math.PI);
  var ads=P.ads||0,ease=ads*ads*(3-2*ads);
  var tighten=HD_ADS_TIGHTEN[P.curWpn];
  var fov=base*(1-(tighten===undefined?0.24:tighten)*ease);
  if(Math.abs(gunCam.fov-fov)>0.01){gunCam.fov=fov;gunCam.updateProjectionMatrix();}
}
function animateHandling(dt){
  var w=gun,u=w.userData;if(!u.hands)return;
  var lArm=u.lArm,rArm=u.rArm,lHand=lArm.userData.hand,rHand=rArm.userData.hand,home=u.gripHome,homeQ=u.gripQuat,mag=u.mag,spec=u.handSpec;
  if(!u.lPose)u.lPose={pos:home.clone(),quat:homeQ.clone(),curl:1,thumb:1};
  var L=u.lPose;
  _hdTPos.copy(home);_hdTQuat.copy(homeQ);var tCurl=1,tThumb=1;
  if(mag){mag.position.copy(mag.userData.homePosition);mag.rotation.copy(mag.userData.homeRotation);mag.visible=true;}
  var sprintVal=P._sprintProg||0;
  /* trigger finger: on the trigger while firing, extended along the receiver otherwise */
  var tf=rHand.userData.trigger;
  var pull=(P.reload<=0&&P.inspectT<=0&&sprintVal<0.35)?(P.triggerPull||0):0;
  if(u._pull===undefined)u._pull=0;
  u._pull+=(pull-u._pull)*hdSmooth(dt,26);
  if(tf&&tf.userData.rest)hdBlendPose(tf,tf.userData.rest,tf.userData.pull,u._pull);
  if(u.triggerMesh)u.triggerMesh.position.z=u.triggerMesh.userData.homeZ+u._pull*0.012+(P.kick||0)*0.006;
  var kick=P.kick||0,grip=Math.min(kick,1)*0.008;
  for(var fi=1;fi<4;fi++)setFingerCurl(rHand.userData.fingers[fi],1,grip);
  setFingerCurl(rHand.userData.thumb,1,grip*0.5);
  /* the support hand gives a little under recoil: the weapon drives back through it and the
     wrist cocks up a touch before the hand settles home */
  // Recoil already moves the weapon and both arms. Keep each palm on its contact socket.
  if(P.inspectT>0){
    var insProg=1-Math.max(0,P.inspectT/1.35);
    var open=easePhase(insProg,0,0.22)*(1-easePhase(insProg,0.78,1.0));
    var ins=spec.support.inspect;
    _hdV.copy(home);_hdV.x+=ins.pos[0];_hdV.y+=ins.pos[1];_hdV.z+=ins.pos[2];
    _hdTPos.lerp(_hdV,open);hdTargetRot(homeQ,ins.rot,open);
    tCurl=1-0.65*open;tThumb=1-0.5*open;
  }else if(P.reload>0){
    var t=clamp(1-P.reload/(P._reloadTotal||1),0,1),rp=spec.reload;
    if(P.curWpn===1){
      /* shotgun: shells thumbed into the loading port under the receiver, then the pump racked */
      var feed=easePhase(t,0,0.15)*(1-easePhase(t,0.78,1));
      var stroke=Math.sin(clamp((t-0.15)/0.63,0,1)*Math.PI*2*3),push=Math.max(0,stroke);
      _hdV.fromArray(rp.feed);_hdV.z-=push*0.022*feed;
      _hdTPos.lerp(_hdV,feed);hdTargetRot(homeQ,rp.feedRot,feed);
      tCurl=1-0.35*feed+0.25*push*feed;tThumb=1-0.6*feed+0.4*push*feed;
      if(P._reloadIsDry&&t>0.80&&t<0.95&&shotgunPump){shotgunPump.position.z=-0.44+Math.sin((t-0.80)/0.15*Math.PI)*0.075;}
    }else if(mag){
      /* magazine or battery: drop the empty, fetch a fresh one out of frame, seat it, slap it home */
      var magHome=mag.userData.homePosition,magRot=mag.userData.homeRotation;
      var reach=easePhase(t,0,0.16),out=easePhase(t,0.16,0.36),insert=easePhase(t,0.48,0.70),slap=easePhase(t,0.70,0.76),release=easePhase(t,0.76,1.0);
      var drop=out*(1-insert)*0.24;
      mag.position.y=magHome.y-drop;mag.rotation.z=magRot.z-0.12*out*(1-insert);mag.visible=!(t>0.36&&t<0.48);
      _hdV.fromArray(rp.grab);_hdV.y-=drop;
      if(t>=0.36&&t<0.48)_hdV.fromArray(rp.pouch);
      var slapBump=Math.sin(clamp((t-0.70)/0.06,0,1)*Math.PI)*0.020;_hdV.y+=slapBump;
      if(slap>0&&insert>=1)mag.position.y=magHome.y+slapBump*0.35;
      var k=reach*(1-release);
      _hdTPos.lerp(_hdV,k);hdTargetRot(homeQ,rp.grabRot,k);
      tCurl=1-0.5*reach*(1-release)+0.35*insert*(1-release)-0.3*slap;tThumb=1-0.4*reach*(1-release);
      if(P._reloadIsDry&&t>0.78&&t<0.90&&rp.bolt){
        var b=Math.sin((t-0.78)/0.12*Math.PI);
        _hdV.fromArray(rp.bolt);_hdTPos.lerp(_hdV,b);hdTargetRot(homeQ,rp.boltRot,b);
        tCurl=1-0.4*b;
      }
    }
  }
  /* smooth toward the targets so an interrupted reload or switch blends instead of snapping */
  var kp=hdSmooth(dt,22);
  L.pos.lerp(_hdTPos,kp);L.quat.slerp(_hdTQuat,kp);
  L.curl+=(tCurl-L.curl)*hdSmooth(dt,20);L.thumb+=(tThumb-L.thumb)*hdSmooth(dt,20);
  if(dt<=0){L.pos.copy(_hdTPos);L.quat.copy(_hdTQuat);L.curl=tCurl;L.thumb=tThumb;}
  lArm.position.copy(L.pos);lArm.quaternion.copy(L.quat);
  var lf=lHand.userData.fingers;
  for(var li=0;li<4;li++)setFingerCurl(lf[li],L.curl);
  setFingerCurl(lHand.userData.thumb,L.thumb);
  hdFraming();
  hdSolveArm(lArm);hdSolveArm(rArm);
}
/* anchorSleeve is superseded by hdSolveArm; kept as a name so nothing that calls it breaks */
function anchorSleeve(w,hand,right){hdSolveArm(hand);}

/* ============================ reports (tests and tuning) ============================ */
function hdFitReport(w){
  var out={minClearance:Infinity,palmMin:Infinity,contacts:0,fingers:[]};
  [w.userData.rArm,w.userData.lArm].forEach(function(arm,ai){
    var hand=arm.userData.hand,vols=hand.userData.vols,space=hand.userData.space;
    space.updateWorldMatrix(true,true);var toVol=new THREE.Matrix4().copy(space.matrixWorld).invert();
    var list=hand.userData.fingers.concat([hand.userData.thumb]);
    list.forEach(function(f,fi){
      var c=hdClearance(f,vols,toVol);
      out.fingers.push({hand:ai?'left':'right',finger:fi,clearance:+c.toFixed(4),curls:f.userData.baseCurls.map(function(v){return +v.toFixed(2);})});
      if(c<out.minClearance)out.minClearance=c;if(c<0.004)out.contacts++;
    });
    hand.updateWorldMatrix(true,false);var worst=Infinity;
    for(var ix=0;ix<4;ix++)for(var iz=0;iz<5;iz++){
      _hdP.set(-HD_W/2+0.008+ix*(HD_W-0.016)/3,-HD_T/2,-HD_L/2+0.008+iz*(HD_L-0.016)/4).applyMatrix4(hand.matrixWorld).applyMatrix4(toVol);
      var d=hdVolsDist(vols,_hdP);if(d<worst)worst=d;
    }
    if(worst<out.palmMin)out.palmMin=worst;
  });
  return out;
}
function hdArmReport(){
  var u=gun.userData,r=u.rArm.userData.arm.state,l=u.lArm.userData.arm.state,hh=hdTanHalf();
  function ndc(p){return {x:+(p.x/(-p.z*hh*gunCam.aspect)).toFixed(2),y:+(p.y/(-p.z*hh)).toFixed(2),z:+p.z.toFixed(3)};}
  function dir(v){return v.toArray().map(function(c){return +c.toFixed(2);});}
  return {leftEndIn:l.endIn,rightEndIn:r.endIn,leftExit:+l.exit.toFixed(3),rightExit:+r.exit.toFixed(3),
    leftStretch:+l.stretch.toFixed(2),rightStretch:+r.stretch.toFixed(2),
    leftWrist:ndc(l.wrist),rightWrist:ndc(r.wrist),leftEnd:ndc(l.end),rightEnd:ndc(r.end),leftDir:dir(l.dir),rightDir:dir(r.dir),
    leftWristIn:hdInFrame(l.wrist),rightWristIn:hdInFrame(r.wrist),gunFov:+gunCam.fov.toFixed(1)};
}
animateHandling(0);
