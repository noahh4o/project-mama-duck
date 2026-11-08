import { createJourney, stepJourney, virtualHands, startThreat } from './homeward.mjs';
import { createGameplayInputAdapter } from './hands/input-adapter.mjs';
import { createHandsController } from './hands/hands.mjs';
import { renderJourney } from './homeward-art.mjs';
import { CONTROL_CARDS,renderControl } from './controls-art.mjs';

document.title = 'Mama Duck · Homeward';
document.body.innerHTML = `<main class="journey"><header><a class="brand" href="/">MAMA DUCK <span>HOMEWARD</span></a><div><button id="how">Controls</button><button id="sound">Sound on</button><button id="pause" hidden>Pause</button></div></header>
<section class="pond"><canvas width="960" height="540" tabindex="0" aria-label="Duck sanctuary journey"></canvas><div id="hud" hidden></div><div id="notice" role="status"></div>
<section id="menu" class="splash"><p class="overline">THE BLUE FLOCK ADVENTURE</p><h1>Bring them<br><em>home.</em></h1><p>Eight blue ducklings. Ninety seconds to the sanctuary.<br>Dodge foxes & wolves. Rescue from hawks. Chase off raccoons.</p><div class="choices"><button id="play">Play with mouse</button><button id="camera">Play with webcam</button></div><p id="camera-status" role="status"></p><button id="demo" class="quiet">Watch virtual player</button><div class="guide"><span>✋ Open palm<br><b>Gather & follow</b></span><span>✊ Fist<br><b>Push away</b></span><span>👌 Pinch<br><b>Carry one duck</b></span><span>🤘 Horns<br><b>Scare predators</b></span></div><small>Mouse: move to gather · right hold to repel · Space to carry · click / X to attack · G to split<br>Hold two fists briefly to SPLIT; release to rearm. Esc pauses.</small></section>
<section id="results" class="splash" hidden><p class="overline" id="ending"></p><h1 id="result-title"></h1><p id="result-text"></p><div class="choices"><button id="again">Play again</button><button id="home">Title screen</button></div></section>
<section id="paused" class="splash" hidden><p class="overline">TAKE A BREATH</p><h1>Safe for<br><em>a moment.</em></h1><p>The journey and camera actions are paused.</p><button id="resume">Continue journey</button><button id="pause-controls">How to play</button></section></section>
<section id="controls" class="controls-panel" hidden aria-label="How to play"><h2>HOW TO PLAY</h2><p>Guide eight blue ducklings home. Each hand acts independently.</p><div class="control-cards">${CONTROL_CARDS.map(([kind,pose,hands,description])=>`<article><canvas width="72" height="76" data-control="${kind}" aria-label="Pixel illustration: ${pose}"></canvas><h3>${kind}</h3><b>${pose}</b><small>${hands}</small><p>${description}</p></article>`).join('')}</div><p>Mouse: move to FOLLOW · right hold REPEL · Space GRAB · G SPLIT · X ATTACK<br>Hawk: pinch the marked duck and pull clear. Shockwave: fist near the flock to scatter outward.</p><button id="controls-back">Back to game</button></section><footer><span id="mode">A small adventure about looking after each other.</span><span>90 SECONDS · 8 DUCKLINGS · ONE FAMILY</span></footer></main>`;
const $ = id => document.getElementById(id), canvas = document.querySelector('canvas'), ctx = canvas.getContext('2d');
canvas.width = 320; canvas.height = 180;
function resizePixels(){const scale=Math.max(1,Math.floor(Math.min((window.innerWidth-50)/320,(window.innerHeight-120)/180)));document.documentElement.style.setProperty('--pixel-width',`${scale*320+50}px`);}
window.addEventListener('resize',resizePixels);resizePixels();
const adapter = createGameplayInputAdapter({ width: 960, height: 540, mirror: false });
const controller = createHandsController();
const video = document.createElement('video'); video.muted = true; video.playsInline = true;
let state = createJourney(), mode = 'mouse', screen = 'menu', paused = false, last = null, cameraState = { hands: [] }, pointer = { x: .48, y: .5 }, repel = false, grab = false, pendingAttack = false, pendingGap = false, sound = true, audio, eventSerial = 0, best = 0;
try { best = Number(localStorage.getItem('mama-duck-homeward-best')) || 0; } catch {}
controller.on('stateChange', value => { cameraState = value; });
function tone(frequency = 660, length = .12, type = 'sine') {
  if (!sound) return;
  try { audio ??= new (window.AudioContext || window.webkitAudioContext)(); const o = audio.createOscillator(), g = audio.createGain(); o.type = type; o.frequency.setValueAtTime(frequency, audio.currentTime); o.frequency.exponentialRampToValueAtTime(frequency * .6, audio.currentTime + length); g.gain.setValueAtTime(.06, audio.currentTime); g.gain.exponentialRampToValueAtTime(.001, audio.currentTime + length); o.connect(g).connect(audio.destination); o.start(); o.stop(audio.currentTime + length); } catch {}
}
function begin(nextMode) { mode = nextMode; state = createJourney(42); adapter.reset(); controller.resetTracking(); cameraState = { hands: [] }; screen = 'play'; paused = false; last = null; pendingAttack = pendingGap = false; repel = grab = false; $('menu').hidden = $('results').hidden = $('paused').hidden = true; $('hud').hidden = false; $('pause').hidden = false; $('pause').textContent = 'Pause'; $('mode').textContent = mode === 'camera' ? 'WEBCAM · Show an open palm to gather your flock' : mode === 'virtual' ? 'VIRTUAL PLAYER · Real input adapter and duck simulation' : 'MOUSE · Move to gather · Right hold to repel · Space to carry · Click to scare'; tone(880); canvas.focus(); }
$('play').onclick = () => { controller.stop(); begin('mouse'); };
$('demo').onclick = () => { controller.stop(); begin('virtual'); };
$('camera').onclick = async () => { $('camera').disabled = true; $('camera-status').textContent = 'Opening camera and loading hand tracking…'; try { await controller.init({ video }); await controller.start(); begin('camera'); } catch (e) { $('camera-status').textContent = `Camera unavailable: ${e.message}. Mouse play is ready.`; } finally { $('camera').disabled = false; } };
$('again').onclick = () => begin(mode);
$('home').onclick = () => { controller.stop(); screen = 'menu'; $('results').hidden = true; $('menu').hidden = false; $('pause').hidden = true; $('hud').hidden = true; $('notice').textContent = ''; };
function pause() { if (screen !== 'play') return; paused = !paused; $('paused').hidden = !paused; $('pause').textContent = paused ? 'Continue' : 'Pause'; if (mode === 'camera') { if (paused) controller.pause(); else controller.start().catch(e => { $('notice').textContent = e.message; }); } last = null; }
$('pause').onclick = pause; $('resume').onclick = pause;
let controlsOpen=false,controlsWasPaused=false;
function showControls(){controlsWasPaused=paused;if(screen==='play'&&!paused)pause();controlsOpen=true;for(const id of ['menu','paused','results'])$(id).hidden=true;$('controls').hidden=false;}
function hideControls(){controlsOpen=false;$('controls').hidden=true;if(screen==='play'){if(!controlsWasPaused)pause();else $('paused').hidden=false;}else $(screen==='menu'?'menu':'results').hidden=false;}
$('how').onclick=showControls;$('pause-controls').onclick=showControls;$('controls-back').onclick=hideControls;
$('sound').onclick = () => { sound = !sound; $('sound').textContent = sound ? 'Sound on' : 'Sound off'; if (sound) tone(); };
canvas.onpointermove = e => { const r = canvas.getBoundingClientRect(); pointer = { x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) }; };
canvas.onpointerdown = e => { if (e.button === 2) repel = true; else pendingAttack = true; canvas.focus(); };
window.addEventListener('pointerup', () => { repel = false; }); canvas.oncontextmenu = e => e.preventDefault();
window.addEventListener('keydown', e => { if (e.key === 'Escape'){if(controlsOpen)hideControls();else pause();return;} if (screen !== 'play' || paused) return; if (e.code === 'Space') { e.preventDefault(); grab = true; } if (e.key.toLowerCase() === 'x' && !e.repeat) pendingAttack = true; if(e.key.toLowerCase()==='g'&&!e.repeat)pendingGap=true; });
window.addEventListener('keyup', e => { if (e.code === 'Space') grab = false; });
window.addEventListener('blur', () => { grab = repel = false; if (screen === 'play' && !paused) pause(); });
window.addEventListener('pagehide', () => controller.destroy());
function finish() { screen = 'results'; $('pause').hidden = true; $('results').hidden = false; const won = state.status === 'won'; $('ending').textContent = won ? 'THE SANCTUARY IS YOURS' : 'EVERY JOURNEY TEACHES US'; $('result-title').textContent = won ? 'Welcome home.' : 'Try a new path.'; best = Math.max(best, state.score); try { localStorage.setItem('mama-duck-homeward-best', String(best)); } catch {} $('result-text').textContent = `${state.ducks.filter(d => d.alive).length} ducklings safe · ${state.score} points · ${state.stats.dodges} clean dodges · ${state.stats.rescues} rescues · ${state.stats.collected} fireflies. Best: ${best}.`; tone(won ? 1040 : 220, .5); }
let renderMs=0,renderFrames=0,showcaseStopped=false;
// Local QA fixtures use the production simulation and renderer.
const showcase=new URLSearchParams(location.search).get('encounter');
if(['fox','wolf','hawk','raccoon','shockwave','log','passage'].includes(showcase)){
 begin('virtual');state.nextThreat=Infinity;state.nextObstacle=Infinity;
 if(['log','passage'].includes(showcase))state.obstacle={type:showcase,x:650,y:270,width:60,gap:150,hit:new Set()};
 else startThreat(state,showcase,state.ducks[0]);
}
function draw() { const began=performance.now();renderJourney(ctx,state,screen);renderMs=renderMs*.95+(performance.now()-began)*.05;if(++renderFrames%30===0)canvas.dataset.renderMs=renderMs.toFixed(2); }
function frame(now){
 const dt=last===null?0:Math.min(.05,(now-last)/1000);last=now;
 if(screen==='play'&&!paused){
  let raw;
  if(mode==='camera')raw=cameraState;
  else if(mode==='virtual')raw=virtualHands(state);
  else {
   raw={hands:[{id:'mouse',trackingStatus:'tracked',gesture:grab?'GRAB':repel?'REPEL':'FOLLOW',position:pointer}],events:pendingAttack?[{type:'ATTACK',handId:'mouse',sequenceId:++eventSerial,timestamp:now,source:'mouse'}]:[]};
   if(pendingGap){raw.hands.push({id:'mouse-gap',trackingStatus:'tracked',gesture:'NEUTRAL',position:pointer});raw.events.push({type:'GAP',handIds:['mouse','mouse-gap'],timestamp:now});}
  }
  pendingAttack=pendingGap=false;
  const mapped=adapter.update(raw,raw.events??[]), before={...state.stats}, previousPhase=state.threat?.phase,priorGestures=new Map(state.hands.map(h=>[h.handId,h.gesture])),priorSplit=state.lastGap;
  stepJourney(state,mapped,dt);
  for(const hand of mapped.hands)if(priorGestures.get(hand.handId)!==hand.gesture&&hand.gesture!=='NEUTRAL')tone({FOLLOW:660,REPEL:240,GRAB:990}[hand.gesture]??500,.08);
  if(state.lastGap!==priorSplit)tone(360,.24,'triangle');
  if(state.stats.collected>before.collected)tone(1100);
  if(state.stats.losses>before.losses)tone(180,.25,'triangle');
  if(state.stats.attacks>before.attacks)tone(420,.2,'triangle');
  if(state.stats.dodges>before.dodges)tone(840,.18);
  if(state.stats.rescues>before.rescues)tone(1320,.2);
  if(state.threat?.phase==='telegraph'&&previousPhase!=='telegraph')tone({fox:280,wolf:160,hawk:920,raccoon:480,shockwave:240}[state.threat.type],.3,'triangle');
  if(state.threat?.phase==='execute'&&previousPhase!=='execute')tone(120,.18,'sawtooth');
  $('hud').textContent=`${state.ducks.filter(d=>d.alive).length} / 8 SAFE     ${state.score} PTS  ${state.combo} STREAK     ${Math.ceil(Math.max(0,90-state.time))}s TO HOME`;
  const tips={shockwave:'SHOCKWAVE — fist near the flock to push outward',fox:'FOX — leave the marked lane',wolf:'WOLF — split the flock or leave the wide lane',hawk:'HAWK — rescue the marked duck or move away',raccoon:'RACCOON — horns to scare, or move away'};
  $('notice').textContent=state.threat?.phase==='telegraph'?tips[state.threat.type]:state.obstacle?state.obstacle.type==='passage'?'ROCK PASSAGE — gather through the opening':'FALLEN LOG — guide around it':state.time<7?'Gather fireflies. Move away from danger markings.':mode==='camera'&&!mapped.hands.length?'Show your hand to guide the flock':'';
  if(mode==='camera')$('mode').textContent=`WEBCAM · ${mapped.hands.map(h=>h.gesture).join(' + ')||'Hands out of view'} · ${Math.round(cameraState.metrics?.cameraFps??0)} camera FPS · ${Math.round(cameraState.metrics?.inferenceFps??0)} inference FPS · ${(cameraState.metrics?.inferenceMs??0).toFixed(1)}ms`;
  if(state.status!=='playing')finish();
  if(showcase&&!showcaseStopped&&state.time>=.8){showcaseStopped=true;paused=true;$('pause').textContent='Continue';}
 }
 draw();if(controlsOpen)document.querySelectorAll('[data-control]').forEach(el=>renderControl(el.getContext('2d'),el.dataset.control,now/1000));requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
