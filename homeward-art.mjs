import { attackGeometry, inDanger,chainTargets } from './endless.mjs';
// Original code-native sprites. One source pixel is one canvas pixel.
const sprites={
 duck:['      hhh   ','     hBBBe  ','     hBBByy ','   hBBBBB   ',' hBBBBBBB   ','hBBbwwBBb   ','hBbbwwwBb   ',' hbbbbbb    ','  dddddd    '],
 fox:['  oo       ',' oooo      ','soeeoo     ',' oooooooo  ','  oooooodoo','   dooodddd','   dd  dd  '],
 wolf:['  gg       ',' gggg      ','sgeeggg    ',' ggggggggg ','  gggggddgg','   ddggdd d','   dd  dd  '],
 raccoon:['  gg gg    ','  ggggg    ',' gssessg   ','  ggggg    ',' gggggggsds','  gggggdsds','  dd  dd   '],
 hawk:['dd          dd',' ddd      ddd ','  dddddddddd  ','    dgggd     ','     geey     ','     ddd      ','      d       '],
};
const wrap=(v,n)=>(v%n+n)%n;
const palette={h:'#a5edff',B:'#43c3f1',b:'#2588ce',d:'#22536c',w:'#83daf3',e:'#112938',y:'#ffd27b',o:'#e58b4e',s:'#263e46',g:'#a6b3bf'};
function rect(c,x,y,w,h,color){c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));}
function sprite(c,name,x,y,flip=false,wing=0){const rows=sprites[name];c.save();c.translate(Math.round(x),Math.round(y));if(flip)c.scale(-1,1);rows.forEach((row,j)=>[...row].forEach((v,i)=>{if(palette[v])rect(c,i-6,j-5,1,1,palette[v]);}));if(name==='duck'&&wing)rect(c,-3,-1-wing,4,2,'#b3f0ff');c.restore();}
function label(c,value,x,y,color='#fff0b0',size=4){c.font=`bold ${size}px monospace`;c.fillStyle=color;c.fillText(value,Math.round(x),Math.round(y));}
function ring(c,x,y,r,color){c.strokeStyle=color;c.lineWidth=1;c.beginPath();for(let a=0;a<=16;a++){const angle=a/16*Math.PI*2;const px=Math.round(x+Math.cos(angle)*r),py=Math.round(y+Math.sin(angle)*r);if(!a)c.moveTo(px,py);else c.lineTo(px,py);}c.stroke();}
export function renderJourney(c,s,screen){
 const time=s.time,stage=Math.floor(time/45)%3,drift=s.worldScroll??time*25;
 c.imageSmoothingEnabled=false;rect(c,0,0,320,180,['#28586a','#426779','#292e54'][stage]);
 rect(c,0,0,320,28,['#829f6c','#c0af78','#555d80'][stage]);
 for(let i=0;i<20;i++){let x=(i*23-Math.floor(drift*.16)%23);rect(c,x,10+i%3*4,18,17,['#3c7055','#5c8058','#35445f'][stage]);rect(c,x+3,7+i%3*4,11,4,['#639366','#8a995d','#4c5974'][stage]);}
 rect(c,278,7,12,12,'#f8df9a');rect(c,281,5,6,16,'#f8df9a');
 for(let i=0;i<90;i++){const x=wrap(i*47-Math.floor(drift*(.12+i%3*.04)),330)-5,y=32+i*17%133;rect(c,x,y,3+i%4,1,['#3d7583','#6c8f99','#3c4870'][stage]);}
 for(let i=0;i<28;i++){const x=wrap(i*19-Math.floor(drift*.24),340)-10;rect(c,x,171,11,9,'#244c46');rect(c,x+2,169-i%3,2,11,'#709a70');rect(c,x+3,166-i%3,1,3,'#d6bb7a');if(i%3===0)rect(c,x+8,173,2,2,'#dda6a0');}
 if(s.time<s.gapUntil){rect(c,0,s.gapY/3-17,320,34,'#376e72');label(c,'GAP OPEN',144,s.gapY/3,'#c0f5df');}
 const o=s.obstacle;
 if(o){const x=o.x/3,y=o.y/3;if(o.type==='log'){rect(c,x-8,y-16,16,32,'#594b43');rect(c,x-5,y-15,3,30,'#9f7551');rect(c,x+3,y-15,2,30,'#bd9664');rect(c,x-9,y-15,2,30,'#d1ab73');}else{for(const [a,b]of[[27,y-o.gap/6],[y+o.gap/6,159]]){rect(c,x-9,a,18,b-a,'#6f8680');rect(c,x-9,a,18,3,'#b0bc91');for(let j=a+8;j<b;j+=10)rect(c,x-7,j,13,1,'#415e60');}label(c,'GATHER →',x-30,y,'#ffe4a5');}}
 const t=s.threat;
 if(t&&t.phase!=='recover'){
   const g=attackGeometry(t),progress=Math.min(1,t.elapsed/t.warning),warn=t.phase==='telegraph';
   if(g.kind==='cross'){for(const sign of[-1,1]){c.fillStyle='#c7776880';c.beginPath();c.moveTo(0,(g.y+sign*(0-g.x)*g.slope-g.width/2)/3);c.lineTo(320,(g.y+sign*(960-g.x)*g.slope-g.width/2)/3);c.lineTo(320,(g.y+sign*(960-g.x)*g.slope+g.width/2)/3);c.lineTo(0,(g.y+sign*(0-g.x)*g.slope+g.width/2)/3);c.fill();for(let x=8;x<320;x+=15)label(c,'<<',x,(g.y+sign*(x*3-g.x)*g.slope)/3,'#ffe0a0');}label(c,'PACK BREAKER',g.x/3-17,g.y/3-15);}
   else if(g.kind==='chain'){const ducks=s.ducks.filter(d=>d.alive),marked=ducks.find(d=>d.id===t.targetId),linked=chainTargets(s,t);for(const d of ducks){if(d.id===t.targetId)ring(c,d.x/3,d.y/3,g.radius/3,linked.length?'#f4a9b4':'#a4edce');for(const other of ducks)if(other.id>d.id&&Math.hypot(d.x-other.x,d.y-other.y)<g.radius){c.strokeStyle='#f8c480';c.beginPath();c.moveTo(Math.round(d.x/3),Math.round(d.y/3));c.lineTo(Math.round(other.x/3),Math.round(other.y/3));c.stroke();}}if(marked){rect(c,marked.x/3-9,marked.y/3-30,19,7,'#9398b3');rect(c,marked.x/3-5,marked.y/3-33,12,4,'#c4c9da');label(c,'SPREAD OUT',marked.x/3-15,marked.y/3-37,'#ffe2ae');}if(t.chain&&t.phase==='execute')for(const p of t.chain){rect(c,p.x/3,p.y/3-24,2,27,'#fff3a4');label(c,'ZAP',p.x/3-4,p.y/3-26);}}
   else if(g.kind==='lane'){const top=(g.y-g.width/2)/3,h=g.width/3;c.globalAlpha=warn?.25+progress*.25:.55;rect(c,0,top,320,h,'#ef7864');c.globalAlpha=1;for(let x=0;x<320;x+=8){rect(c,x,top,4,1,'#ffd28a');rect(c,x,top+h,4,1,'#ffd28a');}for(let x=18;x<300;x+=32)label(c,'<<',x,g.y/3+2,'#ffdcb3',6);}
   else if(t.type!=='hawk'||t.committed){ring(c,g.x/3,g.y/3,g.radius/3,'#ffc792');ring(c,g.x/3,g.y/3,g.radius/3+2,'#e47676');rect(c,g.x/3-5,g.y/3,10,1,'#fff0aa');rect(c,g.x/3,g.y/3-5,1,10,'#fff0aa');if(t.type==='shockwave'){ring(c,g.x/3,g.y/3,g.radius/3*(warn?progress:1),'#a5e8ee');label(c,'PUSH OUTWARD',g.x/3-15,g.y/3-8);}}
   if(warn){rect(c,214,7,100,10,'#263647');label(c,`${t.type.toUpperCase()} · ${(t.warning-t.elapsed).toFixed(1)}s`,219,14);rect(c,214,17,100*progress,1,'#ffc67e');}
   const x=t.type==='hawk'?t.phase==='execute'?t.lockX/3: t.lockX/3+Math.sin(time*3)*12:t.x/3;
   const y=t.type==='hawk'?t.phase==='execute'?t.y/3: t.y/3-35:t.y/3;
   if(!['shockwave','lightning'].includes(t.type)){if(t.type==='wolf')for(const sign of[-1,1])sprite(c,'wolf',Math.min(307,x),(t.y+sign*(t.x-t.lockX)*.45)/3,false);else sprite(c,t.type,Math.min(307,x),y+(warn?Math.round(Math.sin(time*12)):0),false,0);}
   if(t.type==='hawk'&&warn){const duck=s.ducks.find(d=>d.id===t.targetId&&d.alive);if(duck){const dx=duck.x/3,dy=duck.y/3,r=8+Math.round(Math.sin(time*8));c.strokeStyle='#ffb4e8';c.lineWidth=1;c.strokeRect(Math.round(dx-r),Math.round(dy-r),r*2,r*2);for(let q=0;q<10;q++){rect(c,x+(dx-x)*q/10,y+(dy-y)*q/10,1,1,'#d9b5ec');}label(c,'PINCH THIS DUCK',dx-19,dy-12,'#ffd0eb');}if(t.committed)label(c,'IMPACT LOCKED',g.x/3-15,g.y/3+g.radius/3+5,'#ffce99');}
 }
 for(const l of s.lights){const x=l.x/3,y=l.y/3;rect(c,x-2,y,5,1,'#d7c87f');rect(c,x,y-2,1,5,'#d7c87f');rect(c,x,y,1,1,'#fff2bb');}
 for(const d of s.ducks.filter(d=>d.alive)){const x=d.x/3,y=d.y/3,bob=Math.round(Math.sin(time*7+d.id));rect(c,x-5,y+4,11,2,'#24455f');sprite(c,'duck',x,y+bob,d.vx< -10,Math.hypot(d.vx,d.vy)>35?Math.floor(time*7+d.id)%2:0);if(s.twoFlocks)rect(c,x+1,y-10+bob,4,2,d.flock==='A'?'#ffe39a':'#f4b7e8');const held=[...s.grabs.values()].includes(d.id);if(held)ring(c,x,y,8,'#d9b5ec');if(t&&t.phase==='telegraph'&&inVisualDanger(t,d)){label(c,'!',x+5,y-8,'#ffe6ab',7);}if(d.shield>0)ring(c,x,y,7,'#a4e6d1');}
 for(const h of s.hands){const x=h.target.x/3,y=h.target.y/3,col=h.gesture==='REPEL'?'#f19b8a':h.gesture==='GRAB'?'#d4aee8':'#afe2ce';ring(c,x,y,h.gesture==='REPEL'?18:10,col);label(c,`${h.flock??''} ${h.gesture}`,x+12,y,col);}
 for(const e of s.effects){c.globalAlpha=e.life/e.total;const x=e.x/3,y=e.y/3;ring(c,x,y,3+(1-e.life/e.total)*18,e.kind==='loss'?'#ef8c87':'#ffe9a0');if(e.kind==='attack')label(c,'QUACK!',x-10,y-10);if(e.kind==='rescue')label(c,`RESCUED +${e.points??150}`,x-14,y-10);if(e.kind==='dodge')label(c,`CLEAN DODGE ×${s.combo}`,125,47);if(e.kind==='light')label(c,`+${e.points??25}`,x,y-6);c.globalAlpha=1;}
 if(s.recruit){sprite(c,'duck',s.recruit.x/3,s.recruit.y/3,false,Math.floor(time*5)%2);ring(c,s.recruit.x/3,s.recruit.y/3,10+Math.round(Math.sin(time*5)),'#ffe39a');label(c,'+ RECRUIT',s.recruit.x/3-13,s.recruit.y/3-13);}
 if(s.twoFlocks)for(const group of['A','B']){const ducks=s.ducks.filter(d=>d.alive&&d.flock===group);if(ducks.length){const x=ducks.reduce((v,d)=>v+d.x,0)/ducks.length/3,y=ducks.reduce((v,d)=>v+d.y,0)/ducks.length/3;label(c,`${group} ${s.owners[group].missingSince!=null?'SAFE HOLD':group==='A'?'LEFT':'RIGHT'}`,x-9,y-13,group==='A'?'#ffe39a':'#f4b7e8');}}
 rect(c,8,176,304,1,'#47666a');label(c,`${Math.floor(s.worldScroll??0)}m  ·  ENDLESS`,8,172,'#b6d8d3');
 if(screen==='menu')label(c,'BLUE FLOCK EDITION',126,165,'#88c7e8');
}
const inVisualDanger = inDanger;
