import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Inter, Montserrat, Cinzel } from 'next/font/google'

import './globals.css'

// Inter — typeface for the admin platform (M1-M4). Loaded with the
// `cv11`, `ss01`, `ss03` feature set in globals.css for the Linear-style
// number/punctuation tweaks.
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

// Montserrat — body copy on the player surface and marketing pages per
// the official Coin Frenzy brand guide.
const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-montserrat',
})

// Cinzel — free serif used as a stand-in for the licensed "Thunder Demo"
// headline font called out in the brand guide. Same elegant/classy feel,
// works for hero headlines and section titles.
const cinzel = Cinzel({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  display: 'swap',
  variable: '--font-cinzel',
})

export const metadata: Metadata = {
  title: "Coin Frenzy — Play free. Win real. That's the Frenzy.",
  description:
    'Coin Frenzy is a free-to-play social casino with sweepstakes prizes. Hundreds of slots, live dealers, game shows and originals.',
  icons: {
    icon: '/favicon.svg',
  },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${montserrat.variable} ${cinzel.variable}`}
    >
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        {children}
      </body>
    </html>
  )
}
