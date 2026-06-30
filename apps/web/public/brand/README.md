# Brand assets

Drop final brand assets here. Until then the admin and player surfaces
fall back to a text-based "CoinFrenzy" wordmark and the placeholder
gold-on-dark palette from `docs/10_frontend_architecture.md` §4.1.

## Expected files (once provided)

- `logo.svg` — full wordmark (used at top-left of admin sidebar, marketing header)
- `logo-mark.svg` — icon-only mark (used for the collapsed admin sidebar, favicons)
- `favicon.ico` — favicon (typical 32x32 + 16x16 multi-resolution)
- `apple-touch-icon.png` — 180x180 PNG for iOS home-screen icon
- `og-default.png` — 1200x630 social-share fallback
- `brand-tokens.json` — final color / typography / spacing tokens (overrides `packages/ui/src/styles/globals.css`)

## Until brand assets are delivered

The components in `packages/ui/src/admin/layout/` render the wordmark as
text styled with `font-mono text-gold`. The Tailwind theme uses `#FFD700`
gold against a `#0A0A0F` dark background; these tokens live in
`packages/ui/src/styles/globals.css` and `packages/ui/tailwind.config.ts`
under the `--primary` / `--background` CSS variables.

Replace the placeholders when assets land; only the CSS variables and the
sidebar/topbar logo nodes need to change.
