'use client'

import * as React from 'react'
import { CircleUserRound, Mail } from 'lucide-react'

import { cn } from '@coinfrenzy/ui/lib/utils'
import { FoxIllustration } from '@coinfrenzy/ui/player'

import type { PersonalDetailsInitialValues } from './_personal-details-form'

import { ChangeEmailModal } from './settings/_change-email-modal'
import { ChangeUsernameModal } from './settings/_change-username-modal'
import { VerificationFlowModal } from './settings/_verification-flow-modal'

export interface MyAccountSectionProps {
  username: string
  email: string
  emailVerified: boolean
  kycVerified: boolean
  phone: string | null
  phoneVerified: boolean
  scBalance: string
  gcBalance: string
  personalDetails: PersonalDetailsInitialValues
  personalDetailsComplete: boolean
}

type MobileTab = 'email' | 'username'
type ActiveModal = 'none' | 'username' | 'email' | 'verification'

function ScIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      className="size-[18px] shrink-0"
      aria-hidden
    >
      <path
        d="M9 0C13.9706 0 18 4.02944 18 9C18 13.9706 13.9706 18 9 18C4.02944 18 0 13.9706 0 9C0 4.02944 4.02944 0 9 0ZM8.02178 3.94541C7.3431 3.94545 6.75251 4.07903 6.2499 4.34531C5.75146 4.60742 5.36846 4.9748 5.10205 5.44746C4.83144 5.92431 4.69604 6.4743 4.696 7.09717C4.696 7.90924 4.85989 8.56026 5.18643 9.0501C5.51294 9.53987 5.9422 9.91837 6.4749 10.1848C6.74131 10.318 7.04238 10.4469 7.37754 10.5715C7.71699 10.6961 8.09541 10.814 8.51221 10.9257C8.83867 11.0159 9.09203 11.1154 9.27246 11.2228C9.45284 11.3259 9.54316 11.4825 9.54316 11.693C9.54316 11.8605 9.45478 11.9959 9.27861 12.099C9.10248 12.1978 8.88964 12.2476 8.64053 12.2476C8.23675 12.2475 7.89495 12.1739 7.61572 12.0278C7.34099 11.8775 7.13715 11.622 7.004 11.2614H4.93506V14.4H7.01631L7.24219 13.8067C7.48281 13.9915 7.7084 14.1425 7.91895 14.2585C8.13375 14.3745 8.36587 14.4583 8.61504 14.5099C8.86425 14.5614 9.16536 14.5872 9.51768 14.5872C10.1578 14.5872 10.7252 14.4362 11.2192 14.1354C11.7174 13.8348 12.1017 13.4246 12.3724 12.905C12.6387 12.3851 12.7722 11.8049 12.7723 11.1647C12.7723 10.4085 12.6111 9.7916 12.2889 9.31465C11.9709 8.8334 11.5455 8.46143 11.0127 8.19932C10.467 7.93723 9.81782 7.72079 9.06592 7.54893C8.63641 7.45442 8.30562 7.35123 8.07363 7.23955C7.8373 7.13213 7.71943 6.97471 7.71943 6.76846C7.71952 6.58391 7.80071 6.43998 7.96377 6.33691C8.12705 6.22949 8.35723 6.17607 8.65371 6.17607C9.04473 6.17607 9.35225 6.25068 9.57568 6.40107C9.79907 6.55146 10.0027 6.82041 10.1874 7.20703H12.1667V4.13262H10.3166L9.98789 4.73818C9.50665 4.20977 8.85099 3.94541 8.02178 3.94541Z"
        fill="#20FA20"
      />
    </svg>
  )
}

function GcIcon() {
  return (
    <svg
      width="27"
      height="27"
      viewBox="0 0 27 27"
      fill="none"
      className="size-[22px] shrink-0"
      aria-hidden
    >
      <path
        d="M13.5 0C20.9558 0 27 6.04416 27 13.5C27 20.9558 20.9558 27 13.5 27C6.04416 27 0 20.9558 0 13.5C0 6.04416 6.04416 0 13.5 0ZM12.9121 6.81055C11.5131 6.81055 10.2958 7.10582 9.26074 7.69727C8.23139 8.28303 7.44652 9.09386 6.90625 10.1289C6.36603 11.1639 6.0957 12.3356 6.0957 13.6436C6.09572 15.2869 6.43991 16.649 7.12793 17.7295C7.81606 18.81 8.73501 19.6063 9.88379 20.1182C11.0211 20.6356 12.2864 20.8945 13.6797 20.8945C14.6691 20.8945 15.6642 20.7718 16.665 20.5273C17.666 20.2828 18.6047 19.9273 19.4805 19.4609V13.3623H14.0127V15.8955H15.6504V17.0986C15.5936 17.11 15.4799 17.1465 15.3096 17.209C15.139 17.2659 14.9561 17.3116 14.7627 17.3457C14.5013 17.3911 14.2567 17.4141 14.0293 17.4141C13.074 17.414 12.3347 17.0813 11.8115 16.416C11.2883 15.745 11.0264 14.8207 11.0264 13.6436C11.0264 12.4777 11.2914 11.5619 11.8203 10.8965C12.3492 10.2312 13.0687 9.89844 13.9785 9.89844C14.5244 9.89848 15.0475 10.0835 15.5479 10.4531C16.0483 10.8227 16.3872 11.3656 16.5635 12.082H19.1992V7.0752H16.2471L15.9658 7.97949C15.6417 7.59846 15.1978 7.30842 14.6348 7.10938C14.0776 6.9104 13.5034 6.81056 12.9121 6.81055Z"
        fill="#D4AF37"
      />
    </svg>
  )
}

export function MyAccountSection(props: MyAccountSectionProps) {
  const [mobileTab, setMobileTab] = React.useState<MobileTab>('email')
  const [activeModal, setActiveModal] = React.useState<ActiveModal>('none')

  const verificationInitialStep = React.useMemo(() => {
    if (!props.personalDetailsComplete) return 1 as const
    if (!props.phoneVerified) return 2 as const
    return 3 as const
  }, [props.personalDetailsComplete, props.phoneVerified])

  function openVerification() {
    setActiveModal('verification')
  }

  return (
    <>
      <div className="overflow-hidden rounded-xl bg-[linear-gradient(90deg,#6b4f1a_0%,#e1b144_25%,#af8332_50%,#feeb95_75%,#6b4f1a_100%)] p-px">
        <div className="h-full rounded-[11px] bg-[#12100C] p-5 sm:p-8">
          <div className="flex flex-col gap-8 xl:flex-row xl:items-stretch xl:justify-between xl:gap-10">
            {/* Profile column */}
            <div className="flex min-w-0 flex-1 flex-col gap-2 sm:items-start">
              <div className="flex shrink-0 items-center gap-3 text-center sm:mx-0 sm:items-start sm:text-left">
                <div className="relative mx-0">
                  <div className="relative size-[104px] overflow-hidden rounded-xl border border-white/10 bg-[#312000] sm:size-[118px]">
                    <FoxIllustration
                      variant="standing"
                      width={118}
                      height={118}
                      className="size-full object-cover"
                      chromaKey={false}
                    />
                  </div>
                </div>
                <div className="min-w-0 space-y-3 text-center sm:flex-1 sm:text-left">
                  <div className="flex flex-col items-start gap-2 [&_span]:ml-0">
                    <button
                      type="button"
                      onClick={() => setActiveModal('username')}
                      className="text-xl font-bold tracking-tight text-white hover:underline sm:text-2xl"
                    >
                      @{props.username}
                    </button>
                    {!props.kycVerified ? (
                      <button
                        type="button"
                        aria-label="Open KYC verification"
                        onClick={openVerification}
                        className="inline-flex cursor-pointer border-0 bg-transparent p-0"
                      >
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-red-400">
                          Click here to verify KYC
                        </span>
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#25F54B]/18 px-2.5 py-0.5 text-[11px] font-semibold text-[#72B433]">
                        KYC Verified
                      </span>
                    )}
                  </div>
                  <p className="text-left text-xs text-white/90 md:text-sm">
                    Email : {props.email}
                  </p>
                </div>
              </div>

              <div className="min-w-0 pt-0.5 md:w-full">
                <p className="mb-2 text-xs font-medium text-white/45">Account Balance</p>
                <div className="flex flex-wrap items-center gap-4">
                  <span className="inline-flex items-center gap-1.5 text-base font-bold text-[#25F54B]">
                    <ScIcon />
                    {props.scBalance} SC
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-base font-bold text-[#D4AF37]">
                    <GcIcon />
                    {props.gcBalance} GC
                  </span>
                </div>
              </div>
            </div>

            {/* Mobile tabs */}
            <div className="xl:hidden">
              <div className="mb-6 flex gap-6 border-b border-white/10">
                {(['email', 'username'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setMobileTab(tab)}
                    className={cn(
                      'relative pb-2 text-sm font-semibold capitalize transition-colors',
                      mobileTab === tab ? 'text-white' : 'text-white/40 hover:text-white/60',
                    )}
                  >
                    {tab === 'email' ? 'Email' : 'Username'}
                    {mobileTab === tab ? (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#E8943A]" />
                    ) : null}
                  </button>
                ))}
              </div>
              {mobileTab === 'email' ? (
                <AccountFieldCard
                  icon={<Mail className="size-4" />}
                  label="Email"
                  description="Set the email to have access to your account anytime."
                  value={props.email}
                  verified={props.emailVerified}
                  actionLabel="Change Email"
                  onAction={() => setActiveModal('email')}
                />
              ) : (
                <AccountFieldCard
                  icon={<CircleUserRound className="size-4" />}
                  label="Username"
                  description="Your public handle. Click below or use Change Username to update it."
                  value={props.username}
                  actionLabel="Change Username"
                  onAction={() => setActiveModal('username')}
                  onValueClick={() => setActiveModal('username')}
                  valueIsButton
                />
              )}
            </div>

            {/* Desktop cards */}
            <div className="hidden min-w-0 shrink-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid xl:w-full xl:max-w-[min(100%,720px)] xl:flex-1">
              <AccountFieldCard
                icon={<CircleUserRound className="size-4" />}
                label="Username"
                description="Your public handle. Click below or use Change Username to update it."
                value={props.username}
                actionLabel="Change Username"
                onAction={() => setActiveModal('username')}
                onValueClick={() => setActiveModal('username')}
                valueIsButton
              />
              <AccountFieldCard
                icon={<Mail className="size-4" />}
                label="Email"
                description="Set the email to have access to your account anytime."
                value={props.email}
                verified={props.emailVerified}
                actionLabel="Change Email"
                onAction={() => setActiveModal('email')}
              />
            </div>
          </div>
        </div>
      </div>

      <ChangeUsernameModal
        open={activeModal === 'username'}
        onClose={() => setActiveModal('none')}
        currentUsername={props.username}
      />
      <ChangeEmailModal
        open={activeModal === 'email'}
        onClose={() => setActiveModal('none')}
        currentEmail={props.email}
      />
      <VerificationFlowModal
        open={activeModal === 'verification'}
        onClose={() => setActiveModal('none')}
        initialStep={verificationInitialStep}
        personalDetails={props.personalDetails}
        phone={props.phone}
        phoneVerified={props.phoneVerified}
        kycVerified={props.kycVerified}
      />
    </>
  )
}

function AccountFieldCard({
  icon,
  label,
  description,
  value,
  actionLabel,
  onAction,
  onValueClick,
  valueIsButton,
  verified,
}: {
  icon: React.ReactNode
  label: string
  description: string
  value: string
  actionLabel: string
  onAction: () => void
  onValueClick?: () => void
  valueIsButton?: boolean
  verified?: boolean
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-col rounded-xl border border-white/[0.08] bg-[#1C190F] p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-[var(--cf-gold-light)]">{icon}</span>
        <span className="text-sm font-semibold text-white">{label}</span>
        {verified ? (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-[#25F54B]/18 px-2.5 py-0.5 text-[11px] font-semibold text-[#72B433]">
            Verified
          </span>
        ) : null}
      </div>
      <p className="mb-3 grow text-[14px] leading-relaxed text-white">{description}</p>
      {valueIsButton ? (
        <button
          type="button"
          onClick={onValueClick}
          className="mb-3 w-full cursor-pointer rounded-lg border border-white/10 bg-[#0a0a0a] px-3 py-2.5 text-left text-sm text-white/80 shadow-[inset_0_1px_2px_rgba(0,0,0,0.45)] transition-colors hover:border-white/20"
        >
          {value}
        </button>
      ) : (
        <input
          readOnly
          tabIndex={-1}
          value={value}
          className="mb-3 w-full cursor-default rounded-lg border border-white/10 bg-[#0a0a0a] px-3 py-2.5 text-sm text-white/80 shadow-[inset_0_1px_2px_rgba(0,0,0,0.45)] focus:outline-none"
        />
      )}
      <button
        type="button"
        onClick={onAction}
        className="w-full rounded-lg border border-white/25 bg-[#121212] px-1 py-2.5 text-center text-sm font-medium text-white transition-colors hover:bg-white/5"
      >
        {actionLabel}
      </button>
    </div>
  )
}
