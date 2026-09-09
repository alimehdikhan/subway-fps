/* Last Train — audio.js
   Web Audio synthesis: every sound effect, the ambience bed and positional playback.
   All game scripts share one global scope and load in the order listed in index.html. */
'use strict';

/* ============================ audio ============================ */
var actx=null,bus=null,soundOn=true,rumbleGain=null;
function audioOn(){
  try{
    if(!actx){
      actx=new (window.AudioContext||window.webkitAudioContext)();
      if(!window._noiseBuffer && actx){
        var _nbLen = Math.floor(actx.sampleRate * 2);
        window._noiseBuffer = actx.createBuffer(1, _nbLen, actx.sampleRate);
        var _nbData = window._noiseBuffer.getChannelData(0);
        for(var i = 0; i < _nbLen; i++) _nbData[i] = Math.random() * 2 - 1;
      }
      bus=actx.createGain();bus.gain.value=soundOn?0.3:0;bus.connect(actx.destination);
      /* station hum */
      var o=actx.createOscillator(),g=actx.createGain(),f=actx.createBiquadFilter();
      o.type='sawtooth';o.frequency.value=41;f.type='lowpass';f.frequency.value=160;
      g.gain.value=0.07;o.connect(f);f.connect(g);g.connect(bus);o.start();
      rumbleGain=actx.createGain();rumbleGain.gain.value=0;rumbleGain.connect(bus);
    }
    if(actx.state==='suspended')actx.resume();
    decodeShots();
  }catch(e){}
}
/* ============================ recorded gunshots ============================
   Real shot recordings for the weapons that have one; the rest keep the synthesised report. The
   files are fetched as soon as the page loads (no user gesture needed for that) and decoded once
   the audio context exists, which cannot happen until the player interacts. If a sample is missing
   or still decoding, sfxShot falls back to the synth, so sound never simply stops. */
var SHOT_FILES={0:'audio/akm.wav',1:'audio/s1897.wav',2:'audio/m416.wav',3:'audio/sniper.mp3',4:'audio/pistol.mp3'};
var SHOT_GAIN={0:0.80,1:0.90,2:0.80,3:0.95,4:0.75};
/* the M416 file is already an M416, so it plays at its own pitch; only the two borrowed
   recordings are shifted at all */
var SHOT_RATE={0:1.0,1:1.0,2:1.0,3:0.96,4:1.06};
/* The AKM, M416 and S1897 files are single reports, so they play whole. The two older files are
   strings of several shots — the AK one holds six and the pistol eight — and playing a whole file
   per trigger pull fired the entire magazine at once, so those carry the measured offset and
   length of ONE clean report. */
var SHOT_CLIP={
  'audio/akm.wav'   :{at:0,dur:0.38},   /* focused AKM single fire: crack at 0, tail gone by 0.38 */
  'audio/m416.wav'  :{at:0,dur:0.34},   /* focused single-fire take: the whole file is one report */
  'audio/s1897.wav' :{at:0,dur:0.82},
  'audio/pistol.mp3':{at:0.125,dur:0.46},
  'audio/sniper.mp3':{at:0.080,dur:1.30}          /* the report plus its echo off the tunnel */
};
/* One audible report per bullet: a new shot takes over from the previous one on that weapon
   instead of layering on top of it, so ten rounds of automatic fire are ten cracks rather than a
   pile of overlapping tails. The outgoing voice is faded over a few milliseconds, not cut, so the
   handover is inaudible; the last round of a burst still rings out in full. */
var SHOT_VOICES=1;
var SHOT_HANDOVER=0.035;
/* Recorded explosion, shared by grenades, red barrels and charger drones, played through whatever
   `bus` is current so sfxAt's pan and distance gain apply to it as they do to the synth effects.
   Declared up here because the preloader below builds its fetch list from these names: left further
   down the file, var hoisting handed it `undefined` and the request went to /undefined. */
var BLAST_FILE='audio/grenade.wav';
var BLAST_GAIN=0.95,BLAST_DUR=2.4;
var shotVoices={};
var shotRaw={},shotBuf={};
/* ---- shot-to-shot variation for the AK-47 --------------------------------------------------
   One recording retriggered per bullet makes held fire sound like a loop, because every crack is
   the identical waveform. The pack's ten-round automatic take fixes that: its rounds correlate
   with each other at only 0.13-0.29, so they are ten separate reports of the same gun rather than
   one report repeated. Rounds 1-8 are mid-burst reports and each has only 100 ms of room before
   the next round's attack, so used raw they would end abruptly; buildBurstVariants takes 92 ms of
   body from each and crossfades it into the decay of the tenth round, the one report in the take
   that rings out, giving eight complete reports with a real tail. Built once, off the decoded
   file, so a shot costs no more than it did before. */
var BURST_FILE='audio/akm_auto.wav';
var BURST_WPN=0;                     /* the AK-47 */
var BURST_ROUNDS=[1,2,3,4,5,6,7,8];  /* round 0 is a cold first shot and round 9 is the tail donor */
var BURST_TAIL_ROUND=9;
var BURST_SPACING=0.100;             /* the take's cyclic rate: a round every 100 ms */
var BURST_BODY=0.092;                /* kept clear of the next round's attack at +100 ms */
var BURST_XFADE=0.008;
var BURST_TAIL_END=1.140;            /* round 9 attacks at 0.900 and is inaudible by 1.106 */
var BURST_GAP=0.22;                  /* a round this soon after the last one is the same burst */
var burstBufs=null,burstNext=0,lastShotT={};
function buildBurstVariants(){
  var src=shotBuf[BURST_FILE];
  if(burstBufs||!src||!actx)return;
  try{
    var sr=src.sampleRate,ch=src.numberOfChannels;
    var body=Math.round(sr*BURST_BODY),xf=Math.round(sr*BURST_XFADE);
    var t0=Math.round(sr*(BURST_TAIL_ROUND*BURST_SPACING+BURST_BODY));  /* the same point in round 9's decay */
    var t1=Math.min(src.length,Math.round(sr*BURST_TAIL_END));
    var tail=t1-t0,out=[];
    if(tail<=xf||body<=xf)return;
    for(var r=0;r<BURST_ROUNDS.length;r++){
      var on=Math.round(sr*BURST_ROUNDS[r]*BURST_SPACING);
      if(on+body>src.length)break;
      var buf=actx.createBuffer(ch,body+tail-xf,sr);
      for(var c=0;c<ch;c++){
        var d=buf.getChannelData(c),v=src.getChannelData(c),i;
        for(i=0;i<body-xf;i++)d[i]=v[on+i];
        for(i=0;i<xf;i++){                /* equal power, so the join holds its level */
          var a=Math.cos(0.5*Math.PI*i/xf),b=Math.sin(0.5*Math.PI*i/xf);
          d[body-xf+i]=v[on+body-xf+i]*a+v[t0+i]*b;
        }
        for(i=xf;i<tail;i++)d[body-xf+i]=v[t0+i];
      }
      out.push(buf);
    }
    if(out.length)burstBufs=out;
  }catch(e){}
}
(function preloadShots(){
  if(typeof fetch!=='function')return;
  var seen={};
  Object.keys(SHOT_FILES).map(function(k){return SHOT_FILES[k];}).concat([BURST_FILE,BLAST_FILE]).forEach(function(url){
    if(seen[url])return;seen[url]=true;
    fetch(url).then(function(r){return r.ok?r.arrayBuffer():null;}).then(function(ab){
      if(!ab)return;
      shotRaw[url]=ab;
      /* a file that lands after the audio context already exists has to be decoded here, or it
         would sit as raw bytes forever and the weapon would keep falling back to the synth */
      if(actx)decodeShots();
    }).catch(function(){});
  });
})();
function decodeShots(){
  if(!actx)return;
  Object.keys(shotRaw).forEach(function(url){
    var ab=shotRaw[url];if(!ab)return;
    shotRaw[url]=null;
    try{
      var done=function(buf){shotBuf[url]=buf;buildBurstVariants();};
      var p=actx.decodeAudioData(ab,done,function(){});
      if(p&&p.then)p.then(done).catch(function(){});
    }catch(e){}
  });
}
/* returns true when a recorded shot was played */
function playShotSample(wIdx){
  var url=SHOT_FILES[wIdx];
  if(!url||!actx||!soundOn||!shotBuf[url])return false;
  var clip=SHOT_CLIP[url]||{at:0,dur:0.4},t=actx.currentTime,buf=shotBuf[url];
  /* Second and later rounds of a held burst come off the automatic take, so no two cracks running
     are the same waveform; the opening round keeps the dedicated single-fire report. The step is
     one or two so eight takes never settle into an audible cycle, and never repeat back to back. */
  var held=(t-(lastShotT[wIdx]||-1e9))<BURST_GAP;
  lastShotT[wIdx]=t;
  if(wIdx===BURST_WPN&&held&&burstBufs){
    buf=burstBufs[burstNext];
    burstNext=(burstNext+1+(Math.random()<0.34?1:0))%burstBufs.length;
    clip={at:0,dur:buf.duration};
  }
  var rate=(SHOT_RATE[wIdx]||1)*(0.985+Math.random()*0.03);
  var len=clip.dur/rate,fade=Math.min(0.05,len*0.3);
  var src=actx.createBufferSource(),g=actx.createGain();
  src.buffer=buf;src.playbackRate.value=rate;
  g.gain.setValueAtTime(SHOT_GAIN[wIdx]||0.8,t);
  g.gain.setValueAtTime(SHOT_GAIN[wIdx]||0.8,t+len-fade);
  g.gain.linearRampToValueAtTime(0.0001,t+len);   /* ramp the cut so the clip never ends on a click */
  src.connect(g);g.connect(bus);
  src.start(t,clip.at,clip.dur);
  var live=shotVoices[wIdx]||(shotVoices[wIdx]=[]);
  live.push({src:src,g:g});
  src.onended=function(){var i=live.indexOf(this._v);if(i>=0)live.splice(i,1);};
  src._v=live[live.length-1];
  while(live.length>SHOT_VOICES){
    var old=live.shift();
    try{old.g.gain.cancelScheduledValues(t);old.g.gain.setValueAtTime(old.g.gain.value,t);
        old.g.gain.linearRampToValueAtTime(0.0001,t+SHOT_HANDOVER);old.src.stop(t+SHOT_HANDOVER+0.01);}catch(e){}
  }
  return true;
}
function beep(freq,dur,type,vol,to){
  if(!actx||!soundOn)return;
  var o=actx.createOscillator(),g=actx.createGain(),t=actx.currentTime;
  o.type=type||'sine';o.frequency.setValueAtTime(freq,t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20,to||freq),t+dur);
  g.gain.setValueAtTime(vol||0.2,t);g.gain.exponentialRampToValueAtTime(0.001,t+dur);
  o.connect(g);g.connect(bus);o.start(t);o.stop(t+dur);
}
function noiseBurst(dur,cut,vol,sweep){
  if(!actx||!soundOn)return;
  var buf = window._noiseBuffer || actx.createBuffer(1, Math.floor(actx.sampleRate*dur), actx.sampleRate);
  if(!window._noiseBuffer){ var d=buf.getChannelData(0); for(var i=0;i<d.length;i++) d[i]=Math.random()*2-1; }
  var src=actx.createBufferSource(),f=actx.createBiquadFilter(),g=actx.createGain(),t=actx.currentTime;
  src.buffer=buf;f.type='lowpass';f.frequency.setValueAtTime(cut,t);
  if(sweep)f.frequency.exponentialRampToValueAtTime(Math.max(120,sweep),t+dur);
  g.gain.value=vol;src.connect(f);f.connect(g);g.connect(bus);src.start(actx.currentTime, Math.random() * 1.5, dur);
}
/* Positional playback: any synchronous sfx function can be routed through a stereo pan +
   distance gain relative to where the player is standing and looking. Sounds behind the
   player are slightly muffled so the ear can tell front from back. */
var spatialMax=34;
function sfxAt(x,z,fn,a,b,c){
  if(!actx||!soundOn||!fn)return;
  var dx=x-P.x,dz=z-P.z,dist=Math.hypot(dx,dz);
  if(dist>spatialMax)return;
  var nx=dist>0.01?dx/dist:0,nz=dist>0.01?dz/dist:0;
  var rx=Math.cos(P.yaw),rz=-Math.sin(P.yaw);           /* camera right vector (YXZ order) */
  var fx=-Math.sin(P.yaw),fz=-Math.cos(P.yaw);          /* camera forward */
  var pan=clamp((nx*rx+nz*rz)*0.85,-0.85,0.85);
  var facing=nx*fx+nz*fz;                                /* 1 in front, -1 behind */
  var gainV=clamp(Math.pow(clamp(1-dist/spatialMax,0,1),1.3),0.08,1);
  var realBus=bus;
  try{
    var g=actx.createGain();g.gain.value=gainV;
    var out=g;
    if(actx.createStereoPanner){var pn=actx.createStereoPanner();pn.pan.value=pan;g.connect(pn);out=pn;}
    if(facing<-0.2){var lp=actx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=lerp(6000,1600,-facing);out.connect(lp);out=lp;}
    out.connect(realBus);
    bus=g;fn(a,b,c);
  }catch(e){}
  bus=realBus;
}
function sfxChargerTick(close){
  if(!actx||!soundOn)return;
  beep(close?1480:1120,0.03,'square',close?0.22:0.14,close?1700:1250);
}
function sfxShieldHit(){
  if(!actx||!soundOn)return;
  beep(1900,0.05,'sine',0.20,900);noiseBurst(0.03,5200,0.14,2000);
}
function sfxStomp(){
  if(!actx||!soundOn)return;
  beep(62,0.10,'triangle',0.30,28);noiseBurst(0.06,420,0.22);
}
function sfxNadeThrow(){
  if(!actx||!soundOn)return;
  beep(760,0.04,'square',0.14,420);noiseBurst(0.12,1400,0.12,300);
}
function sfxNadeBounce(){
  if(!actx||!soundOn)return;
  beep(rr(520,700),0.035,'triangle',0.16,rr(200,300));noiseBurst(0.025,3000,0.10);
}
function sfxNadeBlast(){
  if(!actx||!soundOn)return;
  noiseBurst(0.55,1500,0.95,60);
  var sub=actx.createOscillator(),g=actx.createGain(),t=actx.currentTime;
  sub.type='sine';sub.frequency.setValueAtTime(150,t);sub.frequency.exponentialRampToValueAtTime(22,t+0.5);
  g.gain.setValueAtTime(1.0,t);g.gain.exponentialRampToValueAtTime(0.001,t+0.5);
  sub.connect(g);g.connect(bus);sub.start(t);sub.stop(t+0.5);
}
function sfxMedal(tier){
  if(!actx||!soundOn)return;
  var base=tier>=3?660:(tier===2?587:523);
  beep(base,0.09,'triangle',0.16,base*1.5);
  setTimeout(function(){beep(base*1.5,0.14,'sine',0.14,base*2);},70);
}
function sfxShot(wIdx){
  if(!actx||!soundOn)return;
  if(playShotSample(wIdx))return;          /* recorded report where we have one */
  var t=actx.currentTime;
  if(wIdx===1){
    /* 12-GAUGE SHOTGUN BLAST: Massive explosive boom + room reverberation */
    noiseBurst(0.26,1800,0.72,240);
    var sub=actx.createOscillator(),gSub=actx.createGain();
    sub.type='sine';sub.frequency.setValueAtTime(110,t);sub.frequency.exponentialRampToValueAtTime(26,t+0.22);
    gSub.gain.setValueAtTime(0.88,t);gSub.gain.exponentialRampToValueAtTime(0.001,t+0.22);
    sub.connect(gSub);gSub.connect(bus);sub.start(t);sub.stop(t+0.22);
  }else if(wIdx===2){
    /* VECTOR-9 SMG: Fast suppressed high-velocity snap */
    var n=Math.floor(actx.sampleRate*0.038),buf=actx.createBuffer(1,n,actx.sampleRate),d=buf.getChannelData(0);
    for(var i=0;i<n;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/n,2.8);
    var src=actx.createBufferSource();src.buffer=buf;
    var hp=actx.createBiquadFilter();hp.type='highpass';hp.frequency.value=5200;
    var g1=actx.createGain();g1.gain.setValueAtTime(0.48,t);g1.gain.exponentialRampToValueAtTime(0.001,t+0.038);
    src.connect(hp);hp.connect(g1);g1.connect(bus);src.start(t);
    noiseBurst(0.09,2400,0.35,700);
    var sub2=actx.createOscillator(),gSub2=actx.createGain();
    sub2.type='triangle';sub2.frequency.setValueAtTime(150,t);sub2.frequency.exponentialRampToValueAtTime(45,t+0.07);
    gSub2.gain.setValueAtTime(0.42,t);gSub2.gain.exponentialRampToValueAtTime(0.001,t+0.07);
    sub2.connect(gSub2);gSub2.connect(bus);sub2.start(t);sub2.stop(t+0.07);
  }else if(wIdx===3){
    /* APEX-50 RAILGUN: High-voltage capacitor chirp + hypersonic beam explosion */
    var oZap=actx.createOscillator(),gZap=actx.createGain();
    oZap.type='sawtooth';oZap.frequency.setValueAtTime(2800,t);oZap.frequency.exponentialRampToValueAtTime(80,t+0.28);
    gZap.gain.setValueAtTime(0.55,t);gZap.gain.exponentialRampToValueAtTime(0.001,t+0.28);
    oZap.connect(gZap);gZap.connect(bus);oZap.start(t);oZap.stop(t+0.28);
    noiseBurst(0.35,3200,0.75,160);
    var sub3=actx.createOscillator(),gSub3=actx.createGain();
    sub3.type='sine';sub3.frequency.setValueAtTime(120,t);sub3.frequency.exponentialRampToValueAtTime(20,t+0.35);
    gSub3.gain.setValueAtTime(0.92,t);gSub3.gain.exponentialRampToValueAtTime(0.001,t+0.35);
    sub3.connect(gSub3);gSub3.connect(bus);sub3.start(t);sub3.stop(t+0.35);
  }else if(wIdx===4){
    /* P-9 PISTOL: a 9 mm crack, sharp and short, with a small chest thump */
    var np=Math.floor(actx.sampleRate*0.045),bp=actx.createBuffer(1,np,actx.sampleRate),dp=bp.getChannelData(0);
    for(var ip=0;ip<np;ip++)dp[ip]=(Math.random()*2-1)*Math.pow(1-ip/np,2.2);
    var srcP=actx.createBufferSource();srcP.buffer=bp;
    var hpP=actx.createBiquadFilter();hpP.type='highpass';hpP.frequency.value=3200;
    var gP=actx.createGain();gP.gain.setValueAtTime(0.62,t);gP.gain.exponentialRampToValueAtTime(0.001,t+0.045);
    srcP.connect(hpP);hpP.connect(gP);gP.connect(bus);srcP.start(t);
    noiseBurst(0.11,2100,0.42,520);
    var subP=actx.createOscillator(),gSubP=actx.createGain();
    subP.type='sine';subP.frequency.setValueAtTime(170,t);subP.frequency.exponentialRampToValueAtTime(48,t+0.09);
    gSubP.gain.setValueAtTime(0.50,t);gSubP.gain.exponentialRampToValueAtTime(0.001,t+0.09);
    subP.connect(gSubP);gSubP.connect(bus);subP.start(t);subP.stop(t+0.09);
  }else{
    /* AK-47 RIFLE: 4-layer 7.62 rifle report */
    var n=Math.floor(actx.sampleRate*0.06),buf=actx.createBuffer(1,n,actx.sampleRate),d=buf.getChannelData(0);
    for(var i=0;i<n;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/n,2.2);
    var src=actx.createBufferSource();src.buffer=buf;
    var hp=actx.createBiquadFilter();hp.type='highpass';hp.frequency.value=4000;
    var g1=actx.createGain();g1.gain.setValueAtTime(0.55,t);g1.gain.exponentialRampToValueAtTime(0.001,t+0.06);
    src.connect(hp);hp.connect(g1);g1.connect(bus);src.start(t);
    noiseBurst(0.16,2800,0.48,500);
    var sub=actx.createOscillator(),gSub=actx.createGain();
    sub.type='sine';sub.frequency.setValueAtTime(135,t);sub.frequency.exponentialRampToValueAtTime(32,t+0.12);
    gSub.gain.setValueAtTime(0.65,t);gSub.gain.exponentialRampToValueAtTime(0.001,t+0.12);
    sub.connect(gSub);gSub.connect(bus);sub.start(t);sub.stop(t+0.12);
    var tail=actx.createOscillator(),gTail=actx.createGain(),fTail=actx.createBiquadFilter();
    tail.type='triangle';tail.frequency.setValueAtTime(95,t);tail.frequency.exponentialRampToValueAtTime(45,t+0.28);
    fTail.type='lowpass';fTail.frequency.value=450;
    gTail.gain.setValueAtTime(0.25,t);gTail.gain.exponentialRampToValueAtTime(0.001,t+0.28);
    tail.connect(fTail);fTail.connect(gTail);gTail.connect(bus);tail.start(t);tail.stop(t+0.28);
  }
}
function sfxPumpRack(){
  if(!actx||!soundOn)return;
  beep(460,0.035,'triangle',0.18,180);
  setTimeout(function(){
    noiseBurst(0.045,2400,0.22);
    beep(310,0.04,'square',0.15,140);
  },80);
}
function sfxSwitch(){
  if(!actx||!soundOn)return;
  beep(360,0.04,'triangle',0.16,210);
  setTimeout(function(){beep(520,0.05,'square',0.12,380);},60);
}
function sfxHit(head){
  if(!actx||!soundOn)return;
  var t=actx.currentTime;
  if(head){
    /* Headshot: Crisp high-frequency metallic chime */
    var o1=actx.createOscillator(),o2=actx.createOscillator(),g=actx.createGain();
    o1.type='sine';o1.frequency.value=1650;o2.type='sine';o2.frequency.value=2480;
    g.gain.setValueAtTime(0.35,t);g.gain.exponentialRampToValueAtTime(0.001,t+0.18);
    o1.connect(g);o2.connect(g);g.connect(bus);o1.start(t);o2.start(t);o1.stop(t+0.18);o2.stop(t+0.18);
  }else{
    /* Body hit: Crisp tactical tick */
    beep(540,0.045,'square',0.18,260);
  }
}
function sfxDown(){
  noiseBurst(0.35,1100,0.45,110);beep(110,0.28,'sawtooth',0.24,35);
}
function sfxHurt(){
  beep(84,0.22,'sawtooth',0.32,36);noiseBurst(0.18,650,0.28);
}
function sfxBolt(){beep(320,0.14,'sawtooth',0.12,120);}
function sfxPickup(){beep(660,0.08,'square',0.15,920);beep(920,0.12,'sine',0.12,1350);}

/* Ambient subway drone and atmospheric audio */
var ambNode=null;
function startAmbience(){
  if(!actx||!soundOn||ambNode)return;
  try{
    var n=Math.floor(actx.sampleRate*2.0),buf=actx.createBuffer(1,n,actx.sampleRate),d=buf.getChannelData(0);
    for(var i=0;i<n;i++)d[i]=(Math.random()*2-1);
    var src=actx.createBufferSource();src.buffer=buf;src.loop=true;
    var lp=actx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=120;
    var ambGain=actx.createGain();ambGain.gain.value=0.15;
    src.connect(lp);lp.connect(ambGain);ambGain.connect(bus);
    src.start();ambNode={src:src,gain:ambGain};
  }catch(e){}
}
function sfxPAChime(){
  if(!actx||!soundOn)return;
  var t=actx.currentTime;
  [523.25, 659.25, 783.99].forEach(function(freq, i){
    var o=actx.createOscillator(),g=actx.createGain();
    o.type='sine';o.frequency.value=freq;
    g.gain.setValueAtTime(0.18,t+i*0.13);g.gain.exponentialRampToValueAtTime(0.001,t+i*0.13+0.6);
    o.connect(g);g.connect(bus);o.start(t+i*0.13);o.stop(t+i*0.13+0.6);
  });
}
function sfxBulletWhiz(){
  if(!actx||!soundOn)return;
  noiseBurst(0.045,6200,0.26,1200);beep(1800,0.05,'sawtooth',0.15,300);
}
function sfxShieldBreak(){
  if(!actx||!soundOn)return;
  beep(980,0.12,'sawtooth',0.35,180);noiseBurst(0.15,3400,0.45,300);
}
function playBlastSample(scale){
  var buf=shotBuf[BLAST_FILE];
  if(!buf||!actx||!soundOn)return false;
  var t=actx.currentTime,dur=Math.min(BLAST_DUR,buf.duration);
  var src=actx.createBufferSource(),g=actx.createGain();
  src.buffer=buf;
  src.playbackRate.value=(scale||1)*(0.97+Math.random()*0.06);
  g.gain.setValueAtTime(BLAST_GAIN,t);
  g.gain.setValueAtTime(BLAST_GAIN,t+dur-0.25);
  g.gain.linearRampToValueAtTime(0.0001,t+dur);
  src.connect(g);g.connect(bus);src.start(t,0,dur);
  return true;
}
function sfxBarrelExplode(){
  if(!actx||!soundOn)return;
  if(playBlastSample(1))return;
  noiseBurst(0.42,1200,0.85,80);
  var sub=actx.createOscillator(),g=actx.createGain(),t=actx.currentTime;
  sub.type='sine';sub.frequency.setValueAtTime(140,t);sub.frequency.exponentialRampToValueAtTime(25,t+0.4);
  g.gain.setValueAtTime(0.95,t);g.gain.exponentialRampToValueAtTime(0.001,t+0.4);
  sub.connect(g);g.connect(bus);sub.start(t);sub.stop(t+0.4);
}
/* a grenade is a tighter charge than a barrel, so it plays a touch faster and brighter */
function sfxGrenadeBlast(){if(!actx||!soundOn)return;if(playBlastSample(1.06))return;sfxBarrelExplode();}
function sfxChargerBlast(){if(!actx||!soundOn)return;if(playBlastSample(1.14))return;sfxBarrelExplode();}
function sfxGibClatter(){
  if(!actx||!soundOn)return;
  beep(rr(350,680),0.03,'triangle',0.10,rr(140,280));
}

/* Ultra-Realistic Procedural Multi-Phase Tactical Foley Audio */
function sfxMagOut(cur){
  if(!actx||!soundOn)return;
  var t=actx.currentTime;
  var o=actx.createOscillator(),g=actx.createGain(),f=actx.createBiquadFilter();
  o.type='triangle';o.frequency.setValueAtTime(cur===1?650:1150,t);
  o.frequency.exponentialRampToValueAtTime(cur===1?280:420,t+0.045);
  f.type='bandpass';f.frequency.value=cur===1?1200:2200;f.Q.value=4;
  g.gain.setValueAtTime(0.25,t);g.gain.exponentialRampToValueAtTime(0.001,t+0.045);
  o.connect(f);f.connect(g);g.connect(bus);o.start(t);o.stop(t+0.045);
  noiseBurst(0.04,2600,0.18,800);
}
function sfxPouchDraw(){
  if(!actx||!soundOn)return;
  var t=actx.currentTime;
  noiseBurst(0.06,1600,0.10,400);
  var o=actx.createOscillator(),g=actx.createGain();
  o.type='sine';o.frequency.setValueAtTime(3200,t);
  o.frequency.exponentialRampToValueAtTime(1800,t+0.035);
  g.gain.setValueAtTime(0.07,t);g.gain.exponentialRampToValueAtTime(0.001,t+0.035);
  o.connect(g);g.connect(bus);o.start(t);o.stop(t+0.035);
}
function sfxMagIn(cur){
  if(!actx||!soundOn)return;
  var t=actx.currentTime;
  noiseBurst(0.035,2200,0.22,600);
  setTimeout(function(){
    if(!actx||!soundOn)return;
    var t2=actx.currentTime;
    var sub=actx.createOscillator(),gSub=actx.createGain();
    sub.type='sine';sub.frequency.setValueAtTime(cur===3?140:110,t2);
    sub.frequency.exponentialRampToValueAtTime(38,t2+0.07);
    gSub.gain.setValueAtTime(0.42,t2);gSub.gain.exponentialRampToValueAtTime(0.001,t2+0.07);
    sub.connect(gSub);gSub.connect(bus);sub.start(t2);sub.stop(t2+0.07);

    var click=actx.createOscillator(),gClick=actx.createGain(),f=actx.createBiquadFilter();
    click.type='triangle';click.frequency.setValueAtTime(cur===3?900:1450,t2);
    click.frequency.exponentialRampToValueAtTime(380,t2+0.05);
    f.type='bandpass';f.frequency.value=1800;f.Q.value=5;
    gClick.gain.setValueAtTime(0.32,t2);gClick.gain.exponentialRampToValueAtTime(0.001,t2+0.05);
    click.connect(f);f.connect(gClick);gClick.connect(bus);click.start(t2);click.stop(t2+0.05);
  },22);
}
function sfxBoltRelease(){
  if(!actx||!soundOn)return;
  var t=actx.currentTime;
  noiseBurst(0.05,3400,0.32,1200);
  var o=actx.createOscillator(),g=actx.createGain();
  o.type='sawtooth';o.frequency.setValueAtTime(840,t);
  o.frequency.exponentialRampToValueAtTime(140,t+0.08);
  g.gain.setValueAtTime(0.36,t);g.gain.exponentialRampToValueAtTime(0.001,t+0.08);
  o.connect(g);g.connect(bus);o.start(t);o.stop(t+0.08);

  var sub=actx.createOscillator(),gSub=actx.createGain();
  sub.type='sine';sub.frequency.setValueAtTime(120,t);
  sub.frequency.exponentialRampToValueAtTime(30,t+0.09);
  gSub.gain.setValueAtTime(0.45,t);gSub.gain.exponentialRampToValueAtTime(0.001,t+0.09);
  sub.connect(gSub);gSub.connect(bus);sub.start(t);sub.stop(t+0.09);
}
function sfxShellInsert(){
  if(!actx||!soundOn)return;
  var t=actx.currentTime;
  var o=actx.createOscillator(),g=actx.createGain(),f=actx.createBiquadFilter();
  o.type='triangle';o.frequency.setValueAtTime(780,t);
  o.frequency.exponentialRampToValueAtTime(240,t+0.06);
  f.type='bandpass';f.frequency.value=1600;f.Q.value=5;
  g.gain.setValueAtTime(0.28,t);g.gain.exponentialRampToValueAtTime(0.001,t+0.06);
  o.connect(f);f.connect(g);g.connect(bus);o.start(t);o.stop(t+0.06);
  noiseBurst(0.035,2000,0.18,500);
}
function sfxPumpAction(){
  if(!actx||!soundOn)return;
  var t=actx.currentTime;
  noiseBurst(0.045,1900,0.25,600);
  setTimeout(function(){
    if(!actx||!soundOn)return;
    var t2=actx.currentTime;
    noiseBurst(0.05,2800,0.36,900);
    var sub=actx.createOscillator(),gSub=actx.createGain();
    sub.type='sine';sub.frequency.setValueAtTime(95,t2);
    sub.frequency.exponentialRampToValueAtTime(35,t2+0.06);
    gSub.gain.setValueAtTime(0.40,t2);gSub.gain.exponentialRampToValueAtTime(0.001,t2+0.06);
    sub.connect(gSub);gSub.connect(bus);sub.start(t2);sub.stop(t2+0.06);
  },110);
}
function sfxRailCoreLock(){
  if(!actx||!soundOn)return;
  var t=actx.currentTime;
  noiseBurst(0.08,3200,0.28,800);
  var hum=actx.createOscillator(),gHum=actx.createGain();
  hum.type='sawtooth';hum.frequency.setValueAtTime(140,t);
  hum.frequency.exponentialRampToValueAtTime(780,t+0.25);
  gHum.gain.setValueAtTime(0.28,t);gHum.gain.exponentialRampToValueAtTime(0.001,t+0.25);
  hum.connect(gHum);gHum.connect(bus);hum.start(t);hum.stop(t+0.25);
}
function sfxMagClatter(){
  if(!actx||!soundOn)return;
  var t=actx.currentTime;
  noiseBurst(0.035,2400,0.14,1000);
  var o=actx.createOscillator(),g=actx.createGain();
  o.type='triangle';o.frequency.setValueAtTime(480+Math.random()*200,t);
  o.frequency.exponentialRampToValueAtTime(160,t+0.04);
  g.gain.setValueAtTime(0.14,t);g.gain.exponentialRampToValueAtTime(0.001,t+0.04);
  o.connect(g);g.connect(bus);o.start(t);o.stop(t+0.04);
}
function sfxInspect(){
  if(!actx||!soundOn)return;
  beep(280,0.06,'triangle',0.14,160);
  setTimeout(function(){beep(420,0.05,'square',0.11,240);},300);
  setTimeout(function(){beep(340,0.07,'triangle',0.13,190);},750);
}

function toggleSound(){
  soundOn=!soundOn;audioOn();
  if(bus)bus.gain.value=soundOn?0.3:0;
  var label='Sound: '+(soundOn?'on':'off');
  $('sound').textContent=label;$('sound2').textContent=label;
}

