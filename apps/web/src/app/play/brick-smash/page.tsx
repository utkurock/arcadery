import type { Metadata } from 'next';
import { BrickSmashClient } from './brick-smash-client';

export const metadata: Metadata = {
  title: 'Brick Smash · arcadery',
  description: 'Modern 3D Breakout — paddle, ball physics, multi-row brick layers with power-ups and 6 levels.',
  openGraph: {
    title: 'Brick Smash',
    description: 'Official Arcadery template — 3D breakout.',
    type: 'website',
  },
};

export default function BrickSmashPage() {
  return <BrickSmashClient />;
}
