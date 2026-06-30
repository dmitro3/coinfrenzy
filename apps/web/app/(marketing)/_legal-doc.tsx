import type { ReactNode } from 'react'

// Shared wrapper for legal pages (Terms, Privacy, Sweepstakes Rules).
// Provides the page title, last-updated metadata, and the dark
// branded prose surface so each legal doc looks uniform.

interface LegalDocProps {
  title: string
  lastUpdated: string
  description?: string
  children: ReactNode
}

export function LegalDoc({ title, lastUpdated, description, children }: LegalDocProps) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <header>
        <h1 className="cf-headline cf-gold-text text-4xl font-extrabold uppercase tracking-wide sm:text-5xl">
          {title}
        </h1>
        <p className="mt-2 text-xs uppercase tracking-wider text-[var(--cf-gold-light)]">
          Last updated · {lastUpdated}
        </p>
        {description ? (
          <p className="mt-3 text-sm text-[var(--cf-gray-light)]">{description}</p>
        ) : null}
      </header>

      <article className="cf-legal-prose mt-8 space-y-6 text-sm leading-relaxed text-[var(--cf-gray-light)]">
        {children}
      </article>

      <p className="mt-10 rounded-md border border-dashed border-[var(--cf-gold-medium)]/50 bg-[var(--cf-gold-deep)]/10 p-4 text-xs text-[var(--cf-gold-light)]">
        Placeholder content. The final legal copy will be supplied by counsel before launch.
      </p>
    </div>
  )
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="cf-headline text-xl font-bold uppercase tracking-wider text-white">{title}</h2>
      <div className="mt-2 space-y-2">{children}</div>
    </section>
  )
}
