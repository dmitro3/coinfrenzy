import { LegalDoc, LegalSection } from '../_legal-doc'

export const metadata = {
  title: 'Terms of Service | Coin Frenzy',
}

export default function TermsPage() {
  return (
    <LegalDoc
      title="Terms of Service"
      lastUpdated="Placeholder · TBD"
      description="The terms that govern your use of Coin Frenzy."
    >
      <LegalSection title="1. Acceptance">
        <p>
          By using Coin Frenzy you agree to these terms. If you do not agree, do not use the site.
        </p>
      </LegalSection>
      <LegalSection title="2. Eligibility">
        <p>
          You must be 18 or older and a resident of an eligible US state. See the Sweepstakes Rules
          for the current list.
        </p>
      </LegalSection>
      <LegalSection title="3. Currencies">
        <p>
          Gold Coins have no monetary value. Sweepstakes Coins may be redeemed per the Sweepstakes
          Rules. No purchase necessary.
        </p>
      </LegalSection>
      <LegalSection title="4. Account Responsibility">
        <p>
          You are responsible for safeguarding your account credentials and all activity on your
          account.
        </p>
      </LegalSection>
    </LegalDoc>
  )
}
