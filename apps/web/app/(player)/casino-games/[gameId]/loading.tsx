// Alias the /games/[gameId] loading skeleton so /casino-games/[gameId]
// shares the same gold iframe shimmer while the real game session
// resolves on the server.
export { default } from '../../games/[gameId]/loading'
