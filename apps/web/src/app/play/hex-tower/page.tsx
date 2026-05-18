import type { Metadata } from 'next';
import { HexTowerClient } from './hex-tower-client';

export const metadata: Metadata = {
  title: 'Hex Tower · arcadery',
  description:
    'Pastel-isometric vertical climber — chain-jump between crumbling hex platforms and climb until gravity wins.',
  openGraph: {
    title: 'Hex Tower',
    description: 'Official Arcadery template — vertical hex climber.',
    type: 'website',
  },
};

export default function HexTowerPage() {
  return <HexTowerClient />;
}
