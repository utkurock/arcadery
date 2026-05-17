import {
  createEmptyScene,
  createBoxElement,
  createSphereElement,
  createPlaneElement,
  createTextElement,
  createLightElement,
  GameSceneSchema,
} from '@arcadery/shared';
import type { GameScene } from '@arcadery/shared';

interface TemplateEntry {
  name: string;
  description: string;
  category: string;
  scene: GameScene;
}

// ─── Playable 2D templates (Phase 8) ─────────────────────────────────────
// These templates target the Pixi-based PhaserCanvas runtime. Positions are
// in display pixels (y-up); 1 game-unit = 50 px for sizes. Behaviors wire
// physics + input + scoring so the templates are immediately playable.

function buildPlatformerPlayable(): GameScene {
  const scene = createEmptyScene('Platformer');
  scene.settings.renderEngine = 'phaser';
  scene.settings.backgroundColor = '#1a2030';

  // Ground stretches beyond visible area so player can't run off the edges.
  const ground = createBoxElement({
    name: 'Ground',
    transform: {
      position: { x: 800, y: 50, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    size: { x: 32, y: 1, z: 1 },
    material: { color: '#3a4555', opacity: 1 },
    tags: ['solid'],
    behaviors: [{ type: 'solid', surfaceTag: 'solid' }],
  });

  // Mid-air platforms
  const platform1 = createBoxElement({
    name: 'Platform 1',
    transform: {
      position: { x: 350, y: 250, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    size: { x: 4, y: 0.5, z: 1 },
    material: { color: '#3a4555', opacity: 1 },
    tags: ['solid'],
    behaviors: [{ type: 'solid', surfaceTag: 'solid' }],
  });

  const platform2 = createBoxElement({
    name: 'Platform 2',
    transform: {
      position: { x: 700, y: 380, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    size: { x: 4, y: 0.5, z: 1 },
    material: { color: '#3a4555', opacity: 1 },
    tags: ['solid'],
    behaviors: [{ type: 'solid', surfaceTag: 'solid' }],
  });

  const platform3 = createBoxElement({
    name: 'Platform 3',
    transform: {
      position: { x: 1050, y: 250, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    size: { x: 4, y: 0.5, z: 1 },
    material: { color: '#3a4555', opacity: 1 },
    tags: ['solid'],
    behaviors: [{ type: 'solid', surfaceTag: 'solid' }],
  });

  const player = createBoxElement({
    name: 'Player',
    transform: {
      position: { x: 100, y: 200, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    size: { x: 1, y: 1, z: 1 },
    material: { color: '#5db8a8', opacity: 1 },
    tags: ['player'],
    behaviors: [
      {
        type: 'platformer-controller',
        speed: 5,
        jumpVelocity: 12,
        gravity: 28,
        controls: 'both',
        groundTag: 'solid',
      },
    ],
  });

  // Coins to collect — pickup-on-contact + score
  const coins = [
    { x: 350, y: 320 },
    { x: 700, y: 450 },
    { x: 1050, y: 320 },
    { x: 1300, y: 150 },
  ].map((p, i) =>
    createSphereElement({
      name: `Coin ${i + 1}`,
      transform: {
        position: { x: p.x, y: p.y, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      radius: 0.3,
      material: { color: '#fbbf24', opacity: 1 },
      tags: ['pickup'],
      behaviors: [
        {
          type: 'pickup-on-contact',
          collectorTag: 'player',
          scoreDelta: 25,
          healthDelta: 0,
          destroyOnPickup: true,
        },
      ],
    }),
  );

  // Patrolling enemy on platform 2
  const enemy = createBoxElement({
    name: 'Enemy',
    transform: {
      position: { x: 700, y: 430, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    size: { x: 0.8, y: 0.8, z: 1 },
    material: { color: '#ef4444', opacity: 1 },
    tags: ['enemy'],
    behaviors: [
      { type: 'auto-move', velocityX: 2, velocityY: 0, reverseOnHit: true },
      {
        type: 'damage-on-contact',
        victimTag: 'player',
        damage: 1,
        destroySelfOnHit: false,
        cooldownMs: 800,
      },
    ],
  });

  scene.elements = {
    [ground.id]: ground,
    [platform1.id]: platform1,
    [platform2.id]: platform2,
    [platform3.id]: platform3,
    [player.id]: player,
    [enemy.id]: enemy,
  };
  for (const c of coins) scene.elements[c.id] = c;

  scene.gameState = {
    initialScore: 0,
    initialHealth: 3,
    winScore: 100, // collect all 4 coins
    winSurviveSec: 0,
    cameraFollowId: player.id,
  };

  return scene;
}

function buildTopDownShooterPlayable(): GameScene {
  const scene = createEmptyScene('Top-Down Arena');
  scene.settings.renderEngine = 'phaser';
  scene.settings.backgroundColor = '#0f172a';

  // Walls forming a square arena
  const wallSpec: { name: string; x: number; y: number; w: number; h: number }[] = [
    { name: 'Wall Top', x: 600, y: 700, w: 20, h: 0.5 },
    { name: 'Wall Bottom', x: 600, y: 50, w: 20, h: 0.5 },
    { name: 'Wall Left', x: 100, y: 375, w: 0.5, h: 13 },
    { name: 'Wall Right', x: 1100, y: 375, w: 0.5, h: 13 },
  ];
  const walls = wallSpec.map((w) =>
    createBoxElement({
      name: w.name,
      transform: {
        position: { x: w.x, y: w.y, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      size: { x: w.w, y: w.h, z: 1 },
      material: { color: '#334155', opacity: 1 },
      tags: ['solid'],
      behaviors: [{ type: 'solid', surfaceTag: 'solid' }],
    }),
  );

  const player = createBoxElement({
    name: 'Player',
    transform: {
      position: { x: 600, y: 375, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    size: { x: 1, y: 1, z: 1 },
    material: { color: '#5db8a8', opacity: 1 },
    tags: ['player'],
    behaviors: [
      { type: 'top-down-controller', speed: 6, controls: 'both' },
    ],
  });

  // Pickups scattered in the arena
  const pickups = [
    { x: 250, y: 200 },
    { x: 950, y: 200 },
    { x: 250, y: 550 },
    { x: 950, y: 550 },
    { x: 600, y: 600 },
    { x: 600, y: 150 },
  ].map((p, i) =>
    createSphereElement({
      name: `Gem ${i + 1}`,
      transform: {
        position: { x: p.x, y: p.y, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      radius: 0.35,
      material: { color: '#a78bfa', opacity: 1 },
      tags: ['pickup'],
      behaviors: [
        {
          type: 'pickup-on-contact',
          collectorTag: 'player',
          scoreDelta: 20,
          healthDelta: 0,
          destroyOnPickup: true,
        },
      ],
    }),
  );

  // Two enemies patrolling
  const enemy1 = createBoxElement({
    name: 'Enemy 1',
    transform: {
      position: { x: 400, y: 375, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    size: { x: 0.9, y: 0.9, z: 1 },
    material: { color: '#ef4444', opacity: 1 },
    tags: ['enemy'],
    behaviors: [
      { type: 'auto-move', velocityX: 2.5, velocityY: 0, reverseOnHit: true },
      {
        type: 'damage-on-contact',
        victimTag: 'player',
        damage: 1,
        destroySelfOnHit: false,
        cooldownMs: 700,
      },
    ],
  });
  const enemy2 = createBoxElement({
    name: 'Enemy 2',
    transform: {
      position: { x: 800, y: 375, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    size: { x: 0.9, y: 0.9, z: 1 },
    material: { color: '#ef4444', opacity: 1 },
    tags: ['enemy'],
    behaviors: [
      { type: 'auto-move', velocityX: 0, velocityY: 2.5, reverseOnHit: true },
      {
        type: 'damage-on-contact',
        victimTag: 'player',
        damage: 1,
        destroySelfOnHit: false,
        cooldownMs: 700,
      },
    ],
  });

  scene.elements = {
    [player.id]: player,
    [enemy1.id]: enemy1,
    [enemy2.id]: enemy2,
  };
  for (const w of walls) scene.elements[w.id] = w;
  for (const p of pickups) scene.elements[p.id] = p;

  scene.gameState = {
    initialScore: 0,
    initialHealth: 3,
    winScore: 120, // collect all 6 gems
    winSurviveSec: 0,
    cameraFollowId: player.id,
  };

  return scene;
}

function buildWaveShooterPlayable(): GameScene {
  const scene = createEmptyScene('Wave Shooter');
  scene.settings.renderEngine = 'phaser';
  scene.settings.backgroundColor = '#0c1018';

  // Arena walls
  const wallSpec: { name: string; x: number; y: number; w: number; h: number }[] = [
    { name: 'Floor', x: 600, y: 60, w: 22, h: 0.5 },
    { name: 'Ceiling', x: 600, y: 700, w: 22, h: 0.5 },
    { name: 'Left wall', x: 100, y: 380, w: 0.5, h: 12 },
    { name: 'Right wall', x: 1100, y: 380, w: 0.5, h: 12 },
  ];
  const walls = wallSpec.map((w) =>
    createBoxElement({
      name: w.name,
      transform: {
        position: { x: w.x, y: w.y, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      size: { x: w.w, y: w.h, z: 1 },
      material: { color: '#1f2937', opacity: 1 },
      tags: ['solid'],
      behaviors: [{ type: 'solid', surfaceTag: 'solid' }],
    }),
  );

  // Hidden enemy template — referenced by spawners. visible:false so it doesn't render.
  const enemyTemplate = createBoxElement({
    name: 'Enemy template',
    transform: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    visible: false,
    size: { x: 0.7, y: 0.7, z: 1 },
    material: { color: '#ef4444', opacity: 1 },
    tags: ['enemy'],
    behaviors: [
      {
        type: 'damage-on-contact',
        victimTag: 'player',
        damage: 1,
        destroySelfOnHit: true,
        cooldownMs: 400,
      },
    ],
  });

  // Two spawners flanking the arena, each pumping enemies inward.
  const spawnerLeft = createBoxElement({
    name: 'Spawner Left',
    transform: {
      position: { x: 150, y: 380, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    size: { x: 0.6, y: 0.6, z: 1 },
    material: { color: '#7c3aed', opacity: 0.5 },
    tags: ['spawner'],
    behaviors: [
      {
        type: 'spawner',
        templateElementId: enemyTemplate.id,
        intervalMs: 1800,
        maxConcurrent: 6,
        spawnVelocityX: 3,
        spawnVelocityY: 0,
        offsetX: 30,
        offsetY: 0,
        cloneLifetimeMs: 0,
      },
    ],
  });
  const spawnerRight = createBoxElement({
    name: 'Spawner Right',
    transform: {
      position: { x: 1050, y: 380, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    size: { x: 0.6, y: 0.6, z: 1 },
    material: { color: '#7c3aed', opacity: 0.5 },
    tags: ['spawner'],
    behaviors: [
      {
        type: 'spawner',
        templateElementId: enemyTemplate.id,
        intervalMs: 1800,
        maxConcurrent: 6,
        spawnVelocityX: -3,
        spawnVelocityY: 0,
        offsetX: -30,
        offsetY: 0,
        cloneLifetimeMs: 0,
      },
    ],
  });

  // Player — top-down + click-to-shoot.
  const player = createBoxElement({
    name: 'Player',
    transform: {
      position: { x: 600, y: 380, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    size: { x: 1, y: 1, z: 1 },
    material: { color: '#5db8a8', opacity: 1 },
    tags: ['player'],
    behaviors: [
      { type: 'top-down-controller', speed: 6, controls: 'both' },
      {
        type: 'shoot-projectile',
        trigger: 'click',
        cooldownMs: 240,
        direction: 'forward',
        projectileSpeed: 16,
        projectileSize: 0.3,
        projectileColor: '#fbbf24',
        damage: 1,
        victimTag: 'enemy',
        lifetimeMs: 1200,
      },
    ],
  });

  scene.elements = {
    [enemyTemplate.id]: enemyTemplate,
    [spawnerLeft.id]: spawnerLeft,
    [spawnerRight.id]: spawnerRight,
    [player.id]: player,
  };
  for (const w of walls) scene.elements[w.id] = w;

  scene.gameState = {
    initialScore: 0,
    initialHealth: 5,
    winScore: 0,
    winSurviveSec: 60, // survive a minute to win
    cameraFollowId: player.id,
  };

  return scene;
}

function buildTilemapPlatformerPlayable(): GameScene {
  const scene = createEmptyScene('Pixel Platformer');
  scene.settings.renderEngine = 'phaser';
  scene.settings.backgroundColor = '#101828';

  // Tilemap ground — sparse platform layout. fill:-1 means most cells empty,
  // sparse [row, col, tileIdx] entries form the ground + platforms.
  // Tile index = 0 (any solid tile from desert-shooter pack).
  const groundTiles: [number, number, number][] = [];
  // Floor row (last row)
  for (let c = 0; c < 36; c++) groundTiles.push([14, c, 0]);
  // Platform 1
  for (let c = 5; c <= 9; c++) groundTiles.push([10, c, 0]);
  // Platform 2
  for (let c = 14; c <= 18; c++) groundTiles.push([7, c, 0]);
  // Platform 3
  for (let c = 23; c <= 27; c++) groundTiles.push([10, c, 0]);
  // Right wall
  for (let r = 0; r < 15; r++) groundTiles.push([r, 35, 0]);
  // Left wall
  for (let r = 0; r < 15; r++) groundTiles.push([r, 0, 0]);

  const tilemap = {
    id: 'tilemap_world',
    name: 'World',
    type: 'tilemap' as const,
    transform: {
      position: { x: 600, y: 240, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    visible: true,
    locked: false,
    tags: ['solid'],
    behaviors: [{ type: 'solid' as const, surfaceTag: 'solid' }],
    assetPack: 'desert-shooter',
    tileSize: 16,
    gridCols: 36,
    gridRows: 15,
    renderSize: 32,
    fill: -1,
    tiles: groundTiles,
  };

  const player = createBoxElement({
    name: 'Player',
    transform: {
      position: { x: 100, y: 200, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    size: { x: 0.9, y: 0.9, z: 1 },
    material: { color: '#5db8a8', opacity: 1 },
    tags: ['player'],
    behaviors: [
      {
        type: 'platformer-controller',
        speed: 5,
        jumpVelocity: 13,
        gravity: 30,
        controls: 'both',
        groundTag: 'solid',
      },
    ],
  });

  // Coins on each platform
  const coins = [
    { x: 230, y: 350 },
    { x: 510, y: 470 },
    { x: 800, y: 350 },
    { x: 1070, y: 350 },
  ].map((p, i) =>
    createSphereElement({
      name: `Coin ${i + 1}`,
      transform: {
        position: { x: p.x, y: p.y, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      radius: 0.3,
      material: { color: '#fbbf24', opacity: 1 },
      tags: ['pickup'],
      behaviors: [
        {
          type: 'pickup-on-contact',
          collectorTag: 'player',
          scoreDelta: 25,
          healthDelta: 0,
          destroyOnPickup: true,
        },
      ],
    }),
  );

  scene.elements = {
    [tilemap.id]: tilemap as never,
    [player.id]: player,
  };
  for (const c of coins) scene.elements[c.id] = c;

  scene.gameState = {
    initialScore: 0,
    initialHealth: 3,
    winScore: 100,
    winSurviveSec: 0,
    cameraFollowId: player.id,
  };

  return scene;
}

// ─── Original (3D / static) templates kept below for AI training set ─────

function buildPlatformer(): GameScene {
  const scene = createEmptyScene('Platformer');
  scene.settings.renderEngine = 'phaser';
  scene.settings.backgroundColor = '#1f2335';

  const ground = createBoxElement({
    name: 'Ground',
    transform: {
      position: { x: 600, y: 50, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    size: { x: 24, y: 1, z: 1 },
    material: { color: '#4a5568', opacity: 1 },
    tags: ['solid'],
    behaviors: [{ type: 'solid', surfaceTag: 'solid' }],
  });

  const stepUp = createBoxElement({
    name: 'Step',
    transform: {
      position: { x: 260, y: 200, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    size: { x: 3, y: 0.5, z: 1 },
    material: { color: '#4a5568', opacity: 1 },
    tags: ['solid'],
    behaviors: [{ type: 'solid', surfaceTag: 'solid' }],
  });

  const highPlatform = createBoxElement({
    name: 'High Platform',
    transform: {
      position: { x: 600, y: 340, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    size: { x: 4, y: 0.5, z: 1 },
    material: { color: '#4a5568', opacity: 1 },
    tags: ['solid'],
    behaviors: [{ type: 'solid', surfaceTag: 'solid' }],
  });

  const farPlatform = createBoxElement({
    name: 'Far Platform',
    transform: {
      position: { x: 950, y: 200, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    size: { x: 3, y: 0.5, z: 1 },
    material: { color: '#4a5568', opacity: 1 },
    tags: ['solid'],
    behaviors: [{ type: 'solid', surfaceTag: 'solid' }],
  });

  const player = createBoxElement({
    name: 'Player',
    transform: {
      position: { x: 120, y: 220, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    size: { x: 1, y: 1, z: 1 },
    material: { color: '#48bb78', opacity: 1 },
    tags: ['player'],
    behaviors: [
      {
        type: 'platformer-controller',
        speed: 5,
        jumpVelocity: 13,
        gravity: 28,
        controls: 'both',
        groundTag: 'solid',
      },
    ],
  });

  // Three patrolling red enemies — formerly static "obstacles".
  const enemySpecs = [
    { name: 'Enemy 1', x: 260, y: 260, vx: 2 },
    { name: 'Enemy 2', x: 600, y: 400, vx: -2 },
    { name: 'Enemy 3', x: 950, y: 260, vx: 2 },
  ];
  const enemies = enemySpecs.map((e) =>
    createBoxElement({
      name: e.name,
      transform: {
        position: { x: e.x, y: e.y, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      size: { x: 0.8, y: 0.8, z: 1 },
      material: { color: '#f56565', opacity: 1 },
      tags: ['enemy'],
      behaviors: [
        { type: 'auto-move', velocityX: e.vx, velocityY: 0, reverseOnHit: true },
        {
          type: 'damage-on-contact',
          victimTag: 'player',
          damage: 1,
          destroySelfOnHit: false,
          cooldownMs: 800,
        },
      ],
    }),
  );

  // Three coins for the win condition.
  const coins = [
    { x: 260, y: 270 },
    { x: 600, y: 410 },
    { x: 950, y: 270 },
  ].map((p, i) =>
    createSphereElement({
      name: `Coin ${i + 1}`,
      transform: {
        position: { x: p.x, y: p.y, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      radius: 0.3,
      material: { color: '#fbbf24', opacity: 1 },
      tags: ['pickup'],
      behaviors: [
        {
          type: 'pickup-on-contact',
          collectorTag: 'player',
          scoreDelta: 25,
          healthDelta: 0,
          destroyOnPickup: true,
        },
      ],
    }),
  );

  scene.elements = {
    [ground.id]: ground,
    [stepUp.id]: stepUp,
    [highPlatform.id]: highPlatform,
    [farPlatform.id]: farPlatform,
    [player.id]: player,
  };
  for (const e of enemies) scene.elements[e.id] = e;
  for (const c of coins) scene.elements[c.id] = c;

  scene.gameState = {
    initialScore: 0,
    initialHealth: 3,
    winScore: 75,
    winSurviveSec: 0,
    cameraFollowId: player.id,
  };

  return scene;
}

function buildSpaceShooter(): GameScene {
  const scene = createEmptyScene('Space Shooter');
  scene.settings.renderEngine = 'phaser';
  scene.settings.backgroundColor = '#0a0a1a';

  // Arena walls so enemies + the player are bounded.
  const wallSpec: { name: string; x: number; y: number; w: number; h: number }[] = [
    { name: 'Top Edge', x: 600, y: 740, w: 24, h: 0.5 },
    { name: 'Bottom Edge', x: 600, y: 40, w: 24, h: 0.5 },
    { name: 'Left Edge', x: 80, y: 380, w: 0.5, h: 14 },
    { name: 'Right Edge', x: 1120, y: 380, w: 0.5, h: 14 },
  ];
  const walls = wallSpec.map((w) =>
    createBoxElement({
      name: w.name,
      transform: {
        position: { x: w.x, y: w.y, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      size: { x: w.w, y: w.h, z: 1 },
      material: { color: '#1e1b4b', opacity: 1 },
      tags: ['solid'],
      behaviors: [{ type: 'solid', surfaceTag: 'solid' }],
    }),
  );

  // Player ship — bottom of screen, top-down movement + auto-fire upward.
  const playerShip = createSphereElement({
    name: 'Player Ship',
    transform: {
      position: { x: 600, y: 140, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    radius: 0.55,
    material: { color: '#60a5fa', opacity: 1 },
    tags: ['player'],
    behaviors: [
      { type: 'top-down-controller', speed: 6, controls: 'both' },
      {
        type: 'shoot-projectile',
        trigger: 'auto',
        cooldownMs: 320,
        direction: 'up',
        projectileSpeed: 14,
        projectileSize: 0.25,
        projectileColor: '#fbbf24',
        damage: 1,
        victimTag: 'enemy',
        lifetimeMs: 1400,
      },
    ],
  });

  // Four enemy ships drifting horizontally up top. damage-on-contact only —
  // they don't actually shoot, so the duel is "kill them before they touch you".
  const enemySpecs = [
    { name: 'Enemy 1', x: 240, y: 600, vx: 1.6 },
    { name: 'Enemy 2', x: 480, y: 660, vx: -1.4 },
    { name: 'Enemy 3', x: 720, y: 660, vx: 1.4 },
    { name: 'Enemy 4', x: 960, y: 600, vx: -1.6 },
  ];
  const enemies = enemySpecs.map((e) =>
    createSphereElement({
      name: e.name,
      transform: {
        position: { x: e.x, y: e.y, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      radius: 0.5,
      material: { color: '#ef4444', opacity: 1 },
      tags: ['enemy'],
      behaviors: [
        { type: 'auto-move', velocityX: e.vx, velocityY: 0, reverseOnHit: true },
        {
          type: 'damage-on-contact',
          victimTag: 'player',
          damage: 1,
          destroySelfOnHit: false,
          cooldownMs: 700,
        },
        // Win condition trigger — when no enemies remain, scene resolves WIN.
        { type: 'win-on-tag-destroyed', targetTag: 'enemy' },
      ],
    }),
  );

  scene.elements = {
    [playerShip.id]: playerShip,
  };
  for (const w of walls) scene.elements[w.id] = w;
  for (const e of enemies) scene.elements[e.id] = e;

  scene.gameState = {
    initialScore: 0,
    initialHealth: 3,
    winScore: 0,
    winSurviveSec: 0,
    cameraFollowId: playerShip.id,
  };

  return scene;
}

function buildPuzzle(): GameScene {
  // A 3x3 grid of colored blocks — top-down player walks across the grid
  // collecting them in any order. Win when all 9 are picked up.
  const scene = createEmptyScene('Puzzle');
  scene.settings.renderEngine = 'phaser';
  scene.settings.backgroundColor = '#1e1b4b';

  // Arena walls.
  const wallSpec: { name: string; x: number; y: number; w: number; h: number }[] = [
    { name: 'Top Edge', x: 600, y: 700, w: 18, h: 0.5 },
    { name: 'Bottom Edge', x: 600, y: 60, w: 18, h: 0.5 },
    { name: 'Left Edge', x: 200, y: 380, w: 0.5, h: 13 },
    { name: 'Right Edge', x: 1000, y: 380, w: 0.5, h: 13 },
  ];
  const walls = wallSpec.map((w) =>
    createBoxElement({
      name: w.name,
      transform: {
        position: { x: w.x, y: w.y, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      size: { x: w.w, y: w.h, z: 1 },
      material: { color: '#312e81', opacity: 1 },
      tags: ['solid'],
      behaviors: [{ type: 'solid', surfaceTag: 'solid' }],
    }),
  );

  const colors = ['#f472b6', '#a78bfa', '#34d399'];
  const blocks: ReturnType<typeof createBoxElement>[] = [];
  let colorIdx = 0;
  for (const row of [0, 1, 2]) {
    for (const col of [0, 1, 2]) {
      blocks.push(
        createBoxElement({
          name: `Block ${colorIdx + 1}`,
          size: { x: 1, y: 1, z: 1 },
          transform: {
            // Center the 3x3 grid in the arena (cells 120 px apart).
            position: { x: 480 + col * 120, y: 260 + row * 120, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
          },
          material: { color: colors[colorIdx % 3], opacity: 1 },
          tags: ['pickup'],
          behaviors: [
            {
              type: 'pickup-on-contact',
              collectorTag: 'player',
              scoreDelta: 10,
              healthDelta: 0,
              destroyOnPickup: true,
            },
          ],
        }),
      );
      colorIdx++;
    }
  }

  const player = createBoxElement({
    name: 'Player',
    transform: {
      position: { x: 280, y: 380, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    size: { x: 0.8, y: 0.8, z: 1 },
    material: { color: '#e2e8f0', opacity: 1 },
    tags: ['player'],
    behaviors: [{ type: 'top-down-controller', speed: 6, controls: 'both' }],
  });

  scene.elements = { [player.id]: player };
  for (const w of walls) scene.elements[w.id] = w;
  for (const b of blocks) scene.elements[b.id] = b;

  scene.gameState = {
    initialScore: 0,
    initialHealth: 3,
    winScore: 90, // all 9 blocks * 10
    winSurviveSec: 0,
    cameraFollowId: player.id,
  };

  return scene;
}

function buildEndlessRunner(): GameScene {
  // Runner stays roughly stationary on the left; obstacles fly in from the
  // right via auto-move. Survive 30 seconds = win.
  const scene = createEmptyScene('Endless Runner');
  scene.settings.renderEngine = 'phaser';
  scene.settings.backgroundColor = '#1f1f3a';

  const ground = createBoxElement({
    name: 'Track',
    transform: {
      position: { x: 600, y: 60, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    size: { x: 28, y: 1, z: 1 },
    material: { color: '#4a5568', opacity: 1 },
    tags: ['solid'],
    behaviors: [{ type: 'solid', surfaceTag: 'solid' }],
  });

  const runner = createBoxElement({
    name: 'Runner',
    transform: {
      position: { x: 200, y: 220, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    size: { x: 1, y: 1, z: 1 },
    material: { color: '#fbbf24', opacity: 1 },
    tags: ['player'],
    behaviors: [
      {
        type: 'platformer-controller',
        speed: 4,
        jumpVelocity: 14,
        gravity: 32,
        controls: 'both',
        groundTag: 'solid',
      },
    ],
  });

  // Obstacles fly in from the right. Three staggered to keep the difficulty
  // ramp natural and so a missed reverseOnHit still leaves time to recover.
  const obstacleSpecs = [
    { name: 'Obstacle 1', x: 1180, y: 170, vx: -5 },
    { name: 'Obstacle 2', x: 1580, y: 230, vx: -5 },
    { name: 'Obstacle 3', x: 1980, y: 170, vx: -5 },
  ];
  const obstacles = obstacleSpecs.map((o) =>
    createBoxElement({
      name: o.name,
      transform: {
        position: { x: o.x, y: o.y, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      size: { x: 0.8, y: 1.2, z: 1 },
      material: { color: '#ef4444', opacity: 1 },
      tags: ['enemy'],
      behaviors: [
        { type: 'auto-move', velocityX: o.vx, velocityY: 0, reverseOnHit: true },
        {
          type: 'damage-on-contact',
          victimTag: 'player',
          damage: 1,
          destroySelfOnHit: false,
          cooldownMs: 800,
        },
      ],
    }),
  );

  scene.elements = {
    [ground.id]: ground,
    [runner.id]: runner,
  };
  for (const o of obstacles) scene.elements[o.id] = o;

  scene.gameState = {
    initialScore: 0,
    initialHealth: 3,
    winScore: 0,
    winSurviveSec: 30,
    cameraFollowId: runner.id,
  };

  return scene;
}

function buildEmptyCanvas(): GameScene {
  const scene = createEmptyScene('Empty Canvas');

  const light = createLightElement({
    name: 'Main Light',
    intensity: 1,
    transform: {
      position: { x: 0, y: 3, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
  });
  scene.elements[light.id] = light;

  return scene;
}

// ---------------------------------------------------------------------------
// New genre templates (2026 expansion)
// ---------------------------------------------------------------------------

function buildTopDownShooter(): GameScene {
  // Cover-based arena: player in the middle, 4 cover walls at quadrants,
  // 6 patrolling enemies around the perimeter. Click to shoot. Win = clear arena.
  const scene = createEmptyScene('Top-Down Shooter');
  scene.settings.renderEngine = 'phaser';
  scene.settings.backgroundColor = '#1a1a25';

  // Arena boundary walls.
  const wallSpec: { name: string; x: number; y: number; w: number; h: number }[] = [
    { name: 'Top Edge', x: 600, y: 720, w: 22, h: 0.5 },
    { name: 'Bottom Edge', x: 600, y: 40, w: 22, h: 0.5 },
    { name: 'Left Edge', x: 100, y: 380, w: 0.5, h: 14 },
    { name: 'Right Edge', x: 1100, y: 380, w: 0.5, h: 14 },
  ];
  const walls = wallSpec.map((w) =>
    createBoxElement({
      name: w.name,
      transform: {
        position: { x: w.x, y: w.y, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      size: { x: w.w, y: w.h, z: 1 },
      material: { color: '#2d3748', opacity: 1 },
      tags: ['solid'],
      behaviors: [{ type: 'solid', surfaceTag: 'solid' }],
    }),
  );

  // Four cover blocks at the quadrants.
  const coverPositions = [
    { x: 350, y: 230 },
    { x: 850, y: 230 },
    { x: 350, y: 530 },
    { x: 850, y: 530 },
  ];
  const covers = coverPositions.map((p, i) =>
    createBoxElement({
      name: `Cover ${i + 1}`,
      size: { x: 2, y: 0.5, z: 1 },
      transform: {
        position: { x: p.x, y: p.y, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      material: { color: '#4a5568', opacity: 1 },
      tags: ['solid'],
      behaviors: [{ type: 'solid', surfaceTag: 'solid' }],
    }),
  );

  const player = createBoxElement({
    name: 'Player',
    size: { x: 0.9, y: 0.9, z: 1 },
    transform: {
      position: { x: 600, y: 380, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    material: { color: '#48bb78', opacity: 1 },
    tags: ['player'],
    behaviors: [
      { type: 'top-down-controller', speed: 6, controls: 'both' },
      {
        type: 'shoot-projectile',
        trigger: 'click',
        cooldownMs: 260,
        direction: 'forward',
        projectileSpeed: 15,
        projectileSize: 0.3,
        projectileColor: '#fbbf24',
        damage: 1,
        victimTag: 'enemy',
        lifetimeMs: 1300,
      },
    ],
  });

  // Six enemies orbiting the perimeter. Each has a different patrol vector so
  // they don't bunch up in a single line.
  const enemySpecs = [
    { x: 200, y: 200, vx: 0, vy: 1.6 },
    { x: 1000, y: 200, vx: 0, vy: 1.6 },
    { x: 200, y: 560, vx: 0, vy: -1.6 },
    { x: 1000, y: 560, vx: 0, vy: -1.6 },
    { x: 600, y: 150, vx: 1.6, vy: 0 },
    { x: 600, y: 610, vx: -1.6, vy: 0 },
  ];
  const enemies = enemySpecs.map((e, i) =>
    createSphereElement({
      name: `Enemy ${i + 1}`,
      radius: 0.5,
      transform: {
        position: { x: e.x, y: e.y, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      material: { color: '#ef4444', opacity: 1 },
      tags: ['enemy'],
      behaviors: [
        { type: 'auto-move', velocityX: e.vx, velocityY: e.vy, reverseOnHit: true },
        {
          type: 'damage-on-contact',
          victimTag: 'player',
          damage: 1,
          destroySelfOnHit: false,
          cooldownMs: 700,
        },
        { type: 'win-on-tag-destroyed', targetTag: 'enemy' },
      ],
    }),
  );

  scene.elements = { [player.id]: player };
  for (const w of walls) scene.elements[w.id] = w;
  for (const c of covers) scene.elements[c.id] = c;
  for (const e of enemies) scene.elements[e.id] = e;

  scene.gameState = {
    initialScore: 0,
    initialHealth: 4,
    winScore: 0,
    winSurviveSec: 0,
    cameraFollowId: player.id,
  };

  return scene;
}

function buildCardBattle(): GameScene {
  // Card combat reframed as an action duel: your creature throws "cards"
  // (projectiles) at the enemy creature on the right. Defeat it to win.
  // Hand cards at the bottom are visual flair.
  const scene = createEmptyScene('Card Battle');
  scene.settings.renderEngine = 'phaser';
  scene.settings.backgroundColor = '#0a1d2e';

  // Battle table boundary (acts as walls so neither creature wanders off-screen).
  const wallSpec: { name: string; x: number; y: number; w: number; h: number }[] = [
    { name: 'Table Top', x: 600, y: 700, w: 22, h: 0.5 },
    { name: 'Table Bottom', x: 600, y: 60, w: 22, h: 0.5 },
    { name: 'Table Left', x: 100, y: 380, w: 0.5, h: 13 },
    { name: 'Table Right', x: 1100, y: 380, w: 0.5, h: 13 },
  ];
  const walls = wallSpec.map((w) =>
    createBoxElement({
      name: w.name,
      transform: {
        position: { x: w.x, y: w.y, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      size: { x: w.w, y: w.h, z: 1 },
      material: { color: '#1a472a', opacity: 1 },
      tags: ['solid'],
      behaviors: [{ type: 'solid', surfaceTag: 'solid' }],
    }),
  );

  // Hand of 5 decorative cards across the bottom — tagged 'card' (no behavior).
  // Players can remix these into pickups or extra projectile spawners.
  for (let i = 0; i < 5; i++) {
    const card = createBoxElement({
      name: `Player Card ${i + 1}`,
      size: { x: 1, y: 1.3, z: 1 },
      transform: {
        position: { x: 360 + i * 120, y: 130, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      material: { color: '#fef3c7', opacity: 1 },
      tags: ['card'],
    });
    scene.elements[card.id] = card;
  }

  // Your creature (left) — top-down movement + space to throw a card forward.
  const playerCreature = createSphereElement({
    name: 'Your Creature',
    radius: 0.6,
    transform: {
      position: { x: 280, y: 400, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    material: { color: '#34d399', opacity: 1 },
    tags: ['player'],
    behaviors: [
      { type: 'top-down-controller', speed: 5, controls: 'both' },
      {
        type: 'shoot-projectile',
        trigger: 'space',
        cooldownMs: 360,
        direction: 'right',
        projectileSpeed: 14,
        projectileSize: 0.45,
        projectileColor: '#fde047',
        damage: 1,
        victimTag: 'enemy',
        lifetimeMs: 1400,
      },
    ],
  });

  // Enemy creature (right) — patrols vertically, takes 5 hits to die.
  // Damage takes 5 because shoot-projectile damage=1 and we want a real duel.
  // The behavior schema doesn't have HP — but win-on-tag-destroyed fires when
  // the element is gone, and the engine destroys projectile victims after
  // their HP (1 per default) reaches zero. So we set damage:1 + 5 enemies?
  // That'd mean 5 enemies. To keep one creature feel: use damage=5 on cards.
  // Simpler: one enemy that auto-moves + win-on-tag-destroyed.
  const enemyCreature = createSphereElement({
    name: 'Enemy Creature',
    radius: 0.65,
    transform: {
      position: { x: 920, y: 400, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    material: { color: '#a855f7', opacity: 1 },
    tags: ['enemy'],
    behaviors: [
      { type: 'auto-move', velocityX: 0, velocityY: 3, reverseOnHit: true },
      {
        type: 'damage-on-contact',
        victimTag: 'player',
        damage: 1,
        destroySelfOnHit: false,
        cooldownMs: 700,
      },
      { type: 'win-on-tag-destroyed', targetTag: 'enemy' },
    ],
  });

  scene.elements[playerCreature.id] = playerCreature;
  scene.elements[enemyCreature.id] = enemyCreature;
  for (const w of walls) scene.elements[w.id] = w;

  scene.gameState = {
    initialScore: 0,
    initialHealth: 3,
    winScore: 0,
    winSurviveSec: 0,
    cameraFollowId: playerCreature.id,
  };

  return scene;
}

function buildMatch3(): GameScene {
  // Reframed as a collect-the-gems game: a 6x6 board of colored pickups, you
  // navigate top-down to harvest them. Two patrolling enemies add tension.
  // Win = 200 score (need 20 gems out of 36 — encourages playing it through).
  const scene = createEmptyScene('Match-3');
  scene.settings.renderEngine = 'phaser';
  scene.settings.backgroundColor = '#1e1b3a';

  // Arena boundaries.
  const wallSpec: { name: string; x: number; y: number; w: number; h: number }[] = [
    { name: 'Top Edge', x: 600, y: 720, w: 22, h: 0.5 },
    { name: 'Bottom Edge', x: 600, y: 40, w: 22, h: 0.5 },
    { name: 'Left Edge', x: 100, y: 380, w: 0.5, h: 14 },
    { name: 'Right Edge', x: 1100, y: 380, w: 0.5, h: 14 },
  ];
  const walls = wallSpec.map((w) =>
    createBoxElement({
      name: w.name,
      transform: {
        position: { x: w.x, y: w.y, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      size: { x: w.w, y: w.h, z: 1 },
      material: { color: '#312e81', opacity: 1 },
      tags: ['solid'],
      behaviors: [{ type: 'solid', surfaceTag: 'solid' }],
    }),
  );

  const palette = ['#ef4444', '#fbbf24', '#34d399', '#60a5fa', '#a855f7', '#f472b6'];
  const layout = [
    [0, 1, 2, 3, 4, 5],
    [3, 4, 5, 0, 1, 2],
    [1, 2, 0, 5, 3, 4],
    [4, 5, 3, 2, 0, 1],
    [2, 0, 4, 1, 5, 3],
    [5, 3, 1, 4, 2, 0],
  ];
  // Center a 6x6 grid (90 px spacing) in the arena.
  const gems: ReturnType<typeof createBoxElement>[] = [];
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 6; col++) {
      gems.push(
        createBoxElement({
          name: `Gem ${row}-${col}`,
          size: { x: 0.8, y: 0.8, z: 1 },
          transform: {
            position: { x: 375 + col * 90, y: 155 + row * 90, z: 0 },
            rotation: { x: 0, y: 0, z: Math.PI / 4 },
            scale: { x: 1, y: 1, z: 1 },
          },
          material: { color: palette[layout[row][col]], opacity: 1 },
          tags: ['pickup'],
          behaviors: [
            {
              type: 'pickup-on-contact',
              collectorTag: 'player',
              scoreDelta: 10,
              healthDelta: 0,
              destroyOnPickup: true,
            },
          ],
        }),
      );
    }
  }

  const player = createBoxElement({
    name: 'Player',
    transform: {
      position: { x: 210, y: 380, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    size: { x: 0.85, y: 0.85, z: 1 },
    material: { color: '#fbbf24', opacity: 1 },
    tags: ['player'],
    behaviors: [{ type: 'top-down-controller', speed: 6, controls: 'both' }],
  });

  // Two enemies sweeping the board horizontally + vertically.
  const enemy1 = createBoxElement({
    name: 'Sweeper 1',
    transform: {
      position: { x: 990, y: 200, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    size: { x: 0.7, y: 0.7, z: 1 },
    material: { color: '#ef4444', opacity: 1 },
    tags: ['enemy'],
    behaviors: [
      { type: 'auto-move', velocityX: -2, velocityY: 0, reverseOnHit: true },
      {
        type: 'damage-on-contact',
        victimTag: 'player',
        damage: 1,
        destroySelfOnHit: false,
        cooldownMs: 800,
      },
    ],
  });
  const enemy2 = createBoxElement({
    name: 'Sweeper 2',
    transform: {
      position: { x: 990, y: 560, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    size: { x: 0.7, y: 0.7, z: 1 },
    material: { color: '#ef4444', opacity: 1 },
    tags: ['enemy'],
    behaviors: [
      { type: 'auto-move', velocityX: 0, velocityY: -2, reverseOnHit: true },
      {
        type: 'damage-on-contact',
        victimTag: 'player',
        damage: 1,
        destroySelfOnHit: false,
        cooldownMs: 800,
      },
    ],
  });

  scene.elements = {
    [player.id]: player,
    [enemy1.id]: enemy1,
    [enemy2.id]: enemy2,
  };
  for (const w of walls) scene.elements[w.id] = w;
  for (const g of gems) scene.elements[g.id] = g;

  scene.gameState = {
    initialScore: 0,
    initialHealth: 3,
    winScore: 200,
    winSurviveSec: 0,
    cameraFollowId: player.id,
  };

  return scene;
}

function buildCardRoguelikeTower(): GameScene {
  // Multi-enemy spiritual sibling of Card Battle: hero on the left throws
  // projectile cards at three patrolling tower-floor enemies. Clear them all
  // to "climb the tower". Hand + tower silhouettes stay as remixable decor.
  const scene = createEmptyScene('Card Roguelike Tower');
  scene.settings.renderEngine = 'phaser';
  scene.settings.backgroundColor = '#1a0f24';

  // Arena boundaries.
  const wallSpec: { name: string; x: number; y: number; w: number; h: number }[] = [
    { name: 'Floor Edge', x: 600, y: 60, w: 22, h: 0.5 },
    { name: 'Ceiling Edge', x: 600, y: 700, w: 22, h: 0.5 },
    { name: 'Left Wall', x: 100, y: 380, w: 0.5, h: 13 },
    { name: 'Right Wall', x: 1100, y: 380, w: 0.5, h: 13 },
  ];
  const walls = wallSpec.map((w) =>
    createBoxElement({
      name: w.name,
      transform: {
        position: { x: w.x, y: w.y, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      size: { x: w.w, y: w.h, z: 1 },
      material: { color: '#2a1740', opacity: 1 },
      tags: ['solid'],
      behaviors: [{ type: 'solid', surfaceTag: 'solid' }],
    }),
  );

  // Tower silhouette stacked behind the action — purely decorative.
  // We render them as tall thin boxes so they read as "the tower I'm climbing"
  // without interfering with combat. Remixers can wire them up later.
  const towerSlabs: ReturnType<typeof createBoxElement>[] = [];
  for (let i = 0; i < 10; i++) {
    const isCurrent = i === 0;
    towerSlabs.push(
      createBoxElement({
        name: `Tower Floor ${i + 1}`,
        size: { x: 4 - i * 0.2, y: 0.4, z: 1 },
        transform: {
          position: { x: 600, y: 120 + i * 30, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
        },
        material: {
          color: isCurrent ? '#8b7ec8' : i < 3 ? '#5d4f8c' : '#3a2c5c',
          opacity: 1,
        },
        tags: ['tower-floor'],
      }),
    );
  }

  // Hero — top-down movement + space-throws a card projectile.
  const hero = createSphereElement({
    name: 'Hero',
    radius: 0.55,
    transform: {
      position: { x: 220, y: 500, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    material: { color: '#34d399', opacity: 1 },
    tags: ['player'],
    behaviors: [
      { type: 'top-down-controller', speed: 5, controls: 'both' },
      {
        type: 'shoot-projectile',
        trigger: 'space',
        cooldownMs: 320,
        direction: 'right',
        projectileSpeed: 14,
        projectileSize: 0.4,
        projectileColor: '#fbbf24',
        damage: 1,
        victimTag: 'enemy',
        lifetimeMs: 1400,
      },
    ],
  });

  // Hand of 5 decorative cards in front of the hero.
  const cardTints = ['#fef3c7', '#fde68a', '#fef3c7', '#fcd34d', '#fef3c7'];
  const handCards: ReturnType<typeof createBoxElement>[] = [];
  for (let i = 0; i < 5; i++) {
    handCards.push(
      createBoxElement({
        name: `Hand Card ${i + 1}`,
        size: { x: 0.8, y: 1.1, z: 1 },
        transform: {
          position: { x: 130 + i * 60, y: 130, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
        },
        material: { color: cardTints[i], opacity: 1 },
        tags: ['card'],
      }),
    );
  }

  // Three enemies patrolling the right half — the actual "floors" you fight.
  const enemySpecs = [
    { x: 850, y: 250, vx: 0, vy: 2 },
    { x: 980, y: 380, vx: 0, vy: -2 },
    { x: 850, y: 510, vx: 0, vy: 2 },
  ];
  const enemies = enemySpecs.map((e, i) =>
    createSphereElement({
      name: `Floor Guard ${i + 1}`,
      radius: 0.55,
      transform: {
        position: { x: e.x, y: e.y, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      material: { color: '#ef4444', opacity: 1 },
      tags: ['enemy'],
      behaviors: [
        { type: 'auto-move', velocityX: e.vx, velocityY: e.vy, reverseOnHit: true },
        {
          type: 'damage-on-contact',
          victimTag: 'player',
          damage: 1,
          destroySelfOnHit: false,
          cooldownMs: 700,
        },
        { type: 'win-on-tag-destroyed', targetTag: 'enemy' },
      ],
    }),
  );

  scene.elements = { [hero.id]: hero };
  for (const w of walls) scene.elements[w.id] = w;
  for (const t of towerSlabs) scene.elements[t.id] = t;
  for (const c of handCards) scene.elements[c.id] = c;
  for (const e of enemies) scene.elements[e.id] = e;

  scene.gameState = {
    initialScore: 0,
    initialHealth: 4,
    winScore: 0,
    winSurviveSec: 0,
    cameraFollowId: hero.id,
  };

  return scene;
}

function buildPvpWagerArena(): GameScene {
  // Race-for-the-pot duel: Blue is the controllable player. Red is an AI
  // bouncing around the arena. Wager chips are scattered as pickups — the
  // first to collect enough wins. Red's contact damages you, so positioning
  // matters too.
  const scene = createEmptyScene('PvP Wager Arena');
  scene.settings.renderEngine = 'phaser';
  scene.settings.backgroundColor = '#0c1226';

  // Octagon-ish bounds via four walls (the visual stage is implicit).
  const wallSpec: { name: string; x: number; y: number; w: number; h: number }[] = [
    { name: 'Stage Top', x: 600, y: 700, w: 20, h: 0.5 },
    { name: 'Stage Bottom', x: 600, y: 60, w: 20, h: 0.5 },
    { name: 'Stage Left', x: 150, y: 380, w: 0.5, h: 13 },
    { name: 'Stage Right', x: 1050, y: 380, w: 0.5, h: 13 },
  ];
  const walls = wallSpec.map((w) =>
    createBoxElement({
      name: w.name,
      transform: {
        position: { x: w.x, y: w.y, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      size: { x: w.w, y: w.h, z: 1 },
      material: { color: '#1c2447', opacity: 1 },
      tags: ['solid'],
      behaviors: [{ type: 'solid', surfaceTag: 'solid' }],
    }),
  );

  // Player Blue (controlled by user).
  const blue = createSphereElement({
    name: 'Player Blue',
    radius: 0.6,
    transform: {
      position: { x: 280, y: 380, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    material: { color: '#60a5fa', opacity: 1 },
    tags: ['player'],
    behaviors: [{ type: 'top-down-controller', speed: 6, controls: 'both' }],
  });

  // Player Red — AI rival bouncing around. We tag them 'rival' so the wager
  // pickups (collectorTag = 'player') don't trigger from Red. Red bumps into
  // walls + Blue, dealing damage on contact.
  const red = createSphereElement({
    name: 'Player Red',
    radius: 0.6,
    transform: {
      position: { x: 920, y: 380, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    material: { color: '#ef4444', opacity: 1 },
    tags: ['rival'],
    behaviors: [
      { type: 'auto-move', velocityX: -3, velocityY: 2, reverseOnHit: true },
      {
        type: 'damage-on-contact',
        victimTag: 'player',
        damage: 1,
        destroySelfOnHit: false,
        cooldownMs: 700,
      },
    ],
  });

  // Wager chips — scattered as pickups. Blue racing to collect = winning.
  // 6 chips at 25 each = 150 max, win at 100 (need ~4 of 6).
  const chipSpecs = [
    { x: 360, y: 220, color: '#3b82f6' },
    { x: 360, y: 540, color: '#3b82f6' },
    { x: 600, y: 200, color: '#fbbf24' },
    { x: 600, y: 560, color: '#fbbf24' },
    { x: 840, y: 220, color: '#dc2626' },
    { x: 840, y: 540, color: '#dc2626' },
  ];
  const chips = chipSpecs.map((c, i) =>
    createBoxElement({
      name: `Wager Chip ${i + 1}`,
      size: { x: 0.7, y: 0.7, z: 1 },
      transform: {
        position: { x: c.x, y: c.y, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      material: { color: c.color, opacity: 1 },
      tags: ['pickup'],
      behaviors: [
        {
          type: 'pickup-on-contact',
          collectorTag: 'player',
          scoreDelta: 25,
          healthDelta: 0,
          destroyOnPickup: true,
        },
      ],
    }),
  );

  // Glowing "VS" coin in the center — bigger pickup, the bonus payout.
  const vsCoin = createSphereElement({
    name: 'VS Coin',
    radius: 0.45,
    transform: {
      position: { x: 600, y: 380, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    material: { color: '#fbbf24', opacity: 1 },
    tags: ['pickup'],
    behaviors: [
      {
        type: 'pickup-on-contact',
        collectorTag: 'player',
        scoreDelta: 50,
        healthDelta: 0,
        destroyOnPickup: true,
      },
    ],
  });

  scene.elements = {
    [blue.id]: blue,
    [red.id]: red,
    [vsCoin.id]: vsCoin,
  };
  for (const w of walls) scene.elements[w.id] = w;
  for (const c of chips) scene.elements[c.id] = c;

  scene.gameState = {
    initialScore: 0,
    initialHealth: 3,
    winScore: 100,
    winSurviveSec: 0,
    cameraFollowId: blue.id,
  };

  return scene;
}

function buildPredictionArena(): GameScene {
  // Two podiums of pickup chips — YES on the left, NO on the right.
  // Pick a side, harvest its chips, and your score reflects "betting" on
  // that outcome. Win at 60 score = 6 chips on either side.
  // The chip values differ (YES 12, NO 8) to mirror the implied "62/38" odds.
  const scene = createEmptyScene('Prediction Arena');
  scene.settings.renderEngine = 'phaser';
  scene.settings.backgroundColor = '#0a1424';

  // Arena bounds.
  const wallSpec: { name: string; x: number; y: number; w: number; h: number }[] = [
    { name: 'Top Edge', x: 600, y: 700, w: 22, h: 0.5 },
    { name: 'Bottom Edge', x: 600, y: 60, w: 22, h: 0.5 },
    { name: 'Left Edge', x: 100, y: 380, w: 0.5, h: 13 },
    { name: 'Right Edge', x: 1100, y: 380, w: 0.5, h: 13 },
  ];
  const walls = wallSpec.map((w) =>
    createBoxElement({
      name: w.name,
      transform: {
        position: { x: w.x, y: w.y, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      size: { x: w.w, y: w.h, z: 1 },
      material: { color: '#172033', opacity: 1 },
      tags: ['solid'],
      behaviors: [{ type: 'solid', surfaceTag: 'solid' }],
    }),
  );

  // YES podium (left, green plinth) + NO podium (right, red plinth).
  const yesPodium = createBoxElement({
    name: 'YES Podium',
    size: { x: 4, y: 1, z: 1 },
    transform: {
      position: { x: 300, y: 200, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    material: { color: '#065f46', opacity: 1 },
    tags: ['outcome'],
  });
  const noPodium = createBoxElement({
    name: 'NO Podium',
    size: { x: 4, y: 1, z: 1 },
    transform: {
      position: { x: 900, y: 200, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    material: { color: '#7f1d1d', opacity: 1 },
    tags: ['outcome'],
  });

  // 6 YES chips on the left podium (12 pts each) and 6 NO chips on the right
  // podium (8 pts each). YES side is the "easier" 60-pt path → mirrors 62% odds.
  const chips: ReturnType<typeof createBoxElement>[] = [];
  for (let i = 0; i < 6; i++) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    chips.push(
      createBoxElement({
        name: `YES Chip ${i + 1}`,
        size: { x: 0.7, y: 0.7, z: 1 },
        transform: {
          position: { x: 240 + col * 60, y: 320 + row * 60, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
        },
        material: { color: '#10b981', opacity: 1 },
        tags: ['pickup'],
        behaviors: [
          {
            type: 'pickup-on-contact',
            collectorTag: 'player',
            scoreDelta: 12,
            healthDelta: 0,
            destroyOnPickup: true,
          },
        ],
      }),
    );
    chips.push(
      createBoxElement({
        name: `NO Chip ${i + 1}`,
        size: { x: 0.7, y: 0.7, z: 1 },
        transform: {
          position: { x: 840 + col * 60, y: 320 + row * 60, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
        },
        material: { color: '#ef4444', opacity: 1 },
        tags: ['pickup'],
        behaviors: [
          {
            type: 'pickup-on-contact',
            collectorTag: 'player',
            scoreDelta: 8,
            healthDelta: 0,
            destroyOnPickup: true,
          },
        ],
      }),
    );
  }

  const player = createBoxElement({
    name: 'Player',
    transform: {
      position: { x: 600, y: 540, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    size: { x: 0.9, y: 0.9, z: 1 },
    material: { color: '#fde68a', opacity: 1 },
    tags: ['player'],
    behaviors: [{ type: 'top-down-controller', speed: 6, controls: 'both' }],
  });

  scene.elements = {
    [yesPodium.id]: yesPodium,
    [noPodium.id]: noPodium,
    [player.id]: player,
  };
  for (const w of walls) scene.elements[w.id] = w;
  for (const c of chips) scene.elements[c.id] = c;

  scene.gameState = {
    initialScore: 0,
    initialHealth: 3,
    winScore: 60,
    winSurviveSec: 0,
    cameraFollowId: player.id,
  };

  return scene;
}

// ─── Three.js showcases (Roblox-style 3D scaffolds, visual-only) ────────
// These scenes render in the Three.js GameCanvas (not Phaser), so behaviors
// are ignored — there is no player character or input. They exist so users
// can pan around with OrbitControls, see a polished 3D layout, and remix
// into the editor as a starting point for their own 3D game.

function buildObbyTower(): GameScene {
  // Spiral parkour course. Platforms climb in a tight helix around a central
  // void; reach the gold beacon on top.
  const scene = createEmptyScene('Obby Tower');
  scene.settings.renderEngine = 'three';
  scene.settings.backgroundColor = '#1a1a3e';
  scene.settings.ambientLightIntensity = 0.55;

  // Base spawn pad — large round-ish white slab.
  const spawn = createBoxElement({
    name: 'Spawn Pad',
    size: { x: 6, y: 0.3, z: 6 },
    transform: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    material: { color: '#f8fafc', opacity: 1 },
    tags: ['spawn'],
  });
  scene.elements[spawn.id] = spawn;

  // 18 jump platforms spiralling up. Colors cycle through a pastel rainbow.
  // Rotations wrap to [-2π, 2π] — the schema's hard limit.
  const palette = [
    '#f87171', '#fb923c', '#facc15', '#a3e635', '#34d399',
    '#22d3ee', '#60a5fa', '#a78bfa', '#f472b6',
  ];
  const TAU = Math.PI * 2;
  for (let i = 0; i < 18; i++) {
    const angle = (i / 18) * Math.PI * 4; // two full turns
    const radius = 4.5;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const y = 1.5 + i * 1.2;
    const plat = createBoxElement({
      name: `Platform ${i + 1}`,
      size: { x: 2, y: 0.3, z: 2 },
      transform: {
        position: { x, y, z },
        rotation: { x: 0, y: -(angle % TAU), z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      material: { color: palette[i % palette.length], opacity: 1 },
      tags: ['platform'],
    });
    scene.elements[plat.id] = plat;
  }

  // Hazard spikes between sets of platforms.
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2 + 0.4;
    const radius = 6.5;
    const spike = createBoxElement({
      name: `Spike ${i + 1}`,
      size: { x: 0.5, y: 0.8, z: 0.5 },
      transform: {
        position: { x: Math.cos(angle) * radius, y: 0.4, z: Math.sin(angle) * radius },
        rotation: { x: 0, y: 0, z: Math.PI / 4 },
        scale: { x: 1, y: 1, z: 1 },
      },
      material: { color: '#7f1d1d', opacity: 1 },
      tags: ['hazard'],
    });
    scene.elements[spike.id] = spike;
  }

  // Gold beacon column at the top.
  const beaconBase = createBoxElement({
    name: 'Beacon Base',
    size: { x: 3, y: 0.4, z: 3 },
    transform: {
      position: { x: 0, y: 24, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    material: { color: '#fde047', opacity: 1 },
    tags: ['goal'],
  });
  const beaconSpire = createBoxElement({
    name: 'Beacon Spire',
    size: { x: 0.6, y: 4, z: 0.6 },
    transform: {
      position: { x: 0, y: 26.2, z: 0 },
      rotation: { x: 0, y: Math.PI / 4, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    material: { color: '#facc15', opacity: 1 },
    tags: ['goal'],
  });
  const beaconOrb = createSphereElement({
    name: 'Beacon Orb',
    radius: 0.55,
    transform: {
      position: { x: 0, y: 28.5, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    material: { color: '#fef9c3', opacity: 1 },
    tags: ['goal'],
  });
  scene.elements[beaconBase.id] = beaconBase;
  scene.elements[beaconSpire.id] = beaconSpire;
  scene.elements[beaconOrb.id] = beaconOrb;

  // Hovering title text.
  const title = createTextElement({
    name: 'Title',
    content: 'TOWER OF OBBY',
    fontSize: 0.8,
    color: '#fde68a',
    transform: {
      position: { x: 0, y: 31, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
  });
  scene.elements[title.id] = title;

  return scene;
}

function buildSwordArena(): GameScene {
  // Medieval colosseum with four sword pedestals at the cardinal points
  // and a stone altar in the center. Crowd seating ring around the edge.
  const scene = createEmptyScene('Sword Arena');
  scene.settings.renderEngine = 'three';
  scene.settings.backgroundColor = '#2c1e0f';
  scene.settings.ambientLightIntensity = 0.55;

  // Sand arena floor.
  const floor = createPlaneElement({
    name: 'Sand Floor',
    width: 16,
    height: 16,
    transform: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: -Math.PI / 2, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    material: { color: '#b08968', opacity: 1 },
  });
  scene.elements[floor.id] = floor;

  // Outer stone ring made of 24 wedge-like boxes.
  for (let i = 0; i < 24; i++) {
    const angle = (i / 24) * Math.PI * 2;
    const r = 8.5;
    const wall = createBoxElement({
      name: `Wall Stone ${i + 1}`,
      size: { x: 2.5, y: 1.2, z: 0.6 },
      transform: {
        position: { x: Math.cos(angle) * r, y: 0.6, z: Math.sin(angle) * r },
        rotation: { x: 0, y: -angle + Math.PI / 2, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      material: { color: '#78716c', opacity: 1 },
      tags: ['wall'],
    });
    scene.elements[wall.id] = wall;
  }

  // Tiered crowd seating — three concentric rings of slightly taller boxes.
  for (let tier = 0; tier < 3; tier++) {
    const r = 10 + tier * 1.4;
    const y = 1.5 + tier * 0.9;
    for (let i = 0; i < 32; i++) {
      const angle = (i / 32) * Math.PI * 2;
      const seat = createBoxElement({
        name: `Seat T${tier + 1}-${i + 1}`,
        size: { x: 1.2, y: 0.6, z: 0.8 },
        transform: {
          position: { x: Math.cos(angle) * r, y, z: Math.sin(angle) * r },
          rotation: { x: 0, y: -angle + Math.PI / 2, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
        },
        material: { color: tier === 1 ? '#57534e' : '#44403c', opacity: 1 },
        tags: ['seat'],
      });
      scene.elements[seat.id] = seat;
    }
  }

  // Center altar — stacked stone slabs.
  const altarBase = createBoxElement({
    name: 'Altar Base',
    size: { x: 2.2, y: 0.4, z: 2.2 },
    transform: {
      position: { x: 0, y: 0.2, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    material: { color: '#a8a29e', opacity: 1 },
    tags: ['altar'],
  });
  const altarTop = createBoxElement({
    name: 'Altar Top',
    size: { x: 1.6, y: 0.3, z: 1.6 },
    transform: {
      position: { x: 0, y: 0.55, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    material: { color: '#d6d3d1', opacity: 1 },
    tags: ['altar'],
  });
  scene.elements[altarBase.id] = altarBase;
  scene.elements[altarTop.id] = altarTop;

  // Four sword pedestals + their swords (blade + crossguard + hilt).
  const swordSpecs = [
    { x: 5, z: 0, angle: Math.PI, blade: '#cbd5e1', grip: '#7f1d1d' },
    { x: -5, z: 0, angle: 0, blade: '#fde047', grip: '#1e293b' },
    { x: 0, z: 5, angle: Math.PI / 2, blade: '#a7f3d0', grip: '#831843' },
    { x: 0, z: -5, angle: -Math.PI / 2, blade: '#fbcfe8', grip: '#1e1b4b' },
  ];
  swordSpecs.forEach((s, i) => {
    const pedestal = createBoxElement({
      name: `Pedestal ${i + 1}`,
      size: { x: 1, y: 1.4, z: 1 },
      transform: {
        position: { x: s.x, y: 0.7, z: s.z },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      material: { color: '#525252', opacity: 1 },
      tags: ['pedestal'],
    });
    const blade = createBoxElement({
      name: `Sword ${i + 1} Blade`,
      size: { x: 0.25, y: 2.4, z: 0.1 },
      transform: {
        position: { x: s.x, y: 2.8, z: s.z },
        rotation: { x: 0, y: s.angle, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      material: { color: s.blade, opacity: 1 },
      tags: ['sword'],
    });
    const guard = createBoxElement({
      name: `Sword ${i + 1} Guard`,
      size: { x: 0.8, y: 0.15, z: 0.2 },
      transform: {
        position: { x: s.x, y: 1.6, z: s.z },
        rotation: { x: 0, y: s.angle, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      material: { color: '#71717a', opacity: 1 },
      tags: ['sword'],
    });
    const grip = createBoxElement({
      name: `Sword ${i + 1} Grip`,
      size: { x: 0.18, y: 0.5, z: 0.18 },
      transform: {
        position: { x: s.x, y: 1.3, z: s.z },
        rotation: { x: 0, y: s.angle, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      material: { color: s.grip, opacity: 1 },
      tags: ['sword'],
    });
    scene.elements[pedestal.id] = pedestal;
    scene.elements[blade.id] = blade;
    scene.elements[guard.id] = guard;
    scene.elements[grip.id] = grip;
  });

  // Torches at the four corners (sphere flame on a tall post).
  const torchPositions = [
    { x: 7, z: 7 }, { x: -7, z: 7 }, { x: 7, z: -7 }, { x: -7, z: -7 },
  ];
  torchPositions.forEach((p, i) => {
    const post = createBoxElement({
      name: `Torch Post ${i + 1}`,
      size: { x: 0.25, y: 2.5, z: 0.25 },
      transform: {
        position: { x: p.x, y: 1.25, z: p.z },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      material: { color: '#3f3f46', opacity: 1 },
      tags: ['torch'],
    });
    const flame = createSphereElement({
      name: `Torch Flame ${i + 1}`,
      radius: 0.32,
      transform: {
        position: { x: p.x, y: 2.7, z: p.z },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      material: { color: '#fb923c', opacity: 1 },
      tags: ['flame'],
    });
    scene.elements[post.id] = post;
    scene.elements[flame.id] = flame;
  });

  // Banner sign overhead.
  const banner = createTextElement({
    name: 'Banner',
    content: 'SWORD ARENA',
    fontSize: 0.9,
    color: '#fde68a',
    transform: {
      position: { x: 0, y: 7, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
  });
  scene.elements[banner.id] = banner;

  return scene;
}

function buildTycoonFactory(): GameScene {
  // Modular industrial base: dropper → conveyor → cash pile, with a smokestack
  // and a sign. Classic Roblox tycoon vibe.
  const scene = createEmptyScene('Tycoon Factory');
  scene.settings.renderEngine = 'three';
  scene.settings.backgroundColor = '#0f172a';
  scene.settings.ambientLightIntensity = 0.6;

  // Concrete floor.
  const floor = createPlaneElement({
    name: 'Concrete Floor',
    width: 22,
    height: 22,
    transform: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: -Math.PI / 2, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    material: { color: '#475569', opacity: 1 },
  });
  scene.elements[floor.id] = floor;

  // Factory shell — four walls + roof skeleton.
  const wallSpec = [
    { name: 'Wall Back', x: 0, z: -8, w: 16, d: 0.4 },
    { name: 'Wall Front', x: 0, z: 8, w: 16, d: 0.4 },
    { name: 'Wall Left', x: -8, z: 0, w: 0.4, d: 16 },
    { name: 'Wall Right', x: 8, z: 0, w: 0.4, d: 16 },
  ];
  wallSpec.forEach((w) => {
    const wall = createBoxElement({
      name: w.name,
      size: { x: w.w, y: 4, z: w.d },
      transform: {
        position: { x: w.x, y: 2, z: w.z },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      material: { color: '#9ca3af', opacity: 1 },
      tags: ['wall'],
    });
    scene.elements[wall.id] = wall;
  });

  // Dropper machine — a tall mint-green box with a chute.
  const dropper = createBoxElement({
    name: 'Dropper',
    size: { x: 2, y: 3, z: 2 },
    transform: {
      position: { x: -5, y: 1.5, z: -4 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    material: { color: '#34d399', opacity: 1 },
    tags: ['machine'],
  });
  const dropperChute = createBoxElement({
    name: 'Dropper Chute',
    size: { x: 0.6, y: 1, z: 0.6 },
    transform: {
      position: { x: -5, y: 0.5, z: -2.8 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    material: { color: '#10b981', opacity: 1 },
    tags: ['machine'],
  });
  scene.elements[dropper.id] = dropper;
  scene.elements[dropperChute.id] = dropperChute;

  // Conveyor belt — long thin dark box.
  const conveyor = createBoxElement({
    name: 'Conveyor Belt',
    size: { x: 6, y: 0.4, z: 1.2 },
    transform: {
      position: { x: -1, y: 0.2, z: -2 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    material: { color: '#1f2937', opacity: 1 },
    tags: ['conveyor'],
  });
  scene.elements[conveyor.id] = conveyor;

  // Coins on the conveyor.
  for (let i = 0; i < 5; i++) {
    const coin = createSphereElement({
      name: `Conveyor Coin ${i + 1}`,
      radius: 0.25,
      transform: {
        position: { x: -3.4 + i * 1.2, y: 0.55, z: -2 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      material: { color: '#fbbf24', opacity: 1 },
      tags: ['coin'],
    });
    scene.elements[coin.id] = coin;
  }

  // Money pile — stacked green boxes at the end of the conveyor.
  for (let layer = 0; layer < 4; layer++) {
    const count = 4 - layer;
    for (let i = 0; i < count; i++) {
      const bill = createBoxElement({
        name: `Cash Stack ${layer + 1}-${i + 1}`,
        size: { x: 0.8, y: 0.15, z: 0.5 },
        transform: {
          position: {
            x: 4 + (i - (count - 1) / 2) * 0.9,
            y: 0.08 + layer * 0.17,
            z: -2,
          },
          rotation: { x: 0, y: layer * 0.1, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
        },
        material: { color: layer % 2 === 0 ? '#22c55e' : '#16a34a', opacity: 1 },
        tags: ['cash'],
      });
      scene.elements[bill.id] = bill;
    }
  }

  // Smokestack — tall cylinder approximated by a stretched box.
  const stack = createBoxElement({
    name: 'Smokestack',
    size: { x: 1.4, y: 6, z: 1.4 },
    transform: {
      position: { x: 5.5, y: 3, z: -6 },
      rotation: { x: 0, y: Math.PI / 4, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    material: { color: '#52525b', opacity: 1 },
    tags: ['machine'],
  });
  const stackCap = createBoxElement({
    name: 'Stack Cap',
    size: { x: 1.6, y: 0.3, z: 1.6 },
    transform: {
      position: { x: 5.5, y: 6.1, z: -6 },
      rotation: { x: 0, y: Math.PI / 4, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    material: { color: '#27272a', opacity: 1 },
    tags: ['machine'],
  });
  scene.elements[stack.id] = stack;
  scene.elements[stackCap.id] = stackCap;

  // Three puffs of smoke (white spheres) above the smokestack.
  for (let i = 0; i < 3; i++) {
    const puff = createSphereElement({
      name: `Smoke Puff ${i + 1}`,
      radius: 0.5 + i * 0.1,
      transform: {
        position: { x: 5.5 + i * 0.3, y: 7 + i * 0.8, z: -6 + i * 0.4 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      material: { color: '#e5e7eb', opacity: 0.8 },
      tags: ['smoke'],
    });
    scene.elements[puff.id] = puff;
  }

  // Sign.
  const sign = createTextElement({
    name: 'Sign',
    content: 'TYCOON FACTORY',
    fontSize: 0.7,
    color: '#fbbf24',
    transform: {
      position: { x: 0, y: 5, z: -7.7 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
  });
  scene.elements[sign.id] = sign;

  // Cash counter display (decorative number).
  const counter = createTextElement({
    name: 'Cash Counter',
    content: '$12,450',
    fontSize: 0.5,
    color: '#4ade80',
    transform: {
      position: { x: 6, y: 4, z: 7.7 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
  });
  scene.elements[counter.id] = counter;

  return scene;
}

function buildRaceTrack(): GameScene {
  // Oval race track with checkered start, striped barriers, and a single
  // hero car composed of primitives.
  const scene = createEmptyScene('Race Track');
  scene.settings.renderEngine = 'three';
  scene.settings.backgroundColor = '#1e293b';
  scene.settings.ambientLightIntensity = 0.65;

  // Grass infield.
  const grass = createPlaneElement({
    name: 'Infield Grass',
    width: 22,
    height: 16,
    transform: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: -Math.PI / 2, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    material: { color: '#166534', opacity: 1 },
  });
  scene.elements[grass.id] = grass;

  // Track ring — 48 dark asphalt boxes arranged in an oval shape (radial).
  for (let i = 0; i < 48; i++) {
    const t = (i / 48) * Math.PI * 2;
    const rx = 12;
    const rz = 9;
    const x = Math.cos(t) * rx;
    const z = Math.sin(t) * rz;
    const segment = createBoxElement({
      name: `Track Segment ${i + 1}`,
      size: { x: 1.7, y: 0.1, z: 2.4 },
      transform: {
        position: { x, y: 0.05, z },
        rotation: { x: 0, y: -t + Math.PI / 2, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      material: { color: '#1f2937', opacity: 1 },
      tags: ['track'],
    });
    scene.elements[segment.id] = segment;
  }

  // Outer barriers — red/white striped, evenly spaced.
  for (let i = 0; i < 24; i++) {
    const t = (i / 24) * Math.PI * 2;
    const rx = 14;
    const rz = 11;
    const barrier = createBoxElement({
      name: `Barrier ${i + 1}`,
      size: { x: 1.4, y: 0.5, z: 0.4 },
      transform: {
        position: { x: Math.cos(t) * rx, y: 0.25, z: Math.sin(t) * rz },
        rotation: { x: 0, y: -t + Math.PI / 2, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      material: { color: i % 2 === 0 ? '#dc2626' : '#f8fafc', opacity: 1 },
      tags: ['barrier'],
    });
    scene.elements[barrier.id] = barrier;
  }

  // Checkered start/finish stripe (8 alternating tiles across the front).
  for (let i = 0; i < 8; i++) {
    const tile = createBoxElement({
      name: `Start Tile ${i + 1}`,
      size: { x: 0.45, y: 0.12, z: 2.4 },
      transform: {
        position: { x: 12 + (i - 3.5) * 0.45, y: 0.11, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      material: { color: i % 2 === 0 ? '#0f172a' : '#f8fafc', opacity: 1 },
      tags: ['start'],
    });
    scene.elements[tile.id] = tile;
  }

  // Hero car — chassis, cabin, four wheels.
  const carPos = { x: 12, y: 0, z: 0.6 };
  const chassis = createBoxElement({
    name: 'Car Chassis',
    size: { x: 2.2, y: 0.5, z: 1.1 },
    transform: {
      position: { x: carPos.x, y: 0.6, z: carPos.z },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    material: { color: '#ef4444', opacity: 1 },
    tags: ['car'],
  });
  const cabin = createBoxElement({
    name: 'Car Cabin',
    size: { x: 1.1, y: 0.5, z: 0.9 },
    transform: {
      position: { x: carPos.x - 0.1, y: 1.05, z: carPos.z },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    material: { color: '#1e1b4b', opacity: 1 },
    tags: ['car'],
  });
  const wheelOffsets = [
    { x: 0.7, z: 0.55 },
    { x: -0.7, z: 0.55 },
    { x: 0.7, z: -0.55 },
    { x: -0.7, z: -0.55 },
  ];
  const wheels = wheelOffsets.map((w, i) =>
    createSphereElement({
      name: `Wheel ${i + 1}`,
      radius: 0.3,
      transform: {
        position: { x: carPos.x + w.x, y: 0.3, z: carPos.z + w.z },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      material: { color: '#18181b', opacity: 1 },
      tags: ['car'],
    }),
  );
  scene.elements[chassis.id] = chassis;
  scene.elements[cabin.id] = cabin;
  for (const w of wheels) scene.elements[w.id] = w;

  // Lap counter sign over the start line.
  const sign = createTextElement({
    name: 'Lap Sign',
    content: 'LAP 1 / 3',
    fontSize: 0.6,
    color: '#fde68a',
    transform: {
      position: { x: 12, y: 5, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
  });
  scene.elements[sign.id] = sign;

  return scene;
}

function buildSkyblockIslands(): GameScene {
  // Four floating grass-and-dirt islands in a void, connected by thin
  // bridge planks. Tree per island + central main island.
  const scene = createEmptyScene('Skyblock Islands');
  scene.settings.renderEngine = 'three';
  scene.settings.backgroundColor = '#7dd3fc';
  scene.settings.ambientLightIntensity = 0.7;

  type IslandSpec = { name: string; x: number; z: number; radius: number; treeCount: number };
  const islands: IslandSpec[] = [
    { name: 'Main Island', x: 0, z: 0, radius: 4, treeCount: 3 },
    { name: 'Forest Island', x: 10, z: 2, radius: 2.5, treeCount: 2 },
    { name: 'Mountain Island', x: -8, z: -4, radius: 2.5, treeCount: 1 },
    { name: 'Beach Island', x: 2, z: 9, radius: 2.5, treeCount: 1 },
  ];

  for (const isle of islands) {
    // Grass top — a wide flat box.
    const grassTop = createBoxElement({
      name: `${isle.name} Grass`,
      size: { x: isle.radius * 2, y: 0.6, z: isle.radius * 2 },
      transform: {
        position: { x: isle.x, y: 0, z: isle.z },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      material: { color: '#4ade80', opacity: 1 },
      tags: ['grass'],
    });
    scene.elements[grassTop.id] = grassTop;

    // Dirt cone underneath — three tapering boxes.
    for (let layer = 0; layer < 3; layer++) {
      const w = isle.radius * 2 - layer * 0.7;
      const dirt = createBoxElement({
        name: `${isle.name} Dirt ${layer + 1}`,
        size: { x: Math.max(0.5, w), y: 0.7, z: Math.max(0.5, w) },
        transform: {
          position: { x: isle.x, y: -0.5 - layer * 0.7, z: isle.z },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
        },
        material: { color: layer === 0 ? '#92400e' : '#78350f', opacity: 1 },
        tags: ['dirt'],
      });
      scene.elements[dirt.id] = dirt;
    }

    // Trees — trunk box + green sphere canopy.
    for (let t = 0; t < isle.treeCount; t++) {
      const treeAngle = (t / Math.max(1, isle.treeCount)) * Math.PI * 2;
      const tx = isle.x + Math.cos(treeAngle) * (isle.radius * 0.5);
      const tz = isle.z + Math.sin(treeAngle) * (isle.radius * 0.5);
      const trunk = createBoxElement({
        name: `${isle.name} Trunk ${t + 1}`,
        size: { x: 0.4, y: 1.6, z: 0.4 },
        transform: {
          position: { x: tx, y: 1.1, z: tz },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
        },
        material: { color: '#78350f', opacity: 1 },
        tags: ['tree'],
      });
      const leaves = createSphereElement({
        name: `${isle.name} Leaves ${t + 1}`,
        radius: 0.9,
        transform: {
          position: { x: tx, y: 2.3, z: tz },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
        },
        material: { color: '#16a34a', opacity: 1 },
        tags: ['tree'],
      });
      scene.elements[trunk.id] = trunk;
      scene.elements[leaves.id] = leaves;
    }
  }

  // Bridges from main to each outer island. Five plank segments each.
  const bridges = [
    { from: { x: 0, z: 0 }, to: { x: 10, z: 2 } },
    { from: { x: 0, z: 0 }, to: { x: -8, z: -4 } },
    { from: { x: 0, z: 0 }, to: { x: 2, z: 9 } },
  ];
  bridges.forEach((b, idx) => {
    const dx = b.to.x - b.from.x;
    const dz = b.to.z - b.from.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const angle = Math.atan2(dz, dx);
    const steps = 5;
    for (let s = 1; s < steps; s++) {
      const px = b.from.x + (dx * s) / steps;
      const pz = b.from.z + (dz * s) / steps;
      const plank = createBoxElement({
        name: `Bridge ${idx + 1} Plank ${s}`,
        size: { x: dist / steps - 0.1, y: 0.15, z: 0.7 },
        transform: {
          position: { x: px, y: 0.3, z: pz },
          rotation: { x: 0, y: -angle, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
        },
        material: { color: '#a16207', opacity: 1 },
        tags: ['bridge'],
      });
      scene.elements[plank.id] = plank;
    }
  });

  // Treasure chest on the main island.
  const chestBase = createBoxElement({
    name: 'Chest Base',
    size: { x: 0.9, y: 0.5, z: 0.6 },
    transform: {
      position: { x: 1.5, y: 0.55, z: 1.5 },
      rotation: { x: 0, y: 0.4, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    material: { color: '#92400e', opacity: 1 },
    tags: ['chest'],
  });
  const chestLid = createBoxElement({
    name: 'Chest Lid',
    size: { x: 0.95, y: 0.18, z: 0.65 },
    transform: {
      position: { x: 1.5, y: 0.9, z: 1.5 },
      rotation: { x: -0.5, y: 0.4, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    material: { color: '#fbbf24', opacity: 1 },
    tags: ['chest'],
  });
  scene.elements[chestBase.id] = chestBase;
  scene.elements[chestLid.id] = chestLid;

  // Floating sky text.
  const title = createTextElement({
    name: 'Title',
    content: 'SKYBLOCK',
    fontSize: 1,
    color: '#fde047',
    transform: {
      position: { x: 0, y: 6, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
  });
  scene.elements[title.id] = title;

  return scene;
}

function buildHideAndSeekHouse(): GameScene {
  // Two-room house with furniture: beds, sofa, table, chairs, a fridge, and
  // a few hiding nooks. Roof omitted so the scene reads as a doll-house view.
  const scene = createEmptyScene('Hide and Seek House');
  scene.settings.renderEngine = 'three';
  scene.settings.backgroundColor = '#fef3c7';
  scene.settings.ambientLightIntensity = 0.75;

  // Wooden floor.
  const floor = createPlaneElement({
    name: 'House Floor',
    width: 14,
    height: 10,
    transform: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: -Math.PI / 2, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    material: { color: '#a16207', opacity: 1 },
  });
  scene.elements[floor.id] = floor;

  // Outer walls.
  const outerWalls = [
    { name: 'North Wall', x: 0, z: -5, w: 14, d: 0.3 },
    { name: 'South Wall', x: 0, z: 5, w: 14, d: 0.3 },
    { name: 'East Wall', x: 7, z: 0, w: 0.3, d: 10 },
    { name: 'West Wall', x: -7, z: 0, w: 0.3, d: 10 },
  ];
  outerWalls.forEach((w) => {
    const wall = createBoxElement({
      name: w.name,
      size: { x: w.w, y: 3, z: w.d },
      transform: {
        position: { x: w.x, y: 1.5, z: w.z },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      material: { color: '#fed7aa', opacity: 1 },
      tags: ['wall'],
    });
    scene.elements[wall.id] = wall;
  });

  // Interior partition with a doorway gap.
  const partition1 = createBoxElement({
    name: 'Partition Left',
    size: { x: 0.3, y: 3, z: 3.5 },
    transform: {
      position: { x: 0, y: 1.5, z: -3.25 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    material: { color: '#fdba74', opacity: 1 },
    tags: ['wall'],
  });
  const partition2 = createBoxElement({
    name: 'Partition Right',
    size: { x: 0.3, y: 3, z: 3.5 },
    transform: {
      position: { x: 0, y: 1.5, z: 3.25 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    material: { color: '#fdba74', opacity: 1 },
    tags: ['wall'],
  });
  scene.elements[partition1.id] = partition1;
  scene.elements[partition2.id] = partition2;

  // Bedroom (left half) — two beds.
  const bedSpecs = [
    { name: 'Bed 1', x: -5, z: -3, color: '#3b82f6' },
    { name: 'Bed 2', x: -5, z: 1.5, color: '#ec4899' },
  ];
  bedSpecs.forEach((b) => {
    const frame = createBoxElement({
      name: `${b.name} Frame`,
      size: { x: 2.2, y: 0.4, z: 1.4 },
      transform: {
        position: { x: b.x, y: 0.2, z: b.z },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      material: { color: '#451a03', opacity: 1 },
      tags: ['bed'],
    });
    const mattress = createBoxElement({
      name: `${b.name} Mattress`,
      size: { x: 2, y: 0.25, z: 1.2 },
      transform: {
        position: { x: b.x, y: 0.52, z: b.z },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      material: { color: b.color, opacity: 1 },
      tags: ['bed'],
    });
    const pillow = createBoxElement({
      name: `${b.name} Pillow`,
      size: { x: 0.6, y: 0.15, z: 0.45 },
      transform: {
        position: { x: b.x - 0.7, y: 0.72, z: b.z },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      material: { color: '#f8fafc', opacity: 1 },
      tags: ['bed'],
    });
    scene.elements[frame.id] = frame;
    scene.elements[mattress.id] = mattress;
    scene.elements[pillow.id] = pillow;
  });

  // Living area (right half) — sofa, coffee table, TV stand.
  const sofa = createBoxElement({
    name: 'Sofa',
    size: { x: 3, y: 0.6, z: 1.2 },
    transform: {
      position: { x: 4, y: 0.3, z: 3.4 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    material: { color: '#7c3aed', opacity: 1 },
    tags: ['furniture'],
  });
  const sofaBack = createBoxElement({
    name: 'Sofa Back',
    size: { x: 3, y: 0.6, z: 0.3 },
    transform: {
      position: { x: 4, y: 0.9, z: 3.95 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    material: { color: '#7c3aed', opacity: 1 },
    tags: ['furniture'],
  });
  const coffeeTable = createBoxElement({
    name: 'Coffee Table',
    size: { x: 1.6, y: 0.5, z: 0.9 },
    transform: {
      position: { x: 4, y: 0.25, z: 1.5 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    material: { color: '#451a03', opacity: 1 },
    tags: ['furniture'],
  });
  const tv = createBoxElement({
    name: 'TV',
    size: { x: 2, y: 1.2, z: 0.2 },
    transform: {
      position: { x: 4, y: 1.4, z: -2.5 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    material: { color: '#0c0a09', opacity: 1 },
    tags: ['furniture'],
  });
  scene.elements[sofa.id] = sofa;
  scene.elements[sofaBack.id] = sofaBack;
  scene.elements[coffeeTable.id] = coffeeTable;
  scene.elements[tv.id] = tv;

  // Kitchen corner (right side, top) — fridge + counter.
  const fridge = createBoxElement({
    name: 'Fridge',
    size: { x: 1, y: 1.8, z: 0.8 },
    transform: {
      position: { x: 6, y: 0.9, z: -4.2 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    material: { color: '#e2e8f0', opacity: 1 },
    tags: ['furniture'],
  });
  const counter = createBoxElement({
    name: 'Kitchen Counter',
    size: { x: 3, y: 0.9, z: 0.7 },
    transform: {
      position: { x: 3, y: 0.45, z: -4.3 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    material: { color: '#a8a29e', opacity: 1 },
    tags: ['furniture'],
  });
  scene.elements[fridge.id] = fridge;
  scene.elements[counter.id] = counter;

  // Plant pot — hiding nook.
  const pot = createBoxElement({
    name: 'Plant Pot',
    size: { x: 0.6, y: 0.6, z: 0.6 },
    transform: {
      position: { x: -6, y: 0.3, z: 4 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    material: { color: '#a16207', opacity: 1 },
    tags: ['plant'],
  });
  const leaves = createSphereElement({
    name: 'Plant Leaves',
    radius: 0.7,
    transform: {
      position: { x: -6, y: 1.1, z: 4 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    material: { color: '#16a34a', opacity: 1 },
    tags: ['plant'],
  });
  scene.elements[pot.id] = pot;
  scene.elements[leaves.id] = leaves;

  // Title overhead.
  const title = createTextElement({
    name: 'Title',
    content: 'HIDE AND SEEK',
    fontSize: 0.7,
    color: '#7c2d12',
    transform: {
      position: { x: 0, y: 5, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
  });
  scene.elements[title.id] = title;

  return scene;
}

function buildPlazaLobby(): GameScene {
  // Central hub plaza: a fountain in the middle, four colored portals around
  // the edge, lampposts, and benches. Roblox-style hub for routing players.
  const scene = createEmptyScene('Plaza Lobby');
  scene.settings.renderEngine = 'three';
  scene.settings.backgroundColor = '#312e81';
  scene.settings.ambientLightIntensity = 0.65;

  // Stone tile plaza floor.
  const floor = createPlaneElement({
    name: 'Plaza Floor',
    width: 20,
    height: 20,
    transform: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: -Math.PI / 2, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    material: { color: '#475569', opacity: 1 },
  });
  scene.elements[floor.id] = floor;

  // Checker tiles around the fountain — 4 rings of tiles.
  for (let ring = 1; ring <= 3; ring++) {
    const r = ring * 1.8;
    const count = ring * 8;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const tile = createBoxElement({
        name: `Tile R${ring}-${i + 1}`,
        size: { x: 0.9, y: 0.1, z: 0.9 },
        transform: {
          position: { x: Math.cos(angle) * r, y: 0.05, z: Math.sin(angle) * r },
          rotation: { x: 0, y: -angle, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
        },
        material: { color: (i + ring) % 2 === 0 ? '#cbd5e1' : '#64748b', opacity: 1 },
        tags: ['tile'],
      });
      scene.elements[tile.id] = tile;
    }
  }

  // Central fountain — stacked rings of stone with a water orb.
  const fountainBase = createBoxElement({
    name: 'Fountain Base',
    size: { x: 3, y: 0.4, z: 3 },
    transform: {
      position: { x: 0, y: 0.2, z: 0 },
      rotation: { x: 0, y: Math.PI / 4, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    material: { color: '#94a3b8', opacity: 1 },
    tags: ['fountain'],
  });
  const fountainBowl = createBoxElement({
    name: 'Fountain Bowl',
    size: { x: 2.2, y: 0.3, z: 2.2 },
    transform: {
      position: { x: 0, y: 0.55, z: 0 },
      rotation: { x: 0, y: Math.PI / 4, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    material: { color: '#cbd5e1', opacity: 1 },
    tags: ['fountain'],
  });
  const water = createSphereElement({
    name: 'Fountain Water',
    radius: 0.8,
    transform: {
      position: { x: 0, y: 1.1, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    material: { color: '#38bdf8', opacity: 0.7 },
    tags: ['fountain'],
  });
  const spout = createSphereElement({
    name: 'Fountain Spout',
    radius: 0.4,
    transform: {
      position: { x: 0, y: 2.2, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    material: { color: '#7dd3fc', opacity: 0.9 },
    tags: ['fountain'],
  });
  scene.elements[fountainBase.id] = fountainBase;
  scene.elements[fountainBowl.id] = fountainBowl;
  scene.elements[water.id] = water;
  scene.elements[spout.id] = spout;

  // Four portals to imaginary games — colored archway gates.
  const portals = [
    { x: 8, z: 0, color: '#22d3ee', label: 'OBBY' },
    { x: -8, z: 0, color: '#f43f5e', label: 'BATTLE' },
    { x: 0, z: 8, color: '#a3e635', label: 'RACE' },
    { x: 0, z: -8, color: '#fbbf24', label: 'TYCOON' },
  ];
  portals.forEach((p, i) => {
    const portalRing = createSphereElement({
      name: `Portal ${i + 1} Glow`,
      radius: 1.6,
      transform: {
        position: { x: p.x, y: 1.8, z: p.z },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      material: { color: p.color, opacity: 0.35 },
      tags: ['portal'],
    });
    const portalCore = createSphereElement({
      name: `Portal ${i + 1} Core`,
      radius: 1.1,
      transform: {
        position: { x: p.x, y: 1.8, z: p.z },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      material: { color: p.color, opacity: 0.85 },
      tags: ['portal'],
    });
    const portalBase = createBoxElement({
      name: `Portal ${i + 1} Base`,
      size: { x: 1.6, y: 0.3, z: 1.6 },
      transform: {
        position: { x: p.x, y: 0.15, z: p.z },
        rotation: { x: 0, y: Math.PI / 4, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      material: { color: '#1f2937', opacity: 1 },
      tags: ['portal'],
    });
    const label = createTextElement({
      name: `Portal ${i + 1} Label`,
      content: p.label,
      fontSize: 0.5,
      color: p.color,
      transform: {
        position: { x: p.x, y: 4, z: p.z },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
    });
    scene.elements[portalRing.id] = portalRing;
    scene.elements[portalCore.id] = portalCore;
    scene.elements[portalBase.id] = portalBase;
    scene.elements[label.id] = label;
  });

  // Lampposts in the gaps between portals.
  const lampAngles = [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4];
  lampAngles.forEach((angle, i) => {
    const r = 7;
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    const post = createBoxElement({
      name: `Lamppost ${i + 1}`,
      size: { x: 0.25, y: 3.2, z: 0.25 },
      transform: {
        position: { x, y: 1.6, z },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      material: { color: '#0f172a', opacity: 1 },
      tags: ['lamp'],
    });
    const bulb = createSphereElement({
      name: `Lamp Bulb ${i + 1}`,
      radius: 0.35,
      transform: {
        position: { x, y: 3.4, z },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      material: { color: '#fde047', opacity: 0.95 },
      tags: ['lamp'],
    });
    scene.elements[post.id] = post;
    scene.elements[bulb.id] = bulb;
  });

  // Two benches.
  const benchPositions = [
    { x: 4.5, z: 4.5, angle: -Math.PI / 4 },
    { x: -4.5, z: -4.5, angle: -Math.PI / 4 },
  ];
  benchPositions.forEach((b, i) => {
    const seat = createBoxElement({
      name: `Bench ${i + 1} Seat`,
      size: { x: 2.4, y: 0.2, z: 0.7 },
      transform: {
        position: { x: b.x, y: 0.45, z: b.z },
        rotation: { x: 0, y: b.angle, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      material: { color: '#a16207', opacity: 1 },
      tags: ['bench'],
    });
    const back = createBoxElement({
      name: `Bench ${i + 1} Back`,
      size: { x: 2.4, y: 0.7, z: 0.18 },
      transform: {
        position: {
          x: b.x + Math.sin(b.angle) * 0.3,
          y: 0.9,
          z: b.z + Math.cos(b.angle) * 0.3,
        },
        rotation: { x: 0, y: b.angle, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      material: { color: '#a16207', opacity: 1 },
      tags: ['bench'],
    });
    scene.elements[seat.id] = seat;
    scene.elements[back.id] = back;
  });

  // Welcome arch over the plaza.
  const title = createTextElement({
    name: 'Welcome Sign',
    content: 'PLAZA',
    fontSize: 1.1,
    color: '#f8fafc',
    transform: {
      position: { x: 0, y: 6, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
  });
  scene.elements[title.id] = title;

  return scene;
}

function buildFlyBirds(): GameScene {
  // Flappy Bird in the Phaser runtime. The bird is a platformer-controller
  // so space = jump (flap). Pipes are pairs of "solid" boxes that auto-move
  // left toward the bird; on contact they damage the player. Survive 30s
  // to win. The bottom edge is the kill floor (damage tile).
  const scene = createEmptyScene('Fly Birds');
  scene.settings.renderEngine = 'phaser';
  scene.settings.backgroundColor = '#5eb8ff';

  // Solid ceiling + floor (the floor is grass-green, the ceiling is invisible
  // by being out of view but still bounds the bird).
  const floor = createBoxElement({
    name: 'Floor',
    transform: {
      position: { x: 600, y: 40, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    size: { x: 24, y: 1, z: 1 },
    material: { color: '#4ade80', opacity: 1 },
    tags: ['solid', 'enemy'],
    behaviors: [
      { type: 'solid', surfaceTag: 'solid' },
      // Touching the ground = lose health (classic flappy fail).
      {
        type: 'damage-on-contact',
        victimTag: 'player',
        damage: 1,
        destroySelfOnHit: false,
        cooldownMs: 1000,
      },
    ],
  });

  const ceiling = createBoxElement({
    name: 'Ceiling',
    transform: {
      position: { x: 600, y: 760, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    size: { x: 24, y: 0.5, z: 1 },
    material: { color: '#4ade80', opacity: 1 },
    tags: ['solid'],
    behaviors: [{ type: 'solid', surfaceTag: 'solid' }],
  });

  // Pipe pairs — green columns with a gap. Each pipe is 2 boxes (top + bottom).
  // The bird must fly through the gap. Boxes auto-move left and reverse on
  // wall hit so they recycle naturally instead of disappearing.
  const pipeSpecs = [
    { x: 1100, gapY: 380 },
    { x: 1500, gapY: 280 },
    { x: 1900, gapY: 480 },
  ];
  const pipes: ReturnType<typeof createBoxElement>[] = [];
  pipeSpecs.forEach((p, i) => {
    pipes.push(
      createBoxElement({
        name: `Pipe ${i + 1} Bottom`,
        transform: {
          position: { x: p.x, y: (p.gapY - 220) / 2 + 40, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
        },
        size: { x: 1.4, y: (p.gapY - 220) / 50, z: 1 },
        material: { color: '#16a34a', opacity: 1 },
        tags: ['enemy'],
        behaviors: [
          { type: 'auto-move', velocityX: -4, velocityY: 0, reverseOnHit: true },
          {
            type: 'damage-on-contact',
            victimTag: 'player',
            damage: 1,
            destroySelfOnHit: false,
            cooldownMs: 900,
          },
        ],
      }),
    );
    pipes.push(
      createBoxElement({
        name: `Pipe ${i + 1} Top`,
        transform: {
          position: { x: p.x, y: (p.gapY + 220 + 760) / 2, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
        },
        size: { x: 1.4, y: (760 - (p.gapY + 220)) / 50, z: 1 },
        material: { color: '#16a34a', opacity: 1 },
        tags: ['enemy'],
        behaviors: [
          { type: 'auto-move', velocityX: -4, velocityY: 0, reverseOnHit: true },
          {
            type: 'damage-on-contact',
            victimTag: 'player',
            damage: 1,
            destroySelfOnHit: false,
            cooldownMs: 900,
          },
        ],
      }),
    );
  });

  // The bird itself — high gravity so each flap feels short and snappy.
  const bird = createSphereElement({
    name: 'Bird',
    transform: {
      position: { x: 300, y: 400, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    radius: 0.45,
    material: { color: '#fde047', opacity: 1 },
    tags: ['player'],
    behaviors: [
      {
        type: 'platformer-controller',
        speed: 3,
        jumpVelocity: 11,
        gravity: 36,
        controls: 'both',
        groundTag: 'solid',
      },
    ],
  });

  scene.elements = {
    [floor.id]: floor,
    [ceiling.id]: ceiling,
    [bird.id]: bird,
  };
  for (const p of pipes) scene.elements[p.id] = p;

  scene.gameState = {
    initialScore: 0,
    initialHealth: 3,
    winScore: 0,
    winSurviveSec: 30,
    cameraFollowId: bird.id,
  };

  return scene;
}

function buildChess3D(): GameScene {
  // Three.js-rendered chess scaffold. This is a *visual* template — the
  // current behavior catalog has no turn-based system, so pieces are static.
  // Remixers can drag pieces around in the editor, or wire behaviors later
  // once the engine adds turn semantics.
  const scene = createEmptyScene('3D Chess');
  scene.settings.renderEngine = 'three';
  scene.settings.backgroundColor = '#1a1a2e';
  scene.settings.ambientLightIntensity = 0.6;

  // 8x8 board: alternating light/dark squares as thin boxes.
  const squares: ReturnType<typeof createBoxElement>[] = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const light = (row + col) % 2 === 0;
      squares.push(
        createBoxElement({
          name: `Square ${String.fromCharCode(97 + col)}${row + 1}`,
          size: { x: 1, y: 0.1, z: 1 },
          transform: {
            position: { x: col - 3.5, y: 0, z: row - 3.5 },
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
          },
          material: { color: light ? '#f5deb3' : '#3b2417', opacity: 1 },
          tags: ['square'],
        }),
      );
    }
  }

  // Border ring around the board.
  const border = createBoxElement({
    name: 'Board Border',
    size: { x: 9, y: 0.1, z: 9 },
    transform: {
      position: { x: 0, y: -0.1, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    material: { color: '#2a1810', opacity: 1 },
    tags: ['border'],
  });

  // Piece factory: pawns are short cylinders, majors are taller boxes.
  // We approximate pieces with simple primitives so the scaffold looks like
  // chess without needing a sprite/model pipeline.
  type PieceSpec = { kind: string; col: number; row: number; side: 'white' | 'black' };
  const pieces: PieceSpec[] = [];

  const majorOrder = ['Rook', 'Knight', 'Bishop', 'Queen', 'King', 'Bishop', 'Knight', 'Rook'];
  for (let col = 0; col < 8; col++) {
    pieces.push({ kind: majorOrder[col], col, row: 0, side: 'white' });
    pieces.push({ kind: 'Pawn', col, row: 1, side: 'white' });
    pieces.push({ kind: 'Pawn', col, row: 6, side: 'black' });
    pieces.push({ kind: majorOrder[col], col, row: 7, side: 'black' });
  }

  const pieceElements = pieces.map((p) => {
    const whiteCol = '#f8fafc';
    const blackCol = '#1f1f1f';
    const color = p.side === 'white' ? whiteCol : blackCol;
    const isPawn = p.kind === 'Pawn';
    const isMajor = p.kind === 'King' || p.kind === 'Queen';
    const height = isPawn ? 0.5 : isMajor ? 0.9 : 0.7;

    if (isPawn) {
      return createSphereElement({
        name: `${p.side === 'white' ? 'W' : 'B'} ${p.kind} ${p.col + 1}`,
        radius: 0.22,
        transform: {
          position: { x: p.col - 3.5, y: 0.27, z: p.row - 3.5 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
        },
        material: { color, opacity: 1 },
        tags: ['piece', p.side, p.kind.toLowerCase()],
      });
    }
    return createBoxElement({
      name: `${p.side === 'white' ? 'W' : 'B'} ${p.kind} ${p.col + 1}`,
      size: { x: 0.5, y: height, z: 0.5 },
      transform: {
        position: { x: p.col - 3.5, y: height / 2 + 0.05, z: p.row - 3.5 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      material: { color, opacity: 1 },
      tags: ['piece', p.side, p.kind.toLowerCase()],
    });
  });

  // Stage lighting — one warm spotlight from above and a key light from the
  // side so the pieces cast subtle shadows.
  const overheadLight = createLightElement({
    name: 'Overhead Light',
    intensity: 1.4,
    transform: {
      position: { x: 0, y: 8, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
  });
  const keyLight = createLightElement({
    name: 'Key Light',
    intensity: 0.9,
    transform: {
      position: { x: 5, y: 5, z: 5 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
  });

  scene.elements[border.id] = border;
  for (const s of squares) scene.elements[s.id] = s;
  for (const p of pieceElements) scene.elements[p.id] = p;
  scene.elements[overheadLight.id] = overheadLight;
  scene.elements[keyLight.id] = keyLight;

  return scene;
}

/**
 * Vampire Survivors-style 3D arena with a Roblox-flavored low-poly palette.
 *
 * Setup:
 *   - Large square ground plane in saturated green
 *   - Stacked-block player (body + head, like a Roblox avatar) at origin,
 *     top-down movement + auto-projectile firing forward
 *   - Four enemy spawners at cardinal compass points pushing red blob enemies
 *     toward the center on a slow drift
 *   - Scattered low-poly trees + rocks for visual depth
 *   - XP gem pickups (cyan spheres) sprinkled around the field
 *   - Bright directional sun + soft ambient for the Roblox "studio light" look
 *
 * The behavior runtime is render-engine agnostic, so this `renderEngine: 'three'`
 * scene still gets the platformer's enemy/projectile/pickup wiring.
 */
function buildVampireSurvivors3D(): GameScene {
  const scene = createEmptyScene('Vampire Arena');
  scene.settings.renderEngine = 'three';
  scene.settings.backgroundColor = '#7dd3fc'; // sky blue
  scene.settings.ambientLightIntensity = 0.55;

  // Ground: 40x40 plane in saturated grass green.
  const ground = createPlaneElement({
    name: 'Ground',
    width: 40,
    height: 40,
    transform: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: -Math.PI / 2, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    material: { color: '#4ade80', opacity: 1 },
    tags: ['ground'],
  });
  scene.elements[ground.id] = ground;

  // Player — Roblox-style stacked avatar: 1x1.4x0.6 body + spherical head.
  const playerBody = createBoxElement({
    name: 'Player',
    size: { x: 1, y: 1.4, z: 0.6 },
    transform: {
      position: { x: 0, y: 0.7, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    material: { color: '#fbbf24', opacity: 1 }, // gold body
    tags: ['player'],
    behaviors: [
      { type: 'top-down-controller', speed: 6, controls: 'both' },
      {
        type: 'shoot-projectile',
        trigger: 'auto',
        cooldownMs: 280,
        direction: 'forward',
        projectileSpeed: 16,
        projectileSize: 0.3,
        projectileColor: '#fef08a',
        damage: 1,
        victimTag: 'enemy',
        lifetimeMs: 1600,
      },
    ],
  });
  scene.elements[playerBody.id] = playerBody;

  const playerHead = createSphereElement({
    name: 'Player Head',
    radius: 0.45,
    transform: {
      position: { x: 0, y: 1.7, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    material: { color: '#fde047', opacity: 1 },
    tags: ['decoration'],
  });
  scene.elements[playerHead.id] = playerHead;

  // Enemy template: red blob sphere with damage-on-contact.
  const enemyTemplate = createSphereElement({
    name: 'Enemy Template',
    radius: 0.55,
    transform: {
      position: { x: 100, y: 100, z: 100 }, // off-screen until spawned
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    material: { color: '#ef4444', opacity: 1 },
    tags: ['enemy'],
    visible: false,
    behaviors: [
      {
        type: 'damage-on-contact',
        victimTag: 'player',
        damage: 1,
        cooldownMs: 600,
      },
    ],
  });
  scene.elements[enemyTemplate.id] = enemyTemplate;

  // Four spawners drifting enemies toward the center from N/S/E/W.
  const spawnSpec: Array<{ name: string; x: number; z: number; vx: number; vz: number }> = [
    { name: 'Spawner N', x: 0, z: -16, vx: 0, vz: 2.2 },
    { name: 'Spawner S', x: 0, z: 16, vx: 0, vz: -2.2 },
    { name: 'Spawner E', x: 16, z: 0, vx: -2.2, vz: 0 },
    { name: 'Spawner W', x: -16, z: 0, vx: 2.2, vz: 0 },
  ];
  for (const s of spawnSpec) {
    const spawner = createBoxElement({
      name: s.name,
      size: { x: 1, y: 0.5, z: 1 },
      transform: {
        position: { x: s.x, y: 0.25, z: s.z },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      material: { color: '#a855f7', opacity: 0.4 },
      tags: ['spawner'],
      behaviors: [
        {
          type: 'spawner',
          templateElementId: enemyTemplate.id,
          intervalMs: 1400,
          maxConcurrent: 8,
          spawnVelocityX: s.vx,
          spawnVelocityY: s.vz, // engine treats Y as travel axis on top-down 3D
          offsetX: 0,
          offsetY: 0,
          cloneLifetimeMs: 0,
        },
      ],
    });
    scene.elements[spawner.id] = spawner;
  }

  // XP gem pickups — small cyan spheres scattered around the field.
  const gemSpots: Array<[number, number]> = [
    [-6, -6], [6, -6], [-6, 6], [6, 6],
    [-10, 0], [10, 0], [0, -10], [0, 10],
    [-3, 8], [3, -8], [8, -3], [-8, 3],
  ];
  gemSpots.forEach(([x, z], i) => {
    const gem = createSphereElement({
      name: `XP Gem ${i + 1}`,
      radius: 0.3,
      transform: {
        position: { x, y: 0.4, z },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      material: { color: '#22d3ee', opacity: 1 },
      tags: ['pickup'],
      behaviors: [
        {
          type: 'pickup-on-contact',
          collectorTag: 'player',
          points: 5,
        },
      ],
    });
    scene.elements[gem.id] = gem;
  });

  // Low-poly trees (block trunk + sphere foliage) for environment depth.
  const treeSpots: Array<[number, number]> = [
    [-13, -13], [13, -13], [-13, 13], [13, 13],
    [-18, 0], [18, 0], [0, -18], [0, 18],
    [-11, 8], [11, -8], [-8, -11], [8, 11],
  ];
  treeSpots.forEach(([x, z], i) => {
    const trunk = createBoxElement({
      name: `Tree ${i + 1} Trunk`,
      size: { x: 0.5, y: 1.2, z: 0.5 },
      transform: {
        position: { x, y: 0.6, z },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      material: { color: '#92400e', opacity: 1 },
      tags: ['decoration'],
    });
    const foliage = createSphereElement({
      name: `Tree ${i + 1} Foliage`,
      radius: 0.9,
      transform: {
        position: { x, y: 1.7, z },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      material: { color: '#16a34a', opacity: 1 },
      tags: ['decoration'],
    });
    scene.elements[trunk.id] = trunk;
    scene.elements[foliage.id] = foliage;
  });

  // A few scattered rocks for visual interest.
  const rockSpots: Array<[number, number, number]> = [
    [-5, -3, 0.4], [4, 6, 0.5], [9, -7, 0.6], [-9, 5, 0.45],
  ];
  rockSpots.forEach(([x, z, size], i) => {
    const rock = createBoxElement({
      name: `Rock ${i + 1}`,
      size: { x: size * 2, y: size * 1.4, z: size * 2 },
      transform: {
        position: { x, y: size * 0.7, z },
        rotation: { x: 0, y: i * 0.6, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      material: { color: '#71717a', opacity: 1 },
      tags: ['decoration'],
    });
    scene.elements[rock.id] = rock;
  });

  // Lighting: directional "studio sun" + soft sky-fill.
  const sun = createLightElement({
    name: 'Sun',
    lightType: 'directional',
    color: '#fff5d6',
    intensity: 1.2,
    transform: {
      position: { x: 10, y: 18, z: 10 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
  });
  scene.elements[sun.id] = sun;

  // Survive 60 seconds to win. Camera follows the player avatar.
  scene.gameState = {
    initialScore: 0,
    initialHealth: 5,
    winScore: 0,
    winSurviveSec: 60,
    cameraFollowId: playerBody.id,
  };

  return scene;
}

// Build and validate all templates
const rawTemplates: TemplateEntry[] = [
  {
    name: 'Platformer (Playable)',
    description: 'Jump platforms, dodge an enemy, collect 4 coins to win. WASD/arrows + space to jump.',
    category: 'platformer',
    scene: buildPlatformerPlayable(),
  },
  {
    name: 'Top-Down Arena (Playable)',
    description: 'Walk through an arena, dodge patrolling enemies, collect 6 gems. WASD or arrows.',
    category: 'shooter',
    scene: buildTopDownShooterPlayable(),
  },
  {
    name: 'Wave Shooter (Playable)',
    description: 'Top-down arena where two spawners pump enemies in. Click to shoot, survive 60 seconds.',
    category: 'shooter',
    scene: buildWaveShooterPlayable(),
  },
  {
    name: 'Pixel Platformer (Playable)',
    description: 'Tilemap-based platformer with 4 coins across 3 platforms. WASD/arrows + space.',
    category: 'platformer',
    scene: buildTilemapPlatformerPlayable(),
  },
  {
    name: 'Platformer',
    description: 'Side-scrolling platformer: dodge three patrolling enemies, collect three coins. WASD/arrows + space.',
    category: 'platformer',
    scene: buildPlatformer(),
  },
  {
    name: 'Space Shooter',
    description: 'Pilot a ship at the bottom and auto-fire bullets upward. Destroy four drifting enemies to win.',
    category: 'shooter',
    scene: buildSpaceShooter(),
  },
  {
    name: 'Top-Down Shooter',
    description: 'Cover-based arena: click to shoot, take cover behind the quadrant walls, clear six patrolling enemies.',
    category: 'shooter',
    scene: buildTopDownShooter(),
  },
  {
    name: 'Card Battle',
    description: 'Action-card duel: WASD to move, space to throw cards at the patrolling enemy creature. Destroy it to win.',
    category: 'card',
    scene: buildCardBattle(),
  },
  {
    name: 'Card Roguelike Tower',
    description: 'Climb-the-tower combat: throw projectile cards (space) at three floor guards while dodging their contact damage.',
    category: 'card',
    scene: buildCardRoguelikeTower(),
  },
  {
    name: 'PvP Wager Arena',
    description: 'Race the AI rival for the wager pot. Collect chips around the stage; the center VS coin is worth double. Dodge the red opponent.',
    category: 'strategy',
    scene: buildPvpWagerArena(),
  },
  {
    name: 'Prediction Arena',
    description: 'Pick a side: harvest YES chips (12 pts each) or NO chips (8 pts each) to hit 60. Models 62/38 implied odds.',
    category: 'strategy',
    scene: buildPredictionArena(),
  },
  {
    name: 'Match-3',
    description: 'Sweep a 6x6 gem board for points (10 each). Two patrolling sweepers add danger. Win at 200.',
    category: 'puzzle',
    scene: buildMatch3(),
  },
  {
    name: 'Puzzle',
    description: 'Collect all nine colored blocks on a 3x3 grid. Simple top-down warm-up.',
    category: 'puzzle',
    scene: buildPuzzle(),
  },
  {
    name: 'Endless Runner',
    description: 'Stationary runner — jump (space) the red obstacles flying in from the right. Survive 30 seconds.',
    category: 'runner',
    scene: buildEndlessRunner(),
  },
  {
    name: 'Fly Birds',
    description: 'Flappy-bird clone: tap space to flap, weave through the pipe gaps. Survive 30 seconds.',
    category: 'runner',
    scene: buildFlyBirds(),
  },
  {
    name: '3D Chess',
    description: 'Three.js 3D chess scaffold — full board + 32 starting pieces. Visual template, remix to add your own rules.',
    category: 'puzzle',
    scene: buildChess3D(),
  },
  {
    name: 'Vampire Arena (3D)',
    description: 'Roblox-style 3D top-down survivor. WASD to move, auto-fire toward forward. Dodge red blobs from four spawners, grab cyan XP gems, survive 60s.',
    category: 'shooter',
    scene: buildVampireSurvivors3D(),
  },
  {
    name: 'Obby Tower',
    description: 'Roblox-style spiral parkour tower with rainbow platforms and a gold goal beacon. Three.js showcase — pan to explore.',
    category: 'showcase',
    scene: buildObbyTower(),
  },
  {
    name: 'Sword Arena',
    description: 'Medieval colosseum with four sword pedestals, tiered crowd seating, and corner torches. Three.js showcase.',
    category: 'showcase',
    scene: buildSwordArena(),
  },
  {
    name: 'Tycoon Factory',
    description: 'Industrial tycoon base: dropper → conveyor → cash pile, plus a smoking smokestack. Three.js showcase.',
    category: 'showcase',
    scene: buildTycoonFactory(),
  },
  {
    name: 'Race Track',
    description: 'Oval race circuit with striped barriers, checkered start line, and a hero car on the grid. Three.js showcase.',
    category: 'showcase',
    scene: buildRaceTrack(),
  },
  {
    name: 'Skyblock Islands',
    description: 'Four floating grass-and-dirt islands in a blue void, linked by wooden bridges. Three.js showcase.',
    category: 'showcase',
    scene: buildSkyblockIslands(),
  },
  {
    name: 'Hide and Seek House',
    description: 'Doll-house view: bedroom + living room + kitchen with sofa, beds, fridge, and a hiding plant. Three.js showcase.',
    category: 'showcase',
    scene: buildHideAndSeekHouse(),
  },
  {
    name: 'Plaza Lobby',
    description: 'Roblox-style hub plaza with a central fountain, four colored game portals, lampposts, and benches. Three.js showcase.',
    category: 'showcase',
    scene: buildPlazaLobby(),
  },
  {
    name: 'Empty Canvas',
    description: 'Start from scratch with a clean scene',
    category: 'starter',
    scene: buildEmptyCanvas(),
  },
];

// Validate every template scene against the schema at module load
export const TEMPLATE_SCENES: TemplateEntry[] = rawTemplates.map((t) => {
  GameSceneSchema.parse(t.scene);
  return t;
});
