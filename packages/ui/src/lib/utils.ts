import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// shadcn/ui's standard className helper.
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
