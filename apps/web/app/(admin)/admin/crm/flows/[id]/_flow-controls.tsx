'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

import { Button } from '@coinfrenzy/ui/primitives/button'

interface Props {
  flowId: string
  status: string
}

export function FlowControls({ flowId, status }: Props) {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)

  async function toggle(): Promise<void> {
    setBusy(true)
    try {
      const path = status === 'active' ? 'pause' : 'resume'
      const res = await fetch(`/api/admin/crm/flows/${flowId}/${path}`, { method: 'POST' })
      if (res.ok) router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        onClick={toggle}
        disabled={busy}
        variant={status === 'active' ? 'outline' : 'default'}
      >
        {busy ? 'Working…' : status === 'active' ? 'Pause' : 'Resume'}
      </Button>
    </div>
  )
}
