// Alias for the legacy /games/[gameId] launcher so the player-facing
// URL pattern matches the live coinfrenzy.com site. We re-export the
// existing implementation rather than duplicating the launch logic.
import { default as LegacyLaunch } from '../../games/[gameId]/page'

export const dynamic = 'force-dynamic'

export default LegacyLaunch
