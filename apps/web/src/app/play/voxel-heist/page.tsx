import type { Metadata } from 'next';
import { VoxelHeistClient } from './voxel-heist-client';

export const metadata: Metadata = {
  title: 'Voxel Heist · arcadery',
  description:
    'Speedrun voxel maze stealth — slip through swinging laser grids, crack glowing vaults, exfil before the alarm runs your clock down.',
  openGraph: {
    title: 'Voxel Heist',
    description: 'Official Arcadery template — voxel speedrun heist.',
    type: 'website',
  },
};

export default function VoxelHeistPage() {
  return <VoxelHeistClient />;
}
