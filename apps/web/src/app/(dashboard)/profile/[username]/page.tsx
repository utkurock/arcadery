import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Play, Calendar, Gamepad2, Trophy } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { ProfileEditor } from './profile-editor';
import { WalletAddress } from './wallet-address';
import { Avatar } from '@/components/ui/avatar';

interface ArcadeBest {
  key: 'drift-racer' | 'neon-asteroids' | 'cube-runner' | 'brick-smash';
  label: string;
  href: string;
  bestValue: number | null;
  bestUnit: string;
  runs: number;
}

// Pull every wallet-keyed game leaderboard concurrently and reduce each to
// {best, run count}. Keeping this server-side avoids 4 client fetches and
// keeps the personal-best query private to the SSR pass.
async function loadArcadeBests(
  supabase: Awaited<ReturnType<typeof createClient>>,
  wallet: string,
): Promise<ArcadeBest[]> {
  const [drift, neon, cube, brick] = await Promise.all([
    supabase
      .from('drift_racer_scores')
      .select('best_lap_sec, won')
      .eq('wallet_address', wallet)
      .order('best_lap_sec', { ascending: true }),
    supabase
      .from('neon_asteroids_scores')
      .select('score')
      .eq('wallet_address', wallet)
      .order('score', { ascending: false }),
    supabase
      .from('cube_runner_scores')
      .select('distance_m')
      .eq('wallet_address', wallet)
      .order('distance_m', { ascending: false }),
    supabase
      .from('brick_smash_scores')
      .select('score')
      .eq('wallet_address', wallet)
      .order('score', { ascending: false }),
  ]);

  const driftWins = (drift.data ?? []).filter((r) => r.won);
  return [
    {
      key: 'drift-racer',
      label: 'Drift Racer',
      href: '/play/drift-racer',
      bestValue: driftWins.length > 0 ? Number(driftWins[0].best_lap_sec) : null,
      bestUnit: 's best lap',
      runs: drift.data?.length ?? 0,
    },
    {
      key: 'neon-asteroids',
      label: 'Neon Asteroids',
      href: '/play/neon-asteroids',
      bestValue: neon.data?.[0]?.score ?? null,
      bestUnit: 'score',
      runs: neon.data?.length ?? 0,
    },
    {
      key: 'cube-runner',
      label: 'Cube Runner',
      href: '/play/cube-runner',
      bestValue: cube.data?.[0]?.distance_m ?? null,
      bestUnit: 'm distance',
      runs: cube.data?.length ?? 0,
    },
    {
      key: 'brick-smash',
      label: 'Brick Smash',
      href: '/play/brick-smash',
      bestValue: brick.data?.[0]?.score ?? null,
      bestUnit: 'score',
      runs: brick.data?.length ?? 0,
    },
  ];
}

type ProfileRow = {
  id: string;
  display_name: string | null;
  wallet_address: string | null;
  avatar_url: string | null;
  created_at: string;
};

type PublishedGame = {
  id: string;
  slug: string;
  name: string;
  is_tokenized: boolean | null;
  token_symbol: string | null;
  created_at: string;
};

function formatJoined(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username: userId } = await params;
  const supabase = await createClient();

  const [{ data: profile }, { data: games }, { data: { user: viewer } }] = await Promise.all([
    supabase
      .from('user_profiles')
      .select('id, display_name, wallet_address, avatar_url, created_at')
      .eq('id', userId)
      .maybeSingle<ProfileRow>(),
    supabase
      .from('published_games')
      .select('id, slug, name, is_tokenized, token_symbol, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .returns<PublishedGame[]>(),
    supabase.auth.getUser(),
  ]);

  if (!profile) notFound();

  const isOwner = viewer?.id === profile.id;
  const shortId = profile.id.slice(0, 8);
  const heading =
    profile.display_name ||
    (profile.wallet_address ? profile.wallet_address.slice(0, 8) : shortId);

  const arcadeBests = profile.wallet_address
    ? await loadArcadeBests(supabase, profile.wallet_address)
    : [];
  const totalArcadeRuns = arcadeBests.reduce((acc, b) => acc + b.runs, 0);

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-white/[0.06] px-4 pt-5 pb-4 sm:px-6 md:px-8 lg:px-10">
        <h1 className="text-xl font-semibold text-white">Profile</h1>
        <p className="mt-0.5 text-xs text-white/40">
          {isOwner ? 'Your public profile and published games.' : 'Public profile.'}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 md:px-8 lg:px-10">
        <div className="mb-10 flex flex-wrap items-start gap-4 sm:gap-6">
          <Avatar src={profile.avatar_url} fallback={heading} size="xl" alt={heading} />
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-bold text-white truncate">{heading}</h2>
            {profile.wallet_address && <WalletAddress address={profile.wallet_address} />}
            <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-white/40">
              <span className="flex items-center gap-1">
                <Gamepad2 className="w-4 h-4" /> {games?.length ?? 0} games
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" /> Joined {formatJoined(profile.created_at)}
              </span>
            </div>
          </div>
          {isOwner && <ProfileEditor initialDisplayName={profile.display_name} />}
        </div>

        {profile.wallet_address && (
          <section className="mb-10">
            <h3 className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-white/60">
              <Trophy className="h-3.5 w-3.5 text-amber-300" /> Arcade scores
              {totalArcadeRuns > 0 && (
                <span className="ml-1 normal-case text-[10px] text-white/30 tracking-normal">
                  ({totalArcadeRuns} runs)
                </span>
              )}
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {arcadeBests.map((b) => (
                <Link
                  key={b.key}
                  href={b.href}
                  className="group rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 transition-all hover:border-amber-300/30 hover:bg-amber-400/[0.04]"
                >
                  <div className="text-[10px] uppercase tracking-widest text-white/40">
                    {b.label}
                  </div>
                  <div className="mt-2 text-xl font-bold tabular-nums text-white">
                    {b.bestValue == null ? (
                      <span className="text-white/20">—</span>
                    ) : (
                      <>
                        {b.key === 'drift-racer'
                          ? b.bestValue.toFixed(2)
                          : b.bestValue.toLocaleString()}
                        <span className="ml-1 text-[10px] text-white/40">{b.bestUnit}</span>
                      </>
                    )}
                  </div>
                  <div className="mt-1 text-[10px] text-white/30">
                    {b.runs} {b.runs === 1 ? 'run' : 'runs'}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        <h3 className="mb-4 text-xs font-semibold uppercase tracking-widest text-white/60">
          Published games
        </h3>
        {!games || games.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] py-12 text-center text-sm text-white/40">
            {isOwner ? (
              <>
                No published games yet.{' '}
                <Link href="/create/new" className="text-[#8b7ec8] hover:text-white">
                  Create one
                </Link>
              </>
            ) : (
              'No published games yet.'
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {games.map((g) => (
              <Link key={g.id} href={`/play/${g.slug}`} className="group">
                <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] transition-all hover:border-[#8b7ec8]/40 hover:bg-white/[0.04]">
                  <div className="aspect-[16/10] bg-gradient-to-br from-[#141520] to-[#0a0a0f] flex items-center justify-center">
                    <Play className="w-10 h-10 text-white/20 transition-all group-hover:scale-110 group-hover:text-[#8b7ec8]" />
                  </div>
                  <div className="p-4">
                    <h4 className="truncate text-sm font-semibold text-white">{g.name}</h4>
                    <div className="mt-2 flex items-center gap-3 text-xs text-white/40">
                      {g.is_tokenized && g.token_symbol ? (
                        <span className="rounded bg-[#c9a96e]/10 px-1.5 py-0.5 font-mono text-[10px] text-[#c9a96e]">
                          ${g.token_symbol}
                        </span>
                      ) : null}
                      <span>{formatJoined(g.created_at)}</span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
