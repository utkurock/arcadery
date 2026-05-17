import { z } from 'zod';
import { BaseElementSchema } from '../base-element';

// Sparse tile placement: [row, col, tileIndex]. We keep this as `z.array().length(3)`
// (not `z.tuple([...])`) on purpose — switching to a tuple changes the
// inferred type to `[number, number, number]`, which in turn forces immer's
// deeply-inferred WritableDraft to reference internal modules and breaks
// declaration-portable inference in the editor's zustand+immer+zundo stack.
// The schema is still validated at parse time; positional consumers (like
// the Phaser renderer) cast where they need a real tuple.
const TileEntrySchema = z.array(z.number().int()).length(3);

export const TilemapElementSchema = BaseElementSchema.extend({
  type: z.literal('tilemap'),
  assetPack: z.string().describe('Asset pack id, e.g. "desert-shooter"'),
  tileSize: z.number().int().min(8).max(128).describe('Pixel size of each tile (usually 16)'),
  gridCols: z.number().int().min(1).max(100).describe('Number of columns in the game grid (e.g. 20)'),
  gridRows: z.number().int().min(1).max(100).describe('Number of rows in the game grid (e.g. 15)'),
  renderSize: z.number().min(8).max(128).describe('Display size of each tile in pixels (e.g. 32)'),
  fill: z.number().int().min(-1).max(999).describe('Tile index to fill every cell with, -1 for empty (e.g. 2 for sand)'),
  tiles: z.array(TileEntrySchema).describe('Sparse tile overrides as [row,col,tileIndex] triples'),
});

export type TilemapElement = z.infer<typeof TilemapElementSchema>;
