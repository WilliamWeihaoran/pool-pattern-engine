'use client';

import { BallDefinition } from '@/src/lib/types';
import Ball from './Ball';

const TRAY_R    = 16;
const TRAY_SIZE = TRAY_R * 2 + 8;

type Props = {
  balls: BallDefinition[];
  onTable: Set<string>;
  onDragStart: (id: string, clientX: number, clientY: number) => void;
};

export default function BallTray({ balls, onTable, onDragStart }: Props) {
  return (
    <div className="flex flex-row gap-1">
      {balls.map((def) => {
        const dimmed = onTable.has(def.id);
        const ball = { ...def, x: TRAY_SIZE / 2, y: TRAY_SIZE / 2, radius: TRAY_R };
        return (
          <div
            key={def.id}
            title={def.number === 0 ? 'Cue Ball' : `Ball ${def.number}`}
            style={{
              cursor: dimmed ? 'default' : 'grab',
              userSelect: 'none',
              opacity: dimmed ? 0.3 : 1,
              transition: 'opacity 0.15s',
            }}
            onMouseDown={
              dimmed
                ? undefined
                : (e) => { e.preventDefault(); onDragStart(def.id, e.clientX, e.clientY); }
            }
          >
            <svg width={TRAY_SIZE} height={TRAY_SIZE} style={{ display: 'block' }}>
              <Ball ball={ball} />
            </svg>
          </div>
        );
      })}
    </div>
  );
}
