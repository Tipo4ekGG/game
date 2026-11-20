/* Physical keys work with both Latin and Cyrillic keyboard layouts. */
(function(root){
  const codes={KeyW:'up',ArrowUp:'up',KeyS:'down',ArrowDown:'down',KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right'};
  const keys={w:'up',ц:'up',s:'down',ы:'down',a:'left',ф:'left',d:'right',в:'right',ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right'};
  function normalizedKey(event){return event.key?.length===1?event.key.toLowerCase():event.key;}
  function keyIdentity(event){return codes[event.code]?event.code:normalizedKey(event);}
  function directionKey(event){
    return codes[event.code]||keys[normalizedKey(event)]||null;
  }
  function canPickUp(player,pointer,worldPerPixel){return Math.hypot(player.x-pointer.x,player.y-pointer.y)<=8*worldPerPixel;}
  function padPosition(player,previous,current,worldPerPixel,gain=1.4){
    return {x:player.x+(current.x-previous.x)*worldPerPixel*gain,y:player.y+(current.y-previous.y)*worldPerPixel*gain};
  }
  const api={directionKey,keyIdentity,canPickUp,padPosition};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.BounceInput=api;
})(typeof globalThis==='undefined'?this:globalThis);
