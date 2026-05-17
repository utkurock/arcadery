import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PlayClient } from '../../play/[slug]/play-client';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from('published_games')
    .select('name, creator_name')
    .eq('slug', slug)
    .single();

  if (!data) {
    return { title: 'Game Not Found' };
  }

  return {
    title: `${data.name} - arcadery`,
    description: `Play ${data.name} by ${data.creator_name}`,
    openGraph: {
      title: data.name,
      description: `Created by ${data.creator_name}`,
      type: 'website',
    },
  };
}

export default async function GamePage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();

  const [{ data: game }, { data: { user: viewer } }] = await Promise.all([
    supabase
      .from('published_games')
      .select(
        'id, slug, name, creator_name, user_id, scene, is_tokenized, token_mint, token_symbol, token_name, token_image_url, created_at',
      )
      .eq('slug', slug)
      .single(),
    supabase.auth.getUser(),
  ]);

  if (!game) {
    notFound();
  }

  return <PlayClient game={game} isOwner={viewer?.id === game.user_id} />;
}
