import { LegalDoc, LegalSection } from '../_legal-doc'

export const metadata = {
  title: 'Privacy Policy | Coin Frenzy',
}

export default function PrivacyPage() {
  return (
    <LegalDoc
      title="Privacy Policy"
      lastUpdated="Placeholder · TBD"
      description="How we collect, use, and protect your information."
    >
      <LegalSection title="What We Collect">
        <p>
          Account information (email, name, state, date of birth), play activity, device
          information, and identity verification data via Footprint.
        </p>
      </LegalSection>
      <LegalSection title="How We Use It">
        <p>
          To operate the site, verify your identity, prevent fraud, comply with sweepstakes law, and
          process redemptions.
        </p>
      </LegalSection>
      <LegalSection title="Your Rights">
        <p>
          You may request a copy of your data or deletion at any time. Some records (audit log,
          ledger) are preserved indefinitely for regulatory reasons; we anonymize personally
          identifying fields on deletion request.
        </p>
      </LegalSection>
    </LegalDoc>
  )
}
