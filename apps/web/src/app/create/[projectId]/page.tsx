import type { Metadata } from 'next';
import { CreatePageClient } from './create-client';

export const metadata: Metadata = {
  title: 'Create - arcadery',
};

export default function CreatePage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ template?: string; fork?: string; prompt?: string }>;
}) {
  return <CreatePageClient params={params} searchParams={searchParams} />;
}
