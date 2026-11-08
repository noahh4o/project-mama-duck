import test from 'node:test';
import assert from 'node:assert/strict';
import { createJourney, stepJourney, virtualHands, attack, startThreat, attackGeometry, inDanger, difficultyAt } from './homeward.mjs';
import { createGameplayInputAdapter } from './hands/input-adapter.mjs';
import { createGestureRecognizer } from './hands/gestures.mjs';
const input = (gesture, x, y, id='h1') => ({handId:id,gesture,target:{x,y},trackingValid:true});
function run(s,hands,seconds,fps=60,commands=[]) {for(let i=0;i<seconds*fps;i++)stepJourney(s,{hands,commands:i===0?commands:[]},1/fps);}
test('virtual webcam player survives full seeded journeys at 30, 60 and 120 fps',()=>{
  for(const fps of [30,60,120]) for(const seed of [1,42,817]) {
    const s=createJourney(seed), adapter=createGameplayInputAdapter({width:960,height:540});
    for(let i=0;i<fps*91&&s.status==='playing';i++){const raw=virtualHands(s);stepJourney(s,adapter.update(raw,raw.events),1/fps);}
    assert.equal(s.status,'won');assert.equal(s.saved,8);assert.ok(s.stats.dodges>=7);assert.ok(s.score>=4500);for(const type of ['fox','wolf','hawk'])assert.ok(s.stats[type]>=2);assert.equal(s.stats.raccoon,1);assert.equal(s.stats.shockwave,1);assert.equal(s.stats.passages,4);assert.equal(s.stats.attacks,1);assert.equal(s.stats.rescues,2);
  }
});
test('FOLLOW arrives without clustering and REPEL moves ducks away at multiple frame rates',()=>{
  for(const fps of [30,60,120]){const s=createJourney();run(s,[input('FOLLOW',700,360)],3,fps);assert.ok(s.ducks.every(d=>d.x>620&&d.x<770));const d=s.ducks[0],x=d.x;run(s,[input('REPEL',d.x-40,d.y)],.3,fps);assert.ok(d.x>x);}
});
test('GRAB carries one duck, opposite hand still steers, loss releases immediately',()=>{
 const s=createJourney();run(s,[input('GRAB',360,240),input('FOLLOW',650,150,'h2')],.2);assert.equal(s.grabs.size,1);
 run(s,[input('GRAB',800,420),input('FOLLOW',650,150,'h2')],1);const d=s.ducks.find(d=>d.id===[...s.grabs.values()][0]);assert.ok(d.x>790);assert.ok(s.ducks.filter(d=>d!==s.ducks[0]).some(d=>d.y<210));run(s,[],.1);assert.equal(s.grabs.size,0);
});
test('committed fox lane does not track ducks, damage only during execution and failure ends',()=>{
 const s=createJourney();s.nextThreat=0;run(s,[],.1);const y=s.threat.y;run(s,[input('FOLLOW',500,450)],1);assert.equal(s.threat.y,y);assert.equal(s.stats.losses,0);
 const death=createJourney();death.nextThreat=0;death.ducks.forEach(d=>{d.y=270;});run(death,[],4);assert.equal(death.status,'lost');const t=death.time;run(death,[],1);assert.equal(death.time,t);
});
test('GAP opens two safe banks; ATTACK scares a nearby fox with cooldown',()=>{
 const s=createJourney();s.nextThreat=0;run(s,[],.1);const y=s.threat.y;s.gapY=y;
 run(s,[input('REPEL',450,y),input('REPEL',500,y,'h2')],2.8,60,[{type:'gap'}]);assert.equal(s.stats.losses,0);assert.ok(s.ducks.every(d=>Math.abs(d.y-y)>45));
 const a=createJourney();a.nextThreat=0;run(a,[],.1);assert.equal(attack(a,{x:900,y:a.threat.y}),true);assert.equal(a.threat.scared,true);assert.equal(attack(a,{x:900,y:270}),false);
});
test('restart has fresh score, cooldown, ownership and independent state',()=>{const s=createJourney();attack(s,{x:1,y:1});const fresh=createJourney();assert.equal(fresh.score,0);assert.equal(fresh.attackCooldown,0);assert.equal(fresh.grabs.size,0);assert.notEqual(s.ducks,fresh.ducks);});
test('21-landmark input passes geometric recognition, temporal hold, adapter and production steering',()=>{
 const p=Array.from({length:21},()=>({x:.5,y:.6,z:0}));p[0]={x:.5,y:.75,z:0};
 for(const [i,mcp,tip] of [[0,2,4],[1,5,8],[2,9,12],[3,13,16],[4,17,20]]){const x=.34+i*.09;p[mcp]={x,y:.63,z:0};p[tip]={x,y:.35,z:0};}
 const r=createGestureRecognizer(), adapter=createGameplayInputAdapter({width:960,height:540}), s=createJourney();
 for(let i=0;i<120;i++){const now=i*1000/60;const hands=r.update([{id:'landmarks',landmarks:p,position:{x:.75,y:.6},trackingStatus:'tracked'}],now);stepJourney(s,adapter.update({hands}),1/60);}
 assert.equal(s.hands[0].gesture,'FOLLOW');assert.ok(s.ducks.every(d=>d.x>600));
});
test('GAP activation requires a convergence event and independent simultaneous attacks survive routing',()=>{
 const a=createGameplayInputAdapter({width:960,height:540}); const state={hands:[{id:'l',position:{x:.4,y:.5},gesture:'REPEL',trackingStatus:'tracked'},{id:'r',position:{x:.6,y:.5},gesture:'REPEL',trackingStatus:'tracked'}],coordination:{gapArmed:true}};
 assert.equal(a.update(state).commands.some(c=>c.type==='gap'),false);
 const gap={type:'GAP',timestamp:10,handIds:['l','r']};assert.equal(a.update(state,[gap]).commands.filter(c=>c.type==='gap').length,1);assert.equal(a.update(state,[gap]).commands.some(c=>c.type==='gap'),false);
 const events=['l','r'].map(handId=>({type:'ATTACK',handId,timestamp:20}));assert.equal(a.update(state,events).commands.filter(c=>c.type==='attack').length,2);
});
test('wide wolf charge can be survived by splitting with GAP throughout execution',()=>{
 const s=createJourney();s.nextThreat=Infinity;s.ducks.forEach(d=>{d.y=270;});assert.equal(startThreat(s,'wolf',s.ducks[0]),true);
 run(s,[],.3);run(s,[input('REPEL',400,270),input('REPEL',500,270,'h2')],6,60,[{type:'gap'}]);
 assert.equal(s.stats.losses,0);assert.equal(s.stats.dodges,1);assert.equal(s.threat,null);
});
test('locked hawk dive can be rescued through GRAB or avoided through FOLLOW',()=>{
 for(const gesture of ['GRAB','FOLLOW']){const s=createJourney();s.nextThreat=Infinity;const duck=s.ducks[0];startThreat(s,'hawk',duck);const lock=attackGeometry(s.threat);run(s,[input(gesture,duck.x,duck.y)],.2);run(s,[input(gesture,700,440)],4.5);assert.equal(duck.alive,true);assert.ok(s.stats.dodges>=1);assert.deepEqual(lock,{kind:'circle',x:360,y:240,radius:52});if(gesture==='GRAB')assert.equal(s.stats.rescues,1);}
});
test('raccoon theft takes at most one duck; horns command interrupts before capture',()=>{
 const unsafe=createJourney();unsafe.nextThreat=Infinity;unsafe.ducks.forEach(d=>{d.x=400;d.y=270;});startThreat(unsafe,'raccoon',unsafe.ducks[0]);run(unsafe,[],4.5);assert.equal(unsafe.stats.losses,1);
 const safe=createJourney();safe.nextThreat=Infinity;startThreat(safe,'raccoon',safe.ducks[0]);run(safe,[],1.8);const t=safe.threat;assert.equal(attack(safe,{x:t.x,y:t.y}),true);run(safe,[],3);assert.equal(safe.stats.losses,0);assert.equal(safe.stats.attacks,1);
});
test('fox REPEL counterplay and warning/collision geometry share the locked lane',()=>{
 const s=createJourney();s.nextThreat=Infinity;s.ducks.forEach(d=>{d.x=400;d.y=270+(d.id%2?1:-1);});startThreat(s,'fox',s.ducks[0]);const geometry=attackGeometry(s.threat);assert.equal(inDanger(s.threat,{x:500,y:geometry.y}),true);assert.equal(inDanger(s.threat,{x:500,y:geometry.y+geometry.width}),false);run(s,[input('REPEL',400,220)],4.5);assert.equal(s.stats.losses,0);
});
test('logs penalize contact once and narrow passages reward precise gathering',()=>{
 for(const type of ['log','passage']){const s=createJourney();s.nextThreat=Infinity;s.nextObstacle=Infinity;s.obstacle={type,x:1000,y:300,width:60,gap:150,hit:new Set()};run(s,[input('FOLLOW',460,type==='log'?120:300)],8);assert.equal(s.stats.passages,1);assert.equal(s.stats.losses,0);assert.ok(s.score>=100);}
 const hit=createJourney();hit.nextThreat=Infinity;hit.nextObstacle=Infinity;hit.obstacle={type:'log',x:440,y:250,hit:new Set()};hit.score=100;run(hit,[],.5);const n=hit.obstacle.hit.size;assert.ok(n>0);assert.equal(hit.score,100-n*10);
});
test('scheduler prevents simultaneous major threats and obstacles defer incoming attacks',()=>{
 const s=createJourney();assert.equal(startThreat(s,'wolf'),true);assert.equal(startThreat(s,'hawk'),false);s.nextObstacle=0;run(s,[],1);assert.equal(s.obstacle,null);assert.equal(s.threat.type,'wolf');
 const o=createJourney();o.nextThreat=0;o.obstacle={type:'log',x:900,y:300,hit:new Set()};run(o,[],1);assert.equal(o.threat,null);
});
test('hawk preserves target ID and original impact point, prioritizes its duck, awards only a completed rescue',()=>{
 const s=createJourney();s.nextThreat=Infinity;const marked=s.ducks[7];startThreat(s,'hawk',marked);const targetId=marked.id,origin=attackGeometry(s.threat);
 // Cursor is closer to a different duck; the marked duck inside pinch reach wins.
 run(s,[input('GRAB',s.ducks[0].x,s.ducks[0].y)],.2);assert.equal(s.grabs.get('h1'),targetId);assert.equal(s.stats.rescues,0);
 run(s,[input('GRAB',820,430)],1.4);assert.equal(s.threat.targetId,targetId);assert.equal(s.threat.committed,true);assert.deepEqual(attackGeometry(s.threat),origin);assert.ok(marked.x>800);
 run(s,[input('GRAB',820,430)],3);assert.equal(marked.alive,true);assert.equal(s.stats.rescues,1);assert.ok(s.effects.some(e=>e.kind==='rescue'));
});
test('unrescued hawk catches only its selected duck and never switches to neighbors',()=>{
 const s=createJourney();s.nextThreat=Infinity;s.ducks.forEach(d=>{d.x=400;d.y=270;});startThreat(s,'hawk',s.ducks[4]);run(s,[],4.5);assert.equal(s.ducks[4].alive,false);assert.equal(s.ducks.filter(d=>d.alive).length,7);assert.equal(s.stats.rescues,0);
});
test('shockwave rewards outward REPEL while stationary flock is caught',()=>{
 for(const repel of [false,true]){const s=createJourney();s.nextThreat=Infinity;startThreat(s,'shockwave',{id:0,x:410,y:260});run(s,repel?[input('REPEL',410,260)]:[],5.5);assert.equal(s.stats.losses,repel?0:8);}
});
test('two held fists split after stable hold, expire cleanly, and require release to rearm',()=>{
 const s=createJourney();s.nextThreat=Infinity;const fists=[input('REPEL',420,270),input('REPEL',500,270,'h2')];run(s,fists,.15);assert.equal(s.gapUntil,0);run(s,fists,.1);assert.ok(s.gapUntil>s.time);const activation=s.lastGap;run(s,fists,4);assert.equal(s.lastGap,activation);assert.ok(s.gapUntil<s.time);run(s,[],.1);run(s,fists,.25);assert.ok(s.lastGap>activation);
});
test('difficulty increases scroll, pressure and score while preserving physical reaction windows',()=>{
 const early=difficultyAt(0),late=difficultyAt(90);assert.ok(late.scroll>early.scroll);assert.ok(late.obstacleSpeed>early.obstacleSpeed);assert.ok(late.spacing<early.spacing);assert.ok(late.warning>=2.2);assert.ok(late.multiplier>early.multiplier);
 const s=createJourney();s.time=80;s.nextThreat=Infinity;startThreat(s,'hawk');assert.ok(s.threat.warning>=3.2);const duration=s.threat.warning;run(s,[input('FOLLOW',700,420)],duration-.1);assert.equal(s.threat.phase,'telegraph');run(s,[input('FOLLOW',700,420)],1.5);assert.equal(s.stats.losses,0);
});
