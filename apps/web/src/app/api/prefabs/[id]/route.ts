import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/** DELETE /api/prefabs/[id] — remove one of the user's saved components. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'auth_required' }, { status: 401 });
  }

  // RLS ensures users can only delete their own prefabs.
  const { error } = await supabase.from('user_prefabs').delete().eq('id', id);
  if (error) {
    return NextResponse.json({ error: 'Failed to delete component' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
