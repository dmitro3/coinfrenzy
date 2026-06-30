import { randomUUID } from 'node:crypto'

import { env } from '@coinfrenzy/config'

import type {
  AleaClient,
  AleaCreateSessionInput,
  AleaCreateSessionResult,
  AleaGameSummary,
  AleaLaunchGameInput,
  AleaListGamesInput,
  AleaListRoundsInput,
  AleaRoundSummary,
} from './types'

// Mock Alea per the founder's prompt-06 addendum:
//   "game launch returns a URL that points to an in-app placeholder game
//    page; provide a test helper to fire round.bet and round.win events"
//
// The in-app placeholder lives at `/mock-vendors/alea/play/...` and posts
// bet+win events back through our own /api/webhooks/alea/v1 endpoint.

// docs/05 §5.7 — mock catalog. Provider names mirror the real Alea
// sandbox studios so that admin tooling looks the same in mock and live
// modes. Thumbnails reference local assets under /game-art/<category>/ so
// the lobby ships with pixel-perfect art matching the live coinfrenzy.com.

function slotsHacksaw(
  slug: string,
  displayName: string,
  filename: string,
  flags: Partial<AleaGameSummary> = {},
): AleaGameSummary {
  return {
    externalId: `hacksaw-${slug}`,
    slug,
    displayName,
    providerSlug: 'hacksaw-gaming',
    providerDisplayName: 'Hacksaw Gaming',
    category: 'slots',
    thumbnailUrl: `/game-art/slots/${filename}`,
    bannerUrl: null,
    rtp: 0.962,
    volatility: 'high',
    ...flags,
  }
}

function slotsNolimit(
  slug: string,
  displayName: string,
  filename: string,
  flags: Partial<AleaGameSummary> = {},
): AleaGameSummary {
  return {
    externalId: `nolimit-${slug}`,
    slug,
    displayName,
    providerSlug: 'nolimit-city',
    providerDisplayName: 'NoLimit City',
    category: 'slots',
    thumbnailUrl: `/game-art/slots/${filename}`,
    bannerUrl: null,
    rtp: 0.961,
    volatility: 'high',
    ...flags,
  }
}

function slotsBooming(
  slug: string,
  displayName: string,
  filename: string,
  flags: Partial<AleaGameSummary> = {},
): AleaGameSummary {
  return {
    externalId: `booming-${slug}`,
    slug,
    displayName,
    providerSlug: 'booming-games',
    providerDisplayName: 'Booming Games',
    category: 'slots',
    thumbnailUrl: `/game-art/slots/${filename}`,
    bannerUrl: null,
    rtp: 0.965,
    volatility: 'medium',
    ...flags,
  }
}

function slotsRedTiger(
  slug: string,
  displayName: string,
  filename: string,
  flags: Partial<AleaGameSummary> = {},
): AleaGameSummary {
  return {
    externalId: `redtiger-${slug}`,
    slug,
    displayName,
    providerSlug: 'red-tiger',
    providerDisplayName: 'Red Tiger',
    category: 'slots',
    thumbnailUrl: `/game-art/slots/${filename}`,
    bannerUrl: null,
    rtp: 0.96,
    volatility: 'high',
    ...flags,
  }
}

function slotsPlayson(
  slug: string,
  displayName: string,
  filename: string,
  flags: Partial<AleaGameSummary> = {},
): AleaGameSummary {
  return {
    externalId: `playson-${slug}`,
    slug,
    displayName,
    providerSlug: 'playson',
    providerDisplayName: 'Playson',
    category: 'slots',
    thumbnailUrl: `/game-art/slots/${filename}`,
    bannerUrl: null,
    rtp: 0.96,
    volatility: 'medium',
    ...flags,
  }
}

function liveDealer(
  slug: string,
  displayName: string,
  filename: string,
  providerSlug: 'iconic-21' | 'evolution',
  providerDisplayName: string,
  flags: Partial<AleaGameSummary> = {},
): AleaGameSummary {
  return {
    externalId: `${providerSlug}-${slug}`,
    slug,
    displayName,
    providerSlug,
    providerDisplayName,
    category: 'live-dealers',
    thumbnailUrl: `/game-art/live/${filename}`,
    bannerUrl: null,
    rtp: 0.99,
    volatility: 'low',
    ...flags,
  }
}

function original(
  slug: string,
  displayName: string,
  filename: string,
  flags: Partial<AleaGameSummary> = {},
): AleaGameSummary {
  return {
    externalId: `cfo-${slug}`,
    slug,
    displayName,
    providerSlug: 'coin-frenzy-originals',
    providerDisplayName: 'Coin Frenzy Originals',
    category: 'originals',
    thumbnailUrl: `/game-art/originals/${filename}`,
    bannerUrl: null,
    rtp: 0.98,
    volatility: 'high',
    ...flags,
  }
}

function slots3Oaks(
  slug: string,
  displayName: string,
  filename: string,
  flags: Partial<AleaGameSummary> = {},
): AleaGameSummary {
  return {
    externalId: `oaks-${slug}`,
    slug,
    displayName,
    providerSlug: '3-oaks-gaming',
    providerDisplayName: '3 Oaks Gaming',
    category: 'slots',
    thumbnailUrl: `/game-art/slots/${filename}`,
    bannerUrl: null,
    rtp: 0.962,
    volatility: 'high',
    ...flags,
  }
}

function gameShow(
  slug: string,
  displayName: string,
  filename: string,
  flags: Partial<AleaGameSummary> = {},
): AleaGameSummary {
  return {
    externalId: `gs-${slug}`,
    slug,
    displayName,
    providerSlug: 'evolution',
    providerDisplayName: 'Evolution',
    category: 'game-shows',
    thumbnailUrl: `/game-art/shows/${filename}`,
    bannerUrl: null,
    rtp: 0.97,
    volatility: 'medium',
    ...flags,
  }
}

// docs/05 §5.7 — exact catalog mirror of the live coinfrenzy.com lobby.
// Order, names, and providers all sourced from the operator's admin
// backend (Originals / Slots / Live Dealers / Game Shows tabs). Adding
// new games here will appear on the player lobby on the next page
// load via the auto-sync in `apps/web/lib/games-catalog.ts`.
const MOCK_GAMES: AleaGameSummary[] = [
  // ============================ ORIGINALS ============================
  // Order pulled directly from the admin backend Originals tab.
  original('plinko', 'Plinko', 'plinko.png', { isFeatured: true }),
  original('blackjack', 'Blackjack', 'blackjack.png', { isFeatured: true }),
  original('keno', 'Keno', 'keno.png', { isFeatured: true }),
  original('cross', 'Cross', 'cross.png', { isFeatured: true }),
  original('roulette', 'Roulette', 'roulette.png', { isFeatured: true }),
  original('coin-flip', 'Coin Flip', 'cf_originals_coin_flip.jpg', { isFeatured: true }),
  original('dice', 'Dice', 'cf_originals_dice.jpg', { isFeatured: true }),
  original('hilo', 'Hilo', 'cf_originals_hilo.jpg', { isFeatured: true }),
  original('mines', 'Mines', 'mines.png'),
  original('crash', 'Crash', 'cf_originals_crash.jpg'),

  // ============================== SLOTS ==============================
  // Top of the Slots tab on the live site — order matches the admin
  // backend exactly. The fold of additional slots after position 8 is
  // padded from the imported asset library.
  slotsHacksaw('le-bandit', 'Le Bandit', 'Le Bandit Hacksaw.jpg', { isFeatured: true }),
  slotsHacksaw(
    'wanted-dead-or-a-wild',
    'Wanted Dead or a Wild',
    'wanted-dead-or-a-wild-slot-Hacksaw.jpg',
    { isFeatured: true },
  ),
  slotsBooming('3-hot-chillies', '3 Hot Chillies', '3_hot_chillies.jpg', { isFeatured: true }),
  slots3Oaks('fishin-bear', "Fishin' Bear", 'fishin_bear_3oaks.webp', { isFeatured: true }),
  slotsHacksaw('jaws-of-justice', 'Jaws of Justice', 'jaws_of_justice.jpg', { isFeatured: true }),
  slotsHacksaw('itero', 'Itero', 'itero.jpg', { isFeatured: true }),
  slots3Oaks('coin-volcano', 'Coin Volcano', 'coin_volcano.jpg', { isFeatured: true }),
  slotsBooming('buffalo-hold-and-win', 'Buffalo Hold and Win', 'buffalo_hold_and_win.jpg', {
    isFeatured: true,
  }),

  // Slots — fold (page 2 of the slots tab + the long-tail catalog)
  slotsHacksaw('le-fisherman', 'Le Fisherman', 'le_fisherman.jpg'),
  slotsHacksaw('le-cowboy', 'Le Cowboy', 'le_cowboy.jpg'),
  slotsHacksaw('le-pharaoh', 'Le Pharaoh', 'le_pharaoh.jpg'),
  slotsHacksaw('le-viking', 'Le Viking', 'le_viking.jpg'),
  slotsHacksaw('le-zeus', 'Le Zeus', 'le_zeus.jpg'),
  slotsHacksaw('duel-at-dawn', 'Duel at Dawn', 'duel_at_dawn.jpg'),
  slotsHacksaw('gator-hunters', 'Gator Hunters', 'gator_hunters.jpg'),
  slotsHacksaw('duck-hunters', 'Duck Hunters', 'duck_hunters.jpg'),
  slotsHacksaw(
    'duck-hunters-happy-hour',
    'Duck Hunters Happy Hour',
    'duck_hunters_happy_hour.jpg',
    { isNew: true },
  ),
  slotsHacksaw('cash-pig', 'Cash Pig', 'cash_pig.jpg'),

  slotsNolimit('mental', 'Mental', 'mental.jpg', { isNew: true }),
  slotsNolimit('mental-2', 'Mental 2', 'mental_2.jpg', { isNew: true }),
  slotsNolimit('tombstone-rip', 'Tombstone R.I.P.', 'tombstone_rip.jpg'),
  slotsNolimit('tombstone', 'Tombstone', 'tombstone.jpg'),
  slotsNolimit('san-quentin-xways', 'San Quentin xWays', 'san_quentin_xways.jpg'),
  slotsNolimit('deadwood-xnudge', 'Deadwood xNudge', 'deadwood_xnudge.jpg'),
  slotsNolimit('fire-in-the-hole-2', 'Fire in the Hole 2', 'fire_in_the_hole_2.jpg'),
  slotsNolimit('fire-in-the-hole-3', 'Fire in the Hole 3', 'fire_in_the_hole_3.jpg', {
    isNew: true,
  }),
  slotsNolimit('bushido-ways-xnudge', 'Bushido Ways xNudge', 'bushido_ways_xnudge.jpg'),
  slotsNolimit('el-paso-gunfight', 'El Paso Gunfight', 'el_paso_gunfight_xnudge.jpg'),
  slotsNolimit('das-xboot', 'Das xBoot', 'das_xboot.jpg'),
  slotsNolimit('punk-rocker-2', 'Punk Rocker 2', 'punk_rocker_2.jpg'),

  slotsBooming(
    'buffalo-hold-and-win-extreme',
    'Buffalo Hold and Win Extreme 10,000',
    'buffalo_hold_and_win_extreme_10_000.jpg',
  ),
  slotsBooming('3-pots-riches', '3 Pots Riches Hold and Win', '3_pots_riches_hold_and_win.jpg'),
  slotsBooming('4-pots-riches', '4 Pots Riches Hold and Win', '4_pots_riches_hold_and_win.jpg'),
  slotsBooming('coins-of-fortune', 'Coins of Fortune', 'coins_of_fortune.jpg'),
  slotsBooming('lion-gems-hold-and-win', 'Lion Gems Hold and Win', 'lion_gems_hold_and_win.jpg'),

  slotsRedTiger('arcade-bomb', 'Arcade Bomb', 'arcade_bomb.jpg'),
  slotsRedTiger('cash-explorer', 'Cash Explorer', 'cash_explorer.jpg'),
  slotsRedTiger('crazy-genie', 'Crazy Genie', 'crazy_genie.jpg'),
  slotsRedTiger('diamond-blitz', 'Diamond Blitz', 'diamond_blitz.jpg'),
  slotsRedTiger('dragons-luck', "Dragon's Luck", 'dragon_s_luck.jpg'),
  slotsRedTiger('dragons-luck-deluxe', "Dragon's Luck Deluxe", 'dragon_s_luck_deluxe.jpg'),
  slotsRedTiger('mystery-reels', 'Mystery Reels', 'mystery_reels.jpg'),
  slotsRedTiger('reel-king-mega', 'Reel King Mega', 'reel_king_mega.jpg'),
  slotsRedTiger('rainbow-jackpots', 'Rainbow Jackpots', 'rainbow_jackpots.jpg'),

  slotsPlayson(
    'legend-of-cleopatra',
    'Legend of Cleopatra Megaways',
    'legend_of_cleopatra_megaways.jpg',
  ),
  slotsPlayson('solar-queen', 'Solar Queen', 'solar_queen.jpg'),
  slotsPlayson('book-of-gold', 'Book of Gold Multichance', 'book_of_gold_multichance.jpg'),
  slotsPlayson(
    'diamond-fortunator',
    'Diamond Fortunator Hold and Win',
    'diamond_fortunator_hold_and_win.jpg',
  ),
  slotsPlayson('royal-coins-2', 'Royal Coins 2 Hold and Win', 'royal_coins_2_hold_and_win.jpg'),
  slotsPlayson('hot-coins', 'Hot Coins Hold and Win', 'hot_coins_hold_and_win.jpg'),
  slotsPlayson('jokers-coins', "Joker's Coins Hold and Win", 'jokers_coins_hold_and_win.jpg'),

  // =========================== LIVE DEALERS ==========================
  // Mirrors the live site's Live Dealers tab, in admin-backend order.
  liveDealer(
    'oasis-blackjack',
    'Oasis Blackjack',
    'blackjack_1_live_iconic21.jpg',
    'iconic-21',
    'Iconic 21',
    { isFeatured: true },
  ),
  liveDealer(
    'live-roulette',
    'Live Roulette',
    'roulette_live_iconic21.jpg',
    'iconic-21',
    'Iconic 21',
  ),
  liveDealer(
    'grand-bonus-baccarat',
    'Grand Bonus Baccarat',
    'baccarat_live_evolution.jpg',
    'evolution',
    'Evolution',
  ),
  liveDealer(
    'prime-blackjack-table-1',
    'Prime Blackjack Table 1',
    'blackjack_2_live_iconic21.jpg',
    'iconic-21',
    'Iconic 21',
  ),
  liveDealer(
    'prime-blackjack-table-7',
    'Prime Blackjack Table 7',
    'blackjack_3_live_iconic21.jpg',
    'iconic-21',
    'Iconic 21',
  ),
  liveDealer(
    'blackjack-lobby',
    'Blackjack Lobby',
    'blackjack_lobby_live_evolution.jpg',
    'evolution',
    'Evolution',
  ),
  liveDealer(
    'roulette-lobby',
    'Roulette Lobby',
    'roulette_lobby_live_evolution.jpg',
    'evolution',
    'Evolution',
  ),
  liveDealer('craps-live', 'Craps', 'craps_live_evolution.jpg', 'evolution', 'Evolution', {
    isFeatured: true,
  }),
  // Additional live-dealer fold (page 2 of the Live Dealers tab)
  liveDealer(
    'baccarat-table-1',
    'Baccarat Table 1',
    'baccarat_1_live_iconic21.jpg',
    'iconic-21',
    'Iconic 21',
  ),
  liveDealer(
    'baccarat-table-2',
    'Baccarat Table 2',
    'baccarat_2_live_evolution.jpg',
    'evolution',
    'Evolution',
  ),
  liveDealer(
    'fireball-roulette',
    'Fireball Roulette',
    'fireball_roulette_live_evolution.jpg',
    'evolution',
    'Evolution',
  ),
  liveDealer(
    'extreme-texas-holdem',
    "Extreme Texas Hold'em",
    'extreme_texas_holdem_live_evolution.jpg',
    'evolution',
    'Evolution',
  ),
  liveDealer(
    'gravity-blackjack',
    'Gravity Blackjack',
    'blackjack_gravity_live_iconic21.jpg',
    'iconic-21',
    'Iconic 21',
  ),

  // =========================== GAME SHOWS ============================
  // Order pulled from the admin backend Game Shows tab.
  gameShow('game-shows-lobby', 'Game Shows Lobby', 'crazy_pachinko_live_evolution.jpg', {
    isFeatured: true,
  }),
  gameShow('ice-fishing', 'Ice Fishing', 'ice_fishing_live_evolution.jpg', { isFeatured: true }),
  gameShow(
    'football-studio-dice',
    'Football Studio Dice',
    'football_studio_dice_live_evolution.jpg',
  ),
  gameShow('mega-ball', 'Mega Ball', 'mega_ball_100x_live_evolution.jpg', { isFeatured: true }),
  gameShow(
    'monopoly-big-baller',
    'Monopoly Big Baller Live',
    'monopoly_big_baller_live_evolution.jpg',
    { isFeatured: true },
  ),
  gameShow('crazy-coin-flip', 'Crazy Coin Flip', 'crazy_coin_flip_live_evolution.jpg', {
    isFeatured: true,
  }),
  gameShow(
    'first-person-stock-market',
    'First Person Stock Market',
    'stock_market_live_evolution.jpg',
  ),
  gameShow('the-kickoff', 'The Kickoff', 'the_kickoff_live_evolution.jpg', { isNew: true }),
  // Game Shows — fold
  gameShow('balloon-race', 'Balloon Race', 'balloon_race_live_evolution.jpg'),
  gameShow('crazy-balls', 'Crazy Balls', 'crazy_balls_live_evolution.jpg'),
  gameShow(
    'dead-or-alive-saloon',
    'Dead or Alive Saloon',
    'dead_or_alive_saloon_live_evolution.jpg',
  ),
]

export class MockAleaClient implements AleaClient {
  readonly mode = 'mock' as const

  async createSession(input: AleaCreateSessionInput): Promise<AleaCreateSessionResult> {
    const token = `alea_mock_${randomUUID().replace(/-/g, '').slice(0, 24)}`
    const base = env().PLAYER_BASE_URL ?? 'http://localhost:3000'
    const playUrl = `${base}/mock-vendors/alea/play?session=${encodeURIComponent(
      input.casinoSessionId,
    )}&game=${encodeURIComponent(input.externalGameId)}&token=${encodeURIComponent(token)}`
    return { sessionToken: token, playUrl }
  }

  async launchGame(input: AleaLaunchGameInput) {
    const token = `alea_mock_${randomUUID().replace(/-/g, '').slice(0, 24)}`
    const base = env().PLAYER_BASE_URL ?? 'http://localhost:3000'
    const playUrl = `${base}/mock-vendors/alea/play?session=${encodeURIComponent(
      input.playerId,
    )}&game=${encodeURIComponent(input.externalGameId)}&token=${encodeURIComponent(token)}`
    return { sessionToken: token, playUrl }
  }

  async listGames(_input: AleaListGamesInput): Promise<AleaGameSummary[]> {
    return MOCK_GAMES
  }

  // The mock returns whatever the test harness has staged via
  // _stageMockAleaRounds. Default = empty — reconciliation is a no-op in
  // dev unless explicitly exercised.
  async listRounds(input: AleaListRoundsInput): Promise<AleaRoundSummary[]> {
    const all = _MOCK_ALEA_ROUNDS
    return all
      .filter((r) => r.betAt >= input.from && r.betAt < input.to)
      .filter((r) => !input.currency || r.currency === input.currency)
      .slice(0, input.limit ?? Number.MAX_SAFE_INTEGER)
  }
}

export const _MOCK_ALEA_GAMES = MOCK_GAMES

// Test-only staging for listRounds. Production code never reads this
// outside the mock client.
let _MOCK_ALEA_ROUNDS: AleaRoundSummary[] = []
export function _stageMockAleaRounds(rounds: AleaRoundSummary[]): void {
  _MOCK_ALEA_ROUNDS = rounds
}
export function _resetMockAleaRounds(): void {
  _MOCK_ALEA_ROUNDS = []
}

// docs/05 §5.5 — round.bet / round.win payload shape. We reproduce Alea's
// published structure as closely as the wiki documents; values are tweaked
// here only to match the keys used by our handlers.

export interface FireMockRoundInput {
  casinoSessionId: string
  playerId: string
  externalGameId: string
  externalRoundId?: string
  amountMinor: bigint
  currency: 'GC' | 'SC'
}

export interface FireMockRoundResult {
  roundId: string
  betDelivered: boolean
  winDelivered: boolean
}

/**
 * Fire a paired round.bet + round.win against our own webhook receiver.
 * Used by the in-app placeholder game page and by tests.
 */
export async function fireMockAleaRound(
  input: FireMockRoundInput & { winAmountMinor?: bigint },
): Promise<FireMockRoundResult> {
  const roundId = input.externalRoundId ?? `round_${randomUUID().replace(/-/g, '').slice(0, 24)}`
  const winAmount = input.winAmountMinor ?? 0n
  const betDelivered = await fireOne({
    type: 'round.bet',
    roundId,
    casinoSessionId: input.casinoSessionId,
    playerId: input.playerId,
    gameId: input.externalGameId,
    amount: Number(input.amountMinor),
    currency: input.currency,
  })
  const winDelivered = await fireOne({
    type: 'round.win',
    roundId,
    casinoSessionId: input.casinoSessionId,
    playerId: input.playerId,
    gameId: input.externalGameId,
    amount: Number(winAmount),
    currency: input.currency,
  })
  return { roundId, betDelivered, winDelivered }
}

interface RawAleaEvent {
  type: 'round.bet' | 'round.win'
  roundId: string
  casinoSessionId: string
  playerId: string
  gameId: string
  amount: number
  currency: 'GC' | 'SC'
}

async function fireOne(event: RawAleaEvent): Promise<boolean> {
  const payload = {
    ...event,
    eventId: `evt_${randomUUID().replace(/-/g, '').slice(0, 20)}`,
    timestamp: new Date().toISOString(),
  }
  const rawBody = JSON.stringify(payload)

  const { signMockAleaBody } = await import('./verify-webhook')
  const { signature, timestamp } = signMockAleaBody(rawBody)

  const base = env().WEBHOOK_BASE_URL ?? 'http://localhost:3000'
  try {
    const res = await fetch(`${base}/api/webhooks/alea/v1`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-alea-signature': signature,
        'x-alea-timestamp': timestamp,
      },
      body: rawBody,
    })
    return res.ok
  } catch {
    return false
  }
}
