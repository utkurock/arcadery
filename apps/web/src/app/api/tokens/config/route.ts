import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * GET /api/tokens/config
 *
 * Tells the client whether the platform DBC config has been deployed.
 * Owners shouldn't see a "Launch token" CTA that's going to crash on submit
 * if the env var is empty — they get a disabled state instead.
 */
export function GET() {
  const configured = Boolean(process.env.DBC_CONFIG_ADDRESS?.trim());
  return NextResponse.json({ configured });
}
