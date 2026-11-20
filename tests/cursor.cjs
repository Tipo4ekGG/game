const assert=require('node:assert/strict');
const g=require('../geometry.js');
const arrow=g.MAC_CURSOR;
const point={x:0,y:0};
const box=(x,y,s=.2)=>[{x:x-s,y:y-s},{x:x+s,y:y-s},{x:x+s,y:y+s},{x:x-s,y:y+s}];
assert(g.sweptPolygonCircle(point,point,arrow,{x:9,y:19},.2),'cursor tail must collide, even far from hotspot');
assert(!g.sweptCircleCircle(point,point,5,{x:9,y:19},.2),'old dot would miss the tail collision');
assert(g.sweptPolygonPolygon(point,point,arrow,box(9,19)),'tail must hit a polygon');
assert(!g.sweptPolygonCircle(point,point,arrow,{x:12,y:18},.2),'empty area alongside tail must remain safe');
assert(!g.sweptPolygonPolygon(point,point,arrow,box(12,18)),'polygon in cursor notch must remain safe');
assert(g.sweptPolygonCircle(point,{x:100,y:0},arrow,{x:50,y:19},.2),'fast cursor tail sweep must hit circle');
assert(g.sweptPolygonPolygon(point,{x:100,y:0},arrow,box(50,19)),'fast cursor tail sweep must hit polygon');
assert(!g.sweptPolygonPolygon(point,{x:100,y:0},arrow,box(50,25)),'near miss below cursor');
assert(g.sweptPolygonPolygon(point,point,arrow,box(0,0)),'hotspot remains part of hitbox');
assert(g.sweptPolygonCircle(point,point,arrow,{x:0,y:19},1),'outline tangent counts');
let seed=17;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
for(let i=0;i<100;i++) {
 const end={x:rand()*80-40,y:rand()*80-40},obstacle=box(rand()*80-30,rand()*80-30,1);
 const swept=g.sweptPolygonPolygon(point,end,arrow,obstacle);
 let sampled=false;
 for(let j=0;j<=200;j++) {
  const at={x:end.x*j/200,y:end.y*j/200};
  if(g.polygonsTouch(arrow.map(p=>({x:p.x+at.x,y:p.y+at.y})),obstacle)){sampled=true;break;}
 }
 if(sampled)assert(swept,'swept polygon cannot miss a sampled collision');
}
console.log('10 cursor contour checks and 100 deterministic sweep comparisons passed');

// Identify the part of the actual cursor contour that made first contact.
for (const [part, obstacle] of [['tip', box(0, -.2)], ['tail', box(8, 21.2)], ['edge', box(-.2, 9)]]) {
 const contact=g.firstContact(point,point,obstacle,{cursor:arrow});
 assert.equal(contact?.part,part);
}
const through=g.firstContact(point,{x:100,y:0},box(55,0,1),{radius:5});
assert.equal(through.part,'dot');
assert(Math.abs(through.origin.x-49)<.001,'capture the first impact even when both endpoints are outside');
assert.deepEqual(through.point,{x:54,y:0},'marker should lie on the contacted figure boundary');
