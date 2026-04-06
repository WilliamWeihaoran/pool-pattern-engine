'use client';

import { useState, useRef, useEffect } from 'react';
import PoolTable from './PoolTable';
import BallTray from './BallTray';
import Ball from './Ball';
import { Ball as BallType } from '@/src/lib/types';
import { ALL_BALL_DEFS } from '@/src/lib/ballData';
import { BALL_R, RAIL, PLAY_LEFT, PLAY_RIGHT, PLAY_TOP, PLAY_BOTTOM, MIN_BALL_DIST } from '@/src/lib/constants';
import { useDrawLines } from '@/src/lib/useDrawLines';

type Mode = 'move' | 'draw';

type TableDrag = {
  ballId: string;
  svgOffsetX: number;
  svgOffsetY: number;
};

type TrayGhost = { ballId: string; x: number; y: number };

const G_R   = BALL_R;
const G_SVG = G_R * 2 + 4;

function clamp(min: number, max: number, val: number) {
  return Math.max(min, Math.min(max, val));
}

export default function PoolTableScene() {
  const [mode, setMode]               = useState<Mode>('move');
  const [tableBalls, setTableBalls]   = useState<BallType[]>([]);
  const [trayGhost, setTrayGhost]     = useState<TrayGhost | null>(null);
  const [selectedBallId, setSelectedBallId] = useState<string | null>(null);

  const dragRef     = useRef<TableDrag | null>(null);
  const trayDragRef = useRef<string | null>(null);
  const svgRef      = useRef<SVGSVGElement | null>(null);

  // Refs for event handler closures
  const tableBallsRef    = useRef<BallType[]>([]);
  const selectedBallIdRef = useRef<string | null>(null);
  const modeRef           = useRef<Mode>('move');
  // Pending ball interaction: decided as click (select) or drag (move/draw) by movement
  const pendingBallRef   = useRef<{
    id: string; startX: number; startY: number; activated: boolean;
  } | null>(null);

  useEffect(() => { tableBallsRef.current    = tableBalls; },    [tableBalls]);
  useEffect(() => { selectedBallIdRef.current = selectedBallId; }, [selectedBallId]);
  useEffect(() => { modeRef.current          = mode; },          [mode]);

  const {
    ghostBalls, clearGhostBalls,
    shotLines, setShotLines, drawPreview,
    handleSvgMouseDown, handleGhostDragStart, removeGhost,
    handleBallMoved,
  } = useDrawLines(svgRef, tableBalls);

  // Refs to stable-ish hook functions for use inside the event-listener closure
  const handleSvgMouseDownRef = useRef(handleSvgMouseDown);
  const handleBallMovedRef    = useRef(handleBallMoved);
  handleSvgMouseDownRef.current = handleSvgMouseDown;
  handleBallMovedRef.current    = handleBallMoved;

  const tableBallIds = new Set(tableBalls.map(b => b.id));

  // ── Ball pointer down — record pending; mode determines later behavior ──
  function handleBallPointerDown(id: string, clientX: number, clientY: number) {
    pendingBallRef.current = { id, startX: clientX, startY: clientY, activated: false };
  }

  function handleTrayDragStart(id: string, clientX: number, clientY: number) {
    if (mode !== 'move') return;
    trayDragRef.current = id;
    setTrayGhost({ ballId: id, x: clientX, y: clientY });
  }

  // ── SVG mousedown — only used in draw mode for lines from empty space ──
  function handleSvgMouseDownScene(svgX: number, svgY: number) {
    if (mode === 'draw') handleSvgMouseDown(svgX, svgY);
  }

  useEffect(() => {
    function onMove(e: MouseEvent) {
      // ── Activate pending ball interaction once movement threshold is crossed
      if (pendingBallRef.current && !pendingBallRef.current.activated && svgRef.current) {
        const { id, startX, startY } = pendingBallRef.current;
        if (Math.hypot(e.clientX - startX, e.clientY - startY) > 4) {
          pendingBallRef.current.activated = true;
          const ball = tableBallsRef.current.find(b => b.id === id);
          if (ball) {
            if (selectedBallIdRef.current === id) {
              // Selected → move the ball
              const rect = svgRef.current.getBoundingClientRect();
              dragRef.current = {
                ballId: id,
                svgOffsetX: startX - rect.left - ball.x,
                svgOffsetY: startY - rect.top  - ball.y,
              };
            } else {
              // Unselected → draw arrow from ball
              handleSvgMouseDownRef.current(ball.x, ball.y);
            }
          }
        }
      }

      // ── Ball drag ────────────────────────────────────────────────────
      if (dragRef.current && svgRef.current) {
        const { ballId, svgOffsetX, svgOffsetY } = dragRef.current;
        const rect = svgRef.current.getBoundingClientRect();
        const rawX = clamp(PLAY_LEFT, PLAY_RIGHT,  e.clientX - rect.left - svgOffsetX);
        const rawY = clamp(PLAY_TOP,  PLAY_BOTTOM, e.clientY - rect.top  - svgOffsetY);
        // Move associated GBs and SLs by the same delta as the ball
        const cur = tableBallsRef.current.find(b => b.id === ballId);
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

      // ── Tray ghost ───────────────────────────────────────────────────
      if (trayDragRef.current)
        setTrayGhost({ ballId: trayDragRef.current, x: e.clientX, y: e.clientY });
    }

    function onUp(e: MouseEvent) {
      // ── Pending ball: short click = toggle selection ──────────────────
      if (pendingBallRef.current) {
        if (!pendingBallRef.current.activated) {
          const id = pendingBallRef.current.id;
          setSelectedBallId(prev => prev === id ? null : id);
        }
        pendingBallRef.current = null;
      }

      dragRef.current = null;

      if (trayDragRef.current && svgRef.current) {
        const rect = svgRef.current.getBoundingClientRect();
        const inPlay =
          e.clientX >= rect.left   + RAIL &&
          e.clientX <= rect.right  - RAIL &&
          e.clientY >= rect.top    + RAIL &&
          e.clientY <= rect.bottom - RAIL;
        if (inPlay) {
          const id  = trayDragRef.current;
          const def = ALL_BALL_DEFS.find(d => d.id === id);
          if (def) {
            const dx = clamp(PLAY_LEFT, PLAY_RIGHT,  e.clientX - rect.left);
            const dy = clamp(PLAY_TOP,  PLAY_BOTTOM, e.clientY - rect.top);
            setTableBalls(prev => {
              if (prev.some(b => Math.hypot(dx - b.x, dy - b.y) < MIN_BALL_DIST)) return prev;
              return [...prev, { ...def, radius: BALL_R, x: dx, y: dy }];
            });
          }
        }
      }
      trayDragRef.current = null;
      setTrayGhost(null);
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };
  }, [svgRef]);

  const trayGhostDef = trayGhost ? ALL_BALL_DEFS.find(d => d.id === trayGhost.ballId) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div style={toolbarStyle}>
        <ModePill mode={mode} setMode={setMode} />

        {(shotLines.length > 0 || ghostBalls.length > 0) && (
          <>
            <Divider />
            {shotLines.length > 0 && (
              <GhostBtn onClick={() => setShotLines([])}>Clear lines</GhostBtn>
            )}
            {ghostBalls.length > 0 && (
              <GhostBtn onClick={clearGhostBalls}>Clear anchors</GhostBtn>
            )}
          </>
        )}
      </div>

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <div style={{ cursor: trayGhost ? 'grabbing' : mode === 'draw' ? 'crosshair' : 'auto' }}>
        <PoolTable
          svgRef={svgRef}
          balls={tableBalls}
          ghostBalls={ghostBalls}
          shotLines={shotLines}
          drawPreview={drawPreview}
          selectedBallId={selectedBallId}
          onBallDragStart={handleBallPointerDown}
          onGhostDragStart={mode === 'move' ? handleGhostDragStart : undefined}
          onGhostDoubleClick={removeGhost}
          onSvgMouseDown={handleSvgMouseDownScene}
        >
        </PoolTable>
        <BallTray
          balls={ALL_BALL_DEFS}
          onTable={tableBallIds}
          onDragStart={handleTrayDragStart}
        />
      </div>

      {/* ── Tray drag ghost ──────────────────────────────────────────────── */}
      {trayGhost && trayGhostDef && (
        <div style={{
          position: 'fixed',
          left: trayGhost.x - G_R - 2,
          top:  trayGhost.y - G_R - 2,
          pointerEvents: 'none',
          zIndex: 1000,
          opacity: 0.85,
        }}>
          <svg width={G_SVG} height={G_SVG}>
            <Ball ball={{ ...trayGhostDef, x: G_R + 2, y: G_R + 2, radius: G_R }} />
          </svg>
        </div>
      )}
    </div>
  );
}

// ─── Small UI helpers ──────────────────────────────────────────────────────────

function ModePill({ mode, setMode }: { mode: string; setMode: (m: 'move' | 'draw') => void }) {
  return (
    <div style={{ display: 'flex', gap: 2, background: '#0d1117', borderRadius: 7, padding: 3 }}>
      {(['move', 'draw'] as const).map(m => (
        <button
          key={m}
          onClick={() => setMode(m)}
          style={{
            padding: '4px 14px',
            borderRadius: 5,
            fontSize: 12,
            fontWeight: 600,
            border: 'none',
            background: mode === m ? '#1e4a6e' : 'transparent',
            color: mode === m ? '#fff' : '#6e7681',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          {m === 'move' ? 'Move' : 'Draw'}
        </button>
      ))}
    </div>
  );
}

function Divider() {
  return <div style={{ width: 1, height: 20, background: '#30363d' }} />;
}

function GhostBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: '3px 10px', borderRadius: 5, fontSize: 11, fontWeight: 500,
      border: '1px solid #30363d', background: 'transparent', color: '#6e7681', cursor: 'pointer',
    }}>
      {children}
    </button>
  );
}

const toolbarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '7px 12px',
  background: '#161b22',
  borderRadius: 10,
  border: '1px solid #30363d',
  alignSelf: 'flex-start',
};
