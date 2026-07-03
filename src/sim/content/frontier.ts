// The Frostreach Frontier, the always-on open PvP zone. Phase 1 skeleton data:
// teams and base layout only. Nodes, events, rares, and vendor stock land in
// later phases (docs/prd/frontier-pvp-honor.md sections 6 to 8; slices in
// docs/prd/FRONTIER_PHASE1_HANDOFF.md). Data-as-code: records only, no logic.
// The band constants (FRONTIER_X_MIN, FRONTIER_ORIGIN, half-extents) live in
// data.ts beside the arena/delve layout; this module must not import data.ts
// (data.ts merges content, never the other way around).

export type FrontierTeam = 'azure' | 'crimson';

// Team bases sit at opposite z ends of the playfield rectangle
// (FRONTIER_ORIGIN +- FRONTIER_HALF_H = z +-300), facing each other.
export const FRONTIER_BASES: Record<FrontierTeam, { x: number; z: number; facing: number }> = {
  azure: { x: 9200, z: -280, facing: Math.PI / 2 }, // south base, faces north
  crimson: { x: 9200, z: 280, facing: -Math.PI / 2 }, // north base, faces south
};
