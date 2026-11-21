const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {runInNewContext} = require('node:vm');
const Matter = require('../vendor/matter.min.js');
const geometry = require('../geometry.js');
const physics = require('../physics.js');
const input = require('../input.js');
const source = readFileSync(require.resolve('../game.js'), 'utf8');

// Run the real game loop against controlled input, time, storage and viewport size.
function launch(settings = {}, dimensions = {width: 1000, height: 600}, seed = 1, storage = new Map(), reducedMotion = false) {
  const elements = new Map(), windowEvents = new Map();
  let pendingFrame, resize, engine, draws = 0;
  const context = new Proxy({
    fillRect() { draws++; },
    createRadialGradient() { return {addColorStop() {}}; }
  }, {
    get: (target, key) => target[key] ?? (() => {})
  });
  function get(id) {
    if (elements.has(id)) return elements.get(id);
    const listeners = new Map();
    const element = {
      id, hidden: id==='result'||id==='impact-preview', textContent: '', dataset: {},
      style: {setProperty(name, value) { this[name] = value; }},
      width: 544, height: 186,
      classList: {add() {}, remove() {}, toggle() {}},
      toggleAttribute(name, value) { this[name] = value; },
      addEventListener(name, callback) { listeners.set(name, callback); },
      dispatch(name, event = {}) { listeners.get(name)?.(event); },
      getContext: () => context,
      getBoundingClientRect: () => ({left: 0, top: 0, ...dimensions}),
      focus() {}, setAttribute() {}, setPointerCapture() {}
    };
    elements.set(id, element);
    return element;
  }
  const math = Object.create(Math);
  math.random = () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const window = {
    Matter, GameGeometry: geometry, BounceInput: input,
    BouncePhysics: {...physics, createEngine(matter) { engine = physics.createEngine(matter); return engine; }},
    addEventListener(name, callback) { windowEvents.set(name, callback); }
  };
  runInNewContext(source, {
    window, Matter, Math: math, devicePixelRatio: 1,
    document: {getElementById: get, addEventListener() {}},
    matchMedia: () => ({matches: reducedMotion}),
    localStorage: {
      getItem: key => key === 'bounce.settings.v3' ? JSON.stringify(settings) : storage.get(key),
      setItem: (key, value) => storage.set(key, value)
    },
    requestAnimationFrame(callback) { pendingFrame = callback; },
    ResizeObserver: class { constructor(callback) { resize = callback; } observe() {} }
  }, {filename: 'game.js'});
  return {
    get, storage, draws: () => draws,
    activateAction: () => get('action').dispatch('click', {detail: 0}),
    startWithMouse: (x = 500, y = 300) => get('action').dispatch('click', {
      detail: 1, pointerType: 'mouse', clientX: x, clientY: y
    }),
    clickArena: (x, y) => get('canvas').dispatch('pointerdown', {button: 0, pointerType: 'mouse', clientX: x, clientY: y}),
    frame(now) { const callback = pendingFrame; pendingFrame = null; callback?.(now); },
    resize(width, height) { Object.assign(dimensions, {width, height}); resize(); },
    key(type, code, key = code) { windowEvents.get(type)({code, key, preventDefault() {}}); },
    state: () => get('arena').dataset.state,
    obstacles: () => engine.world.bodies.filter(body => !body.isStatic)
  };
}

const oneCircle = {count: 1, types: [0], player: 'dot', progression: false};
const {Body, Collision} = Matter;

{
  const game = launch({...oneCircle,lossAnimation:true});
  game.activateAction();
  assert.equal(game.state(), 'running', 'activating Start once must start the attempt');
  const [body] = game.obstacles();
  Body.setPosition(body, {x: 505.2 + body.circleRadius, y: 300});
  Body.setVelocity(body, {x: -2, y: 0});
  game.key('keydown', 'KeyA', 'a');
  game.frame(10);
  game.frame(20);
  assert.equal(game.state(), 'running', 'outrunning a circle must not cause a phantom collision');
  game.key('keyup', 'KeyA', 'a');
  game.key('keydown', 'KeyD', 'd');
  game.frame(30);
  assert.equal(game.state(), 'impact', 'moving back into the circle must still cause a collision');
  assert.equal(game.get('overlay').hidden, true, 'the game over panel must wait for the animation');
  const frozenTime = game.get('time').textContent;
  const collisionX = body.position.x;
  game.frame(40);
  game.frame(200);
  assert.equal(body.position.x, collisionX, 'the contact frame must hold during the glow');
  game.frame(360);
  assert(body.position.x > collisionX + 15, 'the stronger blast must push the circle away from the contact point');
  assert.equal(game.get('time').textContent, frozenTime, 'the effect must not extend the scored run');
  game.frame(1000);
  assert.equal(game.get('overlay').hidden, false);
  assert.equal(game.get('impact-preview').hidden, false);
  assert.equal(game.get('description').textContent, 'Точка задела круг.');
  const [record] = game.storage.keys();
  assert.equal(JSON.parse(record.slice('bounce.best.v4.'.length)).arenaHeight, 600);
  assert.equal(launch(oneCircle, undefined, 1, game.storage).get('best').textContent, game.get('best').textContent);
  const otherArena = launch(oneCircle, {width: 400, height: 700}, 1, game.storage);
  assert.equal(otherArena.get('best').textContent, '00:00.0', 'a different arena must start with its own record');
  game.activateAction();
  assert.equal(game.state(), 'running', 'activating Play again once must start a new attempt');
  assert.equal(game.get('impact-preview').hidden, true, 'restarting must clear the previous impact preview');
}

{
  const game = launch({...oneCircle,count:2,types:[0,2],lossAnimation:true});
  game.startWithMouse();
  const [circle,triangle] = game.obstacles();
  Body.setPosition(circle,{x:570,y:300});
  Body.setPosition(triangle,{x:710,y:430});
  Body.setVelocity(triangle,{x:0,y:0});
  game.get('canvas').dispatch('pointermove',{pointerType:'mouse',clientX:650,clientY:300});
  game.frame(10);
  for(let now=26;now<=874;now+=16)game.frame(now);
  assert.equal(game.get('overlay').hidden,true,'the blast should still be visible');
  // A fast, unobstructed body must keep its momentum when the result card opens.
  Body.setPosition(triangle,{x:400,y:475});
  Body.setVelocity(triangle,{x:13,y:0});
  game.frame(890);
  assert.equal(game.get('overlay').hidden,false,'the result card must be visible');
  const position={...triangle.position};
  const time=game.get('time').textContent;
  game.frame(906);
  game.frame(922);
  const transitionSpeed=Math.hypot(triangle.velocity.x,triangle.velocity.y);
  assert(transitionSpeed>11.7&&transitionSpeed<13,'speed should taper across the result transition without a hard cap');
  for(let now=938;now<1120;now+=16)game.frame(now);
  assert(Math.hypot(triangle.position.x-position.x,triangle.position.y-position.y)>4,'the triangle must continue moving behind the result');
  assert.equal(game.get('time').textContent,time,'results must stay frozen while figures continue moving');
}

for(const [setting,reducedMotion] of [[{},false],[{lossAnimation:false},false],[{lossAnimation:true},true]]){
  const game = launch({...oneCircle,...setting}, undefined, 1, undefined, reducedMotion);
  game.startWithMouse();
  const [body] = game.obstacles();
  Body.setPosition(body, {x: 530, y: 300});
  game.get('canvas').dispatch('pointermove', {pointerType: 'mouse', clientX: 650, clientY: 300});
  assert.equal(game.get('overlay').hidden, false, 'with loss effects disabled the result must appear immediately');
  assert.equal(game.get('impact-preview').hidden, false, 'the contact information must be visible without effects');
  game.frame(10);
  game.frame(100);
  assert.equal(body.position.x, 530, 'with loss effects disabled the arena must stay still');
}

{
  const game = launch(oneCircle);
  game.startWithMouse();
  const [body] = game.obstacles();
  Body.setPosition(body, {x: 500, y: 370});
  assert.equal(game.state(), 'running');
  const arenaStyle = game.get('arena').style;
  assert.equal(arenaStyle['--field-inset'], '0px 0px', 'the outline should fill an unscaled arena');
  game.resize(1000, 160);
  assert.equal(game.state(), 'paused');
  const [insetY, insetX] = arenaStyle['--field-inset'].split(' ').map(Number.parseFloat);
  assert.equal(insetY, 0);
  assert(Math.abs(insetX - (1000 - 1000*160/600)/2) < .01, 'the outline should follow the fitted walls');
  game.activateAction();
  game.clickArena(500, 80);
  assert.equal(game.state(), 'running', 'resuming at the center after resizing must work');
  assert.equal(body.position.y, 370, 'resizing must preserve obstacle coordinates');
}

for (let seed = 63000; seed < 63020; seed++) {
  const game = launch({count: 30, size: 2, types: [2]}, {width: 1200, height: 500}, seed);
  game.activateAction();
  const bodies = game.obstacles();
  assert.equal(bodies.length, 30, 'dense fields must start with the requested figure count');
  for (const [i, body] of bodies.entries()) {
    assert(bodies.slice(i + 1).every(other => !Collision.collides(body, other)), 'starting figures must not overlap');
  }
}

{
  const game = launch(oneCircle);
  game.key('keydown', 'KeyD', 'd');
  assert.equal(game.state(), 'running', 'WASD must start an attempt directly');
  game.key('keydown', 'ArrowRight');
  game.frame(10);
  game.frame(20);
  const marker = game.get('player-marker');
  const before = marker.style.transform;
  game.key('keyup', 'ArrowRight');
  game.frame(30);
  assert.notEqual(marker.style.transform, before, 'D must keep moving the player after Right is released');

  game.key('keydown', 'Escape');
  game.frame(40);
  const pausedDraws = game.draws();
  for (let i = 1; i <= 120; i++) game.frame(40 + i * 1000 / 120);
  assert.equal(game.draws(), pausedDraws, 'pausing must stop recurring canvas draws');
}

{
  const game = launch(oneCircle);
  const canvas = game.get('canvas');
  const marker = game.get('player-marker');
  const touch = {pointerType: 'touch', pointerId: 1, button: 0, preventDefault() {}};
  game.get('action').dispatch('pointerdown', {...touch, clientX: 500, clientY: 300});
  assert.equal(game.state(), 'running', 'one tap on Start must start a touch attempt');
  canvas.dispatch('pointerup', {...touch, type: 'pointerup'});
  assert.equal(game.state(), 'running', 'releasing a tap on Start must keep the attempt running');
  Body.setPosition(game.obstacles()[0], {x: 250, y: 100});
  const before = marker.style.transform;
  canvas.dispatch('pointerdown', {...touch, clientX: 750, clientY: 400});
  assert.equal(marker.style.transform, before, 'touching elsewhere must keep the player in place');
  canvas.dispatch('pointermove', {...touch, clientX: 770, clientY: 400});
  assert.notEqual(marker.style.transform, before, 'dragging after a tap must move the player');
  canvas.dispatch('pointerup', {...touch, type: 'pointerup'});
  assert.equal(game.state(), 'paused', 'releasing an active drag must pause the attempt');
}

{
  const game = launch({...oneCircle, player: 'cursor', touchbar: true});
  const pad = game.get('touchpad');
  const marker = game.get('player-marker');
  pad.dispatch('pointerdown', {button: 0, pointerId: 1, clientX: 200, clientY: 600, preventDefault() {}});
  assert.equal(game.state(), 'running', 'a trackpad gesture must start an attempt');
  Body.setPosition(game.obstacles()[0], {x: 250, y: 100});
  pad.dispatch('pointermove', {pointerId: 1, clientX: 220, clientY: 610});
  assert(marker.style.transform.startsWith('translate3d(528px,314px,'), 'saved settings without sensitivity must use the original movement');
  pad.dispatch('pointermove', {pointerId: 1, clientX: 220, clientY: 900});
  assert.match(marker.style.transform, /583\.5px/, 'the full cursor must fit above the lower edge');
  pad.dispatch('pointerup', {pointerId: 1});
  const before = marker.style.transform;
  pad.dispatch('pointerdown', {button: 0, pointerId: 2, clientX: 100, clientY: 650, preventDefault() {}});
  assert.equal(marker.style.transform, before, 'new contact on the touchpad must not move the player');
}

for(const [value,x,y] of [[.5,514,307],[2,556,328]]){
  const game = launch({...oneCircle,touchbar:true,padSensitivity:value});
  game.activateAction();
  Body.setPosition(game.obstacles()[0],{x:250,y:100});
  const pad=game.get('touchpad');
  pad.dispatch('pointerdown',{button:0,pointerId:1,clientX:200,clientY:600,preventDefault() {}});
  pad.dispatch('pointermove',{pointerId:1,clientX:220,clientY:610});
  assert(game.get('player-marker').style.transform.startsWith(`translate3d(${x}px,${y}px,`), 'the same swipe should scale on both axes');
}

let maxDepth = 0;
for (let seed = 63000; seed < 63012; seed++) {
  const game = launch({count: 30, speed: 3, progression: false}, {width: 1280, height: 720}, seed);
  const bodies = game.obstacles();
  for (let frame = 1; frame <= 600; frame++) {
    game.frame(frame * 1000 / 60);
    for (const [i, body] of bodies.entries()) {
      for (let j = i + 1; j < bodies.length; j++) {
        if (body.gameType !== 2 && bodies[j].gameType !== 2) continue;
        const collision = Collision.collides(body, bodies[j]);
        if (collision) maxDepth = Math.max(maxDepth, collision.depth * 1.28);
      }
    }
  }
}
assert(maxDepth < .25, 'triangle contacts in dense scenes must stay below a quarter CSS pixel');
console.log('Game regressions passed. Worst triangle overlap:', +maxDepth.toFixed(3), 'CSS px');
