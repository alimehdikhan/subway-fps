/* Last Train — textures.js
   Procedural canvas textures, normal/roughness maps, the shared PBR materials and the
   station light baker (per-texel fixture irradiance + contact occlusion into lightmaps).
   All game scripts share one global scope and load in the order listed in index.html. */
'use strict';

/* deterministic noise so the station looks the same every run */
var seed=20240412;
function rnd(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
function rr(a,b){return a+rnd()*(b-a);}

/* colour texture (sRGB) */
function paint(w,h,fn,rx,ry){
  var c=document.createElement('canvas');c.width=w;c.height=h;
  var g=c.getContext('2d');fn(g,w,h);
  var t=new THREE.CanvasTexture(c);
  t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=maxAniso;t.encoding=THREE.sRGBEncoding;
  if(rx||ry)t.repeat.set(rx||1,ry||1);
  return t;
}
/* data texture (linear): roughness, metalness, occlusion */
function dataTex(w,h,fn,rx,ry){
  var c=document.createElement('canvas');c.width=w;c.height=h;
  var g=c.getContext('2d');fn(g,w,h);
  var t=new THREE.CanvasTexture(c);
  t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=maxAniso;
  if(rx||ry)t.repeat.set(rx||1,ry||1);
  return t;
}
/* Generate a greyscale bump map from any color texture canvas */
function bumpFrom(w,h,fn,rx,ry,intensity){
  var c=document.createElement('canvas');c.width=w;c.height=h;
  var g=c.getContext('2d');fn(g,w,h);
  var id=g.getImageData(0,0,w,h),d=id.data;
  for(var i=0;i<d.length;i+=4){
    var lum=Math.round(d[i]*0.299+d[i+1]*0.587+d[i+2]*0.114);
    d[i]=d[i+1]=d[i+2]=lum;d[i+3]=255;
  }
  g.putImageData(id,0,0);
  var t=new THREE.CanvasTexture(c);
  t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=maxAniso;
  if(rx||ry)t.repeat.set(rx||1,ry||1);
  return t;
}
/* Procedural normal map from height data (red channel of whatever fn paints) */
function normalFrom(w,h,fn,rx,ry,strength){
  var c=document.createElement('canvas');c.width=w;c.height=h;
  var g=c.getContext('2d');fn(g,w,h);
  var src=g.getImageData(0,0,w,h).data;
  var out=g.createImageData(w,h),od=out.data;
  var s=strength||2.0;
  for(var y=0;y<h;y++)for(var x=0;x<w;x++){
    var idx=(y*w+x)*4;
    var l=src[((y)*w+((x-1+w)%w))*4];
    var r=src[((y)*w+((x+1)%w))*4];
    var u=src[(((y-1+h)%h)*w+x)*4];
    var dw=src[(((y+1)%h)*w+x)*4];
    var nx=(l-r)*s/255,ny=(u-dw)*s/255,nz=1.0;
    var len=Math.sqrt(nx*nx+ny*ny+nz*nz);
    od[idx]=Math.round((nx/len*0.5+0.5)*255);
    od[idx+1]=Math.round((ny/len*0.5+0.5)*255);
    od[idx+2]=Math.round((nz/len*0.5+0.5)*255);
    od[idx+3]=255;
  }
  g.putImageData(out,0,0);
  var t=new THREE.CanvasTexture(c);
  t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=maxAniso;
  if(rx||ry)t.repeat.set(rx||1,ry||1);
  return t;
}
function rep(t,rx,ry){var c=t.clone();c.needsUpdate=true;c.wrapS=c.wrapT=THREE.RepeatWrapping;c.repeat.set(rx,ry);c.anisotropy=maxAniso;return c;}
function grain(g,n,a,w,h){for(var i=0;i<n;i++){g.fillStyle=rnd()>0.5?'rgba(255,255,255,'+(rnd()*a)+')':'rgba(0,0,0,'+(rnd()*a)+')';g.fillRect(rnd()*w,rnd()*h,rnd()*6+1,rnd()*3+1);}}
/* soft irregular blotches: the basis of every stain, damp patch and grime cloud below */
function blotches(g,n,w,h,rMin,rMax,rgb,aMax){
  for(var i=0;i<n;i++){
    var x=rnd()*w,y=rnd()*h,r=rr(rMin,rMax),a=rnd()*aMax;
    var gr=g.createRadialGradient(x,y,r*0.1,x,y,r);
    gr.addColorStop(0,'rgba('+rgb+','+a+')');gr.addColorStop(0.55,'rgba('+rgb+','+(a*0.45)+')');gr.addColorStop(1,'rgba('+rgb+',0)');
    g.fillStyle=gr;g.fillRect(x-r,y-r,r*2,r*2);
  }
}
/* thin wandering lines: hairline cracks, scratches, drips */
function cracks(g,n,w,h,style,width,steps,stepLen){
  g.strokeStyle=style;g.lineWidth=width;g.lineCap='round';
  for(var i=0;i<n;i++){
    var x=rnd()*w,y=rnd()*h,a=rnd()*TAU;
    g.beginPath();g.moveTo(x,y);
    for(var k=0;k<steps;k++){a+=rr(-0.7,0.7);x+=Math.cos(a)*stepLen;y+=Math.sin(a)*stepLen;g.lineTo(x,y);}
    g.stroke();
  }
}

var TX={};

/* ============================ station surfaces ============================ */
/* Glazed ceramic subway tile: aged cream biscuit with the odd replaced or chipped tile,
   dirty grout and vertical seepage. Gloss now lives in the roughness map, not the albedo. */
var TILE_W=64,TILE_H=32;
TX.tile=paint(1024,1024,function(g,w,h){
  g.fillStyle='#444947';g.fillRect(0,0,w,h);                           /* dark weathered cement grout */
  grain(g,2600,.14,w,h);
  for(var y=0;y<h;y+=TILE_H){
    var off=(y/TILE_H)%2?TILE_W/2:0;
    for(var x=-TILE_W;x<w;x+=TILE_W){
      var v=rr(-8,8),warm=rnd()<.16?rr(4,14):0;
      var cr=210+v+warm,cg=212+v+warm*0.55,cb=204+v-warm*0.5;
      if(rnd()<.028){cr-=48;cg-=44;cb-=38;}                            /* odd darker replacement tile */
      /* tile biscuit face with subtle glaze warpage */
      g.fillStyle='rgb('+Math.round(cr)+','+Math.round(cg)+','+Math.round(cb)+')';
      g.fillRect(x+off+2,y+2,TILE_W-4,TILE_H-4);
      /* glaze pillowing gradient */
      var pgr=g.createRadialGradient(x+off+TILE_W*0.35,y+TILE_H*0.35,2,x+off+TILE_W*0.5,y+TILE_H*0.5,TILE_W*0.6);
      pgr.addColorStop(0,'rgba(255,255,255,.14)');pgr.addColorStop(0.55,'rgba(255,255,255,.02)');pgr.addColorStop(1,'rgba(0,0,0,.10)');
      g.fillStyle=pgr;g.fillRect(x+off+2,y+2,TILE_W-4,TILE_H-4);
      /* bevel inner shadow & highlight rims */
      g.fillStyle='rgba(0,0,0,.14)';g.fillRect(x+off+2,y+2,TILE_W-4,1.5);g.fillRect(x+off+2,y+2,1.5,TILE_H-4);
      g.fillStyle='rgba(255,255,255,.16)';g.fillRect(x+off+2,y+TILE_H-3.5,TILE_W-4,1.5);
      /* lime/calcite efflorescence on occasional grout seam */
      if(rnd()<.12){
        g.fillStyle='rgba(240,244,242,.22)';
        g.fillRect(x+off,y+(rnd()<.5?0:TILE_H-2),TILE_W,2);
      }
      /* micro-crazing hairline fractures */
      if(rnd()<.14){
        g.strokeStyle='rgba(65,70,68,.48)';g.lineWidth=0.9;g.beginPath();
        var cx=x+off+rr(8,TILE_W-8),cy=y+rr(5,TILE_H-5);g.moveTo(cx,cy);
        for(var k=0;k<4;k++){cx+=rr(-12,12);cy+=rr(-7,7);g.lineTo(cx,cy);}g.stroke();
      }
      /* chipped corner reveals terracotta/clay biscuit */
      if(rnd()<.045){
        g.fillStyle='#72685a';g.beginPath();
        g.arc(x+off+(rnd()<.5?3:TILE_W-3),y+(rnd()<.5?3:TILE_H-3),rr(3,7),0,TAU);g.fill();
        g.strokeStyle='rgba(0,0,0,.3)';g.lineWidth=1;g.stroke();
      }
    }
  }
  blotches(g,16,w,h,60,240,'24,28,30',.18);                            /* dark soot & grime clouds */
  for(var si=0;si<16;si++){                                            /* vertical seepage streaks */
    var sx=rr(10,w-10),sw=rr(3,11),sy=rr(0,h*0.35);
    var sgr=g.createLinearGradient(sx,sy,sx,h);
    sgr.addColorStop(0,'rgba(18,24,26,0)');sgr.addColorStop(0.35,'rgba(26,34,36,.22)');sgr.addColorStop(1,'rgba(10,14,16,.58)');
    g.fillStyle=sgr;g.fillRect(sx,sy,sw,h-sy);
  }
  blotches(g,6,w,h,25,70,'155,78,28',.38);                             /* iron oxide weeping from fixings */
  grain(g,1800,.07,w,h);
});
var tileHeightFn=function(g,w,h){
  g.fillStyle='#787878';g.fillRect(0,0,w,h);
  for(var y=0;y<h;y+=TILE_H){
    var off=(y/TILE_H)%2?TILE_W/2:0;
    for(var x=-TILE_W;x<w;x+=TILE_W){
      var lift=Math.round(rr(-9,9));                                   /* hand-set tiles never sit dead flat */
      /* curved pillowed face */
      g.fillStyle='rgb('+(214+lift)+','+(214+lift)+','+(214+lift)+')';g.fillRect(x+off+2,y+2,TILE_W-4,TILE_H-4);
      var bevel=g.createRadialGradient(x+off+TILE_W/2,y+TILE_H/2,TILE_W*0.15,x+off+TILE_W/2,y+TILE_H/2,TILE_W*0.55);
      bevel.addColorStop(0,'rgba(255,255,255,.15)');bevel.addColorStop(1,'rgba(0,0,0,.22)');
      g.fillStyle=bevel;g.fillRect(x+off+2,y+2,TILE_W-4,TILE_H-4);
      /* deep recessed grout channels */
      g.fillStyle='#1c1c1c';g.fillRect(x+off,y,TILE_W,2);g.fillRect(x+off,y,2,TILE_H);
      g.strokeStyle='#989898';g.lineWidth=1;g.strokeRect(x+off+2.5,y+2.5,TILE_W-5,TILE_H-5);
    }
  }
};
TX.tileBump=normalFrom(512,512,tileHeightFn,null,null,2.8);
TX.tileRough=dataTex(512,512,function(g,w,h){
  g.fillStyle='#dedede';g.fillRect(0,0,w,h);                           /* grout: very matte */
  for(var y=0;y<h;y+=TILE_H){
    var off=(y/TILE_H)%2?TILE_W/2:0;
    for(var x=-TILE_W;x<w;x+=TILE_W){
      var r=Math.round(rr(42,68));                                     /* glazed ceramic: crisp specular reflection */
      g.fillStyle='rgb('+r+','+r+','+r+')';g.fillRect(x+off+2,y+2,TILE_W-4,TILE_H-4);
    }
  }
  blotches(g,18,w,h,30,130,'195,195,195',.55);                         /* dried mineral haze and dust dull the glaze */
  grain(g,800,.10,w,h);
});

/* Platform concrete: cool grey screed with multi-tone aggregate, saw-cut joints, trodden gum and oil */
TX.concrete=paint(1024,1024,function(g,w,h){
  g.fillStyle='#464c49';g.fillRect(0,0,w,h);
  blotches(g,30,w,h,80,280,'90,96,94',.38);
  blotches(g,24,w,h,60,240,'26,30,31',.30);
  /* foot-traffic central wear strip (slightly darker, polished by thousands of commuters) */
  var walkG=g.createLinearGradient(0,h*0.2,0,h*0.8);
  walkG.addColorStop(0,'rgba(30,34,34,0)');walkG.addColorStop(0.5,'rgba(30,34,34,.22)');walkG.addColorStop(1,'rgba(30,34,34,0)');
  g.fillStyle=walkG;g.fillRect(0,0,w,h);
  /* fine basalt and quartz aggregate */
  for(var i=0;i<950;i++){
    g.fillStyle=rnd()>0.45?'rgba(16,20,20,'+(rnd()*0.22)+')':'rgba(225,232,228,'+(rnd()*0.16)+')';
    g.beginPath();g.arc(rnd()*w,rnd()*h,rnd()*2.4+0.5,0,TAU);g.fill();
  }
  cracks(g,18,w,h,'rgba(20,24,25,.65)',1.3,14,14);
  /* saw-cut control joints with dark bitumen sealant */
  g.strokeStyle='rgba(14,18,20,.95)';g.lineWidth=4.5;
  for(var k=0;k<4;k++){
    g.beginPath();g.moveTo(0,k*256);g.lineTo(w,k*256);g.stroke();
    g.beginPath();g.moveTo(k*256,0);g.lineTo(k*256,h);g.stroke();
  }
  /* spalled edge bevel highlights along joint cuts */
  g.strokeStyle='rgba(195,205,200,.28)';g.lineWidth=1.5;
  for(var k2=0;k2<4;k2++){
    g.beginPath();g.moveTo(0,k2*256+3.5);g.lineTo(w,k2*256+3.5);g.stroke();
    g.beginPath();g.moveTo(k2*256+3.5,0);g.lineTo(k2*256+3.5,h);g.stroke();
  }
  blotches(g,12,w,h,40,140,'14,18,20',.45);                            /* dark engine oil and grime */
  for(var gi=0;gi<85;gi++){                                            /* trodden gum spots */
    g.fillStyle='rgba(12,14,15,'+rr(.35,.7)+')';
    g.beginPath();g.ellipse(rnd()*w,rnd()*h,rr(2,5.5),rr(1.5,4),rnd()*TAU,0,TAU);g.fill();
  }
  grain(g,5500,.10,w,h);
});
var concHeightFn=function(g,w,h){
  g.fillStyle='#808080';g.fillRect(0,0,w,h);
  for(var i=0;i<550;i++){                                              /* tactile aggregate relief */
    g.fillStyle=rnd()>0.5?'#525252':'#b0b0b0';
    g.beginPath();g.arc(rnd()*w,rnd()*h,rnd()*2.4+0.5,0,TAU);g.fill();
  }
  blotches(g,24,w,h,40,150,'105,105,105',.55);
  cracks(g,14,w,h,'rgba(35,35,35,.95)',1.6,14,7);
  g.strokeStyle='#202020';g.lineWidth=3;
  for(var k=0;k<4;k++){
    g.beginPath();g.moveTo(0,k*128);g.lineTo(w,k*128);g.stroke();
    g.beginPath();g.moveTo(k*128,0);g.lineTo(k*128,h);g.stroke();
  }
};
TX.concBump=normalFrom(512,512,concHeightFn,null,null,2.2);
TX.concRough=dataTex(512,512,function(g,w,h){
  g.fillStyle='#a8a8a8';g.fillRect(0,0,w,h);                           /* base screed roughness ~0.66 */
  /* central walkway polished by commuters */
  var walkR=g.createLinearGradient(0,h*0.2,0,h*0.8);
  walkR.addColorStop(0,'rgba(200,200,200,0)');walkR.addColorStop(0.5,'rgba(60,60,60,.45)');walkR.addColorStop(1,'rgba(200,200,200,0)');
  g.fillStyle=walkR;g.fillRect(0,0,w,h);
  blotches(g,16,w,h,40,160,'65,65,65',.80);                            /* damp and oily spots drop to ~0.25 (glossy) */
  blotches(g,18,w,h,50,170,'230,230,230',.52);                         /* dusty, undisturbed wall corners stay matte */
  grain(g,1800,.13,w,h);
});

/* Tactile paving on the platform edge: worn safety yellow, scuffed and dirty */
TX.tactile=paint(256,256,function(g,w,h){
  g.fillStyle='#b8842a';g.fillRect(0,0,w,h);
  blotches(g,8,w,h,30,90,'60,44,20',.3);
  for(var y=12;y<h;y+=28)for(var x=12;x<w;x+=28){
    g.fillStyle='rgba(40,28,8,.55)';g.beginPath();g.arc(x+2,y+2,8,0,TAU);g.fill();
    var dg=g.createRadialGradient(x-2,y-2,1,x,y,8);
    dg.addColorStop(0,'#e8bd58');dg.addColorStop(0.7,'#c08d2a');dg.addColorStop(1,'#7e5210');
    g.fillStyle=dg;g.beginPath();g.arc(x,y,8,0,TAU);g.fill();
  }
  for(var i=0;i<60;i++){g.fillStyle='rgba(25,20,15,'+(rnd()*0.22)+')';g.fillRect(rnd()*w,rnd()*h,rnd()*30+4,rnd()*3+1);}
  grain(g,700,.14,w,h);
});

/* Dark glazed wainscot dado band */
TX.wainscot=paint(256,256,function(g,w,h){
  g.fillStyle='#10201f';g.fillRect(0,0,w,h);
  for(var y=0;y<h;y+=64)for(var x=(y/64%2)*64;x<w;x+=128){
    var t=rr(-8,8);
    g.fillStyle='rgb('+(34+t)+','+(64+t)+','+(64+t)+')';g.fillRect(x+2,y+2,124,60);
    g.fillStyle='rgba(255,255,255,.07)';g.fillRect(x+2,y+2,124,1.5);
    g.fillStyle='rgba(0,0,0,.18)';g.fillRect(x+2,y+60,124,2);
  }
  blotches(g,6,w,h,30,90,'8,12,12',.35);
  grain(g,900,.10,w,h);
});
TX.wainscotRough=dataTex(256,256,function(g,w,h){
  g.fillStyle='#d0d0d0';g.fillRect(0,0,w,h);
  for(var y=0;y<h;y+=64)for(var x=(y/64%2)*64;x<w;x+=128){g.fillStyle='#484848';g.fillRect(x+2,y+2,124,60);}
  blotches(g,8,w,h,20,60,'190,190,190',.5);
});

/* Ballast: dark granite with rust dust near the rails and oil drip */
TX.gravel=paint(256,256,function(g,w,h){
  g.fillStyle='#232624';g.fillRect(0,0,w,h);
  for(var i=0;i<2000;i++){
    var s=rnd()*7+2,l=rr(30,80),t=rnd()<.12?18:0;
    g.fillStyle='rgb('+(l+t)+','+(l+2)+','+(l-4)+')';
    g.fillRect(rnd()*w,rnd()*h,s,s*0.7);
  }
  blotches(g,6,w,h,20,70,'112,62,30',.28);
  blotches(g,5,w,h,20,70,'8,10,10',.4);
  grain(g,1200,.16,w,h);
});

/* Brushed gunmetal for crates, stanchions and fittings */
TX.metal=paint(256,256,function(g,w,h){
  g.fillStyle='#2c3335';g.fillRect(0,0,w,h);
  for(var y=0;y<h;y+=2){g.fillStyle='rgba(255,255,255,'+rr(0,.05)+')';g.fillRect(0,y,w,1);}
  for(var i=0;i<60;i++){g.fillStyle='rgba(255,255,255,'+rr(.02,.08)+')';g.fillRect(rnd()*w,rnd()*h,rr(10,80),1);}
  blotches(g,6,w,h,20,70,'10,12,12',.3);
  grain(g,500,.08,w,h);
});
TX.metalRough=dataTex(256,256,function(g,w,h){
  g.fillStyle='#707070';g.fillRect(0,0,w,h);
  for(var y=0;y<h;y+=2){g.fillStyle='rgba(255,255,255,'+rr(0,.16)+')';g.fillRect(0,y,w,1);}
  blotches(g,8,w,h,20,70,'150,150,150',.5);
  for(var i=0;i<30;i++){g.fillStyle='rgba(60,60,60,'+rr(.2,.6)+')';g.fillRect(rnd()*w,rnd()*h,rr(6,40),1.5);}
});
TX.metalNormal=normalFrom(256,256,function(g,w,h){
  g.fillStyle='#808080';g.fillRect(0,0,w,h);
  for(var y=0;y<h;y+=2){var v=Math.round(rr(118,138));g.fillStyle='rgb('+v+','+v+','+v+')';g.fillRect(0,y,w,1);}
},null,null,1.0);

/* Ceiling: stained concrete soffit with formwork lines, soot and old water marks */
TX.panel=paint(512,512,function(g,w,h){
  g.fillStyle='#343a3d';g.fillRect(0,0,w,h);
  blotches(g,20,w,h,60,200,'60,66,68',.35);
  blotches(g,14,w,h,40,160,'16,20,22',.3);
  g.strokeStyle='rgba(12,16,18,.5)';g.lineWidth=2;
  for(var k=0;k<4;k++){g.beginPath();g.moveTo(0,k*128);g.lineTo(w,k*128);g.stroke();g.beginPath();g.moveTo(k*128,0);g.lineTo(k*128,h);g.stroke();}
  for(var i=0;i<5;i++){                                                /* water rings */
    var x=rnd()*w,y=rnd()*h,r=rr(20,60);
    g.strokeStyle='rgba(110,86,52,'+rr(.1,.24)+')';g.lineWidth=rr(2,5);g.beginPath();g.arc(x,y,r,0,TAU);g.stroke();
    g.fillStyle='rgba(100,80,50,.12)';g.beginPath();g.arc(x,y,r,0,TAU);g.fill();
  }
  cracks(g,6,w,h,'rgba(16,18,20,.5)',1,10,12);
  grain(g,2400,.08,w,h);
});
TX.panelRough=dataTex(256,256,function(g,w,h){g.fillStyle='#e0e0e0';g.fillRect(0,0,w,h);blotches(g,8,w,h,30,90,'150,150,150',.5);grain(g,400,.1,w,h);});

TX.grime=paint(256,256,function(g,w,h){
  g.fillStyle='#202729';g.fillRect(0,0,w,h);
  for(var i=0;i<50;i++){g.fillStyle='rgba(0,0,0,.18)';g.fillRect(rnd()*w,rnd()*h,rnd()*80+10,rnd()*30+4);}
  blotches(g,6,w,h,20,80,'60,66,66',.2);
  grain(g,1800,.18,w,h);
});

/* Rusted steel: rail webs, brackets and anything that has been wet for decades */
TX.rust=paint(256,256,function(g,w,h){
  g.fillStyle='#4a3a30';g.fillRect(0,0,w,h);
  blotches(g,30,w,h,10,60,'150,80,34',.45);
  blotches(g,20,w,h,8,40,'30,22,18',.5);
  for(var i=0;i<400;i++){g.fillStyle='rgba(20,14,10,'+rr(.2,.6)+')';g.beginPath();g.arc(rnd()*w,rnd()*h,rr(.6,2.2),0,TAU);g.fill();}
  grain(g,900,.12,w,h);
});

/* Train body: painted corrugated stainless with a stripe, rivet rows and a grimy skirt */
TX.train=paint(512,256,function(g,w,h){
  g.fillStyle='#a8b2b0';g.fillRect(0,0,w,h);
  var sh=g.createLinearGradient(0,0,0,h);
  sh.addColorStop(0,'rgba(255,255,255,.18)');sh.addColorStop(.45,'rgba(255,255,255,0)');sh.addColorStop(1,'rgba(14,20,22,.5)');
  g.fillStyle=sh;g.fillRect(0,0,w,h);
  for(var x=0;x<w;x+=16){                                              /* corrugations */
    g.fillStyle='rgba(255,255,255,.10)';g.fillRect(x,20,3,150);
    g.fillStyle='rgba(0,0,0,.14)';g.fillRect(x+8,20,4,150);
  }
  g.fillStyle='#14302f';g.fillRect(0,170,w,54);                        /* dark skirt */
  g.fillStyle='#d9942e';g.fillRect(0,160,w,9);                         /* line stripe */
  g.fillStyle='rgba(255,255,255,.25)';g.fillRect(0,160,w,2);
  for(var rx=6;rx<w;rx+=22){                                           /* rivet rows */
    for(var ry=0;ry<2;ry++){var y=ry?174:14;g.fillStyle='rgba(0,0,0,.35)';g.beginPath();g.arc(rx+1,y+1,2.2,0,TAU);g.fill();g.fillStyle='rgba(220,226,224,.7)';g.beginPath();g.arc(rx,y,1.8,0,TAU);g.fill();}
  }
  blotches(g,10,w,h,30,90,'40,46,46',.25);
  var dirt=g.createLinearGradient(0,h*0.6,0,h);dirt.addColorStop(0,'rgba(20,20,18,0)');dirt.addColorStop(1,'rgba(20,20,18,.55)');
  g.fillStyle=dirt;g.fillRect(0,h*0.6,w,h*0.4);
  cracks(g,14,w,h,'rgba(255,255,255,.18)',1,6,10);
  grain(g,900,.07,w,h);
});
TX.trainNormal=normalFrom(256,128,function(g,w,h){
  g.fillStyle='#808080';g.fillRect(0,0,w,h);
  for(var x=0;x<w;x+=8){g.fillStyle='#9a9a9a';g.fillRect(x,10,3,75);g.fillStyle='#666666';g.fillRect(x+4,10,3,75);}
  g.fillStyle='#4a4a4a';g.fillRect(0,80,w,4);
  for(var rx=3;rx<w;rx+=11){g.fillStyle='#c8c8c8';g.beginPath();g.arc(rx,7,1.5,0,TAU);g.fill();g.beginPath();g.arc(rx,87,1.5,0,TAU);g.fill();}
},null,null,2.2);
TX.trainRough=dataTex(256,128,function(g,w,h){
  g.fillStyle='#6a6a6a';g.fillRect(0,0,w,h);
  var dirt=g.createLinearGradient(0,h*0.55,0,h);dirt.addColorStop(0,'rgba(200,200,200,0)');dirt.addColorStop(1,'rgba(200,200,200,.8)');
  g.fillStyle=dirt;g.fillRect(0,h*0.55,w,h*0.45);
  blotches(g,8,w,h,15,50,'170,170,170',.5);
});

/* Fluorescent troffer diffuser: milky panel with the two tubes glowing through. The tubes run
   along v, which is the long axis of the lamp face on the underside of a box. */
TX.lampFace=paint(32,128,function(g,w,h){
  g.fillStyle='#e6e3d5';g.fillRect(0,0,w,h);
  var t1=g.createLinearGradient(4,0,14,0),t2=g.createLinearGradient(18,0,28,0);
  [t1,t2].forEach(function(t){t.addColorStop(0,'rgba(255,255,255,0)');t.addColorStop(.5,'rgba(255,255,255,1)');t.addColorStop(1,'rgba(255,255,255,0)');});
  g.fillStyle=t1;g.fillRect(4,0,10,h);g.fillStyle=t2;g.fillRect(18,0,10,h);
  g.fillStyle='rgba(120,116,100,.5)';g.fillRect(0,0,w,3);g.fillRect(0,h-3,w,3);
  grain(g,120,.05,w,h);
});
/* Painted safety line along the platform: scuffed and flaking */
TX.paintLine=paint(256,64,function(g,w,h){
  g.fillStyle='#d6d3c4';g.fillRect(0,0,w,h);
  blotches(g,10,w,h,10,40,'70,72,68',.5);
  for(var i=0;i<40;i++){g.fillStyle='rgba(60,62,60,'+rr(.3,.8)+')';g.fillRect(rnd()*w,rnd()*h,rr(2,8),rr(1,3));}
  grain(g,400,.12,w,h);
});

/* ============================ sprites and effect textures ============================ */
TX.glow=paint(64,64,function(g,w,h){
  var gr=g.createRadialGradient(32,32,0,32,32,32);
  gr.addColorStop(0,'rgba(255,255,255,1)');
  gr.addColorStop(.35,'rgba(255,255,255,.45)');
  gr.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle=gr;g.fillRect(0,0,w,h);
});
/* Muzzle flash: a hot core with irregular petals. Two variants are swapped per shot. */
function flashTex(){
  return paint(128,128,function(g,w,h){
    g.clearRect(0,0,w,h);
    var cx=64,cy=64;
    for(var i=0;i<9;i++){
      var a=rnd()*TAU,len=rr(26,60),wid=rr(3,9);
      var gr=g.createLinearGradient(cx,cy,cx+Math.cos(a)*len,cy+Math.sin(a)*len);
      gr.addColorStop(0,'rgba(255,250,235,.95)');gr.addColorStop(.45,'rgba(255,200,120,.55)');gr.addColorStop(1,'rgba(255,140,40,0)');
      g.fillStyle=gr;g.beginPath();
      g.moveTo(cx+Math.cos(a+1.57)*wid,cy+Math.sin(a+1.57)*wid);
      g.lineTo(cx+Math.cos(a)*len,cy+Math.sin(a)*len);
      g.lineTo(cx+Math.cos(a-1.57)*wid,cy+Math.sin(a-1.57)*wid);g.fill();
    }
    var core=g.createRadialGradient(cx,cy,0,cx,cy,26);
    core.addColorStop(0,'rgba(255,255,255,1)');core.addColorStop(.35,'rgba(255,240,200,.9)');core.addColorStop(.7,'rgba(255,190,110,.35)');core.addColorStop(1,'rgba(255,150,60,0)');
    g.fillStyle=core;g.fillRect(0,0,w,h);
  });
}
TX.flash=flashTex();TX.flash2=flashTex();
[TX.flash,TX.flash2].forEach(function(t){t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping;});
/* Soft irregular smoke puff for impacts and blasts (normal blending, so it darkens what it covers) */
TX.puff=paint(128,128,function(g,w,h){
  g.clearRect(0,0,w,h);
  for(var i=0;i<7;i++){
    var x=64+rr(-18,18),y=64+rr(-18,18),r=rr(22,40);
    var gr=g.createRadialGradient(x,y,2,x,y,r);
    gr.addColorStop(0,'rgba(210,214,212,.6)');gr.addColorStop(.5,'rgba(170,176,174,.3)');gr.addColorStop(1,'rgba(140,146,144,0)');
    g.fillStyle=gr;g.fillRect(0,0,w,h);
  }
});
TX.puff.wrapS=TX.puff.wrapT=THREE.ClampToEdgeWrapping;
/* Expanding shockwave ring for explosions and the rail impact */
TX.ring=paint(128,128,function(g,w,h){
  g.clearRect(0,0,w,h);
  var gr=g.createRadialGradient(64,64,34,64,64,58);
  gr.addColorStop(0,'rgba(255,255,255,0)');gr.addColorStop(.4,'rgba(255,255,255,.9)');gr.addColorStop(.7,'rgba(255,255,255,.5)');gr.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle=gr;g.fillRect(0,0,w,h);
});
TX.ring.wrapS=TX.ring.wrapT=THREE.ClampToEdgeWrapping;

/* Illuminated EOTech EXPS3 Holographic Reticle (68 MOA speed ring + 1 MOA center dot + BDC holds) */
/* The reflex reticles are drawn at 512² with thin solid cores and a restrained glow, so they stay
   crisp when the sight window fills a fifth of the frame at ADS. */
TX.holo=paint(512,512,function(g,w,h){
  g.clearRect(0,0,w,h);
  var cx=256,cy=256,r=84;
  // soft laser halo behind the 68 MOA ring (the ring covers about two thirds of the window)
  g.strokeStyle='rgba(255,60,40,0.12)';g.lineWidth=14;
  g.beginPath();g.arc(cx,cy,r,0,TAU);g.stroke();
  // the ring: a warm glowing band with a thin bright core
  g.shadowColor='rgba(255,40,30,0.9)';g.shadowBlur=5;g.strokeStyle='#ff4a3c';g.lineWidth=4;
  g.beginPath();g.arc(cx,cy,r,0,TAU);g.stroke();
  g.shadowBlur=0;g.strokeStyle='#ffd9d2';g.lineWidth=1.4;
  g.beginPath();g.arc(cx,cy,r,0,TAU);g.stroke();
  // quadrant stadia ticks outside the ring and the 300 m / 500 m hold bars inside it
  g.shadowColor='rgba(255,40,30,0.9)';g.shadowBlur=4;g.strokeStyle='#ff4a3c';g.lineWidth=3.5;g.lineCap='round';
  g.beginPath();
  g.moveTo(cx,cy-r-34);g.lineTo(cx,cy-r-8);
  g.moveTo(cx,cy+r+8);g.lineTo(cx,cy+r+34);
  g.moveTo(cx-r-34,cy);g.lineTo(cx-r-8,cy);
  g.moveTo(cx+r+8,cy);g.lineTo(cx+r+34,cy);
  g.moveTo(cx-10,cy+34);g.lineTo(cx+10,cy+34);
  g.moveTo(cx-16,cy+62);g.lineTo(cx+16,cy+62);
  g.stroke();
  // 1 MOA dot with a white-hot core
  g.shadowColor='#ff3b30';g.shadowBlur=12;g.fillStyle='#ff5a48';
  g.beginPath();g.arc(cx,cy,7.5,0,TAU);g.fill();
  g.shadowBlur=0;g.fillStyle='#ffffff';
  g.beginPath();g.arc(cx,cy,4.2,0,TAU);g.fill();
  g.fillStyle='#ff4a3c';
  g.beginPath();g.arc(cx,cy+34,3,0,TAU);g.fill(); // 300m BDC pip
});
/* glass edge shading for the reflex sights: clear in the middle, darkening toward the rim, with a
   faint arc of reflected light across the upper left; the round variant is clipped to a disc for
   the SMG's tube sight */
function lensShadeTex(round){
  return paint(256,256,function(g,w,h){
    g.clearRect(0,0,w,h);
    var gr=g.createRadialGradient(128,128,58,128,128,128);
    gr.addColorStop(0,'rgba(8,10,14,0)');gr.addColorStop(0.6,'rgba(8,10,14,0.06)');gr.addColorStop(0.88,'rgba(8,10,14,0.28)');gr.addColorStop(1,'rgba(8,10,14,0.55)');
    g.fillStyle=gr;g.fillRect(0,0,w,h);
    g.strokeStyle='rgba(200,225,255,0.10)';g.lineWidth=14;
    g.beginPath();g.arc(128,128,96,Math.PI*1.05,Math.PI*1.55);g.stroke();
    if(round){g.globalCompositeOperation='destination-in';g.fillStyle='#fff';g.beginPath();g.arc(128,128,127,0,TAU);g.fill();g.globalCompositeOperation='source-over';}
  });
}
TX.lensShade=lensShadeTex(false);TX.lensShadeRound=lensShadeTex(true);
TX.lensShade.wrapS=TX.lensShade.wrapT=TX.lensShadeRound.wrapS=TX.lensShadeRound.wrapT=THREE.ClampToEdgeWrapping;

/* Tactical Shotgun Buckshot Spread Reticle (32 MOA circular pellet spread cone + center bead) */
TX.shotgunReticle=paint(512,512,function(g,w,h){
  g.clearRect(0,0,w,h);
  var cx=256,cy=256,r=116,o=24;
  // Circular spread ring matching 12-gauge 8-pellet dispersion at 15m
  g.strokeStyle='rgba(255,170,40,0.16)';g.lineWidth=16;
  g.beginPath();g.arc(cx,cy,r,0,TAU);g.stroke();
  g.shadowColor='rgba(255,150,20,0.9)';g.shadowBlur=6;g.strokeStyle='#ffb036';g.lineWidth=5;
  g.beginPath();g.arc(cx,cy,r,0,TAU);g.stroke();
  g.shadowBlur=0;g.strokeStyle='#fff1d0';g.lineWidth=1.6;
  g.beginPath();g.arc(cx,cy,r,0,TAU);g.stroke();
  // 4 acquisition notches
  g.shadowColor='rgba(255,150,20,0.9)';g.shadowBlur=5;g.strokeStyle='#ffc050';g.lineWidth=4.5;g.lineCap='round';
  g.beginPath();
  g.moveTo(cx-r-o,cy);g.lineTo(cx-r+8,cy);
  g.moveTo(cx+r-8,cy);g.lineTo(cx+r+o,cy);
  g.moveTo(cx,cy-r-o);g.lineTo(cx,cy-r+8);
  g.moveTo(cx,cy+r-8);g.lineTo(cx,cy+r+o);
  g.stroke();
  // Center combat bead dot
  g.shadowColor='#ffaa28';g.shadowBlur=14;g.fillStyle='#ffc060';
  g.beginPath();g.arc(cx,cy,10,0,TAU);g.fill();
  g.shadowBlur=0;g.fillStyle='#ffffff';
  g.beginPath();g.arc(cx,cy,5.5,0,TAU);g.fill();
});

/* Vector-9 Precision 2-MOA CQB Red Dot Reticle */
TX.reflexDot=paint(512,512,function(g,w,h){
  g.clearRect(0,0,w,h);
  var cx=256,cy=256;
  // Soft optical bloom
  var grad=g.createRadialGradient(cx,cy,2,cx,cy,44);
  grad.addColorStop(0,'rgba(255,60,50,0.90)');
  grad.addColorStop(0.30,'rgba(255,50,40,0.35)');
  grad.addColorStop(0.70,'rgba(255,30,20,0.08)');
  grad.addColorStop(1,'rgba(255,0,0,0)');
  g.fillStyle=grad;g.fillRect(0,0,w,h);
  // Crisp 2-MOA dot with a white-hot core
  g.shadowColor='#ff2a20';g.shadowBlur=12;g.fillStyle='#ff6a5a';
  g.beginPath();g.arc(cx,cy,11,0,TAU);g.fill();
  g.shadowBlur=0;g.fillStyle='#ffffff';
  g.beginPath();g.arc(cx,cy,6.5,0,TAU);g.fill();
});

/* Apex-50 3D Sniper Scope Glass Reticle (Fine Mil-Dot Crosshairs & Stadia) */
TX.railReticle=paint(512,512,function(g,w,h){
  g.clearRect(0,0,w,h);
  var cx=256,cy=256;
  // Thin illuminated cyan crosshairs
  g.strokeStyle='rgba(0,255,230,0.85)';g.lineWidth=2.0;g.shadowColor='#00ffff';g.shadowBlur=10;
  g.beginPath();
  g.moveTo(32,cy);g.lineTo(w-32,cy);
  g.moveTo(cx,32);g.lineTo(cx,h-32);
  g.stroke();
  // Mil-dot hash marks along horizontal and vertical axes
  g.fillStyle='#00ffff';g.lineWidth=1.8;
  for(var m=-8;m<=8;m++){
    if(m===0)continue;
    var px=cx+m*24,py=cy+m*24;
    var len=(Math.abs(m)%4===0)?12:6;
    g.beginPath();g.moveTo(px,cy-len);g.lineTo(px,cy+len);g.stroke();
    g.beginPath();g.moveTo(cx-len,py);g.lineTo(cx+len,py);g.stroke();
  }
  // Center cyan targeting pip with white core
  g.fillStyle='#ffffff';g.shadowColor='#00ffff';g.shadowBlur=18;
  g.beginPath();g.arc(cx,cy,4.5,0,TAU);g.fill();
});

TX.contactShadow=paint(128,128,function(g,w,h){
  var grad=g.createRadialGradient(w/2,h/2,4,w/2,h/2,w/2);
  grad.addColorStop(0,'rgba(0,0,0,0.85)');
  grad.addColorStop(0.35,'rgba(0,0,0,0.50)');
  grad.addColorStop(0.75,'rgba(0,0,0,0.15)');
  grad.addColorStop(1,'rgba(0,0,0,0.0)');
  g.fillStyle=grad;g.fillRect(0,0,w,h);
});
TX.contactShadow.wrapS=TX.contactShadow.wrapT=THREE.ClampToEdgeWrapping;

TX.smoke=paint(128,128,function(g,w,h){
  g.clearRect(0,0,w,h);
  for(var i=0;i<5;i++){
    var x=64+rr(-12,12),y=64+rr(-12,12),r=rr(30,48);
    var grad=g.createRadialGradient(x,y,2,x,y,r);
    grad.addColorStop(0,'rgba(225,232,236,0.40)');grad.addColorStop(0.4,'rgba(200,210,214,0.18)');grad.addColorStop(1,'rgba(150,165,170,0.0)');
    g.fillStyle=grad;g.fillRect(0,0,w,h);
  }
});
TX.smoke.wrapS=TX.smoke.wrapT=THREE.ClampToEdgeWrapping;

TX.lightBeam=paint(128,512,function(g,w,h){
  g.clearRect(0,0,w,h);
  var grad=g.createLinearGradient(0,0,0,h);
  grad.addColorStop(0,'rgba(230,240,250,0.50)');
  grad.addColorStop(0.3,'rgba(220,232,245,0.22)');
  grad.addColorStop(0.7,'rgba(200,215,230,0.07)');
  grad.addColorStop(1,'rgba(180,200,220,0.0)');
  g.fillStyle=grad;g.fillRect(0,0,w,h);
  var side=g.createLinearGradient(0,0,w,0);
  side.addColorStop(0,'rgba(0,0,0,1)');side.addColorStop(.25,'rgba(0,0,0,0)');side.addColorStop(.75,'rgba(0,0,0,0)');side.addColorStop(1,'rgba(0,0,0,1)');
  g.globalCompositeOperation='destination-out';g.fillStyle=side;g.fillRect(0,0,w,h);
  g.globalCompositeOperation='source-over';
});
TX.lightBeam.wrapS=TX.lightBeam.wrapT=THREE.ClampToEdgeWrapping;

/* ============================ operator and weapon finishes ============================ */
/* Glove: synthetic leather micro-grain with faint stitch lines. Tiles at millimetre scale so
   it reads as material on the palm and blurs to tone on the fingers. */
TX.glove=paint(256,256,function(g,w,h){
  g.fillStyle='#3b403d';g.fillRect(0,0,w,h);
  for(var i=0;i<5000;i++){g.fillStyle=rnd()>.5?'rgba(255,255,255,'+rr(.02,.09)+')':'rgba(0,0,0,'+rr(.04,.16)+')';g.fillRect(rnd()*w,rnd()*h,rr(1,2.5),rr(1,2.5));}
  g.strokeStyle='rgba(150,156,150,.28)';g.lineWidth=1.2;g.setLineDash([4,3]);
  g.beginPath();g.moveTo(0,64);g.lineTo(w,64);g.moveTo(0,192);g.lineTo(w,192);g.moveTo(128,0);g.lineTo(128,h);g.stroke();g.setLineDash([]);
  blotches(g,6,w,h,20,70,'20,22,22',.25);
});
TX.gloveNormal=normalFrom(256,256,function(g,w,h){
  g.fillStyle='#808080';g.fillRect(0,0,w,h);
  for(var i=0;i<4000;i++){var v=Math.round(rr(100,156));g.fillStyle='rgb('+v+','+v+','+v+')';g.beginPath();g.arc(rnd()*w,rnd()*h,rr(1,2.4),0,TAU);g.fill();}
},null,null,1.4);

/* Tactical Carbon-Fiber Molded Knuckle Shield (2x2 Twill Weave) */
TX.carbonFiber=paint(256,256,function(g,w,h){
  g.fillStyle='#141618';g.fillRect(0,0,w,h);
  var s=8;
  for(var y=0;y<h;y+=s){
    for(var x=0;x<w;x+=s){
      var parity=((x/s+y/s)%4<2);
      var lg=g.createLinearGradient(x,y,x+s,y+s);
      if(parity){
        lg.addColorStop(0,'#1c1f22');lg.addColorStop(0.5,'#2c3136');lg.addColorStop(1,'#181a1c');
      }else{
        lg.addColorStop(0,'#0e1011');lg.addColorStop(0.5,'#181b1d');lg.addColorStop(1,'#0c0d0e');
      }
      g.fillStyle=lg;g.fillRect(x,y,s,s);
      g.strokeStyle='rgba(255,255,255,0.06)';g.lineWidth=0.5;
      g.strokeRect(x+0.5,y+0.5,s-1,s-1);
    }
  }
  // Subtle clear-coat lacquer reflection sheen
  var sheen=g.createLinearGradient(0,0,w,h);
  sheen.addColorStop(0,'rgba(255,255,255,0.12)');
  sheen.addColorStop(0.4,'rgba(255,255,255,0.02)');
  sheen.addColorStop(0.6,'rgba(0,0,0,0.18)');
  sheen.addColorStop(1,'rgba(255,255,255,0.08)');
  g.fillStyle=sheen;g.fillRect(0,0,w,h);
});
TX.carbonNormal=normalFrom(256,256,function(g,w,h){
  g.fillStyle='#808080';g.fillRect(0,0,w,h);
  var s=8;
  for(var y=0;y<h;y+=s){
    for(var x=0;x<w;x+=s){
      var parity=((x/s+y/s)%4<2);
      g.fillStyle=parity?'#a0a0a0':'#606060';
      g.fillRect(x+1,y+1,s-2,s-2);
    }
  }
},null,null,1.8);

/* Tactical OLED Combat Wrist Watch Interface */
TX.watchDial=paint(256,256,function(g,w,h){
  g.fillStyle='#06090b';g.fillRect(0,0,w,h);
  // Bezel border frame
  g.strokeStyle='#00e5ff';g.lineWidth=4;
  g.strokeRect(6,6,w-12,h-12);
  g.strokeStyle='rgba(0,229,255,0.3)';g.lineWidth=1;
  g.strokeRect(12,12,w-24,h-24);
  // Digital Clock & Status
  g.fillStyle='#ffffff';g.font='bold 34px monospace';g.textAlign='center';
  g.fillText('02:47:19',128,52);
  g.fillStyle='#00f3ff';g.font='16px monospace';
  g.fillText('STATUS: ARMED',128,80);
  // Biometric Heart Rate & Oxygen
  g.fillStyle='#ff3344';g.font='bold 24px monospace';g.textAlign='left';
  g.fillText('HR: 138 BPM',24,120);
  // Heart rate pulse waveform
  g.strokeStyle='#ff3344';g.lineWidth=3;g.beginPath();
  g.moveTo(24,145);g.lineTo(70,145);g.lineTo(82,130);g.lineTo(95,160);g.lineTo(108,125);g.lineTo(120,150);g.lineTo(130,145);g.lineTo(232,145);
  g.stroke();
  // Tactical Compass Heading & Battery
  g.fillStyle='#00ff88';g.font='bold 22px monospace';
  g.fillText('HDG: NW 318°',24,195);
  g.fillStyle='#ffaa00';g.font='18px monospace';
  g.fillText('BAT: 94% [||||||| ]',24,228);
});

/* Sleeve: ripstop weave with the reinforcement grid and worn-in fabric shading */
TX.sleeve=paint(256,256,function(g,w,h){
  g.fillStyle='#37413b';g.fillRect(0,0,w,h);
  blotches(g,10,w,h,30,90,'52,60,54',.4);
  blotches(g,8,w,h,30,90,'22,28,26',.35);
  g.strokeStyle='rgba(255,255,255,.055)';g.lineWidth=1;
  for(var x=0;x<w;x+=8){g.beginPath();g.moveTo(x,0);g.lineTo(x,h);g.stroke();}
  for(var y=0;y<h;y+=8){g.beginPath();g.moveTo(0,y);g.lineTo(w,y);g.stroke();}
  g.strokeStyle='rgba(255,255,255,.10)';
  for(var x2=0;x2<w;x2+=32){g.beginPath();g.moveTo(x2,0);g.lineTo(x2,h);g.stroke();}
  for(var y2=0;y2<h;y2+=32){g.beginPath();g.moveTo(0,y2);g.lineTo(w,y2);g.stroke();}
  grain(g,1200,.06,w,h);
});
TX.sleeveNormal=normalFrom(256,256,function(g,w,h){
  g.fillStyle='#808080';g.fillRect(0,0,w,h);
  g.fillStyle='#9c9c9c';
  for(var x=0;x<w;x+=8){g.fillRect(x,0,2,h);}
  for(var y=0;y<h;y+=8){g.fillRect(0,y,w,2);}
  g.fillStyle='#b4b4b4';
  for(var x2=0;x2<w;x2+=32){g.fillRect(x2,0,3,h);}
  for(var y2=0;y2<h;y2+=32){g.fillRect(0,y2,w,3);}
},null,null,1.2);

/* Weapon finishes: fine anodised/cerakote grain for metal, stipple for polymer, and a
   roughness map with worn, handled patches. Box-mapped parts read these as surface texture. */
TX.weaponNormal=normalFrom(256,256,function(g,w,h){
  g.fillStyle='#808080';g.fillRect(0,0,w,h);
  for(var i=0;i<9000;i++){var v=Math.round(rr(112,144));g.fillStyle='rgb('+v+','+v+','+v+')';g.fillRect(rnd()*w,rnd()*h,rr(1,2),rr(1,2));}
},null,null,1.0);
TX.polymerNormal=normalFrom(256,256,function(g,w,h){
  g.fillStyle='#808080';g.fillRect(0,0,w,h);
  for(var y=4;y<h;y+=7)for(var x=4;x<w;x+=7){var v=Math.round(rr(150,190));g.fillStyle='rgb('+v+','+v+','+v+')';g.beginPath();g.arc(x+rr(-1.5,1.5),y+rr(-1.5,1.5),rr(1.6,2.4),0,TAU);g.fill();}
},null,null,2.2);
TX.weaponRough=dataTex(256,256,function(g,w,h){
  g.fillStyle='#8a8a8a';g.fillRect(0,0,w,h);
  blotches(g,10,w,h,20,70,'60,60,60',.5);                              /* handled, polished by wear */
  blotches(g,8,w,h,20,60,'180,180,180',.4);                            /* dusty, dry patches */
  for(var i=0;i<40;i++){g.fillStyle='rgba(50,50,50,'+rr(.3,.7)+')';g.fillRect(rnd()*w,rnd()*h,rr(6,30),1);}
});

/* Enemy shell: painted machine steel with panel lines, fasteners, chips and scratches */
TX.enemyShell=paint(256,256,function(g,w,h){
  g.fillStyle='#4f5a56';g.fillRect(0,0,w,h);
  blotches(g,10,w,h,30,110,'70,80,76',.4);
  blotches(g,8,w,h,30,90,'30,36,34',.35);
  g.strokeStyle='rgba(18,22,22,.75)';g.lineWidth=2.5;
  g.strokeRect(14,14,w-28,h-28);g.strokeRect(40,40,w-80,h-80);
  g.beginPath();g.moveTo(14,128);g.lineTo(w-14,128);g.stroke();
  for(var i=0;i<12;i++){var x=24+(i%6)*40+8,y=i<6?26:h-26;g.fillStyle='#1c2220';g.beginPath();g.arc(x,y,4.5,0,TAU);g.fill();g.fillStyle='#8a9490';g.beginPath();g.arc(x,y,2.5,0,TAU);g.fill();}
  cracks(g,26,w,h,'rgba(190,198,194,.35)',1,4,8);                     /* bright scratches */
  for(var c=0;c<26;c++){g.fillStyle='rgba(28,24,20,'+rr(.4,.8)+')';g.beginPath();g.ellipse(rnd()*w,rnd()*h,rr(2,6),rr(1.5,4),rnd()*TAU,0,TAU);g.fill();}  /* paint chips */
  grain(g,1200,.08,w,h);
});
TX.enemyNormal=normalFrom(256,256,function(g,w,h){
  g.fillStyle='#808080';g.fillRect(0,0,w,h);
  g.strokeStyle='#3a3a3a';g.lineWidth=3;g.strokeRect(14,14,w-28,h-28);g.strokeRect(40,40,w-80,h-80);
  g.beginPath();g.moveTo(14,128);g.lineTo(w-14,128);g.stroke();
  for(var i=0;i<12;i++){var x=24+(i%6)*40+8,y=i<6?26:h-26;g.fillStyle='#b8b8b8';g.beginPath();g.arc(x,y,4.5,0,TAU);g.fill();}
  for(var c=0;c<20;c++){g.fillStyle='#606060';g.beginPath();g.ellipse(rnd()*w,rnd()*h,rr(2,6),rr(1.5,4),rnd()*TAU,0,TAU);g.fill();}
},null,null,2.0);
TX.enemyRough=dataTex(256,256,function(g,w,h){
  g.fillStyle='#8c8c8c';g.fillRect(0,0,w,h);
  blotches(g,8,w,h,20,80,'190,190,190',.5);
  cracks(g,20,w,h,'rgba(60,60,60,.7)',1,4,8);
});

/* ============================ station dressing graphics ============================ */
TX.vendingFront=paint(512,512,function(g,w,h){
  g.fillStyle='#0d1113';g.fillRect(0,0,w,h);
  var bgG=g.createLinearGradient(0,40,0,440);
  bgG.addColorStop(0,'#1a2a30');bgG.addColorStop(0.5,'#283c42');bgG.addColorStop(1,'#0d1618');
  g.fillStyle=bgG;g.fillRect(24,40,w-48,400);
  var canCols=['#e2452c','#00f0ff','#e8a33d','#57b391','#9b59b6','#f39c12'];
  for(var si=0;si<4;si++){
    var sy=60+si*95;
    g.fillStyle='#506064';g.fillRect(28,sy+75,w-56,8);
    g.fillStyle='#809498';g.fillRect(28,sy+75,w-56,2);
    for(var ci=0;ci<8;ci++){
      var cx=42+ci*54;
      if(rnd()<.18)continue;                                           /* a few slots sold out */
      g.fillStyle=canCols[(si*3+ci)%canCols.length];
      g.fillRect(cx,sy,38,72);
      g.fillStyle='rgba(255,255,255,0.45)';g.fillRect(cx+6,sy,8,72);
      g.fillStyle='rgba(0,0,0,0.35)';g.fillRect(cx+26,sy,12,72);
      g.fillStyle='#d8e2e6';g.fillRect(cx+2,sy-3,34,5);
    }
  }
  g.fillStyle='#090c0e';g.fillRect(24,455,w-48,45);
  g.fillStyle='#304044';g.fillRect(28,458,w-56,6);
  g.fillStyle='#00f3ff';g.shadowColor='#00f3ff';g.shadowBlur=12;
  g.fillRect(w-95,120,60,35);
  g.fillStyle='#ffffff';g.font='bold 16px monospace';g.fillText('$2.50',w-88,144);
  g.shadowBlur=0;
  var glass=g.createLinearGradient(0,0,w,h);glass.addColorStop(0,'rgba(255,255,255,.10)');glass.addColorStop(.5,'rgba(255,255,255,0)');glass.addColorStop(1,'rgba(255,255,255,.06)');
  g.fillStyle=glass;g.fillRect(24,40,w-48,400);
});

TX.ticketScreen=paint(512,512,function(g,w,h){
  g.fillStyle='#081418';g.fillRect(0,0,w,h);
  g.fillStyle='#00e5ff';g.fillRect(0,0,w,70);
  g.fillStyle='#081418';g.font='bold 34px Helvetica,Arial';g.fillText('TRANSIT TICKETS',24,48);
  g.fillStyle='#102228';g.fillRect(24,90,w-48,260);
  g.strokeStyle='#00e5ff';g.lineWidth=8;g.lineCap='round';
  g.beginPath();g.moveTo(60,140);g.lineTo(160,220);g.lineTo(320,220);g.lineTo(440,160);g.stroke();
  g.strokeStyle='#ffb830';g.lineWidth=6;
  g.beginPath();g.moveTo(80,300);g.lineTo(240,220);g.lineTo(400,280);g.stroke();
  var dots=[[60,140],[160,220],[320,220],[440,160],[240,220]];
  for(var di=0;di<dots.length;di++){
    g.fillStyle='#ffffff';g.beginPath();g.arc(dots[di][0],dots[di][1],9,0,TAU);g.fill();
    g.fillStyle='#081418';g.beginPath();g.arc(dots[di][0],dots[di][1],4,0,TAU);g.fill();
  }
  g.fillStyle='#00c853';g.fillRect(24,370,220,55);
  g.fillStyle='#ffffff';g.font='bold 24px Helvetica,Arial';g.fillText('SINGLE RIDE',45,406);
  g.fillStyle='#2979ff';g.fillRect(268,370,220,55);
  g.fillStyle='#ffffff';g.fillText('DAY PASS',315,406);
  g.fillStyle='#ffab00';g.font='bold 20px monospace';
  g.fillText('>> INSERT TRANSIT CARD OR TAP PHONE <<',40,470);
});

TX.hazard=paint(256,256,function(g,w,h){
  g.fillStyle='#202527';g.fillRect(0,0,w,h);
  g.fillStyle='#e8a33d';
  for(var x=-256;x<512;x+=64){
    g.beginPath();g.moveTo(x,0);g.lineTo(x+32,0);g.lineTo(x+32+256,256);g.lineTo(x+256,256);g.fill();
  }
  blotches(g,6,w,h,20,60,'20,18,16',.4);
  grain(g,400,.08,w,h);
});

function signBoard(bg,fn){return paint(512,256,function(g,w,h){g.fillStyle=bg;g.fillRect(0,0,w,h);fn(g,w,h);blotches(g,4,w,h,20,80,'20,20,20',.18);grain(g,300,.05,w,h);});}
TX.name=signBoard('#12242a',function(g,w,h){
  g.fillStyle='#eef1e8';g.font='700 92px Helvetica,Arial';g.fillText('NORTHGATE',24,116);
  g.fillStyle='#e8a33d';g.fillRect(24,140,464,7);
  g.fillStyle='#93a5a3';g.font='34px Helvetica,Arial';g.fillText('NORTHBOUND · PLATFORM 4',24,196);
});
TX.times=signBoard('#0d1a1e',function(g,w,h){
  g.fillStyle='#e8a33d';g.font='700 40px Helvetica,Arial';g.fillText('LAST SERVICE',22,54);
  g.fillStyle='#eef1e8';g.font='700 76px Helvetica,Arial';g.fillText('04:12',22,132);
  g.fillStyle='#57b391';g.font='30px Helvetica,Arial';g.fillText('DELAYED — HOLD PLATFORM',22,182);
  g.fillStyle='#2a3d40';g.fillRect(22,200,468,4);
  g.fillStyle='#7f918f';g.font='26px Helvetica,Arial';g.fillText('NEXT: NO FURTHER SERVICE',22,238);
});
TX.map=signBoard('#dfe3d6',function(g,w,h){
  g.fillStyle='#17302e';g.font='700 34px Helvetica,Arial';g.fillText('NORTH LINE',20,44);
  g.strokeStyle='#2f7d6b';g.lineWidth=13;g.lineCap='round';
  g.beginPath();g.moveTo(60,90);g.lineTo(60,150);g.lineTo(190,196);g.lineTo(330,196);g.stroke();
  g.strokeStyle='#c07b2f';g.lineWidth=9;
  g.beginPath();g.moveTo(120,240);g.lineTo(300,80);g.lineTo(470,80);g.stroke();
  var stops=[[60,90],[60,130],[120,174],[240,196],[330,196],[300,80],[400,80]];
  for(var i=0;i<stops.length;i++){g.fillStyle='#f3f5ec';g.beginPath();g.arc(stops[i][0],stops[i][1],9,0,TAU);g.fill();
    g.strokeStyle='#17302e';g.lineWidth=3;g.stroke();}
  g.fillStyle='#c0392b';g.beginPath();g.arc(60,130,15,0,TAU);g.fill();
  g.fillStyle='#17302e';g.font='700 18px Helvetica,Arial';g.fillText('YOU ARE HERE',86,136);
});
TX.ad1=signBoard('#c1502a',function(g,w,h){
  g.fillStyle='#f6dfb8';g.font='700 78px Helvetica,Arial';
  g.fillText('GO',34,96);g.fillText('SOME',34,172);g.fillText('WHERE.',34,244);
  g.fillStyle='#12242a';g.fillRect(360,0,152,h);
  g.fillStyle='#e8a33d';g.font='700 26px Helvetica,Arial';g.fillText('CITY',382,60);g.fillText('TRANSIT',382,92);
});
TX.ad2=signBoard('#173a45',function(g,w,h){
  g.fillStyle='#eef1e8';g.font='700 54px Helvetica,Arial';g.fillText('Nightshift',30,80);
  g.fillStyle='#57b391';g.font='30px Helvetica,Arial';g.fillText('coffee that keeps',30,132);
  g.fillText('the lights on',30,172);
  g.fillStyle='#e8a33d';g.fillRect(30,196,180,6);
  g.fillStyle='#e8a33d';g.beginPath();g.arc(410,120,74,0,TAU);g.fill();
  g.fillStyle='#173a45';g.font='700 30px Helvetica,Arial';g.fillText('24h',382,132);
});
TX.ad3=signBoard('#1b1f2b',function(g,w,h){
  g.fillStyle='#d6d9cc';g.font='700 44px Helvetica,Arial';g.fillText('MIND THE',30,72);
  g.fillStyle='#e2452c';g.font='700 76px Helvetica,Arial';g.fillText('GAP',30,150);
  g.fillStyle='#7f918f';g.font='24px Helvetica,Arial';g.fillText('Between train and platform',30,196);
  g.fillStyle='#e8a33d';for(var x=30;x<482;x+=44){g.fillRect(x,216,26,10);}
});
TX.exit=signBoard('#0f2b22',function(g,w,h){
  g.fillStyle='#57b391';g.font='700 96px Helvetica,Arial';g.fillText('EXIT',60,158);
  g.fillStyle='#57b391';g.beginPath();g.moveTo(360,80);g.lineTo(440,128);g.lineTo(360,176);g.fill();
});
TX.hang=signBoard('#12242a',function(g,w,h){
  g.fillStyle='#eef1e8';g.font='700 54px Helvetica,Arial';g.fillText('PLATFORM 4',26,80);
  g.fillStyle='#e8a33d';g.font='700 44px Helvetica,Arial';g.fillText('NORTHBOUND',26,150);
  g.fillStyle='#93a5a3';g.font='30px Helvetica,Arial';g.fillText('STAIRS · STREET LEVEL',26,206);
  g.fillStyle='#eef1e8';g.beginPath();g.moveTo(424,110);g.lineTo(470,150);g.lineTo(424,190);g.fill();
});

/* ============================ materials ============================ */
function mat(map,o){
  o=o||{};
  var m=new THREE.MeshStandardMaterial({map:map,roughness:o.rough===undefined?0.88:o.rough,
    metalness:o.metal===undefined?0.06:o.metal,color:o.color===undefined?0xffffff:o.color});
  if(o.emissive){m.emissive=new THREE.Color(o.emissive);m.emissiveIntensity=o.ei||1;}
  if(o.side)m.side=o.side;
  if(o.normal){m.normalMap=o.normal;m.normalScale=new THREE.Vector2(o.ns||0.6,o.ns||0.6);}
  if(o.bump){m.bumpMap=o.bump;m.bumpScale=o.bs||0.04;}
  if(o.roughMap)m.roughnessMap=o.roughMap;
  if(o.metalMap)m.metalnessMap=o.metalMap;
  m.envMapIntensity=o.envMapI===undefined?0.3:o.envMapI;
  m.userData.envSet=true;   /* graphics.js leaves explicitly tuned reflection strengths alone */
  return m;
}
function plain(color,rough,metal,envMapI){
  var m=new THREE.MeshStandardMaterial({color:color,roughness:rough,metalness:metal});
  m.envMapIntensity=envMapI===undefined?0.3:envMapI;m.userData.envSet=true;return m;
}

/* Soft contact occlusion decals under props (no GPU light cost) */
var contactShadowMat=new THREE.MeshBasicMaterial({
  map:TX.contactShadow,
  transparent:true,
  opacity:0.65,
  depthWrite:false
});
var shadowPlaneGeo=new THREE.PlaneGeometry(1,1);
function addContactShadow(x,z,sx,sz,opacity){
  var plane=new THREE.Mesh(shadowPlaneGeo,contactShadowMat);
  plane.rotation.x=-Math.PI/2;
  plane.position.set(x,0.042,z);
  plane.scale.set(sx,sz,1);
  if(opacity!==undefined)plane.material=contactShadowMat.clone();
  if(opacity!==undefined)plane.material.opacity=opacity;
  world.add(plane);
  return plane;
}
/* the tile maps are cloned once per repeat and shared between materials that tile the same way */
var tileWall=rep(TX.tile,16,1.5),tileWallN=rep(TX.tileBump,16,1.5),tileWallR=rep(TX.tileRough,16,1.5);
var M={
  tile:mat(tileWall,{rough:1,metal:.02,normal:tileWallN,ns:.65,roughMap:tileWallR,envMapI:.55}),
  tileFar:mat(tileWall,{rough:1,metal:.02,color:0xb4bdbb,normal:tileWallN,ns:.65,roughMap:tileWallR,envMapI:.45}),
  tileEnd:mat(rep(TX.tile,2,1.5),{rough:1,metal:.02,color:0xb4bdbb,normal:rep(TX.tileBump,2,1.5),ns:.65,roughMap:rep(TX.tileRough,2,1.5),envMapI:.45}),
  tileCol:mat(rep(TX.tile,.18,1.5),{rough:1,metal:.02,normal:rep(TX.tileBump,.18,1.5),ns:.55,roughMap:rep(TX.tileRough,.18,1.5),envMapI:.55}),
  wainscot:mat(rep(TX.wainscot,16,1),{rough:1,metal:.06,roughMap:rep(TX.wainscotRough,16,1),envMapI:.58}),
  floor:mat(rep(TX.concrete,2,12),{rough:1,metal:.03,normal:rep(TX.concBump,2,12),ns:.55,roughMap:rep(TX.concRough,2,12),envMapI:.48}),
  gravel:mat(rep(TX.gravel,12,64),{rough:.96,envMapI:.15}),
  metal:mat(rep(TX.metal,1,1),{rough:1,metal:.8,normal:TX.metalNormal,ns:.35,roughMap:TX.metalRough,envMapI:.65}),
  metalLong:plain(0x353f42,.44,.86,.65),
  rail:plain(0xdee3e1,.12,.98,1.1),
  railRust:mat(rep(TX.rust,1,24),{rough:.88,metal:.35,envMapI:.15}),
  sleeper:plain(0x47443e,.92,.05,.1),
  panel:mat(rep(TX.panel,6,26),{rough:1,roughMap:rep(TX.panelRough,6,26),envMapI:.15}),
  tactile:mat(rep(TX.tactile,1,72),{rough:.58,metal:.12,envMapI:.30}),
  paintLine:mat(rep(TX.paintLine,1,60),{rough:.68,metal:.02,envMapI:.35}),
  grime:mat(rep(TX.grime,4,3),{rough:1,envMapI:.1}),
  face:mat(rep(TX.grime,42,1),{rough:1,envMapI:.1}),
  dark:plain(0x0c1416,.92,0,.1),
  black:new THREE.MeshBasicMaterial({color:0x030608}),
  train:mat(rep(TX.train,3,1),{rough:1,metal:.75,color:0xb4bebf,normal:rep(TX.trainNormal,3,1),ns:.45,roughMap:rep(TX.trainRough,3,1),envMapI:.75}),
  /* glass is a dielectric: at metalness .85 three strips almost all the diffuse and tints the
     specular with the base colour, so every train window, cab screen, vending front and kiosk
     panel rendered as dark teal chrome. Metalness 0 and a pale tint let the envMap carry it. */
  glass:new THREE.MeshStandardMaterial({color:0x93aab1,roughness:.06,metalness:0,transparent:true,opacity:.5,envMapIntensity:1.2}),
  /* A diffuser at 0.97 was the brightest thing the old 8-bit buffer could hold, so the lamps sat
     at the same level as a white tile and bloomed like one. In linear HDR they can be what they
     are: well past 1.0, which is what the bloom threshold is now looking for. */
  lamp:new THREE.MeshBasicMaterial({map:TX.lampFace,color:new THREE.Color(0xf8f6ee).multiplyScalar(3.4)}),
  paint:plain(0x243236,.60,.20,.38),
  orange:plain(0xc1502a,.56,.08,.32),
  conduit:plain(0x828b90,.46,.88,.65),
  duct:plain(0x929ba0,.40,.78,.60),
  redBox:plain(0xa8261a,.48,.32,.45),
  amberLamp:new THREE.MeshBasicMaterial({color:0xffb038}),
  vendingChassis:plain(0x111517,.32,.84,.55),
  ticketKiosk:plain(0x2b3438,.26,.90,.65),
  benchWood:plain(0x4a2c1a,.40,.06,.32),
  benchMetal:plain(0x161e20,.38,.86,.55)
};
M.glass.envMapIntensity=1.2;M.glass.userData.envSet=true;
function signMat(t){var m=new THREE.MeshStandardMaterial({map:t,roughness:.42,metalness:.05,emissive:0xffffff,emissiveMap:t,emissiveIntensity:.3});m.envMapIntensity=.5;m.userData.envSet=true;return m;}

/* ============================ station light baker ============================ */
/* Bakes fixture irradiance and contact occlusion for one static surface into a lightmap
   (added as indirect light) and an occlusion map (scales ambient). toWorld(u,v) maps the
   texture to the surface, (nx,ny,nz) is its normal, emitters carry position, colour, power and
   a downward lobe flag, occluders are boxes with a reach and a strength. Runs once at load. */
function bakeSurface(W,H,toWorld,nx,ny,nz,emitters,occluders,opt){
  opt=opt||{};
  var gain=opt.gain||1;
  var lc=document.createElement('canvas');lc.width=W;lc.height=H;
  var ac=document.createElement('canvas');ac.width=W;ac.height=H;
  var lg=lc.getContext('2d'),ag=ac.getContext('2d');
  var li=lg.createImageData(W,H),ai=ag.createImageData(W,H),ld=li.data,ad=ai.data;
  var samples=[];
  for(var e=0;e<emitters.length;e++){
    var em=emitters[e],n=em.samples||1,len=em.length||0;
    for(var s=0;s<n;s++){
      var f=n>1?(s/(n-1)-0.5):0;
      samples.push({x:em.x+(em.axis==='x'?f*len:0),y:em.y,z:em.z+(em.axis==='x'?0:f*len),r:em.r,g:em.g,b:em.b,p:em.power/n,down:!!em.down});
    }
  }
  for(var py=0;py<H;py++)for(var px=0;px<W;px++){
    var u=(px+0.5)/W,v=1-(py+0.5)/H;               /* canvas row 0 is the top of the texture (v=1) */
    var p=toWorld(u,v),x=p[0],y=p[1],z=p[2];
    var ao=1;
    for(var o=0;o<occluders.length;o++){
      var b=occluders[o];
      var dx=Math.max(b.min[0]-x,0,x-b.max[0]),dy=Math.max(b.min[1]-y,0,y-b.max[1]),dz=Math.max(b.min[2]-z,0,z-b.max[2]);
      var d=Math.sqrt(dx*dx+dy*dy+dz*dz);
      if(d<b.reach){var t=1-d/b.reach;ao*=1-b.strength*t*t;}
    }
    var r=0,g=0,bl=0;
    for(var k=0;k<samples.length;k++){
      var sm=samples[k],ex=sm.x-x,ey=sm.y-y,ez=sm.z-z;
      if(ez>24||ez<-24)continue;
      var d2=ex*ex+ey*ey+ez*ez,dist=Math.sqrt(d2);
      var cos=(nx*ex+ny*ey+nz*ez)/dist;
      if(cos<=0)continue;
      var lobe=sm.down?Math.pow(Math.max(0.10,-ey/dist),1.6):1;   /* reflector lobe: tighter pools */
      var E=sm.p*cos*lobe/(d2+0.35);
      r+=E*sm.r;g+=E*sm.g;bl+=E*sm.b;
    }
    var i=(py*W+px)*4,k2=gain*ao;
    ld[i]=Math.round(255*Math.pow(Math.min(1,r*k2),1/2.2));
    ld[i+1]=Math.round(255*Math.pow(Math.min(1,g*k2),1/2.2));
    ld[i+2]=Math.round(255*Math.pow(Math.min(1,bl*k2),1/2.2));
    ld[i+3]=255;
    var av=Math.round(255*ao);ad[i]=ad[i+1]=ad[i+2]=av;ad[i+3]=255;
  }
  lg.putImageData(li,0,0);ag.putImageData(ai,0,0);
  var lt=new THREE.CanvasTexture(lc);lt.encoding=THREE.sRGBEncoding;lt.wrapS=lt.wrapT=THREE.ClampToEdgeWrapping;lt.anisotropy=maxAniso;
  var at=new THREE.CanvasTexture(ac);at.wrapS=at.wrapT=THREE.ClampToEdgeWrapping;at.anisotropy=maxAniso;
  return {light:lt,ao:at};
}
/* attach a bake to a material; uv2 on the geometry is added by the world helpers */
function applyBake(material,bake,lightI,aoI){
  material.lightMap=bake.light;material.lightMapIntensity=lightI===undefined?1:lightI;
  material.aoMap=bake.ao;material.aoMapIntensity=aoI===undefined?1:aoI;
  material.needsUpdate=true;
}
