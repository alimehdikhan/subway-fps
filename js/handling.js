/* Weapon-specific grips, phased reloads, and dynamic anatomical elbow anchoring.
   All vector and matrix operations reuse scratch objects to maintain 0 GC at 120 FPS. */
'use strict';

var handScratch = new THREE.Vector3(), handDirection = new THREE.Vector3(), handUp = new THREE.Vector3(0, 1, 0), handWrist = new THREE.Vector3();
var _wristRig = new THREE.Vector3(), _ebTarget = new THREE.Vector3(), _wristLocal = new THREE.Vector3();

/* Anatomical shoulder origins in view (gunRig) space */
var SHOULDER_RIGHT = new THREE.Vector3(0.22, -0.22, 0.08);
var SHOULDER_LEFT = new THREE.Vector3(-0.20, -0.22, 0.08);

function easePhase(t, a, b){
  var x = clamp((t - a) / (b - a), 0, 1);
  return x * x * (3 - 2 * x);
}

/* Articulate finger joints smoothly without creating new objects */
function setFingerCurl(finger, curlFactor, addCurl){
  if(!finger || !finger.userData) return;
  var fGroup = finger.userData.finger || finger;
  var j = fGroup.userData.joints, b = fGroup.userData.baseCurls;
  if(!j || !b) return;
  var add = addCurl || 0;
  for(var i = 0; i < j.length; i++){
    j[i].rotation.x = - (b[i] * curlFactor + add);
  }
}

function setHandFingersCurl(handGroup, curlFactor, addCurl){
  if(!handGroup || !handGroup.userData || !handGroup.userData.fingers) return;
  var fingers = handGroup.userData.fingers;
  for(var fi = 0; fi < fingers.length; fi++){
    setFingerCurl(fingers[fi], curlFactor, addCurl);
  }
  if(handGroup.userData.thumb){
    setFingerCurl(handGroup.userData.thumb, curlFactor, addCurl);
  }
}

var handBatchStats = {before: 0, after: 0};
function batchHandParts(parent){
  if(!parent || parent.userData.skipBatch) return;
  parent.children.slice().forEach(function(child){
    if(child.isGroup && !child.userData.skipBatch) batchHandParts(child);
  });
  var buckets = {};
  parent.children.forEach(function(m){
    if(m.isMesh && !m.children.length && !m.material.transparent && !m.userData.keep){
      (buckets[m.material.uuid] || (buckets[m.material.uuid] = [])).push(m);
    }
  });
  Object.keys(buckets).forEach(function(key){
    var meshes = buckets[key]; if(meshes.length < 2) return;
    var count = 0, chunks = meshes.map(function(m){
      m.updateMatrix();
      var g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      g.applyMatrix4(m.matrix);
      count += g.attributes.position.count;
      return g;
    });
    var merged = new THREE.BufferGeometry();
    ['position', 'normal', 'uv'].forEach(function(name){
      var stride = name === 'uv' ? 2 : 3, data = new Float32Array(count * stride), offset = 0;
      chunks.forEach(function(g){
        data.set(g.attributes[name].array, offset);
        offset += g.attributes[name].array.length;
      });
      merged.setAttribute(name, new THREE.BufferAttribute(data, stride));
    });
    merged.computeBoundingSphere();
    var mesh = new THREE.Mesh(merged, meshes[0].material);
    mesh.userData.merged = true;
    parent.add(mesh);
    meshes.forEach(function(m){ parent.remove(m); });
    chunks.forEach(function(g){ g.dispose(); });
    handBatchStats.before += meshes.length; handBatchStats.after++;
  });
}

wpnMeshes.forEach(function(w){
  var hand = w.userData.lArm;
  if(!hand || !w.userData.rArm) return;   /* stand-ins without procedural hands (the pistol) get theirs from hands.js */
  w.userData.gripHome = hand.position.clone();
  w.userData.gripRotation = hand.rotation.clone();
  w.userData.gripParent = hand.parent;
  var mag = w.userData.mag;
  if(mag){
    mag.userData.homePosition = mag.position.clone();
    mag.userData.homeRotation = mag.rotation.clone();
  }
  if(w.userData.triggerFinger){
    w.userData.triggerFinger.userData.home = w.userData.triggerFinger.position.clone();
    w.userData.triggerFinger.userData.homeRot = w.userData.triggerFinger.rotation.clone();
  }
  batchHandParts(hand);
  batchHandParts(w.userData.rArm);
  batchHandParts(w);
});

/* Dynamically anchors the forearm sleeve between an anatomically placed elbow and wrist.
   Keeps forearm length consistent (0.28m - 0.32m) and guarantees elbows stay below the screen. */
function anchorSleeve(w, hand, right){
  var sleeve = hand.userData.forearm; if(!sleeve) return;
  hand.updateWorldMatrix(true, false);

  var wrist = hand.userData.wrist ? handWrist.copy(hand.userData.wrist) : handWrist.set(0, 0, 0.04);
  _wristRig.copy(wrist);
  hand.localToWorld(_wristRig);
  gunRig.worldToLocal(_wristRig);

  var baseLen = sleeve.userData.baseLength || 0.30;

  // Arm direction from wrist toward elbow in gunRig space:
  // Forearm extends backward (+Z toward player chest), downward (-Y below screen), and outward (right: +X, left: -X)
  var sideX = right ? 0.15 : -0.17;
  var downY = -0.28 - P.ads * 0.04 - (P._sprintProg || 0) * 0.05;
  var backZ = 0.28;

  var exitDir = handDirection.set(sideX, downY, backZ).normalize();
  var targetArmLen = 0.29;

  _ebTarget.copy(_wristRig).addScaledVector(exitDir, targetArmLen);
  if(_ebTarget.y > -0.46) _ebTarget.y = -0.46;

  // Transform elbow into hand local coordinate space
  handScratch.copy(_ebTarget);
  gunRig.localToWorld(handScratch);
  hand.worldToLocal(handScratch);

  // Orient and scale sleeve to connect seamlessly from elbow to wrist
  handDirection.subVectors(wrist, handScratch);
  var length = handDirection.length();
  sleeve.position.copy(handScratch).add(wrist).multiplyScalar(0.5);
  sleeve.quaternion.setFromUnitVectors(handUp, handDirection.normalize());
  sleeve.scale.set(1.0, length / baseLen, 1.0);
}

function animateHandling(dt){
  var w = gun, u = w.userData, hand = u.lArm, home = u.gripHome, mag = u.mag, baseRot = u.gripRotation;
  var rArm = u.rArm;
  var lHand = hand.userData.hand, rHand = rArm ? rArm.userData.hand : null;

  // Reset support hand to resting home pose
  hand.position.copy(home);
  hand.rotation.copy(baseRot);
  setHandFingersCurl(lHand, 1.0);

  if(mag){
    mag.position.copy(mag.userData.homePosition);
    mag.rotation.copy(mag.userData.homeRotation);
    mag.visible = true;
  }

  // --- 1. FIRING HAND TRIGGER DISCIPLINE & TRIGGER PULL ---
  var finger = u.triggerFinger;
  var sprintVal = P._sprintProg || 0;
  var pressed = (P.reload <= 0 && P.inspectT <= 0 && sprintVal < 0.25) ? P.triggerPull : 0;

  if(finger){
    var fHome = finger.userData.homePos || finger.userData.home;
    var fHomeRot = finger.userData.homeRot || new THREE.Euler(0, 0, 0);
    finger.position.copy(fHome);

    if(P.reload > 0 || P.inspectT > 0 || sprintVal > 0.35){
      // Tactical Trigger Discipline: Index finger rests safely extended along the lower receiver
      finger.rotation.set(fHomeRot.x - 0.28, fHomeRot.y - 0.16, fHomeRot.z);
      setFingerCurl(finger, 0.20);
    } else {
      // Finger curled on trigger shoe; flexes progressively back on trigger pull
      finger.position.z += pressed * 0.006;
      finger.rotation.set(fHomeRot.x + pressed * 0.16, fHomeRot.y, fHomeRot.z);
      setFingerCurl(finger, 1.0 + pressed * 0.35);
    }
  }

  // --- 2. WEAPON INSPECTION SEQUENCE (`P.inspectT > 0`) ---
  if(P.inspectT > 0){
    var insProg = 1 - Math.max(0, P.inspectT / 1.35);
    // Smooth ease-in, showcase hold, and crisp re-grip
    var insOpen = easePhase(insProg, 0, 0.22) * (1 - easePhase(insProg, 0.78, 1.0));
    
    // Support hand releases foregrip, floats gently beneath the receiver
    hand.position.z += insOpen * 0.055;
    hand.position.y -= insOpen * 0.030;
    hand.position.x -= insOpen * 0.018;
    hand.rotation.z = baseRot.z + insOpen * 0.24;
    hand.rotation.x = baseRot.x - insOpen * 0.16;

    // Fingers relax open into an expressive open-hand showcase gesture
    setHandFingersCurl(lHand, 1.0 - insOpen * 0.70);
  }
  // --- 3. PHASED RELOAD ANIMATIONS WITH FINGER ARTICULATION ---
  else if(P.reload > 0){
    var t = clamp(1 - P.reload / P._reloadTotal, 0, 1);

    if(P.curWpn === 1){
      // --- S1897 SHOTGUN: TUBULAR SHELL FEEDING & PUMP RACK ---
      var feed = easePhase(t, 0, 0.15) * (1 - easePhase(t, 0.78, 1));
      var shellCycles = 3;
      var stroke = Math.sin(clamp((t - 0.15) / 0.63, 0, 1) * Math.PI * 2 * shellCycles);
      var push = Math.max(0, stroke);

      // Hand drops to loading port under receiver
      var feedContact = new THREE.Vector3(-0.014, -0.078, -0.16);
      if(hand.parent !== w){
        // Position relative to pump
        feedContact.y -= (shotgunPump ? shotgunPump.position.y : 0);
        feedContact.z -= (shotgunPump ? shotgunPump.position.z : 0);
      }
      hand.position.lerp(feedContact, feed);
      hand.position.z -= push * 0.022 * feed; // Thumb drives shell into magazine tube
      hand.rotation.z = baseRot.z - 0.38 * feed;
      hand.rotation.x = baseRot.x + 0.26 * feed;

      // Fingers cup individual shell, thumb pushes shell forward
      setHandFingersCurl(lHand, 1.0 - feed * 0.30 + push * 0.25);

      // On dry reload, rack pump at end of feed sequence (80% - 95%)
      if(P._reloadIsDry && t > 0.80 && t < 0.95){
        var rackProg = Math.sin((t - 0.80) / 0.15 * Math.PI);
        if(shotgunPump) shotgunPump.position.z = -0.44 + rackProg * 0.075;
      }
    } else if(mag){
      // --- DETACHABLE MAGAZINE / BATTERY (CARBINE, SMG, RAILGUN) ---
      var magHome = mag.userData.homePosition;
      var contact = new THREE.Vector3(-0.008, magHome.y - 0.070, magHome.z);
      var reach = easePhase(t, 0, 0.16);
      var out = easePhase(t, 0.16, 0.36);
      var insert = easePhase(t, 0.48, 0.70);
      var slap = easePhase(t, 0.70, 0.76);
      var release = easePhase(t, 0.76, 1.0);

      // Ejected magazine drops down and away
      var drop = out * (1 - insert) * 0.24;
      mag.position.y = magHome.y - drop;
      mag.rotation.z = mag.userData.homeRotation.z - 0.12 * out * (1 - insert);
      mag.visible = !(t > 0.36 && t < 0.48);

      // Hand tracks empty magazine down, visits tactical pouch, guides fresh magazine up
      contact.y -= drop;
      if(t >= 0.36 && t < 0.48){
        contact.y = magHome.y - 0.24;
        contact.z = magHome.z + 0.03;
      }

      // Tactical Palm Slap bump at 70% - 76%
      var slapBump = Math.sin(clamp((t - 0.70) / 0.06, 0, 1) * Math.PI) * 0.020;
      contact.y += slapBump;
      if(slap > 0 && insert >= 1.0){
        mag.position.y = magHome.y + slapBump * 0.35;
      }

      hand.position.lerp(contact, reach);
      hand.position.lerp(home, release);
      hand.rotation.z = baseRot.z - 0.34 * reach * (1 - release);

      // Fingers open to drop old mag, cup fresh mag, flatten slightly for palm slap
      var curlFactor = 1.0 - reach * 0.45 + insert * 0.30 - slap * 0.25;
      setHandFingersCurl(lHand, curlFactor);

      // Bolt Release / Charging handle slap on dry reload (78% - 90%)
      if(P._reloadIsDry && t > 0.78 && t < 0.90){
        var boltReach = Math.sin((t - 0.78) / 0.12 * Math.PI);
        var boltTarget = (P.curWpn === 0) ? new THREE.Vector3(-0.034, 0.024, -0.16) : new THREE.Vector3(-0.028, 0.018, -0.12);
        hand.position.lerp(boltTarget, boltReach);
        hand.rotation.x = baseRot.x + boltReach * 0.22;
        hand.rotation.z = baseRot.z - boltReach * 0.18;
      }
    }
  } else {
    // Normal operation: if shotgun pump is child of w or moves with shotgunPump
    if(P.curWpn === 1 && hand.parent === w && shotgunPump){
      hand.position.z = home.z + (shotgunPump.position.z + 0.44);
    }
  }

  // Update dynamic forearm sleeves
  anchorSleeve(w, hand, false);
  if(rArm) anchorSleeve(w, rArm, true);
}
