'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Send, X, Loader2, Users, Wallet, MessageSquare } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useViewer, truncateAddress } from '@/lib/auth/use-viewer';
import { useModals } from '@/lib/ui/modals';
import { useChatStore } from '@/lib/ui/chat-store';
import { Avatar } from '@/components/ui/avatar';

// Community chat — Stake-style right drawer.
//
// Layout integration: this component renders as a FLEX ITEM inside the
// dashboard layout (not `fixed`). When `open` is true, the drawer takes
// 360px on desktop and squeezes the main content to its left; when closed
// it returns `null` and the main content reclaims the full width. On
// mobile (below sm) the drawer goes full-width as an overlay.
//
// Backed by the `chat_messages` table (see 00003_chat.sql) — RLS makes
// reads public and writes self-only, and the table is in supabase_realtime
// so INSERTs push to subscribers. Sending appends optimistically; realtime
// echo dedupes on `id`.

const PAGE_SIZE = 50;
const SEND_COOLDOWN_MS = 1500;

interface ChatMessage {
  id: string;
  user_id: string;
  wallet_address: string;
  display_name: string | null;
  avatar_url: string | null;
  content: string;
  created_at: string;
}

export function CommunityChat() {
  const viewer = useViewer();
  const open = useChatStore((s) => s.open);
  const setOpen = useChatStore((s) => s.setOpen);
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const lastSentAtRef = useRef<number>(0);
  const listEndRef = useRef<HTMLDivElement>(null);

  const isSignedIn = viewer.status === 'signed-in';
  const supabase = useMemo(() => createClient(), []);

  // Initial fetch + realtime subscription — only spin up when the drawer
  // is open. Saves a websocket on pages where chat is never opened.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    supabase
      .from('chat_messages')
      .select('id, user_id, wallet_address, display_name, avatar_url, content, created_at')
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) {
          setError('Failed to load chat');
        } else {
          setMessages(((data ?? []) as ChatMessage[]).slice().reverse());
        }
        setLoading(false);
      });

    const channel = supabase
      .channel('community-chat')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        (payload) => {
          const row = payload.new as ChatMessage;
          setMessages((prev) => {
            if (!prev) return [row];
            if (prev.some((m) => m.id === row.id)) return prev;
            return [...prev, row];
          });
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'chat_messages' },
        (payload) => {
          const oldId = (payload.old as { id?: string }).id;
          if (!oldId) return;
          setMessages((prev) =>
            prev ? prev.filter((m) => m.id !== oldId) : prev,
          );
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [open, supabase]);

  useEffect(() => {
    if (!open || !messages) return;
    listEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [open, messages]);

  const sendMessage = async () => {
    if (!isSignedIn) return;
    const trimmed = draft.trim();
    if (!trimmed || trimmed.length > 500) return;
    const now = Date.now();
    if (now - lastSentAtRef.current < SEND_COOLDOWN_MS) return;
    lastSentAtRef.current = now;
    setSending(true);
    setError(null);

    const profile = {
      user_id: viewer.userId,
      wallet_address: viewer.walletAddress ?? viewer.userId,
      display_name: viewer.displayName,
      avatar_url: viewer.avatarUrl,
    };

    const optimisticId = `optimistic-${now}-${Math.random()}`;
    const optimistic: ChatMessage = {
      id: optimisticId,
      user_id: profile.user_id,
      wallet_address: profile.wallet_address,
      display_name: profile.display_name,
      avatar_url: profile.avatar_url,
      content: trimmed,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => (prev ? [...prev, optimistic] : [optimistic]));
    setDraft('');

    const { data, error: err } = await supabase
      .from('chat_messages')
      .insert({
        user_id: profile.user_id,
        wallet_address: profile.wallet_address,
        display_name: profile.display_name,
        avatar_url: profile.avatar_url,
        content: trimmed,
      })
      .select('id, user_id, wallet_address, display_name, avatar_url, content, created_at')
      .single();

    if (err || !data) {
      setError(err?.message ?? 'Failed to send');
      setMessages((prev) =>
        prev ? prev.filter((m) => m.id !== optimisticId) : prev,
      );
    } else {
      setMessages((prev) =>
        prev
          ? prev.map((m) => (m.id === optimisticId ? (data as ChatMessage) : m))
          : [data as ChatMessage],
      );
    }
    setSending(false);
  };

  if (!open) return null;

  return (
    <>
      {/* Mobile backdrop — desktop keeps the rest of the page interactive. */}
      <div
        onClick={() => setOpen(false)}
        className="fixed inset-0 z-30 bg-black/40 backdrop-blur-[2px] sm:hidden"
        aria-hidden="true"
      />
      <aside
        // Mobile (below sm): full-screen overlay drawer.
        // Desktop (sm+): inline flex column that pushes main content left,
        // 360px wide. The dashboard layout puts this component AFTER
        // <main>, so the visual ordering is left→right: sidebar | main | chat.
        className="fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-white/[0.06] bg-[#0c0c12] sm:static sm:z-auto sm:w-[360px] lg:w-[380px]"
        role="dialog"
        aria-label="Community chat"
      >
        {/* Header — matches the page-header pattern so the chat column
            looks like a peer of /explore / /templates etc. */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.06] px-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-[#a99ad4]" />
            <span className="text-sm font-semibold text-white">Lobby</span>
            {messages && messages.length > 0 && (
              <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-mono text-white/40 tabular-nums">
                {messages.length}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close chat"
            className="flex h-8 w-8 items-center justify-center rounded-md text-white/40 hover:bg-white/[0.06] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Messages list */}
        <div className="flex-1 overflow-y-auto px-3 py-4">
          {loading ? (
            <div className="flex h-full items-center justify-center text-white/40">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center text-center text-xs text-rose-300/80">
              {error}
            </div>
          ) : !messages || messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-white/30">
              <MessageSquare className="mb-2 h-6 w-6 opacity-50" />
              <p className="text-xs">No messages yet — say something.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((m, i) => (
                <Bubble
                  key={m.id}
                  message={m}
                  showAuthor={
                    i === 0 || messages[i - 1].user_id !== m.user_id
                  }
                  isMe={isSignedIn && m.user_id === viewer.userId}
                />
              ))}
              <div ref={listEndRef} />
            </div>
          )}
        </div>

        {/* Composer */}
        {isSignedIn ? (
          <div className="shrink-0 border-t border-white/[0.06] p-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendMessage();
              }}
              className="flex items-end gap-2"
            >
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, 500))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="Message the lobby…"
                rows={1}
                className="flex-1 resize-none rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white placeholder:text-white/30 outline-none transition-colors focus:border-[#8b7ec8]/40 max-h-28"
              />
              <button
                type="submit"
                disabled={sending || !draft.trim()}
                aria-label="Send"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#8b7ec8] text-white transition-colors hover:bg-[#7a6db8] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </form>
            {draft.length > 400 && (
              <div className="mt-1 text-right text-[10px] text-white/30 tabular-nums">
                {500 - draft.length}
              </div>
            )}
          </div>
        ) : (
          <div className="shrink-0 border-t border-white/[0.06] p-3">
            <button
              type="button"
              onClick={() => useModals.getState().openLogin()}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.02] py-2.5 text-xs font-semibold text-white/70 transition-colors hover:border-[#8b7ec8]/40 hover:bg-[#8b7ec8]/[0.08] hover:text-white"
            >
              <Wallet className="h-3.5 w-3.5 text-[#a99ad4]" />
              Connect to chat
            </button>
          </div>
        )}
      </aside>
    </>
  );
}

function Bubble({
  message,
  showAuthor,
  isMe,
}: {
  message: ChatMessage;
  showAuthor: boolean;
  isMe: boolean;
}) {
  const name =
    message.display_name ||
    (message.wallet_address ? truncateAddress(message.wallet_address) : 'Anon');
  return (
    <div className={`flex items-start gap-2 ${isMe ? 'flex-row-reverse' : ''}`}>
      {showAuthor ? (
        <Avatar src={message.avatar_url ?? null} fallback={name} size="xs" />
      ) : (
        <div className="h-6 w-6 shrink-0" aria-hidden="true" />
      )}
      <div className={`min-w-0 flex-1 ${isMe ? 'text-right' : ''}`}>
        {showAuthor && (
          <div className={`mb-0.5 flex items-baseline gap-1.5 ${isMe ? 'justify-end' : ''}`}>
            <span className={`text-[11px] font-semibold ${isMe ? 'text-[#a99ad4]' : 'text-white/80'}`}>
              {isMe ? 'You' : name}
            </span>
            <span className="text-[9px] tabular-nums text-white/25">
              {fmtTime(message.created_at)}
            </span>
          </div>
        )}
        <div
          className={`inline-block max-w-full rounded-lg px-2.5 py-1.5 text-xs leading-relaxed break-words whitespace-pre-wrap ${
            isMe
              ? 'bg-[#8b7ec8]/20 text-white/90'
              : 'bg-white/[0.04] text-white/80'
          }`}
        >
          {message.content}
        </div>
      </div>
    </div>
  );
}

function fmtTime(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  if (diff < 60_000) return 'now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}
