import { InputManager } from './input-manager';

export interface GameConfig {
  width: number;
  height: number;
  gravity: number;
  friction: number;
  cameraType: '2d' | '3d';
  backgroundColor: string;
}

export const DEFAULT_CONFIG: GameConfig = {
  width: 1920,
  height: 1080,
  gravity: 9.8,
  friction: 0.5,
  cameraType: '2d',
  backgroundColor: '#17181e',
};

export type GameState = 'idle' | 'loading' | 'running' | 'paused' | 'gameover';

export interface GameEvent {
  type: string;
  data?: any;
}

type EventHandler = (event: GameEvent) => void;

export class GameRuntime {
  config: GameConfig;
  state: GameState = 'idle';
  input: InputManager;
  score = 0;
  time = 0;
  deltaTime = 0;

  private lastTimestamp = 0;
  private animFrameId = 0;
  private updateCallbacks: ((dt: number) => void)[] = [];
  private eventHandlers = new Map<string, EventHandler[]>();

  constructor(config: Partial<GameConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.input = new InputManager();
  }

  onUpdate(callback: (dt: number) => void) {
    this.updateCallbacks.push(callback);
    return () => {
      this.updateCallbacks = this.updateCallbacks.filter((cb) => cb !== callback);
    };
  }

  on(eventType: string, handler: EventHandler) {
    const handlers = this.eventHandlers.get(eventType) || [];
    handlers.push(handler);
    this.eventHandlers.set(eventType, handlers);
    return () => {
      const h = this.eventHandlers.get(eventType) || [];
      this.eventHandlers.set(eventType, h.filter((fn) => fn !== handler));
    };
  }

  emit(event: GameEvent) {
    const handlers = this.eventHandlers.get(event.type) || [];
    handlers.forEach((fn) => fn(event));
  }

  start() {
    if (this.state === 'running') return;
    this.state = 'running';
    this.lastTimestamp = performance.now();
    this.tick();
    this.emit({ type: 'game:start' });
  }

  pause() {
    this.state = 'paused';
    cancelAnimationFrame(this.animFrameId);
    this.emit({ type: 'game:pause' });
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'running';
    this.lastTimestamp = performance.now();
    this.tick();
    this.emit({ type: 'game:resume' });
  }

  stop() {
    this.state = 'idle';
    cancelAnimationFrame(this.animFrameId);
    this.time = 0;
    this.score = 0;
    this.emit({ type: 'game:stop' });
  }

  gameOver() {
    this.state = 'gameover';
    cancelAnimationFrame(this.animFrameId);
    this.emit({ type: 'game:over', data: { score: this.score, time: this.time } });
  }

  addScore(points: number) {
    this.score += points;
    this.emit({ type: 'score:change', data: { score: this.score, added: points } });
  }

  destroy() {
    this.stop();
    this.input.destroy();
    this.updateCallbacks = [];
    this.eventHandlers.clear();
  }

  private tick = () => {
    if (this.state !== 'running') return;

    const now = performance.now();
    this.deltaTime = Math.min((now - this.lastTimestamp) / 1000, 0.1); // cap at 100ms
    this.lastTimestamp = now;
    this.time += this.deltaTime;

    for (const cb of this.updateCallbacks) {
      cb(this.deltaTime);
    }

    this.animFrameId = requestAnimationFrame(this.tick);
  };
}
