import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

// Module-level singleton, pinned to globalThis so HMR (Fast Refresh) re-eval
// doesn't drop the cached instance. Without the globalThis pin, every Fast
// Refresh re-evaluated the module, reset `cached`, and produced a fresh client
// with a fresh internal auth state machine — which forced Next.js to fall
// back to a full-page reload ("Fast Refresh had to perform a full reload")
// and broke React Three Fiber's Canvas reconciler context mid-edit, surfacing
// as "Hooks can only be used within the Canvas component!" until the user
// hit F5 to recover.
const CLIENT_KEY = '__arcadery_supabase_browser_client__' as const;
type ClientCache = { current: SupabaseClient<Database> | null };

function getCache(): ClientCache {
  const g = globalThis as typeof globalThis & { [CLIENT_KEY]?: ClientCache };
  if (!g[CLIENT_KEY]) g[CLIENT_KEY] = { current: null };
  return g[CLIENT_KEY]!;
}

export function createClient(): SupabaseClient<Database> {
  const cache = getCache();
  if (cache.current) return cache.current;
  cache.current = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  return cache.current;
}
