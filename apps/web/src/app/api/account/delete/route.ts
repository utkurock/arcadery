import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  const admin = createAdminClient();

  // Best-effort: clean up the user's storage folder before deleting auth.
  // Storage objects don't auto-cascade with auth.users.
  try {
    const { data: files } = await admin.storage.from('assets').list(user.id, {
      limit: 1000,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (files && files.length > 0) {
      const subdirs = files.filter((f) => !f.id); // folders have no id
      for (const dir of subdirs) {
        const { data: nested } = await admin.storage
          .from('assets')
          .list(`${user.id}/${dir.name}`, { limit: 1000 });
        if (nested && nested.length > 0) {
          await admin.storage
            .from('assets')
            .remove(nested.map((n) => `${user.id}/${dir.name}/${n.name}`));
        }
      }
      const topFiles = files.filter((f) => f.id).map((f) => `${user.id}/${f.name}`);
      if (topFiles.length > 0) {
        await admin.storage.from('assets').remove(topFiles);
      }
    }
  } catch {
    // Don't block deletion on storage cleanup failures.
  }

  // Cascades to user_profiles, projects, assets, user_credits, credit_ledger,
  // credit_purchases, published_games — all FK their rows on auth.users(id).
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Clear the SSR cookie session on the response.
  await supabase.auth.signOut().catch(() => {});

  return NextResponse.json({ ok: true });
}
