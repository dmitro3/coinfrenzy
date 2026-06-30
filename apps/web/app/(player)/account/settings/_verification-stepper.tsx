'use client'

import { cn } from '@coinfrenzy/ui/lib/utils'

import { GOLD_BTN_GRADIENT, VERIFICATION_STEPS } from './_constants'

interface VerificationStepperProps {
  activeStep: 1 | 2 | 3
}

export function VerificationStepper({ activeStep }: VerificationStepperProps) {
  return (
    <div className="relative mb-4 mt-6 h-16 w-full md:mb-12">
      <div className="absolute left-4 right-4 top-4 z-0 flex h-px items-center">
        <div className={cn('h-px flex-1', activeStep >= 2 ? 'bg-[#E5A122]' : 'bg-[#E5A122]/40')} />
        <div
          className={cn(
            'h-px flex-1 border-t border-dashed',
            activeStep >= 3 ? 'border-[#E5A122]/60' : 'border-white/20',
          )}
        />
      </div>

      <div className="relative z-10 flex w-full items-start justify-between">
        {VERIFICATION_STEPS.map((label, index) => {
          const step = (index + 1) as 1 | 2 | 3
          const completed = step < activeStep
          const active = step === activeStep

          return (
            <div key={label} className="relative flex w-8 flex-col items-center">
              <div
                className={cn(
                  'flex size-8 items-center justify-center rounded-full text-sm font-bold transition-all duration-300',
                  completed || active
                    ? 'text-[#0A0A0A] shadow-[0_0_15px_rgba(229,161,34,0.3)]'
                    : 'border border-[#E5A122] bg-[#0A0A0A] text-[#E5A122]',
                )}
                style={completed || active ? { background: GOLD_BTN_GRADIENT } : undefined}
              >
                {step}
              </div>
              <div
                className={cn(
                  'pointer-events-none absolute top-11 w-[60px] text-center transition-all duration-300 sm:w-[120px]',
                  step === 1 && 'left-0 text-left',
                  step === 2 && 'left-1/2 -translate-x-1/2',
                  step === 3 && 'right-0 text-right',
                )}
              >
                <span
                  className={cn(
                    'block whitespace-normal text-[9px] font-medium leading-[1.15] sm:whitespace-nowrap',
                    active || completed ? 'text-white' : 'text-white/40',
                  )}
                >
                  {label}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
