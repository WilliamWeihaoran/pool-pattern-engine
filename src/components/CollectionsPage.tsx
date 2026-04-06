'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Nav from './Nav';
import {
  Collection, Layout,
  getCollections, getLayouts,
  createCollection, updateCollection, deleteCollection,
  deleteLayout,
  addLayoutToCollection, removeLayoutFromCollection,
} from '@/src/lib/collectionsStore';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Styles ────────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  background: '#0d1117', border: '1px solid #30363d', borderRadius: 6,
  padding: '6px 10px', fontSize: 12, color: '#e6edf3', outline: 'none',
  width: '100%', boxSizing: 'border-box',
};

function PrimaryBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
      border: '1px solid #1f6feb', background: '#1f6feb22',
      color: '#58a6ff', cursor: 'pointer',
    }}>
      {children}
    </button>
  );
}

function SmallBtn({ onClick, danger, children }: { onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: '3px 9px', borderRadius: 5, fontSize: 11, fontWeight: 500,
      border: `1px solid ${danger ? 'rgba(248,81,73,0.4)' : '#30363d'}`,
      background: 'transparent', color: danger ? '#f85149' : '#8b949e', cursor: 'pointer',
    }}>
      {children}
    </button>
  );
}

// ── New collection form ───────────────────────────────────────────────────────

function NewCollectionForm({ onDone }: { onDone: () => void }) {
  const [open, setOpen]   = useState(false);
  const [name, setName]   = useState('');
  const [owner, setOwner] = useState('');

  if (!open) return <PrimaryBtn onClick={() => setOpen(true)}>+ New Collection</PrimaryBtn>;

  function handleCreate() {
    if (!name.trim()) return;
    createCollection(name.trim(), owner.trim() || 'Unknown');
    setName(''); setOwner(''); setOpen(false);
    onDone();
  }

  return (
    <div style={{
      background: '#161b22', border: '1px solid #21262d', borderRadius: 10,
      padding: 16, display: 'flex', flexDirection: 'column', gap: 8, width: 280,
    }}>
      <span style={{ fontSize: 11, color: '#6e7681', fontWeight: 600 }}>New Collection</span>
      <input style={inputStyle} placeholder="Collection name" value={name}
        onChange={e => setName(e.target.value)} autoFocus
        onKeyDown={e => e.key === 'Enter' && handleCreate()} />
      <input style={inputStyle} placeholder="Owner" value={owner}
        onChange={e => setOwner(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleCreate()} />
      <div style={{ display: 'flex', gap: 6 }}>
        <PrimaryBtn onClick={handleCreate}>Create</PrimaryBtn>
        <SmallBtn onClick={() => setOpen(false)}>Cancel</SmallBtn>
      </div>
    </div>
  );
}

// ── Collection gallery card ───────────────────────────────────────────────────

function CollectionCard({
  collection, layouts, onDelete,
}: {
  collection: Collection;
  layouts: Layout[];
  onDelete: (id: string) => void;
}) {
  const collLayouts = layouts.filter(l => collection.layoutIds.includes(l.id));

  return (
    <div style={{
      background: '#161b22', border: '1px solid #21262d', borderRadius: 12,
      overflow: 'hidden', display: 'flex', flexDirection: 'column',
      width: 260,
      transition: 'border-color 0.15s',
    }}>
      {/* Colored top accent */}
      <div style={{ height: 4, background: 'linear-gradient(90deg, #1f6feb, #388bfd)' }} />

      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
        {/* Title + owner */}
        <div>
          <div style={{ color: '#e6edf3', fontWeight: 700, fontSize: 15 }}>{collection.name}</div>
          <div style={{ color: '#484f58', fontSize: 11, marginTop: 2 }}>by {collection.owner}</div>
        </div>

        {/* Layout count */}
        <div style={{ color: '#6e7681', fontSize: 12 }}>
          {collLayouts.length} layout{collLayouts.length !== 1 ? 's' : ''}
        </div>

        {/* Layout name list (up to 3) */}
        {collLayouts.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {collLayouts.slice(0, 3).map(l => (
              <div key={l.id} style={{
                fontSize: 11, color: '#8b949e',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                · {l.name}
              </div>
            ))}
            {collLayouts.length > 3 && (
              <div style={{ fontSize: 11, color: '#484f58' }}>+ {collLayouts.length - 3} more</div>
            )}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 8, borderTop: '1px solid #21262d' }}>
          <Link href={`/collections/${collection.id}`} style={{
            flex: 1, textAlign: 'center', padding: '5px 0', borderRadius: 6,
            fontSize: 12, fontWeight: 600,
            background: '#1f6feb22', border: '1px solid #1f6feb', color: '#58a6ff',
            textDecoration: 'none',
          }}>
            Open
          </Link>
          <SmallBtn danger onClick={() => onDelete(collection.id)}>Delete</SmallBtn>
        </div>
      </div>
    </div>
  );
}

// ── Layout list row ───────────────────────────────────────────────────────────

function LayoutRow({
  layout, collections, onDelete, onAddToCollection, onRemoveFromCollection,
}: {
  layout: Layout;
  collections: Collection[];
  onDelete: (id: string) => void;
  onAddToCollection: (collId: string, layoutId: string) => void;
  onRemoveFromCollection: (collId: string, layoutId: string) => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const containing = collections.filter(c => c.layoutIds.includes(layout.id));

  return (
    <div style={{
      background: '#161b22', border: '1px solid #21262d', borderRadius: 8,
      padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: '#e6edf3', fontSize: 13, fontWeight: 600 }}>{layout.name}</div>
        <div style={{ color: '#484f58', fontSize: 11, marginTop: 1 }}>
          {layout.routes.length}R / {layout.routes.reduce((s, r) => s + r.stages.length, 0)}S · {fmt(layout.updatedAt)}
        </div>
      </div>

      {/* Collection tags */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
        {containing.map(c => (
          <span key={c.id} style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            padding: '1px 6px', borderRadius: 4, fontSize: 10,
            background: 'rgba(74,159,212,0.1)', border: '1px solid rgba(74,159,212,0.25)', color: '#4a9fd4',
          }}>
            {c.name}
            <button onClick={() => onRemoveFromCollection(c.id, layout.id)} style={{
              background: 'none', border: 'none', color: '#4a9fd4', cursor: 'pointer', fontSize: 11, padding: 0,
            }}>×</button>
          </span>
        ))}
        {showAdd ? (
          <select
            autoFocus style={{
              background: '#0d1117', border: '1px solid #30363d', borderRadius: 5,
              padding: '2px 6px', fontSize: 11, color: '#e6edf3', cursor: 'pointer', outline: 'none',
            }}
            onChange={e => { if (e.target.value) onAddToCollection(e.target.value, layout.id); setShowAdd(false); }}
            onBlur={() => setShowAdd(false)}
          >
            <option value="">Add to…</option>
            {collections.filter(c => !c.layoutIds.includes(layout.id)).map(c =>
              <option key={c.id} value={c.id}>{c.name}</option>
            )}
          </select>
        ) : (
          <button onClick={() => setShowAdd(true)} style={{
            fontSize: 10, padding: '1px 6px', borderRadius: 4,
            background: 'transparent', border: '1px dashed #30363d', color: '#484f58', cursor: 'pointer',
          }}>+ Collection</button>
        )}
      </div>

      <Link href={`/layouts/${layout.id}`} style={{
        padding: '4px 10px', borderRadius: 5, fontSize: 11, fontWeight: 500,
        background: '#1e4a6e22', border: '1px solid #1e4a6e', color: '#58a6ff',
        textDecoration: 'none', whiteSpace: 'nowrap',
      }}>View</Link>
      <Link href={`/generate?layoutId=${layout.id}`} style={{
        padding: '4px 10px', borderRadius: 5, fontSize: 11, fontWeight: 500,
        background: 'transparent', border: '1px solid #30363d', color: '#8b949e',
        textDecoration: 'none', whiteSpace: 'nowrap',
      }}>Edit</Link>
      <SmallBtn danger onClick={() => onDelete(layout.id)}>×</SmallBtn>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CollectionsPage() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [layouts, setLayouts]         = useState<Layout[]>([]);
  const [tab, setTab]                 = useState<'collections' | 'layouts'>('collections');

  function reload() {
    setCollections(getCollections());
    setLayouts(getLayouts());
  }

  useEffect(() => { reload(); }, []);

  function handleDeleteCollection(id: string) {
    if (!confirm('Delete this collection? Layouts will not be deleted.')) return;
    deleteCollection(id); reload();
  }

  function handleRenameCollection(id: string, name: string) {
    const c = collections.find(x => x.id === id);
    if (!c) return;
    updateCollection({ ...c, name });
    reload();
  }

  function handleDeleteLayout(id: string) {
    if (!confirm('Delete this layout? This cannot be undone.')) return;
    deleteLayout(id); reload();
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0d1117', display: 'flex', flexDirection: 'column' }}>
      <Nav />
      <main style={{ flex: 1, padding: '28px 32px', maxWidth: 1100, margin: '0 auto', width: '100%' }}>

        {/* Page header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ color: '#e6edf3', fontSize: 20, fontWeight: 700, margin: 0 }}>Collections</h1>
          <p style={{ color: '#484f58', fontSize: 12, margin: '4px 0 0' }}>
            Group layouts into collections. Click a collection to browse its layouts and routes.
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #21262d', marginBottom: 24, paddingBottom: 12 }}>
          {(['collections', 'layouts'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 500,
              border: 'none', background: tab === t ? '#1e4a6e' : 'transparent',
              color: tab === t ? '#fff' : '#6e7681', cursor: 'pointer',
            }}>
              {t === 'collections' ? `Collections (${collections.length})` : `Layouts (${layouts.length})`}
            </button>
          ))}
        </div>

        {/* ── Collections gallery ──────────────────────────────────────────── */}
        {tab === 'collections' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <NewCollectionForm onDone={reload} />
            {collections.length === 0 && (
              <p style={{ color: '#484f58', fontSize: 13 }}>No collections yet. Create one above.</p>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              {collections.map(c => (
                <CollectionCard key={c.id} collection={c} layouts={layouts} onDelete={handleDeleteCollection} />
              ))}
            </div>
          </div>
        )}

        {/* ── Layouts list ─────────────────────────────────────────────────── */}
        {tab === 'layouts' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ color: '#484f58', fontSize: 12, margin: '0 0 8px' }}>
              Layouts are created from the <Link href="/generate" style={{ color: '#58a6ff' }}>Generate</Link> page.
            </p>
            {layouts.length === 0 && (
              <p style={{ color: '#484f58', fontSize: 13 }}>No layouts saved yet.</p>
            )}
            {layouts.map(l => (
              <LayoutRow
                key={l.id} layout={l} collections={collections}
                onDelete={handleDeleteLayout}
                onAddToCollection={(cid, lid) => { addLayoutToCollection(cid, lid); reload(); }}
                onRemoveFromCollection={(cid, lid) => { removeLayoutFromCollection(cid, lid); reload(); }}
              />
            ))}
          </div>
        )}

      </main>
    </div>
  );
}
