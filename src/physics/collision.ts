/**
 * Collision categories. Riders are ghosts to each other: bikes and ragdolls only
 * collide with terrain, never with another rider.
 */
export const CAT = {
  TERRAIN: 0x0001,
  BIKE: 0x0002,
  RAGDOLL: 0x0004,
  PICKUP: 0x0008,
} as const;

export const MASK = {
  TERRAIN: CAT.BIKE | CAT.RAGDOLL,
  BIKE: CAT.TERRAIN,
  RAGDOLL: CAT.TERRAIN,
} as const;
