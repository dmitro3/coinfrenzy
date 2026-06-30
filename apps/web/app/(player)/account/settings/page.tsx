import { redirect } from 'next/navigation'

// The live coinfrenzy.com /settings page is a single screen with the
// 6-tile subnav (My Account, Password, Transactions, Game History,
// Self Exclusion, Preferences). Profile + personal details live on
// /account (My Account tab). The user-menu "Settings" entry lands here.

export const dynamic = 'force-dynamic'

export default function SettingsRedirect() {
  redirect('/account')
}
