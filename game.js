(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const canvas=$('canvas'), ctx=canvas.getContext('2d'), arena=$('arena');
  const overlay=$('overlay'), notice=$('notice');
  const STEP=1000/120, RADIUS=5, SETTINGS_KEY='bounce.settings.v3';
  const geo=window.GameGeometry;
  if(!window.Matter || !geo || !window.BouncePhysics || !window.BounceInput) {
    $('title').textContent='Не удалось загрузить игру';
    $('description').textContent='Обнови страницу и попробуй ещё раз.';
    $('action').textContent='Обновить';
    $('action').onclick=()=>location.reload();
    return;
  }
  const defaults={count:8,speed:1,size:1,types:[0,1,2,3],player:'cursor',cursorScale:.75,showHitbox:false,touchbar:false,progression:true};
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const numberSetting=(value,fallback,min,max,step)=>Number.isFinite(Number(value))?clamp(Math.round(Number(value)/step)*step,min,max):fallback;
  function sanitize(raw) {
    if(!raw||typeof raw!=='object')raw={};
    const types=Array.isArray(raw.types)?[...new Set(raw.types.filter(v=>Number.isInteger(v)&&v>=0&&v<4))].sort():defaults.types.slice();
    return {count:numberSetting(raw.count,8,1,30,1),speed:numberSetting(raw.speed,1,.25,3,.25),size:numberSetting(raw.size,1,.5,2,.25),types:types.length?types:defaults.types.slice(),player:raw.player==='dot'?'dot':'cursor',cursorScale:numberSetting(raw.cursorScale,.75,.5,3,.25),showHitbox:raw.showHitbox===true,touchbar:raw.touchbar===true,progression:raw.progression!==false};
  }
  let settings={...defaults,types:defaults.types.slice()};
  try {
    const saved=localStorage.getItem(SETTINGS_KEY);
    if(saved)settings=sanitize(JSON.parse(saved));
    else {
      const legacy=JSON.parse(localStorage.getItem('ricochet.settings.v2'));
      if(legacy){legacy.cursorScale=(Number(legacy.cursorScale)||1)*.75;settings=sanitize(legacy);}
    }
  } catch {}
  const settingsDialog=$('settings-dialog'), settingsForm=$('settings-form');
  const physics=window.BouncePhysics,controls=window.BounceInput;
  const marker=$('player-marker'),touchbar=$('touchbar'),touchpad=$('touchpad');
  let viewWidth=0,viewHeight=0,viewDpr=0;
  let sceneMessage='',worldPerPixel=1,arenaRect=null,cachedCursor=[],mousePickup=false,padPointer=null,padLast=null,markerTransform='';
  function recordKey() {
    const {count,speed,size,types,player,cursorScale,progression}=settings;
    return 'bounce.best.v3.'+JSON.stringify({count,speed,size,types,player,cursorScale:player==='cursor'?cursorScale:1,progression});
  }
  function loadBest() {
    best=0;try {best=Number(localStorage.getItem(recordKey()))||0;if(!Number.isFinite(best)||best<0)best=0;} catch {}
    $('best').textContent=time(best);
  }
  function cacheCursor() {cachedCursor=geo.MAC_CURSOR.map(p=>({x:p.x*worldPerPixel*settings.cursorScale,y:p.y*worldPerPixel*settings.cursorScale}));}
  function cursorPolygon() {return cachedCursor;}
  function updateMarker() {
    const visible=state==='running'&&input!=='pointer';
    marker.toggleAttribute('hidden',!visible);if(!visible)return;
    const scale=settings.player==='dot'?1/worldPerPixel:settings.cursorScale;
    const transform=`translate3d(${player.x/worldPerPixel}px,${player.y/worldPerPixel}px,0) scale(${scale})`;
    if(transform!==markerTransform){marker.style.transform=transform;markerTransform=transform;}
    marker.classList.toggle('dot',settings.player==='dot');
  }
  function syncPlayerMode() {
    arena.classList.toggle('native-cursor',settings.player==='cursor'&&input==='pointer');
    arena.classList.toggle('mouse-pickup',mousePickup);
    updateMarker();
    $('player-label').textContent=settings.player==='cursor'?'ТЫ — СИСТЕМНЫЙ КУРСОР':'ТЫ — БЕЛАЯ ТОЧКА';
    if(state==='intro')$('description').innerHTML=(settings.player==='cursor'?'Ты — курсор.':'Ты — точка.')+' Всё остальное — препятствия.<br>Двигайся и оставайся в игре.';
  }
  const {Engine,Bodies,Body,Composite}=Matter;
  const engine=physics.createEngine(Matter);
  let W=1000,H=600,state='intro',shapes=[],walls=[],elapsed=0,best=0,nextSpawn=12;
  let last=0,accumulator=0,warning=null,spawnId=0,lastHud=-1;
  let player={x:W/2,y:H/2},trail=[],keys=new Set(),input='pointer',touchId=null;
  let reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
  loadBest();cacheCursor();touchbar.hidden=!settings.touchbar;syncPlayerMode();
  function time(value) {
    const ticks=Math.floor(value*10+1e-7);
    return `${String(Math.floor(ticks/600)).padStart(2,'0')}:${String(Math.floor(ticks/10)%60).padStart(2,'0')}.${ticks%10}`;
  }
  $('best').textContent=time(best);
  const random=(min,max)=>min+Math.random()*(max-min);
  function makeWalls() {
    walls.forEach(w=>Composite.remove(engine.world,w));
    const options={isStatic:true,restitution:1,friction:0,slop:.001};
    walls=[Bodies.rectangle(W/2,-50,W+200,100,options),Bodies.rectangle(W/2,H+50,W+200,100,options),Bodies.rectangle(-50,H/2,100,H+200,options),Bodies.rectangle(W+50,H/2,100,H+200,options)];
    Composite.add(engine.world,walls);
  }
  function layout() {
    const rect=canvas.getBoundingClientRect(), oldH=H;arenaRect=rect;
    const dpr=Math.min(devicePixelRatio||1,2);
    if(Math.abs(rect.width-viewWidth)<.01&&Math.abs(rect.height-viewHeight)<.01&&dpr===viewDpr)return;
    viewWidth=rect.width;viewHeight=rect.height;viewDpr=dpr;
    H=1000*rect.height/rect.width;worldPerPixel=W/rect.width;cacheCursor();
    canvas.width=Math.round(rect.width*dpr); canvas.height=Math.round(rect.height*dpr);
    if(state==='running'||state==='armed') pause('Размер поля изменился. Продолжи, когда будешь готов.');
    if(shapes.length) {
      const dy=H/oldH;
      player.y=Math.max(RADIUS,Math.min(H-RADIUS,player.y*dy));
      shapes.forEach(body=>Body.setPosition(body,{x:body.position.x,y:Math.max(body.gameRadius+3,Math.min(H-body.gameRadius-3,body.position.y*dy))}));
    }
    makeWalls();
  }
  function available(x,y,r,clearPlayer=true) {
    if(clearPlayer && Math.hypot(x-player.x,y-player.y)<r+120) return false;
    return shapes.every(body=>Math.hypot(x-body.position.x,y-body.position.y)>r+body.gameRadius+18);
  }
  function findPosition(r,clearPlayer=true) {
    const margin=r+22;
    for(let i=0;i<250;i++) {
      const x=random(margin,W-margin),y=random(margin,H-margin);
      if(available(x,y,r,clearPlayer)) return {x,y};
    }
    return null;
  }
  function createShape(position,r,index) {
    const type=settings.types[index%settings.types.length];
    const body=physics.createBody(Matter,type,position.x,position.y,r);
    Body.setAngle(body,random(0,Math.PI));
    const direction=random(0,Math.PI*2),speed=random(2.2,3.0)*settings.speed;
    Body.setVelocity(body,{x:Math.cos(direction)*speed,y:Math.sin(direction)*speed});
    Body.setAngularVelocity(body,type===0?0:random(-.012,.012)*settings.speed);
    shapes.push(body); Composite.add(engine.world,body);
    return body;
  }
  function scene() {
    Composite.clear(engine.world,false); Engine.clear(engine);
    shapes=[]; walls=[]; warning=null; trail=[]; elapsed=0;nextSpawn=12;spawnId=0;sceneMessage='';
    player={x:W/2,y:H/2}; makeWalls();
    for(let i=0;i<settings.count;i++) {
      const r=random(19,34)*settings.size,position=findPosition(r);
      if(position) createShape(position,r,i);
    }
    if(shapes.length<settings.count)sceneMessage=`Поместилось ${shapes.length} из ${settings.count} фигур. Уменьши размер или количество в настройках.`;
    hud(true);
  }
  function hud(force=false) {
    const tenth=Math.floor(elapsed*10);
    if(!force&&tenth===lastHud) return;
    lastHud=tenth; $('time').textContent=time(elapsed);
    $('count').textContent=`${String(shapes.length).padStart(2,'0')} ФИГУР`;
    $('mode').textContent=state==='running'?(settings.progression?`УРОВЕНЬ ${String(1+Math.floor(elapsed/12)).padStart(2,'0')}`:'СВОИ ПРАВИЛА'):state==='armed'?'ЗАЙМИ ПОЗИЦИЮ':state==='paused'?'ПАУЗА':state==='over'?'ПОПЫТКА ЗАВЕРШЕНА':'ПОЛЕ СВОБОДНО';
  }
  function arm() {
    if(state==='intro'||state==='over') scene();
    state='armed';keys.clear();mousePickup=false;padPointer=null;overlay.hidden=true;arena.classList.remove('active');
    $('pause').disabled=false; $('pause').setAttribute('aria-label','Пауза');
    notice.textContent=sceneMessage||(settings.touchbar?'Коснись панели под полем. Или нажми WASD / стрелки.':'Нажми на круг. Или начни клавишами WASD / стрелками.');syncPlayerMode();
    canvas.focus({preventScroll:true});hud(true);
  }
  function launch() {
    state='running';last=0;accumulator=0;trail=[];
    arena.classList.add('active');notice.textContent='';syncPlayerMode();hud(true);
  }
  function pause(reason='Вернись в свою точку и продолжай.') {
    if(state!=='running'&&state!=='armed') return;
    state='paused';keys.clear();touchId=null;padPointer=null;padLast=null;mousePickup=false;warning=null;syncPlayerMode();touchpad.classList.remove('pressed');
    overlay.hidden=false;arena.classList.remove('active');notice.textContent='';
    $('eyebrow').textContent='МОЖНО ВЫДОХНУТЬ';$('title').textContent='Пауза.';
    $('description').textContent=reason;$('action').innerHTML='Продолжить';
    $('hint').textContent='Время и фигуры остановлены';$('result').hidden=true;
    $('pause').setAttribute('aria-label','Продолжить');hud(true);
  }
  function lose() {
    if(state!=='running') return;
    state='over';keys.clear();touchId=null;padPointer=null;padLast=null;mousePickup=false;warning=null;syncPlayerMode();touchpad.classList.remove('pressed');arena.classList.remove('active');
    const record=elapsed>best;
    if(record) { best=elapsed;try {localStorage.setItem(recordKey(),String(best));} catch {} }
    $('best').textContent=time(best);
    overlay.hidden=false;$('eyebrow').textContent=record?'ЛИЧНЫЙ РЕКОРД':'СТОЛКНОВЕНИЕ';
    $('title').textContent=record?'Новая планка.':'Ещё раз?';
    $('description').textContent='Каждая секунда — маленькая победа.';
    $('result').textContent=time(elapsed);$('result').hidden=false;
    $('action').innerHTML='Играть снова';
    $('hint').textContent='Начни заново. Найди свой ритм.';
    $('pause').disabled=true;notice.textContent='';hud(true);
  }
  function hits(a,b,body,vertices=body.vertices,center=body.position) {
    // Most obstacles are nowhere near the player's path. Reject them before edge tests.
    const extent=settings.player==='dot'?RADIUS:22*worldPerPixel*settings.cursorScale;
    const radius=body.gameRadius+1;
    if(Math.max(a.x,b.x)+extent<center.x-radius||Math.min(a.x,b.x)-extent>center.x+radius||Math.max(a.y,b.y)+extent<center.y-radius||Math.min(a.y,b.y)-extent>center.y+radius)return false;
    if(settings.player==='dot')return body.circleRadius?geo.sweptCircleCircle(a,b,RADIUS,center,body.circleRadius):geo.sweptCirclePolygon(a,b,RADIUS,vertices);
    const polygon=cursorPolygon(),outline=.6*worldPerPixel;
    return body.circleRadius?geo.sweptPolygonCircle(a,b,polygon,center,body.circleRadius+outline):geo.sweptPolygonPolygon(a,b,polygon,vertices,outline);
  }
  function movePlayer(p) {
    const margin=settings.player==='dot'?RADIUS:0;
    const next={x:Math.max(margin,Math.min(W-margin,p.x)),y:Math.max(margin,Math.min(H-margin,p.y))};
    if(state==='running') {
      if(shapes.some(body=>hits(player,next,body))) { lose();return; }
      if(!reducedMotion) {trail.push({...player});if(trail.length>10) trail.shift();}
    }
    player=next;updateMarker();
  }
  function simulate(dt,playing) {
    const parts=physics.substeps(shapes,dt);
    for(let i=0;i<parts;i++){simulateStep(dt/parts,playing);if(playing&&state!=='running')break;}
  }
  function simulateStep(dt,playing) {
    const playerExtent=settings.player==='dot'?RADIUS:22*worldPerPixel*settings.cursorScale;
    const before=playing?shapes.map(body=>{
      const reach=body.gameRadius+playerExtent+10;
      if(Math.abs(body.position.x-player.x)>reach||Math.abs(body.position.y-player.y)>reach)return null;
      return {center:{...body.position},vertices:body.circleRadius?null:body.vertices.map(v=>({x:v.x,y:v.y}))};
    }):null;
    Engine.update(engine,dt);
    if(playing) {
      elapsed+=dt/1000;
      let dx=0,dy=0;
      if(keys.has('left'))dx--;
      if(keys.has('right'))dx++;
      if(keys.has('up'))dy--;
      if(keys.has('down'))dy++;
      if(dx||dy) {
        const length=Math.hypot(dx,dy),speed=330*dt/1000;
        movePlayer({x:player.x+dx/length*speed,y:player.y+dy/length*speed});
        if(state!=='running')return;
      }
      for(let i=0;i<shapes.length;i++) {
        const body=shapes[i],previous=before[i];
        if(!previous)continue;
        // Relative motion catches a shape crossing a stationary player within one physics step.
        const relativeEnd={x:player.x-(body.position.x-previous.center.x),y:player.y-(body.position.y-previous.center.y)};
        if(hits(player,player,body)||hits(player,relativeEnd,body,previous.vertices,previous.center)) {lose();return;}
      }
      if(settings.progression&&elapsed>=nextSpawn&&!warning&&shapes.length<Math.min(40,settings.count+14)) {
        const r=random(20,30)*settings.size,position=findPosition(r);
        if(position) warning={...position,r,at:elapsed+1.4,id:spawnId++};
        else nextSpawn=elapsed+2;
      }
      if(warning&&elapsed>=warning.at) {
        // Recheck the free zone at birth; approaching the warning cancels the spawn.
        if(available(warning.x,warning.y,warning.r)) createShape(warning,warning.r,shapes.length);
        warning=null;nextSpawn=elapsed+12;
      }
    }
    const levelTime=playing&&settings.progression?elapsed:0;
    const maxSpeed=Math.min(6,3+levelTime*.022)*settings.speed;
    shapes.forEach(body=>{
      const speed=Math.hypot(body.velocity.x,body.velocity.y);
      const minimum=Math.min(4.8,2.1+levelTime*.018)*settings.speed;
      if(speed<.01) Body.setVelocity(body,{x:minimum,y:minimum*.4});
      else if(speed<minimum||speed>maxSpeed) Body.setSpeed(body,Math.max(minimum,Math.min(maxSpeed,speed)));
      if(Math.abs(body.angularVelocity)>.025*settings.speed)Body.setAngularVelocity(body,Math.sign(body.angularVelocity)*.025*settings.speed);
      const r=body.gameRadius;
      if(body.position.x<-r||body.position.x>W+r||body.position.y<-r||body.position.y>H+r) {
        Body.setPosition(body,{x:Math.max(r,Math.min(W-r,body.position.x)),y:Math.max(r,Math.min(H-r,body.position.y))});
      }
    });
  }
  function circle(x,y,r) {ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);}
  function draw() {
    ctx.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);
    ctx.fillStyle='#0c0c0c';ctx.fillRect(0,0,W,H);
    const active=state==='running'||state==='armed';
    shapes.forEach(body=>{
      ctx.beginPath();
      body.vertices.forEach((v,i)=>i?ctx.lineTo(v.x,v.y):ctx.moveTo(v.x,v.y));ctx.closePath();
      ctx.fillStyle=active?'#121212':'#101010';ctx.fill();
      // Keep the full visible stroke inside the physical boundary.
      ctx.save();ctx.clip();ctx.strokeStyle=active?'#c2c2c0':'#7a7a78';ctx.lineWidth=2.5;ctx.stroke();ctx.restore();
    });
    if(warning&&state==='running') {
      ctx.save();ctx.setLineDash([4,5]);ctx.strokeStyle='#898987';ctx.lineWidth=1;
      circle(warning.x,warning.y,warning.r+13);ctx.stroke();ctx.restore();
      ctx.fillStyle='#aaa';ctx.font='20px monospace';ctx.textAlign='center';ctx.fillText('+',warning.x,warning.y+6);
    }
    if(active||state==='over') {
      if(state==='armed'||mousePickup) {
        circle(player.x,player.y,27);ctx.lineWidth=1;ctx.strokeStyle='#777';ctx.stroke();
        ctx.beginPath();ctx.moveTo(player.x-40,player.y);ctx.lineTo(player.x-33,player.y);ctx.moveTo(player.x+33,player.y);ctx.lineTo(player.x+40,player.y);ctx.moveTo(player.x,player.y-40);ctx.lineTo(player.x,player.y-33);ctx.moveTo(player.x,player.y+33);ctx.lineTo(player.x,player.y+40);ctx.stroke();
      }
      if(settings.player==='dot'&&!reducedMotion&&state==='running') trail.forEach((p,i)=>{
        circle(p.x,p.y,1.5);ctx.fillStyle=`rgba(240,240,238,${i/trail.length*.18})`;ctx.fill();
      });
      if(settings.player==='dot'&&(state!=='running'||input==='pointer')) {
        circle(player.x,player.y,RADIUS);ctx.fillStyle='#f5f5f3';ctx.fill();
        circle(player.x,player.y,RADIUS+4);ctx.strokeStyle='#4a4a49';ctx.lineWidth=.8;ctx.stroke();
      } else if(settings.player==='cursor'&&(state!=='running'||(input==='pointer'&&settings.showHitbox))) {
        ctx.beginPath();cursorPolygon().forEach((p,i)=>i?ctx.lineTo(player.x+p.x,player.y+p.y):ctx.moveTo(player.x+p.x,player.y+p.y));ctx.closePath();
        ctx.fillStyle='#090909';ctx.fill();ctx.strokeStyle='#eee';ctx.lineWidth=worldPerPixel;ctx.stroke();
      }
    }
  }
  function frame(now) {
    const delta=last?Math.min(now-last,70):0;last=now;
    if(!settingsDialog.open&&(state==='running'||(state==='intro'&&!reducedMotion))) {
      accumulator+=delta;
      while(accumulator>=STEP) {
        const playing=state==='running';simulate(STEP,playing);accumulator-=STEP;
        if(playing&&state!=='running'){accumulator=0;break;}
      }
    } else accumulator=0;
    hud();draw();updateMarker();requestAnimationFrame(frame);
  }
  function position(event) {
    const rect=arenaRect||canvas.getBoundingClientRect();
    return {x:(event.clientX-rect.left)/rect.width*W,y:(event.clientY-rect.top)/rect.height*H};
  }
  canvas.addEventListener('pointerdown',event=>{
    if(event.button!==0||settings.touchbar&&event.pointerType==='touch')return;
    const p=position(event);
    if(state==='armed') {
      if(Math.hypot(p.x-player.x,p.y-player.y)<=30) {
        input=event.pointerType==='touch'?'touch':'pointer';syncPlayerMode();
        if(input==='touch') {touchId=event.pointerId;canvas.setPointerCapture(event.pointerId);}
        launch();movePlayer(p);
      }
    } else if(state==='running'&&event.pointerType==='touch') {
      // A new touch cannot teleport to a distant point after lifting the finger.
      if(touchId===null)pause('Коснись своей точки, чтобы продолжить.');
    }
  });
  const pointerMoveEvent='onpointerrawupdate' in window?'pointerrawupdate':'pointermove';
  canvas.addEventListener(pointerMoveEvent,event=>{
    if(state!=='running')return;
    if(event.pointerType==='touch'&&(settings.touchbar||event.pointerId!==touchId))return;
    const samples=event.getCoalescedEvents?.()||[event];
    for(const sample of samples.length?samples:[event]) {
      const p=position(sample);
      if(event.pointerType!=='touch'&&input!=='pointer') {
        if(!controls.canPickUp(player,p,worldPerPixel)) {
          if(!mousePickup){mousePickup=true;syncPlayerMode();notice.textContent='Для мыши подведи указатель к игроку.';}
          continue;
        }
        mousePickup=false;notice.textContent='';
      }
      const nextInput=event.pointerType==='touch'?'touch':'pointer';
      if(input!==nextInput){input=nextInput;syncPlayerMode();}
      keys.clear();movePlayer(p);if(state!=='running')break;
    }
  },{passive:true});
  function endTouch(event) {if(event.pointerId===touchId){touchId=null;pause('Палец отпущен. Вернись в свою точку.');}}
  canvas.addEventListener('pointerup',endTouch);canvas.addEventListener('pointercancel',endTouch);
  canvas.addEventListener('lostpointercapture',endTouch);
  canvas.addEventListener('pointerleave',event=>{if(state==='running'&&input==='pointer'&&event.pointerType!=='touch')pause('Курсор вышел за поле. Вернись в свою точку.');});
  $('action').addEventListener('click',arm);
  $('pause').addEventListener('click',()=>state==='paused'?arm():pause());
  window.addEventListener('keydown',event=>{
    if(settingsDialog.open||event.metaKey||event.ctrlKey||event.altKey)return;
    if(event.key==='Escape') {event.preventDefault();if(state==='paused')arm();else pause();return;}
    const key=controls.directionKey(event);
    if(key&&(state==='running'||state==='armed')) {
      event.preventDefault();input='keyboard';mousePickup=false;notice.textContent='';syncPlayerMode();keys.add(key);
      if(state==='armed')launch();
    }
    if(event.key==='Enter'&&event.target===canvas&&(state==='intro'||state==='over'||state==='paused')) {event.preventDefault();arm();}
  });
  window.addEventListener('keyup',event=>keys.delete(controls.directionKey(event)));
  window.addEventListener('blur',()=>pause('Вкладка потеряла фокус. Игра ждёт тебя.'));
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause('Вкладка была скрыта. Продолжим?');});
  // Relative two-dimensional touchpad: lifting/repositioning never changes player position.
  touchpad.addEventListener('pointerdown',event=>{
    if(!settings.touchbar||event.button!==0||padPointer!==null||settingsDialog.open)return;
    if(state!=='armed'&&state!=='running')return;
    event.preventDefault();padPointer=event.pointerId;padLast={x:event.clientX,y:event.clientY};
    input='pad';mousePickup=false;keys.clear();touchpad.setPointerCapture(event.pointerId);touchpad.classList.add('pressed');syncPlayerMode();
    if(state==='armed')launch();
  });
  touchpad.addEventListener(pointerMoveEvent,event=>{
    if(event.pointerId!==padPointer||state!=='running')return;
    const samples=event.getCoalescedEvents?.()||[event];
    for(const sample of samples.length?samples:[event]) {
      const current={x:sample.clientX,y:sample.clientY};
      const next=controls.padPosition(player,padLast,current,worldPerPixel);
      padLast=current;movePlayer(next);if(state!=='running')break;
    }
  },{passive:true});
  function releasePad(event){
    if(event.pointerId!==padPointer)return;
    padPointer=null;padLast=null;touchpad.classList.remove('pressed');
    if(event.type==='pointercancel')pause('Жест прерван. Продолжи, когда будешь готов.');
  }
  touchpad.addEventListener('pointerup',releasePad);touchpad.addEventListener('pointercancel',releasePad);touchpad.addEventListener('lostpointercapture',releasePad);
  function updateForm() {
    for(const [name,output] of [['count','count-output'],['speed','speed-output'],['size','size-output'],['cursor-scale','cursor-scale-output']]) {
      const value=$('setting-'+name).value;
      $(output).value=value+(name==='count'?'':'×');
    }
    $('cursor-settings').hidden=settingsForm.elements.player.value!=='cursor';
  }
  function openSettings() {
    if(state==='running'||state==='armed')pause('Настрой поле и начни новую попытку или закрой настройки, чтобы продолжить.');
    $('setting-count').value=settings.count;$('setting-speed').value=settings.speed;$('setting-size').value=settings.size;
    $('setting-cursor-scale').value=settings.cursorScale;$('setting-hitbox').checked=settings.showHitbox;
    $('setting-touchbar').checked=settings.touchbar;$('setting-progression').checked=settings.progression;settingsForm.elements.player.value=settings.player;
    settingsForm.querySelectorAll('[name="shape"]').forEach(box=>box.checked=settings.types.includes(Number(box.value)));
    $('settings-status').textContent='';updateForm();settingsDialog.showModal();
  }
  $('settings-open').addEventListener('click',openSettings);
  $('settings-close').addEventListener('click',()=>settingsDialog.close());
  $('settings-cancel').addEventListener('click',()=>settingsDialog.close());
  settingsDialog.addEventListener('close',()=>{last=0;accumulator=0;});
  settingsForm.addEventListener('input',updateForm);
  settingsForm.addEventListener('submit',event=>{
    event.preventDefault();
    const types=[...settingsForm.querySelectorAll('[name="shape"]:checked')].map(box=>Number(box.value));
    if(!types.length){$('settings-status').textContent='Выбери хотя бы одну фигуру.';return;}
    settings=sanitize({count:$('setting-count').value,speed:$('setting-speed').value,size:$('setting-size').value,types,player:settingsForm.elements.player.value,cursorScale:$('setting-cursor-scale').value,showHitbox:$('setting-hitbox').checked,touchbar:$('setting-touchbar').checked,progression:$('setting-progression').checked});
    try {localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));}catch {}
    loadBest();cacheCursor();touchbar.hidden=!settings.touchbar;syncPlayerMode();settingsDialog.close();state='intro';layout();arm();
  });
  const observer=new ResizeObserver(layout);observer.observe(arena);
  layout();scene();requestAnimationFrame(frame);
})();
