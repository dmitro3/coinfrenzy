'use client'

import { useState } from 'react'

interface Props {
  sessionId: string
  gameId: string
  token: string
  currency: 'GC' | 'SC'
  returnUrl: string
}

interface RoundResult {
  roundId: string
  betCents: number
  winCents: number
  net: number
}

const BET_PRESETS = [100, 500, 1_000, 5_000]

export default function AleaPlayClient({ sessionId, gameId, token, currency, returnUrl }: Props) {
  const [betCents, setBetCents] = useState(100)
  const [spinning, setSpinning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<RoundResult[]>([])
  const [winRateBps, setWinRateBps] = useState(5_000) // 50% by default

  const handleSpin = async () => {
    setSpinning(true)
    setError(null)
    try {
      const res = await fetch('/api/mock-vendors/alea/fire-round', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          gameId,
          token,
          currency,
          betCents,
          winRateBps,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const data = (await res.json()) as { roundId: string; winCents: number }
      setHistory((prev) =>
        [
          {
            roundId: data.roundId,
            betCents,
            winCents: data.winCents,
            net: data.winCents - betCents,
          },
          ...prev,
        ].slice(0, 10),
      )
      // Bridge for the in-app iframe host: the parent shell listens for
      // this message and triggers a server refetch + balance-bar refresh.
      // Pusher would do this in production; the postMessage path is the
      // dev-mode fallback when Pusher credentials aren't configured.
      try {
        window.parent?.postMessage(
          { type: 'coinfrenzy:wallet-changed', source: 'mock-alea', roundId: data.roundId },
          window.location.origin,
        )
      } catch {
        // ignore — top-level / cross-origin frames just won't be notified
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSpinning(false)
    }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Mock Alea game ({gameId})</h1>
        <p className="text-sm text-slate-600">
          Session <code className="font-mono">{sessionId}</code> · Currency{' '}
          <span className="font-semibold">{currency}</span>
        </p>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <div className="grid h-48 place-items-center rounded bg-gradient-to-br from-violet-500 to-blue-600 text-white">
          <div className="text-center">
            <div className="text-sm uppercase tracking-wide opacity-80">{currency} Bet</div>
            <div className="text-4xl font-bold">{(betCents / 100).toFixed(2)}</div>
            {history[0] ? (
              <div className="mt-2 text-lg">
                Last spin: {history[0].winCents > 0 ? '🎉 ' : '·'}
                <span className="font-mono">
                  {history[0].net >= 0 ? '+' : ''}
                  {(history[0].net / 100).toFixed(2)}
                </span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-4 gap-2">
          {BET_PRESETS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setBetCents(value)}
              className={`rounded border px-3 py-2 text-sm font-medium ${
                betCents === value
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {(value / 100).toFixed(2)}
            </button>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <label className="text-xs uppercase text-slate-500">Win probability (bps)</label>
          <input
            type="number"
            min={0}
            max={10_000}
            value={winRateBps}
            onChange={(e) => setWinRateBps(Number(e.target.value))}
            className="w-24 rounded border border-slate-200 px-2 py-1 text-sm"
          />
        </div>

        {error ? (
          <div className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="mt-6 flex justify-between gap-3">
          <a
            href={returnUrl}
            className="rounded border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Exit
          </a>
          <button
            type="button"
            onClick={handleSpin}
            disabled={spinning}
            className="rounded bg-violet-600 px-6 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60"
          >
            {spinning ? 'Spinning…' : 'Spin'}
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold uppercase text-slate-500">Round history</h2>
        {history.length === 0 ? (
          <div className="text-sm text-slate-500">No rounds yet.</div>
        ) : (
          <ul className="space-y-1 font-mono text-xs">
            {history.map((round) => (
              <li key={round.roundId} className="flex justify-between">
                <span>{round.roundId.slice(0, 16)}…</span>
                <span>
                  bet {(round.betCents / 100).toFixed(2)} · win {(round.winCents / 100).toFixed(2)}{' '}
                  · net{' '}
                  <span className={round.net >= 0 ? 'text-green-700' : 'text-red-700'}>
                    {round.net >= 0 ? '+' : ''}
                    {(round.net / 100).toFixed(2)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
