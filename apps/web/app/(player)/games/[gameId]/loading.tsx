// Per-game loading skeleton. Renders while the server component above
// (game-launch resolution + Alea session creation) is in flight.
// Matches the new immersive shell so there's no layout shift when the
// real iframe + GameImmersiveFooter land:
//   - flex column filling the full viewport (Shell drops sidebar /
//     footer / ticker on /games/{id} routes)
//   - black iframe-shaped surface with the gold shimmer + "Dealing
//     you in…" centred pill
//   - skeleton footer strip with the same height as the real footer
//     so the bottom bar doesn't jump when state settles

export default function GameLoading() {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-black">
      <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
        <div className="cf-iframe-skeleton absolute inset-0" aria-hidden="true" />
        <div className="absolute inset-0 grid place-items-center">
          <div className="rounded-full border border-[var(--cf-gold-deep)]/40 bg-black/50 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--cf-gold-light)] shadow-[0_0_18px_rgba(245,208,102,0.18)] backdrop-blur-sm">
            Dealing you in…
          </div>
        </div>
      </div>
      <div className="relative flex h-12 shrink-0 items-center justify-between gap-3 border-t border-[var(--cf-border-default)] bg-gradient-to-b from-[#0d0d12] to-[#06060a] px-3 sm:h-14 sm:px-5">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--cf-gold-light)]/45 to-transparent"
        />
        <div className="flex items-center gap-3">
          <div className="cf-skeleton-shimmer h-4 w-28 rounded" />
          <div className="cf-skeleton-shimmer hidden h-5 w-24 rounded-full sm:block" />
        </div>
        <div className="flex items-center gap-1.5">
          <div className="cf-skeleton-shimmer h-9 w-9 rounded-md" />
          <div className="cf-skeleton-shimmer h-9 w-9 rounded-md" />
          <div className="cf-skeleton-shimmer h-9 w-9 rounded-md" />
        </div>
      </div>
    </div>
  )
}
