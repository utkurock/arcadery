import { z } from 'zod';

const EconomyModelSchema = z.enum([
  'free',
  'pay-to-play',
  'play-to-earn',
  'tournament',
  'token-launch',
]);

const LaunchPlatformSchema = z.enum(['pumpfun', 'meteora', 'bags']);
export type LaunchPlatform = z.infer<typeof LaunchPlatformSchema>;

export const GameEconomyConfigSchema = z.object({
  walletConnect: z
    .object({
      enabled: z.boolean(),
    })
    .default({ enabled: true }),
  enabled: z.boolean().default(false),
  model: EconomyModelSchema.default('free'),
  token: z
    .object({
      name: z.string(),
      symbol: z.string(),
      description: z.string(),
      image: z.string(),
    })
    .default({ name: '', symbol: '', description: '', image: '' }),
  launchPlatform: LaunchPlatformSchema.default('pumpfun'),
  pricing: z
    .object({
      entryFee: z.number(),
      entryCurrency: z.enum(['SOL', 'USDC']),
    })
    .default({ entryFee: 0, entryCurrency: 'SOL' }),
  rewards: z
    .object({
      winnerShare: z.number(),
      creatorShare: z.number(),
      platformShare: z.number(),
      stakingEnabled: z.boolean(),
      stakingApy: z.number(),
    })
    .default({
      winnerShare: 70,
      creatorShare: 20,
      platformShare: 10,
      stakingEnabled: false,
      stakingApy: 12,
    }),
  tournament: z
    .object({
      maxPlayers: z.number(),
      duration: z.enum(['daily', 'weekly', 'custom']),
      leaderboardRewards: z.array(z.number()),
    })
    .default({ maxPlayers: 100, duration: 'weekly', leaderboardRewards: [50, 25, 15, 10] }),
  tokenGating: z
    .object({
      enabled: z.boolean(),
      minTokens: z.number(),
      holdToPlay: z.boolean(),
    })
    .default({ enabled: false, minTokens: 1000, holdToPlay: false }),
});

export type GameEconomyConfig = z.infer<typeof GameEconomyConfigSchema>;

export const DEFAULT_ECONOMY: GameEconomyConfig = GameEconomyConfigSchema.parse({});

export function isWalletConnectEnabled(economy: GameEconomyConfig | null | undefined): boolean {
  // Default to enabled when missing — every prompt-generated project should show wallet UI.
  return economy?.walletConnect?.enabled !== false;
}
