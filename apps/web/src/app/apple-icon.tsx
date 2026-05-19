import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
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
          fontSize: 100,
          fontWeight: 800,
          letterSpacing: -3,
          fontFamily: 'serif',
        }}
      >
        AC
      </div>
    ),
    size,
  );
}
