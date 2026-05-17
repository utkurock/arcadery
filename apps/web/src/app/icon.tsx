import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

// "og" lockup matches the brand mark used across the site (memory: "Logo/favicon = og").
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #8b7ec8 0%, #6b5fa8 100%)',
          color: '#ffffff',
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: -1,
          fontFamily: 'serif',
          borderRadius: 8,
        }}
      >
        og
      </div>
    ),
    size,
  );
}
