import { redirect } from 'next/navigation'

// /cashier/buy redirects to the lobby with the shop modal pre-opened.
// On the live coinfrenzy.com Shop is a centered popup, not a page —
// this redirect preserves any old shared links / bookmarks.
export default function CashierBuyRedirect() {
  redirect('/lobby?shop=1')
}
