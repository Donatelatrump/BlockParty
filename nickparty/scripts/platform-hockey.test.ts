import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createArena, tickArena, arenaInput } from '../server/minigames.js';
import { tickHockey } from '../server/hockey.js';
import { hockeyEdge, hockeyPoint, hockeySeat, hockeySides, hockeyView, PUCK_RADIUS } from '../shared/hockey.js';
import { platformSupport, platformFallOffset } from '../shared/platforms.js';
import type { MinigameState, PlayerState } from '../shared/game.js';
const ids=Array.from({length:8},(_,i)=>`p${i}`);
const players=ids.map(id=>({id,connected:true})) as PlayerState[];
function platformGame() { return {kind:'falling',startsAt:10000,endsAt:34000,arena:createArena(ids,'falling',10000),collected:{}} as unknown as MinigameState; }
test('Platform Plunge spawns eight supported players and detects both edges between explosion events',()=>{
  for(const x of [4,50,70]) {
    const mg=platformGame();
    assert.ok(Object.values(mg.arena!.players).every(p=>platformSupport(p.x,0)));
    mg.arena!.players.p0.x=x;
    tickArena(mg,players,10100);
    assert.equal(mg.arena!.players.p0.alive,false);
    assert.equal(mg.arena!.players.p0.fallStartedAt,10100);
    assert.equal(arenaInput(mg,'p0',{key:'right'},10200),false);
    assert.equal(platformFallOffset(10100,10100),0);
    assert.ok(platformFallOffset(10100,10400)>platformFallOffset(10100,10200));
    tickArena(mg,players,10400);assert.equal(mg.arena!.players.p0.fallStartedAt,10100);
  }
});
test('Platform Plunge keeps supported feet alive and eliminates when platform moves away',()=>{
  const mg=platformGame();mg.arena!.players.p0.x=25;
  tickArena(mg,players,10100);assert.equal(mg.arena!.players.p0.alive,true);
  tickArena(mg,players,12000);assert.equal(mg.arena!.players.p0.alive,false);
});
test('Hockey gives every seat its own edge with its goal at the bottom of its camera',()=>{
  for(let count=2;count<=8;count++){
    assert.equal(new Set(Array.from({length:count},(_,i)=>hockeySeat(i,count))).size,count);
    for(let i=0;i<count;i++){
      const edge=hockeyEdge(hockeySeat(i,count),hockeySides(count));
      const a=hockeyView(edge.a,i,count),b=hockeyView(edge.b,i,count);
      assert.ok(Math.abs(a.y-b.y)<1e-8);assert.ok(a.y>50);assert.ok(a.x<b.x);
    }
  }
});
test('All eight hockey paddles save and all eight independent goals award the correct scorer',()=>{
  for(let i=0;i<8;i++)for(const save of [true,false]){
    const arena=createArena(ids,'airhockey',10000),edge=hockeyEdge(i,8),point=hockeyPoint(i,8,save?.5:.2),puck=arena.objects[0];
    arena.players[ids[i]].x=save?50:82;arena.players[ids[i]].score=2;
    const shooter=ids[(i+1)%8];
    Object.assign(puck,{active:true,x:point.x-edge.normal.x*(PUCK_RADIUS+1),y:point.y-edge.normal.y*(PUCK_RADIUS+1),vx:edge.normal.x*40,vy:edge.normal.y*40,owner:shooter});
    tickHockey(arena,new Set(ids),2000,.1,12000);
    if(save){assert.equal(puck.owner,ids[i]);assert.equal(arena.players[ids[i]].score,3);assert.ok(puck.vx*edge.normal.x+puck.vy*edge.normal.y<0);}
    else{assert.equal(puck.active,false);assert.equal(arena.players[ids[i]].score,1);assert.equal(arena.players[shooter].score,3);}
  }
});
