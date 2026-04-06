'use client';

import { useState, useRef, useEffect, RefObject } from 'react';
import { ShotLine, GhostBall, Ball as BallType, DrawPreview } from './types';
import { getSnapPoint, WHITE_LINE } from './snapUtils';
import { PLAY_LEFT, PLAY_RIGHT, PLAY_TOP, PLAY_BOTTOM, BALL_R } from './constants';

function clamp(min: number, max: number, val: number) {
  return Math.max(min, Math.min(max, val));
}

type DrawStart = {
  x: number;
  y: number;
  color: string;
  fromBallId?: string;
  fromOBId?: string;
  fromContactGhostId?: string;
};

type GhostDrag = {
  id: string;
  svgOffX: number;
  svgOffY: number;
  orbitBallId?: string;
  linkedLineId?: string;
};

export type DrawLinesSnapshot = {
  ghostBalls: GhostBall[];
  shotLines: ShotLine[];
};

export function useDrawLines(
  svgRef: RefObject<SVGSVGElement | null>,
  tableBalls: BallType[],
  options?: {
    /** Called just before a shot line is committed (useful for pushing undo snapshots) */
    onBeforeLineCommit?: () => void;
  },
) {
  const [ghostBalls, setGhostBalls]   = useState<GhostBall[]>([]);
  const [shotLines, setShotLines]     = useState<ShotLine[]>([]);
  const [drawPreview, setDrawPreview] = useState<DrawPreview>(null);

  const tableBallsRef = useRef<BallType[]>(tableBalls);
  const ghostBallsRef = useRef<GhostBall[]>(ghostBalls);
  const shotLinesRef  = useRef<ShotLine[]>(shotLines);
  const drawStartRef  = useRef<DrawStart | null>(null);
  const ghostDragRef  = useRef<GhostDrag | null>(null);

  useEffect(() => { tableBallsRef.current = tableBalls; }, [tableBalls]);
  useEffect(() => { ghostBallsRef.current = ghostBalls; }, [ghostBalls]);
  useEffect(() => { shotLinesRef.current  = shotLines;  }, [shotLines]);

  const onBeforeLineCommitRef = useRef(options?.onBeforeLineCommit);
  onBeforeLineCommitRef.current = options?.onBeforeLineCommit;

  // ── Draw start ────────────────────────────────────────────────────────────
  function handleSvgMouseDown(svgX: number, svgY: number) {
    const snap = getSnapPoint(svgX, svgY, tableBallsRef.current, ghostBallsRef.current);

    let fromBallId: string | undefined;
    let fromOBId: string | undefined;
    let fromContactGhostId: string | undefined;

    if (snap.type === 'ball' && snap.ballId) {
      const ghost = ghostBallsRef.current.find(g => g.id === snap.ballId);
      if (ghost?.linkedBallId) fromContactGhostId = ghost.id;
      const ball = tableBallsRef.current.find(b => b.id === snap.ballId);
      if (ball) {
        fromBallId = ball.id;
        if (ball.number > 0) fromOBId = ball.id;
      }
    }

    const color = fromContactGhostId ? WHITE_LINE : (snap.ballColor ?? WHITE_LINE);
    drawStartRef.current = { x: snap.x, y: snap.y, color, fromBallId, fromOBId, fromContactGhostId };
    setDrawPreview({ x1: snap.x, y1: snap.y, x2: snap.x, y2: snap.y, color, snapType: snap.type });
  }

  // ── Ghost drag start ──────────────────────────────────────────────────────
  function handleGhostDragStart(id: string, clientX: number, clientY: number) {
    if (!svgRef.current) return;
    const g = ghostBallsRef.current.find(g => g.id === id);
    if (!g) return;
    const rect = svgRef.current.getBoundingClientRect();
    ghostDragRef.current = {
      id,
      svgOffX: clientX - rect.left - g.x,
      svgOffY: clientY - rect.top  - g.y,
      orbitBallId: g.linkedBallId,
      linkedLineId: g.linkedLineId,
    };
  }

  // ── Remove ghost (and its linked shot line) ───────────────────────────────
  function removeGhost(id: string) {
    ghostDragRef.current = null;
    const ghost = ghostBallsRef.current.find(g => g.id === id);
    if (ghost?.linkedLineId) {
      setShotLines(prev => prev.filter(l => l.id !== ghost.linkedLineId));
    }
    setGhostBalls(prev => prev.filter(g => g.id !== id));
  }

  /**
   * Detach a contact ghost from orbiting its OB.
   * After this, dragging the ghost moves it freely and the CB trajectory
   * line that starts from it (startGhostId === id) will also update.
   */
  function detachGhostOrbit(id: string) {
    setGhostBalls(prev => prev.map(g =>
      g.id === id ? { ...g, linkedBallId: undefined } : g
    ));
    // Also clear the drag ref if it was in progress for this ghost
    if (ghostDragRef.current?.id === id) {
      ghostDragRef.current = { ...ghostDragRef.current, orbitBallId: undefined };
    }
  }

  // ── Global mouse handlers ─────────────────────────────────────────────────
  useEffect(() => {
    function onMove(e: MouseEvent) {
      // ── Ghost drag
      if (ghostDragRef.current && svgRef.current) {
        const { id, svgOffX, svgOffY, orbitBallId, linkedLineId } = ghostDragRef.current;
        const rect = svgRef.current.getBoundingClientRect();
        let nx: number;
        let ny: number;

        if (orbitBallId) {
          const ob = tableBallsRef.current.find(b => b.id === orbitBallId);
          if (!ob) return;
          const dx = (e.clientX - rect.left) - ob.x;
          const dy = (e.clientY - rect.top)  - ob.y;
          const len = Math.hypot(dx, dy);
          if (len < 0.5) return;
          nx = ob.x + (dx / len) * BALL_R * 2;
          ny = ob.y + (dy / len) * BALL_R * 2;
        } else {
          nx = clamp(PLAY_LEFT, PLAY_RIGHT,  e.clientX - rect.left - svgOffX);
          ny = clamp(PLAY_TOP,  PLAY_BOTTOM, e.clientY - rect.top  - svgOffY);
        }

        setGhostBalls(prev => prev.map(g => g.id !== id ? g : { ...g, x: nx, y: ny }));
        setShotLines(prev => prev.map(l => {
          let updated = l;
          // Update endpoint of the line this ghost is tied to (e.g. CB→OB line)
          if (linkedLineId && l.id === linkedLineId) updated = { ...updated, x2: nx, y2: ny };
          // Update start-point of any CB trajectory line drawn FROM this ghost
          if (l.startGhostId === id) updated = { ...updated, x1: nx, y1: ny };
          return updated;
        }));
        return;
      }

      // ── Draw preview
      if (drawStartRef.current && svgRef.current) {
        const rect = svgRef.current.getBoundingClientRect();
        const sp   = { x: drawStartRef.current.x, y: drawStartRef.current.y };
        const snap = getSnapPoint(
          e.clientX - rect.left,
          e.clientY - rect.top,
          tableBallsRef.current,
          ghostBallsRef.current,
          sp,
        );
        const color = drawStartRef.current.color;
        setDrawPreview({
          x1: drawStartRef.current.x, y1: drawStartRef.current.y,
          x2: snap.x, y2: snap.y,
          color, snapType: snap.type,
        });
      }
    }

    function onUp(e: MouseEvent) {
      // ── Ghost drag end — snap-back for contact ghosts
      if (ghostDragRef.current) {
        const { id, orbitBallId, linkedLineId } = ghostDragRef.current;
        if (orbitBallId) {
          const ob     = tableBallsRef.current.find(b => b.id === orbitBallId);
          const obLine = shotLinesRef.current.find(l => l.startBallId === orbitBallId);
          if (ob && obLine) {
            const dx  = obLine.x2 - obLine.x1;
            const dy  = obLine.y2 - obLine.y1;
            const len = Math.hypot(dx, dy);
            if (len > 0.5) {
              const naturalX = ob.x - (dx / len) * BALL_R * 2;
              const naturalY = ob.y - (dy / len) * BALL_R * 2;
              const ghost = ghostBallsRef.current.find(g => g.id === id);
              if (ghost && Math.hypot(ghost.x - naturalX, ghost.y - naturalY) < 20) {
                setGhostBalls(prev => prev.map(g =>
                  g.id !== id ? g : { ...g, x: naturalX, y: naturalY },
                ));
                if (linkedLineId) {
                  setShotLines(prev => prev.map(l =>
                    l.id !== linkedLineId ? l : { ...l, x2: naturalX, y2: naturalY },
                  ));
                }
              }
            }
          }
        }
        ghostDragRef.current = null;
      }

      if (!drawStartRef.current || !svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const sp   = { x: drawStartRef.current.x, y: drawStartRef.current.y };
      const snap = getSnapPoint(
        e.clientX - rect.left,
        e.clientY - rect.top,
        tableBallsRef.current,
        ghostBallsRef.current,
        sp,
      );
      const len = Math.hypot(snap.x - drawStartRef.current.x, snap.y - drawStartRef.current.y);

      if (len > 12) {
        const x1                 = drawStartRef.current.x;
        const y1                 = drawStartRef.current.y;
        const color              = drawStartRef.current.color;
        const lineId             = `line-${Date.now()}`;
        const fromBallId         = drawStartRef.current.fromBallId;
        const fromOBId           = drawStartRef.current.fromOBId;
        const fromContactGhostId = drawStartRef.current.fromContactGhostId;

        onBeforeLineCommitRef.current?.();

        setShotLines(prev => {
          // Enforce one shot line per ball (ghost/CB lines with startGhostId are exempt)
          let filtered = prev;
          if (fromBallId && !fromContactGhostId) {
            filtered = prev.filter(l => !(l.startBallId === fromBallId && !l.startGhostId));
          }
          return [
            ...filtered,
            { id: lineId, x1, y1, x2: snap.x, y2: snap.y, color,
              startBallId:  fromBallId,
              startGhostId: fromContactGhostId },
          ];
        });

        // ── OB contact snap → white contact ghost orbiting OB ─────────────
        if (snap.type === 'ball' && snap.ballColor && snap.ballId) {
          setGhostBalls(prev => {
            const existingIdx = prev.findIndex(g => g.linkedBallId === snap.ballId);
            if (existingIdx >= 0) {
              return prev.map((g, i) => i !== existingIdx ? g
                : { ...g, x: snap.x, y: snap.y, color: undefined, linkedLineId: lineId });
            }
            const ghost: GhostBall = {
              id: `ghost-ob-${snap.ballId}`,
              x: snap.x, y: snap.y,
              linkedBallId: snap.ballId!,
              linkedLineId: lineId,
            };
            return [...prev, ghost];
          });
        }

        // ── Rail snap → ghost endpoint tied to this line ───────────────────
        if (snap.type === 'rail') {
          setGhostBalls(prev => {
            if (prev.some(g => Math.hypot(g.x - snap.x, g.y - snap.y) < 8)) return prev;
            const ghost: GhostBall = {
              id: `ghost-${Date.now()}`,
              x: snap.x, y: snap.y,
              color: fromOBId ? color : undefined,
              linkedLineId: lineId,
            };
            return [...prev, ghost];
          });
        }

        // ── Line FROM OB → reposition contact ghost behind OB ─────────────
        if (fromOBId) {
          const dx      = snap.x - x1;
          const dy      = snap.y - y1;
          const lineLen = Math.hypot(dx, dy);
          if (lineLen > 0.5) {
            const gx = clamp(PLAY_LEFT, PLAY_RIGHT,  x1 - (dx / lineLen) * BALL_R * 2);
            const gy = clamp(PLAY_TOP,  PLAY_BOTTOM, y1 - (dy / lineLen) * BALL_R * 2);

            const existingGhost = ghostBallsRef.current.find(g => g.linkedBallId === fromOBId);
            const cbLineId      = existingGhost?.linkedLineId;

            setGhostBalls(prev => {
              const existingIdx = prev.findIndex(g => g.linkedBallId === fromOBId);
              if (existingIdx >= 0) {
                return prev.map((g, i) => i !== existingIdx ? g : { ...g, x: gx, y: gy });
              }
              return [...prev, {
                id: `ghost-ob-${fromOBId}`,
                x: gx, y: gy,
                linkedBallId: fromOBId,
              }];
            });

            if (cbLineId) {
              setShotLines(prev => prev.map(l =>
                l.id !== cbLineId ? l : { ...l, x2: gx, y2: gy },
              ));
            }
          }
        }
      }

      drawStartRef.current = null;
      setDrawPreview(null);
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };
  }, [svgRef]);

  function clearGhostBalls() { setGhostBalls([]); }

  // ── Called by scene when a table ball is dragged ──────────────────────────
  function handleBallMoved(ballId: string, dx: number, dy: number) {
    if (dx === 0 && dy === 0) return;

    const contactGhosts   = ghostBallsRef.current.filter(g => g.linkedBallId === ballId);
    const contactGhostIds = new Set(contactGhosts.map(g => g.id));

    setGhostBalls(prev => prev.map(g => {
      if (g.linkedBallId !== ballId) return g;
      return {
        ...g,
        x: clamp(PLAY_LEFT, PLAY_RIGHT,  g.x + dx),
        y: clamp(PLAY_TOP,  PLAY_BOTTOM, g.y + dy),
      };
    }));

    setShotLines(prev => prev.map(l => {
      let { x1, y1, x2, y2 } = l;
      let changed = false;

      if (l.startBallId === ballId)                                      { x1 += dx; y1 += dy; changed = true; }
      if (contactGhosts.some(g => g.linkedLineId === l.id))             { x2 += dx; y2 += dy; changed = true; }
      if (l.startGhostId && contactGhostIds.has(l.startGhostId))       { x1 += dx; y1 += dy; changed = true; }

      if (!changed) return l;
      return {
        ...l,
        x1: clamp(PLAY_LEFT, PLAY_RIGHT,  x1),
        y1: clamp(PLAY_TOP,  PLAY_BOTTOM, y1),
        x2: clamp(PLAY_LEFT, PLAY_RIGHT,  x2),
        y2: clamp(PLAY_TOP,  PLAY_BOTTOM, y2),
      };
    }));
  }

  // ── Snapshot support for undo/redo ────────────────────────────────────────
  function getSnapshot(): DrawLinesSnapshot {
    return {
      ghostBalls: ghostBallsRef.current,
      shotLines:  shotLinesRef.current,
    };
  }

  function restoreSnapshot(snap: DrawLinesSnapshot) {
    setGhostBalls(snap.ghostBalls);
    setShotLines(snap.shotLines);
  }

  return {
    ghostBalls,
    clearGhostBalls,
    shotLines,
    setShotLines,
    drawPreview,
    handleSvgMouseDown,
    handleGhostDragStart,
    removeGhost,
    detachGhostOrbit,
    handleBallMoved,
    getSnapshot,
    restoreSnapshot,
  };
}
