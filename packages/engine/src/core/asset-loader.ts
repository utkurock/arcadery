import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';

type LoadedAsset =
  | { type: 'texture'; data: THREE.Texture }
  | { type: 'model'; data: GLTF }
  | { type: 'audio'; data: AudioBuffer }
  | { type: 'obj'; data: THREE.Group };

const cache = new Map<string, LoadedAsset>();
const textureLoader = new THREE.TextureLoader();
const gltfLoader = new GLTFLoader();
const objLoader = new OBJLoader();

export async function loadTexture(url: string): Promise<THREE.Texture> {
  const cached = cache.get(url);
  if (cached?.type === 'texture') return cached.data;

  return new Promise((resolve, reject) => {
    textureLoader.load(
      url,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        cache.set(url, { type: 'texture', data: texture });
        resolve(texture);
      },
      undefined,
      reject
    );
  });
}

export async function loadGLTF(url: string): Promise<GLTF> {
  const cached = cache.get(url);
  if (cached?.type === 'model') return cached.data;

  return new Promise((resolve, reject) => {
    gltfLoader.load(
      url,
      (gltf) => {
        cache.set(url, { type: 'model', data: gltf });
        resolve(gltf);
      },
      undefined,
      reject
    );
  });
}

export async function loadOBJ(url: string): Promise<THREE.Group> {
  const cached = cache.get(url);
  if (cached?.type === 'obj') return cached.data;

  return new Promise((resolve, reject) => {
    objLoader.load(
      url,
      (obj) => {
        cache.set(url, { type: 'obj', data: obj });
        resolve(obj);
      },
      undefined,
      reject
    );
  });
}

export async function loadAudio(url: string, ctx: AudioContext): Promise<AudioBuffer> {
  const cached = cache.get(url);
  if (cached?.type === 'audio') return cached.data;

  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
  cache.set(url, { type: 'audio', data: audioBuffer });
  return audioBuffer;
}

export function preloadAssets(urls: string[]): Promise<void[]> {
  return Promise.all(
    urls.map((url) => {
      const ext = url.split('.').pop()?.toLowerCase();
      if (ext === 'glb' || ext === 'gltf') return loadGLTF(url).then(() => {});
      if (ext === 'obj') return loadOBJ(url).then(() => {});
      if (ext === 'png' || ext === 'jpg' || ext === 'webp') return loadTexture(url).then(() => {});
      return Promise.resolve();
    })
  );
}

export function clearCache() {
  cache.forEach((asset) => {
    if (asset.type === 'texture') asset.data.dispose();
  });
  cache.clear();
}

