import type { Config } from 'tailwindcss'
import animate from 'tailwindcss-animate'

// Shared Tailwind preset — driven by the design tokens in
// `packages/ui/src/styles/globals.css`. The new semantic tokens (surface,
// elevated, text-primary, etc.) are mapped here; legacy shadcn aliases
// remain so existing primitives keep working during the rebuild.

const preset: Config = {
  darkMode: ['class'],
  content: [],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      colors: {
        // Semantic surface tokens (new system — Linear/Vercel inspired).
        // Use these in new admin components.
        base: 'hsl(var(--color-bg-base))',
        surface: {
          DEFAULT: 'hsl(var(--color-bg-surface))',
          hover: 'hsl(var(--color-bg-surface-hover))',
        },
        elevated: 'hsl(var(--color-bg-elevated))',

        // Text scale.
        ink: {
          DEFAULT: 'hsl(var(--color-text-primary))',
          primary: 'hsl(var(--color-text-primary))',
          secondary: 'hsl(var(--color-text-secondary))',
          tertiary: 'hsl(var(--color-text-tertiary))',
          disabled: 'hsl(var(--color-text-disabled))',
        },

        // Border scale (replaces the single shadcn `border` token where
        // a stronger or subtler weight is needed).
        line: {
          subtle: 'hsl(var(--color-border-subtle))',
          DEFAULT: 'hsl(var(--color-border-default))',
          strong: 'hsl(var(--color-border-strong))',
        },

        // Status colors with -bg variants for status pill backgrounds.
        positive: {
          DEFAULT: 'hsl(var(--color-success))',
          bg: 'hsl(var(--color-success-bg))',
        },
        attention: {
          DEFAULT: 'hsl(var(--color-warning))',
          bg: 'hsl(var(--color-warning-bg))',
        },
        critical: {
          DEFAULT: 'hsl(var(--color-error))',
          bg: 'hsl(var(--color-error-bg))',
        },
        notice: {
          DEFAULT: 'hsl(var(--color-info))',
          bg: 'hsl(var(--color-info-bg))',
        },

        // Brand accent — the refined CoinFrenzy gold. Use sparingly.
        brand: {
          DEFAULT: 'hsl(var(--color-accent))',
          hover: 'hsl(var(--color-accent-hover))',
          foreground: 'hsl(var(--color-accent-foreground))',
        },

        // ------ Legacy shadcn aliases — every existing component depends
        // on these. Driven by the same CSS variables so the new visual
        // system flows through automatically. ------
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        info: {
          DEFAULT: 'hsl(var(--info))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        vip: {
          DEFAULT: 'hsl(var(--vip))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        // Legacy site custom-yellow scale (--color-custom-yellow-*).
        // custom-yellow-800 = #fdb930, custom-yellow-1000 = #f4cc0d.
        // Used for the game card hover border to match live site exactly.
        'custom-yellow': {
          800: '#fdb930',
          1000: '#f4cc0d',
        },

        // CoinFrenzy gold scale — kept for any place that called the named
        // shade directly. The DEFAULT now matches the refined accent.
        gold: {
          DEFAULT: 'hsl(var(--color-accent))',
          50: '#FFFBEB',
          100: '#FEF3C7',
          200: '#FDE68A',
          300: '#FCD34D',
          400: '#FBBF24',
          500: '#eab308',
          600: '#D97706',
          700: '#B45309',
          800: '#92400E',
          900: '#78350F',
        },
      },

      fontFamily: {
        // Live-site parity: Montserrat is the default sans; Inter is opt-in
        // via `font-inter` (admin). Serif maps to Playfair Display.
        sans: [
          'var(--font-sans)',
          'Montserrat',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'sans-serif',
        ],
        serif: ['var(--font-serif)', 'Playfair Display', 'Georgia', 'Times New Roman', 'serif'],
        mono: [
          'var(--font-mono)',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Consolas',
          'monospace',
        ],
        inter: ['var(--font-inter)', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        montserrat: ['var(--font-montserrat)', 'Montserrat', 'sans-serif'],
        headline: [
          'var(--font-cinzel)',
          'Cinzel',
          'Playfair Display',
          'Cormorant Garamond',
          'serif',
        ],
      },

      // Precise type scale per design spec — line-heights baked in.
      fontSize: {
        // [size, lineHeight]
        xs: ['11px', { lineHeight: '16px', letterSpacing: '0' }],
        sm: ['12px', { lineHeight: '18px', letterSpacing: '-0.005em' }],
        base: ['13px', { lineHeight: '20px', letterSpacing: '-0.011em' }],
        md: ['14px', { lineHeight: '22px', letterSpacing: '-0.011em' }],
        lg: ['16px', { lineHeight: '24px', letterSpacing: '-0.014em' }],
        xl: ['20px', { lineHeight: '28px', letterSpacing: '-0.018em' }],
        '2xl': ['24px', { lineHeight: '32px', letterSpacing: '-0.02em' }],
        '3xl': ['32px', { lineHeight: '40px', letterSpacing: '-0.022em' }],
        '4xl': ['40px', { lineHeight: '48px', letterSpacing: '-0.024em' }],
      },

      borderRadius: {
        sm: '6px',
        md: '8px',
        lg: '10px',
        xl: '12px',
      },

      boxShadow: {
        sm: '0 1px 2px rgba(0, 0, 0, 0.3)',
        md: '0 4px 8px rgba(0, 0, 0, 0.4)',
        lg: '0 12px 24px rgba(0, 0, 0, 0.5)',
        popover: '0 8px 24px rgba(0, 0, 0, 0.6), 0 1px 2px rgba(0, 0, 0, 0.4)',
        // Game tile hover glow — matches the live coinfrenzy.com card shadow.
        // Depth shadow + crisp 1px gold ring using custom-yellow-1000 (#f4cc0d).
        'game-card':
          '0 12px 30px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(244, 204, 13, 0.5), 0 0 20px rgba(244, 204, 13, 0.12)',
      },

      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'pulse-soft': 'pulse-soft 1.6s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [animate],
}

export default preset
