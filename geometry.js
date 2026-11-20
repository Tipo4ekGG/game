/* Collision helpers shared by the game and the Node checks. */
(function (root) {
  const sq = (v) => v * v;
  function pointSegmentDistanceSquared(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const length = dx * dx + dy * dy;
    const t = length ? Math.max(0, Math.min(1, ((p.x-a.x)*dx+(p.y-a.y)*dy)/length)) : 0;
    return sq(p.x-a.x-t*dx) + sq(p.y-a.y-t*dy);
  }
  function cross(a,b,c) { return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x); }
  function segmentDistanceSquared(a,b,c,d) {
    const abC=cross(a,b,c), abD=cross(a,b,d), cdA=cross(c,d,a), cdB=cross(c,d,b);
    if (((abC<0 && abD>0)||(abC>0 && abD<0)) && ((cdA<0 && cdB>0)||(cdA>0 && cdB<0))) return 0;
    return Math.min(pointSegmentDistanceSquared(a,c,d),pointSegmentDistanceSquared(b,c,d),pointSegmentDistanceSquared(c,a,b),pointSegmentDistanceSquared(d,a,b));
  }
  function inside(p, vertices) {
    let yes=false;
    for (let i=0,j=vertices.length-1;i<vertices.length;j=i++) {
      const a=vertices[i],b=vertices[j];
      if ((a.y>p.y)!==(b.y>p.y) && p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) yes=!yes;
    }
    return yes;
  }
  function sweptCirclePolygon(a,b,r,vertices) {
    if (inside(a,vertices)||inside(b,vertices)) return true;
    for(let i=0;i<vertices.length;i++) {
      if(segmentDistanceSquared(a,b,vertices[i],vertices[(i+1)%vertices.length])<=r*r) return true;
    }
    return false;
  }
  function sweptCircleCircle(a,b,r,center,otherRadius) {
    return pointSegmentDistanceSquared(center,a,b)<=sq(r+otherRadius);
  }
  const api={pointSegmentDistanceSquared,segmentDistanceSquared,inside,sweptCirclePolygon,sweptCircleCircle};
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  else root.GameGeometry=api;
})(typeof globalThis==='undefined'?this:globalThis);
