import type { Metadata } from 'next';
import { NeonAsteroidsClient } from './neon-asteroids-client';

export const metadata: Metadata = {
  title: 'Neon Asteroids · arcadery',
  description: 'Vector-style top-down arcade shooter — destroy waves of splitting asteroids with combo multipliers.',
  openGraph: {
    title: 'Neon Asteroids',
    description: 'Official Arcadery template — vector arcade shooter.',
    type: 'website',
  },
};

export default function NeonAsteroidsPage() {
  return <NeonAsteroidsClient />;
}
