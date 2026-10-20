export const HOCKEY_CENTER = 50;
export const HOCKEY_RADIUS = 42;
export const PUCK_RADIUS = 1.6;
export const PADDLE_HALF = .18;
export interface Point { x: number; y: number }
export function hockeySides(players: number) { return players <= 2 ? 4 : Math.min(8, players); }
export function hockeySeat(index: number, players: number) { return players <= 2 ? index * 2 : index; }
export function hockeyEdge(side: number, sides: number) {
  const angle = Math.PI / 2 + side * Math.PI * 2 / sides, half = Math.PI / sides;
  const normal = { x: Math.cos(angle), y: Math.sin(angle) };
  const a = { x: 50 + Math.cos(angle + half) * HOCKEY_RADIUS, y: 50 + Math.sin(angle + half) * HOCKEY_RADIUS };
  const b = { x: 50 + Math.cos(angle - half) * HOCKEY_RADIUS, y: 50 + Math.sin(angle - half) * HOCKEY_RADIUS };
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  return { a, b, normal, tangent: { x: (b.x-a.x)/length, y: (b.y-a.y)/length }, length, boundary: HOCKEY_RADIUS * Math.cos(half) };
}
export function hockeyPoint(side: number, sides: number, fraction: number): Point {
  const { a,b } = hockeyEdge(side,sides);
  return { x:a.x+(b.x-a.x)*fraction, y:a.y+(b.y-a.y)*fraction };
}
export function hockeyFraction(point: Point, side: number, sides: number) {
  const edge = hockeyEdge(side,sides);
  return ((point.x-edge.a.x)*edge.tangent.x+(point.y-edge.a.y)*edge.tangent.y)/edge.length;
}
export function hockeyView(point: Point, localIndex: number, players: number): Point {
  const angle = -hockeySeat(Math.max(0,localIndex),players)*Math.PI*2/hockeySides(players);
  const x=point.x-50,y=point.y-50;
  return { x:50+x*Math.cos(angle)-y*Math.sin(angle), y:50+x*Math.sin(angle)+y*Math.cos(angle) };
}
export function hockeyAim(viewX: number, players: number) {
  const halfWidth = HOCKEY_RADIUS*Math.sin(Math.PI/hockeySides(players));
  return Math.max(PADDLE_HALF*100,Math.min((1-PADDLE_HALF)*100,(viewX-(50-halfWidth))/(2*halfWidth)*100));
}
