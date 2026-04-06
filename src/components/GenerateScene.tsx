'use client';

import { useState, useRef, useEffect } from 'react';
import PoolTable from './PoolTable';
import Ball from './Ball';
import { Ball as BallType } from '@/src/lib/types';
import { ALL_BALL_DEFS } from '@/src/lib/ballData';
import { BALL_R, RAIL, PLAY_LEFT, PLAY_RIGHT, PLAY_TOP, PLAY_BOTTOM, MIN_BALL_DIST } from '@/src/lib/constants';
import { useDrawLines } from '@/src/lib/useDrawLines';

type Mode = 'move' | 'draw';
type TableDrag = { ballId: string; svgOffsetX: number; svgOffsetY: number };

const CUE_DEF = ALL_BALL_DEFS.find(d => d.id === 'cue')!;
const TRAY_R    = BALL_R + 2;
const TRAY_SIZE = TRAY_R * 2 + 8;

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

function randomPos(existing: { x: number; y: number }[]): { x: number; y: number } {
  for (let i = 0; i < 300; i++) {
    const x = PLAY_LEFT  + Math.random() * (PLAY_RIGHT  - PLAY_LEFT);
    const y = PLAY_TOP   + Math.random() * (PLAY_BOTTOM - PLAY_TOP);
    if (existing.every(b => Math.hypot(x - b.x, y - b.y) >= MIN_BALL_DIST))
      return { x, y };
  }
  return { x: PLAY_LEFT + Math.random() * (PLAY_RIGHT - PLAY_LEFT), y: PLAY_TOP + Math.random() * (PLAY_BOTTOM - PLAY_TOP) };
}

function generateLayout(m: number, n: number): BallType[] {
  const placed: BallType[] = [];
  const place = (def: (typeof ALL_BALL_DEFS)[0]) => {
    placed.push({ ...def, radius: BALL_R, ...randomPos(placed) });
  };
  place(ALL_BALL_DEFS.find(d => d.id === '8')!);
  const solids  = shuffle(ALL_BALL_DEFS.filter(d => d.number >= 1 && d.number <= 7));
  const stripes = shuffle(ALL_BALL_DEFS.filter(d => d.number >= 9 && d.number <= 15));
  for (let i = 0; i < m; i++) place(solids[i]);
  for (let i = 0; i < n; i++) place(stripes[i]);
  return placed;
}

export default function GenerateScene() {
  const [mode, setMode]             = useState<Mode>('move');
  const [m, setM]                   = useState(1);
  const [n, setN]                   = useState(1);
  // Start empty — populated client-side only to avoid Math.random() hydration mismatch
  const [tableBalls, setTableBalls] = useState<BallType[]>([]);
  const [trayGhost, setTrayGhost]   = useState<{ x: number; y: number } | null>(null);
  const [selectedBallId, setSelectedBallId] = useState<string | null>(null);

  const dragRef     = useRef<TableDrag | null>(null);
  const svgRef      = useRef<SVGSVGElement | null>(null);
  const trayDragRef = useRef(false);

  // Refs for event handler closures
  const tableBallsRef     = useRef<BallType[]>([]);
  const selectedBallIdRef = useRef<string | null>(null);
  const pendingBallRef    = useRef<{
    id: string; startX: number; startY: number; activated: boolean;
  } | null>(null);

  useEffect(() => { tableBallsRef.current     = tableBalls; },    [tableBalls]);
  useEffect(() => { selectedBallIdRef.current = selectedBallId; }, [selectedBallId]);

  const {
    ghostBalls, shotLines, setShotLines, drawPreview,
    handleSvgMouseDown, handleGhostDragStart, removeGhost,
    handleBallMoved,
  } = useDrawLines(svgRef, tableBalls);

  const handleSvgMouseDownRef = useRef(handleSvgMouseDown);
  const handleBallMovedRef    = useRef(handleBallMoved);
  handleSvgMouseDownRef.current = handleSvgMouseDown;
  handleBallMovedRef.current    = handleBallMoved;

  // Generate initial layout on the client only
  useEffect(() => {
    setTableBalls(generateLayout(1, 1));
  }, []);

  const cueBallOnTable = tableBalls.some(b => b.id === 'cue');

  function handleGenerate() {
    setTableBalls(generateLayout(m, n));
    setSelectedBallId(null);
  }

  function handleBallPointerDown(id: string, clientX: number, clientY: number) {
    pendingBallRef.current = { id, startX: clientX, startY: clientY, activated: false };
  }

  function handleCueTrayDragStart(clientX: number, clientY: number) {
    if (cueBallOnTable || mode !== 'move') return;
    trayDragRef.current = true;
    setTrayGhost({ x: clientX, y: clientY });
  }

  function handleSvgMouseDownScene(svgX: number, svgY: number) {
    if (mode === 'draw') handleSvgMouseDown(svgX, svgY);
  }

  useEffect(() => {
    function onMove(e: MouseEvent) {
      // ── Activate pending ball interaction
      if (pendingBallRef.current && !pendingBallRef.current.activated && svgRef.current) {
        const { id, startX, startY } = pendingBallRef.current;
        if (Math.hypot(e.clientX - startX, e.clientY - startY) > 4) {
          pendingBallRef.current.activated = true;
          const ball = tableBallsRef.current.find(b => b.id === id);
          if (ball) {
            if (selectedBallIdRef.current === id) {
              const rect = svgRef.current.getBoundingClientRect();
              dragRef.current = {
                ballId: id,
                svgOffsetX: startX - rect.left - ball.x,
                svgOffsetY: startY - rect.top  - ball.y,
              };
            } else {
              handleSvgMouseDownRef.current(ball.x, ball.y);
            }
          }
        }
      }

      // ── Table ball drag
      if (dragRef.current && svgRef.current) {
        const { ballId, svgOffsetX, svgOffsetY } = dragRef.current;
        const rect = svgRef.current.getBoundingClientRect();
        const rawX = clamp(PLAY_LEFT, PLAY_RIGHT,  e.clientX - rect.left - svgOffsetX);
        const rawY = clamp(PLAY_TOP,  PLAY_BOTTOM, e.clientY - rect.top  - svgOffsetY);
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
          return prev.map(b => b.id !== ballId ? b : {
            ...b,
            x: clamp(PLAY_LEFT, PLAY_RIGHT, nx),
            y: clamp(PLAY_TOP, PLAY_BOTTOM, ny),
          });
        });
      }
      // ── Cue ball tray ghost
      if (trayDragRef.current)
        setTrayGhost({ x: e.clientX, y: e.clientY });
    }

    function onUp(e: MouseEvent) {
      // ── Pending ball: short click = toggle selection
      if (pendingBallRef.current) {
        if (!pendingBallRef.current.activated) {
          const id = pendingBallRef.current.id;
          setSelectedBallId(prev => prev === id ? null : id);
        }
        pendingBallRef.current = null;
      }

      dragRef.current = null;

      // ── Drop cue ball onto table
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
          setTableBalls(prev => {
            if (prev.some(b => Math.hypot(dx - b.x, dy - b.y) < MIN_BALL_DIST)) return prev;
            return [...prev, { ...CUE_DEF, radius: BALL_R, x: dx, y: dy }];
          });
        }
        trayDragRef.current = false;
        setTrayGhost(null);
      }
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', justifyContent: 'space-between' }}>

        {/* Generate controls */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14,
          padding: '10px 18px', background: '#161b22',
          borderRadius: 12, border: '1px solid #30363d',
        }}>
          <CountPicker label="Solids"  value={m} onChange={setM} type="solid"  />
          <span style={{ color: '#30363d', fontSize: 18 }}>+</span>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <span style={{ fontSize: 10, color: '#6e7681', fontWeight: 500, letterSpacing: '0.05em' }}>8 BALL</span>
            <svg width={32} height={32} style={{ display: 'block' }}>
              <Ball ball={{ ...ALL_BALL_DEFS.find(d => d.id === '8')!, x: 16, y: 16, radius: 13 }} />
            </svg>
          </div>
          <span style={{ color: '#30363d', fontSize: 18 }}>+</span>
          <CountPicker label="Stripes" value={n} onChange={setN} type="stripe" />
          <div style={{ width: 1, height: 36, background: '#30363d' }} />
          <button onClick={handleGenerate} style={{
            padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700,
            background: 'linear-gradient(135deg, #1e4a6e, #2980b9)', color: '#fff',
            border: 'none', cursor: 'pointer', letterSpacing: '0.03em',
            boxShadow: '0 2px 8px rgba(41,128,185,0.35)',
          }}>
            Generate
          </button>
        </div>

        {/* Mode + clear */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', background: '#161b22', borderRadius: 10, border: '1px solid #30363d' }}>
          <div style={{ display: 'flex', gap: 2, background: '#0d1117', borderRadius: 7, padding: 3 }}>
            {(['move', 'draw'] as const).map(md => (
              <button key={md} onClick={() => setMode(md)} style={{
                padding: '4px 14px', borderRadius: 5, fontSize: 12, fontWeight: 600,
                border: 'none', background: mode === md ? '#1e4a6e' : 'transparent',
                color: mode === md ? '#fff' : '#6e7681', cursor: 'pointer', transition: 'all 0.15s',
              }}>
                {md === 'move' ? 'Move' : 'Draw'}
              </button>
            ))}
          </div>
          {shotLines.length > 0 && (
            <button onClick={() => setShotLines([])} style={{
              padding: '3px 10px', borderRadius: 5, fontSize: 11, fontWeight: 500,
              border: '1px solid #30363d', background: 'transparent', color: '#6e7681', cursor: 'pointer',
            }}>
              Clear lines
            </button>
          )}
        </div>
      </div>

      {/* ── Table + cue ball tray ────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
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
        </div>

        {/* Cue ball queue */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '6px 14px', background: '#161b22',
          borderRadius: 10, border: '1px solid #30363d',
        }}>
          <span style={{ fontSize: 11, color: '#6e7681', fontWeight: 500, letterSpacing: '0.05em' }}>CUE BALL</span>
          <div
            title="Drag onto table"
            style={{
              cursor: cueBallOnTable || mode !== 'move' ? 'default' : 'grab',
              opacity: cueBallOnTable ? 0.3 : 1,
              transition: 'opacity 0.15s',
              userSelect: 'none',
            }}
            onMouseDown={
              cueBallOnTable || mode !== 'move'
                ? undefined
                : (e) => { e.preventDefault(); handleCueTrayDragStart(e.clientX, e.clientY); }
            }
          >
            <svg width={TRAY_SIZE} height={TRAY_SIZE} style={{ display: 'block' }}>
              <Ball ball={{ ...CUE_DEF, x: TRAY_SIZE / 2, y: TRAY_SIZE / 2, radius: TRAY_R }} />
            </svg>
          </div>
          {cueBallOnTable && (
            <span style={{ fontSize: 10, color: '#484f58', fontStyle: 'italic' }}>on table</span>
          )}
        </div>
      </div>

      {/* Cue ball drag ghost */}
      {trayGhost && (
        <div style={{
          position: 'fixed',
          left: trayGhost.x - TRAY_R - 2,
          top:  trayGhost.y - TRAY_R - 2,
          pointerEvents: 'none',
          zIndex: 1000,
          opacity: 0.85,
        }}>
          <svg width={TRAY_SIZE} height={TRAY_SIZE}>
            <Ball ball={{ ...CUE_DEF, x: TRAY_SIZE / 2, y: TRAY_SIZE / 2, radius: TRAY_R }} />
          </svg>
        </div>
      )}
    </div>
  );
}

// ─── CountPicker ──────────────────────────────────────────────────────────────

function CountPicker({ label, value, onChange, type }: {
  label: string; value: number; onChange: (v: number) => void; type: 'solid' | 'stripe';
}) {
  const R    = 12;
  const SIZE = R * 2 + 4;
  const samples = type === 'solid'
    ? ALL_BALL_DEFS.filter(d => d.number >= 1 && d.number <= 7)
    : ALL_BALL_DEFS.filter(d => d.number >= 9 && d.number <= 15);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 10, color: '#6e7681', fontWeight: 500, letterSpacing: '0.05em' }}>
        {label.toUpperCase()}
      </span>
      <div style={{ display: 'flex', gap: 4 }}>
        {[0, 1, 2].map(v => (
          <button key={v} onClick={() => onChange(v)} style={{
            width: 28, height: 28, borderRadius: 6, fontSize: 13, fontWeight: 700,
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
