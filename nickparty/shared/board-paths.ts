import data from './original-board-paths.json' with { type: 'json' };
import type { BoardThemeId } from './game.js';

export interface Point { x: number; y: number }
interface BoardPaths { nodes: Array<Point & { next: number[] }>; edges: Record<string, Point[]> }
export const BOARD_PATHS = data as Record<BoardThemeId, BoardPaths>;

export function pathPoint(theme: BoardThemeId, from: number, to: number, progress: number): Point {
  const board = BOARD_PATHS[theme];
  const points = board.edges[`${from}-${to}`] ?? [board.nodes[from], board.nodes[to]];
  const t = Math.max(0, Math.min(1, progress)) * (points.length - 1);
  const index = Math.min(Math.floor(t), points.length - 2);
  const f = t - index;
  return { x: points[index].x + (points[index + 1].x - points[index].x) * f,
    y: points[index].y + (points[index + 1].y - points[index].y) * f };
}
