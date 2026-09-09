/* Shared Three.js surface effects. Fixed pools keep sustained fire bounded. */
'use strict';
/* bullet mark: a dark crater with a dust ring and radial fracture lines */
var impactTexture=paint(128,128,function(g,w,h){
  g.clearRect(0,0,w,h);
  var dust=g.createRadialGradient(64,64,10,64,64,62);
  dust.addColorStop(0,'rgba(90,92,88,.55)');dust.addColorStop(.45,'rgba(70,72,70,.35)');dust.addColorStop(1,'rgba(60,62,60,0)');
  g.fillStyle=dust;g.fillRect(0,0,w,h);
  g.strokeStyle='rgba(18,20,20,.7)';g.lineWidth=1.6;
  for(var i=0;i<9;i++){var a=i*TAU/9+rr(-.2,.2);g.beginPath();g.moveTo(64+Math.cos(a)*10,64+Math.sin(a)*10);g.lineTo(64+Math.cos(a+.08)*rr(22,46),64+Math.sin(a+.08)*rr(22,46));g.stroke();}
  var hole=g.createRadialGradient(62,62,2,64,64,16);
  hole.addColorStop(0,'rgba(6,7,8,1)');hole.addColorStop(.55,'rgba(14,16,16,.95)');hole.addColorStop(.8,'rgba(40,42,42,.6)');hole.addColorStop(1,'rgba(60,62,60,0)');
  g.fillStyle=hole;g.fillRect(0,0,w,h);
  g.fillStyle='rgba(150,152,146,.5)';g.beginPath();g.arc(70,58,4,0,TAU);g.fill();   /* lit lip on the far side */
});
impactTexture.wrapS=impactTexture.wrapT=THREE.ClampToEdgeWrapping;
var impactMaterial=new THREE.MeshBasicMaterial({map:impactTexture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});
var impactGeometry=new THREE.PlaneGeometry(.16,.16),impactPool=[],impactHead=0;
for(var impactIndex=0;impactIndex<48;impactIndex++){
  var mark=new THREE.Mesh(impactGeometry,impactMaterial);mark.visible=false;scene.add(mark);impactPool.push(mark);
}
var _impactNormal=new THREE.Vector3(),_impactZ=new THREE.Vector3(0,0,1);
function surfaceImpact(x,y,z,caliber){
  triggerKineticImpact(x,y,z,caliber);
  var nearest=.025,normal=null;
  // Collision boxes supply the surface normal; no extra scene raycast is needed.
  for(var i=0;i<COL.length;i++){
    var box=COL[i];if(box.ghost)continue;
    if(x<box.min[0]-.02||x>box.max[0]+.02||y<box.min[1]-.02||y>box.max[1]+.02||z<box.min[2]-.02||z>box.max[2]+.02)continue;
    var p=[x,y,z];
    for(var k=0;k<3;k++)for(var side=0;side<2;side++){
      var delta=Math.abs(p[k]-(side?box.max[k]:box.min[k]));
      if(delta<nearest){nearest=delta;normal=_impactNormal.set(0,0,0);normal.setComponent(k,side?1:-1);}
    }
  }
  if(!normal)return;
  var mark=impactPool[impactHead];impactHead=(impactHead+1)%impactPool.length;
  mark.position.set(x,y,z).addScaledVector(normal,.008);
  mark.quaternion.setFromUnitVectors(_impactZ,normal);mark.rotateZ(Math.random()*TAU);
  mark.scale.setScalar(caliber===3?1.8:caliber===1?.65:1);mark.visible=true;
  if(typeof puff==='function')puff(x+normal.x*.06,y+normal.y*.06,z+normal.z*.06,caliber===3?2:1,caliber===3?.5:.28,normal.x*.6,normal.y*.6+.3,normal.z*.6);
}
function clearImpactMarks(){impactPool.forEach(function(mark){mark.visible=false;});}
/* Standing water: organic multi-lobe pool with natural capillary edges and a damp concrete fringe */
var waterMask=paint(256,256,function(g,w,h){
  g.fillStyle='black';g.fillRect(0,0,w,h);
  /* central core lobes */
  for(var i=0;i<14;i++){
    var cx=128+rr(-50,50),cy=128+rr(-50,50),r=rr(36,68);
    var gr=g.createRadialGradient(cx,cy,2,cx,cy,r);
    gr.addColorStop(0,'rgba(255,255,255,1)');
    gr.addColorStop(0.70,'rgba(255,255,255,1)');
    gr.addColorStop(0.85,'rgba(255,255,255,0.7)');
    gr.addColorStop(1.0,'rgba(255,255,255,0)');
    g.fillStyle=gr;g.beginPath();g.arc(cx,cy,r,0,TAU);g.fill();
  }
  /* fine perimeter capillary fingers */
  for(var j=0;j<28;j++){
    var angle=j*TAU/28+rr(-0.1,0.1);
    var dist=rr(55,88);
    var fx=128+Math.cos(angle)*dist,fy=128+Math.sin(angle)*dist,fr=rr(8,20);
    var fgr=g.createRadialGradient(fx,fy,1,fx,fy,fr);
    fgr.addColorStop(0,'rgba(255,255,255,.9)');
    fgr.addColorStop(0.65,'rgba(255,255,255,.6)');
    fgr.addColorStop(1,'rgba(255,255,255,0)');
    g.fillStyle=fgr;g.beginPath();g.arc(fx,fy,fr,0,TAU);g.fill();
  }
  /* detached splash droplets around the puddle edge */
  for(var k=0;k<60;k++){
    g.fillStyle='rgba(255,255,255,'+rr(.4,1)+')';
    g.beginPath();g.arc(rr(40,216),rr(40,216),rr(1.2,3.8),0,TAU);g.fill();
  }
});
waterMask.encoding=THREE.LinearEncoding;waterMask.wrapS=waterMask.wrapT=THREE.ClampToEdgeWrapping;
[puddleMat,platPuddleMat].forEach(function(m){
  m.alphaMap=waterMask;m.envMap=stationEnvironment;m.metalness=.15;m.roughness=.04;m.envMapIntensity=1.35;m.needsUpdate=true;
});
platPuddleMat.opacity=.65;platPuddleMat.color.setHex(0x090f12);
/* Darken the crease where the wall meets the floor a touch beyond the baked occlusion. */
var wallContactMaterial=new THREE.MeshBasicMaterial({map:TX.contactShadow,transparent:true,opacity:.14,depthWrite:false});
var wallContact=new THREE.Mesh(new THREE.PlaneGeometry(1.4,LEN),wallContactMaterial);
wallContact.rotation.x=-Math.PI/2;wallContact.position.set(-10.6,.012,0);world.add(wallContact);

// Bright reflection strips would wash out the station and weapon finishes: anything that has not
// been tuned explicitly gets a restrained reflection strength.
Object.keys(M).forEach(function(key){if(!M[key].userData||!M[key].userData.envSet)M[key].envMapIntensity=.3;});
[bodyMat,darkMat,steelMat,magMat,gloveMat,knuckleMat,palmPadMat,cuffMat].forEach(function(m){if(!m.userData.envSet)m.envMapIntensity=.4;});

// Readable finishes: narrow highlights on machined metal, diffuse polymer and woven fabric.
bodyMat.roughness=.57;bodyMat.metalness=.82;bodyMat.envMapIntensity=.65;
steelMat.roughness=.32;steelMat.envMapIntensity=.78;
darkMat.roughness=.86;darkMat.envMapIntensity=.16;
railPaintMat.roughness=.68;railPaintMat.envMapIntensity=.48;
hdGloveMat.color.setHex(0xbcb5a1);hdGloveMat.normalScale.set(.32,.32);
hdSleeveMat.normalScale.set(.42,.42);
M.tile.normalScale.set(.28,.28);M.tileFar.normalScale.set(.28,.28);
M.tileCol.normalScale.set(.25,.25);M.tileEnd.normalScale.set(.28,.28);
M.floor.normalScale.set(.32,.32);
M.tile.color.setHex(0xc4ccca);M.tileCol.color.setHex(0xc4ccca);

// Capture the built station once. Wet concrete and the arsenal reflect its actual lights,
// signs and architecture without an extra render pass during play.
var stationReflectionTarget=null;
function captureStationReflections(){
  var cubeTarget=new THREE.WebGLCubeRenderTarget(coarse?128:256,{
    minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,
    format:THREE.RGBAFormat,generateMipmaps:false
  });
  cubeTarget.texture.encoding=THREE.sRGBEncoding;
  var probe=new THREE.CubeCamera(.1,110,cubeTarget),hidden=[];
  probe.position.set(-6,1.7,9);
  world.traverse(function(o){if(o.visible&&(o===train||o.material===puddleMat||o.material===platPuddleMat)){hidden.push(o);o.visible=false;}});
  updateLights(probe.position.x,probe.position.z);
  var target=renderer.getRenderTarget(),auto=renderer.autoClear,shadows=renderer.shadowMap.enabled;
  var pmrem=new THREE.PMREMGenerator(renderer);
  try{
    renderer.autoClear=true;renderer.shadowMap.enabled=false;
    probe.update(renderer,scene);
    stationReflectionTarget=pmrem.fromCubemap(cubeTarget.texture);
    var previous=stationEnvironment;
    stationEnvironment=stationReflectionTarget.texture;
    scene.environment=stationEnvironment;gunScene.environment=stationEnvironment;
    [scene,gunScene].forEach(function(root){root.traverse(function(o){
      var mats=o.material?(Array.isArray(o.material)?o.material:[o.material]):[];
      mats.forEach(function(m){if(m.envMap===previous||m.envMap===envCube){m.envMap=stationEnvironment;m.needsUpdate=true;}});
    });});
  }finally{
    hidden.forEach(function(o){o.visible=true;});
    renderer.autoClear=auto;renderer.shadowMap.enabled=shadows;renderer.setRenderTarget(target);
    cubeTarget.dispose();pmrem.dispose();lightAnchorX=Infinity;
  }
}
captureStationReflections();

// Ultra adds a low-resolution planar reflection to the standing water. The reflected scene
// contains only station geometry; hands, HUD and particles attached to the eye are excluded.
var wetSurfaces=[],wetReflectionRT=null,wetReflectionTick=1;
world.traverse(function(o){if(o.isMesh&&o.material===platPuddleMat)wetSurfaces.push(o);});
[[-7.7,19,3.8,2.1],[-4.0,29,2.9,1.5],[-8.1,-9,3.4,1.8]].forEach(function(p){
  var m=new THREE.Mesh(new THREE.PlaneGeometry(p[2],p[3]),platPuddleMat);
  m.position.set(p[0],.008,p[1]);m.rotation.x=-Math.PI/2;world.add(m);wetSurfaces.push(m);
});
var wetCamera=new THREE.PerspectiveCamera(),wetMatrix=new THREE.Matrix4();
var wetTarget=new THREE.Vector3(),wetUp=new THREE.Vector3(),wetPlane=new THREE.Plane(new THREE.Vector3(0,1,0),-.012);
var wetMaterial=new THREE.ShaderMaterial({
  uniforms:{reflection:{value:null},mask:{value:waterMask},textureMatrix:{value:wetMatrix},eye:{value:new THREE.Vector3()}},
  vertexShader:[
    'uniform mat4 textureMatrix;varying vec4 projected;varying vec2 waterUv;varying vec3 worldPos;',
    'void main(){vec4 p=modelMatrix*vec4(position,1.0);worldPos=p.xyz;waterUv=uv;',
    'projected=textureMatrix*p;gl_Position=projectionMatrix*viewMatrix*p;}'
  ].join('\n'),
  fragmentShader:[
    'uniform sampler2D reflection;uniform sampler2D mask;uniform vec3 eye;',
    'varying vec4 projected;varying vec2 waterUv;varying vec3 worldPos;',
    'void main(){if(projected.w<=0.0)discard;vec2 uv=projected.xy/projected.w;',
    'if(uv.x<0.0||uv.x>1.0||uv.y<0.0||uv.y>1.0)discard;',
    'float water=texture2D(mask,waterUv).g;',
    'vec3 viewDir=normalize(eye-worldPos);float fresnel=pow(1.0-clamp(viewDir.y,0.0,1.0),3.0);',
    'vec3 color=texture2D(reflection,uv).rgb;',
    'gl_FragColor=vec4(color,water*(0.12+0.55*fresnel));}'
  ].join('\n'),
  transparent:true,depthWrite:false,toneMapped:false
});
function renderWetReflections(dt){
  var active=qualityTier===2;
  wetSurfaces.forEach(function(m){m.material=active?wetMaterial:platPuddleMat;});
  if(!active)return;
  wetReflectionTick+=dt;
  if(wetReflectionTick<1/30&&wetReflectionRT)return;
  wetReflectionTick=0;
  var rw=coarse?384:640,rh=Math.max(1,Math.round(rw/camera.aspect));
  rh=Math.min(640,rh);
  if(!wetReflectionRT){wetReflectionRT=new THREE.WebGLRenderTarget(rw,rh);wetReflectionRT.texture.encoding=THREE.sRGBEncoding;}
  if(wetReflectionRT.width!==rw||wetReflectionRT.height!==rh)wetReflectionRT.setSize(rw,rh);
  camera.updateMatrixWorld(true);
  wetCamera.position.copy(camera.position);wetCamera.position.y=-camera.position.y;
  wetTarget.set(0,0,-1).applyQuaternion(camera.quaternion).add(camera.position);wetTarget.y=-wetTarget.y;
  wetUp.set(0,1,0).applyQuaternion(camera.quaternion);wetUp.y=-wetUp.y;
  wetCamera.up.copy(wetUp);wetCamera.lookAt(wetTarget);wetCamera.updateMatrixWorld(true);
  wetCamera.projectionMatrix.copy(camera.projectionMatrix);
  wetMatrix.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1);
  wetMatrix.multiply(wetCamera.projectionMatrix).multiply(wetCamera.matrixWorldInverse);
  var target=renderer.getRenderTarget(),clips=renderer.clippingPlanes,needsShadow=renderer.shadowMap.needsUpdate;
  wetSurfaces.forEach(function(m){m.visible=false;});
  try{
    renderer.clippingPlanes=[wetPlane];renderer.shadowMap.needsUpdate=false;
    renderer.setRenderTarget(wetReflectionRT);renderer.clear();renderer.render(scene,wetCamera);
    wetMaterial.uniforms.reflection.value=wetReflectionRT.texture;
    wetMaterial.uniforms.eye.value.copy(camera.position);
  }finally{
    wetSurfaces.forEach(function(m){m.visible=true;});
    renderer.clippingPlanes=clips;renderer.shadowMap.needsUpdate=needsShadow;renderer.setRenderTarget(target);
  }
}
