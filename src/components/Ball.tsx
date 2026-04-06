'use client';

import { Ball as BallType } from '@/src/lib/types';

type Props = {
  ball: BallType;
  onDragStart?: (id: string, clientX: number, clientY: number) => void;
};

export default function Ball({ ball, onDragStart }: Props) {
  const { id, x, y, radius, color, number, striped } = ball;

  const stripeHW = Math.sqrt(radius * radius - (radius * 0.5) * (radius * 0.5));

  return (
    <g
      style={{ cursor: onDragStart ? 'grab' : 'default' }}
      onMouseDown={
        onDragStart
          ? (e) => { e.preventDefault(); e.stopPropagation(); onDragStart(id, e.clientX, e.clientY); }
          : undefined
      }
    >
      {/* Base */}
      <circle
        cx={x} cy={y} r={radius}
        fill={striped ? '#f5f5f5' : color}
        stroke="rgba(0,0,0,0.35)"
        strokeWidth={1}
      />

      {/* Stripe band */}
      {striped && (
        <rect
          x={x - stripeHW}
          y={y - radius * 0.5}
          width={stripeHW * 2}
          height={radius}
          fill={color}
        />
      )}

      {/* Number disc */}
      {number > 0 && (
        <circle cx={x} cy={y} r={radius * 0.5} fill="white" />
      )}

      {/* Number */}
      {number > 0 && (
        <text
          x={x} y={y}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={radius * 0.65}
          fontWeight="bold"
          fill="#1a1a1a"
          style={{ userSelect: 'none', pointerEvents: 'none' }}
        >
          {number}
        </text>
      )}
    </g>
  );
}
