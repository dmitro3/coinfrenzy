'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

import { AssignmentModal, type HostOption } from '@coinfrenzy/ui/admin'
import { Button } from '@coinfrenzy/ui/primitives/button'

interface VipReassignButtonProps {
  playerId: string
  currentHostId: string | null
  hosts: HostOption[]
}

export function VipReassignButton({ playerId, currentHostId, hosts }: VipReassignButtonProps) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const filtered = hosts.filter((h) => h.id !== currentHostId)

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {currentHostId ? 'Reassign host' : 'Assign host'}
      </Button>
      <AssignmentModal
        open={open}
        onOpenChange={setOpen}
        playerIds={[playerId]}
        hosts={filtered}
        onAssigned={() => router.refresh()}
      />
    </>
  )
}
