import {createJourney,stepJourney,virtualHands} from '../endless.mjs';
import {createGameplayInputAdapter} from '../hands/input-adapter.mjs';
// Bounded experiments of an endless game. Surviving runs are explicitly censored.
for(const seed of[1,42,817])for(const strategy of['follow','mixed','two-hand']){const s=createJourney(seed,{tutorial:false}),adapter=createGameplayInputAdapter({width:960,height:540}),limit=300;for(let i=0;i<60*limit&&s.status==='playing';i++){const raw=virtualHands(s,{strategy});stepJourney(s,adapter.update(raw,raw.events),1/60);}console.log(JSON.stringify({seed,strategy,status:s.status,censored:s.status==='playing',seconds:Math.round(s.time*10)/10,score:s.score,alive:s.ducks.filter(d=>d.alive).length,maxFlock:s.maxFlock,...s.stats}));}
