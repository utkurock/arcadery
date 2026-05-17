// Registry of available asset packs
// To add a new pack: drop it in /public/<pack-name>/ and add entry here

interface SpriteCategory {
  path: string;
  count: number;
  tags: string[];
  description: string;
}

interface TilesetInfo {
  url: string;
  cols: number;
  rows: number;
  tileSize: number;
  spacing: number;
  count: number;
}

interface AssetPack {
  id: string;
  name: string;
  author: string;
  license: string;
  tileSize: number;
  category: string;
  basePath: string;
  sprites: Record<string, SpriteCategory>;
  // Packed tileset (single image for efficient rendering)
  tilesets?: Record<string, TilesetInfo>;
}

export const ASSET_PACKS: AssetPack[] = [
  {
    id: 'desert-shooter',
    name: 'Desert Shooter Pack',
    author: 'Kenney',
    license: 'CC0',
    tileSize: 16,
    category: 'top-down-shooter',
    basePath: '/desertshooterpack/PNG',
    sprites: {
      players: {
        path: '/Players/Tiles',
        count: 16,
        tags: ['player', 'character', 'hero'],
        description: 'Player characters - cowboys, gunslingers',
      },
      enemies: {
        path: '/Enemies/Tiles',
        count: 16,
        tags: ['enemy', 'monster', 'foe'],
        description: 'Enemy characters - bandits, outlaws',
      },
      tiles: {
        path: '/Tiles/Tiles',
        count: 234,
        tags: ['ground', 'wall', 'floor', 'tile', 'environment'],
        description: 'Desert environment tiles',
      },
      weapons: {
        path: '/Weapons/Tiles',
        count: 16,
        tags: ['weapon', 'gun', 'bullet', 'item'],
        description: 'Weapons and projectiles',
      },
      interface: {
        path: '/Interface/Tiles',
        count: 16,
        tags: ['ui', 'icon', 'hud'],
        description: 'UI elements',
      },
    },
    tilesets: {
      tiles: {
        url: '/desertshooterpack/PNG/Tiles/Tilemap/tilemap_packed.png',
        cols: 18,
        rows: 13,
        tileSize: 16,
        spacing: 0,
        count: 234,
      },
      players: {
        url: '/desertshooterpack/PNG/Players/Tilemap/tilemap_packed.png',
        cols: 4,
        rows: 4,
        tileSize: 16,
        spacing: 0,
        count: 16,
      },
      enemies: {
        url: '/desertshooterpack/PNG/Enemies/Tilemap/tilemap_packed.png',
        cols: 4,
        rows: 4,
        tileSize: 16,
        spacing: 0,
        count: 16,
      },
      weapons: {
        url: '/desertshooterpack/PNG/Weapons/Tilemap/tilemap_packed.png',
        cols: 4,
        rows: 4,
        tileSize: 16,
        spacing: 0,
        count: 16,
      },
    },
  },
];

/**
 * Build a summary string for AI prompts — lists available packs and sprites.
 */
export function buildAssetPromptSummary(): string {
  return ASSET_PACKS.map((pack) => {
    const cats = Object.entries(pack.sprites)
      .map(([key, c]) => `${key}(${c.count}): ${c.description}`)
      .join(', ');
    return `Pack "${pack.id}" (${pack.category}): ${cats}`;
  }).join('\n');
}
