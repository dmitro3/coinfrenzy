# Runbook · Publish New Terms Version

How master publishes a new Terms of Service, Privacy Policy,
Sweepstakes Rules, or any other versioned legal document.

Versions are tracked in `terms_versions` (migration `0025`). Players
are nudged to accept on next login if `material_change = true`.

---

## Preconditions

- [ ] You have the `master` admin role.
- [ ] The legal team has approved the new text.
- [ ] You know whether this is a **material change** (forces
      re-acceptance by all players) or a **non-material change**
      (just updates the page; no re-acceptance prompt).

---

## Steps

### 1. Draft the new version

Visit `/admin/settings/terms` → pick the document (Terms / Privacy /
Sweepstakes Rules / etc.) → "+ New version".

Fill in:

- **Title** — auto-filled from doc type.
- **Body** — paste / write in the in-house markdown dialect
  (`## heading`, blank-line paragraphs, `-` lists, `**bold**`,
  `_italic_`, `[label](url)`). Live preview on the right.
- **Effective date** — when this version becomes the canonical one
  shown to players.
- **Material change** — boolean. **True** if the change requires
  re-acceptance.

Save as **Draft**. Audit logged.

### 2. Review the preview

Click "Preview" → renders the same way `/p/<slug>` will.

### 3. Publish

Click "Publish".

This:

1. Inserts the new row into `terms_versions`.
2. Updates the corresponding `site_content` row so `/p/<slug>` and
   `/terms` (or whichever public path) serve the new body.
3. If `material_change = true`, increments the active version number
   that `players.tos_accepted_version` (or `privacy_accepted_version`)
   is compared against.
4. Triggers a CRM event `legal.terms.published` (for the operator
   email log).

Audit logged.

### 4. Players see the banner (if material change)

Next time each player loads any authenticated page, the
`_terms-banner.tsx` component evaluates:

```ts
players.tos_accepted_version < latestTermsVersion?
```

If true, the banner asks the player to accept the new terms. Their
acceptance hits `/api/player/terms/accept` which updates the
`tos_accepted_version` + `tos_accepted_at` columns.

### 5. Confirm

- Visit `/terms` (or whichever public route) signed-out — should show
  the new body.
- Sign in as a test player — should see the acceptance banner (if
  material).
- Accept it — banner disappears; check the player row in DB has the
  new version recorded.

### 6. Communicate

For material changes:

- Post on the status page (informational).
- Trigger a CRM campaign (Email Center → one-off to the "all opted-in"
  segment, with a manager-override since this is
  compliance-mandated): "We've updated our Terms — please review."

---

## Reverting a published version

Only `master` can do this:

1. `/admin/settings/terms` → pick doc → previous version → "Reactivate
   this version".
2. The newer (rejected) version remains in history but is no longer
   the canonical one.
3. Audit logged.

This is an emergency operation; normal correction = publish a newer
version with the fix.

---

## Common pitfalls

- **Setting `material_change = true` for trivial typo fixes** spams
  every player with a banner. Don't.
- **Forgetting to publish** leaves the new draft invisible to players.
- **Markdown rendering issues**: only the in-house dialect parses;
  HTML or fancy markdown is stripped. Stick to the documented
  subset.

---

## Done when

- [ ] New version row exists in `terms_versions`.
- [ ] Public page renders the new body.
- [ ] (If material) players see the acceptance banner on next login.
- [ ] Audit row exists for `legal.terms.published`.
