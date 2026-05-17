// Core
export { GameRuntime, DEFAULT_CONFIG } from './core/game-runtime';
export type { GameConfig, GameState, GameEvent } from './core/game-runtime';
export { InputManager } from './core/input-manager';
export type { InputState } from './core/input-manager';
export { loadTexture, loadGLTF, loadOBJ, loadAudio, preloadAssets, clearCache } from './core/asset-loader';

// React Three Fiber Components
export { GameCanvas } from './components/game-canvas';
export { SpriteObject } from './components/sprite-object';
export { ModelObject, preloadModel } from './components/model-object';
export { PlatformObject } from './components/platform-object';

// Phaser 2D — only import via dynamic(() => import('@arcadery/engine/phaser')) to avoid SSR.
// The component itself is exposed via the package.json "./phaser" subpath, not re-exported here.

// Behavior runtime (play-mode physics + input + game state)
export { BehaviorRuntime } from './runtime/behavior-runtime';
export type { RuntimeState, GameStatus } from './runtime/behavior-runtime';
