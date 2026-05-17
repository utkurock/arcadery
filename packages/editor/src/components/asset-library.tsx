'use client';

import { useState } from 'react';
import { X, Search, Package } from 'lucide-react';

export interface AssetPackInfo {
  id: string;
  name: string;
  author: string;
  license: string;
  tileSize: number;
  category: string;
  basePath: string;
  sprites: Record<string, {
    path: string;
    count: number;
    tags: string[];
    description: string;
  }>;
}

export interface AssetLibraryProps {
  isOpen: boolean;
  onClose: () => void;
  packs: AssetPackInfo[];
  onSelectSprite: (packId: string, category: string, index: number, url: string) => void;
  onPickPaintTile?: (packId: string, category: string, index: number) => void;
}

export function AssetLibrary({ isOpen, onClose, packs, onSelectSprite, onPickPaintTile }: AssetLibraryProps) {
  const [selectedPack, setSelectedPack] = useState<string>(packs[0]?.id || '');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [search, setSearch] = useState('');

  if (!isOpen) return null;

  const pack = packs.find((p) => p.id === selectedPack);
  const categories = pack ? Object.keys(pack.sprites) : [];
  const activeCat = selectedCategory || categories[0] || '';
  const catData = pack?.sprites[activeCat];

  // Build sprite list
  const sprites = catData
    ? Array.from({ length: catData.count }, (_, i) => {
        const idx = String(i).padStart(4, '0');
        return {
          index: i,
          url: `${pack!.basePath}${catData.path}/tile_${idx}.png`,
        };
      })
    : [];

  // Filter by search (just by index for now since we don't have individual names)
  const filtered = search
    ? sprites.filter((s) => String(s.index).includes(search))
    : sprites;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-5xl h-[80vh] rounded-2xl border border-white/[0.08] bg-[#0d0d14] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
          <div className="flex items-center gap-3">
            <Package className="w-5 h-5 text-[#8b7ec8]" />
            <div>
              <h2 className="text-base font-semibold text-white">Asset Library</h2>
              <p className="text-xs text-white/30 mt-0.5">Browse and select sprites for your game</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/20" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by index..."
                className="w-48 rounded-lg border border-white/[0.08] bg-white/[0.04] pl-8 pr-3 py-1.5 text-xs text-white/80 placeholder:text-white/20 outline-none focus:border-[#8b7ec8]/30"
              />
            </div>
            <button onClick={onClose} className="rounded-lg p-2 text-white/30 hover:bg-white/[0.05] hover:text-white/60">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar: Packs + Categories */}
          <aside className="w-56 border-r border-white/[0.06] overflow-y-auto">
            {/* Packs */}
            <div className="p-3">
              <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-2">Packs</p>
              {packs.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setSelectedPack(p.id); setSelectedCategory(''); }}
                  className={`w-full text-left rounded-lg px-3 py-2 mb-1 transition-colors ${
                    selectedPack === p.id
                      ? 'bg-[#8b7ec8]/15 text-[#8b7ec8]'
                      : 'text-white/50 hover:bg-white/[0.04] hover:text-white/80'
                  }`}
                >
                  <p className="text-xs font-medium">{p.name}</p>
                  <p className="text-[10px] text-white/25 mt-0.5">{p.author} · {p.license}</p>
                </button>
              ))}
            </div>

            {/* Categories */}
            {categories.length > 0 && (
              <div className="p-3 border-t border-white/[0.04]">
                <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-2">Categories</p>
                {categories.map((cat) => {
                  const c = pack!.sprites[cat];
                  return (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`w-full text-left rounded-lg px-3 py-1.5 mb-0.5 transition-colors ${
                        activeCat === cat
                          ? 'bg-white/[0.08] text-white/90'
                          : 'text-white/40 hover:bg-white/[0.04] hover:text-white/70'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs capitalize">{cat}</span>
                        <span className="text-[10px] text-white/20">{c.count}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </aside>

          {/* Main: Sprite grid */}
          <main className="flex-1 overflow-y-auto p-4">
            {catData && (
              <div className="mb-3">
                <h3 className="text-sm font-semibold text-white/70 capitalize">{activeCat}</h3>
                <p className="text-xs text-white/30 mt-0.5">{catData.description}</p>
              </div>
            )}

            <div className="grid grid-cols-8 gap-2">
              {filtered.map((sprite) => (
                <div
                  key={sprite.index}
                  className="group relative aspect-square rounded-lg border border-white/[0.06] bg-white/[0.02] p-2 hover:border-[#8b7ec8]/40 hover:bg-[#8b7ec8]/[0.06] transition-all"
                >
                  <img
                    src={sprite.url}
                    alt={`Sprite ${sprite.index}`}
                    className="w-full h-full object-contain"
                    style={{ imageRendering: 'pixelated' }}
                  />
                  <span className="absolute top-1 left-1 text-[8px] text-white/25">#{sprite.index}</span>

                  {/* Action overlay on hover */}
                  <div className="absolute inset-0 rounded-lg bg-black/70 opacity-0 group-hover:opacity-100 flex flex-col items-stretch justify-center gap-1 p-1 transition-opacity">
                    {onPickPaintTile && activeCat === 'tiles' && (
                      <button
                        onClick={() => {
                          onPickPaintTile(selectedPack, activeCat, sprite.index);
                          onClose();
                        }}
                        className="rounded bg-[#8b7ec8] hover:bg-[#7a6db8] text-[9px] font-semibold text-white py-1 transition-colors"
                      >
                        🖌 Paint
                      </button>
                    )}
                    <button
                      onClick={() => {
                        onSelectSprite(selectedPack, activeCat, sprite.index, sprite.url);
                        onClose();
                      }}
                      className="rounded bg-white/10 hover:bg-white/20 text-[9px] font-semibold text-white/80 py-1 transition-colors"
                    >
                      + Sprite
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {filtered.length === 0 && (
              <div className="text-center py-20 text-white/25 text-sm">No sprites found</div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
