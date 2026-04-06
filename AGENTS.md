<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Pool Pattern Engine — Project Overview

A billiards pattern/layout authoring tool. Users draw shot lines on a pool table SVG, then save layouts with multiple routes, each route being a sequence of stages.

## Architecture

### Core state model
- **`tableBalls`**: live ball positions on the SVG table
- **`ghostBalls`**: ghost ball overlays (contact ghosts, rail endpoint ghosts, CB numbered ghosts)
- **`shotLines`**: arrow lines drawn on the table. Key fields:
  - `startBallId` — ball the line starts from
  - `startGhostId` — set when line is a CB trajectory (starts from a contact ghost)
  - `opacity?` — overridden during stage view mode
- **`routes`** / **`stages`**: a Layout has multiple Routes; each Route has ordered Stages (snapshots)

### Stage view vs. live editing
- `activeStageIdx === null` → live editing (uses live `shotLines`, `ghostBalls`, `tableBalls`)
- `activeStageIdx !== null` → viewing a saved stage snapshot
  - OB lines shown at 0.28 opacity; CB trajectory line for that stage shown at full opacity
  - Potted balls overlaid with a dark circle + dashed stroke
- **Never auto-set `activeStageIdx` to non-null** — only on explicit user navigation (clicking stage chips)

### Ghost ball types
- **Contact ghost** (`linkedBallId` set): orbits an OB; marks the CB contact point. Double-click detaches from orbit (`detachGhostOrbit`) for free movement.
- **Rail endpoint ghost** (`linkedLineId` set, no `linkedBallId`): marks where a shot line hits the rail.
- **CB numbered ghost** (created on double-click of a CB endpoint ghost): represents the cue ball's new position after a shot, becomes a new table ball with `number` incremented.

### One-shot-line-per-ball rule
A ball may have at most one outgoing shot line (`startBallId`). CB trajectory lines (`startGhostId` set) are exempt.

## Key files
- `src/components/CombinedScene.tsx` — main scene: all UI, undo/redo, route/stage management, ellipse win zone
- `src/lib/useDrawLines.ts` — draw interaction hook (mouse events, ghost drag, snap)
- `src/lib/snapUtils.ts` — snap-to-ball / snap-to-rail logic
- `src/lib/collectionsStore.ts` — localStorage CRUD for Layouts, Routes, Stages, Collections
- `src/components/PoolTable.tsx` — SVG table renderer; accepts `shotLines` (with `opacity`) and renders ghost balls
- `src/components/CollectionsPage.tsx` — gallery of collections + layouts tab
- `src/components/CollectionDetailPage.tsx` — layout gallery for a single collection
- `src/components/LayoutDetailPage.tsx` — route tabs + stage strip + full layout view

## EllipseWin
`type EllipseWin = { cx, cy, rx, ry, angle?: number }` — angle is optional (defaults to 0) for backward compatibility with saved stages that lack it.

## Collections persistence
`localStorage` keys: `ppe-collections`, `ppe-layouts`. Stage snapshots include full `tableBalls`, `ghostBalls`, `shotLines`, `cue`, `win`, `evaluation`.
