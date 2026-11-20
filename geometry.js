/* Collision helpers shared by the game and the Node checks. */
(function (root) {
  const sq = (v) => v * v;
  function nearestOnSegment(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const length = dx * dx + dy * dy;
    const t = length ? Math.max(0, Math.min(1, ((p.x-a.x)*dx+(p.y-a.y)*dy)/length)) : 0;
    return {x:a.x+t*dx,y:a.y+t*dy};
  }
  function pointSegmentDistanceSquared(p, a, b) {
    const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;
    const t=length?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/length)):0;
    return sq(p.x-a.x-t*dx)+sq(p.y-a.y-t*dy);
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
  // A concave polygon translated along a segment sweeps its start, end and edge quads.
  // Keeping the quads separate preserves the cursor's empty notches (no bounding circle).
  function polygonsTouch(a,b,padding=0) {
    if(a.some(p=>inside(p,b))||b.some(p=>inside(p,a)))return true;
    for(let i=0;i<a.length;i++)for(let j=0;j<b.length;j++) {
      if(segmentDistanceSquared(a[i],a[(i+1)%a.length],b[j],b[(j+1)%b.length])<=padding*padding+1e-10)return true;
    }
    return false;
  }
  function sweptPolygonPolygon(start,end,local,obstacle,padding=0) {
    const a=local.map(p=>({x:p.x+start.x,y:p.y+start.y}));
    const b=local.map(p=>({x:p.x+end.x,y:p.y+end.y}));
    if(polygonsTouch(a,obstacle,padding)||polygonsTouch(b,obstacle,padding))return true;
    for(let i=0;i<local.length;i++) {
      const j=(i+1)%local.length;
      if(polygonsTouch([a[i],a[j],b[j],b[i]],obstacle,padding))return true;
    }
    return false;
  }
  function sweptPolygonCircle(start,end,local,center,radius) {
    return sweptCirclePolygon({x:center.x-start.x,y:center.y-start.y},{x:center.x-end.x,y:center.y-end.y},radius,local);
  }
  const MAC_CURSOR=[{x:0,y:0},{x:0,y:18},{x:4.5,y:13.5},{x:8,y:21},{x:11,y:19.5},{x:7.5,y:12},{x:14,y:12}];
  function interpolate(a,b,t){return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};}
  function firstContact(start,end,obstacle,{cursor=null,radius=0,padding=0}={}) {
    function crosses(point){
      return cursor?sweptPolygonPolygon(start,point,cursor,obstacle,padding)
        :sweptCirclePolygon(start,point,radius,obstacle);
    }
    let low=0,high=1;
    if(crosses(start))high=0;
    else {
      if(!crosses(end))return null;
      for(let i=0;i<18;i++){
        const middle=(low+high)/2;
        if(crosses(interpolate(start,end,middle)))high=middle;
        else low=middle;
      }
    }
    const origin=interpolate(start,end,high);
    const arrow=cursor?.map(p=>({x:p.x+origin.x,y:p.y+origin.y}));
    let closest;
    function candidate(playerPoint,point,edge){
      const distance=sq(playerPoint.x-point.x)+sq(playerPoint.y-point.y);
      if(!closest||distance<closest.distance)closest={playerPoint,point,edge,distance};
    }
    for(let i=0;i<obstacle.length;i++){
      const a=obstacle[i],b=obstacle[(i+1)%obstacle.length];
      if(!arrow){candidate(origin,nearestOnSegment(origin,a,b));continue;}
      for(let j=0;j<arrow.length;j++){
        const p=arrow[j],q=arrow[(j+1)%arrow.length];
        candidate(p,nearestOnSegment(p,a,b),j);
        candidate(q,nearestOnSegment(q,a,b),j);
        candidate(nearestOnSegment(a,p,q),a,j);
        candidate(nearestOnSegment(b,p,q),b,j);
      }
    }
    if(!closest)return null;
    let part='dot';
    if(arrow){
      const cursorScale=cursor[3].y/21;
      const fromTip=Math.hypot(closest.playerPoint.x-origin.x,closest.playerPoint.y-origin.y);
      if(fromTip<=4*cursorScale)part='tip';
      else if(closest.edge>=2&&closest.edge<=4&&closest.playerPoint.y-origin.y>=13*cursorScale)part='tail';
      else part='edge';
    }
    return {fraction:high,origin,point:closest.point,part};
  }
  const api={pointSegmentDistanceSquared,segmentDistanceSquared,inside,sweptCirclePolygon,sweptCircleCircle,polygonsTouch,sweptPolygonPolygon,sweptPolygonCircle,firstContact,interpolate,MAC_CURSOR};
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  else root.GameGeometry=api;
})(typeof globalThis==='undefined'?this:globalThis);
