'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Nav from './Nav';
import PoolTable from './PoolTable';
import Ball from './Ball';
import { getLayout, Layout, Route, Stage } from '@/src/lib/collectionsStore';
import { Ball as BallType, ShotLine } from '@/src/lib/types';
import { TABLE_WIDTH, TABLE_HEIGHT, BALL_R } from '@/src/lib/constants';

// ── Scale constants ───────────────────────────────────────────────────────────

const FULL_SCALE  = 0.55;   // large preview inside the detail page
const MINI_SCALE  = 0.18;   // stage thumbnail chips

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROUTE_COLORS = ['#58a6ff', '#3fb950', '#e3b341', '#f85149', '#bc8cff', '#79c0ff'];

function fmt(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Compute display shot lines and potted-ball list for a given stage k in a route */
function computeStageDisplay(route: Route, stageIdx: number) {
  const stage0    = route.stages[0];
  const stageK    = route.stages[stageIdx];
  const prevStage = stageIdx > 0 ? route.stages[stageIdx - 1] : null;

  if (!stageK) return { displayLines: [] as ShotLine[], pottedBalls: [] as BallType[] };

  const prevIds = new Set(prevStage?.shotLines.map(l => l.id) ?? []);

  const obLines: ShotLine[] = stageK.shotLines
    .filter(l => !l.startGhostId)
    .map(l => ({ ...l, opacity: 0.28 }));

  const cbLines: ShotLine[] = stageK.shotLines
    .filter(l => !!l.startGhostId && !prevIds.has(l.id));

  const pottedBalls: BallType[] = stage0
    ? stage0.tableBalls.filter(b => !stageK.tableBalls.some(tb => tb.id === b.id))
    : [];

  return { displayLines: [...obLines, ...cbLines], pottedBalls };
}

// ── MiniTable ─────────────────────────────────────────────────────────────────

function MiniTable({ stage, route, stageIdx, scale, onClick, active }: {
  stage: Stage;
  route: Route;
  stageIdx: number;
  scale: number;
  onClick?: () => void;
  active?: boolean;
}) {
  const { displayLines, pottedBalls } = computeStageDisplay(route, stageIdx);
  const svgRef = { current: null };
  const w = TABLE_WIDTH  * scale;
  const h = TABLE_HEIGHT * scale;
  const routeColor = ROUTE_COLORS[0]; // handled by caller

  return (
    <div
      onClick={onClick}
      style={{
        width: w, height: h, overflow: 'hidden', position: 'relative',
        borderRadius: 6,
        border: active ? `2px solid ${routeColor}` : '2px solid #30363d',
        cursor: onClick ? 'pointer' : 'default',
        flexShrink: 0,
        transition: 'border-color 0.15s',
      }}
    >
      <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: TABLE_WIDTH, height: TABLE_HEIGHT }}>
        <PoolTable
          svgRef={svgRef as React.RefObject<SVGSVGElement | null>}
          balls={stage.tableBalls}
          ghostBalls={stage.ghostBalls}
          shotLines={displayLines}
          onBallDragStart={() => {}}
        >
          {/* Potted ball overlays */}
          {pottedBalls.map(b => (
            <g key={`potted-${b.id}`} style={{ pointerEvents: 'none' }}>
              <circle cx={b.x} cy={b.y} r={BALL_R}
                fill="rgba(0,0,0,0.55)" stroke="rgba(255,255,255,0.18)"
                strokeWidth={1.5} strokeDasharray="3 3" />
              <circle cx={b.x} cy={b.y} r={BALL_R * 0.35}
                fill="rgba(255,255,255,0.12)" />
            </g>
          ))}
        </PoolTable>
      </div>
    </div>
  );
}

// ── LayoutDetailPage ──────────────────────────────────────────────────────────

export default function LayoutDetailPage({ id }: { id: string }) {
  const [layout, setLayout]           = useState<Layout | null>(null);
  const [activeRouteIdx, setActiveRouteIdx] = useState(0);
  const [activeStageIdx, setActiveStageIdx] = useState(0);

  useEffect(() => {
    const l = getLayout(id);
    setLayout(l ?? null);
  }, [id]);

  if (!layout) {
    return (
      <div style={{ minHeight: '100vh', background: '#0d1117', display: 'flex', flexDirection: 'column' }}>
        <Nav />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color: '#484f58' }}>Layout not found.</span>
        </div>
      </div>
    );
  }

  const activeRoute = layout.routes[activeRouteIdx];
  const activeStage = activeRoute?.stages[activeStageIdx];

  return (
    <div style={{ minHeight: '100vh', background: '#0d1117', display: 'flex', flexDirection: 'column' }}>
      <Nav />
      <main style={{ flex: 1, padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1200, margin: '0 auto', width: '100%' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Link href="/collections" style={{ color: '#484f58', fontSize: 12, textDecoration: 'none' }}>
                ← Collections
              </Link>
            </div>
            <h1 style={{ color: '#e6edf3', fontSize: 22, fontWeight: 700, margin: '6px 0 4px' }}>{layout.name}</h1>
            <p style={{ color: '#484f58', fontSize: 12, margin: 0 }}>
              {layout.routes.length} route{layout.routes.length !== 1 ? 's' : ''} ·{' '}
              {layout.routes.reduce((s, r) => s + r.stages.length, 0)} stages ·{' '}
              updated {fmt(layout.updatedAt)}
            </p>
          </div>
          <Link href={`/generate?layoutId=${layout.id}`} style={{
            padding: '7px 16px', borderRadius: 7, fontSize: 12, fontWeight: 600,
            background: 'linear-gradient(135deg, #1e4a6e, #2980b9)', color: '#fff',
            textDecoration: 'none',
          }}>
            Edit in Generator
          </Link>
        </div>

        {/* Route tabs */}
        <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid #21262d', paddingBottom: 12 }}>
          {layout.routes.map((route, rIdx) => {
            const color = ROUTE_COLORS[rIdx % ROUTE_COLORS.length];
            const isActive = rIdx === activeRouteIdx;
            return (
              <button
                key={route.id}
                onClick={() => { setActiveRouteIdx(rIdx); setActiveStageIdx(0); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                  border: `1px solid ${isActive ? color : '#30363d'}`,
                  background: isActive ? `${color}18` : 'transparent',
                  color: isActive ? color : '#6e7681',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, display: 'inline-block' }} />
                {route.name}
                <span style={{ fontSize: 10, color: isActive ? `${color}aa` : '#30363d' }}>
                  {route.stages.length} stage{route.stages.length !== 1 ? 's' : ''}
                </span>
              </button>
            );
          })}
        </div>

        {activeRoute ? (
          <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>

            {/* Left: large preview of active stage */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {activeStage ? (
                <>
                  <div style={{ fontSize: 11, color: '#6e7681' }}>
                    Stage {activeStageIdx}
                    {activeStageIdx === 0 && <span style={{ color: '#484f58' }}> — initial layout</span>}
                  </div>
                  <MiniTable
                    stage={activeStage} route={activeRoute}
                    stageIdx={activeStageIdx} scale={FULL_SCALE}
                  />
                </>
              ) : (
                <div style={{ color: '#484f58', fontSize: 13 }}>No stages in this route yet.</div>
              )}
            </div>

            {/* Right: stage strip */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 10, color: '#484f58', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                Stages
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {activeRoute.stages.map((stage, sIdx) => (
                  <div
                    key={stage.id}
                    onClick={() => setActiveStageIdx(sIdx)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
                  >
                    <div style={{
                      width: 22, height: 22, borderRadius: 4, fontSize: 11, fontWeight: 700,
                      border: `1px solid ${sIdx === activeStageIdx ? ROUTE_COLORS[activeRouteIdx % ROUTE_COLORS.length] : '#30363d'}`,
                      background: sIdx === activeStageIdx ? `${ROUTE_COLORS[activeRouteIdx % ROUTE_COLORS.length]}33` : '#0d1117',
                      color: sIdx === activeStageIdx ? ROUTE_COLORS[activeRouteIdx % ROUTE_COLORS.length] : '#484f58',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      {sIdx}
                    </div>
                    <MiniTable
                      stage={stage} route={activeRoute}
                      stageIdx={sIdx} scale={MINI_SCALE}
                      onClick={() => setActiveStageIdx(sIdx)}
                      active={sIdx === activeStageIdx}
                    />
                  </div>
                ))}
              </div>
            </div>

          </div>
        ) : (
          <div style={{ color: '#484f58', fontSize: 13 }}>No routes saved yet. Use the Generator to add routes.</div>
        )}

      </main>
    </div>
  );
}
