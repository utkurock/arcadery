import 'server-only';
import { fal } from '@fal-ai/client';

/**
 * Image generation backend: fal.ai serving OpenAI's GPT Image 2.
 *
 * Endpoints:
 *   - text-to-image: `fal-ai/gpt-image-2`
 *   - image edit:    `openai/gpt-image-2/edit`
 *
 * Returns PNG `Buffer` so the rest of the pipeline (sharp slicer, Supabase
 * upload) keeps working unchanged. fal returns a URL, so we fetch + buffer.
 */

let configured = false;
function configureFal(): void {
  if (configured) return;
  const apiKey = process.env.FAL_KEY;
  if (!apiKey) {
    throw new Error('FAL_KEY is not set. Add it to apps/web/.env.local');
  }
  fal.config({ credentials: apiKey });
  configured = true;
}

export type ImageStyle = 'pixel-art' | 'cartoon' | '3d-render' | 'photorealistic' | 'hand-drawn' | 'none';

export const STYLE_SUFFIXES: Record<ImageStyle, string> = {
  'pixel-art':
    ', pixel art style, 16-bit retro game sprite, clean edges, transparent background',
  cartoon: ', cartoon style, bold outlines, flat colors, transparent background',
  '3d-render':
    ', 3D render, soft shading, game-ready asset, transparent background',
  photorealistic: ', photorealistic, studio lighting, transparent background',
  'hand-drawn': ', hand-drawn illustration, watercolor texture, transparent background',
  none: '',
};

export type ImageSize = '1024x1024' | '1024x1536' | '1536x1024';
export type ImageMode = 'single' | 'sheet' | 'animation';

const SHEET_PREFIX =
  'Multi-view sprite sheet arranged as a 3x2 grid showing the same subject from 6 angles: top row front, front three-quarter, side profile; bottom row back three-quarter, rear, top-down. Consistent silhouette and color across every cell, clear gaps between cells, solid neutral background. Subject: ';

const ANIMATION_PREFIX =
  '6-frame animation cycle arranged as a 3x2 grid (read left-to-right, top row first, then bottom row). Each cell shows the SAME character from the SAME side-view angle, identical proportions and color, only the pose changes to depict one full cycle of motion. Clean silhouette, transparent background, consistent lighting. Frames in order — frame 1 (rest pose, contact left foot forward), frame 2 (recoil, weight transferring), frame 3 (passing, mid-stride), frame 4 (high-point, opposite foot lifting), frame 5 (recoil opposite side), frame 6 (passing back to start). Subject performing the action: ';

function buildImagePrompt(
  prompt: string,
  style: ImageStyle,
  mode: ImageMode = 'single',
): string {
  const body = prompt.trim();
  const styled = `${body}${STYLE_SUFFIXES[style]}`;
  if (mode === 'sheet') return `${SHEET_PREFIX}${styled}`.slice(0, 4000);
  if (mode === 'animation') return `${ANIMATION_PREFIX}${styled}`.slice(0, 4000);
  return styled.slice(0, 4000);
}

function parseSize(size: ImageSize): { width: number; height: number } {
  const [w, h] = size.split('x').map(Number);
  return { width: w, height: h };
}

async function downloadAsBuffer(url: string, label: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download ${label} from ${url}: ${res.status}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

interface FalImageResult {
  data: { images: { url: string }[] };
}

/**
 * Generate an image with GPT Image 2 via fal.ai. Returns a PNG buffer.
 * For mode 'sheet' / 'animation' we pre-pend a layout-specific prompt.
 */
export async function generateImage(params: {
  prompt: string;
  style: ImageStyle;
  size: ImageSize;
  mode?: ImageMode;
}): Promise<Buffer> {
  configureFal();
  const mode = params.mode ?? 'single';
  const finalPrompt = buildImagePrompt(params.prompt, params.style, mode);

  const result = (await fal.subscribe('fal-ai/gpt-image-2', {
    input: {
      prompt: finalPrompt,
      image_size: parseSize(params.size),
      quality: 'high',
      num_images: 1,
      output_format: 'png',
    },
  })) as FalImageResult;

  const imageUrl = result.data?.images?.[0]?.url;
  if (!imageUrl) throw new Error('fal returned no image URL');
  return downloadAsBuffer(imageUrl, 'generated image');
}

/**
 * Edit an existing image. Takes the image's *public URL* (Supabase assets
 * bucket has public read enabled) so we don't have to round-trip bytes
 * through our server when fal can fetch directly.
 */
export async function editImage(params: {
  prompt: string;
  style: ImageStyle;
  imageUrl: string;
  size?: ImageSize;
}): Promise<Buffer> {
  configureFal();
  const finalPrompt = buildImagePrompt(params.prompt, params.style, 'single');

  const result = (await fal.subscribe('openai/gpt-image-2/edit', {
    input: {
      prompt: finalPrompt,
      image_urls: [params.imageUrl],
      quality: 'high',
      output_format: 'png',
      ...(params.size ? { image_size: parseSize(params.size) } : {}),
    },
  })) as FalImageResult;

  const editedUrl = result.data?.images?.[0]?.url;
  if (!editedUrl) throw new Error('fal returned no edited image URL');
  return downloadAsBuffer(editedUrl, 'edited image');
}
