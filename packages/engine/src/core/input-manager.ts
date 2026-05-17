export interface InputState {
  keys: Set<string>;
  mouse: { x: number; y: number; buttons: number };
  touches: Map<number, { x: number; y: number }>;
}

export class InputManager {
  private state: InputState = {
    keys: new Set(),
    mouse: { x: 0, y: 0, buttons: 0 },
    touches: new Map(),
  };

  private listeners: (() => void)[] = [];

  attach(element: HTMLElement) {
    const onKeyDown = (e: KeyboardEvent) => this.state.keys.add(e.code);
    const onKeyUp = (e: KeyboardEvent) => this.state.keys.delete(e.code);
    const onMouseMove = (e: MouseEvent) => {
      const rect = element.getBoundingClientRect();
      this.state.mouse.x = (e.clientX - rect.left) / rect.width;
      this.state.mouse.y = (e.clientY - rect.top) / rect.height;
    };
    const onMouseDown = (e: MouseEvent) => { this.state.mouse.buttons = e.buttons; };
    const onMouseUp = () => { this.state.mouse.buttons = 0; };
    const onTouchStart = (e: TouchEvent) => {
      const rect = element.getBoundingClientRect();
      for (const t of Array.from(e.changedTouches)) {
        this.state.touches.set(t.identifier, {
          x: (t.clientX - rect.left) / rect.width,
          y: (t.clientY - rect.top) / rect.height,
        });
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      const rect = element.getBoundingClientRect();
      for (const t of Array.from(e.changedTouches)) {
        this.state.touches.set(t.identifier, {
          x: (t.clientX - rect.left) / rect.width,
          y: (t.clientY - rect.top) / rect.height,
        });
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        this.state.touches.delete(t.identifier);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    element.addEventListener('mousemove', onMouseMove);
    element.addEventListener('mousedown', onMouseDown);
    element.addEventListener('mouseup', onMouseUp);
    element.addEventListener('touchstart', onTouchStart, { passive: true });
    element.addEventListener('touchmove', onTouchMove, { passive: true });
    element.addEventListener('touchend', onTouchEnd);

    this.listeners.push(() => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      element.removeEventListener('mousemove', onMouseMove);
      element.removeEventListener('mousedown', onMouseDown);
      element.removeEventListener('mouseup', onMouseUp);
      element.removeEventListener('touchstart', onTouchStart);
      element.removeEventListener('touchmove', onTouchMove);
      element.removeEventListener('touchend', onTouchEnd);
    });
  }

  isKeyDown(code: string): boolean {
    return this.state.keys.has(code);
  }

  isAnyKeyDown(...codes: string[]): boolean {
    return codes.some((c) => this.state.keys.has(c));
  }

  getMousePosition(): { x: number; y: number } {
    return { ...this.state.mouse };
  }

  isMouseDown(button = 0): boolean {
    return (this.state.mouse.buttons & (1 << button)) !== 0;
  }

  getTouches(): Map<number, { x: number; y: number }> {
    return new Map(this.state.touches);
  }

  destroy() {
    this.listeners.forEach((fn) => fn());
    this.listeners = [];
    this.state.keys.clear();
    this.state.touches.clear();
  }
}
