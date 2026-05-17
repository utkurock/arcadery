'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { Features } from '@/components/ui/features-10';
import { useThemeStore } from '@/lib/theme-store';
import { WELCOME_BONUS } from '@/lib/credits/config';
import { AuthButton } from '@/components/auth/auth-button';
import { CreditBalance } from '@/components/credits/credit-balance';

const PixelBlast = dynamic(() => import('@/components/ui/PixelBlast'), {
  ssr: false,
});

// Preload editor chunks in background so /create/new loads instantly
function usePreloadEditor() {
  const loaded = useRef(false);
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    // Start preloading after 2s idle — user is reading the page
    const timer = setTimeout(() => {
      import('@arcadery/editor').catch(() => {});
      import('@arcadery/engine').catch(() => {});
    }, 2000);
    return () => clearTimeout(timer);
  }, []);
}

const suggestions = [
  'Create a platformer game with custom characters',
  'Build a puzzle game with physics mechanics',
  'Design a racing game with power-ups',
  'Make a tower defense game from scratch',
];

export default function Main2Page() {
  usePreloadEditor();
  const [prompt, setPrompt] = useState('');
  const [planMode, setPlanMode] = useState(false);
  const [planLoading, setPlanLoading] = useState(false);
  const [planResult, setPlanResult] = useState<{ description: string; elements: { type: string; name: string; role?: string }[] } | null>(null);
  const [uploadedImage, setUploadedImage] = useState<{ file: File; preview: string } | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { dark } = useThemeStore();
  const router = useRouter();

  const handleGo = async () => {
    const q = prompt.trim();
    if (!q && !uploadedImage) {
      router.push('/create/new');
      return;
    }

    if (planMode && q) {
      // Plan mode: get a game plan from AI before creating
      setPlanLoading(true);
      setPlanResult(null);
      try {
        const res = await fetch('/api/ai/plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: q }),
        });
        if (!res.ok) throw new Error('API error');
        const data = await res.json();
        setPlanResult({
          description: data.description || 'Game plan ready.',
          elements: data.elements || [],
        });
      } catch {
        setPlanResult({ description: 'Failed to generate plan. Try again.', elements: [] });
      }
      setPlanLoading(false);
      return;
    }

    // Normal mode: pass prompt via URL so it survives the auth/insert redirect
    const target = q ? `/create/new?prompt=${encodeURIComponent(q)}` : '/create/new';
    if (uploadedImage) {
      // Best-effort: stash a data URL so the editor can pick it up. A large
      // image (or quota-full sessionStorage) will throw on setItem — swallow
      // and continue, because losing the reference image is much better than
      // a broken navigation that leaves the user stuck on the landing page.
      const reader = new FileReader();
      reader.onload = () => {
        try {
          sessionStorage.setItem('arcadery_ref_image', reader.result as string);
        } catch {}
        router.push(target);
      };
      reader.onerror = () => router.push(target);
      reader.readAsDataURL(uploadedImage.file);
      return;
    }
    router.push(target);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setUploadedImage({ file, preview });
    e.target.value = '';
  };

  const clearImage = () => {
    if (uploadedImage) URL.revokeObjectURL(uploadedImage.preview);
    setUploadedImage(null);
  };

  return (
    <main className={`min-h-screen font-[family-name:var(--font-inter)] transition-colors duration-500 ${dark ? 'dark bg-[#0a0a0f]' : 'bg-[#f8f8fa]'}`}>
      {/* PixelBlast Background - fixed behind everything; non-interactive so it doesn't swallow clicks meant for the nav/dropdown */}
      <div className="pointer-events-none fixed inset-0 z-0 opacity-50">
        <PixelBlast
          className=""
          style={{}}
          variant="square"
          color={dark ? '#8b7ec8' : '#7c6bc4'}
          pixelSize={4}
          speed={0.4}
          enableRipples={true}
          rippleSpeed={0.3}
          rippleThickness={0.12}
          rippleIntensityScale={1.2}
          edgeFade={0.15}
          patternScale={2}
          patternDensity={1}
          transparent={!dark}
        />
      </div>

      {/* Hero Section - Full viewport */}
      <section className="relative z-10 min-h-screen w-full overflow-hidden">
        {/* Navbar */}
        <nav className="relative z-10 flex items-center justify-between px-4 py-4 sm:px-8 sm:py-5">
          <Link
            href="/"
            className={`text-xl font-bold tracking-tight transition-colors ${dark ? 'text-white' : 'text-[#1b1b1b]'}`}
            style={{ fontFamily: 'var(--font-vintage), serif' }}
          >
            arc
          </Link>

          {/* Desktop nav */}
          <div className="hidden items-center gap-5 sm:flex">
            <Link
              href="/explore"
              className={`text-sm font-medium transition-colors ${dark ? 'text-white/70 hover:text-white' : 'text-[#565c65] hover:text-[#1b1b1b]'}`}
            >
              Explore
            </Link>
            <Link
              href="/templates"
              className={`text-sm font-medium transition-colors ${dark ? 'text-white/70 hover:text-white' : 'text-[#565c65] hover:text-[#1b1b1b]'}`}
            >
              Templates
            </Link>
            <Link
              href="/create/new"
              className={`text-sm font-medium transition-colors ${dark ? 'text-white/70 hover:text-white' : 'text-[#565c65] hover:text-[#1b1b1b]'}`}
            >
              Create
            </Link>
            <div className={`h-5 w-px ${dark ? 'bg-white/10' : 'bg-[#e5e5e5]'}`} />
            <CreditBalance compact />
            <AuthButton />
          </div>

          {/* Mobile: only the auth button + hamburger to keep tap targets clean */}
          <div className="flex items-center gap-2 sm:hidden">
            <AuthButton />
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label="Open menu"
              aria-expanded={mobileMenuOpen}
              className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
                dark ? 'text-white/70 hover:bg-white/[0.06] hover:text-white' : 'text-[#565c65] hover:bg-[#f0f0f0] hover:text-[#1b1b1b]'
              }`}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </nav>

        {/* Mobile drawer */}
        {mobileMenuOpen && (
          <div
            className={`relative z-20 border-b px-4 py-4 sm:hidden ${
              dark ? 'border-white/[0.06] bg-[#0a0a0f]/95 backdrop-blur-lg' : 'border-[#e5e5e5] bg-white/95 backdrop-blur-lg'
            }`}
          >
            <div className="flex flex-col gap-3">
              <Link
                href="/explore"
                onClick={() => setMobileMenuOpen(false)}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  dark ? 'text-white/80 hover:bg-white/[0.06]' : 'text-[#1b1b1b] hover:bg-[#f0f0f0]'
                }`}
              >
                Explore
              </Link>
              <Link
                href="/templates"
                onClick={() => setMobileMenuOpen(false)}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  dark ? 'text-white/80 hover:bg-white/[0.06]' : 'text-[#1b1b1b] hover:bg-[#f0f0f0]'
                }`}
              >
                Templates
              </Link>
              <Link
                href="/create/new"
                onClick={() => setMobileMenuOpen(false)}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  dark ? 'text-white/80 hover:bg-white/[0.06]' : 'text-[#1b1b1b] hover:bg-[#f0f0f0]'
                }`}
              >
                Create
              </Link>
              <div className={`flex items-center justify-between rounded-lg px-3 py-2 ${dark ? 'bg-white/[0.03]' : 'bg-[#f5f5f5]'}`}>
                <span className={`text-xs font-medium uppercase tracking-wider ${dark ? 'text-white/40' : 'text-[#919191]'}`}>
                  Credits
                </span>
                <CreditBalance compact />
              </div>
            </div>
          </div>
        )}

        {/* Hero Content */}
        <div className="relative z-10 flex min-h-[calc(100vh-72px)] flex-col items-center px-4 pt-[8vh] pb-12 sm:pt-[12vh]">
          <h1
            className={`mb-4 text-center text-5xl font-bold tracking-tight transition-colors sm:text-7xl md:text-8xl ${dark ? 'text-white' : 'text-[#1b1b1b]'}`}
            style={{ fontFamily: 'var(--font-vintage), serif' }}
          >
            arcadery
          </h1>
          <p className={`mb-4 max-w-xl text-center text-sm transition-colors sm:text-base ${dark ? 'text-white/70' : 'text-[#565c65]'}`}>
            Describe your game. We build it, deploy the contract, launch the token.
          </p>
          <div
            className={`mb-6 inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              dark
                ? 'border border-white/10 bg-white/[0.04] text-white/70'
                : 'border border-[#e5e5e5] bg-white/60 text-[#565c65]'
            }`}
          >
            <span>
              Sign in. Start with{' '}
              <strong className={dark ? 'text-white' : 'text-[#1b1b1b]'}>{WELCOME_BONUS} credits</strong>, free.
            </span>
          </div>

          {/* Prompt Input */}
          <div className={`mx-auto mb-6 w-full max-w-2xl overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-xl transition-colors ${dark ? 'border-white/15 bg-white/[0.08] shadow-black/30' : 'border-[#e5e5e5] bg-white/80 shadow-black/5'}`}>
            <div className="p-4 sm:p-5">
              {uploadedImage && (
                <div className="mb-3 flex items-center gap-2">
                  <div className="relative">
                    <img src={uploadedImage.preview} alt="Reference" className="h-16 w-16 rounded-lg object-cover border border-white/10" />
                    <button
                      onClick={clearImage}
                      className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] text-white hover:bg-red-600"
                    >
                      &times;
                    </button>
                  </div>
                  <span className={`text-xs ${dark ? 'text-white/40' : 'text-[#919191]'}`}>Reference image attached</span>
                </div>
              )}
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleGo();
                  }
                }}
                placeholder={planMode ? 'Describe your game idea to get a plan first...' : 'Describe your game idea...'}
                rows={2}
                className={`w-full resize-none border-0 bg-transparent outline-none transition-colors ${dark ? 'text-white placeholder-white/40' : 'text-[#1b1b1b] placeholder-[#919191]'}`}
              />
            </div>
            <div className={`flex items-center justify-between gap-2 border-t px-4 py-3 transition-colors sm:px-5 ${dark ? 'border-white/10' : 'border-[#f0f0f0]'}`}>
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageSelect}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  title="Upload reference image"
                  className={`rounded-lg p-2 transition-colors ${dark ? 'text-white/50 hover:bg-white/10 hover:text-white/80' : 'text-[#919191] hover:bg-[#f5f5f5] hover:text-[#565c65]'}`}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                </button>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { setPlanMode(!planMode); setPlanResult(null); }}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                    planMode
                      ? dark
                        ? 'border-purple-500/50 bg-purple-500/20 text-purple-300'
                        : 'border-purple-400 bg-purple-50 text-purple-700'
                      : dark
                        ? 'border-white/15 text-white/60 hover:bg-white/10'
                        : 'border-[#e5e5e5] text-[#565c65] hover:bg-[#f5f5f5]'
                  }`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  Plan mode
                </button>
                <button
                  onClick={handleGo}
                  disabled={planLoading}
                  className={`rounded-lg p-2 transition-colors ${planLoading ? 'animate-pulse' : ''} ${dark ? 'text-white/50 hover:bg-white/10 hover:text-white/80' : 'text-[#919191] hover:bg-[#f5f5f5] hover:text-[#565c65]'}`}
                >
                  {planLoading ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
                      <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Plan Result */}
          {planResult && (
            <div className={`mx-auto mb-6 w-full max-w-2xl overflow-hidden rounded-2xl border backdrop-blur-xl transition-all ${dark ? 'border-purple-500/30 bg-purple-500/[0.08]' : 'border-purple-200 bg-purple-50/80'}`}>
              <div className="p-5">
                <p className={`mb-3 text-sm leading-relaxed ${dark ? 'text-white/80' : 'text-[#1b1b1b]'}`}>{planResult.description}</p>
                {planResult.elements.length > 0 && (
                  <div className="space-y-1.5 mb-4">
                    {planResult.elements.map((el, i) => (
                      <div
                        key={i}
                        className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${dark ? 'bg-white/[0.05]' : 'bg-white/80'}`}
                      >
                        <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                          el.type === 'box' ? 'bg-blue-400' :
                          el.type === 'sphere' ? 'bg-green-400' :
                          el.type === 'light' ? 'bg-yellow-400' :
                          el.type === 'text' ? 'bg-pink-400' :
                          'bg-gray-400'
                        }`} />
                        <div>
                          <span className={`font-medium ${dark ? 'text-white/80' : 'text-[#1b1b1b]'}`}>{el.name}</span>
                          {el.role && <span className={`ml-1.5 ${dark ? 'text-white/40' : 'text-[#919191]'}`}>— {el.role}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      router.push(`/create/new?prompt=${encodeURIComponent(prompt.trim())}`);
                    }}
                    className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 transition-colors"
                  >
                    Create this game
                  </button>
                  <button
                    onClick={() => setPlanResult(null)}
                    className={`rounded-lg px-4 py-2 text-sm transition-colors ${dark ? 'text-white/50 hover:text-white/70' : 'text-[#919191] hover:text-[#565c65]'}`}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Suggestion Cards */}
          <div className="mx-auto grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => router.push(`/create/new?prompt=${encodeURIComponent(s)}`)}
                className={`rounded-xl border px-5 py-3.5 text-left text-sm backdrop-blur-sm transition-all ${dark ? 'border-white/15 bg-white/[0.06] text-white/65 hover:border-white/25 hover:bg-white/10 hover:text-white/85' : 'border-[#e5e5e5] bg-white/60 text-[#565c65] hover:border-[#c6cace] hover:bg-white/80 hover:text-[#1b1b1b]'}`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <div id="features" className={`relative z-10 transition-colors duration-500 ${dark ? 'bg-[#0a0a0f]' : 'bg-[#f8f8fa]'}`}>
        <Features dark={dark} />
      </div>

      {/* Showcase Section */}
      <section className={`relative z-10 overflow-hidden px-4 py-16 transition-colors duration-500 sm:py-24 ${dark ? 'bg-[#0a0a0f]' : 'bg-[#f8f8fa]'}`}>
        {/* Glow effects */}
        <div
          className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2"
          style={{
            width: '800px',
            height: '500px',
            background: dark
              ? 'radial-gradient(ellipse at center, rgba(177,158,239,0.12) 0%, rgba(177,158,239,0.04) 40%, transparent 70%)'
              : 'radial-gradient(ellipse at center, rgba(124,107,196,0.08) 0%, rgba(124,107,196,0.02) 40%, transparent 70%)',
          }}
        />
        <div
          className="pointer-events-none absolute -left-40 top-1/3"
          style={{
            width: '500px',
            height: '500px',
            background: dark
              ? 'radial-gradient(circle, rgba(139,92,246,0.08) 0%, transparent 60%)'
              : 'radial-gradient(circle, rgba(139,92,246,0.05) 0%, transparent 60%)',
          }}
        />
        <div
          className="pointer-events-none absolute -right-40 top-1/2"
          style={{
            width: '500px',
            height: '500px',
            background: dark
              ? 'radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 60%)'
              : 'radial-gradient(circle, rgba(99,102,241,0.05) 0%, transparent 60%)',
          }}
        />

        <div className="relative mx-auto max-w-5xl text-center">
          <h2 className={`mb-5 text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl md:leading-[1.15] lg:text-[3.25rem] ${dark ? 'text-white' : 'text-[#1b1b1b]'}`}>
            From prompt to playable<br />Web3 game in minutes
          </h2>
          <p className={`mx-auto mb-10 max-w-xl text-sm leading-relaxed sm:text-[15px] sm:mb-14 ${dark ? 'text-white/50' : 'text-[#565c65]'}`}>
            Describe your idea, AI builds the game. Launch your token, set up your economy, and earn from every player — no code required.
          </p>

          {/* Features flanking the mockup: stacked on mobile, 3-column from lg up */}
          <div className="flex flex-col items-center justify-center gap-10 lg:flex-row">
            {/* Left features — order-2 on mobile so the mockup leads visually */}
            <div className="order-2 grid w-full max-w-md grid-cols-1 gap-8 text-left sm:grid-cols-2 lg:order-1 lg:flex lg:w-52 lg:max-w-none lg:flex-col lg:gap-10">
              <ShowcaseFeature
                dark={dark}
                icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={dark ? '#8b7ec8' : '#7c6bc4'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>}
                title="AI builds it"
                desc="Prompt → playable Three.js game in seconds."
              />
              <ShowcaseFeature
                dark={dark}
                icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={dark ? '#8b7ec8' : '#7c6bc4'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>}
                title="Launch token"
                desc="Deploy your game token on Solana with one click."
              />
            </div>

            {/* Center mockup */}
            <div className="order-1 w-full max-w-lg flex-shrink-0 lg:order-2">
              <img
                src="/macbook.png"
                alt="Arcadery editor preview"
                className="w-full"
                width={5207}
                height={2814}
              />
            </div>

            {/* Right features */}
            <div className="order-3 grid w-full max-w-md grid-cols-1 gap-8 text-left sm:grid-cols-2 lg:flex lg:w-52 lg:max-w-none lg:flex-col lg:gap-10">
              <ShowcaseFeature
                dark={dark}
                icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={dark ? '#8b7ec8' : '#7c6bc4'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg>}
                title="Earn on-chain"
                desc="Set revenue splits, entry fees, tournament prizes."
              />
              <ShowcaseFeature
                dark={dark}
                icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={dark ? '#8b7ec8' : '#7c6bc4'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg>}
                title="You own it all"
                desc="Your game, your token, your keys. Export anytime."
              />
            </div>
          </div>
        </div>
      </section>
      {/* FAQ Section */}
      <section className={`relative z-10 px-4 py-16 transition-colors duration-500 sm:py-24 ${dark ? 'bg-[#0a0a0f]' : 'bg-white'}`}>
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-col gap-12 md:flex-row md:gap-20">
            {/* Left - sticky heading */}
            <div className="md:w-1/3">
              <div className="sticky top-24">
                <p className={`text-sm font-semibold uppercase tracking-wider ${dark ? 'text-[#8b7ec8]' : 'text-[#8b7ec8]'}`}>
                  Support
                </p>
                <h2 className={`mt-3 text-3xl font-bold tracking-tight md:text-4xl ${dark ? 'text-white' : 'text-[#1b1b1b]'}`}>
                  Frequently Asked Questions
                </h2>
                <p className={`mt-4 text-base ${dark ? 'text-white/50' : 'text-[#565c65]'}`}>
                  Can&apos;t find what you&apos;re looking for? Reach out to our{' '}
                  <a href="/contact" className={`font-medium ${dark ? 'text-[#8b7ec8] hover:text-[#9d92d0]' : 'text-[#8b7ec8] hover:text-[#7a6db8]'}`}>
                    support team
                  </a>.
                </p>
              </div>
            </div>

            {/* Right - accordion */}
            <div className="md:w-2/3">
              <div className={`divide-y border-t ${dark ? 'divide-white/10 border-white/10' : 'divide-[#e5e5e5] border-[#e5e5e5]'}`}>
                {[
                  { q: 'What is Arcadery?', a: 'Arcadery is an AI-powered game creation platform where you build, publish, and tokenize games — no code required. Describe your idea, our AI builds a playable Three.js game, and you can launch its token on Solana with one click. Click any element in the live preview to edit it or modify it with AI.' },
                  { q: 'How does on-chain game publishing work?', a: 'Each published game can launch its own SPL token on Solana via Meteora\'s Dynamic Bonding Curve. Players trade your token directly in-app — Buy/Sell with slippage controls — and once the curve graduates (80 SOL), the pool migrates to DAMM V2 for ongoing liquidity. Creators earn 70% of trading fees, the platform takes 30%.' },
                  { q: 'What kind of game economies can I create?', a: 'You can launch a bonding-curve token tied to your game, set up tournament prize pools, gate access with token holdings, or keep it free-to-play. The Token Economy Editor lets you configure ticker, supply, and curve parameters — Meteora\'s DBC handles the on-chain mechanics.' },
                  { q: 'How do I sign in? Do I need an account?', a: 'No email or password — just connect a Solana wallet (Phantom, Solflare, Backpack, etc.) and sign a message. We use Sign-In-With-Solana (SIWS), so your wallet is your identity. New users get 5 free credits to try the AI builder.' },
                  { q: 'Do I own my games and tokens?', a: 'Yes — 100%. Your scene JSON, generated assets, and deployed token all belong to you. You hold the mint authority keys and can export the project at any time. Arcadery is the creation tool, not the publisher.' },
                  { q: 'How much does it cost?', a: 'Editing is free. AI generation runs on credits paid in USDC for price stability: Starter (25 credits / $20) or Pro (100 credits / $75). Costs per action: AI prompt = 1 credit, image = 3, sprite sheet = 5, 3D model = 15, token launch = 10 credits + ~0.03 SOL on-chain rent. Platform fee comes from token trading only — if your game doesn\'t earn, we don\'t.' },
                ].map(({ q, a }) => (
                  <FaqItem key={q} question={q} answer={a} dark={dark} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className={`relative z-10 border-t px-4 py-16 transition-colors duration-500 ${dark ? 'border-white/10 bg-[#07070a]' : 'border-[#e5e5e5] bg-[#fafafa]'}`}>
        <div className="mx-auto max-w-5xl">
          <div className="grid grid-cols-1 gap-12 md:grid-cols-3">
            {/* Brand */}
            <div>
              <span
                className={`text-xl font-bold ${dark ? 'text-white' : 'text-[#1b1b1b]'}`}
                style={{ fontFamily: 'var(--font-vintage), serif' }}
              >
                arc
              </span>
              <p className={`mt-4 max-w-xs text-sm leading-relaxed ${dark ? 'text-white/40' : 'text-[#565c65]'}`}>
                The no-code Web3 game platform. Prompt → Game → Token → Earn.
              </p>
            </div>

            {/* Product Links */}
            <div>
              <h4 className={`mb-4 text-sm font-semibold ${dark ? 'text-white' : 'text-[#1b1b1b]'}`}>Product</h4>
              <ul className="space-y-3">
                {[
                  { label: 'Create', href: '/create/new' },
                  { label: 'Explore', href: '/explore' },
                  { label: 'Pricing', href: '/pricing' },
                  { label: 'Docs', href: '/docs' },
                ].map((item) => (
                  <li key={item.label}>
                    <a href={item.href} className={`text-sm transition-colors ${dark ? 'text-white/40 hover:text-white/70' : 'text-[#565c65] hover:text-[#1b1b1b]'}`}>
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Legal Links */}
            <div>
              <h4 className={`mb-4 text-sm font-semibold ${dark ? 'text-white' : 'text-[#1b1b1b]'}`}>Legal</h4>
              <ul className="space-y-3">
                {[
                  { label: 'Contact', href: '/contact' },
                  { label: 'Privacy', href: '/privacy' },
                  { label: 'Terms', href: '/terms' },
                  { label: 'About', href: '/about' },
                ].map((item) => (
                  <li key={item.label}>
                    <a href={item.href} className={`text-sm transition-colors ${dark ? 'text-white/40 hover:text-white/70' : 'text-[#565c65] hover:text-[#1b1b1b]'}`}>
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className={`mt-12 border-t pt-8 text-center text-sm ${dark ? 'border-white/10 text-white/30' : 'border-[#e5e5e5] text-[#919191]'}`}>
            &copy; 2026 Arcadery &mdash; All rights reserved
          </div>
        </div>
      </footer>
    </main>
  );
}

function ShowcaseFeature({ dark, icon, title, desc }: { dark: boolean; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div>
      <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${dark ? 'bg-[#7a6db8]/20' : 'bg-purple-100'}`}>
        {icon}
      </div>
      <h4 className={`mb-1.5 text-sm font-bold ${dark ? 'text-white' : 'text-[#1b1b1b]'}`}>{title}</h4>
      <p className={`text-[13px] leading-relaxed ${dark ? 'text-white/45' : 'text-[#565c65]'}`}>{desc}</p>
    </div>
  );
}

function FaqItem({ question, answer, dark }: { question: string; answer: string; dark: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className={`flex w-full cursor-pointer items-center justify-between gap-4 py-5 text-left ${dark ? 'text-white' : 'text-[#1b1b1b]'}`}
      >
        <span className="text-base font-medium">{question}</span>
        <span className={`flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-45' : ''} ${dark ? 'text-white/40' : 'text-[#919191]'}`}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </span>
      </button>
      <div
        className={`grid transition-all duration-300 ease-in-out ${
          open ? 'grid-rows-[1fr] opacity-100 pb-5' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <p className={`pr-8 text-base leading-relaxed ${dark ? 'text-white/40' : 'text-[#565c65]'}`}>
            {answer}
          </p>
        </div>
      </div>
    </div>
  );
}
