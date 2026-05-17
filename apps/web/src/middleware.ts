import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

/**
 * Touches Supabase session on every request so the auth cookies stay fresh
 * for SSR pages and API route handlers. No redirects — login is a modal.
 */
export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Skip Next internals and static assets — auth cookies don't matter for them.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
