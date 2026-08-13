import { providerInitial } from '../utils'

export function ProviderAvatar({ name, logoUrl, size = 'md' }: { name?: string | null; logoUrl?: string | null; size?: 'sm' | 'md' | 'lg' }) {
  const className = `provider-avatar provider-avatar--${size}`
  if (logoUrl) {
    return <span className={className}><img src={logoUrl} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = 'none' }} /><span>{providerInitial(name)}</span></span>
  }
  return <span className={className}><span>{providerInitial(name)}</span></span>
}
