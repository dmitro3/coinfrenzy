'use client'

import * as React from 'react'

import { OTP_LENGTH } from './_constants'

const inputClassName =
  'flex-1 !h-[44px] bg-[#121212] border border-white/5 rounded-lg text-white text-lg font-bold text-center outline-none focus:border-white/20 transition-all placeholder:text-white/10 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'

interface OtpInputProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  autoFocus?: boolean
}

export function OtpInput({ value, onChange, disabled, autoFocus }: OtpInputProps) {
  const digits = React.useMemo(() => {
    const chars = value.replace(/\D/g, '').slice(0, OTP_LENGTH).split('')
    while (chars.length < OTP_LENGTH) chars.push('')
    return chars
  }, [value])

  const inputRefs = React.useRef<Array<HTMLInputElement | null>>(Array(OTP_LENGTH).fill(null))

  React.useEffect(() => {
    if (autoFocus) inputRefs.current[0]?.focus()
  }, [autoFocus])

  function setDigit(index: number, digit: string) {
    const next = [...digits]
    next[index] = digit
    onChange(next.join('').replace(/\s/g, ''))
  }

  function handleChange(index: number, raw: string) {
    const digit = raw.replace(/\D/g, '').slice(-1)
    setDigit(index, digit)
    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      e.preventDefault()
      if (digits[index]) {
        setDigit(index, '')
      } else if (index > 0) {
        inputRefs.current[index - 1]?.focus()
        setDigit(index - 1, '')
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus()
    } else if (e.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH)
    if (!pasted) return
    onChange(pasted)
    const focusIdx = Math.min(pasted.length, OTP_LENGTH - 1)
    inputRefs.current[focusIdx]?.focus()
  }

  return (
    <div className="flex w-full gap-[6px]">
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            inputRefs.current[index] = el
          }}
          type="tel"
          inputMode="numeric"
          autoComplete="off"
          aria-label={`Please enter OTP character ${index + 1}`}
          placeholder="-"
          value={digit}
          disabled={disabled}
          className={inputClassName}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
        />
      ))}
    </div>
  )
}
