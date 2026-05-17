/**
 * Loose Supabase database type.
 *
 * The codebase does not currently run `supabase gen types`. Without a typed
 * `Database` generic, `@supabase/postgrest-js` v2 narrows every `insert(...)`,
 * `update(...)`, `rpc(...)` call signature and every `.select(...)` row to
 * `never`, which produces dozens of misleading compile errors but does not
 * actually improve safety because the generic was never wired up to begin
 * with.
 *
 * Re-declaring the schema as `any` here gives the typed-client a hook to
 * latch onto, lets per-call generics (`select<T>()`, `maybeSingle<T>()`,
 * `.returns<T>()`) define precision where it matters, and stops the
 * unhelpful `never` cascade. If we ever do generate types from the live
 * schema, swap this file for the generated `Database` export.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = any;
