import type { Metadata } from 'next';
import { SkyGliderClient } from './sky-glider-client';

export const metadata: Metadata = {
  title: 'Sky Glider · arcadery',
  description:
    'Neon canyon wingsuit — dive through procedural ravines, slipstream scoring rings, chain combos at terminal velocity.',
  openGraph: {
    title: 'Sky Glider',
    description: 'Official Arcadery template — neon canyon wingsuit.',
    type: 'website',
  },
};

export default function SkyGliderPage() {
  return <SkyGliderClient />;
}
