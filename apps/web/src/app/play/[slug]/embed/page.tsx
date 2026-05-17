import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { EmbedClient } from './embed-client';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ slug: string }>;
};

export default async function EmbedPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: game } = await supabase
    .from('published_games')
    .select('scene')
    .eq('slug', slug)
    .single();

  if (!game) {
    notFound();
  }

  return <EmbedClient scene={game.scene} />;
}
