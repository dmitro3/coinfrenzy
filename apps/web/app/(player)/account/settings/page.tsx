import { redirect } from 'next/navigation'

// The live coinfrenzy.com /settings page is a single screen with the
// 6-tile subnav (My Account, Password, Transactions, Game History,
// Self Exclusion, Preferences). We follow the same model: profile +
// field cards live on /account, marketing opt-ins live on
// /account/notifications. To avoid breaking any legacy links and to
// honour the user-menu "Settings" entry, /account/settings forwards
// to /account/notifications (Preferences).

export const dynamic = 'force-dynamic'

export default function SettingsRedirect() {
  redirect('/account/notifications')
}
