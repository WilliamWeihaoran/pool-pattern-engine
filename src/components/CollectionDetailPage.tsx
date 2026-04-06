'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Nav from './Nav';
import PoolTable from './PoolTable';
import { getCollections, getLayouts, Collection, Layout } from '@/src/lib/collectionsStore';
import { TABLE_WIDTH, TABLE_HEIGHT, BALL_R } from '@/src/lib/constants';

// ── Constants ─────────────────────────────────────────────────────────────────

const CARD_SCALE = 0.20; // thumbnail in layout gallery card

// ── LayoutCard ────────────────────────────────────────────────────────────────

function LayoutCard({ layout }: { layout: Layout }) {
  // Show stage 0 of route 0 as the thumbnail (the initial layout)
  const previewStage = layout.routes[0]?.stages[0];
  const tw = TABLE_WIDTH  * CARD_SCALE;
  const th = TABLE_HEIGHT * CARD_SCALE;
  const svgRef = { current: null };

  return (
    <Link href={`/layouts/${layout.id}`} style={{ textDecoration: 'none' }}>
      <div style={{
        background: '#161b22', border: '1px solid #21262d', borderRadius: 10,
        overflow: 'hidden', cursor: 'pointer',
        transition: 'border-color 0.15s, transform 0.15s',
        width: tw + 24,
      }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = '#4a9fd4')}
        onMouseLeave={e => (e.currentTarget.style.borderColor = '#21262d')}
      >
        {/* Table thumbnail */}
        <div style={{ width: tw, height: th, overflow: 'hidden', margin: 12 }}>
          {previewStage ? (
            <div style={{ transform: `scale(${CARD_SCALE})`, transformOrigin: 'top left', width: TABLE_WIDTH, height: TABLE_HEIGHT }}>
              <PoolTable
                svgRef={svgRef as React.RefObject<SVGSVGElement | null>}
                balls={previewStage.tableBalls}
                ghostBalls={[]}
                shotLines={[]}
                onBallDragStart={() => {}}
              />
            </div>
          ) : (
            <div style={{ width: tw, height: th, background: '#0d1117', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 10, color: '#30363d' }}>No preview</span>
            </div>
          )}
        </div>

        {/* Info */}
        <div style={{ padding: '0 12px 12px' }}>
          <div style={{ color: '#e6edf3', fontSize: 13, fontWeight: 600, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {layout.name}
          </div>
          <div style={{ color: '#484f58', fontSize: 11 }}>
            {layout.routes.length} route{layout.routes.length !== 1 ? 's' : ''} ·{' '}
            {layout.routes.reduce((s, r) => s + r.stages.length, 0)} stages
          </div>
        </div>
      </div>
    </Link>
  );
}

// ── CollectionDetailPage ──────────────────────────────────────────────────────

export default function CollectionDetailPage({ id }: { id: string }) {
  const [collection, setCollection] = useState<Collection | null>(null);
  const [layouts, setLayouts]       = useState<Layout[]>([]);

  useEffect(() => {
    const cs = getCollections();
    const c  = cs.find(x => x.id === id);
    setCollection(c ?? null);
    if (c) {
      const all = getLayouts();
      setLayouts(all.filter(l => c.layoutIds.includes(l.id)));
    }
  }, [id]);

  if (!collection) {
    return (
      <div style={{ minHeight: '100vh', background: '#0d1117', display: 'flex', flexDirection: 'column' }}>
        <Nav />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color: '#484f58' }}>Collection not found.</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0d1117', display: 'flex', flexDirection: 'column' }}>
      <Nav />
      <main style={{ flex: 1, padding: '28px 32px', maxWidth: 1200, margin: '0 auto', width: '100%' }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <Link href="/collections" style={{ color: '#484f58', fontSize: 12, textDecoration: 'none' }}>
            ← All Collections
          </Link>
          <h1 style={{ color: '#e6edf3', fontSize: 22, fontWeight: 700, margin: '8px 0 2px' }}>
            {collection.name}
          </h1>
          <p style={{ color: '#484f58', fontSize: 12, margin: 0 }}>
            by {collection.owner} · {layouts.length} layout{layouts.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Layout gallery */}
        {layouts.length === 0 ? (
          <div style={{ color: '#484f58', fontSize: 13 }}>
            No layouts in this collection yet.{' '}
            <Link href="/collections" style={{ color: '#58a6ff' }}>Add some from the collections page.</Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
            {layouts.map(l => <LayoutCard key={l.id} layout={l} />)}
          </div>
        )}

      </main>
    </div>
  );
}
