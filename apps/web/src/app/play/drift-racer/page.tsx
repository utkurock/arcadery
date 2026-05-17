import type { Metadata } from 'next';
import { DriftRacerClient } from './drift-racer-client';

// The drift racer is a hand-coded Three.js game that lives outside the
// data-driven template/behavior runtime. It surfaces in /explore and
// /templates via a hardcoded "builtin" card pointing here.
export const metadata: Metadata = {
  title: 'Drift Racer · arcadery',
  description: 'High-speed drift racing against an AI rival across a closed-loop circuit. Three laps to win.',
  openGraph: {
    title: 'Drift Racer',
    description: 'Official Arcadery template — drift racing vs AI.',
    type: 'website',
  },
};

export default function DriftRacerPage() {
  return <DriftRacerClient />;
}
