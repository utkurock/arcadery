'use client';

import { useRef, useEffect, useState } from 'react';
import { useAiChat } from '../../hooks/use-ai-chat';
import type { ChatMessage } from '../../hooks/use-ai-chat';

const CAPABILITIES = [
  { icon: 'gear', title: 'Game Mechanics', desc: 'Adjust speed, gravity, and more — no code needed' },
  { icon: 'image', title: 'Reference Image', desc: 'Attach an image to show the style you want' },
  { icon: 'upload', title: 'Assets', desc: 'Upload sprites, sounds, and fonts for your game' },
  { icon: 'code', title: 'Code Editor', desc: 'View or make manual edits yourself' },
] as const;

const ICON_PATHS: Record<string, string[]> = {
  gear: [
    'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37a1.724 1.724 0 002.572-1.065z',
    'M15 12a3 3 0 11-6 0 3 3 0 016 0z',
  ],
  image: ['M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z'],
  upload: ['M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12'],
  code: ['M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4'],
};

export function AiChatPanel({
  showHistory,
  onCloseHistory,
  initialPrompt,
  open,
  onClose,
}: {
  showHistory?: boolean;
  onCloseHistory?: () => void;
  initialPrompt?: string;
  /** Whether the panel is open. Controls slide-in/out below md and hide above. */
  open: boolean;
  /** Tap-backdrop or close-X handler — only meaningful on mobile overlay mode. */
  onClose: () => void;
}) {
  const { messages, setMessages, input, setInput, sendMessage, isLoading, clearWelcome } = useAiChat();
  const bottomRef = useRef<HTMLDivElement>(null);
  const initialSent = useRef(false);
  const [refImage, setRefImage] = useState<string | null>(null);

  // Pick up reference image from homepage (sessionStorage)
  useEffect(() => {
    try {
      const img = sessionStorage.getItem('arcadery_ref_image');
      if (img) {
        setRefImage(img);
        sessionStorage.removeItem('arcadery_ref_image');
      }
    } catch {}
  }, []);

  // Asset-attach bridge: the Asset Manager's "Send to chat" button dispatches
  // this event. We hydrate refImage with the asset's URL so it shows up as
  // the same thumbnail strip the file-picker uses. Cheap reuse — no separate
  // attachment plumbing needed for the MVP.
  useEffect(() => {
    function onAttach(e: Event) {
      const detail = (e as CustomEvent<{ url?: string }>).detail;
      if (detail?.url) setRefImage(detail.url);
    }
    window.addEventListener('arcadery:attach-asset-to-chat', onAttach);
    return () => window.removeEventListener('arcadery:attach-asset-to-chat', onAttach);
  }, []);

  // Auto-send initial prompt from URL (e.g. from landing page)
  useEffect(() => {
    if (initialPrompt && !initialSent.current) {
      initialSent.current = true;
      setInput(initialPrompt);
      setTimeout(() => {
        // Pick up refImage at fire-time (it may have been hydrated from
        // sessionStorage by the effect above). Clear before send so a quick
        // double-send doesn't re-attach the same image.
        const attached = refImage;
        setRefImage(null);
        sendMessage(initialPrompt, attached);
      }, 500);
    }
  // refImage intentionally not in deps — we read it lazily inside setTimeout
  // and don't want this effect to re-fire when the image changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt]);

  /** Unified send: attaches the current refImage and clears it afterward. */
  const handleSend = (overrideText?: string) => {
    const attached = refImage;
    setRefImage(null);
    sendMessage(overrideText, attached);
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleCapabilityClick = (title: string) => {
    // Any capability click should dismiss the welcome card so the chat surface
    // feels responsive — even when the action opens a modal/tab elsewhere.
    if (title === 'Game Mechanics') {
      clearWelcome();
      window.dispatchEvent(new CustomEvent('arcadery:open-mechanics'));
      return;
    }
    if (title === 'Code Editor') {
      clearWelcome();
      window.dispatchEvent(new CustomEvent('arcadery:open-code'));
      return;
    }
    if (title === 'Assets') {
      clearWelcome();
      window.dispatchEvent(new CustomEvent('arcadery:open-assets'));
      return;
    }

    // Reference image: trigger the file picker via a hidden input on the chat.
    if (title === 'Reference Image') {
      refInputRef.current?.click();
      return;
    }

    // Fallback for unknown capabilities.
    setMessages((prev) =>
      prev
        .filter((m) => m.type !== 'welcome')
        .concat({
          id: (Date.now() + Math.random()).toString(),
          role: 'ai' as const,
          type: 'text' as const,
          content: 'Coming soon!',
        }),
    );
  };

  const refInputRef = useRef<HTMLInputElement>(null);

  const handleRefImagePicked = (file: File | null) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setMessages((prev) =>
        prev.filter((m) => m.type !== 'welcome').concat({
          id: (Date.now() + Math.random()).toString(),
          role: 'ai' as const,
          type: 'error' as const,
          content: 'Reference image is over 5 MB — try a smaller one.',
        }),
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      if (typeof dataUrl === 'string') setRefImage(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  return (
    <>
      {/* Mobile backdrop — only renders below md when open. */}
      {open && (
        <button
          type="button"
          aria-label="Close chat"
          onClick={onClose}
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden"
        />
      )}
    <aside
      // Whole panel is a drop target for assets dragged from the Asset Manager.
      // Drop just attaches the asset to the next prompt (sets refImage).
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('application/x-arcadery-asset')) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }
      }}
      onDrop={(e) => {
        const raw = e.dataTransfer.getData('application/x-arcadery-asset');
        if (!raw) return;
        e.preventDefault();
        try {
          const asset = JSON.parse(raw) as { url?: string };
          if (asset?.url) setRefImage(asset.url);
        } catch {}
      }}
      className={`fixed inset-y-0 left-0 z-40 w-80 max-w-[85vw] flex-shrink-0 flex flex-col overflow-hidden border-r border-white/[0.06] transition-transform md:static md:z-auto md:translate-x-0 md:max-w-none ${
        open ? 'translate-x-0' : '-translate-x-full md:hidden'
      }`}
      style={{ backgroundColor: '#0a0a0f' }}
    >
      {/* History overlay */}
      {showHistory && (
        <div className="absolute inset-0 z-30 flex flex-col" style={{ backgroundColor: '#0a0a0f' }}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
            <h3 className="text-sm font-semibold text-white">Chat History</h3>
            <button onClick={onCloseHistory} className="text-white/50 hover:text-white text-xs transition-colors">Close</button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {messages.length <= 1 ? (
              <p className="text-sm text-white/30 text-center mt-8">No previous conversations yet.</p>
            ) : (
              <div className="space-y-2">
                {messages.filter(m => m.role === 'user').map((m) => (
                  <div key={m.id} className="px-3 py-2 bg-white/[0.04] rounded-lg border border-white/[0.06]">
                    <p className="text-xs text-white/70 truncate">{m.content}</p>
                    <p className="text-[10px] text-white/30 mt-1">This session</p>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="p-3 border-t border-white/[0.06]">
            <button
              onClick={() => {
                setMessages([{ id: 'welcome', role: 'ai', type: 'welcome', content: '' }]);
                onCloseHistory?.();
              }}
              className="w-full py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-xs font-medium text-white/60 hover:text-white transition-colors"
            >
              + New Chat
            </button>
          </div>
        </div>
      )}

      <input
        ref={refInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          handleRefImagePicked(e.target.files?.[0] ?? null);
          e.target.value = '';
        }}
      />

      {/* Close button — only meaningful on mobile overlay mode */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close chat"
        className="md:hidden absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04] text-white/50 hover:bg-white/[0.08] hover:text-white"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        </svg>
      </button>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 pt-3 space-y-3">
        {messages.map((msg) => {
          if (msg.type === 'welcome') return <WelcomeCard key={msg.id} onAction={handleCapabilityClick} />;
          if (msg.type === 'loading') return <LoadingBubble key={msg.id} msg={msg} />;
          if (msg.type === 'error') return <ErrorBubble key={msg.id} msg={msg} />;
          return <MessageBubble key={msg.id} msg={msg} />;
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 pt-2">
        <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-3 focus-within:border-[#8b7ec8]/30 transition-colors">
          {/* Attached reference image preview — sits inside the input box so
              it visually belongs to the message the user is composing, not
              the chat panel as a whole. */}
          {refImage && (
            <div className="mb-2 flex items-center gap-2">
              <div className="relative">
                <img
                  src={refImage}
                  alt="Reference"
                  className="h-12 w-12 rounded-md border border-white/10 object-cover"
                />
                <button
                  type="button"
                  onClick={() => setRefImage(null)}
                  aria-label="Remove reference image"
                  className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] leading-none text-white hover:bg-red-600"
                >
                  &times;
                </button>
              </div>
              <span className="text-[10px] text-white/40">Attached to next message</span>
            </div>
          )}
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={isLoading}
            className="bg-transparent border-none focus:outline-none focus:ring-0 p-0 w-full text-sm text-white resize-none h-10 placeholder:text-white/30 disabled:opacity-50"
            placeholder={isLoading ? 'Generating...' : 'Describe your game or changes...'}
          />
          <div className="flex items-center justify-between mt-1">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                // Open Assets tab WITHOUT clearing the welcome card — these
                // input-bar buttons are toolbar shortcuts, not "start a
                // conversation" capability cards, so the welcome should stay
                // visible until the user actually sends a message.
                onClick={() => window.dispatchEvent(new CustomEvent('arcadery:open-assets'))}
                title="Open the Assets tab to upload or generate sprites, sounds, fonts"
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-white/40 hover:bg-white/[0.06] hover:text-white/60 transition-colors"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>
                Asset
              </button>
              <button
                type="button"
                // Same logic: opening the file picker shouldn't wipe the
                // welcome — the user might still want the capability cards if
                // they pick the wrong file or cancel.
                onClick={() => refInputRef.current?.click()}
                title="Attach a reference image for the next prompt"
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-white/40 hover:bg-white/[0.06] hover:text-white/60 transition-colors"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>
                Image
              </button>
            </div>
            <button
              onClick={() => handleSend()}
              disabled={isLoading}
              className={`p-1.5 rounded-lg transition-colors ${input.trim() && !isLoading ? 'bg-[#8b7ec8] text-white hover:bg-[#7a6db8]' : 'bg-white/[0.06] text-white/20'}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 10l7-7m0 0l7 7m-7-7v18" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>
            </button>
          </div>
        </div>
      </div>
    </aside>
    </>
  );
}

function WelcomeCard({ onAction }: { onAction: (title: string) => void }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded-full flex items-center justify-center bg-[#8b7ec8]/20">
          <span className="text-[9px] font-bold text-[#8b7ec8]">O</span>
        </div>
        <span className="text-xs font-semibold text-white/50">Game Assistant</span>
      </div>

      <p className="text-sm text-white/70 leading-relaxed">
        Welcome! I can help you build games. Try typing <strong className="text-white">&quot;add box&quot;</strong> or use the + button on the canvas toolbar.
      </p>

      <div className="rounded-xl p-3 border border-white/[0.06] space-y-2.5">
        <h3 className="text-[10px] font-bold text-white/30 uppercase tracking-widest">
          What you can do
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {CAPABILITIES.map((cap) => (
            <button
              key={cap.title}
              onClick={() => onAction(cap.title)}
              className="flex flex-col gap-1.5 p-2.5 rounded-lg border border-white/[0.06] hover:border-[#8b7ec8]/30 hover:bg-[#8b7ec8]/[0.04] cursor-pointer transition-all text-left"
            >
              <div className="p-1.5 bg-[#8b7ec8]/15 text-[#8b7ec8] rounded-lg w-fit">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {ICON_PATHS[cap.icon].map((d, i) => (
                    <path key={i} d={d} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                  ))}
                </svg>
              </div>
              <h4 className="text-[11px] font-semibold text-white/80">{cap.title}</h4>
              <p className="text-[10px] text-white/35 leading-snug">{cap.desc}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] bg-[#8b7ec8]/15 border border-[#8b7ec8]/20 rounded-2xl rounded-br-md px-3 py-2">
          <p className="text-sm text-white/90">{msg.content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 rounded-full flex items-center justify-center bg-[#8b7ec8]/20">
          <span className="text-[8px] font-bold text-[#8b7ec8]">O</span>
        </div>
        <span className="text-[10px] font-semibold text-white/40">Game Assistant</span>
      </div>
      <div className="ml-6">
        <p className="text-sm text-white/70 leading-relaxed whitespace-pre-line break-words overflow-hidden">{msg.content}</p>
      </div>
    </div>
  );
}

function LoadingBubble({ msg }: { msg: ChatMessage }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 rounded-full flex items-center justify-center bg-[#8b7ec8]/20">
          <span className="text-[8px] font-bold text-[#8b7ec8]">O</span>
        </div>
        <span className="text-[10px] font-semibold text-white/40">Game Assistant</span>
      </div>
      <div className="ml-6">
        <p className="text-sm text-white/50">{msg.content}</p>
      </div>
    </div>
  );
}

function ErrorBubble({ msg }: { msg: ChatMessage }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 rounded-full flex items-center justify-center bg-red-600/30">
          <span className="text-[8px] font-bold text-red-400">!</span>
        </div>
        <span className="text-[10px] font-semibold text-red-400/60">Game Assistant</span>
      </div>
      <div className="ml-6">
        <p className="text-sm text-red-400/80 leading-relaxed whitespace-pre-line break-words overflow-hidden">{msg.content}</p>
      </div>
    </div>
  );
}
