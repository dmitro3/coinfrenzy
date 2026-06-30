# Runbook · Add a New Game

Add a new Alea-aggregated game to the catalog and surface it in the
player lobby. Game must already exist in Alea's catalog.

---

## Preconditions

- [ ] You have an admin role of `game_ops`, `manager`, or `master`.
- [ ] You know the game's:
  - Alea slug / external id
  - Display name
  - Provider (Alea sub-provider, e.g. "Pragmatic Play")
  - Category(ies) (e.g. "Slots", "Live Casino")
  - RTP %
  - Thumbnail URL (or you can upload one)

---

## Steps

### 1. Confirm the provider exists

Visit `/admin/casino/providers`.

- If the provider is listed, note the provider id.
- If not: click "+ New provider", fill in name + aggregator (typically
  "Alea"), save. Audit logged.

### 2. Create the game

Visit `/admin/casino/games` → "+ New game".

Fill in:

- **Name** — display name.
- **Provider** — pick from §1.
- **Aggregator** — Alea.
- **External id** — the Alea slug. Must match exactly; otherwise the
  iframe won't load.
- **Categories** — pick from existing categories. If a new category
  is needed, create it at `/admin/casino/aggregators` first.
- **RTP %** — informational; shown on game tile.
- **Thumbnail** — upload (saved to R2) or paste URL.
- **Status** — `active` to publish immediately, `draft` to stage.
- **GC enabled / SC enabled** — both default `true`.

Save. Audit logged. The game is now in the catalog.

### 3. Add to lobby rails

The lobby's rails come from `casino_sub_categories`. To feature the
new game on the lobby:

a. Visit `/admin/casino/sub-categories`.
b. Pick a rail (e.g. "New from Pragmatic"). Open it.
c. Click "+ Add games" → pick the new game (filterable by provider).
d. Drag to the desired position.
e. Save.

If you want it on multiple rails, repeat for each.

### 4. Optional: feature in lobby hero

`/admin/casino/lobby` → drag the game into the hero slot or the
"Featured" carousel.

### 5. Smoke test

- Open `/lobby` as a player.
- Confirm the game tile appears in the configured rail(s).
- Click the tile. The Alea iframe should load. If Alea reports
  "game not found", double-check the **External id** matches Alea's
  slug exactly (case sensitive).
- Place a small GC play through the game.
- Confirm a `game_sessions` row exists and `game_rounds` partition
  receives bet/win entries.
- Confirm the player's GC wallet updates.

### 6. Reconciliation will catch drift the next morning

The nightly `reconcileAleaNightly` job will compare Alea's report
against `game_rounds` for the new game. Any drift surfaces in
`/admin/integrity/alea`.

---

## If something goes wrong

| Symptom                                         | Fix                                                                                                                                          |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Game tile doesn't appear                        | Did you add it to a rail? Lobby cache TTL is short; refresh after 30 s.                                                                      |
| Iframe says "game not found"                    | External id mismatch. Edit the game and fix.                                                                                                 |
| Bet/win webhook lands but ledger doesn't update | Sentry will have the error. Likely a missing house account or RLS issue; ping Sentry's stack trace through the team channel.                 |
| Reconciliation drift on day 1                   | Likely a fixture mismatch. Re-check the External id; clear `alea_reconciliation_findings` for the game and let the next night's run confirm. |

---

## Done when

- [ ] Game exists in `/admin/casino/games`.
- [ ] Game appears on at least one lobby rail.
- [ ] A test play completes end-to-end (launch → bet → win → wallet
      update).
- [ ] No errors in Sentry for the launch route.
