'use client';

import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import PoolTable from './PoolTable';
import Ball from './Ball';
import { Ball as BallType, GhostBall, ShotLine } from '@/src/lib/types';
import { ALL_BALL_DEFS } from '@/src/lib/ballData';
import {
  BALL_R, RAIL, TABLE_WIDTH, TABLE_HEIGHT,
  PLAY_LEFT, PLAY_RIGHT, PLAY_TOP, PLAY_BOTTOM, MIN_BALL_DIST,
} from '@/src/lib/constants';
import { useDrawLines, DrawLinesSnapshot } from '@/src/lib/useDrawLines';
import {
  Route, Stage, Layout, Collection,
  getCollections, getLayout,
  createLayout, updateLayout,
  createCollection, addLayoutToCollection,
} from '@/src/lib/collectionsStore';

// ── BIH domain types ──────────────────────────────────────────────────────────

type PocketId = 'TL' | 'TC' | 'TR' | 'BL' | 'BC' | 'BR';
type Pt = { x: number; y: number };
type EllipseWin = { cx: number; cy: number; rx: number; ry: number; angle?: number };
/** Hit point on cue ball (normalized -1..1 from center) + power 0/10/20.../100 */
type CueStrike = {
  hitX: number;   // horizontal offset: -1 = full left, 0 = center, +1 = full right
  hitY: number;   // vertical offset: -1 = full top (follow), 0 = center, +1 = full bottom (draw)
  power: number;  // 0–100 in steps of 10
};
type Evaluation = {
  rank: 'best' | 'acceptable' | 'bad';
  difficulty: number;  // 1–5
  margin: 'large' | 'medium' | 'small';
  risks: string[];
};
type BihMode = 'none' | 'draw-window';

// ── Table geometry ────────────────────────────────────────────────────────────

const TW = TABLE_WIDTH;
const TH = TABLE_HEIGHT;
const L  = RAIL;
const R  = TW - RAIL;
const T  = RAIL;
const B  = TH - RAIL;
const MX = TW / 2;

const POCKETS: Record<PocketId, Pt> = {
  TL: { x: L,  y: T }, TC: { x: MX, y: T }, TR: { x: R,  y: T },
  BL: { x: L,  y: B }, BC: { x: MX, y: B }, BR: { x: R,  y: B },
};
/** How close a shot line endpoint must be to a pocket to count as targeting it */
const POCKET_DETECT_R = 80;

const RISK_OPTIONS = [
  'wrong_side', 'overhit', 'underhit', 'scratch', 'spin_sensitive', 'speed_sensitive',
];

const CUE_DEF   = ALL_BALL_DEFS.find(d => d.id === 'cue')!;
const TRAY_R    = BALL_R + 2;
const TRAY_SIZE = TRAY_R * 2 + 8;
const G_R       = BALL_R;
const G_SVG     = G_R * 2 + 4;

// ── Internal types ────────────────────────────────────────────────────────────

type TableDrag       = { ballId: string; svgOffsetX: number; svgOffsetY: number };
type TrayGhost       = { ballId: string; x: number; y: number };
type PendingInteract = { id: string; startX: number; startY: number; activated: boolean };
type Snapshot        = { tableBalls: BallType[] } & DrawLinesSnapshot;

// ── Helpers ───────────────────────────────────────────────────────────────────

function clamp(min: number, max: number, val: number) {
  return Math.max(min, Math.min(max, val));
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function randomPos(existing: Pt[]): Pt {
  for (let i = 0; i < 400; i++) {
    const x = PLAY_LEFT  + Math.random() * (PLAY_RIGHT  - PLAY_LEFT);
    const y = PLAY_TOP   + Math.random() * (PLAY_BOTTOM - PLAY_TOP);
    if (existing.every(b => Math.hypot(x - b.x, y - b.y) >= MIN_BALL_DIST))
      return { x, y };
  }
  return { x: (PLAY_LEFT + PLAY_RIGHT) / 2, y: (PLAY_TOP + PLAY_BOTTOM) / 2 };
}

function generateLayout(m: number, n: number): BallType[] {
  const placed: BallType[] = [];
  const place = (def: typeof ALL_BALL_DEFS[0]) => {
    placed.push({ ...def, radius: BALL_R, ...randomPos(placed) });
  };
  place(ALL_BALL_DEFS.find(d => d.id === '8')!);
  const solids  = shuffle(ALL_BALL_DEFS.filter(d => d.number >= 1 && d.number <= 7));
  const stripes = shuffle(ALL_BALL_DEFS.filter(d => d.number >= 9 && d.number <= 15));
  for (let i = 0; i < m; i++) place(solids[i]);
  for (let i = 0; i < n; i++) place(stripes[i]);
  return placed;
}

/** Returns the pocket id that the last shot line from ballId ends near, or null */
function detectPocket(lines: ShotLine[], ballId: string): PocketId | null {
  // Find the most-recently drawn line that starts from this ball
  const line = [...lines].reverse().find(l => l.startBallId === ballId);
  if (!line) return null;
  let closest: PocketId | null = null;
  let minD = Infinity;
  for (const [id, pt] of Object.entries(POCKETS) as [PocketId, Pt][]) {
    const d = Math.hypot(line.x2 - pt.x, line.y2 - pt.y);
    if (d < POCKET_DETECT_R && d < minD) { minD = d; closest = id; }
  }
  return closest;
}


const ROUTE_COLORS = ['#58a6ff', '#3fb950', '#e3b341', '#f85149', '#bc8cff', '#79c0ff'];

function makeRoute(name: string): Route {
  return { id: Math.random().toString(36).slice(2), name, stages: [] };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CombinedScene() {

  // ── Core state ──────────────────────────────────────────────────────────────
  const [m, setM]               = useState(1);
  const [n, setN]               = useState(1);
  const [tableBalls, setTableBalls] = useState<BallType[]>([]);
  const [trayGhost, setTrayGhost]   = useState<TrayGhost | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // ── Undo / redo ─────────────────────────────────────────────────────────────
  const undoStackRef = useRef<Snapshot[]>([]);
  const redoStackRef = useRef<Snapshot[]>([]);

  // ── CB counter (numbered position balls placed on ghost double-click) ───────
  const cbCounterRef = useRef(0);

  // ── Drag / interaction refs ──────────────────────────────────────────────────
  const dragRef          = useRef<TableDrag | null>(null);
  const trayDragRef      = useRef<string | null>(null);
  const pendingBallRef   = useRef<PendingInteract | null>(null);
  const pendingGhostRef  = useRef<PendingInteract | null>(null);

  // ── Sync refs ────────────────────────────────────────────────────────────────
  const tableBallsRef = useRef<BallType[]>([]);
  const selectedIdRef = useRef<string | null>(null);
  const ghostBallsRef = useRef<GhostBall[]>([]);
  const shotLinesRef  = useRef<ShotLine[]>([]);

  useEffect(() => { tableBallsRef.current = tableBalls; }, [tableBalls]);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);

  // ── useDrawLines ─────────────────────────────────────────────────────────────
  const {
    ghostBalls, clearGhostBalls,
    shotLines, setShotLines, drawPreview,
    handleSvgMouseDown, handleGhostDragStart, removeGhost, detachGhostOrbit,
    handleBallMoved, getSnapshot, restoreSnapshot,
  } = useDrawLines(svgRef, tableBalls, {
    onBeforeLineCommit: () => { pushUndoRef.current(); setActiveStageIdx(null); },
  });

  useEffect(() => { ghostBallsRef.current = ghostBalls; }, [ghostBalls]);
  useEffect(() => { shotLinesRef.current  = shotLines;  }, [shotLines]);

  // ── Stable function refs ──────────────────────────────────────────────────────
  const handleSvgMouseDownRef   = useRef(handleSvgMouseDown);
  const handleGhostDragStartRef = useRef(handleGhostDragStart);
  const handleBallMovedRef      = useRef(handleBallMoved);
  handleSvgMouseDownRef.current   = handleSvgMouseDown;
  handleGhostDragStartRef.current = handleGhostDragStart;
  handleBallMovedRef.current      = handleBallMoved;

  // ── Undo / redo logic ────────────────────────────────────────────────────────
  function captureSnapshot(): Snapshot {
    return { tableBalls: tableBallsRef.current, ...getSnapshot() };
  }

  function pushUndo() {
    undoStackRef.current = [...undoStackRef.current, captureSnapshot()];
    redoStackRef.current = [];
  }
  const pushUndoRef = useRef(pushUndo);
  pushUndoRef.current = pushUndo;

  function handleUndo() {
    if (!undoStackRef.current.length) return;
    const prev = undoStackRef.current[undoStackRef.current.length - 1];
    redoStackRef.current = [...redoStackRef.current, captureSnapshot()];
    undoStackRef.current = undoStackRef.current.slice(0, -1);
    setTableBalls(prev.tableBalls);
    restoreSnapshot(prev);
  }

  function handleRedo() {
    if (!redoStackRef.current.length) return;
    const next = redoStackRef.current[redoStackRef.current.length - 1];
    undoStackRef.current = [...undoStackRef.current, captureSnapshot()];
    redoStackRef.current = redoStackRef.current.slice(0, -1);
    setTableBalls(next.tableBalls);
    restoreSnapshot(next);
  }

  const handleUndoRef = useRef(handleUndo);
  const handleRedoRef = useRef(handleRedo);
  handleUndoRef.current = handleUndo;
  handleRedoRef.current = handleRedo;

  // ── Delete selected object ────────────────────────────────────────────────────
  function handleDelete() {
    const id = selectedIdRef.current;
    if (!id) return;
    pushUndo();
    if (tableBallsRef.current.some(b => b.id === id)) {
      setTableBalls(prev => prev.filter(b => b.id !== id));
    } else if (ghostBallsRef.current.some(g => g.id === id)) {
      removeGhost(id);
    } else if (shotLinesRef.current.some(l => l.id === id)) {
      setShotLines(prev => prev.filter(l => l.id !== id));
    }
    setSelectedId(null);
  }
  const handleDeleteRef = useRef(handleDelete);
  handleDeleteRef.current = handleDelete;

  // ── Keyboard shortcuts ────────────────────────────────────────────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault(); handleRedoRef.current();
      } else if (mod && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault(); handleUndoRef.current();
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        handleDeleteRef.current();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // ── Stage-0 factory ───────────────────────────────────────────────────────────
  function makeStage0(balls: BallType[]): Stage {
    return {
      id: Math.random().toString(36).slice(2),
      tableBalls: balls,
      ghostBalls: [],
      shotLines:  [],
      cue:        { hitX: 0, hitY: 0, power: 50 },
      win:        null,
      evaluation: { rank: 'acceptable', difficulty: 3, margin: 'medium', risks: [] },
    };
  }

  // ── Generate layout ───────────────────────────────────────────────────────────
  useEffect(() => {
    const balls = generateLayout(1, 1);
    const s0    = makeStage0(balls);
    setTableBalls(balls);
    setRoutes([{ ...makeRoute('Route 1'), stages: [s0] }]);
    setActiveStageIdx(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleGenerate() {
    pushUndo();
    const balls = generateLayout(m, n);
    const s0    = makeStage0(balls);
    setTableBalls(balls);
    clearGhostBalls();
    setShotLines([]);
    setWin(null);
    setSelectedId(null);
    setRoutes([{ ...makeRoute('Route 1'), stages: [s0] }]);
    setActiveRouteIdx(0);
    setActiveStageIdx(null);
  }

  // ── BIH state ─────────────────────────────────────────────────────────────────
  const [win,              setWin]              = useState<EllipseWin | null>(null);
  const [winDragType,      setWinDragType]      = useState<'move' | 'rx' | 'ry' | 'angle' | null>(null);
  const winDragRef   = useRef<{ mx: number; my: number; snap: EllipseWin } | null>(null);
  const winCreateRef = useRef<{ sx: number; sy: number } | null>(null);
  const [cue, setCue]             = useState<CueStrike>({ hitX: 0, hitY: 0, power: 50 });
  const [evaluation, setEvaluation] = useState<Evaluation>({ rank: 'acceptable', difficulty: 3, margin: 'medium', risks: [] });
  const [bihMode, setBihMode]     = useState<BihMode>('none');

  // ── Route state ───────────────────────────────────────────────────────────────
  const [routes, setRoutes]           = useState<Route[]>([{ id: Math.random().toString(36).slice(2), name: 'Route 1', stages: [] }]);
  const [activeRouteIdx, setActiveRouteIdx] = useState(0);
  const [activeStageIdx, setActiveStageIdx] = useState<number | null>(null);
  const [currentLayoutId, setCurrentLayoutId] = useState<string | null>(null);

  // Refs for route state accessed in effects
  const routesRef         = useRef(routes);
  const activeRouteIdxRef = useRef(activeRouteIdx);
  useEffect(() => { routesRef.current         = routes;         }, [routes]);
  useEffect(() => { activeRouteIdxRef.current = activeRouteIdx; }, [activeRouteIdx]);

  // ── Save-to-collection modal state ────────────────────────────────────────────
  const [showSaveModal, setShowSaveModal] = useState(false);

  // Refs so the global effect doesn't need to re-register on BIH state changes
  const winRef         = useRef(win);
  const winDragTypeRef = useRef(winDragType);
  const bihModeRef     = useRef(bihMode);

  useEffect(() => { winRef.current         = win;         }, [win]);
  useEffect(() => { winDragTypeRef.current = winDragType; }, [winDragType]);
  useEffect(() => { bihModeRef.current     = bihMode;     }, [bihMode]);

  // Refs for BIH values used in captureStage (called from button handlers, but safer with refs)
  const cueRef        = useRef(cue);
  const evaluationRef = useRef(evaluation);
  useEffect(() => { cueRef.current        = cue;        }, [cue]);
  useEffect(() => { evaluationRef.current = evaluation; }, [evaluation]);

  // ── Ball interaction ──────────────────────────────────────────────────────────
  function handleBallPointerDown(id: string, clientX: number, clientY: number) {
    pendingBallRef.current = { id, startX: clientX, startY: clientY, activated: false };
  }

  function handleGhostPointerDown(id: string, clientX: number, clientY: number) {
    pendingGhostRef.current = { id, startX: clientX, startY: clientY, activated: false };
  }

  // ── SVG event handlers ────────────────────────────────────────────────────────
  function handleSvgMouseDownScene(svgX: number, svgY: number) {
    if (bihMode === 'draw-window') {
      winCreateRef.current = { sx: svgX, sy: svgY };
    } else if (bihMode === 'none') {
      handleSvgMouseDown(svgX, svgY);
    }
  }

  function handleSvgClickScene(_svgX: number, _svgY: number) {
    setSelectedId(null);
  }

  function startWinDrag(type: 'move' | 'rx' | 'ry' | 'angle', e: React.MouseEvent) {
    if (!win) return;
    e.stopPropagation(); e.preventDefault();
    setWinDragType(type);
    winDragRef.current = { mx: e.clientX, my: e.clientY, snap: { ...win } };
  }

  // ── Ghost double-click ────────────────────────────────────────────────────────
  function handleGhostDoubleClick(id: string) {
    const ghost = ghostBallsRef.current.find(g => g.id === id);
    if (!ghost) return;

    // Contact ghost (linkedBallId set) = where CB meets OB.
    // Double-click: detach from OB orbit so it can be moved freely.
    // The CB trajectory line (startGhostId === id) will follow along.
    if (ghost.linkedBallId) {
      detachGhostOrbit(id);
      setSelectedId(id);
      return;
    }

    // CB endpoint ghost: a ghost whose linked shot line was drawn from a
    // contact ghost (startGhostId set). Double-click creates a numbered CB ball + stage.
    const linkedLine = ghost.linkedLineId
      ? shotLinesRef.current.find(l => l.id === ghost.linkedLineId)
      : null;
    if (!linkedLine?.startGhostId) return;

    pushUndo();
    const num = ++cbCounterRef.current;
    const newBall: BallType = {
      id:      `cb-pos-${num}`,
      number:  num,
      color:   '#f5f5f5',
      striped: false,
      x:       ghost.x,
      y:       ghost.y,
      radius:  BALL_R,
    };

    // Capture stage: current scene + new CB marker, minus this endpoint ghost
    const stage: Stage = {
      id:         Math.random().toString(36).slice(2),
      tableBalls: [...tableBallsRef.current, newBall],
      ghostBalls: ghostBallsRef.current.filter(g => g.id !== id),
      shotLines:  shotLinesRef.current,
      cue:        cueRef.current,
      win:        winRef.current,
      evaluation: evaluationRef.current,
    };

    setTableBalls(prev => [...prev, newBall]);
    removeGhost(id);   // also removes the linked CB trajectory shot line
    setSelectedId(null);

    // Save as new stage in active route — stay in live editing mode
    const routeIdx = activeRouteIdxRef.current;
    setRoutes(prev => prev.map((r, i) =>
      i === routeIdx ? { ...r, stages: [...r.stages, stage] } : r
    ));
  }

  // ── Shot line selection ───────────────────────────────────────────────────────
  function handleShotLineClick(id: string) {
    setSelectedId(prev => prev === id ? null : id);
  }

  // ── Cue ball tray ─────────────────────────────────────────────────────────────
  const cueBallOnTable = tableBalls.some(b => b.id === 'cue');

  function handleCueTrayDragStart(clientX: number, clientY: number) {
    if (cueBallOnTable) return;
    trayDragRef.current = 'cue';
    setTrayGhost({ ballId: 'cue', x: clientX, y: clientY });
  }

  // ── Global mouse event loop ────────────────────────────────────────────────────
  useEffect(() => {
    function onMove(e: MouseEvent) {

      // ── Activate pending ball interaction ────────────────────────────────
      if (pendingBallRef.current && !pendingBallRef.current.activated && svgRef.current) {
        const { id, startX, startY } = pendingBallRef.current;
        if (Math.hypot(e.clientX - startX, e.clientY - startY) > 4) {
          pendingBallRef.current.activated = true;
          const ball = tableBallsRef.current.find(b => b.id === id);
          if (ball) {
            if (selectedIdRef.current === id) {
              // Selected → move ball
              pushUndoRef.current();
              const rect = svgRef.current.getBoundingClientRect();
              dragRef.current = {
                ballId: id,
                svgOffsetX: startX - rect.left - ball.x,
                svgOffsetY: startY - rect.top  - ball.y,
              };
            } else {
              // Unselected → draw from ball
              handleSvgMouseDownRef.current(ball.x, ball.y);
            }
          }
        }
      }

      // ── Activate pending ghost interaction ───────────────────────────────
      if (pendingGhostRef.current && !pendingGhostRef.current.activated && svgRef.current) {
        const { id, startX, startY } = pendingGhostRef.current;
        if (Math.hypot(e.clientX - startX, e.clientY - startY) > 4) {
          pendingGhostRef.current.activated = true;
          const ghost = ghostBallsRef.current.find(g => g.id === id);
          if (ghost) {
            if (selectedIdRef.current === id) {
              // Selected → drag ghost
              pushUndoRef.current();
              handleGhostDragStartRef.current(id, startX, startY);
            } else {
              // Unselected → draw from ghost
              handleSvgMouseDownRef.current(ghost.x, ghost.y);
            }
          }
        }
      }

      // ── Ball drag ────────────────────────────────────────────────────────
      if (dragRef.current && svgRef.current) {
        const { ballId, svgOffsetX, svgOffsetY } = dragRef.current;
        const rect = svgRef.current.getBoundingClientRect();
        const rawX = clamp(PLAY_LEFT, PLAY_RIGHT,  e.clientX - rect.left - svgOffsetX);
        const rawY = clamp(PLAY_TOP,  PLAY_BOTTOM, e.clientY - rect.top  - svgOffsetY);
        const cur  = tableBallsRef.current.find(b => b.id === ballId);
        if (cur) handleBallMovedRef.current(ballId, rawX - cur.x, rawY - cur.y);
        setTableBalls(prev => {
          let nx = rawX, ny = rawY;
          for (const b of prev) {
            if (b.id === ballId) continue;
            const d = Math.hypot(nx - b.x, ny - b.y);
            if (d > 0 && d < MIN_BALL_DIST) {
              nx = b.x + ((nx - b.x) / d) * MIN_BALL_DIST;
              ny = b.y + ((ny - b.y) / d) * MIN_BALL_DIST;
            }
          }
          nx = clamp(PLAY_LEFT, PLAY_RIGHT,  nx);
          ny = clamp(PLAY_TOP,  PLAY_BOTTOM, ny);
          return prev.map(b => b.id !== ballId ? b : { ...b, x: nx, y: ny });
        });
      }

      // ── Tray ghost ───────────────────────────────────────────────────────
      if (trayDragRef.current)
        setTrayGhost({ ballId: trayDragRef.current, x: e.clientX, y: e.clientY });

      // ── BIH: ellipse drag/resize ──────────────────────────────────────────
      const wdt = winDragTypeRef.current;
      if (wdt && winDragRef.current && winRef.current) {
        const dx   = e.clientX - winDragRef.current.mx;
        const dy   = e.clientY - winDragRef.current.my;
        const base = winDragRef.current.snap;
        if (wdt === 'move') {
          setWin({ ...base,
            cx: clamp(PLAY_LEFT, PLAY_RIGHT,  base.cx + dx),
            cy: clamp(PLAY_TOP,  PLAY_BOTTOM, base.cy + dy),
          });
        } else if (wdt === 'rx') {
          // Project drag onto the ellipse's local x-axis (direction of angle)
          const ar = (base.angle ?? 0) * (Math.PI / 180);
          const proj = dx * Math.cos(ar) + dy * Math.sin(ar);
          setWin({ ...base, rx: Math.max(12, base.rx + proj) });
        } else if (wdt === 'ry') {
          // Project drag onto the ellipse's local y-axis (perpendicular to angle)
          const ar = (base.angle ?? 0) * (Math.PI / 180);
          const proj = dx * (-Math.sin(ar)) + dy * Math.cos(ar);
          setWin({ ...base, ry: Math.max(12, base.ry - proj) });
        } else if (wdt === 'angle' && svgRef.current) {
          const rect = svgRef.current.getBoundingClientRect();
          const curX = e.clientX - rect.left - base.cx;
          const curY = e.clientY - rect.top  - base.cy;
          const newAngle = Math.atan2(curX, -curY) * (180 / Math.PI);
          setWin({ ...base, angle: newAngle });
        }
      }

      // ── BIH: ellipse creation ─────────────────────────────────────────────
      if (winCreateRef.current && svgRef.current) {
        const rect = svgRef.current.getBoundingClientRect();
        const cx   = e.clientX - rect.left;
        const cy   = e.clientY - rect.top;
        const { sx, sy } = winCreateRef.current;
        const rx = Math.abs(cx - sx) / 2;
        const ry = Math.abs(cy - sy) / 2;
        if (rx > 8 || ry > 8)
          setWin(prev => ({ cx: (sx + cx) / 2, cy: (sy + cy) / 2, rx: Math.max(8, rx), ry: Math.max(8, ry), angle: prev?.angle ?? 0 }));
      }

    }

    function onUp(e: MouseEvent) {
      // ── Pending ball: short click = toggle selection ─────────────────────
      if (pendingBallRef.current) {
        if (!pendingBallRef.current.activated) {
          const id = pendingBallRef.current.id;
          setSelectedId(prev => prev === id ? null : id);
        }
        pendingBallRef.current = null;
      }

      // ── Pending ghost: short click = toggle selection ────────────────────
      if (pendingGhostRef.current) {
        if (!pendingGhostRef.current.activated) {
          const id = pendingGhostRef.current.id;
          setSelectedId(prev => prev === id ? null : id);
        }
        pendingGhostRef.current = null;
      }

      dragRef.current = null;

      // ── Tray ball drop ────────────────────────────────────────────────────
      if (trayDragRef.current && svgRef.current) {
        const rect = svgRef.current.getBoundingClientRect();
        const inPlay =
          e.clientX >= rect.left   + RAIL &&
          e.clientX <= rect.right  - RAIL &&
          e.clientY >= rect.top    + RAIL &&
          e.clientY <= rect.bottom - RAIL;
        if (inPlay) {
          const dx = clamp(PLAY_LEFT, PLAY_RIGHT,  e.clientX - rect.left);
          const dy = clamp(PLAY_TOP,  PLAY_BOTTOM, e.clientY - rect.top);
          pushUndoRef.current();
          setTableBalls(prev => {
            if (prev.some(b => Math.hypot(dx - b.x, dy - b.y) < MIN_BALL_DIST)) return prev;
            return [...prev, { ...CUE_DEF, radius: BALL_R, x: dx, y: dy }];
          });
        }
        trayDragRef.current = null;
        setTrayGhost(null);
      }

      // ── BIH cleanup ───────────────────────────────────────────────────────
      winCreateRef.current = null;
      setWinDragType(null);
      winDragRef.current = null;
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };
  }, [svgRef]);

  // ── Export JSON ───────────────────────────────────────────────────────────────
  function handleExport() {
    const pocketBall1 = detectPocket(shotLines, '1');
    const pocketBall8 = detectPocket(shotLines, '8');
    const cueBall = tableBalls.find(b => b.id === 'cue');
    const ball1   = tableBalls.find(b => b.id === '1');
    const ball8   = tableBalls.find(b => b.id === '8');
    const data = {
      layout:     { cueBall: cueBall ? { x: cueBall.x, y: cueBall.y } : null, ball1: ball1 ? { x: ball1.x, y: ball1.y } : null, ball8: ball8 ? { x: ball8.x, y: ball8.y } : null },
      pockets:    { pocketBall1, pocketBall8 },
      window:     win ? { center: { x: win.cx, y: win.cy }, radiusX: win.rx, radiusY: win.ry } : null,
      cue,
      evaluation,
    };
    console.log(JSON.stringify(data, null, 2));
    alert('Exported to console (F12)');
  }

  function handleBihClear() {
    setWin(null); setBihMode('none');
  }

  // ── Route / stage management ──────────────────────────────────────────────────

  function captureStage(): Stage {
    return {
      id: Math.random().toString(36).slice(2),
      tableBalls:  tableBallsRef.current,
      ghostBalls:  ghostBallsRef.current,
      shotLines:   shotLinesRef.current,
      cue:         cueRef.current,
      win:         winRef.current,
      evaluation:  evaluationRef.current,
    };
  }

  function loadStage(stage: Stage) {
    setTableBalls(stage.tableBalls);
    restoreSnapshot({ ghostBalls: stage.ghostBalls, shotLines: stage.shotLines });
    setCue(stage.cue);
    setWin(stage.win);
    setEvaluation(stage.evaluation);
    setSelectedId(null);
  }

  function handleAddStage() {
    const stage = captureStage();
    setRoutes(prev => prev.map((r, i) =>
      i === activeRouteIdxRef.current
        ? { ...r, stages: [...r.stages, stage] }
        : r
    ));
    // Stay in live editing mode — do NOT set activeStageIdx
  }

  function handleSwitchRoute(idx: number) {
    if (idx === activeRouteIdxRef.current) return;
    const route = routesRef.current[idx];
    if (!route) return;
    setActiveRouteIdx(idx);
    if (route.stages.length > 0) {
      const last = route.stages.length - 1;
      loadStage(route.stages[last]);
      setActiveStageIdx(last);
    } else {
      setActiveStageIdx(null);
    }
  }

  function handleAddRoute() {
    const idx = routesRef.current.length;
    // New route gets the same stage-0 ball positions as route 0's stage 0
    const baseTableBalls = routesRef.current[0]?.stages[0]?.tableBalls ?? tableBallsRef.current;
    const s0 = makeStage0(baseTableBalls);
    const newRoute: Route = { id: Math.random().toString(36).slice(2), name: `Route ${idx + 1}`, stages: [s0] };
    setRoutes(prev => [...prev, newRoute]);
    setActiveRouteIdx(idx);
    setActiveStageIdx(null);
    setTableBalls(s0.tableBalls);
    clearGhostBalls();
    setShotLines([]);
  }

  function handleDeleteRoute(idx: number) {
    if (routesRef.current.length <= 1) return;
    setRoutes(prev => prev.filter((_, i) => i !== idx));
    const nextIdx = idx > 0 ? idx - 1 : 0;
    setActiveRouteIdx(nextIdx);
    const nextRoute = routesRef.current.filter((_, i) => i !== idx)[nextIdx];
    if (nextRoute?.stages.length) {
      const last = nextRoute.stages.length - 1;
      loadStage(nextRoute.stages[last]);
      setActiveStageIdx(last);
    } else {
      setActiveStageIdx(null);
    }
  }

  function handleDeleteStage(routeIdx: number, stageIdx: number) {
    // Don't allow deleting stage 0
    if (stageIdx === 0) return;
    setRoutes(prev => prev.map((r, i) =>
      i === routeIdx ? { ...r, stages: r.stages.filter((_, j) => j !== stageIdx) } : r
    ));
    setActiveStageIdx(prev => (prev !== null && prev >= stageIdx) ? Math.max(0, prev - 1) : prev);
  }

  function handleRenameRoute(idx: number, name: string) {
    setRoutes(prev => prev.map((r, i) => i === idx ? { ...r, name } : r));
  }

  // ── Load layout from URL param ────────────────────────────────────────────────

  const searchParams = useSearchParams();
  useEffect(() => {
    const layoutId = searchParams.get('layoutId');
    if (!layoutId) return;
    const layout = getLayout(layoutId);
    if (!layout) return;
    setCurrentLayoutId(layout.id);
    const loadedRoutes = layout.routes.length > 0
      ? layout.routes
      : [{ id: Math.random().toString(36).slice(2), name: 'Route 1', stages: [] } as Route];
    setRoutes(loadedRoutes);
    setActiveRouteIdx(0);
    const firstStage = loadedRoutes[0]?.stages[0];
    if (firstStage) {
      setActiveStageIdx(null); // stay in live editing mode
      setTableBalls(firstStage.tableBalls);
      restoreSnapshot({ ghostBalls: firstStage.ghostBalls, shotLines: firstStage.shotLines });
      setCue(firstStage.cue);
      setWin(firstStage.win);
      setEvaluation(firstStage.evaluation);
    } else {
      setActiveStageIdx(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Stage-view display state ──────────────────────────────────────────────────
  // When viewing a saved stage, compute potted-ball overlays + line opacity.
  const activeRoute     = routes[activeRouteIdx];
  const activeStageSnap = activeStageIdx !== null ? (activeRoute?.stages[activeStageIdx] ?? null) : null;

  let displayShotLines: ShotLine[] = shotLines;
  let pottedBalls: BallType[] = [];

  if (activeStageSnap && activeRoute) {
    const stage0   = activeRoute.stages[0];
    const stageK   = activeStageSnap;
    const prevStage = activeStageIdx! > 0 ? activeRoute.stages[activeStageIdx! - 1] : null;
    const prevIds   = new Set(prevStage?.shotLines.map(l => l.id) ?? []);

    // OB shot lines = lines WITHOUT startGhostId → dim
    const obLines: ShotLine[] = stageK.shotLines
      .filter(l => !l.startGhostId)
      .map(l => ({ ...l, opacity: 0.28 }));

    // CB shot line = lines WITH startGhostId that are NEW in this stage vs previous
    const cbLines: ShotLine[] = stageK.shotLines
      .filter(l => !!l.startGhostId && !prevIds.has(l.id));

    displayShotLines = [...obLines, ...cbLines];

    // Potted balls = balls that existed at stage 0 but are gone at stage k
    if (stage0) {
      pottedBalls = stage0.tableBalls.filter(
        b => !stageK.tableBalls.some(tb => tb.id === b.id)
      );
    }
  }

  // Auto-detect pockets from shot lines
  const detectedPocket1 = detectPocket(displayShotLines, '1');
  const detectedPocket8 = detectPocket(displayShotLines, '8');

  const tableCursor = bihMode === 'draw-window'
    ? 'crosshair' : trayGhost ? 'grabbing' : 'default';

  const selectedBallId = tableBalls.some(b => b.id === selectedId) ? selectedId : null;
  const selectedGhostId = ghostBalls.some(g => g.id === selectedId) ? selectedId : null;
  const selectedLineId = displayShotLines.some(l => l.id === selectedId) ? selectedId : null;
  const hasSelected = !!selectedId;

  const trayGhostDef = trayGhost ? ALL_BALL_DEFS.find(d => d.id === trayGhost.ballId) : null;

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>

      {/* ── Left: toolbar + table + cue tray ────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Toolbar row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>

          {/* Generate controls */}
          <div style={panelStyle}>
            <CountPicker label="Solids"  value={m} onChange={setM} type="solid"  />
            <span style={{ color: '#30363d', fontSize: 16 }}>+</span>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <span style={{ fontSize: 10, color: '#6e7681', fontWeight: 500 }}>8 BALL</span>
              <svg width={28} height={28} style={{ display: 'block' }}>
                <Ball ball={{ ...ALL_BALL_DEFS.find(d => d.id === '8')!, x: 14, y: 14, radius: 12 }} />
              </svg>
            </div>
            <span style={{ color: '#30363d', fontSize: 16 }}>+</span>
            <CountPicker label="Stripes" value={n} onChange={setN} type="stripe" />
            <div style={{ width: 1, height: 32, background: '#30363d' }} />
            <button onClick={handleGenerate} style={primaryBtnStyle}>Generate</button>
          </div>

          {/* Undo / Redo / Delete */}
          <div style={{ ...panelStyle, gap: 6 }}>
            <SmallBtn onClick={handleUndo} title="Undo (⌘Z)">↩ Undo</SmallBtn>
            <SmallBtn onClick={handleRedo} title="Redo (⌘⇧Z)">↪ Redo</SmallBtn>
            {hasSelected && (
              <>
                <div style={{ width: 1, height: 18, background: '#30363d' }} />
                <SmallBtn onClick={handleDelete} danger>Delete</SmallBtn>
              </>
            )}
          </div>

          {/* Clear drawing */}
          {(shotLines.length > 0 || ghostBalls.length > 0) && (
            <div style={{ ...panelStyle, gap: 6 }}>
              {shotLines.length > 0  && <SmallBtn onClick={() => setShotLines([])}>Clear lines</SmallBtn>}
              {ghostBalls.length > 0 && <SmallBtn onClick={clearGhostBalls}>Clear anchors</SmallBtn>}
            </div>
          )}
        </div>

        {/* Table */}
        <div style={{ cursor: tableCursor }}>
          <PoolTable
            svgRef={svgRef}
            balls={tableBalls}
            ghostBalls={ghostBalls}
            shotLines={displayShotLines}
            drawPreview={drawPreview}
            selectedBallId={selectedBallId}
            selectedLineId={selectedLineId}
            onBallDragStart={handleBallPointerDown}
            onGhostDragStart={handleGhostPointerDown}
            onGhostDoubleClick={handleGhostDoubleClick}
            onSvgMouseDown={handleSvgMouseDownScene}
            onSvgClick={handleSvgClickScene}
            onSvgDoubleClick={undefined}
            onShotLineClick={handleShotLineClick}
          >
            {/* Potted ball overlays — ghosted circles at original stage-0 positions */}
            {pottedBalls.map(b => (
              <g key={`potted-${b.id}`} style={{ pointerEvents: 'none' }}>
                <circle cx={b.x} cy={b.y} r={BALL_R}
                  fill="rgba(0,0,0,0.55)" stroke="rgba(255,255,255,0.18)"
                  strokeWidth={1.5} strokeDasharray="3 3" />
                <circle cx={b.x} cy={b.y} r={BALL_R * 0.35}
                  fill="rgba(255,255,255,0.12)" />
              </g>
            ))}

            {/* Pocket highlight overlays — auto-detected from shot lines */}
            {(Object.entries(POCKETS) as [PocketId, Pt][]).map(([id, pt]) => {
              const isP1 = detectedPocket1 === id;
              const isP8 = detectedPocket8 === id;
              if (!isP1 && !isP8) return null;
              return (
                <circle
                  key={id} cx={pt.x} cy={pt.y} r={28}
                  fill={isP1 ? 'rgba(245,197,24,0.25)' : 'rgba(180,180,180,0.22)'}
                  stroke={isP1 ? '#f5c518' : '#aaa'}
                  strokeWidth={2}
                  style={{ pointerEvents: 'none' }}
                />
              );
            })}


            {/* Positional window ellipse */}
            {win && (() => {
              const a  = win.angle ?? 0;
              const ar = a * (Math.PI / 180);
              // Handle positions (in ellipse-local coords, then rotated)
              const rxHandleX = win.cx + Math.cos(ar) * win.rx;
              const rxHandleY = win.cy + Math.sin(ar) * win.rx;
              const ryHandleX = win.cx + Math.cos(ar - Math.PI / 2) * win.ry;
              const ryHandleY = win.cy + Math.sin(ar - Math.PI / 2) * win.ry;
              // Rotation handle: placed above the ellipse top
              const rotOffset = win.ry + 22;
              const rotHX = win.cx - Math.sin(ar) * rotOffset;
              const rotHY = win.cy - Math.cos(ar) * rotOffset;
              return (
                <g>
                  <ellipse
                    cx={win.cx} cy={win.cy} rx={win.rx} ry={win.ry}
                    fill="rgba(255,255,80,0.10)" stroke="rgba(255,255,80,0.75)"
                    strokeWidth={2} strokeDasharray="6 4"
                    transform={`rotate(${a} ${win.cx} ${win.cy})`}
                    onMouseDown={(e) => startWinDrag('move', e)} style={{ cursor: 'move' }}
                  />
                  {/* rx handle */}
                  <circle cx={rxHandleX} cy={rxHandleY} r={6}
                    fill="rgba(255,255,80,0.9)" stroke="rgba(0,0,0,0.4)" strokeWidth={1}
                    onMouseDown={(e) => startWinDrag('rx', e)} style={{ cursor: 'ew-resize' }} />
                  {/* ry handle */}
                  <circle cx={ryHandleX} cy={ryHandleY} r={6}
                    fill="rgba(255,255,80,0.9)" stroke="rgba(0,0,0,0.4)" strokeWidth={1}
                    onMouseDown={(e) => startWinDrag('ry', e)} style={{ cursor: 'ns-resize' }} />
                  {/* rotation handle + stem */}
                  <line
                    x1={win.cx - Math.sin(ar) * win.ry} y1={win.cy - Math.cos(ar) * win.ry}
                    x2={rotHX} y2={rotHY}
                    stroke="rgba(255,255,80,0.45)" strokeWidth={1} strokeDasharray="3 3"
                    style={{ pointerEvents: 'none' }}
                  />
                  <circle cx={rotHX} cy={rotHY} r={7}
                    fill="rgba(255,255,80,0.15)" stroke="rgba(255,255,80,0.9)" strokeWidth={1.5}
                    onMouseDown={(e) => startWinDrag('angle', e)} style={{ cursor: 'grab' }} />
                  <text x={rotHX} y={rotHY + 1} textAnchor="middle" dominantBaseline="middle"
                    fontSize={9} fill="rgba(255,255,80,0.9)"
                    style={{ pointerEvents: 'none', userSelect: 'none' }}>↻</text>
                </g>
              );
            })()}

            {/* Selected ghost ring */}
            {selectedGhostId && (() => {
              const g = ghostBalls.find(gb => gb.id === selectedGhostId);
              if (!g) return null;
              return (
                <circle cx={g.x} cy={g.y} r={BALL_R + 5}
                  fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth={2}
                  style={{ pointerEvents: 'none' }}>
                  <animate attributeName="r"       values={`${BALL_R + 4};${BALL_R + 8};${BALL_R + 4}`} dur="1.4s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.9;0.35;0.9"                                 dur="1.4s" repeatCount="indefinite" />
                </circle>
              );
            })()}
          </PoolTable>
        </div>

        {/* Cue ball queue */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 12px', background: '#161b22', borderRadius: 10, border: '1px solid #30363d' }}>
          <span style={{ fontSize: 11, color: '#6e7681', fontWeight: 500, letterSpacing: '0.05em' }}>CUE BALL</span>
          <div
            title="Drag onto table"
            style={{ cursor: cueBallOnTable ? 'default' : 'grab', opacity: cueBallOnTable ? 0.3 : 1, transition: 'opacity 0.15s', userSelect: 'none' }}
            onMouseDown={cueBallOnTable ? undefined : (e) => { e.preventDefault(); handleCueTrayDragStart(e.clientX, e.clientY); }}
          >
            <svg width={TRAY_SIZE} height={TRAY_SIZE} style={{ display: 'block' }}>
              <Ball ball={{ ...CUE_DEF, x: TRAY_SIZE / 2, y: TRAY_SIZE / 2, radius: TRAY_R }} />
            </svg>
          </div>
          {cueBallOnTable && <span style={{ fontSize: 10, color: '#484f58', fontStyle: 'italic' }}>on table</span>}
        </div>
      </div>

      {/* ── Right: BIH label panel ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 290 }}>

        <div style={{ fontSize: 10, color: '#484f58', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          BIH Labels
        </div>

        {/* Positional window */}
        <SidePanel title="Positional Window">
          <BihModeBtn
            active={bihMode === 'draw-window'}
            onClick={() => setBihMode(m => m === 'draw-window' ? 'none' : 'draw-window')}
          >
            {bihMode === 'draw-window' ? 'Drawing… (drag to size)' : win ? 'Redraw Window' : 'Draw Window'}
          </BihModeBtn>
        </SidePanel>

        {/* Cue Strike — cue ball picker + power pump */}
        <SidePanel title="Cue Strike">
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <CueBallPicker hitX={cue.hitX} hitY={cue.hitY} onChange={(hx, hy) => setCue(c => ({ ...c, hitX: hx, hitY: hy }))} />
            <PowerPump power={cue.power} onChange={p => setCue(c => ({ ...c, power: p }))} />
          </div>
        </SidePanel>

        {/* Evaluation */}
        <SidePanel title="Evaluation">
          {/* Rank */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 10, color: '#484f58', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Rank</span>
            <div style={{ display: 'flex', gap: 5 }}>
              {(['best', 'acceptable', 'bad'] as Evaluation['rank'][]).map(r => (
                <button key={r} onClick={() => setEvaluation(e => ({ ...e, rank: r }))} style={{
                  flex: 1, padding: '4px 0', borderRadius: 5, fontSize: 11, fontWeight: 600,
                  border: `1px solid ${evaluation.rank === r ? rankColor(r) : '#30363d'}`,
                  background: evaluation.rank === r ? `${rankColor(r)}22` : 'transparent',
                  color: evaluation.rank === r ? rankColor(r) : '#6e7681', cursor: 'pointer',
                }}>
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Difficulty */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 10, color: '#484f58', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Difficulty</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {[1, 2, 3, 4, 5].map(d => (
                <button key={d} onClick={() => setEvaluation(e => ({ ...e, difficulty: d }))} style={{
                  flex: 1, height: 28, borderRadius: 5, fontSize: 12, fontWeight: 700,
                  border: `1px solid ${evaluation.difficulty === d ? '#4a9fd4' : '#30363d'}`,
                  background: evaluation.difficulty === d ? '#1e4a6e' : '#0d1117',
                  color: evaluation.difficulty === d ? '#fff' : '#484f58', cursor: 'pointer',
                }}>
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* Margin */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 10, color: '#484f58', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Margin</span>
            <div style={{ display: 'flex', gap: 5 }}>
              {(['large', 'medium', 'small'] as Evaluation['margin'][]).map(m => (
                <button key={m} onClick={() => setEvaluation(e => ({ ...e, margin: m }))} style={{
                  flex: 1, padding: '4px 0', borderRadius: 5, fontSize: 11, fontWeight: 600,
                  border: `1px solid ${evaluation.margin === m ? '#4a9fd4' : '#30363d'}`,
                  background: evaluation.margin === m ? 'rgba(74,159,212,0.15)' : 'transparent',
                  color: evaluation.margin === m ? '#4a9fd4' : '#6e7681', cursor: 'pointer',
                }}>
                  {m}
                </button>
              ))}
            </div>
          </div>
        </SidePanel>

        {/* Risk Tags */}
        <SidePanel title="Risk Tags">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {RISK_OPTIONS.map(r => (
              <TagToggle key={r} label={r} active={evaluation.risks.includes(r)}
                onToggle={() => setEvaluation(ev => ({
                  ...ev,
                  risks: ev.risks.includes(r) ? ev.risks.filter(x => x !== r) : [...ev.risks, r],
                }))}
              />
            ))}
          </div>
        </SidePanel>

        {/* Status */}
        <SidePanel title="Status">
          <div style={{ fontSize: 12, color: '#8b949e', lineHeight: 2 }}>
            <div>Ball 1 pocket: <Badge label={detectedPocket1 ?? 'none detected'} set={!!detectedPocket1} /></div>
            <div>8-ball pocket: <Badge label={detectedPocket8 ?? 'none detected'} set={!!detectedPocket8} /></div>
            <div>Window: <Badge label={win ? `${Math.round(win.rx)}×${Math.round(win.ry)}` : 'none'} set={!!win} /></div>
          </div>
        </SidePanel>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8 }}>
          <SmallBtn onClick={handleBihClear}>Clear BIH</SmallBtn>
          <button onClick={handleExport} style={primaryBtnStyle}>Export JSON</button>
        </div>

        {/* Routes & Stages panel — each route is its own separated row */}
        <div style={{
          background: '#161b22', border: '1px solid #21262d',
          borderRadius: 10, overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            padding: '8px 12px', borderBottom: '1px solid #21262d',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 10, color: '#484f58', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase' as const }}>
              Routes &amp; Stages
            </span>
            <button onClick={handleAddRoute} style={{
              padding: '2px 8px', borderRadius: 5, fontSize: 11, fontWeight: 500,
              border: '1px solid #30363d', background: 'transparent', color: '#6e7681', cursor: 'pointer',
            }}>+ Route</button>
          </div>

          {routes.map((route, routeIdx) => {
            const isActive = routeIdx === activeRouteIdx;
            const dotColor = ROUTE_COLORS[routeIdx % ROUTE_COLORS.length];
            return (
              <div key={route.id} style={{
                borderBottom: routeIdx < routes.length - 1 ? '1px solid #21262d' : undefined,
                background: isActive ? 'rgba(30,74,110,0.18)' : 'transparent',
                borderLeft: `3px solid ${isActive ? dotColor : 'transparent'}`,
                transition: 'background 0.15s',
              }}>
                {/* Route header row */}
                <div
                  style={{ padding: '7px 10px 4px', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                  onClick={() => handleSwitchRoute(routeIdx)}
                >
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0, display: 'inline-block' }} />
                  <RouteTab
                    name={route.name} active={isActive}
                    onClick={() => handleSwitchRoute(routeIdx)}
                    onRename={name => handleRenameRoute(routeIdx, name)}
                    onDelete={routes.length > 1 ? () => handleDeleteRoute(routeIdx) : undefined}
                  />
                </div>
                {/* Stage chips */}
                <div style={{ padding: '0 10px 8px 26px', display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                  {route.stages.map((stage, stageIdx) => {
                    const isActiveStage = isActive && activeStageIdx === stageIdx;
                    return (
                      <button
                        key={stage.id}
                        onClick={() => { handleSwitchRoute(routeIdx); loadStage(stage); setActiveStageIdx(stageIdx); }}
                        style={{
                          width: 26, height: 22, borderRadius: 4, fontSize: 11, fontWeight: 700,
                          border: `1px solid ${isActiveStage ? dotColor : '#30363d'}`,
                          background: isActiveStage ? `${dotColor}33` : '#0d1117',
                          color: isActiveStage ? dotColor : '#484f58',
                          cursor: 'pointer',
                        }}
                        title={stageIdx === 0 ? 'Stage 0 — initial layout' : `Stage ${stageIdx}`}
                      >
                        {stageIdx}
                      </button>
                    );
                  })}
                  {isActive && (
                    <button onClick={handleAddStage} style={{
                      padding: '1px 7px', borderRadius: 4, fontSize: 10, fontWeight: 500,
                      border: '1px dashed #30363d', background: 'transparent', color: '#484f58', cursor: 'pointer',
                    }} title="Capture current scene as next stage">
                      + Stage
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Save Layout */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowSaveModal(true)} style={primaryBtnStyle}>
            {currentLayoutId ? 'Update Layout' : 'Save Layout'}
          </button>
        </div>
      </div>

      {/* Tray drag ghost */}
      {trayGhost && trayGhostDef && (
        <div style={{ position: 'fixed', left: trayGhost.x - G_R - 2, top: trayGhost.y - G_R - 2, pointerEvents: 'none', zIndex: 1000, opacity: 0.85 }}>
          <svg width={G_SVG} height={G_SVG}>
            <Ball ball={{ ...trayGhostDef, x: G_R + 2, y: G_R + 2, radius: G_R }} />
          </svg>
        </div>
      )}

      {/* Save Layout modal */}
      {showSaveModal && (
        <SaveLayoutModal
          currentLayoutId={currentLayoutId}
          routes={routes}
          onSaved={(id) => { setCurrentLayoutId(id); setShowSaveModal(false); }}
          onClose={() => setShowSaveModal(false)}
        />
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CountPicker({ label, value, onChange, type }: {
  label: string; value: number; onChange: (v: number) => void; type: 'solid' | 'stripe';
}) {
  const R    = 11;
  const SIZE = R * 2 + 4;
  const samples = type === 'solid'
    ? ALL_BALL_DEFS.filter(d => d.number >= 1 && d.number <= 7)
    : ALL_BALL_DEFS.filter(d => d.number >= 9 && d.number <= 15);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
      <span style={{ fontSize: 10, color: '#6e7681', fontWeight: 500, letterSpacing: '0.05em' }}>{label.toUpperCase()}</span>
      <div style={{ display: 'flex', gap: 3 }}>
        {[0, 1, 2].map(v => (
          <button key={v} onClick={() => onChange(v)} style={{
            width: 26, height: 26, borderRadius: 5, fontSize: 12, fontWeight: 700,
            background: value === v ? '#1e4a6e' : '#0d1117',
            color: value === v ? '#fff' : '#484f58',
            border: `1px solid ${value === v ? '#4a9fd4' : '#30363d'}`,
            cursor: 'pointer', transition: 'all 0.12s',
          }}>
            {v}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 2, height: SIZE, alignItems: 'center', minWidth: SIZE * 2 + 2 }}>
        {Array.from({ length: Math.min(value, 2) }).map((_, i) => (
          <svg key={i} width={SIZE} height={SIZE} style={{ display: 'block' }}>
            <Ball ball={{ ...samples[i % samples.length], x: SIZE / 2, y: SIZE / 2, radius: R }} />
          </svg>
        ))}
      </div>
    </div>
  );
}

function SidePanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '9px 12px', background: '#161b22', borderRadius: 9, border: '1px solid #21262d', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 10, color: '#484f58', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{title}</div>
      {children}
    </div>
  );
}

function rankColor(r: 'best' | 'acceptable' | 'bad') {
  return r === 'best' ? '#3fb950' : r === 'bad' ? '#f85149' : '#e3b341';
}

const CUE_BALL_R = 46; // display radius for the cue ball picker

function CueBallPicker({ hitX, hitY, onChange }: {
  hitX: number; hitY: number;
  onChange: (hx: number, hy: number) => void;
}) {
  const size = CUE_BALL_R * 2 + 4;

  function handleClick(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = size / 2;
    const cy = size / 2;
    const dx = (e.clientX - rect.left) - cx;
    const dy = (e.clientY - rect.top)  - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > CUE_BALL_R) return;
    const nx = Math.max(-1, Math.min(1, dx / CUE_BALL_R));
    const ny = Math.max(-1, Math.min(1, dy / CUE_BALL_R));
    onChange(nx, ny);
  }

  const cx = size / 2;
  const cy = size / 2;
  const dotX = cx + hitX * CUE_BALL_R;
  const dotY = cy + hitY * CUE_BALL_R;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <span style={{ fontSize: 10, color: '#484f58', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Hit Point</span>
      <svg width={size} height={size} style={{ cursor: 'crosshair', display: 'block' }} onClick={handleClick}>
        {/* Ball base */}
        <circle cx={cx} cy={cy} r={CUE_BALL_R} fill="#f0f0f0" stroke="rgba(0,0,0,0.25)" strokeWidth={1.5} />
        {/* Subtle shading */}
        <circle cx={cx - CUE_BALL_R * 0.25} cy={cy - CUE_BALL_R * 0.25} r={CUE_BALL_R * 0.55}
          fill="rgba(255,255,255,0.35)" style={{ pointerEvents: 'none' }} />
        {/* Crosshair */}
        <line x1={cx - CUE_BALL_R} y1={cy} x2={cx + CUE_BALL_R} y2={cy}
          stroke="rgba(0,0,0,0.15)" strokeWidth={1} style={{ pointerEvents: 'none' }} />
        <line x1={cx} y1={cy - CUE_BALL_R} x2={cx} y2={cy + CUE_BALL_R}
          stroke="rgba(0,0,0,0.15)" strokeWidth={1} style={{ pointerEvents: 'none' }} />
        {/* Hit dot */}
        <circle cx={dotX} cy={dotY} r={5} fill="#e74c3c" stroke="rgba(0,0,0,0.4)" strokeWidth={1}
          style={{ pointerEvents: 'none' }} />
      </svg>
    </div>
  );
}

const PUMP_HEIGHT = 180;
const PUMP_WIDTH  = 24;
const POWER_STEPS = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 0]; // top → bottom

function PowerPump({ power, onChange }: { power: number; onChange: (p: number) => void }) {
  function handleClick(e: React.MouseEvent<SVGGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientY - rect.top) / PUMP_HEIGHT));
    // frac=0 → top=100%, frac=1 → bottom=0%
    const raw   = (1 - frac) * 100;
    const snapped = Math.round(raw / 10) * 10;
    onChange(Math.max(0, Math.min(100, snapped)));
  }

  const totalW = PUMP_WIDTH + 30; // bar + label space
  const barX   = 28;              // leave room for labels on left

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <span style={{ fontSize: 10, color: '#484f58', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Power</span>
      <svg width={totalW} height={PUMP_HEIGHT} style={{ display: 'block', cursor: 'pointer' }}>
        <defs>
          <linearGradient id="pump-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#e74c3c" />
            <stop offset="50%"  stopColor="#e3b341" />
            <stop offset="100%" stopColor="#3fb950" stopOpacity={0.4} />
          </linearGradient>
        </defs>

        <g onClick={handleClick} style={{ cursor: 'pointer' }}>
          {/* Bar background */}
          <rect x={barX} y={0} width={PUMP_WIDTH} height={PUMP_HEIGHT}
            fill="#0d1117" stroke="#30363d" strokeWidth={1} rx={4} />

          {/* Fill up to selected power */}
          {(() => {
            const fillH = (power / 100) * PUMP_HEIGHT;
            return (
              <rect x={barX} y={PUMP_HEIGHT - fillH} width={PUMP_WIDTH} height={fillH}
                fill="url(#pump-grad)" rx={4} style={{ pointerEvents: 'none' }} />
            );
          })()}

          {/* Tick marks + labels */}
          {POWER_STEPS.map((pct) => {
            const y = ((100 - pct) / 100) * PUMP_HEIGHT;
            const isSelected = power === pct;
            return (
              <g key={pct}>
                <line x1={barX} y1={y} x2={barX + PUMP_WIDTH} y2={y}
                  stroke={isSelected ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.2)'}
                  strokeWidth={isSelected ? 1.5 : 0.75} />
                <text x={barX - 4} y={y + 4}
                  textAnchor="end" fontSize={9} fontWeight={isSelected ? 700 : 400}
                  fill={isSelected ? '#e6edf3' : '#484f58'}
                  style={{ pointerEvents: 'none', userSelect: 'none' }}>
                  {pct}
                </text>
              </g>
            );
          })}

          {/* Selected power indicator line */}
          {(() => {
            const y = ((100 - power) / 100) * PUMP_HEIGHT;
            return (
              <line x1={barX - 2} y1={y} x2={barX + PUMP_WIDTH + 2} y2={y}
                stroke="#fff" strokeWidth={2} style={{ pointerEvents: 'none' }} />
            );
          })()}
        </g>
      </svg>
    </div>
  );
}

function TagToggle({ label, active, onToggle }: { label: string; active: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} style={{
      padding: '2px 7px', borderRadius: 4, fontSize: 10, fontWeight: 500,
      cursor: 'pointer', border: `1px solid ${active ? '#4a9fd4' : '#30363d'}`,
      background: active ? 'rgba(74,159,212,0.2)' : 'transparent',
      color: active ? '#4a9fd4' : '#6e7681', transition: 'all 0.1s',
    }}>
      {label}
    </button>
  );
}

function Badge({ label, set }: { label: string; set: boolean }) {
  return <span style={{ color: set ? '#58a6ff' : '#484f58', fontWeight: 600 }}>{label}</span>;
}

function BihModeBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: '5px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
      border: `1px solid ${active ? '#4a9fd4' : '#30363d'}`,
      background: active ? 'rgba(74,159,212,0.15)' : 'transparent',
      color: active ? '#4a9fd4' : '#6e7681',
      cursor: 'pointer', transition: 'all 0.12s', textAlign: 'left' as const,
    }}>
      {children}
    </button>
  );
}

function SmallBtn({ onClick, title, danger, children }: { onClick: () => void; title?: string; danger?: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={title} style={{
      padding: '4px 10px', borderRadius: 5, fontSize: 11, fontWeight: 500,
      border: `1px solid ${danger ? 'rgba(248,81,73,0.4)' : '#30363d'}`,
      background: 'transparent',
      color: danger ? '#f85149' : '#6e7681',
      cursor: 'pointer',
    }}>
      {children}
    </button>
  );
}

const panelStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10,
  padding: '8px 12px', background: '#161b22',
  borderRadius: 10, border: '1px solid #30363d',
};

const primaryBtnStyle: React.CSSProperties = {
  padding: '6px 14px', borderRadius: 7, fontSize: 12, fontWeight: 700,
  background: 'linear-gradient(135deg, #1e4a6e, #2980b9)', color: '#fff',
  border: 'none', cursor: 'pointer',
};

// ── RouteTab ──────────────────────────────────────────────────────────────────

function RouteTab({ name, active, onClick, onRename, onDelete }: {
  name: string; active: boolean;
  onClick: () => void;
  onRename: (n: string) => void;
  onDelete?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(name);

  if (editing) {
    return (
      <input
        value={val}
        onChange={e => setVal(e.target.value)}
        style={{
          padding: '2px 6px', borderRadius: 5, fontSize: 11, fontWeight: 500,
          border: '1px solid #4a9fd4', background: '#0d1117', color: '#e6edf3',
          width: 80, outline: 'none',
        }}
        autoFocus
        onBlur={() => { onRename(val.trim() || name); setEditing(false); }}
        onKeyDown={e => {
          if (e.key === 'Enter') { onRename(val.trim() || name); setEditing(false); }
          if (e.key === 'Escape') { setVal(name); setEditing(false); }
        }}
      />
    );
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      <button
        onClick={onClick}
        onDoubleClick={() => { setEditing(true); setVal(name); }}
        style={{
          padding: '2px 8px', borderRadius: 5, fontSize: 11, fontWeight: 500,
          border: `1px solid ${active ? '#4a9fd4' : '#30363d'}`,
          background: active ? '#1e4a6e' : 'transparent',
          color: active ? '#fff' : '#6e7681', cursor: 'pointer',
        }}
        title="Double-click to rename"
      >
        {name}
      </button>
      {active && onDelete && (
        <button
          onClick={onDelete}
          style={{
            width: 16, height: 16, borderRadius: 3, fontSize: 10,
            border: '1px solid rgba(248,81,73,0.3)', background: 'transparent',
            color: '#f85149', cursor: 'pointer', padding: 0, lineHeight: 1,
          }}
          title="Delete route"
        >×</button>
      )}
    </span>
  );
}

// ── SaveLayoutModal ───────────────────────────────────────────────────────────

const inputStyleDark: React.CSSProperties = {
  background: '#0d1117', border: '1px solid #30363d', borderRadius: 6,
  padding: '6px 10px', fontSize: 12, color: '#e6edf3', outline: 'none', width: '100%', boxSizing: 'border-box' as const,
};

const selectStyleDark: React.CSSProperties = {
  background: '#0d1117', border: '1px solid #30363d', borderRadius: 6,
  padding: '6px 10px', fontSize: 12, color: '#e6edf3', cursor: 'pointer', outline: 'none', width: '100%', boxSizing: 'border-box' as const,
};

function SaveLayoutModal({ currentLayoutId, routes, onSaved, onClose }: {
  currentLayoutId: string | null;
  routes: Route[];
  onSaved: (id: string) => void;
  onClose: () => void;
}) {
  const [existingLayout] = useState(() => currentLayoutId
    ? (getLayout(currentLayoutId) ?? null) : null);
  const [layoutName, setLayoutName]         = useState(existingLayout?.name ?? '');
  const [collections, setCollections]       = useState<Collection[]>(() => getCollections());
  const [selectedCollId, setSelectedCollId] = useState<string>('');
  const [newCollName, setNewCollName]       = useState('');
  const [newCollOwner, setNewCollOwner]     = useState('');
  const [createNew, setCreateNew]           = useState(false);

  function handleSave() {
    if (!layoutName.trim()) return;
    let layoutId: string;

    if (currentLayoutId) {
      // Update existing layout
      updateLayout(currentLayoutId, layoutName.trim(), routes);
      layoutId = currentLayoutId;
    } else {
      // Create new layout
      const l = createLayout(layoutName.trim(), routes);
      layoutId = l.id;
    }

    // Attach to collection
    if (createNew && newCollName.trim()) {
      const c = createCollection(newCollName.trim(), newCollOwner.trim() || 'Unknown');
      addLayoutToCollection(c.id, layoutId);
    } else if (selectedCollId) {
      addLayoutToCollection(selectedCollId, layoutId);
    }

    onSaved(layoutId);
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000,
    }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: '#161b22', border: '1px solid #21262d', borderRadius: 12,
        padding: '24px', width: 340, display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#e6edf3' }}>
          {currentLayoutId ? 'Update Layout' : 'Save Layout'}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, color: '#6e7681' }}>Layout name</label>
          <input
            style={inputStyleDark}
            placeholder="e.g. Corner cut setup"
            value={layoutName}
            onChange={e => setLayoutName(e.target.value)}
            autoFocus
          />
        </div>

        <div style={{ fontSize: 11, color: '#484f58' }}>
          {routes.length} route{routes.length !== 1 ? 's' : ''} ·{' '}
          {routes.reduce((s, r) => s + r.stages.length, 0)} stage{routes.reduce((s, r) => s + r.stages.length, 0) !== 1 ? 's' : ''}
        </div>

        <div style={{ borderTop: '1px solid #21262d', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 11, color: '#6e7681' }}>Add to collection (optional)</div>

          {!createNew && (
            <select
              style={selectStyleDark}
              value={selectedCollId}
              onChange={e => {
                if (e.target.value === '__new__') { setCreateNew(true); setSelectedCollId(''); }
                else setSelectedCollId(e.target.value);
              }}
            >
              <option value="">— Skip —</option>
              {collections.map(c => <option key={c.id} value={c.id}>{c.name} ({c.owner})</option>)}
              <option value="__new__">+ Create new collection…</option>
            </select>
          )}

          {createNew && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input
                style={inputStyleDark} placeholder="Collection name"
                value={newCollName} onChange={e => setNewCollName(e.target.value)}
                autoFocus
              />
              <input
                style={inputStyleDark} placeholder="Owner"
                value={newCollOwner} onChange={e => setNewCollOwner(e.target.value)}
              />
              <button onClick={() => setCreateNew(false)} style={{
                background: 'transparent', border: 'none', color: '#484f58',
                fontSize: 11, cursor: 'pointer', textAlign: 'left' as const, padding: 0,
              }}>← Back to existing</button>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 500,
            border: '1px solid #30363d', background: 'transparent', color: '#6e7681', cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={handleSave} disabled={!layoutName.trim()} style={{
            padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700,
            background: layoutName.trim() ? 'linear-gradient(135deg, #1e4a6e, #2980b9)' : '#21262d',
            color: layoutName.trim() ? '#fff' : '#484f58',
            border: 'none', cursor: layoutName.trim() ? 'pointer' : 'default',
          }}>
            {currentLayoutId ? 'Update' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
