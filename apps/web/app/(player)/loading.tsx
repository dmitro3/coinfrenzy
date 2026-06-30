// docs/10 §4.3 — global player-segment loading UI.
//
// This file is critical for perceived performance. Without it, Next.js
// keeps the previous page mounted while the new route compiles + the
// server renders — meaning a click on a sidebar link looks dead for
// however long the work takes (5-25s in dev, 50-500ms in prod). With
// this file, the player shell (sidebar, top bar, footer) stays
// mounted and the inner `<main>` swaps to a shimmering skeleton the
// instant the user clicks. The route still takes the same wall-clock
// time to render — but the player gets immediate visual feedback that
// their click registered. This is the single largest perceived-speed
// win available to us short of moving to production builds.
//
// We render a generic "page-shaped" skeleton (hero strip + tile grid)
// because it fits the dominant player route (lobby, casino-games,
// favorites, recent-games). Account / history routes still look
// reasonable under this — a header band + content rows.

export default function PlayerSegmentLoading() {
  return (
    <div className="cf-skeleton-page py-4">
      {/* Hero strip — sized like a banner */}
      <div className="cf-skeleton-shimmer h-32 w-full rounded-xl sm:h-44 lg:h-56" />

      {/* Category strip */}
      <div className="mt-5 flex gap-2 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="cf-skeleton-shimmer h-9 w-28 shrink-0 rounded-md"
            style={{ animationDelay: `${i * 60}ms` }}
          />
        ))}
      </div>

      {/* Rail header */}
      <div className="mt-6 flex items-center justify-between">
        <div className="cf-skeleton-shimmer h-5 w-36 rounded-sm" />
        <div className="cf-skeleton-shimmer h-4 w-16 rounded-sm" />
      </div>

      {/* Tile grid — matches the live GameGrid breakpoints so the
          skeleton → real-tiles handoff doesn't reflow. */}
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
        {Array.from({ length: 14 }).map((_, i) => (
          <div
            key={i}
            className="cf-skeleton-shimmer aspect-[3/4] w-full rounded-md"
            style={{ animationDelay: `${i * 40}ms` }}
          />
        ))}
      </div>

      <div className="mt-8 flex items-center justify-between">
        <div className="cf-skeleton-shimmer h-5 w-36 rounded-sm" />
        <div className="cf-skeleton-shimmer h-4 w-16 rounded-sm" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={`b-${i}`}
            className="cf-skeleton-shimmer aspect-[3/4] w-full rounded-md"
            style={{ animationDelay: `${(i + 6) * 40}ms` }}
          />
        ))}
      </div>
    </div>
  )
}
