import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const MAX_ELEMENTS = 200;
const MAX_NAME = 80;

type PrefabRow = {
  id: string;
  name: string;
  engine: '2d' | '3d';
  data: unknown[];
};

/** GET /api/prefabs — list the signed-in user's saved components. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'auth_required' }, { status: 401 });
  }

  // RLS restricts rows to the owner.
  const { data, error } = await supabase
    .from('user_prefabs')
    .select('id, name, engine, data')
    .order('created_at', { ascending: false })
    .returns<PrefabRow[]>();
  if (error) {
    return NextResponse.json({ error: 'Failed to load components' }, { status: 500 });
  }

  const prefabs = (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    engine: r.engine,
    elements: Array.isArray(r.data) ? r.data : [],
  }));
  return NextResponse.json({ prefabs });
}

type Body = { name?: string; engine?: string; elements?: unknown };

/** POST /api/prefabs — save a selection as a reusable component. */
export async function POST(request: Request) {
  const rl = checkRateLimit('prefabs:create', clientIp(request), 30, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a moment.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'auth_required' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Body | null;
  const name = body?.name?.trim();
  const engine = body?.engine;
  const elements = body?.elements;

  if (!name || name.length > MAX_NAME) {
    return NextResponse.json({ error: 'Invalid name' }, { status: 400 });
  }
  if (engine !== '2d' && engine !== '3d') {
    return NextResponse.json({ error: 'Invalid engine' }, { status: 400 });
  }
  if (!Array.isArray(elements) || elements.length === 0 || elements.length > MAX_ELEMENTS) {
    return NextResponse.json({ error: 'Invalid elements' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('user_prefabs')
    .insert({ user_id: user.id, name, engine, data: elements })
    .select('id, name, engine, data')
    .single<PrefabRow>();
  if (error || !data) {
    return NextResponse.json({ error: 'Failed to save component' }, { status: 500 });
  }

  return NextResponse.json({
    prefab: {
      id: data.id,
      name: data.name,
      engine: data.engine,
      elements: Array.isArray(data.data) ? data.data : [],
    },
  });
}
