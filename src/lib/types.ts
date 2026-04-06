export type BallDefinition = {
  id: string;
  number: number;
  color: string;
  striped: boolean;
};

export type Ball = BallDefinition & {
  x: number;
  y: number;
  radius: number;
};

export type ShotLine = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  /** Ball whose center x1/y1 was drawn from */
  startBallId?: string;
  /** Contact ghost whose position x1/y1 was drawn from (CB trajectory) */
  startGhostId?: string;
  /** Override opacity for display (e.g. 0.25 for historical OB lines) */
  opacity?: number;
};

export type GhostBall = {
  id: string;
  x: number;
  y: number;
  /** OB color on OB-trajectory endpoint ghosts; undefined renders as white */
  color?: string;
  /** Shot line id whose x2/y2 this ghost controls */
  linkedLineId?: string;
  /** OB ball.id — contact ghosts orbit this ball at 2R when dragged */
  linkedBallId?: string;
};

export type DrawPreview = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  snapType: 'none' | 'ball' | 'rail';
} | null;
