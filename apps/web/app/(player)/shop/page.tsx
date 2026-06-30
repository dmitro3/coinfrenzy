import { redirect } from 'next/navigation'

// On the live coinfrenzy.com the Shop is a centered popup overlay, not
// a standalone page. Visits to /shop bounce to the lobby with the
// modal pre-opened via the `?shop=1` query (handled by
// `<ShopOpenOnQueryParam>` inside the player shell).
export default function ShopRedirect() {
  redirect('/lobby?shop=1')
}
