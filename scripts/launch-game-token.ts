/**
 * Launch ONE Meteora DBC pool for a game on the configured Solana cluster
 * (devnet by default) and persist the result to
 * apps/web/src/lib/tokens/devnet-tokens.json.
 *
 * Why a standalone script instead of the existing /api/tokens/launch route?
 *   - The web route requires user wallet signing + ownership of a
 *     published_games row. For platform-curated games (Drift Racer, custom
 *     built-ins) we want to mint with the admin keypair directly.
 *
 * Required env:
 *   ADMIN_KEYPAIR_PATH  — path to admin Solana keypair JSON (e.g.
 *                         ~/.config/solana/id.json)
 *   DBC_CONFIG_ADDRESS  — pubkey of the deployed platform DBC config
 *                         (run scripts/deploy-dbc-config.ts first)
 *   RPC_URL             — defaults to devnet
 *
 * Usage:
 *   pnpm tsx scripts/launch-game-token.ts \
 *     --name "Drift Racer" --symbol DRIFT --slug drift-racer \
 *     --play /play/drift-racer --category racing \
 *     --description "Hand-coded Three.js drift racer"
 *
 * Reruns are blocked: if a row with the same slug already exists in
 * devnet-tokens.json the script exits without re-minting. Delete the row by
 * hand to retry.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  DynamicBondingCurveClient,
  deriveDbcPoolAddress,
} from '@meteora-ag/dynamic-bonding-curve-sdk';

const NATIVE_SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

const RPC_URL = process.env.RPC_URL ?? 'https://api.devnet.solana.com';
const ADMIN_KEYPAIR_PATH = process.env.ADMIN_KEYPAIR_PATH;
const DBC_CONFIG_ADDRESS = process.env.DBC_CONFIG_ADDRESS;

if (!ADMIN_KEYPAIR_PATH) {
  console.error('ADMIN_KEYPAIR_PATH not set — point it at a Solana keypair JSON file.');
  process.exit(1);
}
if (!DBC_CONFIG_ADDRESS) {
  console.error('DBC_CONFIG_ADDRESS not set — run scripts/deploy-dbc-config.ts first.');
  process.exit(1);
}

// ─── CLI args ────────────────────────────────────────────────────────────
type Args = {
  name?: string;
  symbol?: string;
  slug?: string;
  play?: string;
  category?: string;
  description?: string;
  imageUrl?: string;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2) as keyof Args;
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) {
      args[key] = '' as never;
    } else {
      args[key] = value as never;
      i++;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const TICKER_RE = /^[A-Z0-9]{2,10}$/;

if (!args.name || !args.symbol || !args.slug || !args.play || !args.category) {
  console.error(
    'Missing required arg. Need: --name, --symbol, --slug, --play, --category',
  );
  console.error(
    'Example: pnpm tsx scripts/launch-game-token.ts --name "Drift Racer" --symbol DRIFT --slug drift-racer --play /play/drift-racer --category racing',
  );
  process.exit(1);
}
if (!TICKER_RE.test(args.symbol)) {
  console.error(`Invalid symbol "${args.symbol}". Must match ${TICKER_RE}.`);
  process.exit(1);
}
if (args.name.length > 32) {
  console.error('Token name max 32 chars (Meteora SPL limit).');
  process.exit(1);
}

// ─── JSON registry ───────────────────────────────────────────────────────
type TokenRow = {
  slug: string;
  name: string;
  symbol: string;
  playHref: string;
  category: string;
  description: string;
  imageUrl?: string;
  mint: string;
  poolAddress: string;
  configAddress: string;
  cluster: string;
  deployTx: string;
  launchedAt: string;
};

const REGISTRY_PATH = join(
  process.cwd(),
  'apps/web/src/lib/tokens/devnet-tokens.json',
);

function loadRegistry(): TokenRow[] {
  if (!existsSync(REGISTRY_PATH)) return [];
  try {
    return JSON.parse(readFileSync(REGISTRY_PATH, 'utf-8')) as TokenRow[];
  } catch {
    return [];
  }
}

const registry = loadRegistry();
if (registry.some((r) => r.slug === args.slug)) {
  console.error(`Slug "${args.slug}" already in registry. Remove it from`);
  console.error(`  ${REGISTRY_PATH}`);
  console.error('and retry to relaunch.');
  process.exit(1);
}

// ─── Solana setup ────────────────────────────────────────────────────────
const adminSecret = JSON.parse(readFileSync(ADMIN_KEYPAIR_PATH, 'utf-8'));
const admin = Keypair.fromSecretKey(Uint8Array.from(adminSecret));
const mintKeypair = Keypair.generate();

const cluster = RPC_URL.includes('devnet')
  ? 'devnet'
  : RPC_URL.includes('testnet')
    ? 'testnet'
    : 'mainnet-beta';

async function main() {
  console.log('\n  Launch game token\n');
  console.log(`  Cluster: ${cluster}`);
  console.log(`  RPC:     ${RPC_URL}`);
  console.log(`  Admin:   ${admin.publicKey.toBase58()}`);
  console.log(`  Mint:    ${mintKeypair.publicKey.toBase58()}`);
  console.log(`  Config:  ${DBC_CONFIG_ADDRESS}`);
  console.log(`  Name:    ${args.name}  (${args.symbol})`);
  console.log(`  Slug:    ${args.slug}`);
  console.log(`  Play:    ${args.play}\n`);

  const connection = new Connection(RPC_URL, 'confirmed');
  const balance = await connection.getBalance(admin.publicKey);
  console.log(`  Admin balance: ${(balance / 1e9).toFixed(4)} SOL`);
  // 1 SOL goes to the pool creation fee in our deployed config + tx fees.
  if (balance < 1.2 * 1e9) {
    console.error('  Need ≥ 1.2 SOL on admin to cover pool creation + fees.');
    process.exit(1);
  }

  const client = new DynamicBondingCurveClient(connection, 'confirmed');
  const uri =
    args.imageUrl?.trim() ||
    `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://arcadery.xyz'}${args.play}`;

  let tx;
  try {
    tx = await client.pool.createPool({
      baseMint: mintKeypair.publicKey,
      config: new PublicKey(DBC_CONFIG_ADDRESS!),
      name: args.name!,
      symbol: args.symbol!,
      uri,
      payer: admin.publicKey,
      poolCreator: admin.publicKey,
    });
  } catch (err) {
    console.error('  ✗ createPool tx build failed:', err);
    process.exit(1);
  }

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = admin.publicKey;

  console.log('  Sending transaction…');
  const sig = await sendAndConfirmTransaction(
    connection,
    tx,
    [admin, mintKeypair],
    { commitment: 'confirmed' },
  );

  // Pool address is derived from quoteMint + baseMint + config.
  const poolAddress = deriveDbcPoolAddress(
    NATIVE_SOL_MINT,
    mintKeypair.publicKey,
    new PublicKey(DBC_CONFIG_ADDRESS!),
  ).toBase58();

  console.log(`\n  ✓ Token launched.`);
  console.log(`    Signature:    ${sig}`);
  console.log(`    Mint:         ${mintKeypair.publicKey.toBase58()}`);
  console.log(`    Pool:         ${poolAddress}\n`);

  const row: TokenRow = {
    slug: args.slug!,
    name: args.name!,
    symbol: args.symbol!,
    playHref: args.play!,
    category: args.category!,
    description: args.description ?? '',
    imageUrl: args.imageUrl,
    mint: mintKeypair.publicKey.toBase58(),
    poolAddress,
    configAddress: DBC_CONFIG_ADDRESS!,
    cluster,
    deployTx: sig,
    launchedAt: new Date().toISOString(),
  };

  registry.push(row);
  writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + '\n');
  console.log(`  Registry updated → ${REGISTRY_PATH}\n`);
}

main().catch((err) => {
  console.error('\n  ✗ Launch failed:', err);
  process.exit(1);
});
