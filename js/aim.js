/* The optic and laser share the camera ray used by bullets. */
'use strict';
var aimVector=new THREE.Vector3(),aimTimer=0;
function updateAimReadout(dt){
  aimTimer-=dt;if(aimTimer>0)return;aimTimer=0.075;
  camera.updateMatrixWorld(true);camera.getWorldDirection(aimVector);
  var o=camera.position,d=aimVector;
  var distance=rayWorld(o.x,o.y,o.z,d.x,d.y,d.z),target=null;
  for(var i=0;i<enemies.length;i++){
    var e=enemies[i];if(e.dead)continue;var s=hitSpheres(e);
    var hit=Math.min(
      raySphere(o.x,o.y,o.z,d.x,d.y,d.z,s.hx,s.hy,s.hz,s.hr),
      raySphere(o.x,o.y,o.z,d.x,d.y,d.z,s.bx,s.by,s.bz,s.br),
      raySphere(o.x,o.y,o.z,d.x,d.y,d.z,s.lx,s.ly,s.lz,s.lr));
    if(hit<distance){distance=hit;target=e;}
  }
  P.aimDistance=distance;P.aimTarget=target;
  var status=P.reload>0?'RELOADING':P.fireCd>0?'CHARGING':P.ammo>0?'READY':'EMPTY';
  $('scopereadout').textContent=(distance>=199?'—':Math.round(distance))+' m · '+(target?'CONTACT':'RANGE')+' · '+status;
  $('sniper-scope').classList.toggle('on-target',!!target);
}
