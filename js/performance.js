/* Rendering budgets and static station batches. No gameplay is removed at lower quality. */
'use strict';
var fxScale=1,renderScale=1,qualityTier=1,qualitySlow=0,qualityFast=0,qualityWarmup=3;
var frameTarget=60;
var QUALITY=[
  {name:'Performance',scale:coarse?0.85:1,shadows:false,post:false,fx:0.4},
  {name:'Balanced',scale:coarse?1:1.25,shadows:!coarse,post:false,fx:0.65},
  {name:'Ultra',scale:coarse?1.25:1.5,shadows:true,post:true,fx:1}
];
var batchStats={before:0,after:0};
function batchStation(){
  var buckets={};
  world.children.slice().forEach(function(m){
    if(!m.userData.stationStatic||m.material.transparent)return;
    var key=m.material.uuid+'|'+Math.floor((m.position.z+42)/14);
    (buckets[key]||(buckets[key]=[])).push(m);
  });
  Object.keys(buckets).forEach(function(key){
    var meshes=buckets[key];if(meshes.length<2)return;
    var chunks=[],size=0;
    meshes.forEach(function(m){
      m.updateMatrix();
      var g=m.geometry.toNonIndexed();g.applyMatrix4(m.matrix);
      chunks.push(g);size+=g.attributes.position.count;
    });
    var merged=new THREE.BufferGeometry();
    // uv2 carries the baked light and occlusion maps; pieces without one fall back to their uv.
    ['position','normal','uv','uv2'].forEach(function(name){
      var stride=name==='uv'||name==='uv2'?2:3,data=new Float32Array(size*stride),offset=0;
      chunks.forEach(function(g){var a=g.attributes[name]||g.attributes.uv;data.set(a.array,offset);offset+=a.array.length;});
      merged.setAttribute(name,new THREE.BufferAttribute(data,stride));
    });
    merged.computeBoundingSphere();
    var mesh=new THREE.Mesh(merged,meshes[0].material);
    mesh.castShadow=true;mesh.receiveShadow=true;mesh.matrixAutoUpdate=false;
    world.add(mesh);
    meshes.forEach(function(m){world.remove(m);});
    chunks.forEach(function(g){g.dispose();});
    batchStats.before+=meshes.length;batchStats.after++;
  });
  // Freeze local transforms only for known static objects, leaving enemies/train/props mutable.
  world.children.forEach(function(m){if(m.userData.stationStatic){m.updateMatrix();m.matrixAutoUpdate=false;}});
}
function qualityLabel(){
  var label='Graphics: '+(quality==='auto'?'Auto · '+QUALITY[qualityTier].name:QUALITY[qualityTier].name);
  ['quality','quality2'].forEach(function(id){if($(id))$(id).textContent=label;});
  if($('qualityval'))$('qualityval').textContent=QUALITY[qualityTier].name+' · '+Math.round(renderScale*100)+'%';
}
function setRenderScale(scale){
  renderScale=Math.min(window.devicePixelRatio||1,scale);
  // A pixel budget also protects tablets and 4K displays from oversized render targets.
  renderScale=Math.min(renderScale,Math.sqrt((coarse?1600000:3600000)/Math.max(1,innerWidth*innerHeight)));
  renderer.setPixelRatio(renderScale);resize();qualityLabel();
}
function setQualityTier(tier){
  qualityTier=clamp(tier,0,2);var q=QUALITY[qualityTier];fxScale=q.fx;
  renderer.shadowMap.enabled=q.shadows;
  renderer.shadowMap.autoUpdate=true;renderer.shadowMap.needsUpdate=true;
  postActive=q.post&&postEnabled&&!!postTarget;
  dustPoints.visible=qualityTier>0;
  // Performance drops the volumetric cones and runs two fixture lights instead of three.
  if(typeof cones!=='undefined')for(var ci=0;ci<cones.length;ci++)cones[ci].visible=qualityTier>0;
  if(typeof poolActive!=='undefined'){poolActive=qualityTier>0?3:2;lightAnchorX=Infinity;}
  setRenderScale(q.scale);
}
function applyQuality(){
  qualitySlow=qualityFast=0;qualityWarmup=3;
  setQualityTier(quality==='auto'?(lowEnd?0:1):['performance','balanced','ultra'].indexOf(quality));
}
function cycleQuality(){
  var modes=['auto','performance','balanced','ultra'];quality=modes[(modes.indexOf(quality)+1)%modes.length];
  try{localStorage.setItem('lt-quality',quality);}catch(e){}
  applyQuality();
}
function adaptQuality(dt){
  if(quality!=='auto'||dt<=0||dt>0.25)return;
  if(qualityWarmup>0){qualityWarmup-=dt;return;}
  if(dt>1/50){qualitySlow+=dt;qualityFast=0;}else{qualitySlow=Math.max(0,qualitySlow-dt*.5);if(dt<1/57)qualityFast+=dt;}
  if(qualitySlow>2){
    if(qualityTier>0)setQualityTier(qualityTier-1);
    else if(renderScale>0.6)setRenderScale(Math.max(0.6,renderScale-0.1));
    qualitySlow=qualityFast=0;qualityWarmup=3;
  }else if(qualityFast>15&&renderScale<QUALITY[qualityTier].scale){
    setRenderScale(Math.min(QUALITY[qualityTier].scale,renderScale+0.05));
    qualityFast=0;qualityWarmup=3;
  }
}
batchStation();
