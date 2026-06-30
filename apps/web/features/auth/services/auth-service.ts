import type {
  SignupApiResponse,
  VerifyOtpApiResponse,
  ResendOtpApiResponse,
  CheckUsernameApiResponse,
  SetUsernameApiResponse,
  ProfileApiResponse,
  ForgotPasswordApiResponse,
  ResetPasswordApiResponse,
  ResendResetOtpApiResponse,
} from '../types/auth-modal.types'

// All requests use same-origin relative paths — the Next.js app proxies
// to the backend via /api routes (same pattern as the existing signup page).
async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...(options?.headers ?? {}),
    },
    ...options,
  })

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null
    throw new Error(body?.message ?? `Request failed with status ${res.status}`)
  }

  return res.json() as Promise<T>
}

// ─── 1. Signup ────────────────────────────────────────────────────────────────

export interface SignupPayload {
  email: string
  password: string
  isTermsAccepted: boolean
  referralCode?: string
  captchaToken: string
  browser: string
  platform: string
}

export async function signupApi(payload: SignupPayload): Promise<SignupApiResponse> {
  return apiFetch<SignupApiResponse>('/api/player/signup', {
    method: 'POST',
    body: JSON.stringify({
      email: payload.email.trim().toLowerCase(),
      password: payload.password,
      isTermsAccepted: payload.isTermsAccepted,
      referralCode: payload.referralCode?.trim() ?? '',
      captchaToken: payload.captchaToken,
      browser: payload.browser,
      platform: payload.platform,
    }),
  })
}

// ─── 2. Verify OTP ────────────────────────────────────────────────────────────

export async function verifyOtpApi(email: string, otp: string): Promise<VerifyOtpApiResponse> {
  return apiFetch<VerifyOtpApiResponse>('/api/player/verify-otp', {
    method: 'POST',
    body: JSON.stringify({ email: email.trim().toLowerCase(), otp }),
  })
}

// ─── 3. Resend OTP ───────────────────────────────────────────────────────────

export async function resendOtpApi(email: string): Promise<ResendOtpApiResponse> {
  return apiFetch<ResendOtpApiResponse>('/api/player/resend-otp', {
    method: 'POST',
    body: JSON.stringify({ email: email.trim().toLowerCase() }),
  })
}

// ─── 4. Check username availability ─────────────────────────────────────────

export async function checkUsernameApi(
  username: string,
  signal?: AbortSignal,
): Promise<CheckUsernameApiResponse> {
  return apiFetch<CheckUsernameApiResponse>(
    `/api/player/username-check?username=${encodeURIComponent(username)}`,
    { method: 'GET', signal },
  )
}

// ─── 5. Set username ──────────────────────────────────────────────────────────

export async function setUsernameApi(username: string): Promise<SetUsernameApiResponse> {
  return apiFetch<SetUsernameApiResponse>('/api/player/username', {
    method: 'POST',
    body: JSON.stringify({ username }),
  })
}

// ─── 6. Fetch profile ─────────────────────────────────────────────────────────

export async function fetchProfileApi(): Promise<ProfileApiResponse> {
  return apiFetch<ProfileApiResponse>('/api/player/profile', { method: 'GET' })
}

// ─── 7. Forgot password (OTP) ───────────────────────────────────────────────

export async function forgotPasswordApi(email: string): Promise<ForgotPasswordApiResponse> {
  return apiFetch<ForgotPasswordApiResponse>('/api/player/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email: email.trim().toLowerCase() }),
  })
}

// ─── 8. Reset password with OTP ─────────────────────────────────────────────

export async function resetPasswordWithOtpApi(payload: {
  email: string
  otp: string
  password: string
  confirmPassword: string
}): Promise<ResetPasswordApiResponse> {
  return apiFetch<ResetPasswordApiResponse>('/api/player/reset-password', {
    method: 'POST',
    body: JSON.stringify({
      email: payload.email.trim().toLowerCase(),
      otp: payload.otp,
      password: payload.password,
      confirmPassword: payload.confirmPassword,
    }),
  })
}

// ─── 9. Resend reset OTP ────────────────────────────────────────────────────

export async function resendResetOtpApi(email: string): Promise<ResendResetOtpApiResponse> {
  return apiFetch<ResendResetOtpApiResponse>('/api/player/resend-reset-otp', {
    method: 'POST',
    body: JSON.stringify({ email: email.trim().toLowerCase() }),
  })
}
