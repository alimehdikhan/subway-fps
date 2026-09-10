/* Subway FPS — input.js
   Keyboard, mouse, touch controls, gyro, fullscreen and menu toggles.
   All game scripts share one global scope and load in the order listed in index.html. */
'use strict';

/* ============================ input ============================ */
var SENS=0.0022,dragging=null;
document.addEventListener('keydown',function(e){
  if(e.code==='Escape'||e.code==='KeyP'){
    if(G.state==='play'){e.preventDefault();pause();}
    else if(G.state==='pause'&&(e.code==='KeyP'||e.code==='Escape')){e.preventDefault();unpause();}
    return;
  }
  if(G.state!=='play')return;
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Tab'].indexOf(e.code)>=0)e.preventDefault();
  keys[e.code]=true;
  if(e.code==='KeyR')reload();
  if(e.code==='KeyG')throwNade();
  if(e.code==='Digit1')switchWeapon(0);
  if(e.code==='Digit2')switchWeapon(1);
  if(e.code==='Digit3')switchWeapon(2);
  if(e.code==='Digit4')switchWeapon(3);
  if(e.code==='Digit5')switchWeapon(4);
  if(e.code==='KeyQ')switchWeapon(P.lastWpn!==undefined?P.lastWpn:1);
  if(e.code==='KeyT'||e.code==='KeyI'||e.code==='KeyF'){
    if(P.inspectT<=0&&P.reload<=0&&P.switchT<=0){P.inspectT=1.35;sfxInspect();}
  }
});
document.addEventListener('keyup',function(e){keys[e.code]=false;});
document.addEventListener('mousemove',function(e){
  if(G.state!=='play')return;
  var s=SENS*aimSensitivity();
  if(document.pointerLockElement===canvas){
    P.yaw-=e.movementX*s;P.pitch=clamp(P.pitch-e.movementY*s,-1.3,1.3);
    mouseVelX+=e.movementX;mouseVelY+=e.movementY;
  }else if(dragging){
    P.yaw-=(e.clientX-dragging.x)*s*1.4;P.pitch=clamp(P.pitch-(e.clientY-dragging.y)*s*1.4,-1.3,1.3);
    dragging={x:e.clientX,y:e.clientY};
  }
});
canvas.addEventListener('mousedown',function(e){
  if(G.state!=='play')return;
  if(document.pointerLockElement!==canvas){grab();dragging={x:e.clientX,y:e.clientY};}
  if(e.button===0){mouseDown=true;}
  if(e.button===2)adsDown=true;
});
document.addEventListener('mouseup',function(e){
  if(e.button===0){mouseDown=false;dragging=null;}
  if(e.button===2)adsDown=false;
});
canvas.addEventListener('contextmenu',function(e){e.preventDefault();});
window.addEventListener('wheel',function(e){
  if(G.state==='play'){
    if(e.deltaY>0)switchWeapon((P.curWpn+1)%WEAPONS.length);
    else if(e.deltaY<0)switchWeapon((P.curWpn+WEAPONS.length-1)%WEAPONS.length);
  }
},{passive:true});
document.addEventListener('pointerlockchange',function(){
  if(!document.pointerLockElement&&G.state==='play'&&!coarse&&!touchControlsActive)pause();
});
window.addEventListener('blur',function(){pause();});
document.addEventListener('visibilitychange',function(){if(document.hidden)pause();});

/* ============================ Mobile & touch controls ============================ */
/* Touch is assumed when the primary pointer is coarse (phones, tablets) or when the device has
   touch points and no fine pointer at all. Hybrid laptops stay in mouse mode until the screen
   is actually touched. */
var anyFine = window.matchMedia('(any-pointer: fine)').matches;
var isTouchDevice = coarse || ((navigator.maxTouchPoints > 0 || ('ontouchstart' in window)) && !anyFine);
var touchMode = 'auto'; // Hybrid laptops switch when a touch is detected.
var touchControlsActive = isTouchDevice;
var hasPointerEvents = !!window.PointerEvent;

function updateTouchUI(){
  var show = (touchMode === 'on') || (touchMode === 'auto' && isTouchDevice);
  touchControlsActive = show;
  var tel = $('touch');
  if(tel) tel.className = (show && G.state === 'play') ? 'on' : '';
  document.body.classList.toggle('touch-active', show);
  document.body.classList.toggle('gyro-active', show && !!(typeof GYRO !== 'undefined' && GYRO.enabled));
  var label = touchMode === 'auto' ? 'Controls: Touch (Auto)' : (touchMode === 'on' ? 'Controls: Touch (Always)' : 'Controls: Mouse / Keyboard');
  if($('touch-toggle')) $('touch-toggle').textContent = label;
  if($('touch-toggle2')) $('touch-toggle2').textContent = label;
}

// A real touch on a hybrid device switches to touch controls
window.addEventListener('touchstart', function onFirstTouch(){
  isTouchDevice = true;
  if(touchMode === 'auto') updateTouchUI();
  window.removeEventListener('touchstart', onFirstTouch);
}, {passive:true});

/* Pointer Events where available, Touch Events on older phones (iOS 12, old Android WebViews).
   Handlers receive {id,x,y}. Touch targets keep implicit capture; pointers get explicit capture. */
function bindTouch(el, h){
  if(!el) return;
  if(hasPointerEvents){
    el.addEventListener('pointerdown', function(e){
      if(e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      if(h.capture !== false){ try{ el.setPointerCapture(e.pointerId); }catch(err){} }
      h.down({id:e.pointerId, x:e.clientX, y:e.clientY}, e);
    });
    if(h.move) el.addEventListener('pointermove', function(e){ h.move({id:e.pointerId, x:e.clientX, y:e.clientY}, e); });
    var pUp = function(e){ if(h.up) h.up({id:e.pointerId, x:e.clientX, y:e.clientY}, e); };
    el.addEventListener('pointerup', pUp);
    el.addEventListener('pointercancel', pUp);
    el.addEventListener('lostpointercapture', pUp);
  } else {
    var each = function(fn, prevent){ return function(e){
      if(prevent && e.cancelable) e.preventDefault();
      for(var i = 0; i < e.changedTouches.length; i++){
        var t = e.changedTouches[i];
        fn({id:t.identifier, x:t.clientX, y:t.clientY}, e);
      }
    }; };
    el.addEventListener('touchstart', each(h.down, true), {passive:false});
    if(h.move) el.addEventListener('touchmove', each(h.move, true), {passive:false});
    var tUp = each(function(p, e){ if(h.up) h.up(p, e); }, false);
    el.addEventListener('touchend', tUp);
    el.addEventListener('touchcancel', tUp);
    // mouse fallback so "Controls: Touch (Always)" still works with a mouse
    el.addEventListener('mousedown', function(e){ if(e.button !== 0) return; e.preventDefault(); h.down({id:'m', x:e.clientX, y:e.clientY}, e); });
    if(h.move) window.addEventListener('mousemove', function(e){ h.move({id:'m', x:e.clientX, y:e.clientY}, e); });
    window.addEventListener('mouseup', function(e){ if(h.up) h.up({id:'m', x:e.clientX, y:e.clientY}, e); });
  }
}
/* Momentary or toggle button: onDown once per press, onUp on release */
function bindButton(el, onDown, onUp){
  if(!el) return;
  var activeId = null;
  bindTouch(el, {
    down: function(p){ if(activeId !== null) return; activeId = p.id; el.classList.add('pressed'); if(onDown) onDown(); },
    up: function(p){ if(p.id !== activeId) return; activeId = null; el.classList.remove('pressed'); if(onUp) onUp(); }
  });
}

// Tactile Haptic Vibration System
function triggerHaptic(pattern){
  if(typeof navigator !== 'undefined' && navigator.vibrate){
    try { navigator.vibrate(pattern); } catch(e){}
  }
}

/* ============================ Mobile Gyroscope Aiming System ============================ */
var GYRO = {
  enabled: false,
  status: 'prompt', // 'prompt', 'granted', 'denied', 'unsupported'
  sens: 1.0,        // Look sensitivity multiplier (0.2 to 3.0)
  adsSens: 0.65,    // ADS scope sensitivity multiplier (0.2 to 1.5)
  smoothing: 0.25,  // EMA smoothing weight (0.0 to 0.8)
  deadzone: 0.005,  // Rate/angle deadzone to eliminate sensor jitter (0.0 to 0.025)
  invertY: false,   // Invert vertical pitch
  invertX: false,   // Invert horizontal yaw
  mode: 'always',   // 'always' | 'scope' - scope only lets the thumb do the big turns

  // Runtime tracking & filtering
  screenAngle: 0,
  lastBeta: null,
  lastGamma: null,
  lastAlpha: null,
  smoothYawRate: 0,
  smoothPitchRate: 0,
  hasMotionRate: false,
  listenerActive: false,
  lastEventT: null,   // wall clock of the last sensor event, for real dt
  lastMotionT: 0,     // last devicemotion with a usable rate, for the fallback watchdog
  hz: 0,              // measured sensor reporting rate, for the diagnostic readout
  events: 0,          // total sensor events seen
  rawA: null, rawB: null, rawG: null   // last raw axes, shown in the readout
};

/* Real elapsed time between sensor events. Neither devicemotion nor deviceorientation
   carries a timestamp that is comparable across browsers, so measure it here. */
function gyroEventDt(){
  var now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  var dt = (GYRO.lastEventT === null) ? (1 / 60) : (now - GYRO.lastEventT) / 1000;
  GYRO.lastEventT = now;
  dt = clamp(dt, 0.002, 0.1);
  /* measured reporting rate, for the readout in the settings panel */
  GYRO.hz += ((1 / dt) - GYRO.hz) * 0.05;
  GYRO.events++;
  return dt;
}

/* Live sensor readout. Gyro behaviour depends entirely on what a given handset
   reports, which cannot be seen from a desktop, so surface it while the panel is
   open: which event source is driving, how fast it arrives, and the current rate. */
var gyroDiagTimer = null;
function updateGyroDiag(){
  var el = $('gyro-diag'); if(!el) return;
  if(GYRO.status === 'unsupported'){ el.textContent = 'No motion sensor on this device.'; return; }
  if(!GYRO.listenerActive){ el.textContent = 'Sensor not started - enable gyro first.'; return; }
  var src = GYRO.hasMotionRate ? 'devicemotion' : 'deviceorientation';
  var age = GYRO.lastEventT === null ? Infinity :
    ((typeof performance !== 'undefined' ? performance.now() : Date.now()) - GYRO.lastEventT);
  if(!GYRO.events){ el.textContent = 'Waiting for the first sensor event...'; return; }
  if(age > 1000){ el.textContent = src + ' - stopped reporting (' + Math.round(age / 1000) + 's ago)'; return; }
  el.textContent = src + ' - ' + Math.round(GYRO.hz) + ' Hz - screen ' + GYRO.screenAngle +
    ' deg' + (GYRO.rawA === null ? '' :
      ' - raw a/b/g ' + GYRO.rawA.toFixed(0) + '/' + GYRO.rawB.toFixed(0) + '/' + GYRO.rawG.toFixed(0)) +
    ' - yaw ' + GYRO.smoothYawRate.toFixed(1) + ' pitch ' + GYRO.smoothPitchRate.toFixed(1) + ' deg/s';
}

// Check platform hardware support
function checkGyroSupport(){
  if(typeof window === 'undefined') return false;
  if(typeof DeviceMotionEvent !== 'undefined' || typeof DeviceOrientationEvent !== 'undefined'){
    return true;
  }
  return false;
}
if(!checkGyroSupport()){
  GYRO.status = 'unsupported';
}

function loadGyroSettings(){
  try{
    var raw = localStorage.getItem('lt-gyro-v2');
    if(raw){
      var d = JSON.parse(raw);
      if(typeof d.enabled === 'boolean') GYRO.enabled = d.enabled;
      if(typeof d.sens === 'number') GYRO.sens = clamp(d.sens, 0.2, 3.0);
      if(typeof d.adsSens === 'number') GYRO.adsSens = clamp(d.adsSens, 0.2, 1.5);
      if(typeof d.smoothing === 'number') GYRO.smoothing = clamp(d.smoothing, 0.0, 0.85);
      if(typeof d.deadzone === 'number') GYRO.deadzone = clamp(d.deadzone, 0.0, 0.03);
      if(typeof d.invertY === 'boolean') GYRO.invertY = d.invertY;
      if(typeof d.invertX === 'boolean') GYRO.invertX = d.invertX;
      if(d.mode === 'always' || d.mode === 'scope') GYRO.mode = d.mode;
    }
  }catch(e){}
  updateGyroScreenAngle();
}
function saveGyroSettings(){
  try{
    localStorage.setItem('lt-gyro-v2', JSON.stringify({
      enabled: GYRO.enabled,
      sens: GYRO.sens,
      adsSens: GYRO.adsSens,
      smoothing: GYRO.smoothing,
      deadzone: GYRO.deadzone,
      invertY: GYRO.invertY,
      invertX: GYRO.invertX,
      mode: GYRO.mode
    }));
  }catch(e){}
}
loadGyroSettings();

function getScreenAngle(){
  if(typeof window === 'undefined') return 0;
  if(screen.orientation && typeof screen.orientation.angle === 'number') return screen.orientation.angle;
  if(typeof window.orientation === 'number') return window.orientation;
  return 0;
}
function updateGyroScreenAngle(){
  var raw = getScreenAngle();
  var norm = ((raw % 360) + 360) % 360;
  if(norm !== GYRO.screenAngle){
    GYRO.screenAngle = norm;
    recenterGyro(); // Recalibrate zero baseline on rotation so camera doesn't jump
  }
}
window.addEventListener('orientationchange', updateGyroScreenAngle);
if(screen.orientation && screen.orientation.addEventListener){
  screen.orientation.addEventListener('change', updateGyroScreenAngle);
}

function recenterGyro(){
  GYRO.lastBeta = null;
  GYRO.lastGamma = null;
  GYRO.lastAlpha = null;
  GYRO.smoothYawRate = 0;
  GYRO.smoothPitchRate = 0;
  GYRO.lastEventT = null;   /* drop the timing baseline too, or the next event
                               integrates the whole gap since the last one */
}

/* Coming back from the background leaves a stale angle baseline and a long gap; both
   would land as one lurch on the first event. Start clean instead. */
document.addEventListener('visibilitychange', function(){
  if(!document.hidden) recenterGyro();
});

function updateGyroUI(){
  var active = GYRO.enabled && (GYRO.status === 'granted' || GYRO.status === 'prompt');
  document.body.classList.toggle('gyro-active', active);

  var label = 'Gyro: ' + (GYRO.status === 'unsupported' ? 'Unsupported' : (GYRO.status === 'denied' ? 'Denied' : (GYRO.enabled ? 'On' : 'Off')));
  ['gyro-toggle', 'gyro-toggle2'].forEach(function(id){
    var el = $(id);
    if(el){
      el.textContent = label;
      el.classList.toggle('active', GYRO.enabled);
    }
  });

  // Modal elements
  var badge = $('gyro-status-badge');
  if(badge){
    if(GYRO.status === 'unsupported'){
      badge.textContent = 'UNSUPPORTED';
      badge.className = 'gyro-badge unsupported';
    } else if(GYRO.status === 'denied'){
      badge.textContent = 'DENIED';
      badge.className = 'gyro-badge denied';
    } else if(GYRO.enabled){
      badge.textContent = 'ACTIVE';
      badge.className = 'gyro-badge active';
    } else {
      badge.textContent = 'READY';
      badge.className = 'gyro-badge ready';
    }
  }

  var enBtn = $('gyro-enable-btn');
  if(enBtn){
    enBtn.textContent = GYRO.enabled ? 'ENABLED' : 'ENABLE';
    enBtn.className = GYRO.enabled ? 'primary-mini' : 'secondary';
  }

  if($('gyro-sens-slider')) $('gyro-sens-slider').value = GYRO.sens;
  if($('gyro-sens-val')) $('gyro-sens-val').textContent = GYRO.sens.toFixed(1) + '×';

  if($('gyro-ads-sens-slider')) $('gyro-ads-sens-slider').value = GYRO.adsSens;
  if($('gyro-ads-sens-val')) $('gyro-ads-sens-val').textContent = GYRO.adsSens.toFixed(2) + '×';

  if($('gyro-smoothing-slider')) $('gyro-smoothing-slider').value = Math.round(GYRO.smoothing * 100);
  if($('gyro-smoothing-val')) $('gyro-smoothing-val').textContent = Math.round(GYRO.smoothing * 100) + '%';

  if($('gyro-deadzone-slider')) $('gyro-deadzone-slider').value = GYRO.deadzone;
  if($('gyro-deadzone-val')) $('gyro-deadzone-val').textContent = GYRO.deadzone.toFixed(3);

  if($('gyro-mode-val')) $('gyro-mode-val').textContent = (GYRO.mode === 'scope' ? 'Scope only' : 'Always');
  if($('gyro-invert-y')) $('gyro-invert-y').checked = GYRO.invertY;
  if($('gyro-invert-x')) $('gyro-invert-x').checked = GYRO.invertX;
}

/* The sensor half only filters. It maintains a smoothed angular RATE in deg/s and
   never touches the camera; applyGyroLook() integrates that rate once per rendered
   frame. Splitting it this way is what makes the aim independent of how often a
   given phone happens to fire its sensor. */
function processGyroMotion(rawYawRate, rawPitchRate, dt){
  if(!GYRO.enabled || G.state !== 'play') {
    GYRO.smoothYawRate = 0;
    GYRO.smoothPitchRate = 0;
    return;
  }

  /* Deadzone suppresses sensor noise and tabletop vibration. Rates are deg/s while the
     stored setting is a small fraction, so scale it into the same units - as written a
     0.005 deadzone against a deg/s rate filtered nothing at all. */
  var dz = GYRO.deadzone * 60;
  var yawRate = 0, pitchRate = 0;
  if(Math.abs(rawYawRate) > dz){
    yawRate = (rawYawRate > 0 ? 1 : -1) * (Math.abs(rawYawRate) - dz);
  }
  if(Math.abs(rawPitchRate) > dz){
    pitchRate = (rawPitchRate > 0 ? 1 : -1) * (Math.abs(rawPitchRate) - dz);
  }

  /* Time-corrected EMA. A fixed per-event weight smooths by however often the sensor
     fires, so one setting felt different on a 60Hz and a 120Hz phone. Read the setting
     as the weight it used to produce at 60Hz, turn that into a time constant, and
     re-derive the weight for this event's real dt. */
  var a60 = clamp(1.0 - GYRO.smoothing, 0.08, 1.0);
  var alpha = 1;
  if(a60 < 1){
    var tau = -(1 / 60) / Math.log(1 - a60);
    alpha = 1 - Math.exp(-dt / tau);
  }
  GYRO.smoothYawRate += (yawRate - GYRO.smoothYawRate) * alpha;
  GYRO.smoothPitchRate += (pitchRate - GYRO.smoothPitchRate) * alpha;
}

/* Integrate the smoothed rate into the camera, once per rendered frame.
   The rate is deg/s, so this frame's turn is rate * dt. The old code multiplied the
   rate by a constant inside the sensor handler and ignored dt entirely - it was a
   parameter the body never read, and every caller passed a hardcoded 0.016. That fixed
   the turn per EVENT rather than per second: a phone delivering devicemotion at 120Hz
   aimed twice as fast as one at 60Hz, and a frame that happened to receive no event
   did not turn at all.

   The scale is now 1:1 at sens 1.0 - turn the handset a degree, the view turns a
   degree - so the slider reads as a plain multiplier. Carrying the old constant
   forward (0.0034 per event x 60Hz = 0.204) preserved the arithmetic but not a usable
   feel: it worked out at 11.5x at the default and 34x at the top of the slider, where
   gyro aiming wants roughly 1-3x. On a handset whose sensor reported slower than 60Hz
   the old per-event bug had been quietly holding that number down. */
function applyGyroLook(dt){
  if(!GYRO.enabled || G.state !== 'play' || typeof P === 'undefined') return;
  if(!(dt > 0)) return;
  if(dt > 0.1) dt = 0.1;              /* after a stall, do not fling the camera */

  /* A held rate is only meaningful while the sensor is still reporting. Integrating
     the last known rate on every frame keeps turning the camera forever once a device
     goes quiet - which the old per-event code could not do, because no event simply
     meant no movement. Anything staler than ~7 frames is treated as stopped. */
  var nowT = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  if(GYRO.lastEventT === null || (nowT - GYRO.lastEventT) > 120){
    GYRO.smoothYawRate = 0; GYRO.smoothPitchRate = 0;
    return;
  }

  var baseSens = 0.0174533 * GYRO.sens;   /* deg -> rad: sens is the multiplier */
  var adsProg = P.ads || 0;
  /* Scope only: ride the ADS progression rather than switching at a threshold, so the
     gyro fades in as the sights come up instead of snapping on part-way through. */
  if(GYRO.mode === 'scope'){
    if(adsProg <= 0.001) return;
    baseSens *= adsProg;
  }
  var adsFactor = lerp(1.0, GYRO.adsSens, adsProg);
  if(P.curWpn === 3 && adsProg > 0.5) adsFactor *= 0.50;   /* railgun 3x optic */

  P.yaw += GYRO.smoothYawRate * baseSens * adsFactor * dt * (GYRO.invertX ? -1 : 1);
  P.pitch = clamp(P.pitch + GYRO.smoothPitchRate * baseSens * adsFactor * dt * (GYRO.invertY ? 1 : -1), -1.3, 1.3);
}

// Handler for DeviceMotionEvent (rotationRate in deg/s)
function handleDeviceMotion(e){
  if(!GYRO.enabled || G.state !== 'play') return;
  var rate = e.rotationRate;
  if(!rate || (rate.alpha === null && rate.beta === null && rate.gamma === null)) return;
  GYRO.hasMotionRate = true;
  GYRO.lastMotionT = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  var dt = gyroEventDt();

  var angle = GYRO.screenAngle;
  var rawYaw = 0, rawPitch = 0;

  /* rotationRate does NOT use the same axis letters as deviceorientation.
       deviceorientation:  alpha = Z, beta = X, gamma = Y
       rotationRate:       alpha = X, beta = Y, gamma = Z
     The spec originally documented rotationRate the first way; W3C PR
     w3c/deviceorientation#43 (Aug 2017) rewrote it to the second because
     "Chrome on Android, Firefox browser on Android, and Safari browser on iPhone,
     they all implement rotationRate as" x->alpha, y->beta, z->gamma. The current
     spec (CRD 2025-02-12) states it outright: "The alpha getter steps are to return
     the value of this's x axis rotation rate ... beta ... y axis ... gamma ... z axis".

     This block was written against the old text, so it read beta as X and gamma as Y.
     Gamma is the Z axis - roll, straight out of the screen - which meant that in
     landscape the view pitched when the handset was tilted like a steering wheel,
     while real pitch was being fed into yaw. X and Y are alpha and beta; the signs
     below are unchanged and match the deviceorientation path, so both sensor sources
     agree and switching between them cannot flip the controls. */
  var rateX = (rate.alpha || 0);   /* rotation rate about the device X axis */
  var rateY = (rate.beta || 0);    /* rotation rate about the device Y axis */
  GYRO.rawA = rateX; GYRO.rawB = rateY; GYRO.rawG = (rate.gamma || 0);

  // Angular rate mapping based on screen orientation
  if(angle === 90){
    // Landscape-Left (top left, home button right - standard landscape)
    rawYaw = -rateX;
    rawPitch = -rateY;
  } else if(angle === 270 || angle === -90){
    // Landscape-Right (top right, home button left)
    rawYaw = rateX;
    rawPitch = rateY;
  } else if(angle === 180){
    // Inverted portrait
    rawYaw = rateY;
    rawPitch = -rateX;
  } else {
    // Portrait (angle 0)
    rawYaw = -rateY;
    rawPitch = rateX;
  }

  processGyroMotion(rawYaw, rawPitch, dt);
}

// Fallback handler for DeviceOrientationEvent (euler angles beta, gamma)
function handleDeviceOrientation(e){
  /* Prefer devicemotion's rotationRate, but only while it is actually arriving. Some
     Android browsers stop delivering a usable rate after a permission prompt or a
     visibility change; latching this flag on for the rest of the session left gyro
     dead with the fallback permanently switched off. Half a second of silence hands
     control back to the orientation path. */
  if(GYRO.hasMotionRate){
    var mNow = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if(mNow - GYRO.lastMotionT < 500) return;
    GYRO.hasMotionRate = false;
  }
  if(!GYRO.enabled || G.state !== 'play'){
    GYRO.lastBeta = null;
    GYRO.lastGamma = null;
    return;
  }
  var b = e.beta;
  var g = e.gamma;
  if(b === null || g === null) return;

  if(GYRO.lastBeta !== null && GYRO.lastGamma !== null){
    var dBeta = b - GYRO.lastBeta;
    var dGamma = g - GYRO.lastGamma;

    // Filter out angle wrap-around discontinuities (> 35 deg jump)
    if(Math.abs(dBeta) > 35 || Math.abs(dGamma) > 35){
      dBeta = 0;
      dGamma = 0;
    }

    var angle = GYRO.screenAngle;
    var rawYaw = 0, rawPitch = 0;

    if(angle === 90){
      rawYaw = -dBeta;
      rawPitch = -dGamma;
    } else if(angle === 270 || angle === -90){
      rawYaw = dBeta;
      rawPitch = dGamma;
    } else if(angle === 180){
      rawYaw = dGamma;
      rawPitch = -dBeta;
    } else {
      rawYaw = -dGamma;
      rawPitch = dBeta;
    }

    /* beta/gamma are absolute angles, so these deltas are degrees-per-event. The
       filter and the integrator both work in deg/s, so convert before handing over -
       previously an angle delta was fed in as though it were already a rate. */
    var oDt = gyroEventDt();
    processGyroMotion(rawYaw / oDt, rawPitch / oDt, oDt);
  }

  GYRO.lastBeta = b;
  GYRO.lastGamma = g;
}

function startGyroListeners(){
  if(GYRO.listenerActive) return;
  GYRO.listenerActive = true;
  window.addEventListener('devicemotion', handleDeviceMotion, true);
  window.addEventListener('deviceorientation', handleDeviceOrientation, true);
}

// iOS Permission Request Flow (Must be called from user gesture)
function requestGyroPermission(onComplete){
  if(typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function'){
    DeviceMotionEvent.requestPermission().then(function(res){
      if(res === 'granted'){
        GYRO.status = 'granted';
        GYRO.enabled = true;
        saveGyroSettings();
        startGyroListeners();
        updateGyroUI();
        if(onComplete) onComplete(true);
      } else {
        GYRO.status = 'denied';
        GYRO.enabled = false;
        saveGyroSettings();
        updateGyroUI();
        toast('Motion sensor permission denied', 2800);
        if(onComplete) onComplete(false);
      }
    }).catch(function(err){
      GYRO.status = 'denied';
      GYRO.enabled = false;
      saveGyroSettings();
      updateGyroUI();
      if(onComplete) onComplete(false);
    });
  } else if(typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function'){
    DeviceOrientationEvent.requestPermission().then(function(res){
      if(res === 'granted'){
        GYRO.status = 'granted';
        GYRO.enabled = true;
        saveGyroSettings();
        startGyroListeners();
        updateGyroUI();
        if(onComplete) onComplete(true);
      } else {
        GYRO.status = 'denied';
        GYRO.enabled = false;
        saveGyroSettings();
        updateGyroUI();
        toast('Orientation permission denied', 2800);
        if(onComplete) onComplete(false);
      }
    }).catch(function(err){
      GYRO.status = 'denied';
      GYRO.enabled = false;
      saveGyroSettings();
      updateGyroUI();
      if(onComplete) onComplete(false);
    });
  } else if(checkGyroSupport()){
    // Android / Chrome / Desktop test harness
    GYRO.status = 'granted';
    GYRO.enabled = !GYRO.enabled;
    saveGyroSettings();
    startGyroListeners();
    updateGyroUI();
    if(onComplete) onComplete(true);
  } else {
    GYRO.status = 'unsupported';
    GYRO.enabled = false;
    saveGyroSettings();
    updateGyroUI();
    toast('Gyroscope not supported on this device', 2800);
    if(onComplete) onComplete(false);
  }
}

function toggleGyro(){
  if(GYRO.status === 'prompt' || (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function' && GYRO.status !== 'granted')){
    requestGyroPermission();
  } else if(GYRO.status === 'denied'){
    toast('Motion permission denied. Enable in Safari Settings.', 3200);
    openGyroModal();
  } else if(GYRO.status === 'unsupported'){
    toast('Gyroscope not supported on this device', 2500);
  } else {
    GYRO.enabled = !GYRO.enabled;
    saveGyroSettings();
    startGyroListeners();
    updateGyroUI();
    toast(GYRO.enabled ? 'Gyro Aiming: ON' : 'Gyro Aiming: OFF', 1800);
  }
}

function openGyroModal(){
  var m = $('gyro-modal');
  if(!m) return;
  m.hidden = false;
  updateGyroUI();
  updateGyroDiag();
  if(gyroDiagTimer) clearInterval(gyroDiagTimer);
  gyroDiagTimer = setInterval(updateGyroDiag, 250);
}
function closeGyroModal(){
  var m = $('gyro-modal');
  if(!m) return;
  m.hidden = true;
  if(gyroDiagTimer){ clearInterval(gyroDiagTimer); gyroDiagTimer = null; }
  saveGyroSettings();
  updateGyroUI();
}

// 1. Floating virtual joystick (left half of the screen)
var stick = $('stick'), knob = $('knob'), stickSprint = $('stick-sprint-lock');
var touchZoneLeft = $('touch-zone-left');
var stickId = null, stickOriginX = 0, stickOriginY = 0;
var stickMaxR = 52;
var sprintLocked = false;

function setSprintUI(on){
  if(stickSprint) stickSprint.classList.toggle('locked', on);
  if($('t-sprint')) $('t-sprint').classList.toggle('active', on);
}
function resetStick(){
  stickId = null; joy.x = 0; joy.y = 0;
  if(knob) knob.style.transform = '';
  if(stick){ stick.classList.remove('active'); stick.style.left = ''; stick.style.top = ''; stick.style.bottom = ''; }
  applyTouchPositions('stick');   /* a custom home position survives the float-and-release */
  sprintLocked=false;touchRun=false;setSprintUI(false);
}

var stickHandlers = {
  down: function(p){
    if(stickId !== null || G.state !== 'play' || !stick) return;
    stickId = p.id;
    stickOriginX = p.x; stickOriginY = p.y;
    var half = stick.offsetWidth ? stick.offsetWidth / 2 : 65;
    stick.style.bottom = 'auto';
    stick.style.left = (stickOriginX - half) + 'px';
    stick.style.top = (stickOriginY - half) + 'px';
    stick.classList.add('active');
  },
  move: function(p){
    if(p.id !== stickId || G.state !== 'play') return;
    var dx = p.x - stickOriginX, dy = p.y - stickOriginY;
    var dist = Math.hypot(dx, dy);
    if(dist > stickMaxR){ dx = dx / dist * stickMaxR; dy = dy / dist * stickMaxR; }
    if(dist < 7){ joy.x = 0; joy.y = 0; }
    else { var strength=clamp((dist-7)/(stickMaxR-7),0,1);var length=Math.hypot(dx,dy);joy.x=dx/length*strength;joy.y=dy/length*strength; }
    if(knob) knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    // push the stick all the way forward to lock sprint; pull back to release
    if(joy.y < -0.80 && Math.abs(joy.x) < 0.5){ touchRun = true; sprintLocked = true; setSprintUI(true); }
    else if(joy.y > -0.2 && sprintLocked){ sprintLocked = false; touchRun = false; setSprintUI(false); }
  },
  up: function(p){ if(p.id === stickId) resetStick(); }
};

// 2. Look / aim by dragging on the right half
var touchZoneRight = $('touch-zone-right');
var lookId = null, lookPt = null;
var lookScale = 1;
try{ var savedSens = localStorage.getItem('lt-look'); if(savedSens) lookScale = parseFloat(savedSens) || 1; }catch(err){}
function lookSens(){
  // the same swipe distance turns the same amount on a 5" phone and a 12" tablet
  var w = Math.max(480, window.innerWidth || 760);
  return 0.0034 * (760 / w) * lookScale * aimSensitivity();
}
var lookHandlers = {
  down: function(p){
    if(lookId !== null || G.state !== 'play') return;
    lookId = p.id; lookPt = {x:p.x, y:p.y};
  },
  move: function(p, e){
    if(e && e.pointerId === firePointerId) return;
    if(p.id !== lookId || !lookPt || G.state !== 'play') return;
    var s = lookSens();
    P.yaw -= (p.x - lookPt.x) * s;
    P.pitch = clamp(P.pitch - (p.y - lookPt.y) * s, -1.3, 1.3);
    lookPt = {x:p.x, y:p.y};
  },
  up: function(p){ if(p.id === lookId){ lookId = null; lookPt = null; } }
};
/* The two screen halves swap roles for the left-handed layout: whichever half hosts the
   action cluster also drives the look, the other half is the joystick. */
function handlersFor(zone){ return (zone === 'left') === (layoutMode !== 'left') ? stickHandlers : lookHandlers; }
function zoneDispatch(zone){
  return {
    down: function(p, e){ handlersFor(zone).down(p, e); },
    move: function(p, e){ handlersFor(zone).move(p, e); },
    up:   function(p, e){ handlersFor(zone).up(p, e); }
  };
}
bindTouch(touchZoneLeft, zoneDispatch('left'));
bindTouch(touchZoneRight, zoneDispatch('right'));

// 3. Fire button: hold to fire, drag on it to keep aiming
var fireTouchId = null, firePt = null;
var firePointerId = -1;
var fireBtn = $('t-fire');
bindTouch(fireBtn, {
  down: function(p, e){
    if(e) firePointerId = e.pointerId;
    if(fireTouchId !== null || G.state !== 'play') return;
    fireTouchId = p.id; firePt = {x:p.x, y:p.y};
    fireBtn.classList.add('active');
    mouseDown = true; triggerHaptic(15);
  },
  move: function(p){
    if(p.id !== fireTouchId || !firePt || G.state !== 'play') return;
    var s = lookSens() * 0.9;
    P.yaw -= (p.x - firePt.x) * s;
    P.pitch = clamp(P.pitch - (p.y - firePt.y) * s, -1.3, 1.3);
    firePt = {x:p.x, y:p.y};
  },
  up: function(p, e){
    if(e) firePointerId = -1;
    if(p.id !== fireTouchId) return;
    mouseDown = false; fireTouchId = null; firePt = null;
    fireBtn.classList.remove('active');
  }
});

// 4. Action buttons
var adsBtn = $('t-ads');
function setAds(on){ adsDown = on; if(adsBtn){adsBtn.classList.toggle('active', on);adsBtn.setAttribute('aria-pressed',String(on));} }
bindButton(adsBtn, function(){ if(G.state !== 'play') return; setAds(!adsDown); triggerHaptic(10); });

// Jump behaves like holding Space so the physics in update() stays the single source of truth
bindButton($('t-jump'), function(){ if(G.state === 'play'){ keys['Space'] = true; triggerHaptic(14); } },
                        function(){ keys['Space'] = false; });

// Crouch toggles; pressing it while sprinting triggers the tactical slide
var crouchBtn = $('t-crouch');
bindButton(crouchBtn, function(){
  if(G.state !== 'play') return;
  touchCrouch = !touchCrouch;
  touchSlideReq = true;
  crouchBtn.classList.toggle('active', touchCrouch);
  triggerHaptic(20);
});

bindButton($('t-reload'), function(){ if(G.state === 'play'){ reload(); triggerHaptic(12); } });
bindButton($('t-nade'), function(){ if(G.state === 'play') throwNade(); });

var switchBtn = $('t-switch');
function updateMobileWpnBadge(){
  var wpnNames = ['AK-47', 'S1897', 'M416', 'APEX', 'P-9'];
  var idx = (P.switchT > 0 && P.nextWpn !== undefined) ? P.nextWpn : P.curWpn;
  if($('t-wpn-num')) $('t-wpn-num').textContent = (idx + 1);
  if($('t-wpn-label')) $('t-wpn-label').textContent = wpnNames[idx] || 'WPN';
}
bindButton(switchBtn, function(){
  if(G.state !== 'play') return;
  switchWeapon((P.curWpn + 1) % WEAPONS.length);
  updateMobileWpnBadge();
  triggerHaptic(12);
});

bindButton($('t-inspect'), function(){ if(G.state === 'play'){ inspectWeapon(); triggerHaptic(10); } });

bindButton($('t-sprint'), function(){
  if(G.state !== 'play') return;
  touchRun = !touchRun; sprintLocked = touchRun;
  setSprintUI(touchRun); triggerHaptic(12);
});

/* Drop every held touch input; called on pause, game over and when returning to the title */
function resetTouchState(){
  resetStick();
  lookId = null; lookPt = null;
  fireTouchId = null; firePt = null;
  if(fireBtn) fireBtn.classList.remove('active');
  keys['Space'] = false;
  sprintLocked = false; touchRun = false; setSprintUI(false);
  touchCrouch = false; touchSlideReq = false;
  if(crouchBtn) crouchBtn.classList.remove('active');
  setAds(false);
  mouseDown = false;
}

// 5. Pause and fullscreen use click so the browser counts them as a user gesture
var pauseBtn = $('t-pause');
if(pauseBtn) pauseBtn.addEventListener('click', function(){ pause(); });

function isFullscreen(){ return !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement); }
function fullscreenSupported(){
  var el = document.documentElement;
  if(document.fullscreenEnabled === false || document.webkitFullscreenEnabled === false) return false;
  return !!(el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen);
}
var toastTimer = null;
function toast(msg, ms){
  var t = $('toast'); if(!t) return;
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(function(){ t.classList.remove('on'); }, ms || 4200);
}
function isIPhone(){ return /iPhone|iPod/.test(navigator.userAgent) && !window.MSStream; }
function lockLandscape(){
  try{
    if(window.screen.orientation && window.screen.orientation.lock){
      var q = window.screen.orientation.lock('landscape');
      if(q && q.catch) q.catch(function(){});
    }
  }catch(err){}
}
/* Fullscreen must be requested synchronously inside the user's tap, on whichever API the browser
   has, and the outcome has to be visible: phones that cannot do it (iPhone Safari, some in-app
   browsers) get told why instead of nothing happening. quiet=true is for automatic attempts. */
function enterFullscreen(quiet){
  var el = document.documentElement, p = null;
  if(!fullscreenSupported()){
    if(!quiet && !navigator.standalone){
      toast(isIPhone()
        ? 'Full screen is not available in Safari on iPhone. Use Share → Add to Home Screen, then launch the game from that icon to play full screen.'
        : 'Full screen is not available in this browser. Try opening the game in Chrome, Firefox or Samsung Internet.');
    }
    refreshFullscreenLabels();
    return;
  }
  try{
    if(el.requestFullscreen){
      try{ p = el.requestFullscreen({navigationUI:'hide'}); }catch(e1){ p = el.requestFullscreen(); }
    }
    else if(el.webkitRequestFullscreen) p = el.webkitRequestFullscreen();
    else if(el.mozRequestFullScreen) p = el.mozRequestFullScreen();
    else if(el.msRequestFullscreen) p = el.msRequestFullscreen();
  }catch(err){
    if(!quiet) toast('Full screen was blocked: ' + (err && err.message ? err.message : 'not allowed here'));
    return;
  }
  if(p && p.then){
    p.then(function(){ lockLandscape(); refreshFullscreenLabels(); }, function(err){
      if(!quiet) toast('Full screen was blocked' + (err && err.message ? ' (' + err.message + ')' : '') + '. Tap the ⛶ button during play to try again.');
      refreshFullscreenLabels();
    });
  } else {
    setTimeout(function(){ if(isFullscreen()) lockLandscape(); refreshFullscreenLabels(); }, 250);
  }
}
function exitFullscreen(){
  var p = null;
  try{
    if(document.exitFullscreen) p = document.exitFullscreen();
    else if(document.webkitExitFullscreen) p = document.webkitExitFullscreen();
    else if(document.mozCancelFullScreen) p = document.mozCancelFullScreen();
    else if(document.msExitFullscreen) p = document.msExitFullscreen();
  }catch(err){}
  if(p && p.catch) p.catch(function(){});
}
function toggleFullscreen(){ if(isFullscreen()) exitFullscreen(); else enterFullscreen(false); }
function refreshFullscreenLabels(){
  var on = isFullscreen(), sup = fullscreenSupported();
  ['fs-btn', 'fs-btn2'].forEach(function(id){
    var b = $(id); if(!b) return;
    b.textContent = on ? '⛶ Exit fullscreen' : '⛶ Fullscreen';
    b.classList.toggle('dim', !sup);
  });
  var t = $('t-fullscreen');
  if(t){ t.textContent = on ? '✕' : '⛶'; t.setAttribute('aria-label', on ? 'Exit fullscreen' : 'Fullscreen'); t.hidden = !sup; }
}
function onFullscreenChange(){
  // orientation lock is only honoured once fullscreen is actually active
  if(isFullscreen() && touchControlsActive) lockLandscape();
  refreshFullscreenLabels();
  setTimeout(resize, 50); setTimeout(resize, 350);
}
['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach(function(ev){ document.addEventListener(ev, onFullscreenChange); });
if($('t-fullscreen')) $('t-fullscreen').addEventListener('click', toggleFullscreen);
if($('fs-btn')) $('fs-btn').addEventListener('click', toggleFullscreen);
if($('fs-btn2')) $('fs-btn2').addEventListener('click', toggleFullscreen);
refreshFullscreenLabels();

// Portrait fallback for phones that cannot rotate (rotation lock, no fullscreen API)
if($('portrait-anyway')) $('portrait-anyway').addEventListener('click', function(){ document.body.classList.add('allow-portrait'); });

// Menu toggles
function cycleTouchMode(){
  if(touchMode === 'auto') touchMode = 'on';
  else if(touchMode === 'on') touchMode = 'off';
  else touchMode = 'auto';
  updateTouchUI();
}
if($('touch-toggle')) $('touch-toggle').addEventListener('click', cycleTouchMode);
if($('touch-toggle2')) $('touch-toggle2').addEventListener('click', cycleTouchMode);

function cycleGyroMode(){
  if(gyroMode === 'off') { gyroMode = 'on'; enableGyro(); }
  else if(gyroMode === 'on') { gyroMode = 'inverted'; }
  else { gyroMode = 'off'; }
  var glabel = 'Gyro: ' + (gyroMode === 'off' ? 'Off' : (gyroMode === 'on' ? 'Normal' : 'Inverted'));
  if($('gyro-toggle')) $('gyro-toggle').textContent = glabel;
  if($('gyro-toggle2')) $('gyro-toggle2').textContent = glabel;
}
if($('gyro-toggle')) $('gyro-toggle').addEventListener('click', cycleGyroMode);
if($('gyro-toggle2')) $('gyro-toggle2').addEventListener('click', cycleGyroMode);

var SENS_STEPS = [{k:'Low', v:0.7}, {k:'Normal', v:1}, {k:'High', v:1.4}, {k:'Very high', v:1.9}];
function sensIndex(){
  for(var i = 0; i < SENS_STEPS.length; i++) if(Math.abs(SENS_STEPS[i].v - lookScale) < 0.01) return i;
  return 1;
}
function refreshSensLabels(){
  var label = 'Look: ' + SENS_STEPS[sensIndex()].k;
  if($('sens-toggle')) $('sens-toggle').textContent = label;
  if($('sens-toggle2')) $('sens-toggle2').textContent = label;
}
function cycleSens(){
  lookScale = SENS_STEPS[(sensIndex() + 1) % SENS_STEPS.length].v;
  try{ localStorage.setItem('lt-look', String(lookScale)); }catch(err){}
  refreshSensLabels();
}
refreshSensLabels();
updateTouchUI();
if($('sens-toggle')) $('sens-toggle').addEventListener('click', cycleSens);
if($('sens-toggle2')) $('sens-toggle2').addEventListener('click', cycleSens);

// Stop the browser from scrolling, zooming or showing long-press menus while playing
document.addEventListener('touchmove', function(e){ if(G.state === 'play' && e.cancelable) e.preventDefault(); }, {passive:false});
document.addEventListener('gesturestart', function(e){ e.preventDefault(); });
document.addEventListener('gesturechange', function(e){ e.preventDefault(); });
document.addEventListener('dblclick', function(e){ if(G.state === 'play') e.preventDefault(); });
document.addEventListener('contextmenu', function(e){ if(G.state === 'play' || touchControlsActive) e.preventDefault(); });

// Make Weapon Dock Cards Tap-Friendly on Mobile / Touch
for(var wi = 0; wi < WEAPONS.length; wi++){
  (function(idx){
    var card = $('wc-' + idx);
    if(card){
      card.addEventListener('pointerdown', function(e){
        e.stopPropagation();
        if(G.state === 'play'){
          switchWeapon(idx);
          updateMobileWpnBadge();
          triggerHaptic(12);
        }
      });
    }
  })(wi);
}

$('start').addEventListener('click',function(){begin('story');});
$('start-endless').addEventListener('click',function(){begin('endless');});
$('again').addEventListener('click',function(){begin(G.mode);});
function refreshDiffLabel(){var t='Difficulty: '+DIFFS[diffKey].label;if($('diff-toggle'))$('diff-toggle').textContent=t;}
$('diff-toggle').addEventListener('click',function(){
  var order=['easy','normal','hard'];
  diffKey=order[(order.indexOf(diffKey)+1)%order.length];
  try{localStorage.setItem('lt-diff',diffKey);}catch(err){}
  refreshDiffLabel();
});
refreshDiffLabel();
$('resume').addEventListener('click',unpause);
$('quit').addEventListener('click',toTitle);
$('quit2').addEventListener('click',toTitle);
$('sound').addEventListener('click',toggleSound);
$('sound2').addEventListener('click',toggleSound);
['quality','quality2'].forEach(function(id){$(id).addEventListener('click',function(){cycleQuality();});});
var aimAssist=true;
try{aimAssist=localStorage.getItem('lt-assist')!=='off';}catch(e){}
function assistLabel(){['assist-toggle','assist-toggle2'].forEach(function(id){$(id).textContent='Touch aim assist: '+(aimAssist?'on':'off');$(id).setAttribute('aria-pressed',String(aimAssist));});}
['assist-toggle','assist-toggle2'].forEach(function(id){$(id).addEventListener('click',function(){aimAssist=!aimAssist;try{localStorage.setItem('lt-assist',aimAssist?'on':'off');}catch(e){}assistLabel();});});
assistLabel();
/* FPS counter toggle (both menus), remembered across sessions */
var showFps=true;
try{showFps=localStorage.getItem('lt-fps')!=='off';}catch(e){}
function fpsLabel(){
  ['fps-toggle','fps-toggle2'].forEach(function(id){if($(id)){$(id).textContent='FPS counter: '+(showFps?'on':'off');$(id).setAttribute('aria-pressed',String(showFps));}});
  if($('fpshud'))$('fpshud').classList.toggle('off',!showFps);
}
['fps-toggle','fps-toggle2'].forEach(function(id){if($(id))$(id).addEventListener('click',function(){showFps=!showFps;try{localStorage.setItem('lt-fps',showFps?'on':'off');}catch(e){}fpsLabel();});});
fpsLabel();
function aimSensitivity(){
  var zoom=Math.tan(camera.fov*Math.PI/360)/Math.tan(76*Math.PI/360);
  var wcfg=(typeof WEAPONS!=='undefined'&&typeof P!=='undefined')?WEAPONS[P.curWpn]:null;
  var sensMul=(wcfg&&wcfg.sensScale)?lerp(1.0,wcfg.sensScale,P.ads||0):1.0;
  return clamp(zoom,0.18,1.12)*sensMul*(touchControlsActive&&aimAssist&&P.aimTarget?0.72:1);
}

/* ============================ touch layout: handedness, button size, custom positions ============================ */
var layoutMode = 'right', btnSize = 'normal', layoutEdit = false;
try{
  var lm = localStorage.getItem('lt-layout'); if(lm === 'left' || lm === 'right') layoutMode = lm;
  var bs = localStorage.getItem('lt-btnsize'); if(bs === 'large' || bs === 'normal') btnSize = bs;
}catch(e){}
/* custom positions are stored per handedness as screen fractions, so they survive rotation */
var touchPos = {right:{}, left:{}};
try{ var tp = JSON.parse(localStorage.getItem('lt-touch-pos') || 'null'); if(tp && typeof tp === 'object'){ touchPos.right = tp.right || {}; touchPos.left = tp.left || {}; } }catch(e){}
var DRAGGABLE_IDS = ['t-fire', 't-ads', 't-jump', 't-crouch', 't-reload', 't-switch', 't-nade', 't-inspect', 't-sprint', 'stick'];
function saveTouchPos(){ try{ localStorage.setItem('lt-touch-pos', JSON.stringify(touchPos)); }catch(e){} }
function applyTouchPositions(onlyId){
  var pos = touchPos[layoutMode] || {}, W = window.innerWidth, H = window.innerHeight;
  DRAGGABLE_IDS.forEach(function(id){
    if(onlyId && id !== onlyId) return;
    var el = $(id); if(!el) return;
    var p = pos[id];
    if(!p){ el.style.left = ''; el.style.top = ''; el.style.right = ''; el.style.bottom = ''; return; }
    var w = el.offsetWidth || 50, h = el.offsetHeight || 50;
    el.style.left = Math.round(clamp(p[0] * W - w / 2, 0, Math.max(0, W - w))) + 'px';
    el.style.top = Math.round(clamp(p[1] * H - h / 2, 0, Math.max(0, H - h))) + 'px';
    el.style.right = 'auto'; el.style.bottom = 'auto';
  });
}
function applyLayoutClasses(){
  document.body.classList.toggle('layout-left', layoutMode === 'left');
  document.body.classList.toggle('btn-large', btnSize === 'large');
  var l = 'Layout: ' + (layoutMode === 'left' ? 'Left-handed' : 'Right-handed');
  var b = 'Buttons: ' + (btnSize === 'large' ? 'Large' : 'Normal');
  ['layout-toggle', 'layout-toggle2'].forEach(function(id){ if($(id)) $(id).textContent = l; });
  ['btnsize-toggle', 'btnsize-toggle2'].forEach(function(id){ if($(id)) $(id).textContent = b; });
  applyTouchPositions();
}
function cycleLayout(){
  layoutMode = layoutMode === 'left' ? 'right' : 'left';
  try{ localStorage.setItem('lt-layout', layoutMode); }catch(e){}
  resetTouchState(); applyLayoutClasses();
}
function cycleBtnSize(){
  btnSize = btnSize === 'large' ? 'normal' : 'large';
  try{ localStorage.setItem('lt-btnsize', btnSize); }catch(e){}
  applyLayoutClasses();
}
['layout-toggle', 'layout-toggle2'].forEach(function(id){ if($(id)) $(id).addEventListener('click', cycleLayout); });
['btnsize-toggle', 'btnsize-toggle2'].forEach(function(id){ if($(id)) $(id).addEventListener('click', cycleBtnSize); });
window.addEventListener('resize', function(){ applyTouchPositions(); });
applyLayoutClasses();

/* Drag-to-arrange editor, opened from the pause menu. The game stays paused; every button and the
   joystick can be dragged, Save keeps the positions, Reset restores the preset, Cancel discards. */
var dragState = null, editBackup = null;
function enterLayoutEdit(){
  if(G.state !== 'pause') return;
  layoutEdit = true; editBackup = JSON.stringify(touchPos[layoutMode] || {});
  document.body.classList.add('layout-edit');
  $('paused').hidden = true; $('touch').className = 'on';
  updateMobileWpnBadge(); applyTouchPositions();
}
function exitLayoutEdit(save){
  if(!layoutEdit) return;
  if(save) saveTouchPos(); else touchPos[layoutMode] = JSON.parse(editBackup || '{}');
  layoutEdit = false; dragState = null;
  document.body.classList.remove('layout-edit');
  $('touch').className = ''; $('paused').hidden = false;
  applyTouchPositions(); resetTouchState();
  if(save) toast('Touch layout saved', 2200);
}
function resetLayoutPositions(){ touchPos[layoutMode] = {}; applyTouchPositions(); }
if($('edit-layout')) $('edit-layout').addEventListener('click', enterLayoutEdit);
if($('layout-save')) $('layout-save').addEventListener('click', function(){ exitLayoutEdit(true); });
if($('layout-reset')) $('layout-reset').addEventListener('click', resetLayoutPositions);
if($('layout-cancel')) $('layout-cancel').addEventListener('click', function(){ exitLayoutEdit(false); });
(function(){
  var root = $('touch'); if(!root || !hasPointerEvents) return;
  /* capture-phase listeners run before the buttons' own handlers, so in edit mode a press moves
     the control instead of firing it */
  root.addEventListener('pointerdown', function(e){
    if(!layoutEdit) return;
    e.stopPropagation(); e.preventDefault();
    var el = e.target && e.target.closest ? e.target.closest('.tbtn:not(.tbtn-top), #stick') : null;
    if(!el || DRAGGABLE_IDS.indexOf(el.id) < 0) return;
    var r = el.getBoundingClientRect();
    dragState = {id: el.id, el: el, pid: e.pointerId, dx: e.clientX - (r.left + r.width / 2), dy: e.clientY - (r.top + r.height / 2)};
    el.classList.add('dragging');
    try{ root.setPointerCapture(e.pointerId); }catch(err){}
  }, true);
  root.addEventListener('pointermove', function(e){
    if(!layoutEdit) return; e.stopPropagation();
    if(!dragState || e.pointerId !== dragState.pid) return;
    var W = window.innerWidth, H = window.innerHeight, cx = e.clientX - dragState.dx, cy = e.clientY - dragState.dy;
    touchPos[layoutMode][dragState.id] = [clamp(cx / W, 0.02, 0.98), clamp(cy / H, 0.02, 0.98)];
    applyTouchPositions(dragState.id);
  }, true);
  function end(e){
    if(!layoutEdit) return; e.stopPropagation();
    if(dragState && e.pointerId === dragState.pid){ dragState.el.classList.remove('dragging'); dragState = null; }
  }
  root.addEventListener('pointerup', end, true);
  root.addEventListener('pointercancel', end, true);
})();

/* ============================ Gyro UI & Modal Event Bindings ============================ */
['gyro-toggle', 'gyro-toggle2'].forEach(function(id){
  var btn = $(id);
  if(btn) btn.addEventListener('click', toggleGyro);
});
['gyro-settings', 'gyro-settings2'].forEach(function(id){
  var btn = $(id);
  if(btn) btn.addEventListener('click', openGyroModal);
});

if($('gyro-mode-toggle')) $('gyro-mode-toggle').addEventListener('click', function(){
  GYRO.mode = (GYRO.mode === 'scope' ? 'always' : 'scope');
  GYRO.smoothYawRate = 0; GYRO.smoothPitchRate = 0;
  saveGyroSettings(); updateGyroUI();
});
if($('gyro-close')) $('gyro-close').addEventListener('click', closeGyroModal);
if($('gyro-done-btn')) $('gyro-done-btn').addEventListener('click', closeGyroModal);
if($('gyro-enable-btn')) $('gyro-enable-btn').addEventListener('click', toggleGyro);

if($('gyro-recenter-btn')) $('gyro-recenter-btn').addEventListener('click', function(){
  recenterGyro();
  toast('Gyro Calibrated & Recentered', 1800);
});
if($('t-gyro-recenter')) $('t-gyro-recenter').addEventListener('click', function(e){
  e.preventDefault(); e.stopPropagation();
  recenterGyro();
  triggerHaptic(30);
  toast('Gyro Recentered', 1200);
});

// Modal Sliders & Checkboxes
if($('gyro-sens-slider')) $('gyro-sens-slider').addEventListener('input', function(e){
  GYRO.sens = parseFloat(e.target.value) || 1.0;
  if($('gyro-sens-val')) $('gyro-sens-val').textContent = GYRO.sens.toFixed(1) + '×';
  saveGyroSettings();
});
if($('gyro-ads-sens-slider')) $('gyro-ads-sens-slider').addEventListener('input', function(e){
  GYRO.adsSens = parseFloat(e.target.value) || 0.65;
  if($('gyro-ads-sens-val')) $('gyro-ads-sens-val').textContent = GYRO.adsSens.toFixed(2) + '×';
  saveGyroSettings();
});
if($('gyro-smoothing-slider')) $('gyro-smoothing-slider').addEventListener('input', function(e){
  GYRO.smoothing = (parseFloat(e.target.value) || 25) / 100;
  if($('gyro-smoothing-val')) $('gyro-smoothing-val').textContent = Math.round(GYRO.smoothing * 100) + '%';
  saveGyroSettings();
});
if($('gyro-deadzone-slider')) $('gyro-deadzone-slider').addEventListener('input', function(e){
  GYRO.deadzone = parseFloat(e.target.value) || 0.005;
  if($('gyro-deadzone-val')) $('gyro-deadzone-val').textContent = GYRO.deadzone.toFixed(3);
  saveGyroSettings();
});
if($('gyro-invert-y')) $('gyro-invert-y').addEventListener('change', function(e){
  GYRO.invertY = !!e.target.checked;
  saveGyroSettings();
});
if($('gyro-invert-x')) $('gyro-invert-x').addEventListener('change', function(e){
  GYRO.invertX = !!e.target.checked;
  saveGyroSettings();
});

if(GYRO.enabled){
  startGyroListeners();
}
updateGyroUI();


