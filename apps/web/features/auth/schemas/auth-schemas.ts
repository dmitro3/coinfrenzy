import { z } from 'zod'

// Signup schema — matches the actual API payload from the docs:
// { email, password, isTermsAccepted, browser, referralCode, platform, captchaToken }
// Simplified form: no firstName/lastName/DOB/state
export const signupSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password is too long'),
  referralCode: z.string().optional(),
  isTermsAccepted: z.literal(true, {
    errorMap: () => ({ message: 'You must accept the Terms & Conditions to continue' }),
  }),
})

export type SignupFormValues = z.infer<typeof signupSchema>

// Login schema — email + password
export const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

export type LoginFormValues = z.infer<typeof loginSchema>

// OTP schema — 6 digits joined
export const otpSchema = z.object({
  otp: z
    .string()
    .length(6, 'Please enter the 6-digit code')
    .regex(/^\d{6}$/, 'Code must be 6 digits'),
})

export type OtpFormValues = z.infer<typeof otpSchema>

// Username schema — API doc: 5-20 chars, at least one lowercase letter,
// only letters/digits/underscores
export const usernameSchema = z.object({
  username: z
    .string()
    .min(5, 'Username must be at least 5 characters')
    .max(20, 'Username must be 20 characters or fewer')
    .regex(
      /^(?=.*[a-z])[a-z0-9_]+$/,
      'Username must contain at least one lowercase letter and only use letters, numbers, and underscores',
    ),
})

export type UsernameFormValues = z.infer<typeof usernameSchema>
