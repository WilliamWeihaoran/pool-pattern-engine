export const TABLE_WIDTH  = 1400;
export const TABLE_HEIGHT = 700;
export const RAIL         = 48;
export const BALL_R       = 14;

// Pocket geometry (derived here so PoolTable and snapUtils agree)
export const POCKET_CC = 32;  // corner pocket arm length along each rail
export const POCKET_SM = 38;  // side pocket half-mouth width

// Playable area — ball centers stay within these bounds
export const PLAY_LEFT   = RAIL + BALL_R;
export const PLAY_RIGHT  = TABLE_WIDTH  - RAIL - BALL_R;
export const PLAY_TOP    = RAIL + BALL_R;
export const PLAY_BOTTOM = TABLE_HEIGHT - RAIL - BALL_R;

export const MIN_BALL_DIST  = BALL_R * 2 + 0.5;
export const SNAP_BALL_DIST = 28;  // snap to ball center within this many px
export const SNAP_RAIL_DIST = 32;  // snap to rail when cursor is within this many px of play boundary
