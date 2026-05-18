import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

// Token panel data — fetches every published_games row that completed a
// Meteora DBC launch (is_tokenized = true). Sorted by launch date so the most
// recent ones are at the top. We deliberately limit columns to what the
// admin table needs; full row inspection happens via the /tokens/[slug]
// public page.

export interface AdminTokenRow {
  id: string;
  slug: string;
  name: string;
  token_name: string | null;
  token_symbol: string | null;
  token_mint: string | null;
  token_supply: number | null;
  token_image_url: string | null;
  token_creator_wallet: string | null;
  token_launched_at: string | null;
  bonding_curve_address: string | null;
  pool_config_address: string | null;
  creator_name: string;
  created_at: string;
}

export async function getTokenList(): Promise<AdminTokenRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('published_games')
    .select(
      'id, slug, name, token_name, token_symbol, token_mint, token_supply, token_image_url, token_creator_wallet, token_launched_at, bonding_curve_address, pool_config_address, creator_name, created_at',
    )
    .eq('is_tokenized', true)
    .order('token_launched_at', { ascending: false, nullsFirst: false })
    .limit(500);
  if (error) {
    console.error('admin tokens fetch failed', error);
    return [];
  }
  return (data ?? []) as AdminTokenRow[];
}
