'use client'

import * as React from 'react'
import Link from 'next/link'

import { cn } from '../lib/utils'

// Full-width offer marquee shown above the player header on the legacy
// Coin Frenzy lobby.

interface TopOfferStripProps {
  message: string
  ctaLabel: string
  ctaHref: string
  className?: string
}

export function TopOfferStrip({ message, ctaLabel, ctaHref, className }: TopOfferStripProps) {
  const segment = (
    <span className="cf-top-offer__item">
      <span className="cf-top-offer__icon">
        <SweepCoinIcon />
      </span>
      <span>
        {message.split('30').map((piece, idx, arr) =>
          idx < arr.length - 1 ? (
            <React.Fragment key={idx}>
              {piece}
              <span className="cf-top-offer__highlight cf-top-offer__highlight--sc">30</span>
            </React.Fragment>
          ) : (
            <React.Fragment key={idx}>{piece}</React.Fragment>
          ),
        )}
      </span>
      <Link href={ctaHref} className="cf-top-offer__cta">
        {ctaLabel}
      </Link>
    </span>
  )

  return (
    <div className={cn('cf-top-offer', className)} aria-label="Promotional banner">
      <div className="cf-top-offer__track">
        {Array.from({ length: 9 }).map((_, i) => (
          <React.Fragment key={i}>{segment}</React.Fragment>
        ))}
      </div>
    </div>
  )
}

function SweepCoinIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 27 27" fill="none" aria-hidden="true">
      <path
        d="M13.5 0C20.9558 0 27 6.04416 27 13.5C27 20.9558 20.9558 27 13.5 27C6.04416 27 0 20.9558 0 13.5C0 6.04416 6.04416 0 13.5 0ZM12.0327 5.91812C11.0146 5.91817 10.1288 6.11854 9.37485 6.51797C8.6272 6.91113 8.05269 7.46221 7.65308 8.17119C7.24716 8.88647 7.04406 9.71144 7.04399 10.6458C7.04399 11.8639 7.28984 12.8404 7.77964 13.5751C8.26941 14.3098 8.9133 14.8775 9.71235 15.2771C10.112 15.477 10.5636 15.6703 11.0663 15.8572C11.5755 16.0441 12.1431 16.2209 12.7683 16.3885C13.258 16.5239 13.638 16.673 13.9087 16.8341C14.1793 16.9888 14.3147 17.2237 14.3147 17.5395C14.3147 17.7908 14.1822 17.9938 13.9179 18.1485C13.6537 18.2967 13.3345 18.3713 12.9608 18.3713C12.3551 18.3713 11.8424 18.2608 11.4236 18.0417C11.0115 17.8162 10.7057 17.433 10.506 16.8921H7.40259V21.6H10.5245L10.8633 20.7101C11.2242 20.9873 11.5626 21.2137 11.8784 21.3877C12.2006 21.5617 12.5488 21.6875 12.9226 21.7648C13.2964 21.8421 13.748 21.8808 14.2765 21.8808C15.2367 21.8807 16.0878 21.6543 16.8289 21.2032C17.5761 20.7521 18.1526 20.1369 18.5585 19.3575C18.9581 18.5777 19.1583 17.7073 19.1584 16.7471C19.1584 15.6127 18.9167 14.6874 18.4333 13.972C17.9563 13.2501 17.3183 12.6921 16.519 12.299C15.7005 11.9058 14.7267 11.5812 13.5989 11.3234C12.9546 11.1816 12.4584 11.0268 12.1104 10.8593C11.756 10.6982 11.5792 10.4621 11.5792 10.1527C11.5793 9.87587 11.7011 9.65996 11.9457 9.50537C12.1906 9.34424 12.5358 9.26411 12.9806 9.26411C13.5671 9.26411 14.0284 9.37603 14.3635 9.60161C14.6986 9.82719 15.004 10.2306 15.2811 10.8105H18.25V6.19893H15.4749L14.9818 7.10728C14.26 6.31466 13.2765 5.91812 12.0327 5.91812Z"
        fill="#25F54B"
      />
    </svg>
  )
}
