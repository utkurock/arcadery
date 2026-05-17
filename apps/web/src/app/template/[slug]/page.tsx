import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { staticSlug } from '@/lib/slugify';
import { PlayClient } from '../../play/[slug]/play-client';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ slug: string }>;
};

// Templates don't have their own slug column — there are <20 of them and they
// rarely change, so we fetch the lot and match in-process. Switch to a slug
// column + index if the catalog ever grows past a couple hundred entries.
async function findTemplateBySlug(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('templates')
    .select('id, name, scene, category');
  if (!data) return null;
  const row = (data as Array<{
    id: string;
    name: string;
    scene: unknown;
    category: string;
  }>).find((t) => staticSlug(t.name) === slug);
  return row ?? null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const template = await findTemplateBySlug(slug);

  if (!template) {
    return { title: 'Template Not Found' };
  }

  return {
    title: `${template.name} - arcadery`,
    description: `Play the official ${template.name} template`,
    openGraph: {
      title: template.name,
      description: 'Official Arcadery template',
      type: 'website',
    },
  };
}

export default async function TemplatePage({ params }: Props) {
  const { slug } = await params;
  const template = await findTemplateBySlug(slug);

  if (!template) {
    notFound();
  }

  const game = {
    id: template.id,
    slug: `template-${staticSlug(template.name)}`,
    name: template.name,
    creator_name: 'Arcadery',
    scene: template.scene,
    is_tokenized: false,
    token_mint: null,
    token_symbol: null,
    token_image_url: null,
  };

  return <PlayClient game={game} isOwner={false} />;
}
