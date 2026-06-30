import Link from 'next/link'
import { ArrowRight, FilePlus2, Mail, Sparkles, Workflow } from 'lucide-react'

import type { FlowRecipe } from '@coinfrenzy/core/crm'
import { Card, CardContent } from '@coinfrenzy/ui/primitives/card'
import { Button } from '@coinfrenzy/ui/primitives/button'

// docs/11 §5.4 — recipe gallery for the New Flow page. Server component;
// the cards link to /flows/new?recipe=<slug> to re-render with the recipe
// pre-applied.

const CATEGORY_META: Record<FlowRecipe['category'], { label: string; tone: string }> = {
  onboarding: { label: 'Onboarding', tone: 'bg-emerald-500/10 text-emerald-300' },
  commerce: { label: 'Commerce', tone: 'bg-sky-500/10 text-sky-300' },
  retention: { label: 'Retention', tone: 'bg-violet-500/10 text-violet-300' },
  vip: { label: 'VIP', tone: 'bg-amber-500/10 text-amber-300' },
  compliance: { label: 'Compliance', tone: 'bg-rose-500/10 text-rose-300' },
}

interface Props {
  recipes: FlowRecipe[]
}

export function RecipeGallery({ recipes }: Props) {
  const grouped = new Map<FlowRecipe['category'], FlowRecipe[]>()
  for (const r of recipes) {
    const arr = grouped.get(r.category) ?? []
    arr.push(r)
    grouped.set(r.category, arr)
  }
  const orderedCats: Array<FlowRecipe['category']> = [
    'onboarding',
    'commerce',
    'retention',
    'vip',
    'compliance',
  ]

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex items-center justify-between gap-4 p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-surface-elevated text-violet-300">
              <Sparkles className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-ink-primary">Start from a recipe</h3>
              <p className="text-xs text-ink-tertiary">
                Pre-built flows. Pick one, tweak the templates, hit save. Each recipe is imported in{' '}
                <span className="text-ink-secondary">paused</span> state so you can review before
                activating.
              </p>
            </div>
          </div>
          <Button asChild variant="outline">
            <Link href="/admin/crm/flows/new?recipe=blank" className="flex items-center gap-2">
              <FilePlus2 className="h-4 w-4" />
              Start blank
            </Link>
          </Button>
        </CardContent>
      </Card>

      {orderedCats
        .filter((c) => grouped.has(c))
        .map((cat) => {
          const list = grouped.get(cat) ?? []
          const meta = CATEGORY_META[cat]
          return (
            <Card key={cat}>
              <CardContent className="p-0">
                <div className="flex items-center justify-between border-b border-line-subtle px-4 py-3">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-primary">
                    {meta.label}
                  </h3>
                  <span className="text-xs text-ink-tertiary">{list.length}</span>
                </div>
                <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
                  {list.map((recipe) => {
                    const sendSteps = recipe.steps.filter(
                      (s) => s.actionType === 'send_email' || s.actionType === 'send_sms',
                    ).length
                    return (
                      <Link
                        key={recipe.slug}
                        href={`/admin/crm/flows/new?recipe=${recipe.slug}`}
                        className="group flex flex-col gap-2 rounded-lg border border-line-subtle bg-surface p-4 transition hover:border-accent/40 hover:bg-surface-hover"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h4 className="text-sm font-semibold text-ink-primary group-hover:text-accent">
                              {recipe.name}
                            </h4>
                            <p className="mt-1 line-clamp-2 text-xs text-ink-secondary">
                              {recipe.description}
                            </p>
                          </div>
                          <span
                            className={
                              'shrink-0 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ' +
                              meta.tone
                            }
                          >
                            {meta.label}
                          </span>
                        </div>

                        <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                          <Stat icon={<Workflow className="h-3 w-3" />} label="Steps">
                            {recipe.steps.length}
                          </Stat>
                          <Stat icon={<Mail className="h-3 w-3" />} label="Sends">
                            {sendSteps}
                          </Stat>
                          <Stat label="Trigger">
                            <code className="text-[10px]">
                              {recipe.triggerEvent.split('.').slice(-2).join('.')}
                            </code>
                          </Stat>
                        </div>

                        <p className="mt-2 text-[11px] italic text-ink-tertiary">
                          {recipe.useCase}
                        </p>

                        <div className="mt-2 flex items-center gap-1 text-xs text-accent">
                          Use this recipe <ArrowRight className="h-3 w-3" />
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )
        })}
    </div>
  )
}

function Stat({
  label,
  children,
  icon,
}: {
  label: string
  children: React.ReactNode
  icon?: React.ReactNode
}) {
  return (
    <div className="rounded border border-line-subtle/40 bg-surface-elevated/40 px-2 py-1">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-ink-tertiary">
        {icon}
        {label}
      </div>
      <div className="text-xs font-medium text-ink-primary">{children}</div>
    </div>
  )
}
