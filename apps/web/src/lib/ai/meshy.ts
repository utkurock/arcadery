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
  /** Generate metallic/roughness/normal PBR maps during refine. */
  enablePbr?: boolean;
  /** Extra texturing guidance for the refine pass (max 600 chars). */
  texturePrompt?: string;
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
  const mode = args.mode ?? 'preview';
  // Refine mode only takes the preview task id + texturing options — sending
  // prompt/art_style on a refine request is rejected by Meshy.
  const body =
    mode === 'refine'
      ? {
          mode,
          preview_task_id: args.previewTaskId,
          enable_pbr: args.enablePbr ?? false,
          texture_prompt: args.texturePrompt,
        }
      : {
          mode,
          prompt: args.prompt,
          art_style: args.artStyle ?? 'cartoon',
          negative_prompt: args.negativePrompt,
        };
  const res = await fetch(`${MESHY_BASE}/openapi/v2/text-to-3d`, {
    method: 'POST',
    headers: { ...authHeader(), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Meshy text-to-3d start failed: ${res.status}`);
  const json = (await res.json()) as { result: string };
  return json.result;
}

/** Start a refine task that upgrades a completed preview to a textured PBR model. */
export async function startRefine(
  previewTaskId: string,
  opts: { enablePbr?: boolean; texturePrompt?: string } = {},
): Promise<string> {
  return startTextToModel({
    prompt: '',
    mode: 'refine',
    previewTaskId,
    enablePbr: opts.enablePbr,
    texturePrompt: opts.texturePrompt,
  });
}

export async function getTask(taskId: string): Promise<MeshyTask> {
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

// ─── Rigging (humanoid skeleton + basic animation library) ─────────────────
// POST /openapi/v1/rigging → { result: taskId }
// GET  /openapi/v1/rigging/{id} → status + result.rigged_character_glb_url +
//      result.basic_animations { walking_glb_url, running_glb_url, ... }

export type MeshyBasicAnimations = {
  walking_glb_url?: string;
  walking_fbx_url?: string;
  running_glb_url?: string;
  running_fbx_url?: string;
};

export type MeshyRiggingTask = {
  id: string;
  status: MeshyTaskStatus;
  progress: number;
  result?: {
    rigged_character_glb_url?: string;
    rigged_character_fbx_url?: string;
    basic_animations?: MeshyBasicAnimations;
  };
  error?: { message: string };
};

/**
 * Start a rigging task. Prefer `inputTaskId` (a completed text-to-3d task) so
 * Meshy rigs the source mesh directly; falls back to a public `modelUrl`.
 */
export async function startRigging(args: {
  inputTaskId?: string;
  modelUrl?: string;
  heightMeters?: number;
}): Promise<string> {
  if (!args.inputTaskId && !args.modelUrl) {
    throw new Error('startRigging needs inputTaskId or modelUrl');
  }
  const res = await fetch(`${MESHY_BASE}/openapi/v1/rigging`, {
    method: 'POST',
    headers: { ...authHeader(), 'content-type': 'application/json' },
    body: JSON.stringify({
      input_task_id: args.inputTaskId,
      model_url: args.modelUrl,
      height_meters: args.heightMeters ?? 1.7,
    }),
  });
  if (!res.ok) throw new Error(`Meshy rigging start failed: ${res.status}`);
  const json = (await res.json()) as { result: string };
  return json.result;
}

export async function getRiggingTask(taskId: string): Promise<MeshyRiggingTask> {
  const res = await fetch(`${MESHY_BASE}/openapi/v1/rigging/${taskId}`, {
    headers: authHeader(),
  });
  if (!res.ok) throw new Error(`Meshy rigging fetch failed: ${res.status}`);
  return (await res.json()) as MeshyRiggingTask;
}

/** Polls a rigging task until SUCCEEDED/FAILED/EXPIRED or timeoutMs. */
export async function waitForRiggingTask(
  taskId: string,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<MeshyRiggingTask> {
  const timeout = opts.timeoutMs ?? 120_000;
  const interval = opts.intervalMs ?? 5_000;
  const started = Date.now();

  for (;;) {
    const t = await getRiggingTask(taskId);
    if (t.status === 'SUCCEEDED' || t.status === 'FAILED' || t.status === 'EXPIRED') {
      return t;
    }
    if (Date.now() - started > timeout) return t;
    await new Promise((r) => setTimeout(r, interval));
  }
}
