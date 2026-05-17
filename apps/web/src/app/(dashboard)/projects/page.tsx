import { createClient } from '@/lib/supabase/server';
import { ProjectsClient, type Project } from './projects-client';

export const dynamic = 'force-dynamic';

export default async function ProjectsPage() {
  let projects: Project[] = [];
  let signedIn = false;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      signedIn = true;
      const { data, error } = await supabase
        .from('projects')
        .select('id, name, scene, created_at, updated_at')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });
      if (error) {
        console.error('[projects/page] supabase error:', error);
      } else {
        projects = (data as Project[]) ?? [];
      }
    }
  } catch (err) {
    console.error('[projects/page] fetch threw:', err);
  }

  return <ProjectsClient projects={projects} signedIn={signedIn} />;
}
