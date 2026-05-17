'use client';

import { useState } from 'react';
import Link from 'next/link';

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const TABS = ['Get Started', 'Platform', 'Token Economy', 'Guides'] as const;

type SidebarSection = { title: string; items: { id: string; label: string }[] };

const SIDEBAR: Record<string, SidebarSection[]> = {
  'Get Started': [
    {
      title: 'Introduction',
      items: [
        { id: 'start-here', label: 'Start Here' },
        { id: 'why-arcadery', label: 'Why Arcadery?' },
      ],
    },
    {
      title: 'Quick Start',
      items: [
        { id: 'create-first-game', label: 'Create Your First Game' },
        { id: 'wallet-setup', label: 'Wallet Setup' },
        { id: 'publish-game', label: 'Publishing a Game' },
      ],
    },
  ],
  Platform: [
    {
      title: 'AI Engine',
      items: [
        { id: 'ai-overview', label: 'Overview' },
        { id: 'prompt-guide', label: 'Prompt Guide' },
        { id: 'structured-output', label: 'Structured Output' },
      ],
    },
    {
      title: 'Visual Editor',
      items: [
        { id: 'editor-overview', label: 'Overview' },
        { id: 'elements', label: 'Elements & Primitives' },
        { id: 'shortcuts', label: 'Keyboard Shortcuts' },
      ],
    },
    {
      title: 'Assets',
      items: [
        { id: 'asset-upload', label: 'Uploading Assets' },
        { id: 'templates', label: 'Game Templates' },
      ],
    },
  ],
  'Token Economy': [
    {
      title: 'Fundamentals',
      items: [
        { id: 'tokenization', label: 'Game Tokenization' },
        { id: 'bonding-curves', label: 'Bonding Curves' },
      ],
    },
    {
      title: 'Economy Models',
      items: [
        { id: 'free-to-play', label: 'Free to Play' },
        { id: 'play-to-earn', label: 'Play to Earn' },
        { id: 'tournament', label: 'Tournaments' },
      ],
    },
    {
      title: 'Revenue',
      items: [
        { id: 'creator-fees', label: 'Creator Fees' },
        { id: 'platform-fees', label: 'Platform Fees' },
      ],
    },
  ],
  Guides: [
    {
      title: 'Tutorials',
      items: [
        { id: 'platformer-guide', label: 'Build a Platformer' },
        { id: 'shooter-guide', label: 'Build a Space Shooter' },
        { id: 'puzzle-guide', label: 'Build a Puzzle Game' },
      ],
    },
    {
      title: 'Advanced',
      items: [
        { id: 'code-editor', label: 'Using the Code Editor' },
        { id: 'api-reference', label: 'API Reference' },
        { id: 'embed-games', label: 'Embedding Games' },
      ],
    },
    {
      title: 'Community',
      items: [
        { id: 'community-links', label: 'Official Links' },
        { id: 'faq', label: 'FAQ' },
      ],
    },
  ],
};

type DocPage = { category: string; title: string; desc: string; toc: string[]; content: string };

const PAGES: Record<string, DocPage> = {
  'start-here': {
    category: 'Introduction',
    title: 'Start Here',
    desc: 'Overview of the Arcadery platform. Get oriented and start building.',
    toc: ['What is Arcadery?', 'Key Features', 'How It Works', 'Next Steps'],
    content: `## What is Arcadery?

**Arcadery** is an AI-powered game creation platform on Solana. Describe your game idea in plain English, our AI builds it, and you can publish it on-chain with its own token economy — all without writing a single line of code.

Think of it as the intersection of three things:
- **ChatGPT** for game design (natural language → playable game)
- **Canva** for game editing (visual, drag-and-drop, no-code)
- **On-chain economics** (one-click token deployment on Solana)

## Key Features

**AI Game Builder**
Describe what you want. The AI generates a complete game scene with elements, positions, colors, and mechanics. Keep iterating through conversation until it's perfect.

**Visual Scene Editor**
A full 3D/2D editor in the browser. Click any element to select it, drag to reposition, edit properties in real-time. Switch between 2D and 3D views. Undo/redo everything.

**On-Chain Publishing**
One click publishes your game to a public URL. Optionally launch an SPL token with a bonding curve — players buy tokens to play, you earn from every transaction.

**Asset Management**
Upload your own sprites and images, or use AI to generate them. Browse community assets and game templates to get started faster.

## How It Works

\`\`\`
1. Connect  →  Wallet, X, or Google login
2. Describe →  Tell the AI what game you want
3. Build    →  AI generates, you refine visually
4. Publish  →  One click to public URL on Solana
5. Earn     →  Token economy generates revenue
\`\`\`

The entire process takes under 5 minutes from idea to published game.

## Next Steps

- **[Create Your First Game](#create-first-game)** — step-by-step walkthrough
- **[Wallet Setup](#wallet-setup)** — connect or create a Solana wallet
- **[AI Prompt Guide](#prompt-guide)** — get the best results from the AI
- **[Game Tokenization](#tokenization)** — understand the token economy`,
  },
  'why-arcadery': {
    category: 'Introduction',
    title: 'Why Arcadery?',
    desc: 'The convergence of AI, no-code, and blockchain creates a new category.',
    toc: ['The Creator Gap', 'AI Changes Everything', 'On-Chain Ownership', 'Comparison'],
    content: `## The Creator Gap

There are **3 billion gamers** worldwide but only ~1 million game developers. Traditional tools (Unity, Unreal, Godot) require months of learning. This creates an enormous gap between people with ideas and people who can build.

## AI Changes Everything

Arcadery uses Google Gemini to translate natural language into game scenes. The AI understands game design patterns and generates complete, playable scenes from descriptions.

Anyone who can describe a game can now build one. The barrier drops from years of training to minutes of conversation.

## On-Chain Ownership

Traditional platforms (Steam, App Store) take 30% and own distribution. Creators have no leverage.

Arcadery publishes on Solana. Creators own their smart contract, token, and revenue stream. The platform takes a fee only when the creator earns.

## Comparison

| | Traditional | No-Code Tools | Arcadery |
|---|---|---|---|
| **Learning curve** | Years | Weeks | Minutes |
| **Output quality** | Professional | Limited | AI-enhanced |
| **Monetization** | Platform takes 30% | Varies | Creator-owned tokens |
| **Blockchain** | None | None | Solana-native |
| **AI assistance** | None | Basic | Full scene generation |`,
  },
  'create-first-game': {
    category: 'Quick Start',
    title: 'Create Your First Game',
    desc: 'Go from zero to published game in 5 minutes.',
    toc: ['Step 1: Connect', 'Step 2: Describe Your Game', 'Step 3: Refine', 'Step 4: Publish'],
    content: `## Step 1: Connect

Visit [arcadery.xyz](https://arcadery.xyz) and click **Start Creating**. You can connect with:
- **Solana wallet** (Phantom, Solflare, Backpack)
- **X (Twitter)** account
- **Google** account
- **Email**

Social logins automatically create an embedded Solana wallet for you.

## Step 2: Describe Your Game

In the AI chat panel on the left, type what you want:

> "Create a platformer with a blue player, red obstacles, and a dark background"

The AI will generate elements in the 3D canvas. You'll see them appear immediately.

**Pro tips:**
- Be specific about colors, sizes, and positions
- Mention the game type (platformer, shooter, puzzle)
- Iterate: "make the player bigger", "add 3 more obstacles"

## Step 3: Refine

Use the visual editor to fine-tune your game:

| Action | How |
|---|---|
| Select element | Click on it |
| Move element | Drag with mouse |
| Scale/rotate | Use toolbar (W/E/R keys) |
| Delete element | Select + Delete key |
| Undo | Ctrl+Z |
| Redo | Ctrl+Shift+Z |
| Add element | + button in toolbar |
| Switch 2D/3D | Toggle in top-left |

## Step 4: Publish

Click **Publish** in the top bar. You'll get:
- A public URL: \`arcadery.xyz/play/your-game\`
- An embed code for websites
- A share link

Your game is now live and playable by anyone.`,
  },
  tokenization: {
    category: 'Fundamentals',
    title: 'Game Tokenization',
    desc: 'How every game can launch its own token economy on Solana.',
    toc: ['Overview', 'How It Works', 'Token Parameters', 'Security'],
    content: `## Overview

Every game published on Arcadery can optionally launch its own **SPL token** on Solana. This token creates an economy around the game — players buy tokens to participate, high performers earn rewards, and creators earn from every transaction.

## How It Works

\`\`\`
Creator publishes game
        ↓
Clicks "Tokenize"
        ↓
Chooses token name, symbol, parameters
        ↓
Smart contract deploys on Solana (~$0.01)
        ↓
Game has its own tradeable token
        ↓
Players buy tokens → play → earn rewards
Creator earns fee on every transaction
\`\`\`

## Token Parameters

| Parameter | Description | Default |
|---|---|---|
| **Token name** | Display name (e.g., "Neon Sprint") | Game name |
| **Token symbol** | Ticker (e.g., "NEON") | Auto-generated |
| **Initial supply** | Starting token supply | 1,000,000 |
| **Bonding curve** | Price curve shape | Linear |
| **Creator fee** | % of each transaction | 5% |
| **Entry fee** | Cost to play (in tokens) | 0 (free) |

## Security

All smart contracts are:
- **Open-source** Anchor programs on Solana
- **Battle-tested** bonding curves with rate limits
- **Anti-bot** protections (cooldown periods, tx limits)
- **Creator-controlled** — you hold the authority keys

The blockchain enforces all rules. No trust required.`,
  },
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function DocsPage() {
  const [activeTab, setActiveTab] = useState<string>('Get Started');
  const [activeDoc, setActiveDoc] = useState('start-here');
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  const doc = PAGES[activeDoc];
  const sidebarSections = SIDEBAR[activeTab] || [];

  // Search across all docs
  const searchResults = search.trim().length > 1
    ? Object.entries(PAGES)
        .filter(([_, page]) => {
          const q = search.toLowerCase();
          return page.title.toLowerCase().includes(q) ||
                 page.desc.toLowerCase().includes(q) ||
                 page.content.toLowerCase().includes(q);
        })
        .map(([id, page]) => {
          // Find which tab this page belongs to
          let tab = '';
          for (const [tabName, sections] of Object.entries(SIDEBAR)) {
            for (const section of sections) {
              if (section.items.find(i => i.id === id)) { tab = tabName; break; }
            }
            if (tab) break;
          }
          // Extract a snippet around the match
          const q = search.toLowerCase();
          const idx = page.content.toLowerCase().indexOf(q);
          const snippet = idx >= 0
            ? '...' + page.content.slice(Math.max(0, idx - 40), idx + 80).replace(/[#*`\n]/g, ' ').trim() + '...'
            : page.desc;
          return { id, title: page.title, category: page.category, snippet, tab };
        })
    : [];

  return (
    <div className="flex flex-col h-screen bg-[#0D0D0E] text-white">
      {/* Top header */}
      <header className="flex items-center justify-between h-14 px-6 border-b border-white/[0.06] flex-shrink-0">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-lg font-bold" style={{ fontFamily: 'var(--font-vintage, serif)' }}>arc</span>
            <span className="text-white/30 text-sm font-medium">Docs</span>
          </Link>
        </div>

        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
              placeholder="Search..."
              className="w-64 bg-white/[0.04] border border-white/[0.08] rounded-lg pl-8 pr-8 py-1.5 text-sm text-white placeholder:text-white/25 outline-none focus:border-white/20"
            />
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-white/15 border border-white/10 rounded px-1">⌘K</span>

            {/* Search results dropdown */}
            {searchFocused && searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-[#16161d] border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden z-50 max-h-80 overflow-y-auto">
                {searchResults.map((r) => (
                  <button
                    key={r.id}
                    onMouseDown={() => {
                      if (r.tab) setActiveTab(r.tab);
                      setActiveDoc(r.id);
                      setSearch('');
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-white/[0.06] transition-colors border-b border-white/[0.04] last:border-0"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-[#8b7ec8] font-medium">{r.category}</span>
                    </div>
                    <p className="text-sm text-white font-medium mt-0.5">{r.title}</p>
                    <p className="text-xs text-white/30 mt-0.5 line-clamp-1">{r.snippet}</p>
                  </button>
                ))}
              </div>
            )}

            {searchFocused && search.trim().length > 1 && searchResults.length === 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-[#16161d] border border-white/[0.08] rounded-xl shadow-2xl z-50 px-4 py-6 text-center">
                <p className="text-sm text-white/30">No results for &quot;{search}&quot;</p>
              </div>
            )}
          </div>

          <Link href="/" className="text-sm font-medium text-white bg-[#8b7ec8] hover:bg-[#7a6db8] px-4 py-1.5 rounded-lg transition-colors">
            arcadery.xyz →
          </Link>
        </div>
      </header>

      {/* Tab navigation */}
      <div className="flex items-center gap-6 px-6 h-11 border-b border-white/[0.06] flex-shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setActiveTab(tab);
              const firstItem = SIDEBAR[tab]?.[0]?.items?.[0];
              if (firstItem && PAGES[firstItem.id]) setActiveDoc(firstItem.id);
            }}
            className={`text-sm font-medium pb-2.5 border-b-2 transition-colors -mb-px ${
              activeTab === tab
                ? 'text-white border-white'
                : 'text-white/40 border-transparent hover:text-white/70'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar */}
        <aside className="w-60 flex-shrink-0 border-r border-white/[0.06] overflow-y-auto py-5 px-4">
          <nav className="space-y-6">
            {sidebarSections.map((section) => (
              <div key={section.title}>
                <p className="text-xs font-semibold text-white/80 mb-2">{section.title}</p>
                <div className="space-y-0.5">
                  {section.items.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => { if (PAGES[item.id]) setActiveDoc(item.id); }}
                      className={`block w-full text-left px-3 py-1.5 rounded-md text-[13px] transition-colors ${
                        activeDoc === item.id
                          ? 'bg-white/[0.08] text-white font-medium'
                          : PAGES[item.id]
                          ? 'text-white/50 hover:text-white/70 hover:bg-white/[0.04]'
                          : 'text-white/25 cursor-default'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
          {doc ? (
            <div className="flex">
              <div className="flex-1 max-w-3xl px-10 py-8">
                {/* Breadcrumb */}
                <p className="text-xs text-white/30 mb-1">{doc.category}</p>

                {/* Title + Copy */}
                <div className="flex items-start justify-between mb-2">
                  <h1 className="text-3xl font-bold tracking-tight">{doc.title}</h1>
                  <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-xs text-white/40 hover:text-white/70 hover:bg-white/[0.06] transition-colors mt-1 flex-shrink-0">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>
                    Copy page
                  </button>
                </div>

                <p className="text-white/40 text-base mb-8 leading-relaxed">{doc.desc}</p>

                {/* Rendered content */}
                <article
                  className="prose-custom"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(doc.content) }}
                />

                {/* Ask a question */}
                <div className="mt-12 mb-8">
                  <div className="relative">
                    <input
                      placeholder="Ask a question..."
                      className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl pl-4 pr-12 py-3.5 text-sm text-white placeholder:text-white/25 outline-none focus:border-white/15"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                      <span className="text-[10px] text-white/15 border border-white/10 rounded px-1.5 py-0.5">⌘I</span>
                      <button className="w-7 h-7 rounded-lg bg-white/[0.08] flex items-center justify-center text-white/30 hover:text-white/60">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 10l7-7m0 0l7 7m-7-7v18" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right: On this page */}
              {doc.toc.length > 0 && (
                <div className="w-48 flex-shrink-0 py-8 pr-6 hidden xl:block">
                  <div className="sticky top-8">
                    <p className="text-xs font-semibold text-white/50 mb-3 flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>
                      On this page
                    </p>
                    <nav className="space-y-1.5">
                      {doc.toc.map((item, i) => (
                        <a
                          key={i}
                          href={`#${item.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                          className="block text-[13px] text-white/30 hover:text-white/60 transition-colors"
                        >
                          {item}
                        </a>
                      ))}
                    </nav>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-white/20 text-sm">
              Select a page from the sidebar
            </div>
          )}
        </main>
      </div>

      <style jsx global>{`
        .prose-custom h2 {
          font-size: 1.25rem;
          font-weight: 700;
          color: white;
          margin-top: 2.5rem;
          margin-bottom: 1rem;
          letter-spacing: -0.01em;
        }
        .prose-custom h3 {
          font-size: 1rem;
          font-weight: 600;
          color: rgba(255,255,255,0.9);
          margin-top: 1.5rem;
          margin-bottom: 0.75rem;
        }
        .prose-custom p {
          color: rgba(255,255,255,0.55);
          line-height: 1.75;
          margin-bottom: 1rem;
          font-size: 0.9375rem;
        }
        .prose-custom strong {
          color: white;
          font-weight: 600;
        }
        .prose-custom code {
          color: #8b7ec8;
          background: rgba(255,255,255,0.05);
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 0.8125rem;
        }
        .prose-custom pre {
          background: #0a0a12;
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 12px;
          padding: 1rem 1.25rem;
          margin: 1.25rem 0;
          overflow-x: auto;
        }
        .prose-custom pre code {
          background: none;
          padding: 0;
          color: rgba(255,255,255,0.5);
          font-size: 0.8125rem;
          line-height: 1.6;
        }
        .prose-custom ul, .prose-custom ol {
          margin: 0.75rem 0;
          padding-left: 1.25rem;
        }
        .prose-custom li {
          color: rgba(255,255,255,0.55);
          margin-bottom: 0.375rem;
          font-size: 0.9375rem;
          line-height: 1.6;
        }
        .prose-custom table {
          width: 100%;
          border-collapse: collapse;
          margin: 1.25rem 0;
          font-size: 0.875rem;
        }
        .prose-custom th {
          text-align: left;
          color: rgba(255,255,255,0.5);
          font-weight: 500;
          padding: 0.5rem 0.75rem;
          border-bottom: 1px solid rgba(255,255,255,0.08);
        }
        .prose-custom td {
          color: rgba(255,255,255,0.45);
          padding: 0.5rem 0.75rem;
          border-bottom: 1px solid rgba(255,255,255,0.04);
        }
        .prose-custom blockquote {
          border-left: 2px solid rgba(139,126,200,0.4);
          padding-left: 1rem;
          margin: 1rem 0;
          color: rgba(255,255,255,0.4);
          font-style: italic;
        }
        .prose-custom a {
          color: #8b7ec8;
          text-decoration: none;
        }
        .prose-custom a:hover {
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Markdown renderer                                                  */
/* ------------------------------------------------------------------ */

function renderMarkdown(md: string): string {
  let html = md.trim();

  // Code blocks (before other processing)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');

  // Headers with IDs
  html = html.replace(/^### (.+)$/gm, (_, t) => `<h3 id="${slugify(t)}">${t}</h3>`);
  html = html.replace(/^## (.+)$/gm, (_, t) => `<h2 id="${slugify(t)}">${t}</h2>`);

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Tables
  html = html.replace(/((?:^\|.+\|$\n?)+)/gm, (tableBlock) => {
    const rows = tableBlock.trim().split('\n');
    let result = '<table>';

    rows.forEach((row, i) => {
      const cells = row.split('|').filter(Boolean).map(c => c.trim());
      if (cells.every(c => /^[-:]+$/.test(c))) return; // separator row

      const tag = i === 0 ? 'th' : 'td';
      result += '<tr>' + cells.map(c => `<${tag}>${c}</${tag}>`).join('') + '</tr>';
    });

    return result + '</table>';
  });

  // Blockquotes
  html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');

  // Lists
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>');
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

  // Links
  html = html.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');

  // Paragraphs (lines that don't start with HTML tags)
  html = html.replace(/^(?!<[a-z/])((?!\s*$).+)$/gm, '<p>$1</p>');

  // Clean up empty lines
  html = html.replace(/\n{2,}/g, '\n');

  return html;
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
