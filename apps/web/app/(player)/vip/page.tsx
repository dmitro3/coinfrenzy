import { Trophy } from 'lucide-react'

export const dynamic = 'force-dynamic'

const TIERS = [
  { name: 'Bronze', requirement: '0 SC wagered' },
  { name: 'Silver', requirement: '1,000 SC wagered' },
  { name: 'Gold', requirement: '10,000 SC wagered' },
  { name: 'Platinum', requirement: '50,000 SC wagered' },
  { name: 'Diamond', requirement: '250,000 SC wagered' },
]

export default function VipPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Trophy className="h-6 w-6 text-primary" />
          VIP
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your current tier and what unlocks next.
        </p>
      </header>

      <section className="rounded-lg border border-border/60 bg-card p-5">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Current tier</div>
        <div className="mt-1 text-3xl font-semibold">Bronze</div>
        <div className="mt-4">
          <div className="text-xs text-muted-foreground">Progress to Silver</div>
          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div className="h-full w-0 bg-primary" />
          </div>
          <div className="mt-1 text-xs tabular-nums text-muted-foreground" data-numeric="true">
            0 / 1,000 SC wagered
          </div>
        </div>
      </section>

      <section className="mt-8 space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          All tiers
        </h2>
        <div className="rounded-lg border border-border/60 bg-card">
          {TIERS.map((tier, i) => (
            <div
              key={tier.name}
              className={`flex items-center justify-between px-4 py-3 text-sm ${i > 0 ? 'border-t border-border/60' : ''}`}
            >
              <div className="font-medium">{tier.name}</div>
              <div className="text-muted-foreground">{tier.requirement}</div>
            </div>
          ))}
        </div>
      </section>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Tier benefits, multipliers, and personal account manager assignments configure in admin
        (prompt 04+) and apply once the tier engine ships in prompt 07.
      </p>
    </div>
  )
}
