import type { ArenaState } from '../shared/minigames.js';
import { hockeyEdge, hockeyFraction, hockeySeat, hockeySides, PADDLE_HALF, PUCK_RADIUS } from '../shared/hockey.js';

/** Swept edge collisions: every player has a unique goal, including with eight. */
export function tickHockey(arena: ArenaState, connected: Set<string>, elapsed: number, dt: number, now: number) {
  const ids=Object.keys(arena.players), count=ids.length, sides=hockeySides(count), puck=arena.objects[0];
  if(!puck)return;
  const speed=Math.min(50,26+elapsed/1600);
  if(!puck.active) {
    if(elapsed<(puck.spawnsAt??0))return;
    const angle=arena.seed*.61803398875+arena.round*2.39996323;
    puck.x=50;puck.y=50;puck.vx=Math.cos(angle)*speed;puck.vy=Math.sin(angle)*speed;puck.active=true;puck.owner=null;
  }
  let remaining=dt;
  for(let bounce=0;bounce<6&&remaining>0;bounce++) {
    let first=remaining+1, side=-1;
    for(let i=0;i<sides;i++) {
      const edge=hockeyEdge(i,sides), velocity=puck.vx*edge.normal.x+puck.vy*edge.normal.y;
      if(velocity<=0)continue;
      const distance=(puck.x-50)*edge.normal.x+(puck.y-50)*edge.normal.y;
      const time=Math.max(0,(edge.boundary-PUCK_RADIUS-distance)/velocity);
      if(time<=remaining&&time<first){first=time;side=i;}
    }
    if(side<0){puck.x+=puck.vx*remaining;puck.y+=puck.vy*remaining;break;}
    puck.x+=puck.vx*first;puck.y+=puck.vy*first;remaining-=first;
    const edge=hockeyEdge(side,sides), index=ids.findIndex((_,i)=>hockeySeat(i,count)===side), id=ids[index];
    const defender=id&&connected.has(id)?arena.players[id]:null;
    const fraction=hockeyFraction(puck,side,sides);
    if(defender&&Math.abs(fraction-defender.x/100)>PADDLE_HALF+PUCK_RADIUS/edge.length) {
      const shooter=puck.owner&&puck.owner!==id?arena.players[puck.owner]:null;
      if(shooter){shooter.score+=3;shooter.progress++;shooter.feedback='perfect';shooter.feedbackUntil=now+950;}
      defender.score=Math.max(0,defender.score-1);defender.feedback='hit';defender.feedbackUntil=now+950;
      puck.active=false;puck.spawnsAt=elapsed+900;puck.x=50;puck.y=50;puck.owner=null;arena.round++;
      break;
    }
    if(defender) {
      const offset=Math.max(-1,Math.min(1,(fraction-defender.x/100)/PADDLE_HALF));
      const dx=-edge.normal.x+edge.tangent.x*offset*.95,dy=-edge.normal.y+edge.tangent.y*offset*.95;
      const velocity=Math.min(52,Math.max(speed,Math.hypot(puck.vx,puck.vy))+1.2),length=Math.hypot(dx,dy);
      puck.vx=dx/length*velocity;puck.vy=dy/length*velocity;puck.owner=id;
      defender.score++;defender.cursor++;defender.feedback='clear';defender.feedbackUntil=now+450;
    } else {
      const dot=puck.vx*edge.normal.x+puck.vy*edge.normal.y;
      puck.vx-=2*dot*edge.normal.x;puck.vy-=2*dot*edge.normal.y;
    }
    puck.x-=edge.normal.x*.015;puck.y-=edge.normal.y*.015;
  }
}

export function hockeyCpu(arena: ArenaState,id:string,elapsed:number) {
  const ids=Object.keys(arena.players),index=ids.indexOf(id),side=hockeySeat(index,ids.length),sides=hockeySides(ids.length),puck=arena.objects[0];
  if(!puck?.active)return 50;
  const edge=hockeyEdge(side,sides),velocity=puck.vx*edge.normal.x+puck.vy*edge.normal.y;
  const distance=(puck.x-50)*edge.normal.x+(puck.y-50)*edge.normal.y;
  const time=velocity>0?Math.max(0,(edge.boundary-PUCK_RADIUS-distance)/velocity):0;
  const fraction=hockeyFraction({x:puck.x+puck.vx*time,y:puck.y+puck.vy*time},side,sides);
  return Math.max(18,Math.min(82,fraction*100+Math.sin(elapsed/550+index*3.1)*26));
}
