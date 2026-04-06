'use client';

import { useState, useRef, useEffect } from 'react';
import PoolTable from './PoolTable';
import { Ball as BallType } from '@/src/lib/types';
import { ALL_BALL_DEFS } from '@/src/lib/ballData';
import {
  TABLE_WIDTH, TABLE_HEIGHT, RAIL, BALL_R,
  PLAY_LEFT, PLAY_RIGHT, PLAY_TOP, PLAY_BOTTOM,
} from '@/src/lib/constants';

// ── Domain types ──────────────────────────────────────────────────────────────

export type PocketId = 'TL' | 'TC' | 'TR' | 'BL' | 'BC' | 'BR';

type Pt = { x: number; y: number };

type EllipseWin = { cx: number; cy: number; rx: number; ry: number };

type CueStrike = {
  vertical: 'center' | 'follow' | 'draw';
  horizontal: 'center' | 'left' | 'right';
  power: 'soft' | 'medium' | 'firm';
};

type Evaluation = {
  rank: 'best' | 'acceptable' | 'bad';
  difficulty: number;
  margin: 'large' | 'medium' | 'small';
  risks: string[];
};

export type LabeledRoute = {
  layout: { cueBall: Pt; ball1: Pt; ball8: Pt };
  pockets: { pocketBall1: PocketId; pocketBall8: PocketId };
  route: { path: Pt[]; finalCueBall: Pt; railsUsed: number };
  window: { center: Pt; radiusX: number; radiusY: number } | null;
  cue: CueStrike;
  evaluation: Evaluation;
};

type BIHMode = 'move' | 'select-p1' | 'select-p8' | 'draw-route' | 'draw-window';

// ── Table geometry (mirrors PoolTable internals) ──────────────────────────────

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
const POCKET_HIT_R = 28;

const RISK_OPTIONS = [
  'wrong_side', 'overhit', 'underhit', 'scratch', 'spin_sensitive', 'speed_sensitive',
];

const CUE_DEF   = ALL_BALL_DEFS.find(d => d.id === 'cue')!;
const BALL1_DEF = ALL_BALL_DEFS.find(d => d.id === '1')!;
const BALL8_DEF = ALL_BALL_DEFS.find(d => d.id === '8')!;

function clamp(min: number, max: number, val: number) {
  return Math.max(min, Math.min(max, val));
}

function toSvgPt(e: { clientX: number; clientY: number }, rect: DOMRect): Pt {
  return {
    x: clamp(PLAY_LEFT, PLAY_RIGHT,  e.clientX - rect.left),
    y: clamp(PLAY_TOP,  PLAY_BOTTOM, e.clientY - rect.top),
  };
}

function estimateRailsUsed(path: Pt[]): number {
  let count = 0;
  for (let i = 1; i < path.length - 1; i++) {
    const p = path[i];
    if (
      p.x <= PLAY_LEFT  + BALL_R * 3 || p.x >= PLAY_RIGHT  - BALL_R * 3 ||
      p.y <= PLAY_TOP   + BALL_R * 3 || p.y >= PLAY_BOTTOM - BALL_R * 3
    ) count++;
  }
  return count;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function BIHScene() {
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Ball positions
  const [cueBallPos, setCueBallPos] = useState<Pt>({ x: PLAY_LEFT + 120, y: TH / 2 });
  const [ball1Pos,   setBall1Pos]   = useState<Pt>({ x: TW / 2 - 40, y: TH / 2 - 60 });
  const [ball8Pos,   setBall8Pos]   = useState<Pt>({ x: TW / 2 + 60, y: TH / 2 + 50 });

  // Pocket selections
  const [pocketBall1, setPocketBall1] = useState<PocketId | null>(null);
  const [pocketBall8, setPocketBall8] = useState<PocketId | null>(null);

  // Route
  const [route,             setRoute]             = useState<Pt[]>([]);
  const [routeInProgress,   setRouteInProgress]   = useState<Pt[]>([]);
  const [mousePos,          setMousePos]           = useState<Pt | null>(null);

  // Positional window
  const [win,         setWin]         = useState<EllipseWin | null>(null);
  const [winDragType, setWinDragType] = useState<'move' | 'rx' | 'ry' | null>(null);
  const winDragRef = useRef<{ mx: number; my: number; snap: EllipseWin } | null>(null);

  // Mode
  const [mode, setMode] = useState<BIHMode>('move');

  // Cue + evaluation
  const [cue, setCue] = useState<CueStrike>({
    vertical: 'center', horizontal: 'center', power: 'medium',
  });
  const [evaluation, setEvaluation] = useState<Evaluation>({
    rank: 'acceptable', difficulty: 3, margin: 'medium', risks: [],
  });

  // Ball drag
  const ballDragRef = useRef<{ which: 'cue' | 'b1' | 'b8'; offX: number; offY: number } | null>(null);
  // Window creation drag
  const winCreateRef = useRef<{ sx: number; sy: number } | null>(null);

  // ── SVG event handlers ────────────────────────────────────────────────────

  function handleSvgMouseDown(svgX: number, svgY: number) {
    if (mode === 'draw-window') {
      winCreateRef.current = { sx: svgX, sy: svgY };
    }
  }

  function handleSvgClick(svgX: number, svgY: number) {
    if (mode === 'draw-route') {
      const pt = {
        x: clamp(PLAY_LEFT, PLAY_RIGHT,  svgX),
        y: clamp(PLAY_TOP,  PLAY_BOTTOM, svgY),
      };
      setRouteInProgress(prev => [...prev, pt]);
    }
  }

  function handleSvgDoubleClick(svgX: number, svgY: number) {
    if (mode === 'draw-route' && routeInProgress.length >= 1) {
      const pt = {
        x: clamp(PLAY_LEFT, PLAY_RIGHT,  svgX),
        y: clamp(PLAY_TOP,  PLAY_BOTTOM, svgY),
      };
      const finalRoute = [...routeInProgress, pt];
      setRoute(finalRoute);
      setRouteInProgress([]);
      setMousePos(null);
      setMode('move');
    }
  }

  // ── Pocket click ───────────────────────────────────────────────────────────

  function handlePocketClick(id: PocketId, e: React.MouseEvent) {
    e.stopPropagation();
    if (mode === 'select-p1') { setPocketBall1(id); setMode('move'); }
    if (mode === 'select-p8') { setPocketBall8(id); setMode('move'); }
  }

  // ── Ball drag start ────────────────────────────────────────────────────────

  function handleBallDragStart(id: string, clientX: number, clientY: number) {
    if (mode !== 'move') return;
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const which = id === 'cue' ? 'cue' : id === '1' ? 'b1' : 'b8';
    const pos = id === 'cue' ? cueBallPos : id === '1' ? ball1Pos : ball8Pos;
    ballDragRef.current = {
      which,
      offX: clientX - rect.left - pos.x,
      offY: clientY - rect.top  - pos.y,
    };
  }

  // ── Window drag start ──────────────────────────────────────────────────────

  function startWinDrag(type: 'move' | 'rx' | 'ry', e: React.MouseEvent) {
    if (!win) return;
    e.stopPropagation();
    e.preventDefault();
    setWinDragType(type);
    winDragRef.current = { mx: e.clientX, my: e.clientY, snap: { ...win } };
  }

  // ── Global mouse events ────────────────────────────────────────────────────

  useEffect(() => {
    function onMove(e: MouseEvent) {
      // Ball drag
      if (ballDragRef.current && svgRef.current) {
        const { which, offX, offY } = ballDragRef.current;
        const rect = svgRef.current.getBoundingClientRect();
        const nx = clamp(PLAY_LEFT, PLAY_RIGHT,  e.clientX - rect.left - offX);
        const ny = clamp(PLAY_TOP,  PLAY_BOTTOM, e.clientY - rect.top  - offY);
        if (which === 'cue') setCueBallPos({ x: nx, y: ny });
        if (which === 'b1')  setBall1Pos({ x: nx, y: ny });
        if (which === 'b8')  setBall8Pos({ x: nx, y: ny });
        return;
      }

      // Ellipse drag/resize (after creation)
      if (winDragType && winDragRef.current && win) {
        const dx = e.clientX - winDragRef.current.mx;
        const dy = e.clientY - winDragRef.current.my;
        const base = winDragRef.current.snap;
        if (winDragType === 'move') {
          setWin({
            ...base,
            cx: clamp(PLAY_LEFT, PLAY_RIGHT,  base.cx + dx),
            cy: clamp(PLAY_TOP,  PLAY_BOTTOM, base.cy + dy),
          });
        } else if (winDragType === 'rx') {
          setWin({ ...base, rx: Math.max(12, base.rx + dx) });
        } else if (winDragType === 'ry') {
          setWin({ ...base, ry: Math.max(12, base.ry + dy) });
        }
        return;
      }

      // Ellipse creation drag
      if (winCreateRef.current && svgRef.current) {
        const rect = svgRef.current.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const { sx, sy } = winCreateRef.current;
        const rx = Math.abs(cx - sx) / 2;
        const ry = Math.abs(cy - sy) / 2;
        if (rx > 8 || ry > 8) {
          setWin({ cx: (sx + cx) / 2, cy: (sy + cy) / 2, rx: Math.max(8, rx), ry: Math.max(8, ry) });
        }
      }

      // Route preview
      if (routeInProgress.length > 0 && svgRef.current) {
        const rect = svgRef.current.getBoundingClientRect();
        setMousePos({
          x: clamp(PLAY_LEFT, PLAY_RIGHT,  e.clientX - rect.left),
          y: clamp(PLAY_TOP,  PLAY_BOTTOM, e.clientY - rect.top),
        });
      }
    }

    function onUp() {
      ballDragRef.current  = null;
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
  }, [winDragType, win, routeInProgress.length]);

  // ── Export ────────────────────────────────────────────────────────────────

  function handleExport() {
    if (!pocketBall1 || !pocketBall8) {
      alert('Select pockets for both Ball 1 and the 8-ball first.');
      return;
    }
    const finalPath = route.length > 0 ? route : [];
    const finalCueBall = finalPath.length > 0 ? finalPath[finalPath.length - 1] : cueBallPos;
    const data: LabeledRoute = {
      layout:     { cueBall: cueBallPos, ball1: ball1Pos, ball8: ball8Pos },
      pockets:    { pocketBall1, pocketBall8 },
      route:      { path: finalPath, finalCueBall, railsUsed: estimateRailsUsed(finalPath) },
      window:     win ? { center: { x: win.cx, y: win.cy }, radiusX: win.rx, radiusY: win.ry } : null,
      cue,
      evaluation,
    };
    console.log(JSON.stringify(data, null, 2));
    alert('Exported to console (F12)');
  }

  function handleClear() {
    setRoute([]);
    setRouteInProgress([]);
    setMousePos(null);
    setWin(null);
    setPocketBall1(null);
    setPocketBall8(null);
    setMode('move');
  }

  // ── Build balls for PoolTable ─────────────────────────────────────────────

  const tableBalls: BallType[] = [
    { ...CUE_DEF,   x: cueBallPos.x, y: cueBallPos.y, radius: BALL_R },
    { ...BALL1_DEF, x: ball1Pos.x,   y: ball1Pos.y,   radius: BALL_R },
    { ...BALL8_DEF, x: ball8Pos.x,   y: ball8Pos.y,   radius: BALL_R },
  ];

  // Display path = confirmed route OR in-progress + preview
  const displayPath: Pt[] =
    route.length > 0 ? route
    : routeInProgress.length > 0 ? [...routeInProgress, ...(mousePos ? [mousePos] : [])]
    : [];

  const isPocketsSelectable = mode === 'select-p1' || mode === 'select-p8';
  const cursor =
    isPocketsSelectable || mode === 'draw-route' || mode === 'draw-window'
      ? 'crosshair' : 'default';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>

      {/* ── Toolbar ───────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        width: '100%', justifyContent: 'space-between',
      }}>
        <ModeBar mode={mode} pocketBall1={pocketBall1} pocketBall8={pocketBall8}
          setMode={m => { setMode(m); setMousePos(null); }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <GhostBtn onClick={handleClear}>Clear</GhostBtn>
          <PrimaryBtn onClick={handleExport}>Export JSON</PrimaryBtn>
        </div>
      </div>

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      <div style={{ cursor }}>
        <PoolTable
          svgRef={svgRef}
          balls={tableBalls}
          onBallDragStart={handleBallDragStart}
          onSvgMouseDown={handleSvgMouseDown}
          onSvgClick={handleSvgClick}
          onSvgDoubleClick={handleSvgDoubleClick}
        >
          {/* ── Pocket hit areas & selection rings ──────────────────────── */}
          {(Object.entries(POCKETS) as [PocketId, Pt][]).map(([id, pt]) => {
            const isP1 = pocketBall1 === id;
            const isP8 = pocketBall8 === id;
            return (
              <circle
                key={id}
                cx={pt.x} cy={pt.y} r={POCKET_HIT_R}
                fill={
                  isP1 ? 'rgba(245,197,24,0.25)' :
                  isP8 ? 'rgba(180,180,180,0.25)' :
                  'transparent'
                }
                stroke={
                  isP1 ? '#f5c518' :
                  isP8 ? '#aaa' :
                  isPocketsSelectable ? 'rgba(255,255,255,0.35)' :
                  'none'
                }
                strokeWidth={2}
                strokeDasharray={isPocketsSelectable && !isP1 && !isP8 ? '4 3' : undefined}
                style={{ cursor: isPocketsSelectable ? 'pointer' : 'default' }}
                onClick={(e) => handlePocketClick(id, e)}
              />
            );
          })}

          {/* ── Route / in-progress path ──────────────────────────────────── */}
          {displayPath.length >= 2 && (
            <polyline
              points={displayPath.map(p => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke="rgba(80,200,255,0.85)"
              strokeWidth={2.5}
              strokeDasharray={route.length === 0 ? '8 6' : '10 0'}
              strokeLinecap="round"
              style={{ pointerEvents: 'none' }}
            />
          )}
          {displayPath.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={i === 0 ? 5 : 4}
              fill={i === 0 ? 'rgba(80,200,255,1)' : 'rgba(80,200,255,0.8)'}
              stroke="rgba(0,0,0,0.3)" strokeWidth={1}
              style={{ pointerEvents: 'none' }}
            />
          ))}

          {/* ── Positional window (ellipse) ────────────────────────────────── */}
          {win && (
            <g>
              <ellipse
                cx={win.cx} cy={win.cy} rx={win.rx} ry={win.ry}
                fill="rgba(255,255,80,0.10)"
                stroke="rgba(255,255,80,0.75)"
                strokeWidth={2}
                strokeDasharray="6 4"
                onMouseDown={(e) => startWinDrag('move', e)}
                style={{ cursor: 'move' }}
              />
              {/* rx resize handle (right) */}
              <circle
                cx={win.cx + win.rx} cy={win.cy} r={6}
                fill="rgba(255,255,80,0.9)" stroke="rgba(0,0,0,0.4)" strokeWidth={1}
                onMouseDown={(e) => startWinDrag('rx', e)}
                style={{ cursor: 'ew-resize' }}
              />
              {/* ry resize handle (bottom) */}
              <circle
                cx={win.cx} cy={win.cy + win.ry} r={6}
                fill="rgba(255,255,80,0.9)" stroke="rgba(0,0,0,0.4)" strokeWidth={1}
                onMouseDown={(e) => startWinDrag('ry', e)}
                style={{ cursor: 'ns-resize' }}
              />
            </g>
          )}
        </PoolTable>
      </div>

      {/* ── Bottom controls ───────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', width: '100%' }}>

        <ControlPanel title="Cue Strike">
          <SelectRow label="Vertical"
            value={cue.vertical} options={['center', 'follow', 'draw']}
            onChange={v => setCue(c => ({ ...c, vertical: v as CueStrike['vertical'] }))} />
          <SelectRow label="Horizontal"
            value={cue.horizontal} options={['center', 'left', 'right']}
            onChange={v => setCue(c => ({ ...c, horizontal: v as CueStrike['horizontal'] }))} />
          <SelectRow label="Power"
            value={cue.power} options={['soft', 'medium', 'firm']}
            onChange={v => setCue(c => ({ ...c, power: v as CueStrike['power'] }))} />
        </ControlPanel>

        <ControlPanel title="Evaluation">
          <SelectRow label="Rank"
            value={evaluation.rank} options={['best', 'acceptable', 'bad']}
            onChange={v => setEvaluation(e => ({ ...e, rank: v as Evaluation['rank'] }))} />
          <SelectRow label="Difficulty"
            value={String(evaluation.difficulty)} options={['1', '2', '3', '4', '5']}
            onChange={v => setEvaluation(e => ({ ...e, difficulty: +v }))} />
          <SelectRow label="Margin"
            value={evaluation.margin} options={['large', 'medium', 'small']}
            onChange={v => setEvaluation(e => ({ ...e, margin: v as Evaluation['margin'] }))} />
        </ControlPanel>

        <ControlPanel title="Risk Tags">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, maxWidth: 320 }}>
            {RISK_OPTIONS.map(r => (
              <TagToggle key={r} label={r} active={evaluation.risks.includes(r)}
                onToggle={() => setEvaluation(ev => ({
                  ...ev,
                  risks: ev.risks.includes(r)
                    ? ev.risks.filter(x => x !== r)
                    : [...ev.risks, r],
                }))}
              />
            ))}
          </div>
        </ControlPanel>

        <ControlPanel title="Status">
          <div style={{ fontSize: 12, color: '#8b949e', lineHeight: 2 }}>
            <div>Ball 1 pocket: <Badge label={pocketBall1 ?? 'not set'} set={!!pocketBall1} /></div>
            <div>8-ball pocket: <Badge label={pocketBall8 ?? 'not set'} set={!!pocketBall8} /></div>
            <div>Route points: <Badge label={String(route.length > 0 ? route.length : routeInProgress.length)} set={route.length > 0} /></div>
            <div>Window: <Badge label={win ? `${Math.round(win.rx)}×${Math.round(win.ry)}` : 'none'} set={!!win} /></div>
          </div>
        </ControlPanel>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ModeBar({ mode, pocketBall1, pocketBall8, setMode }: {
  mode: BIHMode;
  pocketBall1: PocketId | null;
  pocketBall8: PocketId | null;
  setMode: (m: BIHMode) => void;
}) {
  const items: { m: BIHMode; label: string }[] = [
    { m: 'move',      label: 'Move' },
    { m: 'select-p1', label: `Pocket: Ball 1${pocketBall1 ? ` (${pocketBall1})` : ''}` },
    { m: 'select-p8', label: `Pocket: 8-ball${pocketBall8 ? ` (${pocketBall8})` : ''}` },
    { m: 'draw-route',  label: 'Draw Route' },
    { m: 'draw-window', label: 'Draw Window' },
  ];
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 2,
      background: '#0d1117', borderRadius: 8, padding: 3,
      border: '1px solid #21262d',
    }}>
      {items.map(({ m, label }) => (
        <button key={m} onClick={() => setMode(m)} style={{
          padding: '4px 12px', borderRadius: 5, fontSize: 11, fontWeight: 600,
          border: 'none', cursor: 'pointer', transition: 'all 0.12s',
          background: mode === m ? '#1e4a6e' : 'transparent',
          color: mode === m ? '#fff' : '#6e7681',
          whiteSpace: 'nowrap',
        }}>
          {label}
        </button>
      ))}
    </div>
  );
}

function ControlPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      padding: '10px 14px', background: '#161b22',
      borderRadius: 10, border: '1px solid #21262d',
      display: 'flex', flexDirection: 'column', gap: 6, flex: '0 0 auto',
    }}>
      <div style={{ fontSize: 10, color: '#484f58', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function SelectRow({ label, value, options, onChange }: {
  label: string; value: string; options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 11, color: '#8b949e', minWidth: 70 }}>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} style={{
        background: '#0d1117', color: '#e6edf3', border: '1px solid #30363d',
        borderRadius: 5, padding: '2px 6px', fontSize: 11, cursor: 'pointer',
      }}>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function TagToggle({ label, active, onToggle }: { label: string; active: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} style={{
      padding: '3px 8px', borderRadius: 4, fontSize: 10, fontWeight: 500,
      cursor: 'pointer', border: `1px solid ${active ? '#4a9fd4' : '#30363d'}`,
      background: active ? 'rgba(74,159,212,0.2)' : 'transparent',
      color: active ? '#4a9fd4' : '#6e7681', transition: 'all 0.1s',
    }}>
      {label}
    </button>
  );
}

function Badge({ label, set }: { label: string; set: boolean }) {
  return (
    <span style={{ color: set ? '#58a6ff' : '#484f58', fontWeight: 600 }}>{label}</span>
  );
}

function GhostBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500,
      border: '1px solid #30363d', background: 'transparent', color: '#8b949e', cursor: 'pointer',
    }}>
      {children}
    </button>
  );
}

function PrimaryBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: '5px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600,
      border: 'none', background: 'linear-gradient(135deg,#1e4a6e,#2980b9)',
      color: '#fff', cursor: 'pointer',
    }}>
      {children}
    </button>
  );
}
