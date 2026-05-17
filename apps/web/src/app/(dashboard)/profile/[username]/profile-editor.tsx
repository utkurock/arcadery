'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, X, Check } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { notifyProfileUpdated } from '@/lib/auth/use-viewer';

export function ProfileEditor({
  initialDisplayName,
}: {
  initialDisplayName: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initialDisplayName ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in');
      const trimmed = name.trim();
      const { error: upErr } = await supabase
        .from('user_profiles')
        .update({ display_name: trimmed || null })
        .eq('id', user.id);
      if (upErr) throw new Error(upErr.message);
      setOpen(false);
      // Refresh server-rendered profile data AND the in-memory viewer store so
      // the navbar pill / dropdown picks up the new display name instantly.
      notifyProfileUpdated();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-4 py-1.5 text-sm font-medium text-white/80 hover:border-white/20 hover:text-white transition-colors"
      >
        <Pencil className="w-3.5 h-3.5" />
        Edit
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Display name"
        maxLength={40}
        className="h-9 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/30 focus:border-[#8b7ec8]/50 focus:outline-none"
        disabled={saving}
        autoFocus
      />
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#8b7ec8] text-white hover:bg-[#7a6db8] disabled:opacity-50"
        aria-label="Save"
      >
        <Check className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setName(initialDisplayName ?? '');
          setError(null);
        }}
        disabled={saving}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-white/60 hover:text-white"
        aria-label="Cancel"
      >
        <X className="w-4 h-4" />
      </button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
