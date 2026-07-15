// No-magic-values + cadence guard for the overworld map painter.
//
// The painter's paintOverworld needs a real 2D context + getComputedStyle, so its
// draw is not exercised in this Node suite; the pure geometry it draws is covered
// by tests/map_window_view.test.ts. This guard pins the painter contract that a
// 2D context cannot express: zero literal colors (tokens resolved once per redraw
// via getComputedStyle, never per-marker), and the cached terrain background +
// mediumHud cadence preserved from the inline site.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MapWindowPainter } from '../src/ui/map_window_painter';
import type { OverworldMapModel } from '../src/ui/map_window_view';

const painter = readFileSync(new URL('../src/ui/map_window_painter.ts', import.meta.url), 'utf8');
// Drop comments so prose can't create a false positive (mirrors architecture.test).
const code = painter.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const hud = readFileSync(new URL('../src/ui/hud.ts', import.meta.url), 'utf8');
const tokens = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');

const MAP_COLOR_TOKENS = [
  '--color-map-label',
  '--color-map-outline',
  '--color-map-portal-dot',
  '--color-map-portal-label',
  '--color-map-npc-quest',
  '--color-map-player',
  '--color-map-ally-friend',
  '--color-map-ally-guild',
  '--color-map-party-dead',
  '--color-map-rock',
  '--color-map-tree',
  '--color-map-oak',
  '--color-map-building-outline',
  '--color-map-building-chapel',
  '--color-map-building-inn',
  '--color-map-building-house',
  '--color-map-well',
  '--color-map-stall',
  '--color-map-tent',
  '--color-map-mine',
  '--color-map-graveyard',
  '--color-map-mudhut',
  '--color-map-campfire',
];

describe('map_window_painter: no magic values', () => {
  it('carries no literal hex or rgb color in TS', () => {
    const hex = code.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    const rgb = code.match(/\brgba?\s*\(/g) ?? [];
    expect(hex, `hex colors: ${hex.join(', ')}`).toEqual([]);
    expect(rgb, `rgb colors: ${rgb.join(', ')}`).toEqual([]);
  });

  it('resolves --color-map-* tokens via getComputedStyle exactly once per redraw', () => {
    expect(code).toContain('getComputedStyle');
    expect(code).toContain('getPropertyValue');
    expect(code).toContain('--color-map-');
    expect(code).toContain('resolveColors');
    // One getComputedStyle call site total: resolved once per paint into a colors
    // object, never re-read inside a per-marker draw loop.
    expect(code.match(/getComputedStyle/g) ?? []).toHaveLength(1);
  });

  it('defines every map color token it reads in the design-token sheet', () => {
    for (const tok of MAP_COLOR_TOKENS) {
      expect(code, `painter never reads ${tok}`).toContain(tok);
      expect(tokens, `missing ${tok}`).toContain(`${tok}:`);
    }
  });

  it('caches the whole-world decorations once instead of regenerating per redraw', () => {
    expect(code).toContain('if (!this.decorations) this.decorations = generateDecorations(');
  });
});

describe('map_window_painter: cadence + cached background preserved', () => {
  it("still redraws from hud.update()'s mediumHud band behind the display guard", () => {
    expect(hud).toContain(
      "if ($('#map-window').style.display === 'block') this.updateMapWindow();",
    );
    expect(hud).toContain('this.mapPainter.paintOverworld(ctx, this.sim, {');
  });

  it('blits the Hud-owned cached terrain background rather than rebuilding it', () => {
    // The painter receives the cached bg and only drawImages it (no terrain build).
    expect(code).toContain('ctx.drawImage(');
    expect(code).not.toContain('paintTerrainRows');
    expect(code).not.toContain('renderTerrainCanvas');
    // Hud keeps the bg cache + prewarm and passes the cached canvas in each redraw.
    expect(hud).toContain('bg: this.mapZoneBg(zone)');
  });
});

describe('map_window_painter: party markers', () => {
  it('uses class color for live members, the dead token for dead members, and labels both', () => {
    const classCalls: string[] = [];
    const painter = new MapWindowPainter((cls) => {
      classCalls.push(cls);
      return `class-${cls}`;
    });
    const arcColors: string[] = [];
    const labels: { text: string; color: string }[] = [];
    let fillStyle = '';
    const ctx = {
      imageSmoothingEnabled: false,
      get fillStyle() {
        return fillStyle;
      },
      set fillStyle(value: string) {
        fillStyle = value;
      },
      strokeStyle: '',
      lineWidth: 0,
      font: '',
      textAlign: '',
      drawImage: () => {},
      beginPath: () => {},
      arc: () => arcColors.push(fillStyle),
      fill: () => {},
      stroke: () => {},
      strokeText: (text: string) => labels.push({ text, color: fillStyle }),
      fillText: () => {},
    } as unknown as CanvasRenderingContext2D;
    const model: OverworldMapModel = {
      view: { spanX: 1, spanZ: 1, minX: 0, maxX: 1, minZ: 0, maxZ: 1 },
      cursor: 'default',
      blit: { sxFrac: 0, syFrac: 0, swFrac: 1, shFrac: 1 },
      zoneId: 'eastbrook_vale',
      pois: [],
      portals: [],
      npcs: [],
      questAreas: [],
      player: null,
      allies: [
        { mx: 10, my: 10, name: 'LiveMage', kind: 'party', cls: 'mage', dead: false },
        { mx: 20, my: 20, name: 'DeadPriest', kind: 'party', cls: 'priest', dead: true },
        { mx: 30, my: 30, name: 'Friend', kind: 'friend' },
      ],
      detail: null,
      ping: null,
    };
    const colors = {
      allyFriend: 'friend',
      allyGuild: 'guild',
      partyDead: 'dead-party',
      outline: 'outline',
    } as Record<string, string>;
    const draw = (
      painter as unknown as {
        draw: (
          context: CanvasRenderingContext2D,
          map: OverworldMapModel,
          background: HTMLCanvasElement,
          canvasSize: number,
          mapColors: Record<string, string>,
        ) => void;
      }
    ).draw;

    draw.call(painter, ctx, model, { width: 1, height: 1 } as HTMLCanvasElement, 100, colors);

    expect(classCalls).toEqual(['mage']);
    expect(arcColors).toEqual(['class-mage', 'dead-party', 'friend']);
    expect(
      labels.filter((label) => ['LiveMage', 'DeadPriest', 'Friend'].includes(label.text)),
    ).toEqual([
      { text: 'LiveMage', color: 'class-mage' },
      { text: 'DeadPriest', color: 'dead-party' },
      { text: 'Friend', color: 'friend' },
    ]);
  });
});
