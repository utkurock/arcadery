<div align="center">

# Arcadery

**Prompt → Game → Token → Earn.**
The no-code Web3 game platform on Solana.

</div>

Arcadery is a "Canva for Games" creator platform. Describe a game in plain English and Gemini drafts a playable Three.js scene. Click any element to edit, AI-modify, or drag to position — no mode switching. Publish to a sharable URL, and optionally mint a tradable SPL token for your game through Meteora's Dynamic Bonding Curve.

It also ships with five built-in arcade games — Neon Asteroids, Cube Runner, Brick Smash, Drift Racer, and Fly Birds — with on-chain entry fees, leaderboards, and token rewards.

## Highlights

- **Single-screen editor.** The preview *is* the canvas. Click to select, right-click to AI-modify, drag to position.
- **AI scene generation** with Google Gemini 2.5 Flash and strict JSON-schema output.
- **AI image generation** through fal.ai serving GPT Image 2 — single sprites, 6-pose sprite sheets, edit-in-place flows.
- **Solana-native auth.** Sign-In-With-Solana (SIWS) over `@solana/wallet-adapter` with ed25519 verification (`tweetnacl`). No Privy, no Web2 fallback.
- **Token launches.** Each published game can mint its own SPL token via Meteora DBC — bonding-curve trading with automatic DAMM V2 graduation.
- **USDC credit system.** Pricing decoupled from SOL volatility. Two tiers ($20 Starter / $75 Pro) plus a welcome bonus.
- **Five built-in arcade games** with SOL entry fees, Supabase leaderboards, and one with on-chain SPL token payouts.
- **Supabase-backed.** Auth, Postgres with RLS, Storage, Realtime. Migrations versioned in `supabase/migrations/`.

## Tech stack

| Layer    | Stack                                                                                              |
|----------|----------------------------------------------------------------------------------------------------|
| Frontend | Next.js 15 (App Router) · React 19 · Tailwind v4 · Zustand                                         |
| Engine   | Three.js · React Three Fiber · Drei                                                                |
| Editor   | dnd-kit · Immer · zundo (undo/redo)                                                                |
| Auth/DB  | Supabase (Postgres + Auth + Storage)                                                               |
| Web3     | `@solana/web3.js` · `@solana/wallet-adapter` · `@meteora-ag/dynamic-bonding-curve-sdk` · SPL Token |
| AI       | Google Gemini 2.5 Flash (scenes) · fal.ai GPT Image 2 (images) · Meshy (3D, optional)              |
| Tooling  | Turborepo · pnpm workspaces · Vitest · TypeScript 5                                                |

## Project structure

```
arcadery/
├── apps/
│   └── web/                # Next.js app — UI, API routes, auth, payments
├── packages/
│   ├── editor/             # Editor store, panels, scene renderer, AI chat
│   ├── engine/             # Three.js + R3F runtime: GameCanvas, loaders
│   └── shared/             # Zod schemas, types, constants
├── supabase/
│   └── migrations/         # Versioned SQL — single source of truth
└── scripts/
    ├── deploy-dbc-config.ts  # One-time Meteora DBC platform config deploy
    └── seed-templates.ts     # Seed starter templates into Supabase
```

## Quickstart

### Prerequisites

- Node.js >= 20
- pnpm 9 — `corepack enable && corepack prepare pnpm@9.15.0 --activate`
- A [Supabase](https://supabase.com) project (free tier works)
- A Solana wallet (Phantom / Solflare) + RPC endpoint
- API keys: [Gemini](https://aistudio.google.com/) (free) and [fal.ai](https://fal.ai/) (paid)

### 1. Install

```bash
pnpm install
```

### 2. Set up Supabase

Apply the consolidated schema — one migration that creates every table, RLS policy, the `assets` storage bucket, and the atomic credit RPCs:

```bash
# Option A — Supabase dashboard
# Open SQL Editor, paste supabase/migrations/00001_init.sql, run.

# Option B — Supabase CLI
supabase db push
```

The migration is idempotent — safe to re-run. Then seed the starter templates:

```bash
pnpm seed:templates
```

### 3. Configure env

```bash
cp apps/web/.env.example apps/web/.env.local
```

Open `apps/web/.env.local` — it documents every required variable inline with links to where each key lives.

### 4. (Optional) Deploy Meteora DBC config

Token launches need a one-time platform config:

```bash
ADMIN_KEYPAIR_PATH=~/.config/solana/id.json \
RPC_URL=$NEXT_PUBLIC_SOLANA_RPC_URL \
pnpm deploy:dbc-config
```

Paste the printed config address into `DBC_CONFIG_ADDRESS`. Until this is filled, the "Launch token" CTA is disabled in the UI.

### 5. Run

```bash
pnpm dev
```

App: [http://localhost:3000](http://localhost:3000)

## Scripts

| Command                     | What it does                                          |
|-----------------------------|-------------------------------------------------------|
| `pnpm dev`                  | Start the Next.js dev server (port 3000)              |
| `pnpm build`                | Production build via Turborepo                        |
| `pnpm lint`                 | ESLint across all packages                            |
| `pnpm type-check`           | `tsc --noEmit` across all packages                    |
| `pnpm format`               | Prettier write across all source files                |
| `pnpm test`                 | Vitest run for `editor` and `shared`                  |
| `pnpm seed:templates`       | Insert seed templates into Supabase                   |
| `pnpm deploy:dbc-config`    | Deploy a Meteora DBC platform config (one-time)       |

## Architecture notes

- **No-Privy auth.** SIWS endpoints live in `apps/web/src/app/api/auth/solana/`. Connect wallet → fetch nonce (HttpOnly cookie, 5 min TTL) → sign message → server `nacl.sign.detached.verify` → Supabase admin upserts `{wallet}@wallet.arcadery.xyz` → magic-link OTP → client `verifyOtp` for the session. RLS policies key off `auth.uid()`.
- **Engine ↔ editor split.** `packages/engine` only exports `GameCanvas` and asset loaders. Element components, the `SceneRenderer`, and the registry live in `packages/editor` to break a circular dependency.
- **Credits as economic gate.** Paid AI calls (`/api/ai/generate`, `/api/ai/image`, `/api/ai/image/edit`) auth-gate + spend via the atomic `spend_credits` RPC, with auto-refund on provider failure. The anonymous `/api/ai/plan` homepage tease is free.
- **Token launches.** `POST /api/tokens/launch` builds an unsigned `client.pool.createPool` tx with a fresh mint keypair, partial-signs as mint authority, and returns base64 to the wallet. `POST /api/tokens/confirm` verifies the tx on-chain before spending credits and recording the launch. Trading and fee claims happen through Meteora's existing launchpad UI.
- **Built-in arcade games** share `/api/games/[game]/scores` and `/api/games/[game]/entry` (dynamic route handlers); each game has its own Postgres table and rate-limit bucket. Drift Racer and Fly Birds get their own static segments because they ship economic flows (mint authority / treasury payout) that the generic route doesn't cover.

## Contributing

Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

Security issues: do **not** open a public GitHub issue. Open a private security advisory on the repo instead.

## License

[MIT](LICENSE) © Arcadery contributors
