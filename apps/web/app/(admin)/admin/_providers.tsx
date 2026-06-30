'use client'

import * as React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { TooltipProvider } from '@coinfrenzy/ui/primitives/tooltip'

import { RealtimeProvider } from './_realtime'

interface ProvidersProps {
  children: React.ReactNode
  admin: { id: string; email: string; displayName: string; role: string }
}

export function Providers({ children, admin }: ProvidersProps) {
  const [client] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: true,
            refetchOnReconnect: true,
            retry: 1,
          },
        },
      }),
  )

  React.useEffect(() => {
    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    return () => {
      document.documentElement.style.overflow = ''
      document.body.style.overflow = ''
    }
  }, [])

  return (
    <QueryClientProvider client={client}>
      <TooltipProvider delayDuration={200}>
        <RealtimeProvider adminId={admin.id}>{children}</RealtimeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  )
}
