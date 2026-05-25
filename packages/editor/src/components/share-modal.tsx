'use client';

import { useState } from 'react';
import { Copy, Check, X, Link, Code, Globe, ExternalLink, Twitter } from 'lucide-react';
import { useScrollLock } from '../hooks/use-scroll-lock';

export interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  slug: string;
  gameName: string;
}

export function ShareModal({ isOpen, onClose, slug, gameName }: ShareModalProps) {
  const [copied, setCopied] = useState<string | null>(null);

  useScrollLock(isOpen);

  if (!isOpen) return null;

  const origin = window.location.origin;
  // Promote the share URL to the game's subdomain (`<slug>.arcadery.xyz`),
  // which the middleware transparently rewrites to /play/<slug>. The editor
  // lives at `arcadery.xyz/create/...` (or `<oldslug>.arcadery.xyz` if the
  // user opens share from an existing game), so we strip any existing leading
  // label before adding the slug — never stack labels.
  const playUrl = buildGameUrl(origin, slug);
  // Embed deliberately stays on the path form. Subdomain rewrites cover the
  // embed sub-route too, but iframes embedded on third-party sites do best
  // with a stable canonical path and no extra DNS hops.
  const embedUrl = `${origin}/play/${slug}/embed`;
  const embedCode = `<iframe src="${embedUrl}" width="800" height="600" frameborder="0" allowfullscreen></iframe>`;

  async function copy(text: string, key: string) {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  const tweetText = `I just made "${gameName}" on @arcadery — built with AI, no code. Play it:`;
  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}&url=${encodeURIComponent(playUrl)}`;
  const farcasterUrl = `https://warpcast.com/~/compose?text=${encodeURIComponent(`${tweetText} ${playUrl}`)}`;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-white/[0.08] bg-[#0d0d14] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-white">Published!</h2>
            <p className="text-xs text-white/30 mt-0.5">{gameName} is now live</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-white/30 hover:bg-white/[0.05] hover:text-white/60 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Social share */}
          <div>
            <label className="flex items-center gap-2 text-xs font-medium text-white/40 mb-2">
              Share with the world
            </label>
            <div className="flex flex-wrap gap-2">
              <a
                href={twitterUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-black px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/15"
              >
                <Twitter className="h-3.5 w-3.5" />
                Tweet
              </a>
              <a
                href={farcasterUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#7c65c1] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#6b56b0]"
              >
                {/* Warpcast/Farcaster icon as a stylised "fc" */}
                <span className="font-mono text-[10px] font-bold">fc</span>
                Cast
              </a>
              <a
                href={playUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3.5 py-2 text-xs font-semibold text-white/80 transition-colors hover:bg-white/[0.08] hover:text-white"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open game
              </a>
            </div>
          </div>

          {/* Play Link */}
          <div>
            <label className="flex items-center gap-2 text-xs font-medium text-white/40 mb-2">
              <Link className="w-3.5 h-3.5" />
              Game Link
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={playUrl}
                className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-sm text-white/80 outline-none"
              />
              <button
                onClick={() => copy(playUrl, 'url')}
                className={`shrink-0 rounded-lg px-4 py-2.5 text-xs font-semibold text-white transition-colors ${copied === 'url' ? 'bg-green-600' : 'bg-[#8b7ec8] hover:bg-[#7a6db8]'}`}
              >
                {copied === 'url' ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <a href={playUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-2 text-[11px] text-[#8b7ec8] hover:underline">
              Open in new tab <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {/* Direct Play (no site chrome) */}
          <div>
            <label className="flex items-center gap-2 text-xs font-medium text-white/40 mb-2">
              <Globe className="w-3.5 h-3.5" />
              Fullscreen Link (no UI)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={embedUrl}
                className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-sm text-white/80 outline-none"
              />
              <button
                onClick={() => copy(embedUrl, 'fullscreen')}
                className={`shrink-0 rounded-lg px-4 py-2.5 text-xs font-semibold text-white transition-colors ${copied === 'fullscreen' ? 'bg-green-600' : 'bg-[#8b7ec8] hover:bg-[#7a6db8]'}`}
              >
                {copied === 'fullscreen' ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="text-[10px] text-white/15 mt-1">Share this link for direct play — no arcadery header or UI</p>
          </div>

          {/* Embed Code */}
          <div>
            <label className="flex items-center gap-2 text-xs font-medium text-white/40 mb-2">
              <Code className="w-3.5 h-3.5" />
              Embed on Your Site
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={embedCode}
                className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 font-mono text-[11px] text-white/70 outline-none"
              />
              <button
                onClick={() => copy(embedCode, 'embed')}
                className={`shrink-0 rounded-lg px-4 py-2.5 text-xs font-semibold text-white transition-colors ${copied === 'embed' ? 'bg-green-600' : 'bg-[#8b7ec8] hover:bg-[#7a6db8]'}`}
              >
                {copied === 'embed' ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="text-[10px] text-white/15 mt-1">Paste this HTML to embed the game on any website</p>
          </div>

          {/* Custom Domain hint */}
          <div className="rounded-xl border border-white/[0.04] bg-white/[0.02] p-4">
            <div className="flex items-center gap-2 mb-1">
              <Globe className="w-4 h-4 text-[#8b7ec8]/50" />
              <p className="text-xs font-medium text-white/40">Custom Domain</p>
              <span className="rounded-full bg-[#8b7ec8]/10 px-2 py-0.5 text-[9px] font-semibold text-[#8b7ec8]">Pro</span>
            </div>
            <p className="text-[11px] text-white/20">
              Point your own domain (e.g. play.yourgame.com) to this game. Available on the Pro plan.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Build the subdomain-form share URL: `https://<slug>.<apex>`. We strip an
// existing leading label first so opening the share modal from
// `<oldslug>.arcadery.xyz` doesn't produce `<newslug>.<oldslug>.arcadery.xyz`.
// Falls back to the path form if the origin doesn't have a structure we
// recognise (rare — local file://, opaque sandboxes).
function buildGameUrl(origin: string, slug: string): string {
  try {
    const url = new URL(origin);
    const apex = stripLeadingSubdomain(url.hostname);
    if (apex === 'localhost' || apex.includes('.')) {
      url.hostname = `${slug}.${apex}`;
      url.pathname = '';
      return url.toString().replace(/\/$/, '');
    }
  } catch {}
  return `${origin}/play/${slug}`;
}

function stripLeadingSubdomain(hostname: string): string {
  const parts = hostname.split('.');
  // < 3 labels is either bare `localhost` or apex `arcadery.xyz` — no
  // subdomain to strip.
  if (parts.length < 3) return hostname;
  return parts.slice(1).join('.');
}
