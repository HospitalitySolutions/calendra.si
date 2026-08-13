import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function IconBase({ size = 22, children, ...props }: IconProps) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{children}</svg>
}

export const HomeIcon = (p: IconProps) => <IconBase {...p}><path d="m3 10 9-7 9 7"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-7h6v7"/></IconBase>
export const SearchIcon = (p: IconProps) => <IconBase {...p}><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></IconBase>
export const CalendarIcon = (p: IconProps) => <IconBase {...p}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></IconBase>
export const WalletIcon = (p: IconProps) => <IconBase {...p}><path d="M4 6.5h14a2 2 0 0 1 2 2V19H5a2 2 0 0 1-2-2V6.5Z"/><path d="M4 6.5V5a2 2 0 0 1 2-2h11v3.5"/><path d="M15 12h5v4h-5a2 2 0 1 1 0-4Z"/></IconBase>
export const MessageIcon = (p: IconProps) => <IconBase {...p}><path d="M21 15a4 4 0 0 1-4 4H8l-5 3v-7a4 4 0 0 1-1-2.7V7a4 4 0 0 1 4-4h11a4 4 0 0 1 4 4Z"/></IconBase>
export const BellIcon = (p: IconProps) => <IconBase {...p}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></IconBase>
export const UserIcon = (p: IconProps) => <IconBase {...p}><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></IconBase>
export const ChevronRightIcon = (p: IconProps) => <IconBase {...p}><path d="m9 18 6-6-6-6"/></IconBase>
export const ChevronLeftIcon = (p: IconProps) => <IconBase {...p}><path d="m15 18-6-6 6-6"/></IconBase>
export const MapPinIcon = (p: IconProps) => <IconBase {...p}><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></IconBase>
export const ClockIcon = (p: IconProps) => <IconBase {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></IconBase>
export const StarIcon = (p: IconProps) => <IconBase {...p}><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9Z"/></IconBase>
export const ArrowUpRightIcon = (p: IconProps) => <IconBase {...p}><path d="M7 17 17 7M8 7h9v9"/></IconBase>
export const LogOutIcon = (p: IconProps) => <IconBase {...p}><path d="M10 5H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h5"/><path d="m14 8 4 4-4 4M18 12H9"/></IconBase>
export const EditIcon = (p: IconProps) => <IconBase {...p}><path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10Z"/><path d="m14 7 3 3"/></IconBase>
export const CheckIcon = (p: IconProps) => <IconBase {...p}><path d="m5 12 4 4L19 6"/></IconBase>
export const CloseIcon = (p: IconProps) => <IconBase {...p}><path d="m6 6 12 12M18 6 6 18"/></IconBase>
export const SendIcon = (p: IconProps) => <IconBase {...p}><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></IconBase>
export const RefreshIcon = (p: IconProps) => <IconBase {...p}><path d="M20 6v5h-5"/><path d="M19 11a7 7 0 1 0-1 5"/></IconBase>
export const SettingsIcon = (p: IconProps) => <IconBase {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21h-4v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H3v-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3h4a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.1v4H21a1.7 1.7 0 0 0-1.6 1Z"/></IconBase>
