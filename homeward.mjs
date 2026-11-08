import { createAttackScheduler } from './enemies.mjs';
// Deterministic game simulation shared by the browser and virtual player.
export const TUNING = Object.freeze({ width: 960, height: 540, duration: 90, speed: 245, response: 7, warning: 3.2, charge: .85, recovery: 1.3, gapSeconds: 3.2 });
export function difficultyAt(time) { const p=Math.max(0,Math.min(1,time/90));return {scroll:25+50*p,warning:3.2-p,charge:.85-.25*p,spacing:5-2.4*p,obstacleSpeed:130+65*p,obstacleSpacing:14-5*p,attackCooldown:1.3-.4*p,multiplier:1+p}; }
function award(s,amount,kind,x=480,y=135){const points=Math.round(amount*difficultyAt(s.time).multiplier);s.score+=points;s.effects.push({x,y,kind,points,life:1,total:1});}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export function createJourney(seed = 42) {
  const state = { seed: seed >>> 0, time: 0, status: 'playing', score: 0, saved: 0, combo: 0, nextThreat: 8, nextLight: 2, encounter: 0, obstacleIndex: 0, nextObstacle: 14, obstacle: null,
    ducks: Array.from({ length: 8 }, (_, id) => ({ id, x: 360 + id % 4 * 29, y: 240 + Math.floor(id / 4) * 32, vx: 0, vy: 0, alive: true, shield: 0 })),
    hands: [], threat: null, lights: [], effects: [], grabs: new Map(), attackCooldown: 0, gapUntil: 0, gapY: 270,
    stats: { attacks: 0, dodges: 0, losses: 0, collected: 0, rescues: 0, passages: 0, fox: 0, wolf: 0, hawk: 0, raccoon: 0, shockwave: 0 }, lastGap: -Infinity, splitHold:0,splitLatched:false,worldScroll:0,survivalTick:0 };
  Object.defineProperty(state, 'scheduler', { value: createAttackScheduler({ telegraphMs: 2600, executeMs: 650, recoverMs: 1100, spacingMs: 800 }), enumerable: false });
  return state;
}
export function attackGeometry(t) { return ['hawk','raccoon','shockwave'].includes(t.type) ? { kind: 'circle', x: t.lockX, y: t.y, radius: t.type === 'hawk' ? 52 : t.type==='shockwave'?170:62 } : { kind: 'lane', y: t.y, width: t.width }; }
export function inDanger(t, d) { if(t.type==='hawk'&&d.id!=null&&d.id!==t.targetId)return false;const g = attackGeometry(t); return g.kind === 'circle' ? Math.hypot(d.x-g.x,d.y-g.y) < g.radius : Math.abs(d.y-g.y) < g.width/2 + 9; }
export function startThreat(s, type = 'fox', target = s.ducks.find(d=>d.alive)) {
  if (s.threat || s.obstacle || !target) return false;
  const enemy = { id: `encounter-${s.encounter}`, type, x: 1000, y: type==='hawk'?target.y:clamp(target.y, 100, 450) };
  const d=difficultyAt(s.time),warning=type==='hawk'?Math.max(3.2,d.warning):d.warning;
  if (!s.scheduler.request(enemy,s.time*1000,{x:target.x,y:enemy.y},{telegraphMs:warning*1000,executeMs:d.charge*1000,recoverMs:1100})) return false;
  s.threat = {...enemy, lockX: target.x, phase:'telegraph',elapsed:0,width:type==='wolf'?126:44,warning,charge:d.charge,hit:new Set(),scared:false,targetId:target.id,committed:type!=='hawk',rescueGrabbed:false};
  s.stats[type]++;s.encounter++;return true;
}
function random(s) { s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0; return s.seed / 4294967296; }
export function attack(s, target) {
  if (s.attackCooldown > 0 || s.status !== 'playing') return false;
  s.attackCooldown = difficultyAt(s.time).attackCooldown; s.stats.attacks++;
  s.effects.push({ ...target, kind: 'attack', life: .5, total: .5 });
  if (s.threat && (distance(target, s.threat) < 260 || s.ducks.some(d=>d.alive&&distance(d,s.threat)<150)) && s.threat.phase !== 'recover') {
    if(s.threat.type==='shockwave')return true;
    s.threat.phase = 'recover'; s.threat.elapsed = 0; s.threat.scared = true; award(s,100,'interrupt');
  }
  return true;
}
export function stepJourney(s, input, seconds) {
  if (s.status !== 'playing') return;
  // Fixed substeps keep steering and swept collision reliable at low frame rates.
  const duration = clamp(seconds, 0, .25), count = Math.max(1, Math.ceil(duration * 120));
  const hands = input?.hands ?? [];
  s.hands = hands;
  const fists=hands.length===2&&hands.every(h=>h.gesture==='REPEL');
  s.splitHold=fists?s.splitHold+duration:0;if(!fists)s.splitLatched=false;
  const automaticSplit=fists&&s.splitHold>=.18&&!s.splitLatched;
  if(automaticSplit)s.splitLatched=true;
  const commands=[...(input?.commands??[])];if(automaticSplit)commands.push({type:'gap',automatic:true});
  for (const command of commands) {
    const owner = hands.find(h => h.handId === command.handId);
    if (command.type === 'attack' && owner) attack(s, owner.target);
    if (command.type === 'gap' && hands.length === 2 && s.time - s.lastGap > 3 && (command.automatic||!fists||!s.splitLatched)) {
      s.gapY = (hands[0].target.y + hands[1].target.y) / 2; s.gapUntil = s.time + TUNING.gapSeconds; s.lastGap = s.time;
      if(fists)s.splitLatched=true;
      s.effects.push({ x: 480, y: s.gapY, kind: 'gap', life: .7, total: .7 });
    }
  }
  const grabHands = hands.filter(h => h.gesture === 'GRAB');
  for (const [id, duckId] of s.grabs) if (!grabHands.some(h => h.handId === id)) { s.grabs.delete(id); const d = s.ducks.find(d => d.id === duckId); if (d) d.shield = .35; }
  for (const h of grabHands) if (!s.grabs.has(h.handId)) {
    const nearest = s.ducks.filter(d => d.alive && ![...s.grabs.values()].includes(d.id) && distance(d, h.target) < 110).sort((a, b) => ((a.id===s.threat?.targetId&&s.threat?.type==='hawk')?-1:(b.id===s.threat?.targetId&&s.threat?.type==='hawk')?1:distance(a,h.target)-distance(b,h.target)))[0];
    if (nearest) { s.grabs.set(h.handId, nearest.id);if(s.threat?.type==='hawk'&&nearest.id===s.threat.targetId)s.threat.rescueGrabbed=true; }
  }
  for (let i = 0; i < count; i++) advance(s, duration / count);
}
function advance(s, dt) {
  if (s.status !== 'playing') return;
  s.time += dt; s.attackCooldown = Math.max(0, s.attackCooldown - dt);const director=difficultyAt(s.time);s.worldScroll+=director.scroll*dt;
  if(Math.floor(s.time/5)>s.survivalTick){s.survivalTick=Math.floor(s.time/5);award(s,10,'survival');}
  s.effects = s.effects.filter(e => (e.life -= dt) > 0);
  if (s.time >= s.nextLight) {
    s.lights.push({ x: 250 + random(s) * 510, y: 125 + random(s) * 300, life: 10 }); s.nextLight = s.time + 4;
  }
  s.lights = s.lights.filter(light => {
    light.life -= dt;
    if (s.ducks.some(d => d.alive && distance(d, light) < 27)) {
      award(s,25,'light',light.x,light.y);s.stats.collected++;return false;
    }
    return light.life > 0;
  });
  if (!s.threat && !s.obstacle && s.time >= s.nextThreat) {
    const living = s.ducks.filter(d => d.alive), target = living[Math.floor(random(s) * living.length)];
    const roster=['fox','fox','wolf','shockwave','hawk','raccoon','wolf','hawk','raccoon'];
    startThreat(s,roster[s.encounter%roster.length],target);
  }
  const t = s.threat;
  if (t) {
    const scheduled=s.scheduler.update(s.time*1000); const phase=scheduled?.phase.toLowerCase();
    if(!t.scared&&phase&&phase!=='complete'&&phase!==t.phase){t.phase=phase;t.elapsed=0;}
    t.elapsed += dt;
    if(t.type==='hawk'&&t.elapsed>=t.warning*.4)t.committed=true;
    if(t.type==='raccoon'&&t.phase==='telegraph')t.x=1000+(t.lockX-1000)*Math.min(1,t.elapsed/t.warning);
    if (t.phase === 'execute') {
      const oldX = t.x; t.x = ['hawk','raccoon','shockwave'].includes(t.type)?t.lockX:1000 - 1100 * Math.min(1, t.elapsed / t.charge);
      for (const d of s.ducks) if (d.alive && d.shield <= 0 && ![...s.grabs.values()].includes(d.id) && !t.hit.has(d.id) && inDanger(t,d) && (['hawk','raccoon','shockwave'].includes(t.type)?t.elapsed>=t.charge*.65:d.x >= t.x - 24 && d.x <= oldX + 24) && (t.type!=='raccoon'||!t.hit.size)) {
        t.hit.add(d.id); d.alive = false; s.stats.losses++; s.effects.push({ ...d, kind: 'loss', life: .8, total: .8 });
      }
    }
    if(t.phase==='recover'&&!t.resolved){t.resolved=true;if(!t.hit.size&&!t.scared){s.stats.dodges++;s.combo++;award(s,75+Math.min(4,s.combo)*10,'dodge');if(t.type==='hawk'&&t.rescueGrabbed&&s.ducks.some(d=>d.id===t.targetId&&d.alive&&!inDanger(t,d))){s.stats.rescues++;award(s,150,'rescue',t.lockX,t.y);}}else if(t.hit.size)s.combo=0;}
    if (scheduled?.phase==='COMPLETE') { s.scheduler.clear(t.id);s.threat = null; s.nextThreat = s.time + director.spacing; }
  }
  if(!s.threat&&!s.obstacle&&s.time>=s.nextObstacle){const center=s.ducks.filter(d=>d.alive).reduce((sum,d)=>sum+d.y,0)/Math.max(1,s.ducks.filter(d=>d.alive).length);s.obstacle={type:s.obstacleIndex++%2?'passage':'log',x:1030,y:clamp(center,155,375),width:60,gap:150,hit:new Set()};}
  if(s.obstacle){const o=s.obstacle;o.x-=director.obstacleSpeed*dt;for(const d of s.ducks)if(d.alive&&Math.abs(d.x-o.x)<42&&(o.type==='log'?Math.abs(d.y-o.y)<48:Math.abs(d.y-o.y)>o.gap/2-10)&&![...s.grabs.values()].includes(d.id)){d.x=Math.min(d.x,o.x-43);if(!o.hit.has(d.id)){o.hit.add(d.id);s.score=Math.max(0,s.score-10);s.effects.push({...d,kind:'bump',life:.4,total:.4});}}if(o.x< -60){s.stats.passages++;s.score+=o.hit.size?15:100;s.obstacle=null;s.nextObstacle=s.time+director.obstacleSpacing;s.nextThreat=Math.max(s.nextThreat,s.time+1.6);}}
  const alive = s.ducks.filter(d => d.alive);
  for (const d of alive) {
    d.shield = Math.max(0, d.shield - dt);
    const carrier = [...s.grabs].find(([, id]) => id === d.id), h = carrier && s.hands.find(h => h.handId === carrier[0]);
    if (h) { d.x += (clamp(h.target.x, 35, 925) - d.x) * (1 - Math.exp(-18 * dt)); d.y += (clamp(h.target.y, 85, 470) - d.y) * (1 - Math.exp(-18 * dt)); d.vx = d.vy = 0; continue; }
    let vx = 0, vy = 0, weight = 0;
    for (const h of s.hands) {
      const dx = h.target.x - d.x, dy = h.target.y - d.y, r = Math.hypot(dx, dy) || 1;
      if (h.gesture === 'FOLLOW') { vx += dx * 2.4; vy += dy * 2.4; weight++; }
      if (h.gesture === 'REPEL' && r < 260) { const power = (1 - r / 260) * 390; vx -= dx / r * power; vy -= dy / r * power; }
    }
    if (weight > 1) { vx /= weight; vy /= weight; }
    if (!weight) { const cx = alive.reduce((v, d) => v + d.x, 0) / alive.length, cy = alive.reduce((v, d) => v + d.y, 0) / alive.length; vx += (cx - d.x) * .28; vy += (cy - d.y) * .28; }
    if (s.time < s.gapUntil) { const targetY = s.gapY + (d.id % 2 ? 105 : -105); vy = (targetY - d.y) * 5; }
    for (const other of alive) if (d !== other) { const dx = d.x - other.x, dy = d.y - other.y, r = Math.hypot(dx, dy); if (r > 0 && r < 31) { vx += dx / r * (31 - r) * 6; vy += dy / r * (31 - r) * 6; } }
    const magnitude = Math.hypot(vx, vy), limit = TUNING.speed; if (magnitude > limit) { vx *= limit / magnitude; vy *= limit / magnitude; }
    const alpha = 1 - Math.exp(-TUNING.response * dt); d.vx += (vx - d.vx) * alpha; d.vy += (vy - d.vy) * alpha;
    d.x = clamp(d.x + d.vx * dt, 35, 925); d.y = clamp(d.y + d.vy * dt, 85, 470);
  }
  if (!alive.length) s.status = 'lost';
  else if (s.time >= TUNING.duration) { s.status = 'won'; s.saved = alive.length; s.score += alive.length * 200; }
}
// This player uses the same adapter and steering as the camera. No duck positions are overwritten.
export function virtualHands(s) {
  const t = s.threat;
  if(t?.type==='shockwave'&&t.phase!=='recover')return {hands:[{id:'virtual-left',trackingStatus:'tracked',gesture:'REPEL',position:{x:t.lockX/960,y:t.y/540}}],events:[]};
  if(t?.type==='hawk'&&t.phase!=='recover'){const duck=s.ducks.find(d=>d.id===t.targetId&&d.alive);if(duck){const target=t.rescueGrabbed?{x:790,y:t.y<270?440:110}:duck;return{hands:[{id:'virtual-rescue',trackingStatus:'tracked',gesture:'GRAB',position:{x:target.x/960,y:target.y/540}},{id:'virtual-left',trackingStatus:'tracked',gesture:'FOLLOW',position:{x:.43,y:.5}}],events:[]};}}
  const center = s.ducks.filter(d => d.alive).reduce((p,d,_,a)=>({x:p.x+d.x/a.length,y:p.y+d.y/a.length}),{x:0,y:0});
  const light = [...s.lights].sort((a,b)=>distance(a,center)-distance(b,center))[0];
  const o=s.obstacle;
  const target = t && t.phase !== 'recover' ? { x: 460, y: t.y < 270 ? 415 : 125 } : o?{x:440,y:o.type==='passage'?o.y:o.y<270?420:120}:light ?? {x:460,y:270};
  const hands=[{ id: 'virtual-left', trackingStatus: 'tracked', gesture: 'FOLLOW', position: { x: target.x / 960, y: target.y / 540 } }];
  const events=[];
  if(t?.type==='raccoon'&&!t.scared&&t.elapsed>.5){hands.push({id:'virtual-right',trackingStatus:'tracked',gesture:'NEUTRAL',position:{x:t.x/960,y:t.y/540}});if(s.attackCooldown===0)events.push({type:'ATTACK',source:'virtual-horns-command',handId:'virtual-right',timestamp:s.time*1000});}
  return { hands, events };
}
