const assert=require('node:assert/strict');
const M=require('../vendor/matter.min.js');
const physics=require('../physics.js');
const input=require('../input.js');
const {Engine,Bodies,Body,Composite,Collision}=M;
for(const [code,key,expected] of [['KeyW','ц','up'],['KeyA','ф','left'],['KeyS','ы','down'],['KeyD','в','right'],['ArrowRight','ArrowRight','right']])assert.equal(input.directionKey({code,key}),expected);
assert.equal(input.directionKey({key:'W'}),'up');
assert.equal(input.directionKey({code:'Space',key:' '}),null);
assert(!input.canPickUp({x:100,y:100},{x:500,y:100},1),'returning mouse far from keyboard player cannot teleport');
assert(input.canPickUp({x:100,y:100},{x:105,y:100},1),'nearby pointer can take over');
assert.deepEqual(input.padPosition({x:40,y:50},{x:100,y:200},{x:100,y:200},2),{x:40,y:50},'new finger position with zero delta keeps player still');
assert.deepEqual(input.padPosition({x:40,y:50},{x:100,y:200},{x:110,y:190},2),{x:68,y:22},'touchpad is relative on both axes');
function triangleCircle(legacy=false){
 const engine=legacy?Engine.create({gravity:{x:0,y:0},positionIterations:8,velocityIterations:8}):physics.createEngine(M);
 const tri=legacy?Bodies.polygon(100,100,3,26,{restitution:1,friction:0,frictionAir:0}):physics.createBody(M,2,100,100,26);
 const circle=legacy?Bodies.circle(240,100,34,{isStatic:true,restitution:1}):physics.createBody(M,0,240,100,34);
 Body.setAngle(tri,Math.PI);Body.setStatic(circle,true);Body.setVelocity(tri,{x:18,y:0});Composite.add(engine.world,[tri,circle]);
 let maxTipIntrusion=0,bounced=false;
 for(let frame=0;frame<100;frame++){
  const parts=legacy?2:physics.substeps([tri],1000/60);
  for(let i=0;i<parts;i++){
   Engine.update(engine,1000/60/parts);
   for(const v of tri.vertices)maxTipIntrusion=Math.max(maxTipIntrusion,34-Math.hypot(v.x-circle.position.x,v.y-circle.position.y));
   if(tri.velocity.x<0)bounced=true;
  }
 }
 assert(bounced,'triangle must rebound from circle');
 return maxTipIntrusion;
}
const oldDepth=triangleCircle(true),newDepth=triangleCircle(false);
assert(newDepth<.2,`triangle tips stay outside visible circle; intrusion ${newDepth}`);
for(const opposingType of [1,2,3]){
 const engine=physics.createEngine(M);
 const tri=physics.createBody(M,2,100,100,12),other=physics.createBody(M,opposingType,200,100,18);
 Body.setStatic(other,true);Body.setVelocity(tri,{x:18,y:0});Body.setAngularVelocity(tri,.075);
 Composite.add(engine.world,[tri,other]);let maxDepth=0,bounced=false;
 for(let frame=0;frame<60;frame++){
  const parts=physics.substeps([tri],1000/60);
  for(let i=0;i<parts;i++){
   Engine.update(engine,1000/60/parts);
   const c=Collision.collides(tri,other);if(c)maxDepth=Math.max(maxDepth,c.depth);
   if(tri.velocity.x<0)bounced=true;
  }
 }
 assert(bounced,'rotating triangle must bounce from type '+opposingType);
 assert(maxDepth<.12,'overlap after solve stays below visible stroke: '+maxDepth);
}
console.log({inputChecks:11,triangleCircleOldIntrusion:oldDepth,triangleCircleNewIntrusion:newDepth,rotatingTriangleCases:3});
// Dense/high-speed CPU check of the production solver (timing is diagnostic).
const e=physics.createEngine(M),bodies=[];
for(let i=0;i<30;i++){
 const b=physics.createBody(M,i%4,40+(i%10)*90,40+Math.floor(i/10)*90,12);
 Body.setVelocity(b,{x: i%2?9:-9,y:i%3?5:-5});bodies.push(b);
}
Composite.add(e.world,bodies);const started=performance.now();
for(let f=0;f<120;f++){const n=physics.substeps(bodies,1000/60);for(let i=0;i<n;i++)Engine.update(e,1000/60/n);}
console.log('Physics stress run, 30 fast bodies / 120 rendered frames:',Math.round(performance.now()-started),'ms total');
