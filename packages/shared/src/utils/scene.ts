import type { GameScene } from '../schemas/scene';
import { DEFAULT_ECONOMY } from '../schemas/economy';
import { generateId } from './id';

export function createEmptyScene(name?: string): GameScene {
  return {
    schemaVersion: 1,
    id: generateId(),
    name: name ?? 'Untitled Scene',
    elements: {},
    layers: [
      {
        id: generateId(),
        name: 'Default Layer',
        visible: true,
        locked: false,
        zIndex: 0,
      },
    ],
    settings: {
      backgroundColor: '#17181e',
      ambientLightIntensity: 0.4,
      gravity: { x: 0, y: -9.81, z: 0 },
      cameraType: '3d',
      renderEngine: 'three',
    },
    economy: DEFAULT_ECONOMY,
  };
}
