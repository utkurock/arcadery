import type { Metadata } from 'next';
import { CubeRunnerClient } from './cube-runner-client';

export const metadata: Metadata = {
  title: 'Cube Runner · arcadery',
  description: 'Three.js endless 3D runner — swap lanes, jump and slide through synthwave obstacles. Distance + coin combos.',
  openGraph: {
    title: 'Cube Runner',
    description: 'Official Arcadery template — endless 3D runner.',
    type: 'website',
  },
};

export default function CubeRunnerPage() {
  return <CubeRunnerClient />;
}
