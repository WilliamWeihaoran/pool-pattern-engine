import { Ball as BallType, GhostBall } from './types';
import { PLAY_LEFT, PLAY_RIGHT, PLAY_TOP, PLAY_BOTTOM, SNAP_BALL_DIST, SNAP_RAIL_DIST, BALL_R } from './constants';

export const WHITE_LINE = 'rgba(255,255,255,0.9)';

function clamp(min: number, max: number, val: number) {
  return Math.max(min, Math.min(max, val));
}

export type SnapResult = {
  x: number;
  y: number;
  type: 'none' | 'ball' | 'rail';
  /** CSS color of the snapped object ball (1–15), or null otherwise */
  ballColor: string | null;
  /** id of the ball or ghost that was snapped to */
  ballId?: string;
};

export function getSnapPoint(
  rawX: number,
  rawY: number,
  tableBalls: BallType[],
  ghostBalls: GhostBall[],
  /** When provided and snapping to an OB, returns the contact point instead of center */
  startPoint?: { x: number; y: number },
): SnapResult {
  // 1. Real balls — OB snaps to contact point when startPoint is given
  for (const b of tableBalls) {
    if (Math.hypot(rawX - b.x, rawY - b.y) < SNAP_BALL_DIST) {
      if (b.number > 0 && startPoint) {
        const dx = b.x - startPoint.x;
        const dy = b.y - startPoint.y;
        const len = Math.hypot(dx, dy);
        if (len > 0.5) {
          return {
            x: b.x - (dx / len) * BALL_R * 2,
            y: b.y - (dy / len) * BALL_R * 2,
            type: 'ball',
            ballColor: b.color,
            ballId: b.id,
          };
        }
      }
      return { x: b.x, y: b.y, type: 'ball', ballColor: b.number > 0 ? b.color : null, ballId: b.id };
    }
  }

  // 2. Ghost balls — contact ghosts carry their color
  for (const g of ghostBalls) {
    if (Math.hypot(rawX - g.x, rawY - g.y) < SNAP_BALL_DIST)
      return { x: g.x, y: g.y, type: 'ball', ballColor: g.color ?? null, ballId: g.id };
  }

  // 3. Rail snap — closest play boundary within threshold
  const candidates = [
    { d: rawY - PLAY_TOP,    x: clamp(PLAY_LEFT, PLAY_RIGHT, rawX), y: PLAY_TOP    },
    { d: PLAY_BOTTOM - rawY, x: clamp(PLAY_LEFT, PLAY_RIGHT, rawX), y: PLAY_BOTTOM },
    { d: rawX - PLAY_LEFT,   x: PLAY_LEFT,  y: clamp(PLAY_TOP, PLAY_BOTTOM, rawY)  },
    { d: PLAY_RIGHT - rawX,  x: PLAY_RIGHT, y: clamp(PLAY_TOP, PLAY_BOTTOM, rawY)  },
  ].filter(c => c.d >= 0 && c.d < SNAP_RAIL_DIST).sort((a, b) => a.d - b.d);

  if (candidates.length > 0)
    return { ...candidates[0], type: 'rail', ballColor: null };

  return {
    x: clamp(PLAY_LEFT, PLAY_RIGHT, rawX),
    y: clamp(PLAY_TOP, PLAY_BOTTOM, rawY),
    type: 'none', ballColor: null,
  };
}
