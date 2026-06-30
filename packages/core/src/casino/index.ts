// docs/08 §4 — Casino Management service layer.

export {
  listSubCategories,
  createSubCategory,
  updateSubCategory,
  deleteSubCategory,
  reorderSubCategories,
  listGamesInSection,
  addGamesToSection,
  removeGameFromSection,
  reorderGamesInSection,
  bulkAddByProvider,
  type SubCategoryListItem,
  type SubCategoryError,
  type CreateSubCategoryInput,
  type UpdateSubCategoryInput,
  type SectionGameRow,
} from './sub-categories'

export {
  getLobbyLayout,
  saveLobbyLayout,
  type LobbyLayout,
  type LobbyLayoutSection,
  type LobbyLayoutGame,
  type SaveLobbyLayoutInput,
  type SaveLobbyLayoutError,
} from './lobby-layout'

export {
  listAggregatorsDetailed,
  updateAggregator,
  type AggregatorListItem,
  type AggregatorError,
  type UpdateAggregatorInput,
} from './aggregators'

export {
  getProviderStats,
  getGameStats,
  getGameDashboardTotals,
  WINDOW_OPTIONS,
  type StatsWindow,
  type ProviderStats,
  type GameStatsRow,
  type GameDashboardTotals,
} from './stats'
