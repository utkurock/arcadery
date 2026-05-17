import 'server-only';
import sharp from 'sharp';

type SliceLayout = {
  cols: number;
  rows: number;
};

type SliceResult = {
  master: { buffer: Buffer; width: number; height: number };
  frames: { index: number; buffer: Buffer; width: number; height: number }[];
};

/**
 * Slice a master sprite-sheet PNG into N equal-sized frames laid out on a
 * cols × rows grid (row-major: top-left → top-right → next row, …).
 *
 * Returns the original master plus per-frame PNG buffers. The master is left
 * untouched so callers can also keep it as the parent asset preview.
 */
export async function sliceSheet(
  masterPng: Buffer,
  layout: SliceLayout,
): Promise<SliceResult> {
  const { cols, rows } = layout;
  if (cols < 1 || rows < 1) throw new Error('Invalid slice layout');

  const meta = await sharp(masterPng).metadata();
  const { width, height } = meta;
  if (!width || !height) throw new Error('Could not read image dimensions');

  const frameW = Math.floor(width / cols);
  const frameH = Math.floor(height / rows);
  const frames: SliceResult['frames'] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const buffer = await sharp(masterPng)
        .extract({
          left: c * frameW,
          top: r * frameH,
          width: frameW,
          height: frameH,
        })
        .png()
        .toBuffer();
      frames.push({
        index: r * cols + c,
        buffer,
        width: frameW,
        height: frameH,
      });
    }
  }

  return {
    master: { buffer: masterPng, width, height },
    frames,
  };
}

export const SHEET_VIEW_NAMES = [
  'front',
  'front_3q',
  'side',
  'back_3q',
  'back',
  'top_down',
] as const;
