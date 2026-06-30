import { LegalDoc, LegalSection } from '../_legal-doc'

export const metadata = {
  title: 'Sweepstakes Rules | Coin Frenzy',
}

export default function SweepstakesRulesPage() {
  return (
    <LegalDoc
      title="Sweepstakes Rules"
      lastUpdated="Placeholder · TBD"
      description="The official rules that govern Coin Frenzy sweepstakes play."
    >
      <LegalSection title="No Purchase Necessary">
        <p>
          Sweepstakes Coins (SC) can always be obtained without a purchase. See the{' '}
          <a className="text-[var(--cf-gold-light)] underline" href="/amoe">
            Free Entry (AMOE)
          </a>{' '}
          page for the free entry method.
        </p>
      </LegalSection>
      <LegalSection title="Eligibility">
        <p>
          Open to legal residents of the 50 United States who are 18 years of age or older,
          excluding the states listed under <em>Excluded states</em>.
        </p>
      </LegalSection>
      <LegalSection title="Excluded States">
        <p>
          California, Connecticut, Idaho, Louisiana, Michigan, Montana, Nevada, New Jersey, New
          York, Tennessee, Washington.
        </p>
      </LegalSection>
      <LegalSection title="Prize Redemption">
        <p>
          Eligible players may redeem SC for cash prizes via ACH or APT Debit. Identity verification
          (Level 2) and any applicable playthrough must be complete.
        </p>
      </LegalSection>
    </LegalDoc>
  )
}
