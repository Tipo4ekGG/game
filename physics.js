/* Shared by the browser and collision regression checks. */
(function(root){
  const OPTIONS={positionIterations:12,velocityIterations:10};
  const BODY_OPTIONS={restitution:1,friction:0,frictionStatic:0,frictionAir:0,density:.0015,slop:.001};
  function createEngine(Matter){return Matter.Engine.create({...OPTIONS,gravity:{x:0,y:0}});}
  function createBody(Matter,type,x,y,r){
    const {Bodies}=Matter;let body;
    // Matter's default low-sided circles made sharp tips appear inside the rendered circle.
    if(type===0){body=Bodies.polygon(x,y,64,r,{...BODY_OPTIONS});body.circleRadius=r;}
    else if(type===1)body=Bodies.rectangle(x,y,r*1.45,r*1.45,{...BODY_OPTIONS});
    else body=Bodies.polygon(x,y,type===2?3:6,r,{...BODY_OPTIONS});
    body.gameRadius=r*1.1;body.gameType=type;return body;
  }
  function substeps(bodies,dt){
    let travel=0;
    for(const body of bodies){
      const linear=Math.hypot(body.velocity.x,body.velocity.y);
      const rotational=Math.abs(body.angularVelocity)*(body.gameRadius||30);
      travel=Math.max(travel,(linear+rotational)*dt/(1000/60));
    }
    // At most 1.5 world units of travel per step, including rotating corners.
    return Math.max(1,Math.min(12,Math.ceil(travel/1.5)));
  }
  // Matter can leave a residual overlap when one body has several contacts.
  // Check the final positions, after the impulse solver has handled the bounce.
  const correctionDetectors=new WeakMap();
  function advance(Matter,engine,dt){
    Matter.Engine.update(engine,dt);
    if(!engine.pairs.list.some(pair=>pair.isActive))return;
    const {Detector,Composite,Collision,Body}=Matter;
    let detector=correctionDetectors.get(engine);
    if(!detector){
      detector=Detector.create();
      correctionDetectors.set(engine,detector);
    }
    Detector.setBodies(detector,Composite.allBodies(engine.world));
    for(let pass=0;pass<8;pass++){
      let corrected=false;
      for(const candidate of Detector.collisions(detector)){
        const collision=Collision.collides(candidate.bodyA,candidate.bodyB);
        if(!collision||collision.depth<=.015)continue;
        const {bodyA,bodyB,normal,depth}=collision;
        const inverseMass=bodyA.inverseMass+bodyB.inverseMass;
        if(!inverseMass)continue;
        const correction=depth/inverseMass;
        if(!bodyA.isStatic){
          const distance=correction*bodyA.inverseMass;
          Body.translate(bodyA,{x:normal.x*distance,y:normal.y*distance});
        }
        if(!bodyB.isStatic){
          const distance=correction*bodyB.inverseMass;
          Body.translate(bodyB,{x:-normal.x*distance,y:-normal.y*distance});
        }
        corrected=true;
      }
      if(!corrected)break;
    }
  }
  const api={createEngine,createBody,substeps,advance,BODY_OPTIONS,OPTIONS};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.BouncePhysics=api;
})(typeof globalThis==='undefined'?this:globalThis);
