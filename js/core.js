/* Last Train — core.js
   Bootstrap: DOM helper, error screen, renderer, scene, cameras and the post-processing passes.
   All game scripts share one global scope and load in the order listed in index.html. */
'use strict';

var $=function(id){return document.getElementById(id);};
window.addEventListener('error',function(ev){
  var l=$('load');
  if(l&&!l.hidden){l.hidden=true;l.style.display='none';$('menu').hidden=true;$('fail').hidden=false;}
  if(typeof console!=='undefined')console.error('Game error:',ev.message,'at line',ev.lineno);
});
function die(msg){$('load').hidden=true;$('menu').hidden=true;$('fail').hidden=false;if(msg)$('failtext').textContent=msg;}
if(typeof THREE==='undefined'){die('three.js could not load. This page pulls the library from a CDN, so it needs an internet connection the first time.');throw new Error('three.js missing');}

/* ============================ renderer, scene, textures ============================ */
var canvas=$('view');
var coarse=window.matchMedia('(pointer: coarse)').matches;
var isTest=typeof window!=='undefined'&&window.location&&window.location.search.indexOf('test=1')>=0;
var renderer;
try{
  renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:!coarse,powerPreference:'high-performance',stencil:false,preserveDrawingBuffer:isTest});
}catch(err){die('WebGL is unavailable in this browser. Turn on hardware acceleration and reload.');throw err;}
if(!renderer||!renderer.getContext()){die('WebGL is unavailable in this browser. Turn on hardware acceleration and reload.');throw new Error('WebGL unavailable');}

var coarse=window.matchMedia('(pointer: coarse)').matches;
var reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var TAU=Math.PI*2, clamp=THREE.MathUtils.clamp, lerp=THREE.MathUtils.lerp;
function slerp(cur, tgt, k, dt){ return cur + (tgt - cur) * (1.0 - Math.exp(-k * dt)); }
var quality='auto';
try{var savedQuality=localStorage.getItem('lt-quality');if(['auto','performance','balanced','ultra'].indexOf(savedQuality)>=0)quality=savedQuality;}catch(e){}

/* phones with few cores or little memory start at native-ish 1x; the frame loop lowers it further if needed */
var lowEnd=coarse&&(((navigator.hardwareConcurrency||8)<=4)||((navigator.deviceMemory||8)<=3));
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,coarse?1:1.5));
renderer.outputEncoding=THREE.sRGBEncoding;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=0.98;
renderer.shadowMap.enabled=!coarse;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.autoClear=false;
renderer.setClearColor(0x060c0f,1);
var maxAniso=Math.min(coarse?4:8,renderer.capabilities.getMaxAnisotropy());

var scene=new THREE.Scene();
scene.fog=new THREE.FogExp2(0x101c22,0.020);

/* Procedural environment cube map for reflections: a dark floor, a lit ceiling with fluorescent
   strips and tiled walls, so metals and wet patches reflect something station-shaped. */
var envSize=64;
function envFace(color1,color2,strips){
  var c=document.createElement('canvas');c.width=envSize;c.height=envSize;
  var g=c.getContext('2d');
  var gr=g.createLinearGradient(0,0,0,envSize);
  gr.addColorStop(0,color1);gr.addColorStop(1,color2);
  g.fillStyle=gr;g.fillRect(0,0,envSize,envSize);
  for(var i=0;i<16;i++){
    g.fillStyle='rgba(200,220,235,'+(Math.random()*0.06)+')';
    g.fillRect(Math.random()*envSize,Math.random()*envSize,Math.random()*12+2,Math.random()*4+1);
  }
  if(strips==='ceiling'){
    g.fillStyle='#dce9f2';g.fillRect(14,10,6,44);g.fillRect(44,10,6,44);
    g.fillStyle='#f4f8fb';g.fillRect(16,12,2,40);g.fillRect(46,12,2,40);
  }else if(strips==='wall'){
    g.fillStyle='#c9d8e0';g.fillRect(6,4,52,6);
    g.fillStyle='rgba(255,180,90,.55)';g.fillRect(26,26,8,5);
  }
  return c;
}
var envTextures=[
  envFace('#1c262b','#0a1013','wall'),envFace('#1c262b','#0a1013','wall'),
  envFace('#2a3a42','#141d22','ceiling'),envFace('#0a0e10','#04070a'),
  envFace('#1c262b','#0a1013','wall'),envFace('#1c262b','#0a1013','wall')
];
var envCube=new THREE.CubeTexture(envTextures);
envCube.encoding=THREE.sRGBEncoding;envCube.needsUpdate=true;
var environmentGenerator=new THREE.PMREMGenerator(renderer);
var environmentTarget=environmentGenerator.fromCubemap(envCube);
var stationEnvironment=environmentTarget.texture;
scene.environment=stationEnvironment;
environmentGenerator.dispose();
var camera=new THREE.PerspectiveCamera(76,1,0.05,220);
var gunScene=new THREE.Scene();
gunScene.environment=stationEnvironment;
var gunCam=new THREE.PerspectiveCamera(58,1,0.01,6);

/* Secondary Sniper Scope Camera & Offscreen Render Target (3x PiP Magnification) */
var scopeCam=new THREE.PerspectiveCamera(24,1,0.05,220);
var scopeRT=null;
try {
  var scopeRes = coarse ? 256 : 512;
  scopeRT = new THREE.WebGLRenderTarget(scopeRes, scopeRes, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    depthBuffer: true,
    stencilBuffer: false
  });
  scopeRT.texture.encoding = THREE.sRGBEncoding;
} catch(e) { scopeRT = null; }

/* Post-processing (Ultra). The scene renders into an offscreen target (multisampled on WebGL2 so
   edges stay smooth). A threshold pass pulls the bright emissive parts down to quarter resolution,
   two separable blurs spread them, and the composite adds that glow back with a light vignette.
   No chromatic aberration, depth of field or motion blur: they cost clarity in a shooter. */
var postEnabled = true;
var postTarget = null, bloomA = null, bloomB = null;
try {
  var rtOpts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, depthBuffer: true, stencilBuffer: false };
  if (!coarse && renderer.capabilities.isWebGL2 && THREE.WebGLMultisampleRenderTarget) {
    postTarget = new THREE.WebGLMultisampleRenderTarget(1, 1, rtOpts);
    postTarget.samples = 2;
  } else {
    postTarget = new THREE.WebGLRenderTarget(1, 1, rtOpts);
  }
  /* store display-referred colour so the threshold works on what the eye sees */
  postTarget.texture.encoding = THREE.sRGBEncoding;
  var bloomOpts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false };
  bloomA = new THREE.WebGLRenderTarget(1, 1, bloomOpts);
  bloomB = new THREE.WebGLRenderTarget(1, 1, bloomOpts);
} catch(e) { postEnabled = false; postTarget = null; bloomA = bloomB = null; }

var postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
var postScene = new THREE.Scene();
var postGeo = new THREE.PlaneGeometry(2, 2);
var POST_VS = 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position,1.0);}';
/* threshold + 4x downsample: four bilinear taps cover the 4x4 source footprint of each bloom texel */
var brightMat = new THREE.ShaderMaterial({
  uniforms: { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2(1 / 1920, 1 / 1080) }, uThreshold: { value: 0.78 } },
  vertexShader: POST_VS,
  fragmentShader: [
    'uniform sampler2D tDiffuse; uniform vec2 uTexel; uniform float uThreshold; varying vec2 vUv;',
    'void main(){',
    '  vec3 c = texture2D(tDiffuse, vUv + uTexel * vec2(-1.5, -1.5)).rgb;',
    '  c += texture2D(tDiffuse, vUv + uTexel * vec2( 1.5, -1.5)).rgb;',
    '  c += texture2D(tDiffuse, vUv + uTexel * vec2(-1.5,  1.5)).rgb;',
    '  c += texture2D(tDiffuse, vUv + uTexel * vec2( 1.5,  1.5)).rgb;',
    '  c *= 0.25;',
    '  float l = max(c.r, max(c.g, c.b));',
    '  float knee = uThreshold * 0.40;',
    '  float soft = clamp(l - uThreshold + knee, 0.0, 2.0 * knee);',
    '  soft = soft * soft / (4.0 * knee + 1e-4);',
    '  float w = max(soft, l - uThreshold) / max(l, 1e-4);',
    '  gl_FragColor = vec4(c * w, 1.0);',
    '}'
  ].join('\n'),
  depthTest: false, depthWrite: false
});
var blurMat = new THREE.ShaderMaterial({
  uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2(1 / 480, 0) } },
  vertexShader: POST_VS,
  fragmentShader: [
    'uniform sampler2D tDiffuse; uniform vec2 uDir; varying vec2 vUv;',
    'void main(){',
    '  vec3 c = texture2D(tDiffuse, vUv).rgb * 0.2270270270;',
    '  c += texture2D(tDiffuse, vUv + uDir * 1.3846153846).rgb * 0.3162162162;',
    '  c += texture2D(tDiffuse, vUv - uDir * 1.3846153846).rgb * 0.3162162162;',
    '  c += texture2D(tDiffuse, vUv + uDir * 3.2307692308).rgb * 0.0702702703;',
    '  c += texture2D(tDiffuse, vUv - uDir * 3.2307692308).rgb * 0.0702702703;',
    '  gl_FragColor = vec4(c, 1.0);',
    '}'
  ].join('\n'),
  depthTest: false, depthWrite: false
});
var postMat = new THREE.ShaderMaterial({
  uniforms: {
    tDiffuse: { value: null },
    tBloom: { value: null },
    uBloom: { value: 0.30 },
    uResolution: { value: new THREE.Vector2(window.innerWidth || 1920, window.innerHeight || 1080) }
  },
  vertexShader: POST_VS,
  fragmentShader: [
    'uniform sampler2D tDiffuse; uniform sampler2D tBloom; uniform float uBloom; uniform vec2 uResolution; varying vec2 vUv;',
    'void main(){',
    '  vec3 c = texture2D(tDiffuse, vUv).rgb;',
    '  vec3 b = texture2D(tBloom, vUv).rgb;',
    '  c += b * uBloom;',
    '  /* Aspect-ratio corrected subtle circular vignette */',
    '  float aspect = max(0.5, uResolution.x / max(1.0, uResolution.y));',
    '  vec2 vCenter = (vUv - 0.5) * vec2(min(1.35, aspect), 1.0);',
    '  float vig = 1.0 - smoothstep(0.36, 0.94, length(vCenter));',
    '  /* Filmic shadow lift: maintains dark atmospheric depth without pitch-black crushing */',
    '  vec3 shadowLift = vec3(0.003, 0.005, 0.007);',
    '  c = pow(c, vec3(0.97)) * 0.985 + shadowLift;',
    '  c *= mix(0.85, 1.0, vig);',
    '  gl_FragColor = vec4(c, 1.0);',
    '}'
  ].join('\n'),
  depthTest: false, depthWrite: false
});
var postMesh = new THREE.Mesh(postGeo, postMat);
postMesh.frustumCulled = false;
postScene.add(postMesh);
/* post runs on Ultra; the frame loop switches it off if the device cannot keep up */
var postActive = false;
/* size the offscreen targets: full resolution for the scene, a quarter for the glow (1x1 when idle) */
function resizePost(w, h) {
  if (!postTarget) return;
  if (postTarget.width !== w || postTarget.height !== h) postTarget.setSize(w, h);
  postMat.uniforms.uResolution.value.set(w, h);
  brightMat.uniforms.uTexel.value.set(1 / w, 1 / h);
  var bw = postActive ? Math.max(1, Math.floor(w / 4)) : 1, bh = postActive ? Math.max(1, Math.floor(h / 4)) : 1;
  if (bloomA && (bloomA.width !== bw || bloomA.height !== bh)) { bloomA.setSize(bw, bh); bloomB.setSize(bw, bh); }
}
/* run after the scene and view model have been rendered into postTarget */
function renderPost() {
  if (!postTarget) return;
  if (bloomA) {
    var bw = bloomA.width, bh = bloomA.height;
    postMesh.material = brightMat; brightMat.uniforms.tDiffuse.value = postTarget.texture;
    renderer.setRenderTarget(bloomA); renderer.clear(); renderer.render(postScene, postCam);
    postMesh.material = blurMat;
    for (var pass = 0; pass < 2; pass++) {
      blurMat.uniforms.tDiffuse.value = bloomA.texture; blurMat.uniforms.uDir.value.set(1 / bw, 0);
      renderer.setRenderTarget(bloomB); renderer.clear(); renderer.render(postScene, postCam);
      blurMat.uniforms.tDiffuse.value = bloomB.texture; blurMat.uniforms.uDir.value.set(0, 1 / bh);
      renderer.setRenderTarget(bloomA); renderer.clear(); renderer.render(postScene, postCam);
    }
    postMat.uniforms.tBloom.value = bloomA.texture;
  }
  postMesh.material = postMat; postMat.uniforms.tDiffuse.value = postTarget.texture;
  renderer.setRenderTarget(null); renderer.clear(); renderer.render(postScene, postCam);
}
