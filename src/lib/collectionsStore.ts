import type { Ball, GhostBall, ShotLine } from './types';

// ── Domain types ──────────────────────────────────────────────────────────────

export type Stage = {
  id: string;
  /** Snapshot of all balls on the table */
  tableBalls: Ball[];
  ghostBalls: GhostBall[];
  shotLines: ShotLine[];
  /** Cue strike parameters */
  cue: { hitX: number; hitY: number; power: number };
  /** Positional window ellipse, or null */
  win: { cx: number; cy: number; rx: number; ry: number; angle?: number } | null;
  /** BIH evaluation labels */
  evaluation: {
    rank: 'best' | 'acceptable' | 'bad';
    difficulty: number;  // 1–5
    margin: 'large' | 'medium' | 'small';
    risks: string[];
  };
};

/**
 * A Route is a complete sequence of stages (shots) for a given layout.
 * Each stage = one CB movement hitting one OB.
 */
export type Route = {
  id: string;
  name: string;
  stages: Stage[];
};

/**
 * A Layout is a named arrangement with one or more routes.
 */
export type Layout = {
  id: string;
  name: string;
  routes: Route[];
  createdAt: number;
  updatedAt: number;
};

/**
 * A Collection groups layouts under a name + owner.
 */
export type Collection = {
  id: string;
  name: string;
  owner: string;
  layoutIds: string[];
  createdAt: number;
};

// ── localStorage keys ─────────────────────────────────────────────────────────

const COLLECTIONS_KEY = 'ppe-collections';
const LAYOUTS_KEY     = 'ppe-layouts';

// ── Internal helpers ──────────────────────────────────────────────────────────

function loadCollections(): Collection[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(COLLECTIONS_KEY) || '[]'); }
  catch { return []; }
}

function saveCollections(cs: Collection[]) {
  localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(cs));
}

function loadLayouts(): Layout[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(LAYOUTS_KEY) || '[]'); }
  catch { return []; }
}

function saveLayouts(ls: Layout[]) {
  localStorage.setItem(LAYOUTS_KEY, JSON.stringify(ls));
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// ── Public API ────────────────────────────────────────────────────────────────

export function getCollections(): Collection[] { return loadCollections(); }
export function getLayouts(): Layout[]         { return loadLayouts(); }

export function getLayout(id: string): Layout | undefined {
  return loadLayouts().find(l => l.id === id);
}

export function createCollection(name: string, owner: string): Collection {
  const c: Collection = { id: uid(), name, owner, layoutIds: [], createdAt: Date.now() };
  saveCollections([...loadCollections(), c]);
  return c;
}

export function updateCollection(c: Collection) {
  saveCollections(loadCollections().map(x => x.id === c.id ? c : x));
}

export function deleteCollection(id: string) {
  saveCollections(loadCollections().filter(c => c.id !== id));
}

/** Create a new layout (not attached to any collection yet). */
export function createLayout(name: string, routes: Route[]): Layout {
  const l: Layout = { id: uid(), name, routes, createdAt: Date.now(), updatedAt: Date.now() };
  saveLayouts([...loadLayouts(), l]);
  return l;
}

/** Overwrite the routes of an existing layout and bump updatedAt. */
export function updateLayout(id: string, name: string, routes: Route[]) {
  saveLayouts(loadLayouts().map(l =>
    l.id === id ? { ...l, name, routes, updatedAt: Date.now() } : l
  ));
}

export function deleteLayout(id: string) {
  saveLayouts(loadLayouts().filter(l => l.id !== id));
  // Also remove from all collections
  saveCollections(loadCollections().map(c => ({
    ...c, layoutIds: c.layoutIds.filter(lid => lid !== id),
  })));
}

export function addLayoutToCollection(collectionId: string, layoutId: string) {
  saveCollections(loadCollections().map(c =>
    c.id === collectionId && !c.layoutIds.includes(layoutId)
      ? { ...c, layoutIds: [...c.layoutIds, layoutId] }
      : c
  ));
}

export function removeLayoutFromCollection(collectionId: string, layoutId: string) {
  saveCollections(loadCollections().map(c =>
    c.id === collectionId
      ? { ...c, layoutIds: c.layoutIds.filter(id => id !== layoutId) }
      : c
  ));
}
