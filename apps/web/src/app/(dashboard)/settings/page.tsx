'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useWallet } from '@solana/wallet-adapter-react';
import {
  User,
  Coins,
  Shield,
  Copy,
  Check,
  Loader2,
  ExternalLink,
  Sparkles,
  Upload,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { useCredits } from '@/lib/credits/context';
import { useModals } from '@/lib/ui/modals';
import { PRICING_TIERS } from '@/lib/credits/config';
import { notifyProfileUpdated } from '@/lib/auth/use-viewer';
import { Avatar } from '@/components/ui/avatar';

const tabs = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'billing', label: 'Billing', icon: Coins },
  { id: 'privacy', label: 'Privacy', icon: Shield },
] as const;

type TabId = (typeof tabs)[number]['id'];

type Profile = {
  id: string;
  display_name: string | null;
  wallet_address: string | null;
  avatar_url: string | null;
};

const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB
const ACCEPTED_AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('profile');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const { balance, openBuyModal } = useCredits();

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!active) return;
      if (!user) {
        setProfile(null);
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from('user_profiles')
        .select('id, display_name, wallet_address, avatar_url')
        .eq('id', user.id)
        .maybeSingle<Profile>();
      if (!active) return;
      setProfile(data);
      setLoading(false);
    }

    load();

    // Re-fetch when auth flips from elsewhere (e.g. opening the login modal
    // from this same page). Without this the "Sign in required" panel stays
    // up even after a successful SIWS until a manual reload.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        setLoading(true);
        load();
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-white/25" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-md p-10 text-center">
        <h1 className="text-xl font-semibold text-white mb-2">Sign in required</h1>
        <p className="text-sm text-white/50 mb-6">Connect your wallet to access settings.</p>
        <button
          type="button"
          onClick={() => useModals.getState().openLogin()}
          className="rounded-full bg-[#8b7ec8] px-5 py-2 text-sm font-semibold text-white hover:bg-[#7a6db8]"
        >
          Connect wallet
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8 md:px-8 lg:px-10">
      <h1 className="text-xl font-semibold text-white mb-6">Settings</h1>

      <div className="flex flex-col gap-6 md:flex-row md:gap-8">
        {/* Tab nav: horizontal scroll on mobile, vertical sidebar from md up. */}
        <nav className="-mx-4 flex shrink-0 gap-1 overflow-x-auto px-4 pb-2 md:mx-0 md:w-48 md:flex-col md:gap-0.5 md:overflow-visible md:px-0 md:pb-0">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-[13px] font-medium transition-colors md:w-full ${
                activeTab === id
                  ? 'bg-[#8b7ec8]/[0.12] text-[#a99ad4]'
                  : 'text-white/40 hover:bg-white/[0.04] hover:text-white/70'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>

        <div className="flex-1 min-w-0">
          {activeTab === 'profile' && <ProfileTab profile={profile} onUpdate={setProfile} />}
          {activeTab === 'billing' && (
            <BillingTab
              userId={profile.id}
              balance={balance ?? 0}
              onTopUp={openBuyModal}
            />
          )}
          {activeTab === 'privacy' && <PrivacyTab />}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-white/70 mb-4">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function ProfileTab({ profile, onUpdate }: { profile: Profile; onUpdate: (p: Profile) => void }) {
  const [displayName, setDisplayName] = useState(profile.display_name ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      const supabase = createClient();
      const trimmed = displayName.trim();
      const { error } = await supabase
        .from('user_profiles')
        .update({ display_name: trimmed || null })
        .eq('id', profile.id);
      if (!error) {
        onUpdate({ ...profile, display_name: trimmed || null });
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
        notifyProfileUpdated();
        toast.success('Display name saved');
      } else {
        toast.error(error.message || 'Failed to save name');
      }
    } finally {
      setSaving(false);
    }
  }

  async function copyWallet() {
    if (!profile.wallet_address) return;
    await navigator.clipboard.writeText(profile.wallet_address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    toast.success('Wallet address copied');
  }

  const initial = (profile.display_name || profile.wallet_address || '?')[0]?.toUpperCase();

  return (
    <div className="space-y-8">
      <Section title="Avatar">
        <AvatarUploader profile={profile} onUpdate={onUpdate} initial={initial ?? '?'} />
      </Section>

      <Section title="Display name">
        <div>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={40}
            placeholder="How should others see you?"
            className="w-full max-w-md rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/25 outline-none transition-colors focus:border-[#8b7ec8]/40"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || displayName === (profile.display_name ?? '')}
              className="rounded-lg bg-[#8b7ec8] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#7a6db8] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            {saved && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                <Check className="h-3 w-3" /> Saved
              </span>
            )}
          </div>
        </div>
      </Section>

      {profile.wallet_address && (
        <Section title="Wallet">
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
            <span className="font-mono text-xs text-white/70 flex-1 truncate">
              {profile.wallet_address}
            </span>
            <button
              type="button"
              onClick={copyWallet}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-white/50 hover:bg-white/[0.06] hover:text-white"
            >
              {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="text-xs text-white/30">
            This is your on-chain identity. Transfers, payments, and profile links use this address.
          </p>
        </Section>
      )}
    </div>
  );
}

function BillingTab({
  userId,
  balance,
  onTopUp,
}: {
  userId: string;
  balance: number;
  onTopUp: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] text-white/40 uppercase tracking-widest mb-1">
              <Coins className="h-3.5 w-3.5 text-[#c9a96e]" />
              Current balance
            </div>
            <p className="text-3xl font-bold text-white font-mono tabular-nums">{balance}</p>
            <p className="text-xs text-white/40 mt-0.5">credits</p>
          </div>
          <button
            type="button"
            onClick={onTopUp}
            className="rounded-full bg-[#8b7ec8] px-5 py-2 text-sm font-semibold text-white hover:bg-[#7a6db8]"
          >
            Top up
          </button>
        </div>
      </div>

      <TokenEarnings userId={userId} />

      <Section title="How credits work">
        <ul className="space-y-2 text-sm text-white/60">
          <li className="flex gap-2">
            <span className="text-[#8b7ec8]">•</span>
            <span>
              1 credit = 1 AI generation in the editor. Failed generations auto-refund.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-[#8b7ec8]">•</span>
            <span>
              Purchased in USDC on Solana —{' '}
              {PRICING_TIERS.map((t, i) => (
                <span key={t.id}>
                  {i > 0 && ' or '}
                  <strong className="text-white/80">{t.credits} credits</strong> for{' '}
                  {t.usdLabel}
                </span>
              ))}
              .
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-[#8b7ec8]">•</span>
            <span>Credits don&apos;t expire and there are no subscriptions.</span>
          </li>
          <li className="flex gap-2">
            <span className="text-[#8b7ec8]">•</span>
            <span>
              View your full ledger and purchase history on the{' '}
              <Link href="/credits" className="text-[#a99ad4] hover:text-white">
                Credits
              </Link>{' '}
              page.
            </span>
          </li>
        </ul>
      </Section>

      <Link
        href="/pricing"
        className="inline-flex items-center gap-1.5 text-xs text-white/50 hover:text-white"
      >
        View pricing details →
      </Link>
    </div>
  );
}

type TokenizedGame = {
  id: string;
  slug: string;
  name: string;
  token_mint: string | null;
  token_symbol: string | null;
  token_launched_at: string | null;
};

function TokenEarnings({ userId }: { userId: string }) {
  const [games, setGames] = useState<TokenizedGame[] | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    supabase
      .from('published_games')
      .select('id, slug, name, token_mint, token_symbol, token_launched_at')
      .eq('user_id', userId)
      .eq('is_tokenized', true)
      .order('token_launched_at', { ascending: false })
      .returns<TokenizedGame[]>()
      .then(({ data }) => {
        if (active) setGames(data ?? []);
      });
    return () => {
      active = false;
    };
  }, [userId]);

  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER === 'devnet' ? 'devnet' : 'mainnet';

  return (
    <Section title="Your tokens">
      {games === null ? (
        <div className="flex items-center gap-2 text-xs text-white/40">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
        </div>
      ) : games.length === 0 ? (
        <p className="text-xs text-white/40">
          No tokens launched yet. Publish a game and click &ldquo;Launch token&rdquo; on its play page.
        </p>
      ) : (
        <div className="space-y-2">
          {games.map((g) => {
            const meteoraUrl = g.token_mint
              ? `https://launch.meteora.ag/token/${g.token_mint}${cluster === 'devnet' ? '?cluster=devnet' : ''}`
              : null;
            return (
              <div
                key={g.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5 text-[#c9a96e]" />
                    <span className="text-sm font-semibold text-white truncate">{g.name}</span>
                    {g.token_symbol && (
                      <span className="rounded bg-[#c9a96e]/10 px-1.5 py-0.5 font-mono text-[10px] text-[#c9a96e]">
                        ${g.token_symbol}
                      </span>
                    )}
                  </div>
                  {g.token_mint && (
                    <p className="font-mono text-[10px] text-white/30 truncate mt-0.5">
                      {g.token_mint}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    href={`/play/${g.slug}`}
                    className="text-xs text-white/50 hover:text-white"
                  >
                    Play
                  </Link>
                  {meteoraUrl && (
                    <Link
                      href={meteoraUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-full bg-[#c9a96e]/15 px-3 py-1 text-xs font-semibold text-[#c9a96e] hover:bg-[#c9a96e]/25"
                    >
                      Manage
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
          <p className="mt-3 text-[11px] text-white/30 leading-relaxed">
            Trading fees accrue automatically on Meteora. Click <strong>Manage</strong> to claim them and view live charts. Once your pool reaches{' '}
            <strong>80 SOL</strong> raised, anyone can graduate it to AMM.
          </p>
        </div>
      )}
    </Section>
  );
}

function AvatarUploader({
  profile,
  onUpdate,
  initial,
}: {
  profile: Profile;
  onUpdate: (p: Profile) => void;
  initial: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);

    if (!ACCEPTED_AVATAR_TYPES.includes(file.type)) {
      setError('Use PNG, JPG, WEBP, or GIF.');
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setError('Image must be under 2 MB.');
      return;
    }

    setUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
      // Storage policy requires the first folder = auth.uid().
      const path = `${profile.id}/avatar/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('assets')
        .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type });

      if (uploadError) {
        setError(uploadError.message);
        toast.error(uploadError.message || 'Upload failed');
        return;
      }

      const { data: pub } = supabase.storage.from('assets').getPublicUrl(path);
      const avatarUrl = pub.publicUrl;

      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({ avatar_url: avatarUrl })
        .eq('id', profile.id);

      if (updateError) {
        setError(updateError.message);
        toast.error(updateError.message || 'Failed to save avatar');
        return;
      }

      onUpdate({ ...profile, avatar_url: avatarUrl });
      notifyProfileUpdated();
      toast.success('Avatar updated');
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    if (!profile.avatar_url) return;
    setRemoving(true);
    setError(null);
    try {
      const supabase = createClient();

      // Best-effort: remove the storage object too. Path is everything after `/assets/`.
      try {
        const url = new URL(profile.avatar_url);
        const marker = '/assets/';
        const idx = url.pathname.indexOf(marker);
        if (idx !== -1) {
          const path = decodeURIComponent(url.pathname.slice(idx + marker.length));
          await supabase.storage.from('assets').remove([path]);
        }
      } catch {}

      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({ avatar_url: null })
        .eq('id', profile.id);

      if (updateError) {
        setError(updateError.message);
        toast.error(updateError.message || 'Failed to remove avatar');
        return;
      }

      onUpdate({ ...profile, avatar_url: null });
      notifyProfileUpdated();
      toast.success('Avatar removed');
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative">
        <Avatar src={profile.avatar_url} fallback={initial} size="lg" alt="Your avatar" />
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60">
            <Loader2 className="h-5 w-5 animate-spin text-white" />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 min-w-0">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading || removing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/[0.08] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Upload className="h-3 w-3" />
            {profile.avatar_url ? 'Replace' : 'Upload image'}
          </button>
          {profile.avatar_url && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={uploading || removing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs font-medium text-white/50 hover:bg-white/[0.04] hover:text-white/80 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {removing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              Remove
            </button>
          )}
        </div>
        <p className="text-[11px] text-white/35">
          PNG, JPG, WEBP, or GIF. Max 2 MB. Square images look best.
        </p>
        {error && <p className="text-[11px] text-red-400">{error}</p>}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept={ACCEPTED_AVATAR_TYPES.join(',')}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          // Allow re-selecting the same file later.
          e.target.value = '';
        }}
      />
    </div>
  );
}

function PrivacyTab() {
  return (
    <div className="space-y-6">
      <Section title="Profile visibility">
        <p className="text-sm text-white/60">
          Your profile is public. Anyone with your profile URL can see your published games
          and display name. Your wallet address is shown on your profile.
        </p>
      </Section>

      <Section title="Data">
        <p className="text-sm text-white/60">
          On-chain data (wallet, transactions) is public and permanent. Off-chain data (games,
          display name, uploaded assets) lives in our database and is removed when you delete
          your account below.
        </p>
      </Section>

      <DangerZone />
    </div>
  );
}

function DangerZone() {
  const router = useRouter();
  const { disconnect } = useWallet();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canConfirm = confirmText.trim().toUpperCase() === 'DELETE';

  async function handleDelete() {
    if (!canConfirm || deleting) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch('/api/account/delete', { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = body.error || 'Failed to delete account.';
        setError(msg);
        toast.error(msg);
        setDeleting(false);
        return;
      }

      // Server deleted the auth user — clear local session, wallet, AND the
      // auto-resign flag so WalletAuthBridge doesn't try to re-prompt SIWS
      // against a now-deleted user on the way back to the homepage.
      try {
        localStorage.removeItem('arcadery_signed_in_before');
      } catch {}
      const supabase = createClient();
      await supabase.auth.signOut().catch(() => {});
      await disconnect().catch(() => {});

      toast.success('Account deleted. Redirecting…');
      // Hard reload to wipe any cached client state and land on the homepage.
      router.replace('/');
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to delete account.';
      setError(msg);
      toast.error(msg);
      setDeleting(false);
    }
  }

  return (
    <div className="border-t border-red-500/[0.08] pt-6">
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-red-400/90">
        <AlertTriangle className="h-3.5 w-3.5" />
        Danger zone
      </h3>
      <p className="mb-3 text-xs text-white/50">
        Deleting your account permanently removes your profile, projects, published games,
        uploaded assets, and remaining credits. This cannot be undone. On-chain tokens you
        launched stay live on Solana — only the link to them on Arcadery is removed.
      </p>

      {!confirmOpen ? (
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/[0.04] px-4 py-2 text-xs font-semibold text-red-400 hover:bg-red-500/10"
        >
          <Trash2 className="h-3 w-3" />
          Delete account
        </button>
      ) : (
        <div className="rounded-xl border border-red-500/20 bg-red-500/[0.03] p-4 space-y-3">
          <p className="text-xs text-white/70">
            Type <span className="font-mono font-bold text-red-400">DELETE</span> to confirm.
          </p>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="DELETE"
            autoFocus
            disabled={deleting}
            className="w-full max-w-xs rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-sm text-white placeholder:text-white/20 outline-none focus:border-red-500/50 disabled:opacity-60"
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDelete}
              disabled={!canConfirm || deleting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {deleting && <Loader2 className="h-3 w-3 animate-spin" />}
              {deleting ? 'Deleting…' : 'Permanently delete'}
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmOpen(false);
                setConfirmText('');
                setError(null);
              }}
              disabled={deleting}
              className="rounded-lg border border-white/10 px-4 py-1.5 text-xs font-medium text-white/60 hover:bg-white/[0.04] hover:text-white disabled:opacity-40"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
