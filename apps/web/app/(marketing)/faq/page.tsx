export const metadata = {
  title: 'FAQ | Coin Frenzy',
}

// docs/10 §3 — public FAQ page. Categorized accordion. The content
// here is reviewed by Claude/compliance; treat the answers as canon.

const CATEGORIES: Array<{
  title: string
  faqs: Array<{ q: string; a: string }>
}> = [
  {
    title: 'Getting Started',
    faqs: [
      {
        q: 'What is Coin Frenzy?',
        a: 'A free-to-play social casino. You play hundreds of games using two virtual currencies: Gold Coins (GC) for entertainment, and Sweepstakes Coins (SC) that are redeemable for cash prizes.',
      },
      {
        q: 'Do I have to pay to play?',
        a: 'No. You can play Gold Coins forever for free, and we offer free SC entry via our mail-in alternative method (see Free Entry / AMOE).',
      },
      {
        q: 'Who can play?',
        a: 'Players who are 18 or older and located in a participating US state. See "Which states are available?" below.',
      },
    ],
  },
  {
    title: 'Currencies',
    faqs: [
      {
        q: 'What is the difference between GC and SC?',
        a: 'Gold Coins (GC) are for play only and cannot be redeemed. Sweepstakes Coins (SC) can be redeemed for cash prizes once you have completed identity verification.',
      },
      {
        q: 'How do I get more Sweepstakes Coins?',
        a: 'SC are awarded as a free bonus with Gold Coin purchases, through daily login rewards, referrals, promotions, and the mail-in AMOE method.',
      },
    ],
  },
  {
    title: 'Redemptions',
    faqs: [
      {
        q: 'How long do redemptions take?',
        a: 'Typical timing is 1–3 business days for bank ACH after approval. Debit-card payouts via APT are instant where supported. Large redemptions may take longer due to verification.',
      },
      {
        q: 'What is the minimum redemption?',
        a: '50 SC is the minimum redemption amount.',
      },
    ],
  },
  {
    title: 'Availability & Compliance',
    faqs: [
      {
        q: 'Which states are available?',
        a: 'Coin Frenzy is available in 39 US states for SC play. We do not offer SC play in Idaho, Louisiana, Michigan, Montana, Nevada, New Jersey, New York, Tennessee, Washington, California, or Connecticut.',
      },
      {
        q: 'Do you offer responsible gaming tools?',
        a: 'Yes — purchase limits, session limits, cooling-off periods, and self-exclusion are all available from your account settings.',
      },
    ],
  },
]

export default function FaqPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
      <header>
        <h1 className="cf-headline cf-gold-text text-4xl font-extrabold uppercase tracking-wide sm:text-5xl">
          Frequently Asked Questions
        </h1>
        <p className="mt-3 text-sm text-[var(--cf-gray-light)]">
          Answers to the most common questions about playing, winning, and redeeming on Coin Frenzy.
        </p>
      </header>

      <div className="mt-10 space-y-10">
        {CATEGORIES.map((cat) => (
          <section key={cat.title}>
            <h2 className="cf-headline text-xl font-bold uppercase tracking-wider text-white">
              {cat.title}
            </h2>
            <div className="mt-3 space-y-2">
              {cat.faqs.map((f) => (
                <details
                  key={f.q}
                  className="group rounded-md border border-[var(--cf-border-default)] bg-[var(--cf-bg-card)] p-4 text-sm transition-colors open:border-[var(--cf-gold-medium)]"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-base font-semibold text-white">
                    {f.q}
                    <span className="grid h-6 w-6 place-items-center rounded-full border border-[var(--cf-border-default)] text-[var(--cf-gold-light)] transition-transform group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="mt-3 text-[var(--cf-gray-light)]">{f.a}</p>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
