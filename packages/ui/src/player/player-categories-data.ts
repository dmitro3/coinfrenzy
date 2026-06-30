// Pure data + type for the five player-facing game categories from the
// live site. This file deliberately has NO `'use client'` directive so
// the constant can be imported into both server components (e.g.
// `app/(player)/casino-games/page.tsx`) and client components without
// Turbopack wrapping it as a client-reference proxy (which would make
// `.find()`, `.map()`, etc. throw at runtime).
//
// The icons + chrome live in `CategoryTabs.tsx` (which IS a client
// component). Server code only ever needs the slug + label.

export const PLAYER_CATEGORIES = [
  { slug: 'originals', label: 'Originals' },
  { slug: 'slots', label: 'Slots' },
  { slug: 'live-dealers', label: 'Live Dealers' },
  { slug: 'game-shows', label: 'Game Shows' },
  { slug: 'live-games', label: 'Live Games' },
] as const

export type PlayerCategorySlug = (typeof PLAYER_CATEGORIES)[number]['slug']
