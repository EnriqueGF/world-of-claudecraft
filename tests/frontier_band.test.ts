// Frostreach Frontier slice S1 (docs/prd/FRONTIER_PHASE1_HANDOFF.md): the
// frontier x-band, the delve band's new upper bound (gotcha G1), the playfield
// clamp in resolvePosition, and the persisted character fields
// (frontierTeam / honor / frontierReturnPos) with pre-frontier back-compat.

import { describe, expect, it } from 'vitest';
import { cameraOcclusion, resolvePosition } from '../src/sim/colliders';
import {
  ARENA_X_MIN,
  DELVE_BAND_X_MIN,
  FRONTIER_BASES,
  FRONTIER_HALF_H,
  FRONTIER_HALF_W,
  FRONTIER_ORIGIN,
  FRONTIER_X_MIN,
  isArenaPos,
  isDelvePos,
  isFrontierPos,
} from '../src/sim/data';
import { Sim } from '../src/sim/sim';

const SEED = 42;

describe('frontier band predicates', () => {
  it('arena / delve / frontier bands are mutually exclusive across [0, 12000]', () => {
    const overlaps: number[] = [];
    for (let x = 0; x <= 12000; x += 0.5) {
      const claims = [isArenaPos(x), isDelvePos(x), isFrontierPos(x)].filter(Boolean).length;
      if (claims > 1) overlaps.push(x);
    }
    expect(overlaps).toEqual([]);
  });

  it('each band claims its own edges (the delve band is bounded above now)', () => {
    expect(isArenaPos(ARENA_X_MIN)).toBe(true);
    expect(isArenaPos(DELVE_BAND_X_MIN)).toBe(false);
    expect(isDelvePos(DELVE_BAND_X_MIN)).toBe(true);
    // Gotcha G1: before this slice isDelvePos was open-ended along x, which
    // would have routed frontier positions into delve collision/respawn.
    expect(isDelvePos(FRONTIER_X_MIN - 0.5)).toBe(true);
    expect(isDelvePos(FRONTIER_X_MIN)).toBe(false);
    expect(isFrontierPos(FRONTIER_X_MIN)).toBe(true);
    expect(isFrontierPos(FRONTIER_X_MIN - 0.5)).toBe(false);
  });

  it('both team bases sit inside the playfield rectangle', () => {
    for (const base of Object.values(FRONTIER_BASES)) {
      expect(Math.abs(base.x - FRONTIER_ORIGIN.x)).toBeLessThan(FRONTIER_HALF_W);
      expect(Math.abs(base.z - FRONTIER_ORIGIN.z)).toBeLessThan(FRONTIER_HALF_H);
      expect(isFrontierPos(base.x)).toBe(true);
    }
  });
});

describe('frontier playfield clamp (resolvePosition)', () => {
  const r = 0.5;

  it('leaves an interior point untouched', () => {
    const p = resolvePosition(SEED, FRONTIER_ORIGIN.x, FRONTIER_ORIGIN.z, r);
    expect(p).toEqual({ x: FRONTIER_ORIGIN.x, z: FRONTIER_ORIGIN.z });
  });

  it('clamps movers back inside every playfield edge', () => {
    const east = resolvePosition(SEED, FRONTIER_ORIGIN.x + FRONTIER_HALF_W + 50, 0, r);
    expect(east.x).toBe(FRONTIER_ORIGIN.x + FRONTIER_HALF_W - r);
    // The west edge doubles as the band edge: a mover at the band start stays
    // in-band instead of sliding into the delve band.
    const west = resolvePosition(SEED, FRONTIER_X_MIN, 0, r);
    expect(west.x).toBe(FRONTIER_ORIGIN.x - FRONTIER_HALF_W + r);
    const north = resolvePosition(SEED, FRONTIER_ORIGIN.x, FRONTIER_HALF_H + 50, r);
    expect(north.z).toBe(FRONTIER_ORIGIN.z + FRONTIER_HALF_H - r);
    const south = resolvePosition(SEED, FRONTIER_ORIGIN.x, -FRONTIER_HALF_H - 50, r);
    expect(south.z).toBe(FRONTIER_ORIGIN.z - FRONTIER_HALF_H + r);
  });

  it('keeps both base positions resolvable in place (bases are not clamped)', () => {
    for (const base of Object.values(FRONTIER_BASES)) {
      expect(resolvePosition(SEED, base.x, base.z, r)).toEqual({ x: base.x, z: base.z });
    }
  });

  it('camera occlusion sweeps nothing in the open playfield (mirrors the region split)', () => {
    const occ = cameraOcclusion(
      SEED,
      FRONTIER_ORIGIN.x,
      2,
      FRONTIER_ORIGIN.z,
      FRONTIER_ORIGIN.x + 5,
      4,
      FRONTIER_ORIGIN.z - 6,
    );
    expect(occ).toBe(1);
  });
});

describe('frontier persisted state (serialize -> load round-trip)', () => {
  const makeWorld = () => new Sim({ seed: 7, playerClass: 'warrior', noPlayer: true });

  it('round-trips team, honor, and return pos deep-equal through a relog', () => {
    const sim = makeWorld();
    const pid = sim.addPlayer('warrior', 'Banner');
    const meta = sim.players.get(pid)!;
    meta.frontierTeam = 'azure';
    meta.honor = 123;
    meta.frontierReturnPos = { x: 10, z: -20 };

    const s1 = sim.serializeCharacter(pid)!;
    expect(s1.frontierTeam).toBe('azure');
    expect(s1.honor).toBe(123);
    expect(s1.frontierReturnPos).toEqual({ x: 10, z: -20 });

    const sim2 = makeWorld();
    const pid2 = sim2.addPlayer('warrior', 'Banner', { state: s1 });
    const meta2 = sim2.players.get(pid2)!;
    expect(meta2.frontierTeam).toBe('azure');
    expect(meta2.honor).toBe(123);
    expect(meta2.frontierReturnPos).toEqual({ x: 10, z: -20 });
    expect(sim2.serializeCharacter(pid2)).toEqual(s1);
  });

  it('a pre-frontier save (fields absent) loads with honor 0 and no team', () => {
    const sim = makeWorld();
    const pid = sim.addPlayer('warrior', 'Veteran');
    const s = sim.serializeCharacter(pid)!;
    // Simulate a save written before the frontier fields existed.
    delete s.frontierTeam;
    delete s.honor;
    delete s.frontierReturnPos;

    const sim2 = makeWorld();
    const pid2 = sim2.addPlayer('warrior', 'Veteran', { state: s });
    const meta2 = sim2.players.get(pid2)!;
    expect(meta2.honor).toBe(0);
    expect(meta2.frontierTeam).toBeUndefined();
    expect(meta2.frontierReturnPos).toBeUndefined();
  });

  it('a fresh character starts with honor 0 and no team assignment', () => {
    const sim = makeWorld();
    const pid = sim.addPlayer('warrior', 'Rookie');
    const s = sim.serializeCharacter(pid)!;
    expect(s.honor).toBe(0);
    expect(s.frontierTeam).toBeUndefined();
    expect(s.frontierReturnPos).toBeUndefined();
  });
});
