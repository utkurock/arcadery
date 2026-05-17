import Image from 'next/image';
import { ComponentPropsWithoutRef } from 'react';

const SIZES = {
  xs: { box: 'h-6 w-6', text: 'text-[10px]', px: 24 },
  sm: { box: 'h-8 w-8', text: 'text-xs', px: 32 },
  md: { box: 'h-12 w-12', text: 'text-base', px: 48 },
  lg: { box: 'h-16 w-16', text: 'text-2xl', px: 64 },
  xl: { box: 'h-20 w-20', text: 'text-3xl', px: 80 },
} as const;

export type AvatarSize = keyof typeof SIZES;

export interface AvatarProps extends ComponentPropsWithoutRef<'div'> {
  src?: string | null;
  /** Single character / short label shown when there's no image. */
  fallback: string;
  size?: AvatarSize;
  /** Accessible label for the image. Default ''  (decorative). */
  alt?: string;
}

/**
 * One avatar component for the whole app. Renders the image when provided,
 * otherwise the fallback initial inside the brand-tinted circle.
 *
 * Sizes match the existing usage:
 *   xs (24)  — navbar
 *   sm (32)  — sidebar
 *   md (48)  — list rows
 *   lg (64)  — settings
 *   xl (80)  — profile hero
 *
 * Uses next/image when src is set so Supabase-hosted avatars get auto AVIF/
 * WebP, lazy-load, and responsive sizing.
 */
export function Avatar({
  src,
  fallback,
  size = 'sm',
  alt = '',
  className = '',
  ...rest
}: AvatarProps) {
  const sz = SIZES[size];
  const initial = fallback?.[0]?.toUpperCase() ?? '?';

  return (
    <div
      {...rest}
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#8b7ec8]/20 font-bold text-[#8b7ec8] ${sz.box} ${sz.text} ${className}`}
    >
      {src ? (
        <Image
          src={src}
          alt={alt}
          width={sz.px}
          height={sz.px}
          className="h-full w-full object-cover"
          unoptimized={src.startsWith('data:') || src.startsWith('blob:')}
        />
      ) : (
        initial
      )}
    </div>
  );
}
