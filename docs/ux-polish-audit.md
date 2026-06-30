# CoinFrenzy UX Polish Audit (vs Rips by Triumph standard)

Audit performed: 2026-05-15
Scope: every player-facing surface (auth, shell, lobby, game launch, cashier, account, promotions, marketing, bonus moments). Admin surfaces intentionally excluded.

The bar set by _Rips by Triumph_ is: **anticipation → reveal**, **one hero element per screen**, **high velocity**, **rich feedback**, **physics-feeling motion**, **dark canvas with a bright focal point**. CoinFrenzy already has the right canvas and visual language — the gap is in the _moments_: nothing in the player surface currently celebrates a win, count-up a balance, or treats a game launch as an event. This document is the prioritised plan to close that gap without slowing down velocity or descending into animation-for-animation’s-sake.

---

## Executive summary

| Metric                                         | Count                               |
| ---------------------------------------------- | ----------------------------------- |
| Surfaces audited                               | 38 routes / 24 player-UI components |
| Distinct interactions evaluated                | ~62                                 |
| 🔴 Critical UX gaps                            | **6**                               |
| 🟠 High-impact polish opportunities            | **9**                               |
| 🟡 Nice-to-have refinements                    | **7**                               |
| 🟢 Already at standard (no change recommended) | **10**                              |

### What's already at standard (don't touch)

Sidebar active-row sheen + bar pulse · Sidebar SHOP coin-pile breathe + hover lift · CoinFrenzy logo halo + twinkling sparkles · Top-bar lightning-bolt pulse + falling sparks · Top-bar SHOP button coin-pour · Live Wins ticker with JS-driven weighted cadence · Toast system entrance + auto-dismiss · `CoinClickPop` global gold-coin burst easter egg · Branded fox empty states on favorites/recent-games · Inline Finix checkout living _inside_ the Shop modal.

### What's broken or missing (the 🔴 list)

1. **No big-win reveal** — winning is silent at the chrome level. For a casino, this is THE moment.
2. **No balance count-up** — `BalancePill` swaps the number with zero acknowledgment when realtime fires.
3. **No claim/purchase celebration** — bonus claim and purchase success close with a toast only.
4. **Game launch is silent** — tile is a plain `Link`; nothing acknowledges the tap, no opening animation, no skeleton while the iframe loads.
5. **Top-bar search is dead** — `onOpenSearch` is never wired in the shell. The button does nothing.
6. **Player-section error boundaries missing** — no `error.tsx` / `not-found.tsx`; broken links and runtime errors fall through to Next’s default screens.

---

## Recommendations by impact (top 20)

### 1. Big-Win Reveal overlay (🔴 critical)

- **Current state:** When a slot win lands, the `_realtime` provider receives a `balance-update` Pusher event, swaps the wallet array, and React Query invalidates. The number in `BalancePill` changes silently. The Live Wins ticker may show _someone else's_ win nearby, but the player's own win has no in-app moment.
- **Rips equivalent:** Rips wraps a win in a **full-screen anticipation-then-payoff**: dim everything, spotlight the centre, count up the amount with a coin shower, ~1.5–2s total, dismiss on tap.
- **Gap:** A casino without a win moment doesn't feel like a casino. This is the single biggest UX delta.
- **Recommended fix:** Add `BigWinReveal` overlay. Hooked into `_realtime.tsx`: detect a positive delta where `delta >= win_threshold` (default 5 SC / 1,000 GC), open a centred dim overlay with the amount tickering up + gold-coin shower + brand wordmark fade. Three tiers visually: _Win_ (<25 SC), _Big Win_ (25–100), _Mega Win_ (100+) — taller particle stacks at higher tiers. Auto-dismiss after 2.2s OR on tap. Suppress while a game iframe is fullscreen so the game's own celebrations aren't fought.
- **Effort:** **M**
- **Dependencies:** `canvas-confetti` (highly recommended — 6kb, particle quality matters here)

### 2. Animated balance count-up (🔴 critical)

- **Current state:** `BalancePill.tsx` renders `{balance}` as a plain string. When realtime pushes a new wallet, the text flips instantly. There is no signal that anything happened.
- **Rips equivalent:** Every numeric value tickers up with a brief gold flash. The whole UI feels _alive_ because numbers move.
- **Gap:** This is the cheapest possible thing that makes the entire UI feel premium. Currently we're paying zero of the dividend.
- **Recommended fix:** Wrap `balance` in a `<TickerNumber>` primitive that takes `value: bigint` and animates over 600ms using `requestAnimationFrame` (easeOutCubic). On change, add `cf-balance-flash` for 600ms — a quick gold tint of the number + a 1px upward nudge. ~40 LOC, zero deps. Reuse the same `<TickerNumber>` inside the Big Win overlay and on the redemption summary.
- **Effort:** **S**
- **Dependencies:** None

### 3. Claim & purchase celebration moment (🔴 critical)

- **Current state:** `RewardsPopover` calls `toast.success("Bonus successfully claimed")` then `onClose()`. `BuyCoinsPanel` calls `toast.success("Purchase successful")` then `close()`. The Shop modal closes immediately after card capture — there's no moment between paying and being back at the lobby.
- **Rips equivalent:** Anything labelled “success” in Rips earns a 1–1.5s celebration. The user paid us — that moment is sacred.
- **Gap:** The user just gave us $25; we should not be silent for 200ms before vanishing.
- **Recommended fix:** Reuse the same `BigWinReveal` component (recommendation #1) with a smaller envelope. After `toast.success`, fire `revealCoinShower({ amount: pkg.goldCoins, currency: 'GC', tier: 'small' })` for ~1.0s, then close the modal. For daily bonus: same component, render the GC + SC amounts on two lines with the crown icon. Confetti density scales with package size.
- **Effort:** **S** (once #1 is built — this is a thin wrapper)
- **Dependencies:** Inherits from #1

### 4. Game-tile tap → opening ceremony (🔴 critical)

- **Current state:** `GameTile.tsx` is a `next/link` with `group-hover:scale-[1.04]` on the image (300ms). On tap, Next does a hard route change. The tile vanishes, blank space, then the game iframe page renders. No bridge animation.
- **Rips equivalent:** Tap → immediate scale-up + glow + sound, screen darkens around it, the tile _becomes_ the game canvas. Zero ambiguity that something is happening.
- **Gap:** The silence between tap and game render is the worst-feeling 300ms in the app.
- **Recommended fix:** On `pointerdown`, capture the tile’s rect, render a `GameLaunchTransition` portal that animates the tile’s artwork from rect-A to viewport-centre at 16:9 over 280ms (cubic-bezier 0.2, 0.8, 0.2, 1), with a gold ring sweep around it. _Then_ trigger navigation. On the destination `[gameId]` page, an entrance fade reveals the iframe inside the same rect. Suppress `CoinClickPop` on tiles (add `data-no-coin-pop="true"`) so we don't double-up.
- **Effort:** **M**
- **Dependencies:** None (CSS transforms + portal + small JS measurement); optional `framer-motion` simplifies the rect-to-rect choreography but a hand-rolled `transform` works.

### 5. Spotlight search (🔴 critical)

- **Current state:** `PlayerTopBar` has a search button; `_shell.tsx` does not pass `onOpenSearch`; the button is **dead**. Catalog search currently only exists as a GET form on `/casino-games?q=...` (full page navigation).
- **Rips equivalent:** Press `/` or tap the search icon → centred Spotlight overlay with instant filtering across games + categories + actions ("Open Shop", "Claim Daily Bonus", "Go to Account"). Cursor-keyboard nav, Enter to fire.
- **Gap:** Discovery velocity is one tap-and-a-page-load too slow.
- **Recommended fix:** Build `<SearchSpotlight>` that renders on `Cmd/Ctrl+K` and on the topbar button. Index the games catalog client-side (already ships with the shell), include named actions, fuzzy-match. Use the same dim-backdrop pattern as Shop modal. Recent searches in localStorage. Esc to close. On Enter, fire `GameLaunchTransition` (recommendation #4) so search → game still gets the ceremony.
- **Effort:** **M**
- **Dependencies:** Optional `fuse.js` (fuzzy match) — ~7kb. Can also use a hand-rolled token match.

### 6. Player error boundaries (🔴 critical)

- **Current state:** No `error.tsx` or `not-found.tsx` anywhere under `apps/web/app/(player)`. Broken routes hit Next’s default white pages.
- **Rips equivalent:** Every error is a branded, calm message with a clear next step ("Take me back to the lobby").
- **Gap:** A 500 in production right now shows Next's stark page — feels like a non-CoinFrenzy site appeared.
- **Recommended fix:** Add `app/(player)/error.tsx` (client component, accepts `reset()`) with a fox illustration, "Something went wrong", and Reload / Lobby buttons. Add `app/(player)/not-found.tsx` with the same chrome. Repeat for `app/(marketing)`. Re-uses the existing `FoxIllustration` and `cf-account-card` classes.
- **Effort:** **S**
- **Dependencies:** None

### 7. Loading skeletons for lobby + casino-games (🟠 high)

- **Current state:** No `loading.tsx` files under `app/(player)`. Lobby renders blank-then-instant during the RSC fetch; Live Wins is the only surface with a skeleton.
- **Rips equivalent:** Every list slot has a shimmering placeholder of the right size and shape. Layout never reflows.
- **Gap:** First-load lobby feels unsettled.
- **Recommended fix:** `app/(player)/lobby/loading.tsx` with a hero strip + three rails of 6 skeleton tiles (gold-tinted gradient on dark bg, sheen sweep). Same for `casino-games/loading.tsx`. Tiles use the existing `Skeleton` primitive plus a `cf-skeleton-sheen` keyframe. Re-export across favorites + recent-games.
- **Effort:** **S**
- **Dependencies:** None

### 8. Auth modal entrance + form spring (🟠 high)

- **Current state:** `AuthModal.tsx` is a fixed card; login/signup pages have `Suspense fallback={null}`. The card just appears.
- **Rips equivalent:** Modal scales in from 0.96 with a spring; the fox slides in from the right; the form fields cascade-fade from 8px below.
- **Gap:** Sign-up is the first impression — currently it's a static dialog.
- **Recommended fix:** Wrap the modal in a `cf-modal-spring-in` keyframe (240ms, cubic-bezier 0.22, 1.36, 0.32, 1 — slight overshoot for spring feel). Apply `cf-fade-up` with staggered `--cf-fade-delay` per field (50ms increments). On submit, the gold button gets a brief pulse (scale 1 → 0.97 → 1) instead of just dimming. ~30 LOC of CSS, no JS.
- **Effort:** **S**
- **Dependencies:** None

### 9. View-transition between sidebar nav routes (🟠 high)

- **Current state:** Sidebar `Link`s trigger Next.js hard route changes; main content flashes white-grey during navigation.
- **Rips equivalent:** Tab-style swap; old content fades out as new content fades in; persistent chrome never blinks.
- **Gap:** Navigation feels noisier than the chrome it lives inside.
- **Recommended fix:** Two-part plan: (a) Add the `unstable_ViewTransition` flag (Next.js 15) wrapping `<main>` in `_shell.tsx` — enables CSS view transitions on supported browsers (Chrome / Edge / Safari TP). (b) For browsers without support, use a CSS-only `cf-route-fade` class triggered by `usePathname()` change in the `<main>` element — 160ms cross-fade. Net effect: feels like a tab swap, falls back gracefully.
- **Effort:** **S/M**
- **Dependencies:** None (uses the native View Transitions API)

### 10. Category tab swap as instant client filter (🟠 high)

- **Current state:** `CategoryTabs` are `Link`s that trigger a full server navigation per category change.
- **Rips equivalent:** Tab swap is instant — content morphs in place with a 120ms cross-fade and the tab indicator slides.
- **Gap:** Category browsing feels heavier than it should.
- **Recommended fix:** Convert `casino-games/page.tsx` to a thin server wrapper that ships the full filtered catalog to a client component, which filters in-memory on category change. The tab indicator slides via a single absolutely-positioned `cf-tab-indicator` element with `transform: translateX(...)`. Grid items use FLIP layout (measure rects, animate to new positions over 200ms). Lobby rails stay server-rendered.
- **Effort:** **M**
- **Dependencies:** None for the basic version; `framer-motion`'s `<AnimatePresence>` + `layout` makes FLIP trivial if we add it.

### 11. `BalancePill` dropdown polish + currency swap haptic (🟠 high)

- **Current state:** Dropdown shows the other currency’s amount; currency swap fires `router.refresh()` (full re-fetch). The pill itself is great.
- **Rips equivalent:** Currency swap is a 180ms morph between the two values, with a tactile "ka-chunk" feel — gold ring around the pill briefly, optional haptic on mobile.
- **Gap:** The most-used widget on the site is silent during its core action.
- **Recommended fix:** When `selectCurrency` runs, before `router.refresh()`, animate the pill: `transform: rotateY(0deg → 180deg)` (180ms) with the number flipping mid-rotation. Mobile: `navigator.vibrate(10)` if user setting allows. Add a tiny "GC" / "SC" badge crossfade.
- **Effort:** **S**
- **Dependencies:** None

### 12. Notification form: real persistence + saved checkmark animation (🟠 high)

- **Current state:** `account/notifications/_form.tsx` fakes a 600ms delay then toasts "Saved". There is **no real persistence endpoint** wired.
- **Rips equivalent:** Toggle a switch — it physically settles into position with overshoot, micro-haptic; save button pulses gold, gold checkmark draws itself across the button face for 400ms before reverting to "Save".
- **Gap:** The user gets a celebration for fake work right now. Real save first, then make the celebration meaningful.
- **Recommended fix:** (a) Build `POST /api/player/preferences` updating `players.metadata.preferences`. (b) Replace the fake delay. (c) Add `cf-saved-check` keyframe — SVG path-length animation across the button. Same component reusable on password form + responsible gaming saves.
- **Effort:** **M**
- **Dependencies:** None

### 13. Game-tile hover preview (🟠 high)

- **Current state:** Hover scales the image to 1.04 over 300ms. Nothing else changes.
- **Rips equivalent:** Hover lifts the tile with shadow + gold border-glow + a small RTP / hot-status badge fades in from the bottom. Tile feels like it's coming up to meet the cursor.
- **Gap:** Browsing 60 tiles, the only difference between hovered and idle is a 4% scale — not enough signal.
- **Recommended fix:** On hover, also: (a) raise box-shadow + gold border tint, (b) reveal a thin bottom strip with provider name + "Play" CTA chevron, (c) ambient sparkle particle once every 1.5s on hovered tile only, (d) ~5deg tilt toward cursor on pointer-move (3D feel, but cap at 5° max so it doesn't feel cheap). Disable tilt on touch devices.
- **Effort:** **M**
- **Dependencies:** None

### 14. Promotions page: align with account-page motion language (🟠 high)

- **Current state:** `promotions/page.tsx` lays out instantly — no `cf-fade-up` on the header or banner stack. Diverges from the account pages we just polished.
- **Rips equivalent:** Consistent entrance language across every player page.
- **Gap:** The transition from /account → /promotions is jarring because /promotions doesn’t do the same fade-up the account routes do.
- **Recommended fix:** Apply `cf-fade-up` to the header and bonus-code form; staggered `cf-fade-up` (delay 80ms increments) on the banner stack. Honour `prefers-reduced-motion`.
- **Effort:** **S**
- **Dependencies:** None

### 15. Sidebar mobile drawer — backdrop blur + spring slide (🟡 nice)

- **Current state:** Slides via `translate-x` over 200ms linear; backdrop is `bg-black/70 backdrop-blur-sm`.
- **Rips equivalent:** Drawer feels weighted — slides with a slight overshoot, then settles. Backdrop blur breathes from 0 → full as the drawer arrives.
- **Gap:** Mobile drawer feels fine but lacks weight.
- **Recommended fix:** Swap linear to `cubic-bezier(0.22, 1.0, 0.36, 1)` over 220ms; animate the backdrop's `backdrop-filter` blur radius from 0 to 8px in parallel. No new deps.
- **Effort:** **S**
- **Dependencies:** None

### 16. Build `/promotions/daily-bonus` (or fix the dead link) (🟡 nice)

- **Current state:** `promotions/page.tsx` has a `BANNERS` entry linking to `/promotions/daily-bonus` — **the route doesn't exist**. Clicking 404s in production.
- **Rips equivalent:** N/A — but no app should ship a broken in-app link.
- **Gap:** Dead link from a promo banner.
- **Recommended fix:** Either build a dedicated page (calendar of past claims, streak meter, next-eligible-at countdown — uses the new `/api/player/bonus/state`) **or** repoint the banner to open the Rewards popover via a `?openRewards=1` query param handled in `_shell.tsx`. The popover route is cheaper and matches user mental model. Pick one.
- **Effort:** **S**
- **Dependencies:** None

### 17. Live Wins ticker — tile click → spectate (🟡 nice)

- **Current state:** Ticker tiles are static visual proof. Clicking a tile does nothing.
- **Rips equivalent:** Tap a winning player's row → mini-overlay shows their win amount + game art + a "Play this game" CTA. Social proof becomes conversion.
- **Gap:** A meaningful CTA is sitting on top of the most-eyeballed surface and we’re not using it.
- **Recommended fix:** Click a ticker tile → small popover with player handle, game thumbnail, amount, "Play [Game]" gold button that triggers `GameLaunchTransition`. Light surface — adds zero clutter when idle.
- **Effort:** **S**
- **Dependencies:** None

### 18. Haptic feedback on big moments (mobile only) (🟡 nice)

- **Current state:** No use of `navigator.vibrate` anywhere.
- **Rips equivalent:** Every meaningful moment has a haptic — claim, win, currency swap, redemption submit. Subtle but immediately makes the site feel native.
- **Gap:** Phone-as-casino feels insubstantial without haptic.
- **Recommended fix:** Tiny utility `haptic.tap()`, `haptic.success()`, `haptic.win()` → calls `navigator.vibrate([...])` patterns. Settings toggle (default ON, off respects setting + `prefers-reduced-motion`). Wire into: claim success, purchase success, currency swap, game launch tap, redemption submit, big-win overlay.
- **Effort:** **S**
- **Dependencies:** None (Web Vibration API is built into browsers)

### 19. Optional sound layer (off by default) (🟡 nice)

- **Current state:** No sound. The user's intent is "optional, off by default".
- **Rips equivalent:** Subtle UI sounds for spin / win / claim / tier-up; **always opt-in**.
- **Gap:** Adding sound on by default would hurt UX (autoplay annoyance). Adding sound opt-in is upside-only.
- **Recommended fix:** Add a "Sound" toggle in `/account/notifications`; if enabled, fire small WAV sprites at: claim, big-win, currency-swap, game-launch. Use a small in-house wrapper around `<audio>` (no Howler needed at this scale — defer if usage grows). 5 short sprites, ~20kb total.
- **Effort:** **S** (build now), **defer rollout** until user approves audio assets.
- **Dependencies:** None initially. `howler` only if we later need sprite mixing/fade.

### 20. Marketing home: hero motion + scroll-revealed sections (🟡 nice)

- **Current state:** `apps/web/app/(marketing)/page.tsx` is mostly static layout with hover-only motion on CTAs. Hero sparkles are a CSS-only decorative pattern.
- **Rips equivalent:** Hero loads with the wordmark forming letter-by-letter; below-the-fold sections fade up as they scroll into view; CTAs pulse subtly to draw attention.
- **Gap:** The marketing front door is the only page a user sees before they’re logged in — currently it’s the calmest surface on the site, when it should be the most magnetic.
- **Recommended fix:** Add `cf-hero-reveal` on first paint (logo halo → wordmark fade-up → subhead → CTAs in sequence, ~600ms total); use `IntersectionObserver` to add `cf-fade-up` to below-the-fold sections as they cross 30% viewport; pulse the primary "Play Free" CTA every 6s for two beats.
- **Effort:** **S/M**
- **Dependencies:** None (IntersectionObserver is native)

---

## Recommended dependencies to add (Phase 2)

Only **two** are recommended as required for the highest-impact recommendations. Everything else can be done with the existing stack.

| Package               | Size                          | Justification                                                                                                                                                                                                                                                                                                       | Used by                                                                              |
| --------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **`canvas-confetti`** | ~6kb gzip                     | Particle quality matters enormously for win/claim moments. A hand-rolled CSS coin-shower will work for medium intensity but won’t scale to Mega-Win density (200+ particles, varying physics). Tiny, zero peer deps, easy to wrap.                                                                                  | Rec #1 (BigWinReveal), #3 (claim/purchase celebration), #11 (currency swap optional) |
| **`framer-motion`**   | ~30–50kb gzip (tree-shakable) | Spring physics + layout animations + AnimatePresence. Hand-rolling spring math + FLIP layouts for every component will burn 5× the time and ship more LOC than the library itself. Pays for itself once we have ≥4 spring-animated surfaces (modal entrances, balance count-up easing, tile launch, tab indicator). | Rec #4 (game launch), #8 (auth modal), #10 (category swap), #13 (tile tilt)          |

Optional (defer until needed):

| Package                              | Justification                                                                                                                             |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `fuse.js` (~7kb)                     | Only if Spotlight search needs fuzzy matching beyond simple `.includes()`. Catalog is small (~60 games) — token match is probably fine.   |
| `@use-gesture/react` (~12kb)         | Only if we add swipeable game carousels or pull-to-refresh. Not required by any top-20 item.                                              |
| `howler` (~10kb)                     | Only if the sound layer grows beyond a handful of one-shot sprites. Native `<audio>` is fine until we need cross-fading or sprite sheets. |
| `lottie-react` (~30kb) + Lottie JSON | Skip. Our brand language is gold gradients and coin glyphs — CSS + SVG carry us further than Lottie does in this aesthetic.               |
| `vibrant` / extractor packages       | Skip. Game art already ships with controlled palettes; per-tile dynamic gold extraction is over-engineering.                              |

**Bundle budget check:** Adding `canvas-confetti` + `framer-motion` adds ~36kb gzip to the player bundle. Acceptable for the lift.

---

## Suggested priority order for Phase 2 execution

The "do these first" list. Picks the 5 with the highest visible payoff per unit effort.

1. **Animated balance count-up** (Rec #2 — **S**). Zero deps, ~40 LOC, makes every realtime push feel alive. Unlocks recs #1 and #3 as it provides the `<TickerNumber>` primitive.
2. **Big-Win Reveal overlay** (Rec #1 — **M**). The single largest UX gap on the site. Requires `canvas-confetti`. Lays the foundation reused by recs #3, #11, #17.
3. **Claim + purchase celebration** (Rec #3 — **S** once #1 exists). Tiny wrapper over the Big Win component. Triples the perceived value of every claim and every dollar spent.
4. **Game-tile tap → opening ceremony** (Rec #4 — **M**). The most-frequent micro-interaction in the app. Adding 280ms of anticipation here transforms the entire browsing experience without slowing velocity (the navigation still completes in the same wall-clock time).
5. **Player error boundaries + loading skeletons** (Recs #6 + #7 — **S** + **S**). Two cheap recs that ship together. Eliminates two of the worst-feeling moments on the site (errors and first-paint blankness).

After those five, the next pass would be: **Spotlight search (#5)**, **view-transition route swaps (#9)**, **category instant-filter (#10)**, **haptic feedback (#18)**, **balance pill swap morph (#11)**.

Total Phase-2 effort estimate (recs 1–20): roughly **6–9 dev-days** for one engineer with the existing codebase familiarity, assuming Framer Motion + canvas-confetti are approved as deps. Stretches to ~11 dev-days if we also build real persistence for the notifications form (#12).

---

## "Don't do" list

These would look like good ideas in a brainstorm. They are not.

- **Sound auto-playing on page load.** Universally annoying. Sound must be opt-in only.
- **Long animations on critical-path screens.** A modal that takes 600ms to open is broken. Cap entrance animations at 280ms for anything between the user and their wallet. Win/claim _celebrations_ can run up to 2.2s because they are not on the critical path — the user has already won.
- **Animating numbers slower than 700ms.** Balance count-ups must complete in <700ms or they become a wait state instead of a feature.
- **Page transitions that block route changes.** The new content must commit instantly; only the chrome can animate. If the user clicks "Lobby" and we make them watch a 500ms cross-fade, we've made the site slower, not better.
- **Confetti on every successful action.** Confetti on claim and purchase = great. Confetti on saving a notifications preference = childish. Reserve the celebration components for _wins and money moments_.
- **Spring physics on hover states.** Hovers are infinite — a spring that overshoots makes hover-out feel wrong. Use linear or ease-out for hovers; reserve spring for click → reveal transitions.
- **Replacing the gold colour with brighter gold to "make it pop".** The gold palette was tuned against the reference images and the brand guide; the perceived pop comes from contrast, motion, and timing, not from the colour value.
- **Coin-burst on every click.** `CoinClickPop` already exists and has cooldown + opt-out via `data-no-coin-pop`. Don’t expand its frequency — _less_ is what makes it feel special.
- **Per-tile sound on hover.** Browsing 60 tiles would mean 60 sound triggers. Sound belongs on commit (click / win / claim), not on hover.
- **Replacing `cf-fade-up` everywhere with Framer entrances.** The existing CSS fade-up is purpose-built, ships with `prefers-reduced-motion` support, and is more performant than a JS-driven equivalent. Use Framer only where we need rect-to-rect choreography or spring physics. Leave the existing ambient fades alone.
- **A full Lottie / video hero on the marketing page.** Heavier than needed and harder to keep on-brand. CSS + SVG + IntersectionObserver gets us 90% of the way at 5% of the weight.
- **Forcing motion on `prefers-reduced-motion: reduce`.** Every animation we add must check this. Already enforced in our existing keyframes; new ones must follow.

---

_This audit is read-only. Phase 2 will execute approved items._
