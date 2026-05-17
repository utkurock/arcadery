import { createClient } from '@/lib/supabase/server';
import { TemplatesClient, type Template } from './templates-client';

// Fetch on the server so the browser receives a pre-populated HTML
// payload — bypasses any client-side network interference (extensions,
// CORS quirks, stale bundles, blocked Supabase domains).
export const dynamic = 'force-dynamic';

export default async function TemplatesPage() {
  let templates: Template[] = [];
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('templates')
      .select('id, name, description, category, thumbnail_url, created_at')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[templates/page] supabase error:', error);
    } else {
      templates = (data as Template[]) ?? [];
    }
  } catch (err) {
    console.error('[templates/page] fetch threw:', err);
  }

  return <TemplatesClient templates={templates} />;
}
