import { ImageResponse } from 'next/og';
import { createClient } from '@/lib/supabase/server';

export const alt = 'Arcadery game';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

type GameRow = {
  name: string;
  creator_name: string;
  is_tokenized: boolean | null;
  token_symbol: string | null;
};

export default async function OgImage({ params }: { params: { slug: string } }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('published_games')
    .select('name, creator_name, is_tokenized, token_symbol')
    .eq('slug', params.slug)
    .maybeSingle<GameRow>();

  const name = data?.name ?? 'Arcadery';
  const creator = data?.creator_name ?? 'Anonymous';
  const symbol = data?.is_tokenized && data?.token_symbol ? `$${data.token_symbol}` : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          padding: '64px 80px',
          background: 'linear-gradient(135deg, #0a0a0f 0%, #1a1530 60%, #2a1f4a 100%)',
          color: '#ffffff',
        }}
      >
        {/* brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: 'linear-gradient(135deg, #8b7ec8 0%, #6b5fa8 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 32,
              fontWeight: 700,
              fontFamily: 'serif',
              letterSpacing: -1,
            }}
          >
            og
          </div>
          <span
            style={{
              fontSize: 24,
              fontFamily: 'serif',
              letterSpacing: -0.5,
              color: 'rgba(255,255,255,0.85)',
            }}
          >
            arcadery
          </span>
        </div>

        {/* spacer */}
        <div style={{ flex: 1 }} />

        {/* title */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <p
            style={{
              fontSize: 22,
              color: 'rgba(255,255,255,0.55)',
              margin: 0,
              marginBottom: 12,
              textTransform: 'uppercase',
              letterSpacing: 4,
            }}
          >
            Play now
          </p>
          <h1
            style={{
              fontSize: 88,
              fontWeight: 800,
              lineHeight: 1.05,
              margin: 0,
              maxWidth: 1000,
              letterSpacing: -2,
            }}
          >
            {name}
          </h1>
          <p
            style={{
              fontSize: 30,
              color: 'rgba(255,255,255,0.65)',
              marginTop: 28,
              marginBottom: 0,
            }}
          >
            by {creator}
            {symbol && (
              <span
                style={{
                  marginLeft: 16,
                  padding: '4px 14px',
                  borderRadius: 999,
                  background: 'rgba(201,169,110,0.15)',
                  color: '#e6cd97',
                  fontFamily: 'monospace',
                  fontSize: 24,
                  letterSpacing: 1,
                }}
              >
                {symbol}
              </span>
            )}
          </p>
        </div>
      </div>
    ),
    size,
  );
}
