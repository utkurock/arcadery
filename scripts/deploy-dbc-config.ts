/**
 * One-time deploy script for the Arcadery platform DBC config.
 *
 * Usage:
 *   1. Fund a Solana wallet with ~0.1 SOL on the target cluster (devnet or mainnet)
 *   2. Export its keypair JSON file as ADMIN_KEYPAIR_PATH (e.g. ~/.config/solana/id.json)
 *   3. Set RPC_URL (or rely on devnet default)
 *   4. Run: pnpm tsx scripts/deploy-dbc-config.ts
 *   5. Copy the printed config address into apps/web/.env.local as DBC_CONFIG_ADDRESS=...
 *
 * Config parameters baked in (matches Arcadery economics):
 *   - Base trading fee: 1%      (cliffFeeNumerator = 100_000_000 / 10^10)
 *   - Creator share: 70%        → 0.7% per swap to game creator (claimable)
 *   - Platform share: 30%       → 0.3% per swap to platform feeClaimer (admin-claimable)
 *   - Migration threshold: 80 SOL  (migrationQuoteThreshold)
 *   - Migration target: DAMM V2
 *   - Token decimals: 6
 *   - Curve: pump.fun style sqrt-price endpoints (verify on devnet before mainnet)
 *
 * IMPORTANT: deploy on devnet first and run end-to-end test launches before mainnet.
 */

import { readFileSync } from 'node:fs';
import { Connection, Keypair, PublicKey, sendAndConfirmTransaction } from '@solana/web3.js';
import BN from 'bn.js';
import {
  DynamicBondingCurveClient,
  ActivationType,
  CollectFeeMode,
  MigrationOption,
  MigrationFeeOption,
  TokenType,
  TokenUpdateAuthorityOption,
  BaseFeeMode,
} from '@meteora-ag/dynamic-bonding-curve-sdk';

const RPC_URL = process.env.RPC_URL ?? 'https://api.devnet.solana.com';
const ADMIN_KEYPAIR_PATH = process.env.ADMIN_KEYPAIR_PATH;
const NATIVE_SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

if (!ADMIN_KEYPAIR_PATH) {
  console.error('ADMIN_KEYPAIR_PATH not set. Point it at a Solana keypair JSON file.');
  process.exit(1);
}

const adminSecret = JSON.parse(readFileSync(ADMIN_KEYPAIR_PATH, 'utf-8'));
const admin = Keypair.fromSecretKey(Uint8Array.from(adminSecret));
const configKeypair = Keypair.generate();

async function main() {
  console.log('\n  Arcadery DBC Config deploy\n');
  console.log(`  RPC:    ${RPC_URL}`);
  console.log(`  Admin:  ${admin.publicKey.toBase58()}`);
  console.log(`  Config: ${configKeypair.publicKey.toBase58()}\n`);

  const connection = new Connection(RPC_URL, 'confirmed');
  const balance = await connection.getBalance(admin.publicKey);
  console.log(`  Admin balance: ${(balance / 1e9).toFixed(4)} SOL`);
  if (balance < 0.05 * 1e9) {
    console.error('  Admin wallet needs at least 0.05 SOL. Fund it and retry.');
    process.exit(1);
  }

  const client = new DynamicBondingCurveClient(connection, 'confirmed');

  const tx = await client.partner.createConfig({
    payer: admin.publicKey,
    config: configKeypair.publicKey,
    feeClaimer: admin.publicKey, // platform receives 30% trading fee
    leftoverReceiver: admin.publicKey,
    quoteMint: NATIVE_SOL_MINT,
    poolFees: {
      baseFee: {
        // 1% base fee. Numerator denominator is 10^10 (Meteora convention),
        // so 100_000_000 = 1%. Split 70/30 between creator and platform
        // happens via `creatorTradingFeePercentage` below.
        cliffFeeNumerator: new BN('100000000'), // 1% base fee numerator
        firstFactor: 0,
        secondFactor: new BN('0'),
        thirdFactor: new BN('0'),
        baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
      },
      dynamicFee: {
        binStep: 1,
        binStepU128: new BN('1844674407370955'),
        filterPeriod: 10,
        decayPeriod: 120,
        reductionFactor: 1000,
        variableFeeControl: 100000,
        maxVolatilityAccumulator: 100000,
      },
    },
    activationType: ActivationType.Slot,
    collectFeeMode: CollectFeeMode.QuoteToken,
    migrationOption: MigrationOption.MET_DAMM_V2,
    tokenType: TokenType.SPL,
    tokenDecimal: 6,
    migrationQuoteThreshold: new BN('80000000000'), // 80 SOL in lamports
    partnerLiquidityPercentage: 25,
    creatorLiquidityPercentage: 25,
    partnerPermanentLockedLiquidityPercentage: 25,
    creatorPermanentLockedLiquidityPercentage: 25,
    sqrtStartPrice: new BN('58333726687135158'),
    lockedVesting: {
      amountPerPeriod: new BN('0'),
      cliffDurationFromMigrationTime: new BN('0'),
      frequency: new BN('0'),
      numberOfPeriod: new BN('0'),
      cliffUnlockAmount: new BN('0'),
    },
    migrationFeeOption: MigrationFeeOption.FixedBps25,
    tokenSupply: null,
    creatorTradingFeePercentage: 70, // 70 / 30 split (creator / platform)
    tokenUpdateAuthority: TokenUpdateAuthorityOption.Immutable,
    migrationFee: {
      feePercentage: 25,
      creatorFeePercentage: 70,
    },
    migratedPoolFee: {
      dynamicFee: 0,
      poolFeeBps: 0,
      collectFeeMode: 0,
    },
    poolCreationFee: new BN('1000000000'), // 1 SOL? verify on devnet
    creatorLiquidityVestingInfo: {
      vestingPercentage: 0,
      bpsPerPeriod: 0,
      numberOfPeriods: 0,
      frequency: 0,
      cliffDurationFromMigrationTime: 0,
    },
    partnerLiquidityVestingInfo: {
      vestingPercentage: 0,
      bpsPerPeriod: 0,
      numberOfPeriods: 0,
      frequency: 0,
      cliffDurationFromMigrationTime: 0,
    },
    migratedPoolBaseFeeMode: 0,
    migratedPoolMarketCapFeeSchedulerParams: {
      numberOfPeriod: 0,
      sqrtPriceStepBps: 0,
      schedulerExpirationDuration: 0,
      reductionFactor: new BN('0'),
    },
    padding: [],
    curve: [
      {
        sqrtPrice: new BN('233334906748540631'),
        liquidity: new BN('622226417996106429201027821619672729'),
      },
      {
        sqrtPrice: new BN('79226673521066979257578248091'),
        liquidity: new BN('1'),
      },
    ],
    enableFirstSwapWithMinFee: false,
  });

  console.log('  Sending transaction…');
  const sig = await sendAndConfirmTransaction(connection, tx, [admin, configKeypair], {
    commitment: 'confirmed',
  });
  console.log(`\n  ✓ Config deployed.`);
  console.log(`    Signature:      ${sig}`);
  console.log(`    Config address: ${configKeypair.publicKey.toBase58()}\n`);
  console.log('  Add to apps/web/.env.local:');
  console.log(`    DBC_CONFIG_ADDRESS=${configKeypair.publicKey.toBase58()}`);
  console.log(`    DBC_FEE_CLAIMER_ADDRESS=${admin.publicKey.toBase58()}\n`);
}

main().catch((err) => {
  console.error('\n  ✗ Deploy failed:', err);
  process.exit(1);
});
