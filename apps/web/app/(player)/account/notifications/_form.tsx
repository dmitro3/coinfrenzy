'use client'

import * as React from 'react'

import { cn } from '@coinfrenzy/ui/lib/utils'
import { useToast } from '@coinfrenzy/ui/player'

// Marketing preferences form. The live coinfrenzy.com Preferences tab
// has three toggles (Receive Email offers / Receive SMS offers /
// Enable Incognito Mode) plus a gold Save button. We mirror that
// exactly. The persistence endpoint lands in a follow-up prompt; for
// now we just animate the optimistic state so the page feels alive.

interface ToggleDef {
  id: 'email' | 'sms' | 'incognito'
  label: string
  initial: boolean
}

const TOGGLES: ToggleDef[] = [
  { id: 'email', label: 'Receive Email offers from us', initial: true },
  { id: 'sms', label: 'Receive SMS offers from us', initial: true },
  { id: 'incognito', label: 'Enable Incognito Mode', initial: false },
]

export function PreferencesForm() {
  const [values, setValues] = React.useState<Record<ToggleDef['id'], boolean>>({
    email: TOGGLES[0].initial,
    sms: TOGGLES[1].initial,
    incognito: TOGGLES[2].initial,
  })
  const [dirty, setDirty] = React.useState(false)
  const [status, setStatus] = React.useState<'idle' | 'saving' | 'saved'>('idle')
  const toast = useToast()

  function update(id: ToggleDef['id'], next: boolean) {
    setValues((prev) => ({ ...prev, [id]: next }))
    setDirty(true)
    setStatus('idle')
  }

  async function onSave() {
    setStatus('saving')
    // Persistence endpoint is wired in a follow-up. Fake a tiny delay
    // so the button doesn't flash instantly.
    await new Promise((r) => setTimeout(r, 600))
    setDirty(false)
    setStatus('saved')
    toast.success('Your preferences have been updated.', { title: 'Saved' })
    setTimeout(() => setStatus('idle'), 2500)
  }

  return (
    <div className="space-y-4">
      <header>
        <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-white">Marketing</h3>
      </header>

      <ul className="space-y-2">
        {TOGGLES.map((t) => (
          <li
            key={t.id}
            className="flex items-center justify-between gap-3 rounded-md border border-[var(--cf-border-default)]/60 bg-[var(--cf-bg-base)]/50 px-3 py-3 transition-colors duration-150 hover:border-[var(--cf-gold-medium)]/40"
          >
            <span className="text-sm text-white">{t.label}</span>
            <Switch
              checked={values[t.id]}
              onChange={(next) => update(t.id, next)}
              label={t.label}
            />
          </li>
        ))}
      </ul>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--cf-border-default)]/50 pt-4">
        <p className="text-xs text-[var(--cf-gray-light)]">
          Please allow up to 30 seconds for the update to complete
        </p>
        <button
          type="button"
          onClick={onSave}
          disabled={!dirty || status === 'saving'}
          className={cn(
            'cf-gold-gradient inline-flex h-9 items-center justify-center rounded-md px-5',
            'text-sm font-extrabold uppercase tracking-[0.16em] text-[#1a1300]',
            'transition-all duration-200',
            !dirty || status === 'saving'
              ? 'cursor-not-allowed opacity-50'
              : 'hover:-translate-y-0.5 hover:shadow-[0_8px_22px_-8px_rgba(245,208,102,0.55)]',
          )}
        >
          {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved ✓' : 'Save'}
        </button>
      </div>
    </div>
  )
}

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 items-center rounded-full border transition-colors duration-200',
        checked
          ? 'border-[var(--cf-gold-medium)] bg-gradient-to-b from-[var(--cf-gold-light)] to-[var(--cf-gold-medium)] shadow-[inset_0_1px_0_rgba(255,245,200,0.35),0_0_12px_-4px_rgba(245,208,102,0.6)]'
          : 'border-[var(--cf-border-default)] bg-[var(--cf-bg-elevated)]',
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200',
          checked
            ? 'translate-x-6 shadow-[0_1px_3px_rgba(0,0,0,0.5)]'
            : 'translate-x-1 shadow-[0_1px_2px_rgba(0,0,0,0.4)]',
        )}
      />
    </button>
  )
}
