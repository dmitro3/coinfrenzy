import { redirect } from 'next/navigation'

// /reset-password is now a modal state inside the player shell.
// Direct navigation (bookmarks, email reset links) is sent to /lobby
// with the auth modal auto-opening via the ?auth param.

export default function ResetPasswordPage({ searchParams }: { searchParams: { token?: string } }) {
  const token = searchParams.token
  if (token) {
    redirect(`/lobby?auth=reset-password&token=${encodeURIComponent(token)}`)
  }
  redirect('/lobby?auth=forgot-password')
}
