'use client';

import { useState, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useEditorStore } from '../stores/editor-store';
import { useKeyboardShortcuts } from '../hooks/use-keyboard-shortcuts';
import { useSelectionKeyboard } from '../hooks/use-selection-keyboard';
import { AiChatPanel } from './panels/ai-chat-panel';
import { AnimationsPanel } from './panels/animations-panel';
import { EditorViewport } from '../viewport/editor-viewport';
import { CanvasToolbar } from './canvas-toolbar';
import { PageTabs, IntroPageEditor, EndPageEditor } from './page-editor';
import type { AssetManagerProps } from './asset-manager';
import type { AssetPackInfo } from './asset-library';

const CodeEditor = dynamic(() => import('./code-editor').then((m) => m.CodeEditor), {
  ssr: false,
});
const AssetManager = dynamic(() => import('./asset-manager').then((m) => m.AssetManager), {
  ssr: false,
});
const ShareModal = dynamic(() => import('./share-modal').then((m) => m.ShareModal), {
  ssr: false,
});
const PublishFlow = dynamic(
  () => import('./publish-flow').then((m) => m.PublishFlow),
  { ssr: false },
);
const GameMechanicsSettings = dynamic(
  () => import('./game-mechanics-settings').then((m) => m.GameMechanicsSettings),
  { ssr: false },
);
const AssetLibrary = dynamic(() => import('./asset-library').then((m) => m.AssetLibrary), {
  ssr: false,
});
const OnboardingCoach = dynamic(
  () => import('./onboarding-coach').then((m) => m.OnboardingCoach),
  { ssr: false },
);

export type { AssetPackInfo };

type Tab = 'preview' | 'assets' | 'code';

export interface EditorShellProps {
  projectId?: string;
  projectName?: string;
  saveStatus?: 'saved' | 'saving' | 'error' | 'idle';
  onLogout?: () => void;
  assetProps?: AssetManagerProps;
  onPublish?: () => Promise<string | null>;
  initialPrompt?: string;
  assetPacks?: AssetPackInfo[];
  topBarRightSlot?: React.ReactNode;
}

export function EditorShell({ projectId, projectName, saveStatus, onLogout, assetProps, onPublish, initialPrompt, assetPacks = [], topBarRightSlot }: EditorShellProps) {
  const [activeTab, setActiveTab] = useState<Tab>('preview');
  // Default open on desktop, closed on mobile (chat would otherwise cover the
  // viewport on first paint). Picked once on mount; user controls thereafter.
  const [sidebarVisible, setSidebarVisible] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth >= 768;
  });
  const [showHistory, setShowHistory] = useState(false);
  const [shareSlug, setShareSlug] = useState<string | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [mechanicsOpen, setMechanicsOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [consoleHeight, setConsoleHeight] = useState(200);
  const [consoleLogs, setConsoleLogs] = useState<Array<{ type: string; message: string; time: string }>>([]);
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);
  const viewMode = useEditorStore((s) => s.viewMode);
  const editorPage = useEditorStore((s) => s.editorPage);
  useKeyboardShortcuts();
  useSelectionKeyboard();

  // AI chat panel dispatches these to open editor surfaces directly.
  useEffect(() => {
    const onMechanics = () => setMechanicsOpen(true);
    const onCode = () => setActiveTab('code');
    const onAssets = () => setActiveTab('assets');
    window.addEventListener('arcadery:open-mechanics', onMechanics);
    window.addEventListener('arcadery:open-code', onCode);
    window.addEventListener('arcadery:open-assets', onAssets);
    return () => {
      window.removeEventListener('arcadery:open-mechanics', onMechanics);
      window.removeEventListener('arcadery:open-code', onCode);
      window.removeEventListener('arcadery:open-assets', onAssets);
    };
  }, []);

  // Capture console logs — filter out framework noise (Privy, Solana, Next.js, React)
  useEffect(() => {
    const origLog = console.log;
    const origWarn = console.warn;
    const origError = console.error;
    const NOISE = /privy|solana|wallet|next|react|hydrat|chunk|webpack|hmr|__next/i;
    const addLog = (type: string, args: unknown[]) => {
      const message = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
      if (NOISE.test(message)) return; // skip framework noise
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setConsoleLogs(prev => [...prev.slice(-99), { type, message, time }]);
    };
    console.log = (...args) => { origLog(...args); addLog('LOG', args); };
    console.warn = (...args) => { origWarn(...args); addLog('WARN', args); };
    console.error = (...args) => { origError(...args); addLog('ERROR', args); };
    return () => { console.log = origLog; console.warn = origWarn; console.error = origError; };
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden" style={{ backgroundColor: '#0a0a0f', color: '#fff', fontFamily: 'var(--font-inter, system-ui, sans-serif)' }}>
      <TopBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        sidebarVisible={sidebarVisible}
        onToggleSidebar={() => setSidebarVisible(!sidebarVisible)}
        showHistory={showHistory}
        onToggleHistory={() => setShowHistory(!showHistory)}
        saveStatus={saveStatus}
        onLogout={onLogout}
        onOpenPublish={() => setPublishOpen(true)}
        onSettings={() => setMechanicsOpen(true)}
        rightSlot={topBarRightSlot}
      />

      <div className="flex flex-1 overflow-hidden">
        <AiChatPanel
          open={sidebarVisible}
          onClose={() => setSidebarVisible(false)}
          showHistory={showHistory}
          onCloseHistory={() => setShowHistory(false)}
          initialPrompt={initialPrompt}
        />

        <main className="flex-1 relative" style={{ backgroundColor: '#08080d' }}>
          <div
            className="absolute inset-0 pointer-events-none opacity-30"
            style={{
              backgroundImage: 'linear-gradient(90deg, rgba(177, 158, 239, 0.08) 1px, transparent 1px), linear-gradient(0deg, rgba(177, 158, 239, 0.08) 1px, transparent 1px)',
              backgroundSize: '80px 80px',
            }}
          />

          {activeTab === 'preview' && (
            <>
              <div className="absolute inset-0 z-10">
                <EditorViewport />
              </div>
              {/* Intro / End page editors overlay the canvas (z-20, below the
                  top controls at z-30 so PageTabs stays clickable). */}
              {editorPage !== 'game' && (
                <div className="absolute inset-0 z-20 overflow-hidden bg-[#0e0e12] pt-16">
                  {editorPage === 'intro' ? <IntroPageEditor /> : <EndPageEditor />}
                </div>
              )}
              {/* Mini animator inspector — auto-shows when a single sprite
                  element is selected, hidden otherwise. Lives above the
                  viewport but below the modals. */}
              <AnimationsPanel assets={assetProps?.assets ?? []} />
              <div className="absolute inset-x-0 top-0 z-30 flex items-start justify-between pointer-events-none px-3 pt-3">
                {/* Left: 2D/3D + Library (Play/Undo/Redo live in the canvas toolbar) */}
                <div className="pointer-events-auto flex items-center gap-2">
                  <div className="flex bg-black/40 backdrop-blur rounded-lg p-0.5 border border-white/10" role="group" aria-label="Camera mode">
                    <button
                      type="button"
                      onClick={() => useEditorStore.getState().setViewMode('2d')}
                      aria-pressed={viewMode === '2d'}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${viewMode === '2d' ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white'}`}
                    >
                      2D
                    </button>
                    <button
                      type="button"
                      onClick={() => useEditorStore.getState().setViewMode('3d')}
                      aria-pressed={viewMode === '3d'}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${viewMode === '3d' ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white'}`}
                    >
                      3D
                    </button>
                  </div>
                  <PageTabs />
                  {assetPacks.length > 0 && (
                    <button
                      onClick={() => setLibraryOpen(true)}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium border border-[#8b7ec8]/30 bg-[#8b7ec8]/15 text-[#8b7ec8] hover:bg-[#8b7ec8]/25 backdrop-blur transition-colors"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m0 0v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                      </svg>
                      Library
                    </button>
                  )}
                </div>
                {/* Center toolbar: Play, Add, Move/Rotate/Scale, Undo/Redo */}
                <div className="pointer-events-auto">
                  <CanvasToolbar />
                </div>
                <div className="w-[140px]" />
              </div>
            </>
          )}

          {activeTab === 'assets' && <AssetManager {...assetProps} />}

          {activeTab === 'code' && <CodeEditor />}

          {/* Console button - bottom right + slide-up panel */}
          {activeTab === 'preview' && (
            <div className="absolute inset-0 z-30 pointer-events-none flex flex-col justify-end">
              {/* Console panel - slides up from bottom, full width, resizable */}
              {consoleOpen && (
                <div className="pointer-events-auto border-t border-white/[0.06] flex flex-col w-full" style={{ backgroundColor: '#0a0a0f', height: consoleHeight }}>
                  {/* Resize handle */}
                  <div
                    className="h-1.5 cursor-ns-resize flex items-center justify-center hover:bg-white/[0.06] transition-colors shrink-0"
                    onMouseDown={(e) => {
                      dragRef.current = { startY: e.clientY, startH: consoleHeight };
                      const onMove = (ev: MouseEvent) => {
                        if (!dragRef.current) return;
                        const diff = dragRef.current.startY - ev.clientY;
                        setConsoleHeight(Math.max(100, Math.min(500, dragRef.current.startH + diff)));
                      };
                      const onUp = () => {
                        dragRef.current = null;
                        window.removeEventListener('mousemove', onMove);
                        window.removeEventListener('mouseup', onUp);
                      };
                      window.addEventListener('mousemove', onMove);
                      window.addEventListener('mouseup', onUp);
                    }}
                  >
                    <div className="w-8 h-0.5 rounded-full bg-white/15" />
                  </div>
                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-1.5 border-b border-white/[0.04] shrink-0">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-white/50 uppercase tracking-wider text-xs">Console</span>
                      <span className="flex items-center justify-center rounded-full bg-white/10 px-1.5 min-w-[20px] h-5 text-[10px] font-medium text-white/40">
                        {consoleLogs.length}
                      </span>
                      {consoleLogs.filter(l => l.type === 'ERROR').length > 0 ? (
                        <span className="text-[10px] font-medium text-red-400">
                          {consoleLogs.filter(l => l.type === 'ERROR').length} error{consoleLogs.filter(l => l.type === 'ERROR').length > 1 ? 's' : ''}
                        </span>
                      ) : (
                        <span className="text-[10px] text-green-400/60">0 errors</span>
                      )}
                    </div>
                    <button onClick={() => setConsoleOpen(false)} className="text-white/30 hover:text-white/60 text-xs transition-colors">Hide</button>
                  </div>
                  {/* Logs */}
                  <div className="flex-1 overflow-y-auto">
                    {consoleLogs.length === 0 ? (
                      <p className="px-4 py-8 text-xs text-white/20 text-center">No logs yet.</p>
                    ) : (
                      consoleLogs.map((log, i) => (
                        <div
                          key={i}
                          className={`flex items-start justify-between px-4 py-2 border-b border-white/[0.03] text-xs ${
                            log.type === 'ERROR' ? 'bg-red-500/[0.04]' : log.type === 'WARN' ? 'bg-amber-500/[0.04]' : ''
                          }`}
                        >
                          <div className="flex items-start gap-3 min-w-0">
                            <span className={`shrink-0 font-medium ${
                              log.type === 'ERROR' ? 'text-red-400' : log.type === 'WARN' ? 'text-amber-400' : 'text-white/30'
                            }`}>
                              {log.type}
                            </span>
                            <span className="text-white/60 break-all">{log.message}</span>
                          </div>
                          <span className="shrink-0 ml-4 text-white/15">{log.time}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Console toggle button - bottom right */}
              {!consoleOpen && (
                <div className="pointer-events-auto absolute bottom-3 left-3">
                  <button
                    onClick={() => setConsoleOpen(true)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/10 text-white/50 hover:text-white/70 hover:bg-white/[0.05] transition-colors text-xs backdrop-blur-sm"
                    style={{ backgroundColor: 'rgba(10,10,15,0.8)' }}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>
                    Console
                    {consoleLogs.filter(l => l.type === 'ERROR').length > 0 && (
                      <span className="flex items-center justify-center rounded-full bg-red-500 px-1.5 min-w-[16px] h-4 text-[9px] font-bold text-white">
                        {consoleLogs.filter(l => l.type === 'ERROR').length}
                      </span>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {!!shareSlug && (
        <ShareModal
          isOpen={!!shareSlug}
          onClose={() => setShareSlug(null)}
          slug={shareSlug || ''}
          gameName={useEditorStore.getState().scene.name || 'Your Game'}
        />
      )}
      {publishOpen && (
        <PublishFlow
          open={publishOpen}
          onClose={() => setPublishOpen(false)}
          onPublish={onPublish}
          onPublished={(slug) => {
            setPublishOpen(false);
            setShareSlug(slug);
          }}
        />
      )}
      {mechanicsOpen && (
        <GameMechanicsSettings isOpen={mechanicsOpen} onClose={() => setMechanicsOpen(false)} />
      )}
      <OnboardingCoach />
      {libraryOpen && (
      <AssetLibrary
        isOpen={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        packs={assetPacks}
        onPickPaintTile={(packId, category, index) => {
          useEditorStore.getState().setPaintTile({ assetPack: packId, assetCategory: category, assetIndex: index });
        }}
        onSelectSprite={(packId, category, index, url) => {
          const selectedId = useEditorStore.getState().selectedIds[0] ?? null;
          if (selectedId) {
            // Update existing selected element to this sprite
            useEditorStore.getState().updateElement(selectedId, {
              type: 'sprite',
              src: url,
              width: 1.5,
              height: 1.5,
              assetPack: packId,
              assetCategory: category,
              assetIndex: index,
            } as never);
          } else {
            // Add new sprite at origin
            const id = 'sprite_' + Date.now().toString(36);
            useEditorStore.getState().addElement({
              id,
              name: `${category} ${index}`,
              type: 'sprite',
              transform: {
                position: { x: 0, y: 0, z: 0 },
                rotation: { x: 0, y: 0, z: 0 },
                scale: { x: 1, y: 1, z: 1 },
              },
              visible: true,
              locked: false,
              tags: [],
              src: url,
              width: 1.5,
              height: 1.5,
              assetPack: packId,
              assetCategory: category,
              assetIndex: index,
            } as never);
          }
        }}
      />
      )}
    </div>
  );
}

function TopBar({
  activeTab,
  onTabChange,
  sidebarVisible,
  onToggleSidebar,
  showHistory,
  onToggleHistory,
  saveStatus,
  onLogout,
  onOpenPublish,
  onSettings,
  rightSlot,
}: {
  activeTab: Tab;
  onTabChange: (t: Tab) => void;
  sidebarVisible: boolean;
  onToggleSidebar: () => void;
  showHistory: boolean;
  onToggleHistory: () => void;
  saveStatus?: 'saved' | 'saving' | 'error' | 'idle';
  onLogout?: () => void;
  onOpenPublish?: () => void;
  onSettings?: () => void;
  rightSlot?: React.ReactNode;
}) {
  const sceneName = useEditorStore((s) => s.scene.name) || 'Untitled Game';
  const [editing, setEditing] = useState(false);
  const [nameValue, setNameValue] = useState(sceneName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setNameValue(sceneName); }, [sceneName]);
  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  const commitName = () => {
    const trimmed = nameValue.trim();
    if (trimmed && trimmed !== sceneName) {
      useEditorStore.getState().setSceneName(trimmed);
    } else {
      setNameValue(sceneName);
    }
    setEditing(false);
  };

  return (
    <header className="h-14 border-b border-white/[0.08] flex items-center justify-between px-4 z-50" style={{ backgroundColor: '#0a0a0f' }}>
      {/* Left */}
      <div className="flex items-center gap-4">
        <a href="/" className="flex items-center gap-2">
          <span className="font-bold text-lg tracking-tight text-white" style={{ fontFamily: 'var(--font-vintage, serif)' }}>arc</span>
        </a>

        <div className="h-6 w-px bg-white/10" />

        {/* Editable scene name */}
        {editing ? (
          <input
            ref={inputRef}
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitName();
              if (e.key === 'Escape') { setNameValue(sceneName); setEditing(false); }
            }}
            className="px-3 py-1.5 rounded-lg bg-white/[0.08] text-sm font-medium text-white border border-[#8b7ec8]/40 outline-none w-48"
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.08] text-sm font-medium transition-colors border border-white/[0.06]"
          >
            <span className="text-white/80">{sceneName}</span>
            <svg className="w-3 h-3 text-white/25" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>
          </button>
        )}

        <div className="flex items-center gap-1 ml-2">
          <button
            onClick={onToggleHistory}
            className={`p-1.5 rounded-lg transition-colors ${showHistory ? 'bg-[#8b7ec8]/15 text-[#8b7ec8]' : 'text-white/40 hover:bg-white/[0.05] hover:text-white/70'}`}
            title="Chat History"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>
          </button>
          <button
            onClick={onToggleSidebar}
            className={`p-1.5 rounded-lg transition-colors ${!sidebarVisible ? 'bg-[#8b7ec8]/15 text-[#8b7ec8]' : 'text-white/40 hover:bg-white/[0.05] hover:text-white/70'}`}
            title={sidebarVisible ? 'Hide Sidebar' : 'Show Sidebar'}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>
          </button>
        </div>
      </div>

      {/* Center tabs */}
      <div className="flex p-1 rounded-xl border border-white/[0.06] bg-white/[0.03]">
        <button
          onClick={() => onTabChange('preview')}
          className={`px-4 py-1.5 text-sm font-medium rounded-lg flex items-center gap-2 transition-colors ${activeTab === 'preview' ? 'bg-[#8b7ec8]/15 text-[#8b7ec8]' : 'text-white/50 hover:text-white/80'}`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /><path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>
          Preview
        </button>
        <button
          onClick={() => onTabChange('assets')}
          className={`px-4 py-1.5 text-sm font-medium rounded-lg flex items-center gap-2 transition-colors ${activeTab === 'assets' ? 'bg-[#8b7ec8]/15 text-[#8b7ec8]' : 'text-white/50 hover:text-white/80'}`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>
          Assets
        </button>
        <button
          onClick={() => onTabChange('code')}
          className={`px-4 py-1.5 text-sm font-medium rounded-lg flex items-center gap-2 transition-colors ${activeTab === 'code' ? 'bg-[#8b7ec8]/15 text-[#8b7ec8]' : 'text-white/50 hover:text-white/80'}`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>
          Code
        </button>
      </div>

      {/* Right */}
      <div className="flex items-center gap-3">
        {saveStatus === 'saving' && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-white/40">Saving...</span>
          </div>
        )}
        {saveStatus === 'saved' && (
          <div className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-green-400/60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>
            <span className="text-xs text-green-400/60">Saved</span>
          </div>
        )}
        {saveStatus === 'error' && (
          <span className="text-xs text-red-400">Save failed</span>
        )}
        {(saveStatus === 'idle' || !saveStatus) && (
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-white/15" />
            <span className="text-xs text-white/25">Unsaved</span>
          </div>
        )}

        <button
          className="px-5 py-1.5 rounded-lg text-sm font-semibold text-white transition-colors"
          style={{ backgroundColor: '#8b7ec8' }}
          onClick={() => onOpenPublish?.()}
        >
          Publish
        </button>
        {rightSlot}
        {/* Settings */}
        <button onClick={onSettings} className="p-2 rounded-full text-white/40 hover:text-white/70 hover:bg-white/[0.05] transition-colors" title="Game Settings">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37a1.724 1.724 0 002.572-1.065z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>
        </button>
      </div>
    </header>
  );
}

