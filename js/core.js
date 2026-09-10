/* Subway FPS — core.js
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
var postTarget = null, bloomA = null, bloomB = null, bloomC = null, bloomD = null;
try {
  /* Half float, and linear. The scene used to resolve into an 8-bit sRGB target, which meant
     tone mapping and the sRGB transfer both happened inside the scene pass and everything was
     clamped to 1.0 before anything downstream saw it: a 20x muzzle flash and a 1.05x tile were
     the same number to the bloom threshold, which is why lamps smeared instead of glowing.
     Now the scene keeps its full range, the bloom threshold means something in luminance, and
     the tone map moves to the end of the composite where it belongs. */
  var hdrType = renderer.capabilities.isWebGL2 ? THREE.HalfFloatType : THREE.UnsignedByteType;
  var rtOpts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, type: hdrType, depthBuffer: true, stencilBuffer: false };
  if (!coarse && renderer.capabilities.isWebGL2 && THREE.WebGLMultisampleRenderTarget) {
    postTarget = new THREE.WebGLMultisampleRenderTarget(1, 1, rtOpts);
    /* r128's own default is 4 and this was explicitly halved; the device reports 16 available.
       Edges are the one thing no amount of post can put back, so pay for them here. */
    postTarget.samples = 4;
  } else {
    postTarget = new THREE.WebGLRenderTarget(1, 1, rtOpts);
  }
  /* store display-referred colour so the threshold works on what the eye sees */
  postTarget.texture.encoding = THREE.LinearEncoding;
  /* the bloom chain has to be float too, or the halo is re-clamped the moment it is thresholded */
  var bloomOpts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, type: hdrType, depthBuffer: false, stencilBuffer: false };
  bloomA = new THREE.WebGLRenderTarget(1, 1, bloomOpts);
  bloomB = new THREE.WebGLRenderTarget(1, 1, bloomOpts);
  /* A single blur radius gives one hard ring around a light. Real glow is a bright tight core
     sitting inside a wide soft skirt, so the tight result is taken down to a sixteenth and blurred
     again, and the composite adds both. */
  bloomC = new THREE.WebGLRenderTarget(1, 1, bloomOpts);
  bloomD = new THREE.WebGLRenderTarget(1, 1, bloomOpts);
} catch(e) { postEnabled = false; postTarget = null; bloomA = bloomB = bloomC = bloomD = null; }

var postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
var postScene = new THREE.Scene();
var postGeo = new THREE.PlaneGeometry(2, 2);
var POST_VS = 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position,1.0);}';
/* threshold + 4x downsample: four bilinear taps cover the 4x4 source footprint of each bloom texel */
var brightMat = new THREE.ShaderMaterial({
  uniforms: { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2(1 / 1920, 1 / 1080) }, uThreshold: { value: 1.02 } },
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
    /* rgba, not rgb: the haze pass carries its traced lamp shadow in alpha and it needs the same
       softening as the light does. For the bloom and occlusion chains alpha is 1 throughout, so
       blurring it changes nothing there. */
    '  vec4 c = texture2D(tDiffuse, vUv) * 0.2270270270;',
    '  c += texture2D(tDiffuse, vUv + uDir * 1.3846153846) * 0.3162162162;',
    '  c += texture2D(tDiffuse, vUv - uDir * 1.3846153846) * 0.3162162162;',
    '  c += texture2D(tDiffuse, vUv + uDir * 3.2307692308) * 0.0702702703;',
    '  c += texture2D(tDiffuse, vUv - uDir * 3.2307692308) * 0.0702702703;',
    '  gl_FragColor = c;',
    '}'
  ].join('\n'),
  depthTest: false, depthWrite: false
});
var postMat = new THREE.ShaderMaterial({
  uniforms: {
    tDiffuse: { value: null },
    tBloom: { value: null },
    tBloomWide: { value: null },
    tAO: { value: null },
    uBloom: { value: 0.52 },
    uBloomWide: { value: 0.40 },
    uAO: { value: 0.0 },
    uSharpen: { value: 0.34 },
    uGrain: { value: 0.011 },
    uTime: { value: 0.0 },
    tVolume: { value: null },
    uVolume: { value: 0.0 },
    uExposure: { value: 0.98 },
    uLampShadow: { value: 0.85 },
    uSat: { value: 1.14 },
    uContrast: { value: 1.05 },
    uSCurve: { value: 0.32 },
    uResolution: { value: new THREE.Vector2(window.innerWidth || 1920, window.innerHeight || 1080) }
  },
  vertexShader: POST_VS,
  fragmentShader: [
    'uniform sampler2D tDiffuse; uniform sampler2D tBloom; uniform sampler2D tBloomWide; uniform sampler2D tAO;',
    'uniform sampler2D tVolume;',
    'uniform float uBloom; uniform float uBloomWide; uniform float uAO; uniform float uSharpen; uniform float uGrain;',
    'uniform float uVolume; uniform float uLampShadow; uniform float uSat; uniform float uContrast; uniform float uSCurve;',
    'uniform float uExposure; uniform float uTime; uniform vec2 uResolution; varying vec2 vUv;',
    '/* three.js ACES, lifted so it can run here at the end instead of inside the scene pass */',
    'vec3 tonemap(vec3 c){',
    '  c *= uExposure / 0.6;',
    '  mat3 ACESIn  = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);',
    '  mat3 ACESOut = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);',
    '  c = ACESIn * c;',
    '  vec3 a = c * (c + 0.0245786) - 0.000090537;',
    '  vec3 b = c * (0.983729 * c + 0.4329510) + 0.238081;',
    '  c = ACESOut * (a / b);',
    '  return clamp(c, 0.0, 1.0);',
    '}',
    'vec3 encodeSRGB(vec3 v){',
    '  return mix(pow(v, vec3(0.41666)) * 1.055 - 0.055, v * 12.92, vec3(lessThanEqual(v, vec3(0.0031308))));',
    '}',
    'vec3 display(vec3 hdr){ return encodeSRGB(tonemap(hdr)); }',
    'void main(){',
    '  /* Everything up to the tone map happens in linear light, which is the whole point of the',
    '     HDR target: occlusion attenuates radiance, and the glow and the haze are energy added to',
    '     it, not paint mixed into a picture of it. */',
    '  vec3 hdr = texture2D(tDiffuse, vUv).rgb;',
    '  /* Occlusion belongs to the ambient term, so it lands before the glow is added and is let',
    '     go as a pixel gets bright: a lamp does not dim because it sits in a corner. Emitters now',
    '     run well past 1.0, so the release is measured against that range rather than against 1. */',
    '  float ao = mix(1.0, texture2D(tAO, vUv).r, uAO);',
    '  float lum = max(hdr.r, max(hdr.g, hdr.b));',
    '  vec3 base = hdr * mix(ao, 1.0, smoothstep(0.70, 2.00, lum));',
    '  /* the traced fixture shadow, released on emitters the same way the occlusion is */',
    '  float lampShadow = mix(1.0, texture2D(tVolume, vUv).a, uLampShadow);',
    '  base *= mix(lampShadow, 1.0, smoothstep(0.70, 2.00, lum));',
    '  /* tight core plus wide skirt, both in linear light */',
    '  vec3 lit = base + texture2D(tBloom, vUv).rgb * uBloom + texture2D(tBloomWide, vUv).rgb * uBloomWide;',
    '  /* Lit haze. It is added, never multiplied: air in a light beam emits toward the eye, it',
    '     does not tint what is behind it. Occlusion is already in the march, so a beam stops at',
    '     the first surface it meets instead of glowing through a pillar. */',
    '  lit += texture2D(tVolume, vUv).rgb * uVolume;',
    '  vec3 c = display(lit);',
    '  /* Unsharp mask against a four-tap cross, taken after the tone map so the amount keeps the',
    '     meaning it was tuned with and a highlight cannot run away with it. It is measured on the',
    '     surface only, with the glow and the haze left out, so it sharpens the station rather than',
    '     the halo around a lamp. */',
    '  vec2 px = 1.0 / uResolution;',
    '  vec3 lo = display(texture2D(tDiffuse, vUv + vec2(px.x, 0.0)).rgb);',
    '  lo += display(texture2D(tDiffuse, vUv - vec2(px.x, 0.0)).rgb);',
    '  lo += display(texture2D(tDiffuse, vUv + vec2(0.0, px.y)).rgb);',
    '  lo += display(texture2D(tDiffuse, vUv - vec2(0.0, px.y)).rgb);',
    '  c += (display(base) - lo * 0.25) * uSharpen;',
    '  /* Grade. Saturation, then a gamma, then a smoothstep S-curve for the toe and shoulder, then',
    '     a split tone: the station reads cold, the sodium lamps and signage stay warm. */',
    '  c = max(vec3(0.0), c);',
    '  float gl = dot(c, vec3(0.2126, 0.7152, 0.0722));',
    '  c = mix(vec3(gl), c, uSat);',
    '  c = pow(c, vec3(uContrast));',
    '  c = mix(c, c * c * (3.0 - 2.0 * c), uSCurve);',
    '  c *= mix(vec3(0.84, 0.95, 1.12), vec3(1.08, 1.00, 0.90), smoothstep(0.0, 0.72, gl));',
    '  /* Aspect-ratio corrected subtle circular vignette */',
    '  float aspect = max(0.5, uResolution.x / max(1.0, uResolution.y));',
    '  vec2 vCenter = (vUv - 0.5) * vec2(min(1.35, aspect), 1.0);',
    '  float vig = 1.0 - smoothstep(0.36, 0.94, length(vCenter));',
    '  /* Filmic shadow lift: maintains dark atmospheric depth without pitch-black crushing */',
    '  vec3 shadowLift = vec3(0.003, 0.005, 0.007);',
    '  c = pow(c, vec3(0.97)) * 0.985 + shadowLift;',
    '  c *= mix(0.85, 1.0, vig);',
    '  /* Sensor grain, weighted into the shadows the way a real one is: it breaks up the flat',
    '     gradients the fog leaves down the tunnel, which otherwise band. */',
    '  float gr = fract(sin(dot(vUv * uResolution + uTime, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;',
    '  float glum = max(c.r, max(c.g, c.b));',
    '  c += gr * uGrain * (1.0 - 0.7 * clamp(glum, 0.0, 1.0));',
    '  gl_FragColor = vec4(c, 1.0);',
    '}'
  ].join('\n'),
  depthTest: false, depthWrite: false
});
var postMesh = new THREE.Mesh(postGeo, postMat);
postMesh.frustumCulled = false;
postScene.add(postMesh);

/* ============================ ambient occlusion (Ultra) ============================
   The station's static surfaces already carry occlusion baked into their light maps by
   bakeSurface, but nothing that moves does: enemies, gibs, the barrels and the view model all
   meet the floor without darkening where they touch it, which is the plainest tell that an image
   is synthetic. This adds it in screen space.
   Depth comes from its own half-resolution prepass rather than from postTarget, because that
   target is multisampled and a multisampled depth attachment cannot be sampled. Half resolution
   is ample for a term that is blurred anyway, and the prepass writes depth only. View-space
   normals are rebuilt from the derivatives of the reconstructed position, so there is no normal
   buffer either. All of it is gated on post being active, which means Ultra. */
var AO_SAMPLES = 12, AO_AMOUNT = 0.85;
var aoEnabled = postEnabled, aoDepthTarget = null, aoTarget = null, aoBlurTarget = null, aoDepthMat = null;
var aoKernel = [];
for (var aoI = 0; aoI < AO_SAMPLES; aoI++) {
  /* a golden-angle spiral over the hemisphere so the directions never clump, pulled in toward the
     origin so most samples test the near contact rather than the far surroundings */
  var aoA = aoI * 2.39996323, aoZ = (aoI + 0.5) / AO_SAMPLES, aoR = Math.sqrt(1 - aoZ * aoZ);
  var aoV = new THREE.Vector3(Math.cos(aoA) * aoR, Math.sin(aoA) * aoR, aoZ);
  aoV.multiplyScalar(0.15 + 0.85 * Math.pow((aoI + 1) / AO_SAMPLES, 2));
  aoKernel.push(aoV);
}
/* a white stand-in, so the composite is neutral on any frame that has no occlusion to show */
var aoWhite = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
aoWhite.needsUpdate = true;
postMat.uniforms.tAO.value = aoWhite;
var bloomBlack = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat);
bloomBlack.needsUpdate = true;
postMat.uniforms.tBloom.value = bloomBlack;
postMat.uniforms.tBloomWide.value = bloomBlack;
var volBlack = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat);
volBlack.needsUpdate = true;
try {
  if (aoEnabled) {
    var aoDepth = new THREE.DepthTexture(1, 1);
    aoDepth.type = renderer.capabilities.isWebGL2 ? THREE.FloatType : THREE.UnsignedShortType;
    aoDepth.minFilter = THREE.NearestFilter; aoDepth.magFilter = THREE.NearestFilter;
    aoDepthTarget = new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, format: THREE.RGBAFormat, depthBuffer: true, stencilBuffer: false });
    aoDepthTarget.depthTexture = aoDepth;
    var aoOpts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false };
    aoTarget = new THREE.WebGLRenderTarget(1, 1, aoOpts);
    aoBlurTarget = new THREE.WebGLRenderTarget(1, 1, aoOpts);
    aoDepthMat = new THREE.MeshBasicMaterial({ colorWrite: false });
  }
} catch (e) { aoEnabled = false; }
var ssaoMat = new THREE.ShaderMaterial({
  defines: { AO_SAMPLES: AO_SAMPLES },
  uniforms: {
    tDepth: { value: null }, uProj: { value: new THREE.Matrix4() }, uProjInv: { value: new THREE.Matrix4() },
    uKernel: { value: aoKernel }, uRes: { value: new THREE.Vector2(1, 1) },
    uRadius: { value: 0.38 }, uBias: { value: 0.022 }, uStrength: { value: 1.0 }
  },
  vertexShader: POST_VS,
  fragmentShader: [
    'uniform sampler2D tDepth; uniform mat4 uProj; uniform mat4 uProjInv;',
    'uniform vec3 uKernel[AO_SAMPLES]; uniform vec2 uRes;',
    'uniform float uRadius; uniform float uBias; uniform float uStrength;',
    'varying vec2 vUv;',
    'vec3 viewPos(vec2 uv, float d){',
    '  vec4 c = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);',
    '  vec4 v = uProjInv * c;',
    '  return v.xyz / v.w;',
    '}',
    'void main(){',
    '  float d = texture2D(tDepth, vUv).x;',
    '  if(d >= 0.9999){ gl_FragColor = vec4(1.0); return; }',
    '  vec3 P = viewPos(vUv, d);',
    '  vec3 N = normalize(cross(dFdx(P), dFdy(P)));',
    '  float ang = fract(sin(dot(floor(vUv * uRes), vec2(12.9898, 78.233))) * 43758.5453) * 6.2831853;',
    '  float ca = cos(ang), sa = sin(ang);',
    '  float occ = 0.0;',
    '  for(int i = 0; i < AO_SAMPLES; i++){',
    '    vec3 k = uKernel[i];',
    '    vec3 s = vec3(k.x * ca - k.y * sa, k.x * sa + k.y * ca, k.z);',
    '    if(dot(s, N) < 0.0) s = -s;',
    '    vec3 sp = P + s * uRadius;',
    '    vec4 o = uProj * vec4(sp, 1.0);',
    '    vec2 suv = (o.xy / o.w) * 0.5 + 0.5;',
    '    if(suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) continue;',
    '    vec3 sPos = viewPos(suv, texture2D(tDepth, suv).x);',
    '    float range = smoothstep(0.0, 1.0, uRadius / max(1e-4, abs(P.z - sPos.z)));',
    '    occ += step(sp.z + uBias, sPos.z) * range;',
    '  }',
    '  float ao = 1.0 - uStrength * occ / float(AO_SAMPLES);',
    '  gl_FragColor = vec4(vec3(clamp(ao, 0.0, 1.0)), 1.0);',
    '}'
  ].join('\n'),
  depthTest: false, depthWrite: false
});
ssaoMat.extensions.derivatives = true;

/* ============================ lit haze (Ultra) ============================
   The tunnel is dark, damp and full of strip lights, and until now the only thing standing in for
   air was a pair of billboarded cones at 6% opacity and an exponential fog that tints but never
   glows. This marches the volume properly. For each pixel it walks from the eye to whatever the
   depth prepass says it hit, and at every step asks the nearest ceiling fixtures how much light
   reaches that point in the air.
   The lamps are strips behind a diffuser pointing straight down, so each is modelled as a cone
   about its own downward axis rather than as a bare point: that is what makes a beam instead of a
   ball of glow, and it is why this needs no shadow map, which is just as well because the only
   shadow-casting light in the scene is the key, not the fixtures. Marching stops at scene depth,
   so a beam is cut off by the pillar in front of it. The start of each ray is dithered per pixel
   and the result is blurred, or sixteen steps would band into visible slices. */
var VOL_STEPS = 16, VOL_LIGHTS = 4, VOL_OCC = 8, VOL_AMOUNT = 1.0;
var volTarget = null, volBlurTarget = null;
var volLights = [];
for (var vi = 0; vi < VOL_LIGHTS; vi++) volLights.push(new THREE.Vector4(0, -999, 0, 1));
/* The boxes a beam can be cut by. The station is built from axis-aligned boxes and already keeps
   them in COL for the bullets, so the same set can be traced against in the shader. Unused slots
   are parked far underground where no ray will ever reach them. */
var volOccMin = [], volOccMax = [], volOccScratch = [];
for (var oi = 0; oi < VOL_OCC; oi++) {
  volOccMin.push(new THREE.Vector3(0, -9999, 0));
  volOccMax.push(new THREE.Vector3(0, -9998, 0));
}
try {
  if (aoEnabled) {
    var volOpts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, type: (renderer.capabilities.isWebGL2 ? THREE.HalfFloatType : THREE.UnsignedByteType), depthBuffer: false, stencilBuffer: false };
    volTarget = new THREE.WebGLRenderTarget(1, 1, volOpts);
    volBlurTarget = new THREE.WebGLRenderTarget(1, 1, volOpts);
  }
} catch (e) { volTarget = null; }
var volMat = new THREE.ShaderMaterial({
  defines: { VOL_STEPS: VOL_STEPS, VOL_LIGHTS: VOL_LIGHTS, VOL_OCC: VOL_OCC },
  uniforms: {
    tDepth: { value: null }, uProjInv: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() },
    uLights: { value: volLights }, uColor: { value: new THREE.Color(0.62, 0.74, 0.92) },
    uOccMin: { value: volOccMin }, uOccMax: { value: volOccMax },
    /* the traced shadow ray now rejects better than nine samples in ten, so what survives has to
       carry the beam on its own; the cone is opened a little too, since it is no longer the only
       thing keeping light off the walls */
    uDensity: { value: 0.44 }, uConeCos: { value: 0.68 }, uFar: { value: 24.0 },
    uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 }
  },
  vertexShader: POST_VS,
  fragmentShader: [
    'uniform sampler2D tDepth; uniform mat4 uProjInv; uniform mat4 uCamWorld;',
    'uniform vec4 uLights[VOL_LIGHTS]; uniform vec3 uColor;',
    'uniform vec3 uOccMin[VOL_OCC]; uniform vec3 uOccMax[VOL_OCC];',
    'uniform float uDensity; uniform float uConeCos; uniform float uFar; uniform float uTime;',
    'uniform vec2 uRes; varying vec2 vUv;',
    '/* A shadow ray, traced. Slab test of the segment from the sample in the air to the lamp against',
    '   the nearest station boxes: if anything is in the way, that pocket of air gets no light from',
    '   that fixture. This is what makes a shaft a shaft - cut off by the pillar in front of it rather',
    '   than glowing through it - and it is not something a shadow map could do here, because the',
    '   fixtures are not the shadow-casting light. */',
    'bool occluded(vec3 p, vec3 lp){',
    '  vec3 ds = (lp - p) + vec3(1e-6);',
    '  for(int b = 0; b < VOL_OCC; b++){',
    '    vec3 t0 = (uOccMin[b] - p) / ds;',
    '    vec3 t1 = (uOccMax[b] - p) / ds;',
    '    vec3 tn = min(t0, t1), tf = max(t0, t1);',
    '    float lo = max(max(tn.x, tn.y), tn.z);',
    '    float hi = min(min(tf.x, tf.y), tf.z);',
    '    if(hi >= max(lo, 0.0) && lo < 1.0) return true;',
    '  }',
    '  return false;',
    '}',
    'void main(){',
    '  float d = texture2D(tDepth, vUv).x;',
    '  vec4 cp = vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);',
    '  vec4 vp = uProjInv * cp; vp /= vp.w;',
    '  vec3 world = (uCamWorld * vec4(vp.xyz, 1.0)).xyz;',
    '  vec3 eye = uCamWorld[3].xyz;',
    '  vec3 ray = world - eye;',
    '  float dist = min(length(ray), uFar);',        /* never march past the useful range */
    '  vec3 dir = normalize(ray);',
    '  float stepLen = dist / float(VOL_STEPS);',
    '  float dither = fract(sin(dot(vUv * uRes + uTime, vec2(12.9898, 78.233))) * 43758.5453);',
    '  float acc = 0.0;',
    '  for(int i = 0; i < VOL_STEPS; i++){',
    '    float t = (float(i) + dither) * stepLen;',
    '    vec3 p = eye + dir * t;',
    '    for(int L = 0; L < VOL_LIGHTS; L++){',
    '      vec4 lt = uLights[L];',
    '      vec3 toP = p - lt.xyz;',
    '      float dl = length(toP);',
    '      if(dl > lt.w) continue;',
    '      float down = clamp(-toP.y / max(dl, 1e-4), 0.0, 1.0);',   /* 1 directly beneath the strip */
    '      float cone = smoothstep(uConeCos, 1.0, down);',
    '      cone *= cone;',
    '      if(cone < 0.003) continue;',                 /* outside the beam: never trace */
    '      if(occluded(p, lt.xyz)) continue;',          /* in the station's shadow */
    '      float atten = 1.0 - clamp(dl / lt.w, 0.0, 1.0);',
    '      acc += cone * atten * atten;',
    '    }',
    '  }',
    '  /* fade the march out with range, or the far end of the platform sits under a sheet */',
    '  acc *= uDensity * stepLen * (1.0 - 0.55 * clamp(dist / uFar, 0.0, 1.0));',
    '  /* And the useful ray: from the point the depth buffer says we are looking at, trace to every',
    '     fixture near enough to matter. The station has exactly one shadow-casting light and none of',
    '     the twelve ceiling fixtures is it, so this is the only way a pillar, a bench or a kiosk can',
    '     put a shadow on the floor from the lamp directly above it. The start is nudged along the ray',
    '     so a surface does not shadow itself on its own box. */',
    '  float vis = 0.0, wsum = 0.0;',
    '  for(int S = 0; S < VOL_LIGHTS; S++){',
    '    vec4 sl = uLights[S];',
    '    vec3 tw = sl.xyz - world;',
    '    float dw = length(tw);',
    '    if(dw > sl.w) continue;',
    '    float wgt = 1.0 - clamp(dw / sl.w, 0.0, 1.0);',
    '    wsum += wgt;',
    '    if(!occluded(world + (tw / max(dw, 1e-4)) * 0.07, sl.xyz)) vis += wgt;',
    '  }',
    '  /* never to black: the bake and the ambient still light what the fixtures cannot reach */',
    '  float shadow = wsum > 0.0 ? (0.34 + 0.66 * (vis / wsum)) : 1.0;',
    '  gl_FragColor = vec4(uColor * acc, shadow);',
    '}'
  ].join('\n'),
  depthTest: false, depthWrite: false
});
/* the four fixtures nearest the eye carry the beams; the rest are too far to read */
var volScratch = [];
function renderVolume(){
  if(!volTarget || !postActive || !aoEnabled || typeof FIXTURES === 'undefined') return false;
  volScratch.length = 0;
  for(var i = 0; i < FIXTURES.length; i++){
    if(typeof FIXTURE_DEAD !== 'undefined' && FIXTURE_DEAD[i]) continue;
    var f = FIXTURES[i];
    var dx = f[0] - camera.position.x, dz = f[2] - camera.position.z;
    volScratch.push([dx * dx + dz * dz, f]);
  }
  volScratch.sort(function(a, b){ return a[0] - b[0]; });
  for(var k = 0; k < VOL_LIGHTS; k++){
    if(k < volScratch.length){
      var p = volScratch[k][1];
      volLights[k].set(p[0], p[1], p[2], 9.0);
    } else volLights[k].set(0, -999, 0, 0.001);
  }
  /* the nearest boxes tall enough to cut a beam; anything shorter cannot reach up into one */
  if(typeof COL !== 'undefined'){
    volOccScratch.length = 0;
    for(var c = 0; c < COL.length; c++){
      var bx = COL[c];
      if(bx.ghost || (bx.max[1] - bx.min[1]) < 1.2) continue;
      var ox = (bx.min[0] + bx.max[0]) * 0.5 - camera.position.x;
      var oz = (bx.min[2] + bx.max[2]) * 0.5 - camera.position.z;
      volOccScratch.push([ox * ox + oz * oz, bx]);
    }
    volOccScratch.sort(function(a, b){ return a[0] - b[0]; });
    for(var q = 0; q < VOL_OCC; q++){
      if(q < volOccScratch.length){
        var ob = volOccScratch[q][1];
        volOccMin[q].set(ob.min[0], ob.min[1], ob.min[2]);
        volOccMax[q].set(ob.max[0], ob.max[1], ob.max[2]);
      } else { volOccMin[q].set(0, -9999, 0); volOccMax[q].set(0, -9998, 0); }
    }
  }
  volMat.uniforms.tDepth.value = aoDepthTarget.depthTexture;
  volMat.uniforms.uProjInv.value.copy(camera.projectionMatrixInverse);
  volMat.uniforms.uCamWorld.value.copy(camera.matrixWorld);
  volMat.uniforms.uRes.value.set(volTarget.width, volTarget.height);
  volMat.uniforms.uTime.value = (volMat.uniforms.uTime.value + 1.0) % 1000.0;
  postMesh.material = volMat;
  renderer.setRenderTarget(volTarget); renderer.render(postScene, postCam);
  postMesh.material = blurMat;
  blurMat.uniforms.tDiffuse.value = volTarget.texture; blurMat.uniforms.uDir.value.set(1 / volTarget.width, 0);
  renderer.setRenderTarget(volBlurTarget); renderer.render(postScene, postCam);
  blurMat.uniforms.tDiffuse.value = volBlurTarget.texture; blurMat.uniforms.uDir.value.set(0, 1 / volTarget.height);
  renderer.setRenderTarget(volTarget); renderer.render(postScene, postCam);
  postMat.uniforms.tVolume.value = volTarget.texture;
  postMat.uniforms.uVolume.value = VOL_AMOUNT;
  return true;
}
/* Particles, sprites and anything else transparent stay out of the depth prepass: the override
   material would draw them solid and they would occlude the world behind them. */
var aoHidden = [];
function aoHideTransparent(){
  aoHidden.length = 0;
  scene.traverse(function(o){
    if(!o.visible) return;
    var m = o.material;
    if(o.isPoints || o.isSprite || o.isLine || (m && (Array.isArray(m) ? (m[0] && m[0].transparent) : m.transparent))){
      aoHidden.push(o); o.visible = false;
    }
  });
}
function aoRestoreTransparent(){
  for(var i = 0; i < aoHidden.length; i++) aoHidden[i].visible = true;
  aoHidden.length = 0;
}
/* depth only, from the camera the frame is about to be drawn with */
function renderAODepth(){
  if(!aoEnabled || !aoDepthTarget || !postActive) return false;
  aoHideTransparent();
  scene.overrideMaterial = aoDepthMat;
  renderer.setRenderTarget(aoDepthTarget);
  renderer.clear(true, true, false);
  renderer.render(scene, camera);
  scene.overrideMaterial = null;
  aoRestoreTransparent();
  return true;
}
/* occlusion, then a separable blur to take the sampling noise back out of it */
function renderAO(){
  if(!aoEnabled || !aoTarget || !postActive) return false;
  ssaoMat.uniforms.tDepth.value = aoDepthTarget.depthTexture;
  ssaoMat.uniforms.uProj.value.copy(camera.projectionMatrix);
  ssaoMat.uniforms.uProjInv.value.copy(camera.projectionMatrixInverse);
  ssaoMat.uniforms.uRes.value.set(aoTarget.width, aoTarget.height);
  postMesh.material = ssaoMat;
  renderer.setRenderTarget(aoTarget); renderer.render(postScene, postCam);
  postMesh.material = blurMat;
  blurMat.uniforms.tDiffuse.value = aoTarget.texture; blurMat.uniforms.uDir.value.set(1 / aoTarget.width, 0);
  renderer.setRenderTarget(aoBlurTarget); renderer.render(postScene, postCam);
  blurMat.uniforms.tDiffuse.value = aoBlurTarget.texture; blurMat.uniforms.uDir.value.set(0, 1 / aoTarget.height);
  renderer.setRenderTarget(aoTarget); renderer.render(postScene, postCam);
  postMat.uniforms.tAO.value = aoTarget.texture;
  postMat.uniforms.uAO.value = AO_AMOUNT;
  return true;
}
postMat.uniforms.tVolume.value = volBlack;
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
  var cw = postActive ? Math.max(1, Math.floor(w / 16)) : 1, ch = postActive ? Math.max(1, Math.floor(h / 16)) : 1;
  if (bloomC && (bloomC.width !== cw || bloomC.height !== ch)) { bloomC.setSize(cw, ch); bloomD.setSize(cw, ch); }
  var aw = postActive ? Math.max(1, Math.floor(w / 2)) : 1, ah = postActive ? Math.max(1, Math.floor(h / 2)) : 1;
  if (aoTarget && (aoTarget.width !== aw || aoTarget.height !== ah)) {
    aoTarget.setSize(aw, ah); aoBlurTarget.setSize(aw, ah); aoDepthTarget.setSize(aw, ah);
  }
  if (volTarget && (volTarget.width !== aw || volTarget.height !== ah)) {
    volTarget.setSize(aw, ah); volBlurTarget.setSize(aw, ah);
  }
}
/* run after the scene and view model have been rendered into postTarget */
function renderPost() {
  if (!postTarget) return;
  /* None of these passes clear: each draws one full-screen quad with depthTest and depthWrite off
     and an opaque write, so it covers every texel of its target anyway. */
  if (bloomA) {
    var bw = bloomA.width, bh = bloomA.height;
    postMesh.material = brightMat; brightMat.uniforms.tDiffuse.value = postTarget.texture;
    renderer.setRenderTarget(bloomA); renderer.render(postScene, postCam);
    postMesh.material = blurMat;
    for (var pass = 0; pass < 2; pass++) {
      blurMat.uniforms.tDiffuse.value = bloomA.texture; blurMat.uniforms.uDir.value.set(1 / bw, 0);
      renderer.setRenderTarget(bloomB); renderer.render(postScene, postCam);
      blurMat.uniforms.tDiffuse.value = bloomB.texture; blurMat.uniforms.uDir.value.set(0, 1 / bh);
      renderer.setRenderTarget(bloomA); renderer.render(postScene, postCam);
    }
    postMat.uniforms.tBloom.value = bloomA.texture;
    if (bloomC) {
      /* the wide skirt: the tight result taken down to a sixteenth and blurred twice more, the
         second pass at a longer step so the halo reaches well past the light that made it */
      var cw2 = bloomC.width, ch2 = bloomC.height;
      blurMat.uniforms.tDiffuse.value = bloomA.texture; blurMat.uniforms.uDir.value.set(1 / cw2, 0);
      renderer.setRenderTarget(bloomC); renderer.render(postScene, postCam);
      blurMat.uniforms.tDiffuse.value = bloomC.texture; blurMat.uniforms.uDir.value.set(0, 1 / ch2);
      renderer.setRenderTarget(bloomD); renderer.render(postScene, postCam);
      blurMat.uniforms.tDiffuse.value = bloomD.texture; blurMat.uniforms.uDir.value.set(1.7 / cw2, 0);
      renderer.setRenderTarget(bloomC); renderer.render(postScene, postCam);
      blurMat.uniforms.tDiffuse.value = bloomC.texture; blurMat.uniforms.uDir.value.set(0, 1.7 / ch2);
      renderer.setRenderTarget(bloomD); renderer.render(postScene, postCam);
      postMat.uniforms.tBloomWide.value = bloomD.texture;
    }
  }
  postMat.uniforms.uTime.value = (postMat.uniforms.uTime.value + 1.0) % 1000.0;
  postMesh.material = postMat; postMat.uniforms.tDiffuse.value = postTarget.texture;
  renderer.setRenderTarget(null); renderer.render(postScene, postCam);
}
