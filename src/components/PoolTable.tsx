'use client';

import { RefObject } from 'react';
import Ball from './Ball';
import { Ball as BallType, ShotLine, GhostBall, DrawPreview } from '@/src/lib/types';
import { TABLE_WIDTH, TABLE_HEIGHT, RAIL, BALL_R, POCKET_CC, POCKET_SM } from '@/src/lib/constants';

// ─── Derived geometry ─────────────────────────────────────────────────────────
const TW = TABLE_WIDTH;
const TH = TABLE_HEIGHT;
const L  = RAIL;
const R  = TW - RAIL;
const T  = RAIL;
const B  = TH - RAIL;
const MX = TW / 2;
const CC = POCKET_CC;
const SM = POCKET_SM;

const INNER_W = TW - 2 * RAIL;
const INNER_H = TH - 2 * RAIL;

// ─── Felt path with semicircular pocket openings ──────────────────────────────
//
// Corner pockets: arc centered at the corner point (L/R, T/B), radius=CC.
//   sweep=0 (CCW) → arc bows INTO the table (concave from rail side).
//
// Side pockets: arc centered at (MX, T) or (MX, B), radius=SM.
//   Top: sweep=1 (CW) from left-lip to right-lip → bows UP into rail (opens pocket there).
//   Bottom: sweep=1 (CW) from right-lip to left-lip → bows DOWN into bottom rail.
//
const FELT_D = [
  `M ${L + CC} ${T}`,
  `L ${MX - SM} ${T}`,
  `A ${SM} ${SM} 0 0 0 ${MX + SM} ${T}`,            // top side pocket → dips INTO table (pocket opens toward table)
  `L ${R - CC} ${T}`,
  `A ${CC} ${CC} 0 0 0 ${R} ${T + CC}`,              // top-right corner → into table
  `L ${R} ${B - CC}`,
  `A ${CC} ${CC} 0 0 0 ${R - CC} ${B}`,              // bottom-right corner → into table
  `L ${MX + SM} ${B}`,
  `A ${SM} ${SM} 0 0 0 ${MX - SM} ${B}`,            // bottom side pocket → dips INTO table (pocket opens toward table)
  `L ${L + CC} ${B}`,
  `A ${CC} ${CC} 0 0 0 ${L} ${B - CC}`,              // bottom-left corner → into table
  `L ${L} ${T + CC}`,
  `A ${CC} ${CC} 0 0 0 ${L + CC} ${T}`,              // top-left corner closing arc → into table
  `Z`,
].join(' ');

// ─── Jaw highlight — traces the pocket mouths ─────────────────────────────────
const JAW_D = [
  `M ${L + CC} ${T}   A ${CC} ${CC} 0 0 1 ${L} ${T + CC}`,   // top-left: reversed direction → flip sweep to match felt
  `M ${R - CC} ${T}   A ${CC} ${CC} 0 0 0 ${R} ${T + CC}`,
  `M ${R} ${B - CC}   A ${CC} ${CC} 0 0 0 ${R - CC} ${B}`,
  `M ${L} ${B - CC}   A ${CC} ${CC} 0 0 1 ${L + CC} ${B}`,   // bottom-left: reversed direction → flip sweep to match felt
  `M ${MX - SM} ${T}  A ${SM} ${SM} 0 0 0 ${MX + SM} ${T}`,  // top side pocket → matches new felt sweep
  `M ${MX + SM} ${B}  A ${SM} ${SM} 0 0 0 ${MX - SM} ${B}`,  // bottom side pocket → matches new felt sweep
].join(' ');

// ─── Diamond & grid positions ─────────────────────────────────────────────────
const LONG_X  = [1, 2, 3, 5, 6, 7].map(i => L + (i * INNER_W) / 8);
const SHORT_Y = [1, 2, 3].map(i => T + (i * INNER_H) / 4);
const GRID_X  = [1, 2, 3, 4, 5, 6, 7].map(i => L + (i * INNER_W) / 8);
const HEAD_X  = L + (2 * INNER_W) / 8;
const FOOT_X  = L + (6 * INNER_W) / 8;
const SPOT_Y  = TH / 2;
const D_HALF  = 6;

// ─── Sub-components ───────────────────────────────────────────────────────────

function Diamond({ cx, cy, axis }: { cx: number; cy: number; axis: 'h' | 'v' }) {
  const pts =
    axis === 'h'
      ? `${cx - D_HALF},${cy} ${cx},${cy - D_HALF} ${cx + D_HALF},${cy} ${cx},${cy + D_HALF}`
      : `${cx},${cy - D_HALF} ${cx + D_HALF},${cy} ${cx},${cy + D_HALF} ${cx - D_HALF},${cy}`;
  return <polygon points={pts} fill="#d4b483" stroke="#a07840" strokeWidth={0.5} />;
}

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  svgRef: RefObject<SVGSVGElement | null>;
  balls: BallType[];
  ghostBalls?: GhostBall[];
  shotLines?: ShotLine[];
  drawPreview?: DrawPreview;
  onBallDragStart: (id: string, clientX: number, clientY: number) => void;
  onGhostDragStart?: (id: string, clientX: number, clientY: number) => void;
  onGhostDoubleClick?: (id: string) => void;
  onSvgMouseDown?: (svgX: number, svgY: number) => void;
  onSvgClick?: (svgX: number, svgY: number) => void;
  onSvgDoubleClick?: (svgX: number, svgY: number) => void;
  onShotLineClick?: (id: string) => void;
  selectedBallId?: string | null;
  selectedLineId?: string | null;
  children?: React.ReactNode;
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function PoolTable({
  svgRef,
  balls,
  ghostBalls = [],
  shotLines = [],
  drawPreview = null,
  onBallDragStart,
  onGhostDragStart,
  onGhostDoubleClick,
  onSvgMouseDown,
  onSvgClick,
  onSvgDoubleClick,
  onShotLineClick,
  selectedBallId,
  selectedLineId,
  children,
}: Props) {
  const topRailCY    = RAIL / 2;
  const bottomRailCY = TH - RAIL / 2;
  const leftRailCX   = RAIL / 2;
  const rightRailCX  = TW - RAIL / 2;

  function handleMouseDown(e: React.MouseEvent<SVGSVGElement>) {
    if (!onSvgMouseDown) return;
    const rect = e.currentTarget.getBoundingClientRect();
    onSvgMouseDown(e.clientX - rect.left, e.clientY - rect.top);
  }

  function handleClick(e: React.MouseEvent<SVGSVGElement>) {
    if (!onSvgClick) return;
    if (e.detail >= 2) return; // part of a double-click — let onDoubleClick handle it
    const rect = e.currentTarget.getBoundingClientRect();
    onSvgClick(e.clientX - rect.left, e.clientY - rect.top);
  }

  function handleDoubleClick(e: React.MouseEvent<SVGSVGElement>) {
    if (!onSvgDoubleClick) return;
    const rect = e.currentTarget.getBoundingClientRect();
    onSvgDoubleClick(e.clientX - rect.left, e.clientY - rect.top);
  }

  const allLines = [...shotLines, ...(drawPreview ? [{
    id: 'preview',
    x1: drawPreview.x1, y1: drawPreview.y1,
    x2: drawPreview.x2, y2: drawPreview.y2,
    color: drawPreview.color,
    isPreview: true,
    snapType: drawPreview.snapType,
  }] : [])];

  return (
    <svg
      ref={svgRef}
      width={TW}
      height={TH}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      style={{ userSelect: 'none', display: 'block' }}
    >
      <defs>
        {/*
          context-stroke: the arrow polygon inherits the line's stroke color.
          Supported in Chrome 79+, Firefox 86+, Safari 13.1+.
        */}
        <marker id="shot-arrow" markerWidth="9" markerHeight="8" refX="8" refY="4" orient="auto">
          <polygon points="0 0, 9 4, 0 8" fill="context-stroke" />
        </marker>
      </defs>

      {/* ── Rail (dark navy) ──────────────────────────────────────────── */}
      <rect width={TW} height={TH} fill="#1c2333" rx={10} />

      {/* ── Pocket bags — rendered UNDER the felt so arcs reveal them ─── */}

      {/* Corner leather rims */}
      <circle cx={L} cy={T} r={CC + 6} fill="#1a0f07" />
      <circle cx={R} cy={T} r={CC + 6} fill="#1a0f07" />
      <circle cx={L} cy={B} r={CC + 6} fill="#1a0f07" />
      <circle cx={R} cy={B} r={CC + 6} fill="#1a0f07" />
      {/* Corner hole */}
      <circle cx={L} cy={T} r={CC - 4} fill="#070707" />
      <circle cx={R} cy={T} r={CC - 4} fill="#070707" />
      <circle cx={L} cy={B} r={CC - 4} fill="#070707" />
      <circle cx={R} cy={B} r={CC - 4} fill="#070707" />

      {/* Side pocket leather rings */}
      <circle cx={MX} cy={T} r={SM + 4} fill="#1a0f07" />
      <circle cx={MX} cy={B} r={SM + 4} fill="#1a0f07" />
      {/* Side pocket holes */}
      <circle cx={MX} cy={T} r={SM - 3} fill="#070707" />
      <circle cx={MX} cy={B} r={SM - 3} fill="#070707" />

      {/* ── Felt (with cutouts) ───────────────────────────────────────── */}
      <path d={FELT_D} fill="#2980b9" />

      {/* ── Grid lines ────────────────────────────────────────────────── */}
      {GRID_X.map((gx, i) => (
        <line key={`gx${i}`} x1={gx} y1={T} x2={gx} y2={B}
          stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
      ))}
      {SHORT_Y.map((gy, i) => (
        <line key={`gy${i}`} x1={L} y1={gy} x2={R} y2={gy}
          stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
      ))}

      {/* ── Head & foot spots ─────────────────────────────────────────── */}
      <circle cx={HEAD_X} cy={SPOT_Y} r={3.5} fill="rgba(255,255,255,0.4)" />
      <circle cx={FOOT_X} cy={SPOT_Y} r={3.5} fill="rgba(255,255,255,0.4)" />

      {/* ── Jaw highlights ────────────────────────────────────────────── */}
      <path d={JAW_D} fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth={2.5} strokeLinecap="round" />

      {/* ── Diamonds ──────────────────────────────────────────────────── */}
      {LONG_X.map((dx, i)  => <Diamond key={`dt${i}`} cx={dx}        cy={topRailCY}    axis="h" />)}
      {LONG_X.map((dx, i)  => <Diamond key={`db${i}`} cx={dx}        cy={bottomRailCY} axis="h" />)}
      {SHORT_Y.map((dy, i) => <Diamond key={`dl${i}`} cx={leftRailCX}  cy={dy}          axis="v" />)}
      {SHORT_Y.map((dy, i) => <Diamond key={`dr${i}`} cx={rightRailCX} cy={dy}          axis="v" />)}

      {/* ── Ghost balls ───────────────────────────────────────────────── */}
      {/* White (no color): contact ghosts and CB-line rail endpoints      */}
      {/* Colored: OB-trajectory rail/pocket endpoint ghosts               */}
      {/* All are draggable in move mode; SVG handles them in draw mode.   */}
      {ghostBalls.map(g => (
        <circle
          key={g.id}
          cx={g.x} cy={g.y} r={BALL_R}
          fill="rgba(255,255,255,0.05)"
          stroke={g.color ?? 'rgba(255,255,255,0.6)'}
          strokeWidth={g.color ? 2 : 1.5}
          strokeDasharray={g.color ? undefined : '4 3'}
          style={{ cursor: onGhostDragStart ? 'grab' : 'default' }}
          onMouseDown={onGhostDragStart
            ? (e) => { e.preventDefault(); e.stopPropagation(); onGhostDragStart(g.id, e.clientX, e.clientY); }
            : undefined}
          onDoubleClick={onGhostDoubleClick
            ? (e) => { e.stopPropagation(); onGhostDoubleClick(g.id); }
            : undefined}
        />
      ))}

      {/* ── Shot lines + endpoint circles ─────────────────────────────── */}
      {allLines.map(line => {
        const isPreview  = 'isPreview' in line && line.isPreview;
        const snapType   = 'snapType' in line ? line.snapType : undefined;
        const isSelected = !isPreview && selectedLineId === line.id;
        const lineColor  = isSelected ? 'rgba(255,220,50,1)' : line.color;
        const lineOpacity = isPreview ? 0.6 : (('opacity' in line && line.opacity != null) ? line.opacity : 1);
        return (
          <g key={line.id} style={{ pointerEvents: isPreview ? 'none' : 'auto', opacity: lineOpacity }}>
            {/* Wide invisible hit target for easier clicking */}
            {!isPreview && onShotLineClick && (
              <line
                x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2}
                stroke="transparent" strokeWidth={12}
                style={{ cursor: 'pointer' }}
                onClick={(e) => { e.stopPropagation(); onShotLineClick(line.id); }}
              />
            )}
            <line
              x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2}
              stroke={lineColor}
              strokeWidth={isPreview ? 2 : isSelected ? 3 : 2.5}
              strokeDasharray="11 7"
              strokeLinecap="round"
              markerEnd="url(#shot-arrow)"
              style={{ pointerEvents: 'none' }}
            />
            {/* Start endpoint circle */}
            <circle cx={line.x1} cy={line.y1} r={BALL_R}
              fill="rgba(255,255,255,0.04)" stroke={lineColor}
              strokeWidth={isPreview ? 1.5 : 1.8} opacity={0.7}
              style={{ pointerEvents: 'none' }} />
            {/* End endpoint circle — dashed if snapping to rail */}
            <circle cx={line.x2} cy={line.y2} r={BALL_R}
              fill="rgba(255,255,255,0.04)" stroke={lineColor}
              strokeWidth={isPreview ? 1.5 : 1.8}
              opacity={0.7}
              strokeDasharray={snapType === 'rail' ? '4 3' : undefined}
              style={{ pointerEvents: 'none' }} />
          </g>
        );
      })}

      {/* ── Balls ─────────────────────────────────────────────────────── */}
      {balls.map(ball => (
        <Ball
          key={ball.id}
          ball={ball}
          onDragStart={onBallDragStart}
        />
      ))}

      {/* ── Selection ring ────────────────────────────────────────────── */}
      {selectedBallId && (() => {
        const sel = balls.find(b => b.id === selectedBallId);
        if (!sel) return null;
        return (
          <circle
            cx={sel.x} cy={sel.y} r={BALL_R + 5}
            fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth={2.5}
            style={{ pointerEvents: 'none' }}
          >
            <animate attributeName="r"       values={`${BALL_R + 4};${BALL_R + 8};${BALL_R + 4}`} dur="1.4s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.9;0.35;0.9"                                 dur="1.4s" repeatCount="indefinite" />
          </circle>
        );
      })()}

      {/* ── Overlay children ──────────────────────────────────────────── */}
      {children}
    </svg>
  );
}
