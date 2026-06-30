import Link from 'next/link'

export default function MockVendorsIndex() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Mock vendor pages</h1>
      <p className="text-sm text-slate-600">
        These pages simulate the third-party vendor surfaces we integrate with. They post webhook
        events back to our own receivers so the end-to-end flow is testable without external
        accounts.
      </p>
      <ul className="space-y-2">
        <li>
          <Link className="text-blue-600 underline" href="/mock-vendors/finix/checkout?demo=1">
            /mock-vendors/finix/checkout
          </Link>{' '}
          — simulated Finix Hosted Fields
        </li>
        <li>
          <Link
            className="text-blue-600 underline"
            href="/mock-vendors/footprint/onboarding?fp_id=demo&token=demo&email=demo@example.com"
          >
            /mock-vendors/footprint/onboarding
          </Link>{' '}
          — simulated Footprint KYC
        </li>
        <li>
          <Link
            className="text-blue-600 underline"
            href="/mock-vendors/alea/play?session=demo&game=hacksaw-cosmic-cash&token=demo"
          >
            /mock-vendors/alea/play
          </Link>{' '}
          — placeholder game (fires round.bet/round.win)
        </li>
      </ul>
    </div>
  )
}
