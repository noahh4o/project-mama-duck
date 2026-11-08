import test from 'node:test';
import assert from 'node:assert/strict';
import { createTracker, mapPoint, smooth } from './hands/tracker.mjs';
import { createHandsController } from './hands/hands.mjs';
import { createGestureRecognizer, extractGestureFeatures, scoreGesture } from './hands/gestures.mjs';
import { createAdvancedRecognizer, pointingFeatures } from './hands/advanced.mjs';
import { createHornsRecognizer, hornsFeatures } from './hands/horns.mjs';
import { createGameplayInputAdapter, mapHandPosition } from './hands/input-adapter.mjs';
const points = x => Array.from({ length: 21 }, () => ({ x, y: 0.5, z: 0 }));
const result = (...xs) => ({ landmarks: xs.map(points), handedness: xs.map((_,i) => [{ categoryName: i ? 'Right' : 'Left', score: .9 }]) });
function pose(kind = 'follow') {
  const p = Array.from({ length: 21 }, () => ({ x: .5, y: .6, z: 0 }));
  p[0] = { x: .5, y: .75, z: 0 }; p[5] = { x: .43, y: .67, z: 0 }; p[9] = { x: .5, y: .65, z: 0 }; p[13] = { x: .57, y: .67, z: 0 }; p[17] = { x: .63, y: .7, z: 0 };
  const xs = kind === 'follow' ? [.34, .43, .52, .61, .7] : [.48, .49, .5, .51, .52];
  for (let i = 0; i < 5; i++) { const m = [2, 5, 9, 13, 17][i], tip = [4, 8, 12, 16, 20][i]; p[m] = { x: xs[i], y: .63, z: 0 }; p[tip] = { x: xs[i], y: .35, z: 0 }; }
  if (kind === 'fist') for (const i of [4, 8, 12, 16, 20]) p[i] = { x: .5, y: .62, z: 0 };
  if (kind === 'repel') p[4] = { x: .3, y: .45, z: 0 };
  if (kind === 'pinch') { p[4] = { x: .49, y: .52, z: 0 }; p[8] = { x: .5, y: .52, z: 0 }; for (const i of [12, 16, 20]) p[i] = { x: .5, y: .62, z: 0 }; }
  if (kind === 'partial') for (const i of [12, 16]) p[i] = { x: .5, y: .5, z: 0 };
  return p;
}
function pinchExtended() { const p = pose('follow'); p[4] = { x: .49, y: .52, z: 0 }; p[8] = { x: .5, y: .52, z: 0 }; return p; }
function pinchPartial() { const p = pinchExtended(); for (const i of [12, 16]) p[i] = { x: .5, y: .52, z: 0 }; return p; }
function tracked(id, landmarks) { return { id, landmarks, trackingStatus: 'tracked', position: { x: .5, y: .5 } }; }
function advancedHand(id, x, y, gesture = 'NEUTRAL', pointing = false) { return { id, trackingStatus: 'tracked', gesture, position: { x, y }, gestureFeatures: { valid: true, extension: pointing ? [0.5, 1.3, .5, .5, .5] : [.5, .5, .5, .5, .5], curled: pointing ? [true, false, true, true, true] : [true, true, true, true, true] } }; }
test('mapping mirrors once, clamps, and handles letterbox and crop', () => {
  assert.deepEqual(mapPoint({ x: .2, y: .3 }, { mirror: true }), { x: .8, y: .3 });
  assert.deepEqual(mapPoint({ x: -1, y: 2 }), { x: 0, y: 1 });
  assert.equal(mapPoint({ x: 0, y: 0 }, { width: 100, height: 100, sourceWidth: 200, sourceHeight: 100 }).y, .25);
  assert.equal(mapPoint({ x: 0, y: 0 }, { width: 100, height: 100, sourceWidth: 200, sourceHeight: 100, fit: 'cover' }).x, 0);
});
test('geometric scores distinguish spread, fist, and extended-together poses', () => {
  const follow = scoreGesture(extractGestureFeatures(pose('follow')));
  const together = scoreGesture(extractGestureFeatures(pose('repel')));
  const fist = scoreGesture(extractGestureFeatures(pose('fist')));
  assert.equal(follow.gesture, 'FOLLOW'); assert.equal(together.gesture, 'NEUTRAL'); assert.equal(fist.gesture, 'REPEL');
  assert.equal(scoreGesture(extractGestureFeatures(pose('pinch'))).gesture, 'GRAB');
  assert.equal(scoreGesture(extractGestureFeatures(pinchExtended())).gesture, 'GRAB');
  assert.equal(scoreGesture(extractGestureFeatures(pinchPartial())).gesture, 'GRAB');
});
test('ambiguous pose is rejected instead of choosing a gesture', () => {
  const features = extractGestureFeatures(pose('follow'));
  const scored = scoreGesture(features, { openSpread: .4, ambiguityMargin: 1 });
  assert.equal(scored.gesture, 'NEUTRAL'); assert.equal(scored.rejectionReason, 'ambiguous-scores');
});
test('gesture activation, release hysteresis and rapid switching are temporal', () => {
  const r = createGestureRecognizer({ activationMs: 100, releaseMs: 120 }); const hand = id => tracked(id, pose('follow'));
  assert.equal(r.update([hand('h1')], 0)[0].gesture, 'NEUTRAL');
  assert.equal(r.update([hand('h1')], 80)[0].candidateGesture, 'FOLLOW');
  assert.equal(r.update([hand('h1')], 110)[0].gesture, 'FOLLOW');
  const neutral = tracked('h1', pose('fist'));
  assert.equal(r.update([neutral], 180)[0].gesture, 'FOLLOW');
  assert.equal(r.update([neutral], 310)[0].gesture, 'REPEL');
  assert.equal(r.update([tracked('h1', pose('follow'))], 350)[0].gesture, 'REPEL');
  assert.equal(r.update([tracked('h1', pose('follow'))], 470)[0].gesture, 'FOLLOW');
});
test('two hand gesture states remain independent', () => {
  const r = createGestureRecognizer({ activationMs: 0 });
  const out = r.update([tracked('left', pose('follow')), tracked('right', pose('fist'))], 0);
  assert.deepEqual(out.map(h => h.gesture), ['FOLLOW', 'REPEL']);
  const lost = r.update([tracked('left', pose('follow')), { ...tracked('right', pose('fist')), trackingStatus: 'grace' }], 20);
  assert.equal(lost[0].gesture, 'FOLLOW'); assert.equal(lost[1].gesture, 'NEUTRAL');
});
test('GRAB has priority across remaining-finger poses and temporal release', () => {
  const r = createGestureRecognizer({ activationMs: 80, releaseMs: 100 });
  const hand = landmarks => tracked('h1', landmarks);
  assert.equal(r.update([hand(pinchExtended())], 0)[0].candidateGesture, 'GRAB');
  assert.equal(r.update([hand(pinchExtended())], 90)[0].gesture, 'GRAB');
  assert.equal(r.update([hand(pinchPartial())], 140)[0].gesture, 'GRAB');
  assert.equal(r.update([hand(pose('follow'))], 200)[0].gesture, 'GRAB');
  assert.equal(r.update([hand(pose('follow'))], 310)[0].gesture, 'FOLLOW');
});
test('FOLLOW plus GRAB and REPEL plus GRAB remain independent', () => {
  const r = createGestureRecognizer({ activationMs: 0 });
  const out = r.update([tracked('follow', pose('follow')), tracked('grab', pinchExtended())], 0);
  assert.deepEqual(out.map(h => h.gesture), ['FOLLOW', 'GRAB']);
  const second = r.update([tracked('repel', pose('fist')), tracked('grab', pinchPartial())], 100);
  assert.equal(second.find(h => h.id === 'grab').gesture, 'GRAB');
});
test('production Horns qualifies once, requires release, and preserves source metadata', () => {
  const hand = { id: 'h1', trackingStatus: 'tracked', position: { x: .5, y: .5 }, gestureFeatures: { valid: true, extension: [.7, 1.2, .7, .7, 1.2], curled: [true, false, true, true, false], palmProximity: [.5] } };
  assert.equal(hornsFeatures(hand).hornsDetected, true);
  const r = createHornsRecognizer({ holdMs: 180, cooldownMs: 450 });
  assert.equal(r.update([hand], 0).events.length, 0);
  assert.equal(r.update([hand], 200).events[0].source, 'horns-diagnostic');
  assert.equal(r.update([hand], 400).events.length, 0);
  assert.equal(r.update([{ ...hand, gestureFeatures: { ...hand.gestureFeatures, extension: [.7, .7, .7, .7, .7], curled: [true, true, true, true, true] } }], 500).events.length, 0);
  assert.equal(r.update([hand], 700).events.length, 0);
  assert.equal(r.update([hand], 900).events.length, 1);
});
test('gameplay adapter maps mirrored hands and deduplicates ATTACK events', () => {
  assert.deepEqual(mapHandPosition({ x: .2, y: .5 }, { width: 100, height: 80, mirror: true }), { x: 80, y: 40 });
  const adapter = createGameplayInputAdapter({ width: 100, height: 80, mirror: true });
  const state = { hands: [{ id: 'h1', gesture: 'FOLLOW', trackingStatus: 'tracked', position: { x: .2, y: .5 } }] };
  assert.equal(adapter.update(state).commands[0].type, 'follow');
  const event = { type: 'ATTACK', source: 'horns', handId: 'h1', timestamp: 10, sequenceId: 1 };
  assert.equal(adapter.update(state, [event]).commands.at(-1).type, 'attack');
  assert.equal(adapter.update(state, [event]).commands.some(c => c.type === 'attack'), false);
});
test('advanced recognizer emits one attack and cancels on loss', () => {
  const r = createAdvancedRecognizer({ pointArmMs: 80, flickDistance: .1, flickSpeed: .3 });
  assert.equal(r.update([advancedHand('h1', .2, .5, 'NEUTRAL', true)], 0).events.length, 0);
  assert.equal(r.update([advancedHand('h1', .2, .5, 'NEUTRAL', true)], 100).events.length, 0);
  const event = r.update([advancedHand('h1', .38, .5, 'NEUTRAL', true)], 200).events;
  assert.equal(event[0].type, 'ATTACK'); assert.equal(r.update([advancedHand('h1', .4, .5, 'NEUTRAL', true)], 250).events.length, 0);
  r.reset(); assert.equal(r.update([{ ...advancedHand('h1', .2, .5, 'NEUTRAL', true), trackingStatus: 'grace' }], 0).events.length, 0);
});
test('ATTACK detects each deliberate direction once and ignores stationary or slow motion', () => {
  const cases = [
    ['right', [.2, .5], [.38, .5], 'x', 1],
    ['left', [.8, .5], [.62, .5], 'x', -1],
    ['down', [.5, .2], [.5, .38], 'y', 1],
    ['up', [.5, .8], [.5, .62], 'y', -1]
  ];
  for (const [, start, end, axis, sign] of cases) {
    const r = createAdvancedRecognizer({ pointArmMs: 80, flickDistance: .1, flickSpeed: .3, flickCooldownMs: 200 });
    r.update([advancedHand('h1', start[0], start[1], 'NEUTRAL', true)], 0);
    r.update([advancedHand('h1', start[0], start[1], 'NEUTRAL', true)], 100);
    const event = r.update([advancedHand('h1', end[0], end[1], 'NEUTRAL', true)], 200).events.find(e => e.type === 'ATTACK');
    assert.ok(event); assert.ok(event.direction[axis] * sign > .9);
    assert.equal(r.update([advancedHand('h1', end[0], end[1], 'NEUTRAL', true)], 250).events.length, 0);
  }
  const stationary = createAdvancedRecognizer({ pointArmMs: 80 });
  stationary.update([advancedHand('h1', .5, .5, 'NEUTRAL', true)], 0);
  stationary.update([advancedHand('h1', .5, .5, 'NEUTRAL', true)], 100);
  assert.equal(stationary.update([advancedHand('h1', .53, .5, 'NEUTRAL', true)], 300).events.length, 0);
});
test('pointing geometry is rotation-tolerant and rejects open, fist, and grab poses', () => {
  const pointing = { gestureFeatures: { valid: true, extension: [.8, 1.2, .5, .5, .5], curled: [true, false, true, true, true] } };
  const thumbOut = { gestureFeatures: { valid: true, extension: [1.4, 1.2, .5, .5, .5], curled: [false, false, true, true, true] } };
  const open = { gestureFeatures: { valid: true, extension: [1.2, 1.2, 1.2, 1.2, 1.2], curled: [false, false, false, false, false] } };
  const fist = { gestureFeatures: { valid: true, extension: [.7, .7, .7, .7, .7], curled: [true, true, true, true, true] } };
  assert.equal(pointingFeatures(pointing).pointing, true); assert.equal(pointingFeatures(thumbOut).pointing, true);
  assert.equal(pointingFeatures(open).pointing, false); assert.equal(pointingFeatures(fist).pointing, false);
  const cameraFacing = { gestureFeatures: { valid: true, extension: [.8, .48, .5, .5, .5], indexStraightness: .86, curled: [true, false, true, true, true] } };
  assert.equal(pointingFeatures(cameraFacing).pointing, true);
});
test('advanced recognizer requires converging distinct fists for GAP', () => {
  const r = createAdvancedRecognizer({ gapStartSeparation: .3, gapEndSeparation: .1 });
  r.update([advancedHand('l', .2, .5, 'REPEL'), advancedHand('r', .8, .5, 'REPEL')], 0);
  r.update([advancedHand('l', .3, .5, 'REPEL'), advancedHand('r', .7, .5, 'REPEL')], 100);
  const events = r.update([advancedHand('l', .46, .5, 'REPEL'), advancedHand('r', .54, .5, 'REPEL')], 200).events;
  assert.equal(events[0].type, 'GAP');
  const stationary = createAdvancedRecognizer({ gapStartSeparation: .3, gapEndSeparation: .1 });
  stationary.update([advancedHand('l', .45, .5, 'REPEL'), advancedHand('r', .55, .5, 'REPEL')], 0);
  assert.equal(stationary.update([advancedHand('l', .45, .5, 'REPEL'), advancedHand('r', .55, .5, 'REPEL')], 100).events.length, 0);
});
test('smoothing responds to elapsed time', () => {
  const p = { x: 0, y: 0 }, q = { x: 1, y: 1 };
  assert.ok(smooth(p,q,20).x > 0 && smooth(p,q,20).x < smooth(p,q,40).x);
  assert.deepEqual(smooth(p,q,10,0), q);
});
test('identity survives reordered detections and uses timestamp velocity', () => {
  const t = createTracker({ smoothingMs: 0 }); const a=t.update(result(.2,.8),0);
  const b=t.update(result(.78,.22),100);
  assert.equal(b[0].id,a[1].id); assert.equal(b[1].id,a[0].id);
  assert.ok(Math.abs(b[1].velocity.x-.2)<1e-8);
});
test('loss, grace, recovery, expiry, malformed input and copy safety', () => {
  const t=createTracker(); const id=t.update(result(.3),0)[0].id;
  assert.equal(t.update({},50)[0].trackingStatus,'grace');
  const back=t.update(result(.31),100)[0]; assert.equal(back.id,id); assert.equal(back.velocity.x,0);
  assert.equal(t.update({},250)[0].trackingStatus,'lost');
  assert.deepEqual(t.update({landmarks:[[{}]]},500),[]);
  const fresh=t.update(result(.3),600); assert.notEqual(fresh[0].id,id); fresh[0].position.x=8;
  assert.ok(t.update(result(.3),650)[0].position.x<=1);
  assert.throws(()=>t.update({},650));
});
test('ambiguous crossing resets movement history',()=>{
  const t=createTracker();const old=t.update(result(.45,.55),0);
  const next=t.update(result(.5,.5),50);
  assert.ok(next.every(h=>!old.some(o=>o.id===h.id)&&h.velocity.x===0));
});
function fake() {
  let stopped=0, closed=0, calls=0, callbacks=new Map(), n=0;
  const track={stop(){stopped++;},addEventListener(){}};
  const stream={getTracks:()=>[track],getVideoTracks:()=>[track]};
  const video={videoWidth:640,videoHeight:480,readyState:2,currentTime:0,play:async()=>{},requestVideoFrameCallback(fn){callbacks.set(++n,fn);return n;},cancelVideoFrameCallback(id){callbacks.delete(id);}};
  const loadVision=async()=>({FilesetResolver:{forVisionTasks:async()=>({})},HandLandmarker:{createFromOptions:async()=>({close(){closed++;},detectForVideo(){calls++;return result(.3);}})}});
  const c=createHandsController({loadVision,mediaDevices:{getUserMedia:async()=>stream}});
  return {c,video,stream,stats:()=>({stopped,closed,calls,loops:callbacks.size}),frame(now){const [id,fn]=callbacks.entries().next().value;callbacks.delete(id);fn(now);}};
}
test('lifecycle deduplicates starts, avoids duplicate frames, pauses and releases',async()=>{
  const f=fake();assert.equal(f.c.getState().status,'idle');await f.c.init({video:f.video});
  await Promise.all([f.c.start(),f.c.start()]);assert.equal(f.stats().loops,1);
  f.frame(100);f.frame(150);assert.equal(f.stats().calls,1);
  const s=f.c.getState();s.hands[0].position.x=99;assert.ok(f.c.getState().hands[0].position.x<=1);
  f.c.pause();assert.equal(f.stats().loops,0);assert.equal(f.c.getState().status,'paused');
  await f.c.start();f.c.stop();assert.equal(f.stats().stopped,1);assert.equal(f.video.srcObject,null);
  await f.c.start();f.c.destroy();assert.equal(f.stats().closed,1);assert.equal(f.stats().stopped,2);
  await assert.rejects(f.c.start(),/destroyed/);
});
test('stop during permission acquisition releases late stream',async()=>{
  let resolve,stopped=0;const f=fake();
  const c=createHandsController({loadVision:async()=>({FilesetResolver:{forVisionTasks:async()=>({})},HandLandmarker:{createFromOptions:async()=>({close(){}})}}),mediaDevices:{getUserMedia:()=>new Promise(r=>resolve=r)}});
  await c.init({video:f.video});const start=c.start();c.stop();resolve({getTracks:()=>[{stop(){stopped++;}}]});await start;
  assert.equal(stopped,1);assert.equal(c.getState().status,'stopped');c.destroy();
});
test('GPU failure falls back to CPU and permission errors are serializable',async()=>{
  const delegates=[];const f=fake();const c=createHandsController({loadVision:async()=>({FilesetResolver:{forVisionTasks:async()=>({})},HandLandmarker:{createFromOptions:async(_,o)=>{delegates.push(o.baseOptions.delegate);if(delegates.length===1)throw Error('GPU unavailable');return {close(){}};}}}),mediaDevices:{getUserMedia:async()=>{throw Object.assign(Error('Permission denied'),{name:'NotAllowedError'});}}});
  await c.init({video:f.video});assert.deepEqual(delegates,['GPU','CPU']);await assert.rejects(c.start());assert.equal(c.getState().error.name,'NotAllowedError');c.destroy();
});
test('destroy during initialization closes the late model',async()=>{
  let resolve,closed=0;const f=fake();const c=createHandsController({loadVision:async()=>({FilesetResolver:{forVisionTasks:async()=>({})},HandLandmarker:{createFromOptions:()=>new Promise(r=>resolve=r)}})});
  const init=c.init({video:f.video});await new Promise(r=>setImmediate(r));c.destroy();resolve({close(){closed++;}});await init;
  assert.equal(closed,1);assert.equal(c.getState().status,'destroyed');
});
test('subscriptions unsubscribe; viewport does not change handedness',async()=>{
  const f=fake();let events=0;const off=f.c.on('stateChange',()=>events++);
  await f.c.init({video:f.video});await f.c.start();f.frame(100);
  const before=f.c.getState().hands[0];off();const count=events;
  f.c.setViewport({width:640,height:480,mirror:false});const after=f.c.getState().hands[0];
  assert.equal(events,count);assert.equal(before.handedness,after.handedness);assert.ok(Math.abs(before.position.x+after.position.x-1)<1e-8);f.c.destroy();
});
