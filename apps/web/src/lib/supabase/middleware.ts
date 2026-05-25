import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./types";

// Touches the Supabase session on every request so SSR pages + API handlers
// see fresh auth cookies. Same shape works for the apex (NextResponse.next)
// and for game-subdomain rewrites (NextResponse.rewrite) — only the response
// constructor differs, which is why we factor it through `buildResponse`.

type BuildResponse = (req: NextRequest) => NextResponse;

export async function updateSession(request: NextRequest) {
  return touchSession(request, (req) => NextResponse.next({ request: req }));
}

/**
 * Same as updateSession, but the final response is a `.rewrite()` to
 * `rewriteUrl`. Used by the subdomain router to alias
 * `<slug>.arcadery.xyz/<path>` → `/play/<slug>/<path>` while keeping the auth
 * + anon cookies attached to the response.
 */
export async function updateSessionWithRewrite(
  request: NextRequest,
  rewriteUrl: URL,
) {
  return touchSession(request, (req) =>
    NextResponse.rewrite(rewriteUrl, { request: req }),
  );
}

async function touchSession(request: NextRequest, buildResponse: BuildResponse) {
  let response = buildResponse(request);

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = buildResponse(request);
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: Do NOT use getSession() on the server.
  // It reads from storage and is not guaranteed to be authentic.
  // Use getUser() instead which validates the token with the auth server.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Touch the user to refresh session cookies. No redirects — login is a modal.
  void user;

  // Stamp a long-lived anonymous-visitor ID so analytics can count unique
  // non-signed-in visitors. Random UUID, HttpOnly so client JS can't read it
  // (privacy + tamper resistance); the API ingestion route reads it from
  // request cookies. One year keeps "unique visitor" meaningful across casual
  // returns without being de-facto permanent.
  if (!request.cookies.get('arc_anon_id')) {
    const anonId = crypto.randomUUID();
    response.cookies.set('arc_anon_id', anonId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  return response;
}
