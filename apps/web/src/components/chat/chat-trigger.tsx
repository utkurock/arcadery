'use client';

import { MessageSquare, X } from 'lucide-react';
import { useChatStore } from '@/lib/ui/chat-store';

// Trigger button — pages render this inside their header next to the search
// box. Pure presentation: reads + toggles the global chat-open store.

export function ChatTrigger({ className = '' }: { className?: string }) {
  const open = useChatStore((s) => s.open);
  const toggle = useChatStore((s) => s.toggle);
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={open ? 'Close lobby chat' : 'Open lobby chat'}
      aria-expanded={open}
      title={open ? 'Close chat' : 'Open lobby chat'}
      className={`inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-white/70 transition-colors hover:border-[#8b7ec8]/40 hover:bg-[#8b7ec8]/[0.08] hover:text-white ${
        open ? 'border-[#8b7ec8]/40 bg-[#8b7ec8]/[0.08] text-white' : ''
      } ${className}`}
    >
      {open ? <X className="h-3.5 w-3.5" /> : <MessageSquare className="h-3.5 w-3.5" />}
      <span className="hidden sm:inline">Lobby</span>
    </button>
  );
}
