import { redirect } from 'next/navigation'

// docs/10 §3 — Root landing redirects all visitors (authed or not) to
// the lobby. The lobby is now the public-facing landing page per the
// Coin Frenzy brand redesign. Marketing content lives on /about and
// other static pages.

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  redirect('/lobby')
}
