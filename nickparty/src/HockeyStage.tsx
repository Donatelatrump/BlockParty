import type { MinigameState, PlayerState } from '../shared/game';
import { hockeyEdge, hockeyPoint, hockeySeat, hockeySides, hockeyView, PADDLE_HALF, PUCK_RADIUS } from '../shared/hockey';

export function HockeyWorld({ mg,players,me }: { mg:MinigameState;players:PlayerState[];me:string|null }) {
  const arena=mg.arena!,count=players.length,sides=hockeySides(count),local=players.findIndex(p=>p.id===me);
  const view=(p:{x:number;y:number})=>hockeyView(p,local,count);
  const vertices=Array.from({length:sides},(_,i)=>view(hockeyEdge(i,sides).a));
  const puck=arena.objects[0],ball=puck?view(puck):{x:50,y:50};
  return <>
    <polygon points={vertices.map(p=>`${p.x},${p.y}`).join(' ')} fill="#d9f0ee" stroke="#728fab" strokeWidth="2" />
    <circle cx="50" cy="50" r="12" fill="none" stroke="#a0c4d0" strokeWidth=".5" /><circle cx="50" cy="50" r="2" fill="#c2dddf" />
    {Array.from({length:sides},(_,side)=>{
      const edge=hockeyEdge(side,sides),a=view(edge.a),b=view(edge.b);
      return <path key={side} d={`M${a.x} ${a.y}L${b.x} ${b.y}`} stroke="#526d87" strokeWidth="1.6" />;
    })}
    {players.map((player,index)=>{
      const side=hockeySeat(index,count),edge=hockeyEdge(side,sides),q=arena.players[player.id];
      const a=view(edge.a),b=view(edge.b),left=view(hockeyPoint(side,sides,q.x/100-PADDLE_HALF)),right=view(hockeyPoint(side,sides,q.x/100+PADDLE_HALF));
      const label=view({x:50+edge.normal.x*(edge.boundary-7),y:50+edge.normal.y*(edge.boundary-7)});
      return <g key={player.id} data-hockey-player={player.id} data-hockey-side={side} opacity={player.connected?1:.35}>
        <path d={`M${a.x} ${a.y}L${b.x} ${b.y}`} stroke={player.color} strokeWidth="2.2" opacity=".5" />
        <path className="hockey-paddle" d={`M${left.x} ${left.y}L${right.x} ${right.y}`} stroke={player.id===me?'#243c53':'#fff'} strokeWidth="3.5" strokeLinecap="round" />
        <path d={`M${left.x} ${left.y}L${right.x} ${right.y}`} stroke={player.color} strokeWidth="2.3" strokeLinecap="round" />
        <rect x={label.x-8} y={label.y-2.5} width="16" height="5" rx="2" fill={player.id===me?'#203d53':'#527183'} />
        <text x={label.x} y={label.y+.9} fontSize="2.6" fill="white" fontWeight="700" textAnchor="middle">{player.id===me?'TÚ':player.name.slice(0,7)} · {q.score}</text>
      </g>;
    })}
    <circle cx={ball.x+.5} cy={ball.y+.7} r={PUCK_RADIUS+1} fill="#17364c44" />
    <circle className="hockey-puck" cx={ball.x} cy={ball.y} r={PUCK_RADIUS} fill={players.find(p=>p.id===puck?.owner)?.color??'#203d66'} stroke="#fff" strokeWidth=".7" />
    {puck&&!puck.active&&<text x="50" y="56" textAnchor="middle" fontSize="3" fill="#294e67" fontWeight="700">Saque</text>}
  </>;
}
