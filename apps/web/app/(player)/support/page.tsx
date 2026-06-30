import Link from 'next/link'
import { LifeBuoy } from 'lucide-react'

export const dynamic = 'force-dynamic'

const FAQS = [
  {
    q: 'What are Gold Coins (GC) and Sweepstakes Coins (SC)?',
    a: 'Gold Coins are for play and have no monetary value. Sweepstakes Coins can be redeemed for cash prizes once you complete identity verification and any required playthrough.',
  },
  {
    q: 'How do I redeem Sweepstakes Coins?',
    a: 'Visit Cashier → Redeem. Complete Footprint identity verification (Level 2), enter the SC amount, and pick a verified bank account. Typical timing: 3–5 business days.',
  },
  {
    q: 'How do I get SC without a purchase?',
    a: 'Send a mail-in request per our AMOE rules — see the Free Entry page in the footer.',
  },
]

export default function SupportPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <LifeBuoy className="h-6 w-6 text-primary" />
          Support
        </h1>
      </header>

      <section className="rounded-lg border border-border/60 bg-card p-5">
        <h2 className="font-semibold">Chat with us</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Our Fin AI agent answers most questions instantly. Connecting you to a human if it
          can&apos;t. (Intercom widget mounts here once we add the embed.)
        </p>
        <div className="mt-4 rounded-md border border-dashed border-border/60 bg-background/40 p-4 text-center text-sm text-muted-foreground">
          Intercom widget — embed lands in prompt 09.
        </div>
      </section>

      <section className="mt-6 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Top FAQs
        </h2>
        <div className="space-y-2">
          {FAQS.map((f) => (
            <details
              key={f.q}
              className="group rounded-lg border border-border/60 bg-card p-4 text-sm"
            >
              <summary className="cursor-pointer list-none font-medium">{f.q}</summary>
              <p className="mt-2 text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-border/60 bg-card p-5 text-sm">
        <h2 className="font-semibold">Email us</h2>
        <p className="mt-1 text-muted-foreground">
          Can&apos;t use chat?{' '}
          <a
            className="text-primary underline-offset-4 hover:underline"
            href="mailto:support@coinfrenzy.com"
          >
            support@coinfrenzy.com
          </a>{' '}
          — typical response within 24 hours.
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          For VIPs: see the{' '}
          <Link className="text-primary underline-offset-4 hover:underline" href="/vip">
            VIP page
          </Link>{' '}
          for your account manager.
        </p>
      </section>
    </div>
  )
}
