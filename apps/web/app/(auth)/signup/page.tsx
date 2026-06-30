import { redirect } from 'next/navigation'

// /signup is now a modal state inside the player shell.
// Any direct navigation here (bookmarks, email links, CTA links) is
// sent to /lobby with the auth modal auto-opening via the ?auth param.

export default function SignupPage({ searchParams }: { searchParams: { next?: string } }) {
  const next = searchParams.next ? `&next=${encodeURIComponent(searchParams.next)}` : ''
  redirect(`/lobby?auth=signup${next}`)
}
