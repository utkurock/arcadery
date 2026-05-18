import type { Metadata } from 'next';
import { DroneArenaClient } from './drone-arena-client';

export const metadata: Metadata = {
  title: 'Drone Arena · arcadery',
  description:
    'Third-person drone combat — dash, lock-on missiles, survive escalating mob waves in a PBR-lit holographic colosseum.',
  openGraph: {
    title: 'Drone Arena',
    description: 'Official Arcadery template — drone wave combat.',
    type: 'website',
  },
};

export default function DroneArenaPage() {
  return <DroneArenaClient />;
}
