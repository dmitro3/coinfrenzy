import Link from 'next/link'
import { sql } from 'drizzle-orm'

import { crm } from '@coinfrenzy/core'
import { PageContainer, PageHeader } from '@coinfrenzy/ui/admin/layout/PageHeader'
import { getDb } from '@coinfrenzy/db/client'

import { FlowBuilderWrapper } from '../_flow-builder'
import { RecipeGallery } from '../_recipe-gallery'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ recipe?: string }>
}

export default async function Page({ searchParams }: PageProps) {
  const { recipe: recipeSlug } = await searchParams
  const recipe = recipeSlug ? crm.findRecipe(recipeSlug) : undefined

  // Operator landed on /flows/new without picking anything yet — show
  // the recipe gallery so they can start from a known-good pattern.
  if (!recipeSlug) {
    return (
      <PageContainer>
        <PageHeader
          title="New flow"
          description="Pick a recipe to start from a known-good pattern, or start from scratch."
          breadcrumb={[
            { label: 'Admin', href: '/admin' },
            { label: 'CRM', href: '/admin/crm' },
            { label: 'Flows', href: '/admin/crm/flows' },
            { label: 'New' },
          ]}
          renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
        />
        <RecipeGallery recipes={crm.FLOW_RECIPES} />
      </PageContainer>
    )
  }

  const db = getDb()
  const emailTemplates = (await db.execute(sql`
    SELECT id, slug, display_name FROM email_templates WHERE is_current = true ORDER BY display_name
  `)) as unknown as Array<{ id: string; slug: string; display_name: string }>
  const smsTemplates = (await db.execute(sql`
    SELECT id, slug, display_name FROM sms_templates WHERE is_current = true ORDER BY display_name
  `)) as unknown as Array<{ id: string; slug: string; display_name: string }>

  const triggers = crm.getTriggerEvents()
  const triggerOptions = triggers.map((t) => t.name)

  // If the operator picked a recipe, seed the builder from it. Otherwise
  // start with a blank 3-step skeleton.
  const seeded = recipe
    ? crm.buildFlowRecipe(recipe)
    : {
        meta: {
          name: '',
          description: null,
          triggerEvent: triggerOptions[0] ?? 'player.signup',
          maxEnrollmentsPerPlayer: 1,
          cooldownHoursBetweenEnrollments: null,
          status: 'active' as const,
          conversionEvent: null,
        },
        steps: [
          { stepNumber: 1, actionType: 'trigger' as const, config: {}, waitDurationSeconds: null },
          {
            stepNumber: 2,
            actionType: 'send_email' as const,
            config: {},
            waitDurationSeconds: null,
          },
          { stepNumber: 3, actionType: 'end' as const, config: {}, waitDurationSeconds: null },
        ],
      }

  return (
    <PageContainer>
      <PageHeader
        title={recipe ? `New flow — ${recipe.name}` : 'New flow'}
        description={
          recipe
            ? recipe.useCase
            : "Drag, connect, and configure each step. Live enrollment counts appear once it's running."
        }
        breadcrumb={[
          { label: 'Admin', href: '/admin' },
          { label: 'CRM', href: '/admin/crm' },
          { label: 'Flows', href: '/admin/crm/flows' },
          { label: recipe ? recipe.name : 'New' },
        ]}
        renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      />
      <FlowBuilderWrapper
        initialMeta={seeded.meta}
        initialSteps={seeded.steps.map((s) => ({
          stepNumber: s.stepNumber,
          actionType: s.actionType,
          config: s.config as Record<string, unknown>,
          waitDurationSeconds: s.waitDurationSeconds,
        }))}
        triggerEventOptions={triggerOptions}
        emailTemplates={emailTemplates.map((t) => ({
          id: t.id,
          slug: t.slug,
          displayName: t.display_name,
        }))}
        smsTemplates={smsTemplates.map((t) => ({
          id: t.id,
          slug: t.slug,
          displayName: t.display_name,
        }))}
      />
    </PageContainer>
  )
}
