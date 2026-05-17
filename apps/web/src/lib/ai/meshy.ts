import 'server-only';

/**
 * Minimal Meshy API client for text-to-3D and image-to-3D generation.
 * Docs: https://docs.meshy.ai/
 *
 * Pricing (approx, subject to change):
 *   - text-to-3D preview: 5 Meshy credits (~$0.10)
 *   - text-to-3D refine:  10 Meshy credits (~$0.20)
 *   - rig + animation:    bundled in Meshy Pro plan
 *
 * Endpoints used here:
 *   POST /openapi/v2/text-to-3d                  → start generation, returns task id
 *   GET  /openapi/v2/text-to-3d/{id}             → poll status
 *   POST /openapi/v2/image-to-3d                 → start gen from image URL
 *   POST /openapi/v1/rigging                     → request humanoid rig + animation library
 *
 * The poll loop is intentionally short here (≤90s default Vercel function budget).
 * For full rig+animation pipelines we should switch to webhooks or a background
 * job queue — see RESEARCH.md.
 */

const MESHY_BASE = 'https://api.meshy.ai';

function authHeader(): Record<string, string> {
  const key = process.env.MESHY_API_KEY;
  if (!key) {
    throw new Error('MESHY_API_KEY is not set. Add it to apps/web/.env.local');
  }
  return { Authorization: `Bearer ${key}` };
}

type MeshyTextToModelArgs = {
  prompt: string;
  artStyle?: 'realistic' | 'sculpture' | 'cartoon' | 'low-poly';
  negativePrompt?: string;
  /** "preview" is faster + cheaper, no PBR. "refine" upgrades a preview to PBR. */
  mode?: 'preview' | 'refine';
  /** Existing preview task id when mode=refine */
  previewTaskId?: string;
};

type MeshyTaskStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'EXPIRED';

type MeshyTask = {
  id: string;
  status: MeshyTaskStatus;
  progress: number;
  model_urls?: { glb?: string; fbx?: string; usdz?: string };
  thumbnail_url?: string;
  error?: { message: string };
};

export async function startTextToModel(args: MeshyTextToModelArgs): Promise<string> {
  const res = await fetch(`${MESHY_BASE}/openapi/v2/text-to-3d`, {
    method: 'POST',
    headers: { ...authHeader(), 'content-type': 'application/json' },
    body: JSON.stringify({
      mode: args.mode ?? 'preview',
      prompt: args.prompt,
      art_style: args.artStyle ?? 'cartoon',
      negative_prompt: args.negativePrompt,
      preview_task_id: args.previewTaskId,
    }),
  });
  if (!res.ok) throw new Error(`Meshy text-to-3d start failed: ${res.status}`);
  const json = (await res.json()) as { result: string };
  return json.result;
}

async function getTask(taskId: string): Promise<MeshyTask> {
  const res = await fetch(`${MESHY_BASE}/openapi/v2/text-to-3d/${taskId}`, {
    headers: authHeader(),
  });
  if (!res.ok) throw new Error(`Meshy task fetch failed: ${res.status}`);
  return (await res.json()) as MeshyTask;
}

/** Polls until SUCCEEDED/FAILED or timeoutMs. Returns the final task. */
export async function waitForTask(
  taskId: string,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<MeshyTask> {
  const timeout = opts.timeoutMs ?? 80_000;
  const interval = opts.intervalMs ?? 4_000;
  const started = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const t = await getTask(taskId);
    if (t.status === 'SUCCEEDED' || t.status === 'FAILED' || t.status === 'EXPIRED') {
      return t;
    }
    if (Date.now() - started > timeout) {
      // Caller can keep polling client-side via getTask
      return t;
    }
    await new Promise((r) => setTimeout(r, interval));
  }
}

export async function downloadGlb(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download GLB: ${res.status}`);
  const arr = await res.arrayBuffer();
  return Buffer.from(arr);
}
