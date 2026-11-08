// Original pixel hand illustrations and animated duck-effect previews.
const skin='#ffd69b',shade='#cf936a',edge='#805d50';
export const CONTROL_CARDS=[
 ['FOLLOW','OPEN PALM','One hand','Gather and guide the flock.'],
 ['REPEL','CLOSED FIST','One hand per flock','Scatter ducks to break lightning links.'],
 ['GRAB','PINCH','One hand','Pinch the marked duck; carry it clear.'],
 ['SPLIT','FISTS TOGETHER','Two hands','Bring fists close; open a wolf corridor.'],
 ['ATTACK','DEVIL HORNS','One hand','Hold horns; release to rearm.'],
];
export function renderControl(c,kind,time){
 c.imageSmoothingEnabled=false;c.fillStyle='#183747';c.fillRect(0,0,72,76);
 function r(x,y,w,h,col=skin){c.fillStyle=col;c.fillRect(Math.round(x),Math.round(y),w,h);}
 function hand(x,y,type){r(x,y,15,17,edge);r(x+1,y+1,13,14);r(x+2,y+14,10,5,shade);r(x+3,y+15,8,5);const fingers=[2,5,8,11];
  if(type==='REPEL'){r(x,y,15,5,shade);for(const a of fingers)r(x+a,y-1,2,6);r(x+1,y+7,11,3,shade);r(x+1,y+6,9,2);}
  else if(type==='GRAB'){r(x+1,y-9,3,7);r(x+4,y-11,8,3);r(x+10,y-9,3,6);r(x+6,y-4,6,3);r(x+2,y-2,6,3);r(x+8,y-6,2,4,edge);for(const a of [5,9,12])r(x+a,y-6-a/3,2,9);}
  else{for(let i=0;i<4;i++){const extended=type==='FOLLOW'||i===0||i===3;const height=extended?[10,13,12,8][i]:3;r(x+fingers[i],y-height,2,height+3);}if(type==='FOLLOW'){r(x-3,y+2,4,8);r(x-5,y,3,5);}else{r(x+2,y+6,10,3,shade);r(x+2,y+5,8,2);}}
 }
 if(kind==='SPLIT'){hand(13,18,'REPEL');hand(44,18,'REPEL');r(32,18,7,1,'#b6f1d0');}else hand(29,19,kind);
 function duck(x,y){r(x-4,y,8,5,'#34aee2');r(x,y-3,5,5,'#8ee6ff');r(x+4,y-1,3,1,'#ffd070');r(x+2,y-2,1,1,'#123442');r(x-3,y+4,7,1,'#256c9f');}
 const phase=(Math.sin(time*2)+1)/2;
 for(let i=0;i<3;i++){let x=20+i*15,y=60;if(kind==='FOLLOW')x+=(36-x)*phase*.65;if(kind==='REPEL')x+=(i-1)*phase*10;if(kind==='SPLIT')y+=(i%2?1:-1)*phase*9;if(kind==='GRAB'&&i===1)y-=phase*10;duck(x,y);}
 if(kind==='ATTACK'){c.strokeStyle='#ffe196';c.beginPath();c.rect(36-phase*22,59-phase*10,phase*44,phase*20);c.stroke();}
 if(kind==='FLOCKS'||kind==='RECRUIT'){c.fillStyle='#183747';c.fillRect(0,0,72,76);c.font='bold 6px monospace';if(kind==='RECRUIT'){duck(18,47);duck(30,47);duck(46,39);c.strokeStyle='#ffe39a';c.strokeRect(38,29,18,18);c.fillStyle='#ffe39a';c.fillText('+',56,35);c.fillText('GATHER + GROW',10,65);}else{for(const x of[16,25,47,56]){duck(x,36+(x%2)*8);r(x,31+(x%2)*8,3,1,x<36?'#ffe39a':'#f4b7e8');}c.fillStyle='#ffe39a';c.fillText('A LEFT',6,18);c.fillStyle='#f4b7e8';c.fillText('B RIGHT',41,18);c.fillStyle='#b9e2da';c.fillText('TWO HANDS',20,65);}}
}
