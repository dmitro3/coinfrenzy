import { Construction } from 'lucide-react'

import { EmptyState } from '../display/EmptyState'

interface StubPageProps {
  title: string
  comingIn?: string
  description?: string
}

/** Placeholder shown for sidebar sections not yet implemented. */
export function StubPage({ title, description }: StubPageProps) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-8">
      <EmptyState
        icon={<Construction />}
        title={title}
        description={
          description ??
          'This section is part of the CoinFrenzy build plan. The route exists today so navigation can be exercised end-to-end.'
        }
      />
    </div>
  )
}
