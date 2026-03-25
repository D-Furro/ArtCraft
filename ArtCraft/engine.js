/* engine.js — Core painting engine: CanvasEngine, BrushEngine, ToolManager, UndoManager */
'use strict';

// ─── UTILS ──────────────────────────────────────────────────────────────────
function hsvToRgb(h,s,v){s/=100;v/=100;const i=Math.floor(h/60)%6,f=(h/60)-Math.floor(h/60),p=v*(1-s),q=v*(1-f*s),t=v*(1-s*(1-f));const m=[[v,t,p],[q,v,p],[p,v,t],[p,q,v],[t,p,v],[v,p,q]][i];return m.map(x=>Math.round(x*255));}
function rgbToHsv(r,g,b){r/=255;g/=255;b/=255;const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;let h=0,s=max===0?0:d/max,v=max;if(d!==0){h=max===r?(g-b)/d+(g<b?6:0):max===g?(b-r)/d+2:(r-g)/d+4;h*=60;}return[h,s*100,v*100];}
function hexToRgb(hex){const n=parseInt(hex,16);return[(n>>16)&255,(n>>8)&255,n&255];}
function rgbToHex(r,g,b){return((r<<16)|(g<<8)|b).toString(16).padStart(6,'0');}
function clamp(v,lo,hi){return Math.max(lo,Math.min(hi,v));}

// ─── UNDO MANAGER ───────────────────────────────────────────────────────────
class UndoManager {
  constructor(){this.stacks=[];this.pos=-1;this.maxSteps=30;}
  push(layerData){// layerData: array of {id, imageData}
    this.stacks.splice(this.pos+1);
    if(this.stacks.length>=this.maxSteps)this.stacks.shift();
    this.stacks.push(layerData);
    this.pos=this.stacks.length-1;
  }
  undo(){if(this.pos>0){this.pos--;return this.stacks[this.pos];}return null;}
  redo(){if(this.pos<this.stacks.length-1){this.pos++;return this.stacks[this.pos];}return null;}
  canUndo(){return this.pos>0;}
  canRedo(){return this.pos<this.stacks.length-1;}
}

// ─── CANVAS ENGINE ───────────────────────────────────────────────────────────
class CanvasEngine {
  constructor(w,h){
    this.displayCanvas=document.getElementById('display-canvas');
    this.checkerboard=document.getElementById('checkerboard');
    this.cursorOverlay=document.getElementById('cursor-overlay');
    this.wrapper=document.getElementById('canvas-wrapper');
    this.viewport=document.getElementById('canvas-viewport');
    this.width=w||800;this.height=h||600;
    this.zoom=1;this.panX=0;this.panY=0;
    this.layers=[];this.activeLayerIdx=0;
    this.undo=new UndoManager();
    this._rafId=null;this._dirty=true;
    this._initDisplay();
    this._initCheckerboard();
    this._fitToView();
    this._startRenderLoop();
  }
  _initDisplay(){
    this.displayCanvas.width=this.width;
    this.displayCanvas.height=this.height;
    this.cursorOverlay.width=this.width;
    this.cursorOverlay.height=this.height;
    this.displayCanvas.style.width=this.width+'px';
    this.displayCanvas.style.height=this.height+'px';
    this.cursorOverlay.style.width=this.width+'px';
    this.cursorOverlay.style.height=this.height+'px';
  }
  _initCheckerboard(){
    const c=this.checkerboard;
    c.width=this.width;c.height=this.height;
    c.style.width=this.width+'px';c.style.height=this.height+'px';
    const ctx=c.getContext('2d'),sz=12;
    for(let y=0;y<this.height;y+=sz){
      for(let x=0;x<this.width;x+=sz){
        ctx.fillStyle=((x/sz+y/sz)%2===0)?'#cccccc':'#ffffff';
        ctx.fillRect(x,y,sz,sz);
      }
    }
  }
  resize(w,h){
    this.width=w;this.height=h;
    this.layers.forEach(l=>{
      const tmp=document.createElement('canvas');tmp.width=w;tmp.height=h;
      tmp.getContext('2d').drawImage(l.canvas,0,0);
      l.canvas=tmp;
    });
    this._initDisplay();
    this._initCheckerboard();
    this._fitToView();
    this._dirty=true;
  }
  _fitToView(){
    const vp=this.viewport;
    const vw=vp.clientWidth||800,vh=vp.clientHeight||600;
    const sx=(vw-20)/this.width,sy=(vh-20)/this.height;
    this.zoom=Math.min(sx,sy,1);
    this.panX=Math.round((vw-this.width*this.zoom)/2);
    this.panY=Math.round((vh-this.height*this.zoom)/2);
    this._applyTransform();
  }
  _applyTransform(){
    this.wrapper.style.transform=`translate(${this.panX}px,${this.panY}px) scale(${this.zoom})`;
    document.getElementById('zoom-display').textContent=Math.round(this.zoom*100)+'%';
  }
  setZoom(z,cx,cy){
    const oz=this.zoom;
    this.zoom=clamp(z,.05,32);
    this.panX=cx-(cx-this.panX)*this.zoom/oz;
    this.panY=cy-(cy-this.panY)*this.zoom/oz;
    this._applyTransform();
  }
  screenToCanvas(sx,sy){
    return{x:(sx-this.panX)/this.zoom,y:(sy-this.panY)/this.zoom};
  }
  _startRenderLoop(){
    const loop=()=>{if(this._dirty)this._composite();this._rafId=requestAnimationFrame(loop);};
    loop();
  }
  _composite(){
    this._dirty=false;
    const ctx=this.displayCanvas.getContext('2d');
    ctx.clearRect(0,0,this.width,this.height);
    for(let i=this.layers.length-1;i>=0;i--){
      const l=this.layers[i];
      if(!l.visible)continue;
      ctx.globalAlpha=l.opacity/100;
      ctx.globalCompositeOperation=l.blendMode||'source-over';
      ctx.drawImage(l.canvas,0,0);
    }
    ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
    // update thumbs
    this.layers.forEach(l=>l._thumbDirty&&this._updateThumb(l));
  }
  _updateThumb(l){
    if(!l._thumbEl)return;
    l._thumbDirty=false;
    const tc=document.createElement('canvas');tc.width=36;tc.height=28;
    const tx=tc.getContext('2d');tx.drawImage(l.canvas,0,0,36,28);
    l._thumbEl.src=tc.toDataURL();
  }
  markDirty(){this._dirty=true;}

  // ── LAYER OPS ──
  addLayer(name,idx){
    const c=document.createElement('canvas');c.width=this.width;c.height=this.height;
    const layer={canvas:c,name:name||'Camada '+(this.layers.length+1),visible:true,locked:false,opacity:100,blendMode:'source-over',_thumbDirty:true,_thumbEl:null};
    if(idx===undefined)this.layers.unshift(layer);
    else this.layers.splice(idx,0,layer);
    this.activeLayerIdx=idx===undefined?0:idx;
    this.markDirty();
    return layer;
  }
  addTextLayer(text,font,size,x,y,colorStr,idx){
    const c=document.createElement('canvas');c.width=this.width;c.height=this.height;
    const layer={
      canvas:c,name:text.substring(0,12)||'Texto',visible:true,locked:false,opacity:100,blendMode:'source-over',
      _thumbDirty:true,_thumbEl:null,
      isText:true,textData:{text,font,size,x,y,color:colorStr}
    };
    if(idx===undefined)this.layers.unshift(layer);
    else this.layers.splice(idx,0,layer);
    this.activeLayerIdx=idx===undefined?0:idx;
    this._renderTextLayer(layer);
    this.markDirty();
    return layer;
  }
  _renderTextLayer(layer){
    const ctx=layer.canvas.getContext('2d');
    ctx.clearRect(0,0,this.width,this.height);
    const d=layer.textData;
    ctx.font=`${d.size}px ${d.font}`;
    ctx.fillStyle=d.color;
    ctx.globalCompositeOperation='source-over';
    ctx.fillText(d.text,d.x,d.y);
    layer._thumbDirty=true;
  }
  updateActiveTextLayer(newData){
    const l=this.activeLayer;
    if(!l||!l.isText)return false;
    Object.assign(l.textData,newData);
    l.name=l.textData.text.substring(0,12)||'Texto';
    this._renderTextLayer(l);
    this.markDirty();
    return true;
  }
  deleteLayer(idx){
    if(this.layers.length<=1)return;
    this.layers.splice(idx,1);
    this.activeLayerIdx=clamp(this.activeLayerIdx,0,this.layers.length-1);
    this.markDirty();
  }
  duplicateLayer(idx){
    const src=this.layers[idx];
    const c=document.createElement('canvas');c.width=this.width;c.height=this.height;
    c.getContext('2d').drawImage(src.canvas,0,0);
    const dup={...src,canvas:c,name:src.name+' Cópia',_thumbEl:null,_thumbDirty:true};
    this.layers.splice(idx,0,dup);
    this.activeLayerIdx=idx;
    this.markDirty();
  }
  mergeDown(idx){
    if(idx>=this.layers.length-1)return;
    const top=this.layers[idx],bot=this.layers[idx+1];
    const bctx=bot.canvas.getContext('2d');
    bctx.globalAlpha=top.opacity/100;bctx.globalCompositeOperation=top.blendMode;
    bctx.drawImage(top.canvas,0,0);
    bctx.globalAlpha=1;bctx.globalCompositeOperation='source-over';
    this.layers.splice(idx,1);
    this.activeLayerIdx=idx<this.layers.length?idx:this.layers.length-1;
    bot._thumbDirty=true;this.markDirty();
  }

  get activeLayer(){return this.layers[this.activeLayerIdx];}

  // Snapshot for undo
  snapshot(){
    return this.layers.map(l=>{
      const id=l.canvas.getContext('2d').getImageData(0,0,l.canvas.width,l.canvas.height);
      return{
        id,name:l.name,visible:l.visible,locked:l.locked,opacity:l.opacity,blendMode:l.blendMode,
        isText:l.isText,textData:l.textData?{...l.textData}:null
      };
    });
  }
  restoreSnapshot(snap){
    // Restore same number of layers (matching by index)
    while(this.layers.length<snap.length){const c=document.createElement('canvas');c.width=this.width;c.height=this.height;this.layers.unshift({canvas:c,name:'L',visible:true,locked:false,opacity:100,blendMode:'source-over',_thumbDirty:true,_thumbEl:null});}
    while(this.layers.length>snap.length)this.layers.pop();
    snap.forEach((s,i)=>{
      const l=this.layers[i];
      l.canvas.width=s.id.width;l.canvas.height=s.id.height;
      l.canvas.getContext('2d').putImageData(s.id,0,0);
      l.name=s.name;l.visible=s.visible;l.locked=s.locked;l.opacity=s.opacity;l.blendMode=s.blendMode;
      l.isText=s.isText;l.textData=s.textData?{...s.textData}:null;
      l._thumbDirty=true;
    });
    this.markDirty();
  }
}

// ─── BRUSH ENGINE ────────────────────────────────────────────────────────────
class BrushEngine {
  constructor(engine){
    this.eng=engine;
    this.brushes=this._defaultBrushes();
    this.activeBrushIdx=0;
    this._lastX=0;this._lastY=0;this._dist=0;
    this._painting=false;
    // settings overrides from UI
    this.uiSize=null;this.uiOpacity=null;this.uiFlow=null;this.uiHardness=null;
    this.uiSpacing=null;this.uiScatter=null;this.uiAngle=null;
    // color
    this.color={h:0,s:0,v:0,a:100};
    // smear buffer
    this._smearBuf=null;
  }
  get brush(){return this.brushes[this.activeBrushIdx];}
  get size(){return this.uiSize??this.brush.size;}
  get opacity(){return this.uiOpacity??this.brush.opacity;}
  get flow(){return this.uiFlow??this.brush.flow;}
  get hardness(){return this.uiHardness??this.brush.hardness;}
  get spacing(){return this.uiSpacing??this.brush.spacing;}
  get scatter(){return this.uiScatter??this.brush.scatter;}
  get angle(){return this.uiAngle??this.brush.angle;}

  _defaultBrushes(){return[
    {name:'Hard Pen',   size:8,  opacity:100,flow:100,hardness:100,spacing:5, scatter:0, angle:0, texture:null, blendMode:'source-over', eraser:false,smear:false,desc:'Linha digital limpa'},
    {name:'Soft Brush', size:30, opacity:80, flow:60, hardness:0,  spacing:8, scatter:0, angle:0, texture:null, blendMode:'source-over', eraser:false,smear:false,desc:'Pincel suave'},
    {name:'Pencil',     size:6,  opacity:90, flow:80, hardness:70, spacing:4, scatter:5, angle:0, texture:'grain',blendMode:'source-over',eraser:false,smear:false,desc:'Lápis texturizado'},
    {name:'Marker',     size:20, opacity:60, flow:100,hardness:100,spacing:5, scatter:0, angle:0, texture:null, blendMode:'multiply', eraser:false,smear:false,desc:'Marcador plano'},
    {name:'Watercolor', size:40, opacity:40, flow:30, hardness:0,  spacing:10,scatter:8, angle:0, texture:null, blendMode:'source-over', eraser:false,smear:false,desc:'Aquarela molhada'},
    {name:'G-Pen',      size:5,  opacity:100,flow:100,hardness:90, spacing:3, scatter:0, angle:0, texture:null, blendMode:'source-over', eraser:false,smear:false,desc:'Caneta G (manga)'},
    {name:'Airbrush',   size:60, opacity:50, flow:40, hardness:0,  spacing:6, scatter:0, angle:0, texture:null, blendMode:'source-over', eraser:false,smear:false,desc:'Aerógrafo'},
    {name:'Rake',       size:15, opacity:100,flow:100,hardness:80, spacing:4, scatter:0, angle:0, texture:'rake',blendMode:'source-over', eraser:false,smear:false,desc:'Multi-cerdas'},
    {name:'Smear',      size:30, opacity:70, flow:50, hardness:30, spacing:5, scatter:0, angle:0, texture:null, blendMode:'source-over', eraser:false,smear:true, desc:'Borrar/misturar'},
    {name:'Eraser',     size:20, opacity:100,flow:100,hardness:50, spacing:5, scatter:0, angle:0, texture:null, blendMode:'destination-out',eraser:true,smear:false,desc:'Borracha'},
  ];}

  getRgba(){
    const [r,g,b]=hsvToRgb(this.color.h,this.color.s,this.color.v);
    return{r,g,b,a:this.color.a/100};
  }
  getColorStr(){const {r,g,b,a}=this.getRgba();return`rgba(${r},${g},${b},${a})`;}

  beginStroke(x,y,pressure){
    if(this.eng.activeLayer.locked||this.eng.activeLayer.isText)return;
    this._painting=true;
    this._lastX=x;this._lastY=y;this._dist=0;
    const ctx=this.eng.activeLayer.canvas.getContext('2d');
    if(this.brush.smear){this._smearBuf=ctx.getImageData(0,0,this.eng.width,this.eng.height);}
    this._stamp(ctx,x,y,pressure);
    this.eng.activeLayer._thumbDirty=true;
    this.eng.markDirty();
  }
  moveStroke(x,y,pressure){
    if(!this._painting)return;
    const dx=x-this._lastX,dy=y-this._lastY,d=Math.sqrt(dx*dx+dy*dy);
    if(d===0)return;
    const sp=Math.max(1,this.size*(this.spacing/100));
    const ctx=this.eng.activeLayer.canvas.getContext('2d');
    // Smooth stamp-along-line approach
    this._stampLine(ctx,this._lastX,this._lastY,x,y,pressure);
    this._lastX=x;this._lastY=y;
    this.eng.activeLayer._thumbDirty=true;
    this.eng.markDirty();
  }
  endStroke(){this._painting=false;this._smearBuf=null;}

  _stampLine(ctx,x0,y0,x1,y1,pressure){
    const dx=x1-x0,dy=y1-y0,d=Math.sqrt(dx*dx+dy*dy);
    if(d===0){this._stamp(ctx,x0,y0,pressure);return;}
    const sp=Math.max(1,this.size*(this.spacing/100));
    let dist=0;
    while(dist<d){
      const t=dist/d;
      const sx=x0+dx*t+((Math.random()-.5)*this.scatter);
      const sy=y0+dy*t+((Math.random()-.5)*this.scatter);
      this._stamp(ctx,sx,sy,pressure);
      dist+=sp;
    }
  }
  _stamp(ctx,x,y,pressure){
    const pr=Math.max(0.01,pressure||0.5);
    const sz=Math.max(1,this.size*pr);
    const sc=this.scatter,sc2=sc/2;
    const px=x+(Math.random()-.5)*sc2;
    const py=y+(Math.random()-.5)*sc2;
    const op=(this.opacity/100)*(this.flow/100)*pr;
    const {r,g,b}=this.getRgba();
    const bm=this.brush.blendMode||'source-over';
    ctx.save();
    ctx.globalAlpha=clamp(op,0,1);
    ctx.globalCompositeOperation=bm;

    if(this.brush.texture==='grain'){this._stampGrain(ctx,px,py,sz,r,g,b);}
    else if(this.brush.texture==='rake'){this._stampRake(ctx,px,py,sz,r,g,b,op);}
    else if(this.brush.texture&&this.brush._texImg){this._stampTexture(ctx,px,py,sz,r,g,b);}
    else if(this.brush.smear){this._stampSmear(ctx,px,py,sz);}
    else{this._stampCircle(ctx,px,py,sz,r,g,b);}
    ctx.restore();
  }
  _stampCircle(ctx,x,y,sz,r,g,b){
    const h=this.hardness/100,rad=sz/2;
    const grd=ctx.createRadialGradient(x,y,rad*h,x,y,rad);
    grd.addColorStop(0,`rgb(${r},${g},${b})`);
    grd.addColorStop(1,`rgba(${r},${g},${b},0)`);
    ctx.fillStyle=h>=1?`rgb(${r},${g},${b})`:grd;
    ctx.beginPath();ctx.arc(x,y,rad,0,Math.PI*2);ctx.fill();
  }
  _stampGrain(ctx,x,y,sz,r,g,b){
    const rad=sz/2;
    for(let i=0;i<6;i++){
      const rx=(Math.random()-.5)*rad,ry=(Math.random()-.5)*rad;
      ctx.fillStyle=`rgba(${r},${g},${b},${Math.random()*0.4+0.3})`;
      ctx.fillRect(x+rx,y+ry,Math.random()*2+1,Math.random()*2+1);
    }
    this._stampCircle(ctx,x,y,sz*.6,r,g,b);
  }
  _stampRake(ctx,x,y,sz,r,g,b){
    const tines=4,sp=sz/tines;
    for(let i=0;i<tines;i++){
      const ox=(i-(tines-1)/2)*sp;
      ctx.fillStyle=`rgb(${r},${g},${b})`;
      ctx.beginPath();ctx.arc(x+ox,y,sz/6,0,Math.PI*2);ctx.fill();
    }
  }
  _stampTexture(ctx,x,y,sz){
    ctx.drawImage(this.brush._texImg,x-sz/2,y-sz/2,sz,sz);
  }
  _stampSmear(ctx,x,y,sz){
    if(!this._smearBuf)return;
    const rad=sz/2,ix=Math.round(x-rad),iy=Math.round(y-rad),iw=Math.round(sz),ih=Math.round(sz);
    if(ix<0||iy<0||ix+iw>this.eng.width||iy+ih>this.eng.height)return;
    const picked=this.eng.activeLayer.canvas.getContext('2d').getImageData(ix,iy,iw,ih);
    // smear = draw picked data shifted slightly
    const tmpC=document.createElement('canvas');tmpC.width=iw;tmpC.height=ih;
    tmpC.getContext('2d').putImageData(picked,0,0);
    ctx.globalAlpha=0.3;ctx.globalCompositeOperation='source-over';
    ctx.drawImage(tmpC,ix+2,iy+2,iw,ih);
  }

  previewBrush(){
    const c=document.getElementById('brush-preview');
    const ctx=c.getContext('2d');
    ctx.clearRect(0,0,100,60);
    const {r,g,b}=this.getRgba();
    const savedColor=this.color;
    this.color={h:0,s:0,v:0,a:100};
    ctx.fillStyle=`rgba(30,30,40,1)`;ctx.fillRect(0,0,100,60);
    // draw a stroke preview on temp canvas
    const tmp=document.createElement('canvas');tmp.width=100;tmp.height=60;
    const tctx=tmp.getContext('2d');
    const oldP=this._painting;this._painting=true;
    for(let x=10;x<90;x+=1){
      const t=(x-10)/80;const y=30+Math.sin(t*Math.PI*1.5)*10;
      this._stamp(tctx,x,y,0.7);
    }
    this._painting=oldP;
    ctx.globalCompositeOperation='source-over';
    ctx.drawImage(tmp,0,0);
    this.color=savedColor;
  }

  // .ibp importer
  async importIbp(file){
    try{
      const zip=await JSZip.loadAsync(file);
      const jsonFile=zip.file('brush.json');
      if(!jsonFile)throw new Error('brush.json not found in .ibp');
      const json=JSON.parse(await jsonFile.async('string'));
      const b={
        name:json.name||file.name.replace('.ibp',''),
        size:json.size||10,opacity:json.opacity??100,flow:json.flow??100,
        hardness:json.hardness??100,spacing:json.spacing??10,
        scatter:json.scatter??0,angle:json.angle??0,
        blendMode:json.blendMode||'source-over',eraser:!!json.eraser,smear:!!json.smear,
        texture:json.textureId||null,_texImg:null,desc:'Importado',
      };
      const texFile=zip.file('texture.png');
      if(texFile){
        const blob=await texFile.async('blob');
        const url=URL.createObjectURL(blob);
        const img=new Image();await new Promise(res=>{img.onload=res;img.src=url;});
        b._texImg=img;b.texture='custom';
      }
      this.brushes.push(b);
      return b;
    }catch(e){throw e;}
  }
}

// ─── FLOOD FILL ──────────────────────────────────────────────────────────────
function floodFill(canvas,startX,startY,fillR,fillG,fillB,fillA,tolerance=20){
  startX=Math.round(startX);startY=Math.round(startY);
  const ctx=canvas.getContext('2d');
  const w=canvas.width,h=canvas.height;
  const imgData=ctx.getImageData(0,0,w,h);
  const data=imgData.data;
  const idx=(x,y)=>(y*w+x)*4;
  const si=idx(startX,startY);
  const sr=data[si],sg=data[si+1],sb=data[si+2],sa=data[si+3];
  const match=(i)=>{
    return Math.abs(data[i]-sr)<=tolerance&&Math.abs(data[i+1]-sg)<=tolerance&&Math.abs(data[i+2]-sb)<=tolerance&&Math.abs(data[i+3]-sa)<=tolerance;
  };
  const fa=Math.round(fillA*255);
  if(Math.abs(sr-fillR)<2&&Math.abs(sg-fillG)<2&&Math.abs(sb-fillB)<2&&Math.abs(sa-fa)<2)return;
  const visited=new Uint8Array(w*h);
  const queue=[startX+startY*w];
  visited[startX+startY*w]=1;
  while(queue.length){
    const pos=queue.shift();
    const x=pos%w,y=Math.floor(pos/w);
    const pi=pos*4;
    data[pi]=fillR;data[pi+1]=fillG;data[pi+2]=fillB;data[pi+3]=fa;
    const neighbors=[[x-1,y],[x+1,y],[x,y-1],[x,y+1]];
    for(const[nx,ny]of neighbors){
      if(nx<0||nx>=w||ny<0||ny>=h)continue;
      const np=nx+ny*w;
      if(visited[np])continue;
      visited[np]=1;
      if(match(np*4))queue.push(np);
    }
  }
  ctx.putImageData(imgData,0,0);
}

// ─── TOOL MANAGER ────────────────────────────────────────────────────────────
class ToolManager {
  constructor(eng,brushEng){
    this.eng=eng;this.be=brushEng;
    this.activeTool='brush';
    this._selecting=false;this._selStart=null;this._selRect=null;
    this._selCanvas=null;
    this._moving=false;this._moveStart=null;this._moveLayerData=null;
    this._panning=false;this._panStart=null;
    this._textPending=null;
    this._initEvents();
  }
  setTool(t){this.activeTool=t;}

  _initEvents(){
    const vp=this.eng.viewport;
    vp.addEventListener('pointerdown',e=>this._onDown(e),{passive:false});
    vp.addEventListener('pointermove',e=>this._onMove(e),{passive:false});
    vp.addEventListener('pointerup',e=>this._onUp(e));
    vp.addEventListener('pointercancel',e=>this._onUp(e));
    vp.addEventListener('wheel',e=>this._onWheel(e),{passive:false});
    window.addEventListener('keydown',e=>this._onKey(e));
  }

  _pos(e){
    const rect=this.eng.viewport.getBoundingClientRect();
    const sx=e.clientX-rect.left,sy=e.clientY-rect.top;
    return this.eng.screenToCanvas(sx,sy);
  }
  _screenPos(e){
    const rect=this.eng.viewport.getBoundingClientRect();
    return{x:e.clientX-rect.left,y:e.clientY-rect.top};
  }

  _onDown(e){
    e.preventDefault();
    // Middle button or Space pan
    if(e.button===1||(e.button===0&&e.spaceKey)){this._startPan(e);return;}
    const p=this._pos(e);
    const pr=e.pressure||0.5;
    // save undo before stroke
    this._saveUndo();
    switch(this.activeTool){
      case'brush':case'eraser':this.be.beginStroke(p.x,p.y,pr);break;
      case'fill':{
        if(this.eng.activeLayer.locked||this.eng.activeLayer.isText)return;
        const {r,g,b,a}=this.be.getRgba();
        floodFill(this.eng.activeLayer.canvas,p.x,p.y,r,g,b,a);
        this.eng.activeLayer._thumbDirty=true;this.eng.markDirty();
        break;}
      case'eyedropper':{
        const imgD=this.eng.displayCanvas.getContext('2d').getImageData(Math.round(p.x),Math.round(p.y),1,1).data;
        const [hh,ss,vv]=rgbToHsv(imgD[0],imgD[1],imgD[2]);
        this.be.color={h:hh,s:ss,v:vv,a:(imgD[3]/255)*100};
        window._ui&&window._ui.syncColorFromEngine();
        break;}
      case'select-rect':this._selecting=true;this._selStart=p;this._selRect=null;break;
      case'lasso':this._selectingLasso=true;this._lassoPoints=[p];break;
      case'move':this._startMove(e,p);break;
      case'text':this._placeText(p);break;
      case'select':{
        let found=-1;
        const ctx=this.eng.displayCanvas.getContext('2d');
        for(let i=0;i<this.eng.layers.length;i++){
          const l=this.eng.layers[i];
          if(l.isText&&l.visible&&!l.locked){
            const d=l.textData;
            ctx.font=`${d.size}px ${d.font}`;
            const w=ctx.measureText(d.text).width;
            const h=d.size;
            if(p.x>=d.x&&p.x<=d.x+w&&p.y>=d.y-h&&p.y<=d.y+h*0.2){
              found=i;break;
            }
          }
        }
        if(found!==-1){
          this.eng.activeLayerIdx=found;
          window._ui&&window._ui.refreshLayersPanel();
          this._placeText(p);
        }else{
          window._ui&&window._ui.toast('Nenhum texto selecionado nesta área');
        }
        break;}
    }
  }
  _onMove(e){
    if(this._panning){this._doPan(e);return;}
    const p=this._pos(e);const pr=e.pressure||0.5;
    // cursor overlay
    this._drawCursor(p,this.be.size);
    switch(this.activeTool){
      case'brush':case'eraser':case'blur':this.be.moveStroke(p.x,p.y,pr);break;
      case'select-rect':if(this._selecting)this._drawSelRect(this._selStart,p);break;
      case'lasso':if(this._selectingLasso)this._lassoPoints.push(p);break;
      case'move':if(this._moving)this._doMove(p);break;
    }
  }
  _onUp(e){
    if(this._panning){this._panning=false;return;}
    const p=this._pos(e);
    switch(this.activeTool){
      case'brush':case'eraser':case'blur':this.be.endStroke();break;
      case'select-rect':this._selecting=false;break;
      case'lasso':this._selectingLasso=false;break;
      case'move':this._moving=false;break;
    }
  }
  _onWheel(e){
    e.preventDefault();
    const sp=this._screenPos(e);
    const factor=e.deltaY<0?1.1:0.9;
    this.eng.setZoom(this.eng.zoom*factor,sp.x,sp.y);
  }
  _onKey(e){
    if(e.code==='Space')this._spaceDown=true;
    if(e.ctrlKey&&e.key==='z'){e.preventDefault();window._app&&window._app.undo();}
    if(e.ctrlKey&&(e.key==='y'||e.key==='Y')){e.preventDefault();window._app&&window._app.redo();}
    // tool shortcuts
    const map={b:'brush',e:'eraser',g:'fill',i:'eyedropper',m:'select-rect',l:'lasso',v:'move',t:'text'};
    if(!e.ctrlKey&&!e.altKey&&map[e.key])window._ui&&window._ui.setTool(map[e.key]);
  }
  _saveUndo(){
    if(this.activeTool==='eyedropper')return;
    this.eng.undo.push(this.eng.snapshot());
  }
  _startPan(e){this._panning=true;this._panStart={x:e.clientX-this.eng.panX,y:e.clientY-this.eng.panY};}
  _doPan(e){
    if(!this._panStart)return;
    this.eng.panX=e.clientX-this._panStart.x;
    this.eng.panY=e.clientY-this._panStart.y;
    this.eng._applyTransform();
  }
  _drawSelRect(a,b){
    const oCtx=this.eng.cursorOverlay.getContext('2d');
    oCtx.clearRect(0,0,this.eng.width,this.eng.height);
    oCtx.setLineDash([5,3]);oCtx.strokeStyle='#5b8ff9';oCtx.lineWidth=1;
    oCtx.strokeRect(Math.min(a.x,b.x),Math.min(a.y,b.y),Math.abs(b.x-a.x),Math.abs(b.y-a.y));
    this._selRect={x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.abs(b.x-a.x),h:Math.abs(b.y-a.y)};
  }
  _startMove(e,p){
    if(this.eng.activeLayer.locked)return;
    this._moving=true;this._moveStart=p;
    const ctx=this.eng.activeLayer.canvas.getContext('2d');
    this._moveLayerData=ctx.getImageData(0,0,this.eng.width,this.eng.height);
    this._moveLayerPos={x:0,y:0};
  }
  _doMove(p){
    if(!this._moveStart||!this._moveLayerData)return;
    const dx=Math.round(p.x-this._moveStart.x),dy=Math.round(p.y-this._moveStart.y);
    const l=this.eng.activeLayer;
    const ctx=l.canvas.getContext('2d');
    ctx.clearRect(0,0,this.eng.width,this.eng.height);
    ctx.putImageData(this._moveLayerData,dx,dy);
    l._thumbDirty=true;this.eng.markDirty();
  }
  _placeText(p){
    const modal=document.getElementById('modal-text');
    const overlay=document.getElementById('modal-overlay');
    const input=document.getElementById('text-input');
    
    // If active layer is text, edit it instead of creating new
    if(this.eng.activeLayer&&this.eng.activeLayer.isText){
      this._textEditingLayer=this.eng.activeLayer;
      this._textPendingPos=null;
      input.value=this.eng.activeLayer.textData.text;
      document.getElementById('text-font').value=this.eng.activeLayer.textData.font;
      document.getElementById('text-size').value=this.eng.activeLayer.textData.size;
    }else{
      this._textEditingLayer=null;
      this._textPendingPos=p;
      input.value='';
    }
    
    overlay.classList.remove('hidden');modal.classList.remove('hidden');
    setTimeout(()=>input.focus(),50);
  }
  commitText(text,font,size){
    if(!text)return;
    const colorStr=this.be.getColorStr();
    if(this._textEditingLayer){
      this.eng.updateActiveTextLayer({text,font,size,color:colorStr});
    }else if(this._textPendingPos){
      // Insert new layer specifically above active layer
      this.eng.addTextLayer(text,font,size,this._textPendingPos.x,this._textPendingPos.y,colorStr,this.eng.activeLayerIdx);
    }
    this._textPendingPos=null;
    this._textEditingLayer=null;
    window._ui&&window._ui.refreshLayersPanel();
  }
  _drawCursor(p,sz){
    const ctx=this.eng.cursorOverlay.getContext('2d');
    ctx.clearRect(0,0,this.eng.width,this.eng.height);
    if(this.activeTool==='brush'||this.activeTool==='eraser'||this.activeTool==='blur'){
      const r=sz/2;
      ctx.beginPath();ctx.arc(p.x,p.y,Math.max(1,r),0,Math.PI*2);
      ctx.strokeStyle='rgba(255,255,255,0.7)';ctx.lineWidth=1;ctx.stroke();
      ctx.beginPath();ctx.arc(p.x,p.y,Math.max(1,r),0,Math.PI*2);
      ctx.strokeStyle='rgba(0,0,0,0.5)';ctx.lineWidth=0.5;ctx.stroke();
    }
  }
}

// ─── BLUR TOOL ───────────────────────────────────────────────────────────────
BrushEngine.prototype._blurStamp=function(ctx,x,y,sz){
  const r=sz/2,ix=Math.round(x-r),iy=Math.round(y-r),iw=Math.round(sz),ih=Math.round(sz);
  if(ix<0||iy<0||ix+iw>this.eng.width||iy+ih>this.eng.height)return;
  const tmpC=document.createElement('canvas');tmpC.width=iw;tmpC.height=ih;
  const tctx=tmpC.getContext('2d');
  tctx.filter=`blur(${sz*0.3}px)`;
  tctx.drawImage(ctx.canvas,ix,iy,iw,ih,0,0,iw,ih);
  ctx.save();ctx.globalAlpha=0.4;ctx.globalCompositeOperation='source-over';
  ctx.drawImage(tmpC,ix,iy,iw,ih);ctx.restore();
};

// Export globals
window.CanvasEngine=CanvasEngine;
window.BrushEngine=BrushEngine;
window.ToolManager=ToolManager;
window.hsvToRgb=hsvToRgb;
window.rgbToHsv=rgbToHsv;
window.hexToRgb=hexToRgb;
window.rgbToHex=rgbToHex;
window.clamp=clamp;
