type GoogleCredentialResponse = {
  credential?: string
}

type GoogleButtonConfig = {
  type?: 'standard' | 'icon'
  theme?: 'outline' | 'filled_blue' | 'filled_black'
  size?: 'large' | 'medium' | 'small'
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin'
  shape?: 'rectangular' | 'pill' | 'circle' | 'square'
  logo_alignment?: 'left' | 'center'
  width?: number
}

type GoogleAccountsId = {
  initialize: (config: { client_id: string; callback: (response: GoogleCredentialResponse) => void; auto_select?: boolean; cancel_on_tap_outside?: boolean }) => void
  renderButton: (element: HTMLElement, config: GoogleButtonConfig) => void
}

type AppleAuthorizationResponse = {
  authorization?: {
    id_token?: string
    state?: string
  }
  user?: {
    name?: {
      firstName?: string | null
      lastName?: string | null
    }
  }
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: GoogleAccountsId
      }
    }
    AppleID?: {
      auth: {
        init: (config: {
          clientId: string
          scope: string
          redirectURI: string
          state?: string
          nonce?: string
          usePopup: boolean
        }) => void
        signIn: () => Promise<AppleAuthorizationResponse>
      }
    }
  }
}

const scriptLoads = new Map<string, Promise<void>>()

function loadScript(src: string) {
  const existing = scriptLoads.get(src)
  if (existing) return existing

  const promise = new Promise<void>((resolve, reject) => {
    const current = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`)
    if (current) {
      if (current.dataset.calendraLoaded === 'true') resolve()
      else {
        current.addEventListener('load', () => resolve(), { once: true })
        current.addEventListener('error', () => reject(new Error(`Could not load ${src}`)), { once: true })
      }
      return
    }

    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.defer = true
    script.addEventListener('load', () => {
      script.dataset.calendraLoaded = 'true'
      resolve()
    }, { once: true })
    script.addEventListener('error', () => reject(new Error(`Could not load ${src}`)), { once: true })
    document.head.appendChild(script)
  })

  scriptLoads.set(src, promise)
  return promise
}

export async function renderGoogleIdentityButton(
  element: HTMLElement,
  clientId: string,
  onCredential: (idToken: string) => void,
) {
  await loadScript('https://accounts.google.com/gsi/client')
  const googleId = window.google?.accounts?.id
  if (!googleId) throw new Error('Google Identity Services did not initialize.')

  googleId.initialize({
    client_id: clientId,
    auto_select: false,
    cancel_on_tap_outside: true,
    callback: response => {
      const token = response.credential?.trim()
      if (token) onCredential(token)
    },
  })

  element.innerHTML = ''
  googleId.renderButton(element, {
    type: 'standard',
    theme: 'outline',
    size: 'large',
    text: 'continue_with',
    shape: 'rectangular',
    logo_alignment: 'left',
    width: Math.min(400, Math.max(240, Math.floor(element.getBoundingClientRect().width))),
  })
}

export async function signInWithApple(options: {
  clientId: string
  redirectUri: string
}) {
  await loadScript('https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js')
  const appleAuth = window.AppleID?.auth
  if (!appleAuth) throw new Error('Sign in with Apple did not initialize.')

  const state = crypto.randomUUID()
  const nonce = crypto.randomUUID()
  appleAuth.init({
    clientId: options.clientId,
    scope: 'name email',
    redirectURI: options.redirectUri,
    state,
    nonce,
    usePopup: true,
  })

  const response = await appleAuth.signIn()
  const idToken = response.authorization?.id_token?.trim()
  if (!idToken) throw new Error('Apple did not return an identity token.')

  return {
    idToken,
    firstName: response.user?.name?.firstName || null,
    lastName: response.user?.name?.lastName || null,
  }
}

export {}
