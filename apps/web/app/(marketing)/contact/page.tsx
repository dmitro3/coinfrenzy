import { Mail, MessageCircle, Send } from 'lucide-react'

import { FoxIllustration, GoldButton } from '@coinfrenzy/ui/player'

export const metadata = {
  title: 'Contact | Coin Frenzy',
}

// docs/10 §3 — public Contact page. Lists the support email and the
// in-app live chat entry point. The contact form is intentionally
// a simple mailto link until we wire up Help Scout/Zendesk.

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
      <header className="grid items-center gap-10 md:grid-cols-[1.4fr_1fr]">
        <div>
          <h1 className="cf-headline cf-gold-text text-4xl font-extrabold uppercase tracking-wide sm:text-5xl">
            Contact Support
          </h1>
          <p className="mt-3 text-base text-white">
            Our team replies to most messages within 24 hours, 7 days a week.
          </p>
        </div>
        <div className="hidden justify-center md:flex">
          <FoxIllustration variant="standing" width={220} height={260} className="h-64 w-auto" />
        </div>
      </header>

      <div className="mt-10 grid gap-4 md:grid-cols-3">
        <Card
          icon={<Mail className="h-5 w-5" />}
          title="Email"
          description="Best for redemption questions or account-specific issues."
          actionLabel="support@coinfrenzy.com"
          actionHref="mailto:support@coinfrenzy.com"
        />
        <Card
          icon={<MessageCircle className="h-5 w-5" />}
          title="Live Chat"
          description="Available after login from anywhere in the app."
          actionLabel="Open Live Support"
          actionHref="/live-support"
        />
        <Card
          icon={<Send className="h-5 w-5" />}
          title="Mailing Address"
          description="For AMOE entries and legal notices."
          actionLabel="Free Entry (AMOE)"
          actionHref="/amoe"
        />
      </div>

      <section className="mt-10 rounded-lg border border-[var(--cf-border-default)] bg-[var(--cf-bg-card)] p-6">
        <h2 className="cf-headline text-xl font-bold uppercase tracking-wider text-white">
          Need help right now?
        </h2>
        <p className="mt-2 text-sm text-[var(--cf-gray-light)]">
          Log in and tap <span className="font-bold text-white">Live Support</span> in the sidebar
          to start a chat with our team.
        </p>
        <div className="mt-4">
          <GoldButton href="/login" size="md">
            Log In to Start Chat
          </GoldButton>
        </div>
      </section>
    </div>
  )
}

function Card({
  icon,
  title,
  description,
  actionLabel,
  actionHref,
}: {
  icon: React.ReactNode
  title: string
  description: string
  actionLabel: string
  actionHref: string
}) {
  return (
    <div className="rounded-lg border border-[var(--cf-border-default)] bg-[var(--cf-bg-card)] p-5">
      <div className="flex items-center gap-2 text-[var(--cf-gold-light)]">
        {icon}
        <span className="cf-headline text-base font-bold uppercase tracking-wider text-white">
          {title}
        </span>
      </div>
      <p className="mt-2 text-sm text-[var(--cf-gray-light)]">{description}</p>
      <a
        href={actionHref}
        className="mt-3 inline-flex items-center text-sm font-semibold text-[var(--cf-gold-light)] hover:underline"
      >
        {actionLabel} →
      </a>
    </div>
  )
}
