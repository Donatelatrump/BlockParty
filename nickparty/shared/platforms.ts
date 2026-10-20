/** Shared collision and drawing dimensions, in arena percent. */
export const PLATFORM_HALF_WIDTH = 17;
export function platformCenters(elapsed: number): number[] {
  const time = elapsed / 1000;
  return [25 + 20 * Math.sin(time * .8), 75 + 15 * Math.cos(time)];
}
export function platformSupport(x: number, elapsed: number): boolean {
  return platformCenters(elapsed).some(center => Math.abs(x - center) <= PLATFORM_HALF_WIDTH);
}
export function platformFallOffset(startedAt: number | undefined, now: number): number {
  return startedAt === undefined ? 0 : Math.min(45, 120 * Math.pow(Math.max(0, now-startedAt)/1000, 2));
}
