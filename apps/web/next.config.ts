import type { NextConfig } from 'next';
import { createRequire } from 'module';
import { dirname, basename, join } from 'path';
import { existsSync } from 'fs';

const nodeRequire = createRequire(import.meta.url);

function pkgDir(name: string): string | null {
  // Preferred: resolve `<name>/package.json` and take its dirname.
  try {
    return dirname(nodeRequire.resolve(`${name}/package.json`));
  } catch {}
  // Fallback for packages that block `./package.json` via the `exports` field
  // (notably `three`). Resolve the entry, then walk up the path until we hit
  // a directory whose basename matches the package's last segment and which
  // contains a package.json file — that's the package root.
  try {
    const seg = name.split('/').pop()!;
    let dir = dirname(nodeRequire.resolve(name));
    while (dir.length > 1) {
      if (basename(dir) === seg && existsSync(join(dir, 'package.json'))) {
        return dir;
      }
      dir = dirname(dir);
    }
  } catch {}
  return null;
}

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  transpilePackages: ['@arcadery/shared', '@arcadery/engine', '@arcadery/editor'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      '@react-three/drei',
      '@react-three/fiber',
      'three',
      'zod',
      'zustand',
      '@solana/wallet-adapter-react',
      '@solana/wallet-adapter-base',
    ],
  },
  webpack: (config) => {
    // Force singleton resolution of three.js + R3F across the monorepo. pnpm's
    // virtual store materializes a separate copy of each package per unique
    // peer-dep combination, so @arcadery/editor (calling useThree) and
    // @arcadery/engine (rendering <Canvas>) ended up importing different
    // @react-three/fiber instances. Two instances = two React contexts = R3F
    // throws "Hooks can only be used within the Canvas component!". Aliasing
    // here collapses them to a single resolved path so the context provided
    // inside <Canvas> is the one useThree reads from.
    const singletons = ['@react-three/fiber', '@react-three/drei', 'three'];
    config.resolve = config.resolve || {};
    config.resolve.alias = (config.resolve.alias as Record<string, string>) || {};
    for (const name of singletons) {
      const dir = pkgDir(name);
      // Alias to the package DIRECTORY (not the resolved entry file) so subpath
      // imports like `three/examples/jsm/loaders/GLTFLoader.js` still work and
      // also route through this single instance.
      if (dir) (config.resolve.alias as Record<string, string>)[name] = dir;
    }
    return config;
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  },
  productionBrowserSourceMaps: false,
  async headers() {
    return [
      {
        source: '/play/:slug/embed',
        headers: [
          { key: 'Content-Security-Policy', value: 'frame-ancestors *' },
        ],
      },
    ];
  },
};

export default nextConfig;
