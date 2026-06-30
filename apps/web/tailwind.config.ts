import type { Config } from 'tailwindcss'
import preset from '@coinfrenzy/ui/tailwind-preset'

// Web app extends the shared shadcn/ui preset from @coinfrenzy/ui.
// Brand customization (CoinFrenzy gold etc.) lands in prompt 04.

const config: Config = {
  presets: [preset],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
}

export default config
