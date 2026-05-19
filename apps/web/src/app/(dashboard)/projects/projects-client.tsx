'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Clock, Search, LayoutGrid, List, FolderOpen } from 'lucide-react';
import { useModals } from '@/lib/ui/modals';

export interface Project {
  id: string;
  name: string;
  scene: { name?: string };
  created_at: string;
  updated_at: string;
}

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString();
}

export function ProjectsClient({
  projects,
  signedIn,
}: {
  projects: Project[];
  signedIn: boolean;
}) {
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');

  const filtered = search
    ? projects.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    : projects;

  return (
    // Matches /explore: full-width flex column instead of max-w-7xl. Same
    // grid expands to 5 cols on 2xl so ultrawide monitors don't end up with
    // four oversized cards.
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-white/[0.06] px-4 pt-5 pb-4 sm:px-6 md:px-8 lg:px-10">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-white">My Games</h1>
          <p className="mt-0.5 text-xs text-white/30">
            {projects.length} project{projects.length !== 1 ? 's' : ''}
          </p>
        </div>
        {signedIn ? (
          <Link
            href="/create/new"
            className="flex shrink-0 items-center gap-2 rounded-full bg-[#8b7ec8] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#7a6db8]"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New game</span>
            <span className="sm:hidden">New</span>
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => useModals.getState().openLogin()}
            className="flex shrink-0 items-center gap-2 rounded-full bg-[#8b7ec8] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#7a6db8]"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New game</span>
            <span className="sm:hidden">New</span>
          </button>
        )}
      </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 md:px-8 lg:px-10">
      {projects.length > 0 && (
        <div className="mb-6 flex items-center gap-3">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/25" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search games..."
              className="w-full rounded-lg border border-white/10 bg-white/[0.04] py-2 pl-9 pr-3 text-sm text-white/80 placeholder:text-white/25 outline-none transition-colors focus:border-[#8b7ec8]/40"
            />
          </div>
          <div
            className="flex items-center gap-0.5 rounded-lg border border-white/10 bg-white/[0.03] p-0.5"
            role="group"
            aria-label="View mode"
          >
            <button
              type="button"
              onClick={() => setView('grid')}
              aria-pressed={view === 'grid'}
              className={`rounded p-1.5 transition-colors ${
                view === 'grid' ? 'bg-[#8b7ec8]/15 text-[#8b7ec8]' : 'text-white/30 hover:text-white/60'
              }`}
              aria-label="Grid view"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setView('list')}
              aria-pressed={view === 'list'}
              className={`rounded p-1.5 transition-colors ${
                view === 'list' ? 'bg-[#8b7ec8]/15 text-[#8b7ec8]' : 'text-white/30 hover:text-white/60'
              }`}
              aria-label="List view"
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {!signedIn ? (
        <div className="flex min-h-[60vh] flex-col items-center justify-center text-white/40">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#8b7ec8]/[0.08]">
            <FolderOpen className="h-7 w-7 text-[#8b7ec8]/60" />
          </div>
          <p className="text-sm font-medium mb-1 text-white/80">Sign in to see your games</p>
          <p className="text-xs mb-4 text-white/25">
            Connect your wallet to view drafts and published games.
          </p>
          <button
            type="button"
            onClick={() => useModals.getState().openLogin()}
            className="rounded-full bg-[#8b7ec8] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#7a6db8]"
          >
            Connect wallet
          </button>
        </div>
      ) : projects.length === 0 ? (
        <div className="flex min-h-[60vh] flex-col items-center justify-center text-white/40">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.04]">
            <Plus className="h-7 w-7 opacity-40" />
          </div>
          <p className="text-sm font-medium mb-1">No games yet</p>
          <p className="text-xs mb-4 text-white/25">Create your first game to get started</p>
          <Link
            href="/create/new"
            className="rounded-full bg-[#8b7ec8] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#7a6db8]"
          >
            Create game
          </Link>
        </div>
      ) : (
        <div className={view === 'grid' ? 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5' : 'space-y-2'}>
          {filtered.map((project) => (
            <Link
              key={project.id}
              href={`/create/${project.id}`}
              className={`group rounded-xl border border-white/[0.06] bg-white/[0.02] transition-all hover:border-white/15 hover:bg-white/[0.04] ${
                view === 'list' ? 'flex items-center gap-4 p-4' : ''
              }`}
            >
              {view === 'grid' ? (
                <>
                  <div className="flex aspect-[16/10] items-center justify-center overflow-hidden rounded-t-xl bg-[#12121a]">
                    <span className="text-3xl font-bold tracking-tight text-white/10">
                      {project.name.slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div className="p-3">
                    <h3 className="truncate text-sm font-semibold text-white/80">{project.name}</h3>
                    <div className="mt-2 flex items-center gap-1.5 text-[11px] text-white/25">
                      <Clock className="h-3 w-3" />
                      {timeAgo(project.updated_at)}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#12121a] text-xs font-bold text-white/15">
                    {project.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-white/80">{project.name}</h3>
                    <p className="text-xs text-white/25">{timeAgo(project.updated_at)}</p>
                  </div>
                </>
              )}
            </Link>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
