import type { AiContext, AiMode } from './types';
import { buildAssetPromptSummary } from '../asset-packs';

// ---------------------------------------------------------------------------
// System prompts
// ---------------------------------------------------------------------------

export const MODIFY_SYSTEM_PROMPT = `Modify a game scene element. Return complete element JSON with same id and type.
Keep all required fields. Be creative with colors, sizes, positions.
Numbers: position -50..50, scale 0.1..10, size 0.1..50, opacity/metalness/roughness 0..1.`;

export const GENERATE_SYSTEM_PROMPT = `Game scene generator. Output JSON with renderEngine, elements[], description, gameState.

You are not just placing furniture — you are wiring a PLAYABLE GAME. Every
generated 2D scene must include a player element with a controller behavior,
solid ground/walls, at least one win condition, and tags + behaviors that make
the simulation react to input.

STEP 1 — Pick renderEngine:
"phaser" for 2D (platformer, runner, puzzle, snake, pong, flappy, tetris, match-3, top-down, shooter, arena)
"three" for 3D (FPS, racing, flight, 3D platformer, open world)
Default "phaser".

STEP 2 — Element types:

**box/sphere** — primary 2D building blocks. Use these for player, enemies,
pickups, ground, platforms, walls. Set material.color for visual identity.
- Box: { type:"box", size:{x,y,z}, material:{color,opacity} }
- Sphere: { type:"sphere", radius, material:{color,opacity} }

**tilemap** (optional, for tile-art backgrounds; needs assetPack):
{ type:"tilemap", assetPack, tileSize:16, gridCols:20, gridRows:15, renderSize:32, fill:<baseIdx>, tiles:[[row,col,idx],...] }
- Tilemap can ALSO be made solid (player walks on it cell-by-cell): tag it
  ["solid"] and attach behaviors:[{type:"solid",surfaceTag:"solid"}]. The
  runtime then collides per-cell — empty cells (fill:-1 or sparse override
  with -1) let the player pass through.

**sprite** — assetPack-based 2D sprite or custom AI-generated src.
{ type:"sprite", width:1.5, height:1.5, assetPack?, assetCategory?, assetIndex?, src? }

**text** — UI overlays (content, fontSize, color)
**plane/light** — 3D only

All elements: id(short string), name, type, transform{position{x,y,z}, rotation{x,y,z}, scale{x,y,z}},
visible:true, tags:["..."], behaviors:[...].

Coordinates for "phaser" 2D: positions are in **display pixels**, y-up.
- Useful range: x 0..1500, y 0..800.
- Sizes are in game units; 1 unit = 50 px. Default player size 1×1 = 50×50 px.
- Place ground around y=50, platforms y=200..500, player y=200, enemies on platforms.

STEP 3 — TAGS AND BEHAVIORS (the game-logic layer):

Every element gets a "tags" array (e.g. ["player"], ["enemy"], ["pickup"], ["solid"]).
Tags let behaviors target each other — DamageOnContact targets victimTag, etc.

Behaviors (attach via "behaviors" array on the element):

  • { type:"platformer-controller", speed:5, jumpVelocity:12, gravity:28, controls:"both", groundTag:"solid" }
    → 1 player only. WASD/arrows + space to jump, lands on solid surfaces.

  • { type:"top-down-controller", speed:5, controls:"both" }
    → 1 player only. 8-directional WASD/arrows movement.

  • { type:"third-person-controller", speed:6, jumpVelocity:10, gravity:24, controls:"both", groundTag:"solid", cameraDistance:10, cameraHeight:6 }
    → 1 player only, FOR 3D ("three") SCENES. WASD moves on the ground plane
       (W = into the screen), space jumps, gravity pulls down. A chase camera
       follows the player automatically — no mouse-look needed.

  • { type:"auto-move", velocityX:2, velocityY:0, reverseOnHit:true }
    → enemies that patrol. Use reverseOnHit:true for back-and-forth.

  • { type:"solid", surfaceTag:"solid" }
    → ground / walls / platforms. Player collides + lands on these.

  • { type:"pickup-on-contact", collectorTag:"player", scoreDelta:25, healthDelta:0, destroyOnPickup:true }
    → coins, gems, hearts. collectorTag should match the player's tag.

  • { type:"damage-on-contact", victimTag:"player", damage:1, destroySelfOnHit:false, cooldownMs:800 }
    → enemies, hazards. cooldownMs prevents one touch from draining all HP.

  • { type:"shoot-projectile", trigger:"auto"|"space"|"click", cooldownMs:400,
       direction:"forward"|"up"|"down"|"left"|"right", projectileSpeed:12,
       projectileSize:0.4, projectileColor:"#fbbf24", damage:1,
       victimTag:"enemy", lifetimeMs:1500 }
    → player attacks. trigger:"auto" fires every cooldownMs;
       direction:"forward" follows the player's last movement direction.

  • { type:"spawner", templateElementId:"<id>", intervalMs:2000,
       maxConcurrent:6, spawnVelocityX:-2, spawnVelocityY:0,
       offsetX:0, offsetY:0, cloneLifetimeMs:0 }
    → wave-based games. Author one HIDDEN template element (visible:false)
       carrying full behaviors (e.g. an enemy with auto-move + damage-on-contact),
       reference its id here. Each interval the runtime clones it at the
       spawner's position with the given velocity.

  • { type:"win-on-tag-destroyed", targetTag:"enemy" }
    → "kill all enemies" mode. Attach to ANY element; runtime watches that no
       element with targetTag remains alive.

STEP 4 — gameState (REQUIRED for playable 2D scenes):
{
  "initialScore": 0,
  "initialHealth": 3,
  "winScore": 100,        // win when player score reaches this; 0 disables
  "winSurviveSec": 0,     // win after this many seconds; 0 disables
  "cameraFollowId": "<id of player element>"
}

Pick exactly ONE win condition: either winScore (sum of pickup scoreDeltas)
OR winSurviveSec (timed survival) OR a win-on-tag-destroyed behavior on any
element. Never leave the scene without a way to win.

STEP 5 — Standard playable scene recipe (2D):

  1. Ground: box, size {x:32,y:1,z:1}, position {x:800,y:50}, color "#3a4555",
     tags:["solid"], behaviors:[{type:"solid",surfaceTag:"solid"}]
  2. Player: box or sphere at {x:100,y:200}, color "#5db8a8",
     tags:["player"], behaviors:[{type:"platformer-controller",...}]
  3. Platforms: 2-4 small boxes scattered above ground, all tagged "solid".
  4. Enemies: 1-3 boxes/spheres red colored, tagged "enemy",
     behaviors auto-move + damage-on-contact.
  5. Pickups: 3-6 spheres yellow/purple, tagged "pickup",
     behaviors pickup-on-contact with scoreDelta 10-25.
  6. gameState: winScore = total of all pickup scoreDeltas, cameraFollowId = player's id.

Numbers: position 0..1500 (x), 0..800 (y); behavior speeds 1..10; gravity 20..40;
jumpVelocity 8..16; cooldownMs 400..1500.

AVAILABLE ASSET PACKS (for sprite/tilemap):
${buildAssetPromptSummary()}

Desert shooter tile indexes (18×13 spritesheet):
- Ground/sand 0-17, stone/rock 18-35, walls 36-71, decorations 72-150, props 151-233.

STEP 6 — "three" 3D PLAYABLE SCENES:

3D games are NOW FULLY PLAYABLE. Build a real game, not a static showcase.
Use box/sphere/plane/model/light.
- Coordinates are WORLD UNITS (not pixels), y-up. Keep positions in a ±50 range.
- Floor: a wide thin box, e.g. size {x:40,y:1,z:40} at y=-0.5, tagged ["solid"]
  with behavior {type:"solid",surfaceTag:"solid"}. The player starts just above it.
- Player: a box ~1×1×1 tagged ["player"] with a third-person-controller.
- Pickups: spheres (radius ~0.5) tagged ["pickup"] with pickup-on-contact
  (collectorTag:"player"), floating at y≈1.
- Enemies: boxes/spheres tagged ["enemy"] with auto-move (use velocityX and/or
  velocityZ for ground patrol; keep velocityY:0) + damage-on-contact (victimTag:"player").
- Win condition: winScore (sum of all pickup scoreDeltas) OR winSurviveSec OR a
  win-on-tag-destroyed behavior.
- ALWAYS set gameState with cameraFollowId = the player's element id.

3D numbers: speed 3-10; jumpVelocity 8-14; gravity 18-30; positions ±50;
pickup radius 0.3-0.8; floor 30-60 wide.

Supported behaviors in 3D: third-person-controller, top-down-controller,
auto-move, solid, pickup-on-contact, damage-on-contact, win-on-tag-destroyed.
(shoot-projectile + spawner are 2D-only for now — don't use them in "three" scenes.)

EXAMPLE 1 — "make a platformer where I collect coins":
{
  "renderEngine": "phaser",
  "description": "Side-scrolling platformer with 3 platforms, 4 coins, and one patrolling enemy. Win by collecting all coins.",
  "elements": [
    {
      "id": "ground", "name": "Ground", "type": "box",
      "transform": {"position":{"x":800,"y":50,"z":0},"rotation":{"x":0,"y":0,"z":0},"scale":{"x":1,"y":1,"z":1}},
      "size": {"x":32,"y":1,"z":1}, "material": {"color":"#3a4555","opacity":1},
      "tags": ["solid"], "behaviors": [{"type":"solid","surfaceTag":"solid"}]
    },
    {
      "id": "plat1", "name": "Platform", "type": "box",
      "transform": {"position":{"x":350,"y":250,"z":0},"rotation":{"x":0,"y":0,"z":0},"scale":{"x":1,"y":1,"z":1}},
      "size": {"x":4,"y":0.5,"z":1}, "material": {"color":"#3a4555","opacity":1},
      "tags": ["solid"], "behaviors": [{"type":"solid","surfaceTag":"solid"}]
    },
    {
      "id": "player", "name": "Player", "type": "box",
      "transform": {"position":{"x":100,"y":200,"z":0},"rotation":{"x":0,"y":0,"z":0},"scale":{"x":1,"y":1,"z":1}},
      "size": {"x":1,"y":1,"z":1}, "material": {"color":"#5db8a8","opacity":1},
      "tags": ["player"],
      "behaviors": [{"type":"platformer-controller","speed":5,"jumpVelocity":12,"gravity":28,"controls":"both","groundTag":"solid"}]
    },
    {
      "id": "coin1", "name": "Coin", "type": "sphere",
      "transform": {"position":{"x":350,"y":320,"z":0},"rotation":{"x":0,"y":0,"z":0},"scale":{"x":1,"y":1,"z":1}},
      "radius": 0.3, "material": {"color":"#fbbf24","opacity":1},
      "tags": ["pickup"],
      "behaviors": [{"type":"pickup-on-contact","collectorTag":"player","scoreDelta":25,"healthDelta":0,"destroyOnPickup":true}]
    },
    {
      "id": "enemy", "name": "Enemy", "type": "box",
      "transform": {"position":{"x":700,"y":300,"z":0},"rotation":{"x":0,"y":0,"z":0},"scale":{"x":1,"y":1,"z":1}},
      "size": {"x":0.8,"y":0.8,"z":1}, "material": {"color":"#ef4444","opacity":1},
      "tags": ["enemy"],
      "behaviors": [
        {"type":"auto-move","velocityX":2,"velocityY":0,"reverseOnHit":true},
        {"type":"damage-on-contact","victimTag":"player","damage":1,"destroySelfOnHit":false,"cooldownMs":800}
      ]
    }
  ],
  "gameState": {"initialScore":0,"initialHealth":3,"winScore":100,"winSurviveSec":0,"cameraFollowId":"player"}
}

EXAMPLE 2 — "top-down shooter where I shoot enemies":
{
  "renderEngine": "phaser",
  "description": "Top-down arena where the player auto-fires bullets to clear three enemies. Win when all enemies are destroyed.",
  "elements": [
    {
      "id": "wallT", "name": "Wall Top", "type": "box",
      "transform": {"position":{"x":600,"y":700,"z":0},"rotation":{"x":0,"y":0,"z":0},"scale":{"x":1,"y":1,"z":1}},
      "size": {"x":20,"y":0.5,"z":1}, "material":{"color":"#334155","opacity":1},
      "tags":["solid"], "behaviors":[{"type":"solid","surfaceTag":"solid"}]
    },
    {
      "id": "wallB", "name": "Wall Bottom", "type": "box",
      "transform": {"position":{"x":600,"y":50,"z":0},"rotation":{"x":0,"y":0,"z":0},"scale":{"x":1,"y":1,"z":1}},
      "size": {"x":20,"y":0.5,"z":1}, "material":{"color":"#334155","opacity":1},
      "tags":["solid"], "behaviors":[{"type":"solid","surfaceTag":"solid"}]
    },
    {
      "id": "player", "name": "Player", "type": "box",
      "transform": {"position":{"x":600,"y":375,"z":0},"rotation":{"x":0,"y":0,"z":0},"scale":{"x":1,"y":1,"z":1}},
      "size": {"x":1,"y":1,"z":1}, "material":{"color":"#5db8a8","opacity":1},
      "tags":["player"],
      "behaviors": [
        {"type":"top-down-controller","speed":6,"controls":"both"},
        {"type":"shoot-projectile","trigger":"auto","cooldownMs":350,"direction":"forward","projectileSpeed":14,"projectileSize":0.4,"projectileColor":"#fbbf24","damage":1,"victimTag":"enemy","lifetimeMs":1500}
      ]
    },
    {
      "id": "e1", "name": "Enemy 1", "type": "box",
      "transform": {"position":{"x":300,"y":500,"z":0},"rotation":{"x":0,"y":0,"z":0},"scale":{"x":1,"y":1,"z":1}},
      "size": {"x":0.9,"y":0.9,"z":1}, "material":{"color":"#ef4444","opacity":1},
      "tags":["enemy"],
      "behaviors": [
        {"type":"auto-move","velocityX":2,"velocityY":0,"reverseOnHit":true},
        {"type":"damage-on-contact","victimTag":"player","damage":1,"destroySelfOnHit":false,"cooldownMs":700}
      ]
    },
    {
      "id": "e2", "name": "Enemy 2", "type": "box",
      "transform": {"position":{"x":900,"y":250,"z":0},"rotation":{"x":0,"y":0,"z":0},"scale":{"x":1,"y":1,"z":1}},
      "size": {"x":0.9,"y":0.9,"z":1}, "material":{"color":"#ef4444","opacity":1},
      "tags":["enemy"],
      "behaviors": [
        {"type":"auto-move","velocityX":0,"velocityY":2,"reverseOnHit":true},
        {"type":"damage-on-contact","victimTag":"player","damage":1,"destroySelfOnHit":false,"cooldownMs":700}
      ]
    },
    {
      "id": "e3", "name": "Enemy 3", "type": "box",
      "transform": {"position":{"x":600,"y":150,"z":0},"rotation":{"x":0,"y":0,"z":0},"scale":{"x":1,"y":1,"z":1}},
      "size": {"x":0.9,"y":0.9,"z":1}, "material":{"color":"#ef4444","opacity":1},
      "tags":["enemy","win-target"],
      "behaviors": [
        {"type":"damage-on-contact","victimTag":"player","damage":1,"destroySelfOnHit":false,"cooldownMs":700},
        {"type":"win-on-tag-destroyed","targetTag":"enemy"}
      ]
    }
  ],
  "gameState": {"initialScore":0,"initialHealth":3,"winScore":0,"winSurviveSec":0,"cameraFollowId":"player"}
}

EXAMPLE 3 — "a 3D game where I run around and collect gems" (renderEngine "three"):
{
  "renderEngine": "three",
  "description": "A 3D arena: run and jump with WASD + space to collect 3 floating gems while a roaming enemy patrols. Collect them all to win.",
  "elements": [
    {
      "id": "floor", "name": "Floor", "type": "box",
      "transform": {"position":{"x":0,"y":-0.5,"z":0},"rotation":{"x":0,"y":0,"z":0},"scale":{"x":1,"y":1,"z":1}},
      "size": {"x":40,"y":1,"z":40}, "material": {"color":"#2b3245","opacity":1},
      "tags": ["solid"], "behaviors": [{"type":"solid","surfaceTag":"solid"}]
    },
    {
      "id": "player", "name": "Player", "type": "box",
      "transform": {"position":{"x":0,"y":1,"z":0},"rotation":{"x":0,"y":0,"z":0},"scale":{"x":1,"y":1,"z":1}},
      "size": {"x":1,"y":1,"z":1}, "material": {"color":"#5db8a8","opacity":1},
      "tags": ["player"],
      "behaviors": [{"type":"third-person-controller","speed":6,"jumpVelocity":10,"gravity":24,"controls":"both","groundTag":"solid","cameraDistance":10,"cameraHeight":6}]
    },
    {
      "id": "gem1", "name": "Gem", "type": "sphere",
      "transform": {"position":{"x":8,"y":1,"z":-8},"rotation":{"x":0,"y":0,"z":0},"scale":{"x":1,"y":1,"z":1}},
      "radius": 0.5, "material": {"color":"#a78bfa","opacity":1},
      "tags": ["pickup"],
      "behaviors": [{"type":"pickup-on-contact","collectorTag":"player","scoreDelta":20,"healthDelta":0,"destroyOnPickup":true}]
    },
    {
      "id": "gem2", "name": "Gem", "type": "sphere",
      "transform": {"position":{"x":-7,"y":1,"z":7},"rotation":{"x":0,"y":0,"z":0},"scale":{"x":1,"y":1,"z":1}},
      "radius": 0.5, "material": {"color":"#a78bfa","opacity":1},
      "tags": ["pickup"],
      "behaviors": [{"type":"pickup-on-contact","collectorTag":"player","scoreDelta":20,"healthDelta":0,"destroyOnPickup":true}]
    },
    {
      "id": "gem3", "name": "Gem", "type": "sphere",
      "transform": {"position":{"x":10,"y":1,"z":6},"rotation":{"x":0,"y":0,"z":0},"scale":{"x":1,"y":1,"z":1}},
      "radius": 0.5, "material": {"color":"#a78bfa","opacity":1},
      "tags": ["pickup"],
      "behaviors": [{"type":"pickup-on-contact","collectorTag":"player","scoreDelta":20,"healthDelta":0,"destroyOnPickup":true}]
    },
    {
      "id": "enemy", "name": "Enemy", "type": "box",
      "transform": {"position":{"x":-10,"y":1,"z":0},"rotation":{"x":0,"y":0,"z":0},"scale":{"x":1,"y":1,"z":1}},
      "size": {"x":1.2,"y":1.2,"z":1.2}, "material": {"color":"#ef4444","opacity":1},
      "tags": ["enemy"],
      "behaviors": [
        {"type":"auto-move","velocityX":0,"velocityY":0,"velocityZ":3,"reverseOnHit":true},
        {"type":"damage-on-contact","victimTag":"player","damage":1,"destroySelfOnHit":false,"cooldownMs":900}
      ]
    }
  ],
  "gameState": {"initialScore":0,"initialHealth":3,"winScore":60,"winSurviveSec":0,"cameraFollowId":"player"}
}

When the user's prompt closely matches one of these archetypes, follow the
shape of the matching example. For novel ideas, mix the components — but
ALWAYS produce a player + at least one solid + a win condition. For 3D
("three") games, ALWAYS use third-person-controller, a solid floor, and
gameState.cameraFollowId — never emit a static 3D scene.`;

// ---------------------------------------------------------------------------
// User prompt builder
// ---------------------------------------------------------------------------

export function buildUserPrompt(
  prompt: string,
  context: AiContext,
  mode: AiMode,
  hasRefImage = false,
): string {
  if (mode === 'modify') {
    if (!context.selectedElement) {
      return `User request: ${prompt}\n\nNo element is currently selected. Please ask the user to select an element first.`;
    }
    const lines = [
      `Current element JSON:`,
      '```json',
      JSON.stringify(context.selectedElement, null, 2),
      '```',
      '',
      `User request: ${prompt}`,
    ];
    if (hasRefImage) {
      lines.push(
        '',
        `The user attached a reference image (visible in this message). Use it as the visual reference for the modification — match its colors, shapes, mood, and character/object style. If the image shows a character/sprite, treat it as what the element should look like.`,
      );
    }
    return lines.join('\n');
  }

  // Generate mode
  const parts = [`User request: ${prompt}`];
  if (context.elementCount > 0) {
    parts.push(
      `\nCurrent scene has ${context.elementCount} element(s) of types: ${context.elementTypes.join(', ')}.`,
      `Add new elements that complement the existing scene.`,
    );
  }
  if (hasRefImage) {
    parts.push(
      '',
      `IMPORTANT — REFERENCE IMAGE ATTACHED: The user attached a reference image (visible in this message). Treat it as authoritative for the visual identity of the game:`,
      `• If it shows a character/creature/mascot, that IS the player. Reflect its dominant color in the player element's material.color, and mention the character explicitly in the description (e.g. "You play as the squirrel from your reference image…"). When a sprite asset for the character is available later, the user will swap the placeholder for it; until then pick a material.color that visibly matches the image's main subject.`,
      `• If it shows a scene/environment, mirror its palette across the ground, platforms, sky/background tint, and pickup colors so the generated game feels like that world.`,
      `• Always acknowledge the image in the description field — never produce a description that ignores it.`,
    );
  }
  return parts.join('\n');
}
