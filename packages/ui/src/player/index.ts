export { CoinFrenzyLogo } from './CoinFrenzyLogo'
export type { CfLogoVariant } from './CoinFrenzyLogo'

export { GoldButton } from './GoldButton'

export { BalancePill } from './BalancePill'
export { ShopButton } from './ShopButton'
export { ShopModalProvider, useShopModal } from './ShopModalContext'
export type { ShopTab } from './ShopModalContext'
export { ShopModalRoot } from './ShopModalRoot'
export type {
  ShopPackage,
  BankInstrument,
  PaymentInstrument,
  ShopPackagesQuery,
  ShopPackagesData,
} from './ShopModalRoot'
export { ShopLoader } from './ShopLoader'

export { KycModalProvider, useKycModal } from './KycModalContext'
export type { OpenKycOptions } from './KycModalContext'
export { KycModalRoot } from './KycVerificationModal'
export { VerifyIdentityButton } from './VerifyIdentityButton'

export { PlayerSidebar } from './PlayerSidebar'
export { PlayerTopBar } from './PlayerTopBar'
export { PlayerFooter } from './PlayerFooter'
export { MobileBottomNav } from './MobileBottomNav'
export type { MobileBottomNavProps } from './MobileBottomNav'

export { LiveWinsTicker, LiveWinsTickerSkeleton } from './LiveWinsTicker'
export type { LiveWin } from './LiveWinsTicker'
export { TopOfferStrip } from './TopOfferStrip'

export { GameTile } from './GameTile'
export type { GameTileData } from './GameTile'
export { GameGrid } from './GameGrid'
export { GameRail } from './GameRail'
export { CategoryTabs } from './CategoryTabs'
// IMPORTANT: re-export PLAYER_CATEGORIES + PlayerCategorySlug from the
// pure-data module (not from `./CategoryTabs`, which is `'use client'`).
// Server components import these, and routing them through a client
// boundary causes Turbopack to expose a client-reference proxy instead
// of the real array — `.find()` then throws at runtime.
export { PLAYER_CATEGORIES } from './player-categories-data'
export type { PlayerCategorySlug } from './player-categories-data'

export { LobbyHero } from './LobbyHero'
export { PromoBanner } from './PromoBanner'
export { CoinPackageCard } from './CoinPackageCard'

export { FoxIllustration } from './FoxIllustration'
export type { FoxVariant } from './FoxIllustration'

export { AuthModal, AuthTabs } from './AuthModal'
export { CfPasswordInput, CfTextInput, CfLabel } from './CfFormFields'

export { CfChromaKeyDef } from './CfChromaKeyDef'
export { BodyCfSurface } from './BodyCfSurface'
export { CoinClickPop } from './CoinClickPop'

export { ToastProvider, useToast } from './Toast'
export type { ToastTone } from './Toast'

export { FavoritesProvider, useFavoritesContext } from './FavoritesContext'
export type { FavoritesContextValue } from './FavoritesContext'

export { RewardsPopover } from './RewardsPopover'
export { RewardsModalProvider, useRewardsModal } from './RewardsContext'

export { BigWinReveal } from './BigWinReveal'
export type { BigWinRevealEvent } from './BigWinReveal'

export { SpotlightSearch } from './SpotlightSearch'
export type { SearchEntry } from './SpotlightSearch'

export { TickerNumber } from './TickerNumber'

export { SuccessCelebration } from './SuccessCelebration'
export type { SuccessCelebrationProps } from './SuccessCelebration'

export { EmptyState } from './EmptyState'
export { ErrorChip } from './ErrorChip'

export {
  classifyWinTier,
  fireBigWinCelebration,
  fireClaimCelebration,
  firePurchaseCelebration,
  formatMinorAsWhole,
  minorToNumber,
} from './celebrations'
export type { ConfettiBurstSize, WinTier } from './celebrations'

export {
  durations,
  easings,
  easingFns,
  haptic,
  hapticPatterns,
  prefersReducedMotion,
  springs,
  tweenNumber,
  useIsMobile,
  useMediaQuery,
  useReducedMotion,
  usePrevious,
} from './motion-primitives'
