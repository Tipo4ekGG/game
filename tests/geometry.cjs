const assert=require('node:assert/strict');
const g=require('../geometry.js');
const box=[{x:10,y:10},{x:20,y:10},{x:20,y:20},{x:10,y:20}];
assert(g.sweptCirclePolygon({x:0,y:15},{x:30,y:15},1,box),'fast cursor must hit an intervening polygon');
assert(!g.sweptCirclePolygon({x:0,y:5},{x:30,y:5},1,box),'clear path must remain clear');
assert(g.sweptCirclePolygon({x:0,y:9},{x:30,y:9},1,box),'tangent contact counts');
assert(g.sweptCirclePolygon({x:15,y:15},{x:15,y:15},1,box),'stationary player inside polygon');
assert(!g.sweptCirclePolygon({x:8,y:8},{x:8,y:8},1,box),'outside corner is safe');
assert(g.sweptCircleCircle({x:0,y:0},{x:100,y:0},5,{x:50,y:0},10),'circle sweep');
assert(!g.sweptCircleCircle({x:0,y:0},{x:100,y:0},5,{x:50,y:16},10),'circle near miss');
assert.equal(g.segmentDistanceSquared({x:0,y:0},{x:10,y:0},{x:5,y:-1},{x:5,y:1}),0);
assert.equal(g.segmentDistanceSquared({x:0,y:0},{x:10,y:0},{x:20,y:0},{x:30,y:0}),100);
// Exercise the actual engine under the game's fixed step and wall properties.
const {Engine,Bodies,Body,Composite}=require('../vendor/matter.min.js');
const engine=Engine.create({gravity:{x:0,y:0},positionIterations:8,velocityIterations:8});
const ball=Bodies.circle(50,50,10,{restitution:1,friction:0,frictionAir:0});
const wall=Bodies.rectangle(110,50,20,200,{isStatic:true,restitution:1,friction:0});
Composite.add(engine.world,[ball,wall]);Body.setVelocity(ball,{x:4,y:0});
let bounced=false;
for(let i=0;i<60;i++){Engine.update(engine,1000/120);if(ball.velocity.x<0)bounced=true;}
assert(bounced,'body must bounce off wall');assert(ball.position.x<100,'ball must not pass through wall');
console.log('10 collision/geometry checks and Matter.js wall simulation passed');
