import { cn } from '../lib/utils'

import { GameTile, type GameTileData } from './GameTile'

// Responsive game grid powering /casino-games, /favorites, /recent-games.
//
// Column ramp tuned for the standard sweepstakes-casino feel — portrait
// tiles should land around 170-220px wide for the art to read cleanly.
// Earlier ramp jumped 5→7 at xl which left tiles ~140px on a 1280px
// viewport. New ramp stays at 6 columns through xl and only goes to 7
// on 2xl (1536px+) screens where there's room for it.
//
// Tile widths at each step (with a 220px sidebar + 1.5rem page padding):
//   - mobile  (320px):  ~140px (cols=2)
//   - sm     (640px):   ~190px (cols=3)
//   - md     (768px):   ~165px (cols=4)
//   - lg    (1024px):   ~145px (cols=5)
//   - xl    (1280px):   ~155px (cols=6)
//   - 2xl   (1536px):   ~160px (cols=7)  ← caps tile density; on 1800px+ they push to ~190px

interface GameGridProps {
  games: GameTileData[]
  currency?: 'GC' | 'SC'
  className?: string
}

export function GameGrid({ games, currency, className }: GameGridProps) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7',
        className,
      )}
    >
      {games.map((g) => (
        <GameTile key={g.slug} game={g} currency={currency} />
      ))}
    </div>
  )
}
