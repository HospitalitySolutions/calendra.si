const textEncoder = new TextEncoder()

function padBase64(input: string) {
  const pad = input.length % 4
  if (pad === 0) return input
  return input + '='.repeat(4 - pad)
}

export function supportsWebAuthn() {
  return typeof window !== 'undefined' && typeof window.PublicKeyCredential !== 'undefined' && !!navigator.credentials
}

export function base64UrlToArrayBuffer(value: string): ArrayBuffer {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('Expected a non-empty base64url string.')
  }
  const base64 = padBase64(value.replace(/-/g, '+').replace(/_/g, '/'))
  const binary = window.atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

/** Normalize server JSON: base64url string, numeric byte array, or ArrayBuffer-like. */
function webauthnFieldToArrayBuffer(value: unknown, fieldLabel: string): ArrayBuffer {
  if (value == null) {
    throw new Error(`WebAuthn options are missing ${fieldLabel}.`)
  }
  if (value instanceof ArrayBuffer) {
    return value
  }
  if (ArrayBuffer.isView(value)) {
    const v = value as ArrayBufferView
    return v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength)
  }
  if (typeof value === 'string') {
    return base64UrlToArrayBuffer(value)
  }
  if (Array.isArray(value)) {
    const bytes = value as unknown[]
    if (!bytes.length || !bytes.every((n) => typeof n === 'number' && n >= 0 && n <= 255 && Number.isInteger(n))) {
      throw new Error(`WebAuthn field ${fieldLabel} is not a valid byte array.`)
    }
    return new Uint8Array(bytes).buffer
  }
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>
    const nested =
      typeof o.base64Url === 'string'
        ? o.base64Url
        : typeof o.base64 === 'string'
          ? o.base64
          : typeof (o as { value?: unknown }).value === 'string'
            ? ((o as { value: string }).value)
            : null
    if (nested != null) {
      return base64UrlToArrayBuffer(nested)
    }
  }
  throw new Error(`WebAuthn field ${fieldLabel} has an unsupported shape.`)
}

export function arrayBufferToBase64Url(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function decodeDescriptor(descriptor: any, index: number, listLabel: string) {
  return {
    ...descriptor,
    id: webauthnFieldToArrayBuffer(descriptor?.id, `${listLabel}[${index}].id`),
  }
}

// Yubico serializes client options as { publicKey: <PublicKeyCredential*Options> }; unwrap when the API forwards that blob as `publicKey`.
function unwrapYubicoCredentialOptionsPayload(raw: Record<string, unknown>): Record<string, unknown> {
  const nested = raw.publicKey
  if (nested != null && typeof nested === 'object' && !Array.isArray(nested) && 'challenge' in nested) {
    return nested as Record<string, unknown>
  }
  return raw
}

export function decodeRegistrationOptions(publicKey: any): CredentialCreationOptions {
  if (typeof publicKey === 'string') {
    try {
      publicKey = JSON.parse(publicKey)
    } catch {
      throw new Error('Server returned publicKey as invalid JSON text.')
    }
  }
  if (publicKey == null || typeof publicKey !== 'object') {
    throw new Error('Server did not return WebAuthn registration options (publicKey).')
  }
  publicKey = unwrapYubicoCredentialOptionsPayload(publicKey as Record<string, unknown>)
  const user = publicKey.user
  if (user == null || typeof user !== 'object') {
    throw new Error('Server registration options are missing user.')
  }
  return {
    publicKey: {
      ...publicKey,
      challenge: webauthnFieldToArrayBuffer(publicKey.challenge, 'challenge'),
      user: {
        ...user,
        id: webauthnFieldToArrayBuffer((user as { id?: unknown }).id, 'user.id'),
      },
      excludeCredentials: Array.isArray(publicKey.excludeCredentials)
        ? publicKey.excludeCredentials.map((d: unknown, i: number) => decodeDescriptor(d, i, 'excludeCredentials'))
        : [],
    },
  }
}

export function decodeAuthenticationOptions(publicKey: any): CredentialRequestOptions {
  if (typeof publicKey === 'string') {
    try {
      publicKey = JSON.parse(publicKey)
    } catch {
      throw new Error('Server returned publicKey as invalid JSON text.')
    }
  }
  if (publicKey == null || typeof publicKey !== 'object') {
    throw new Error('Server did not return WebAuthn authentication options (publicKey).')
  }
  publicKey = unwrapYubicoCredentialOptionsPayload(publicKey as Record<string, unknown>)
  return {
    publicKey: {
      ...publicKey,
      challenge: webauthnFieldToArrayBuffer(publicKey.challenge, 'challenge'),
      allowCredentials: Array.isArray(publicKey.allowCredentials)
        ? publicKey.allowCredentials.map((d: unknown, i: number) => decodeDescriptor(d, i, 'allowCredentials'))
        : [],
    },
  }
}

export function serializeRegistrationCredential(credential: PublicKeyCredential): string {
  const response = credential.response as AuthenticatorAttestationResponse
  const payload = {
    id: credential.id,
    rawId: arrayBufferToBase64Url(credential.rawId),
    type: credential.type,
    response: {
      attestationObject: arrayBufferToBase64Url(response.attestationObject),
      clientDataJSON: arrayBufferToBase64Url(response.clientDataJSON),
      transports: typeof response.getTransports === 'function' ? response.getTransports() : [],
    },
    clientExtensionResults: credential.getClientExtensionResults(),
    authenticatorAttachment: 'authenticatorAttachment' in credential ? (credential as any).authenticatorAttachment ?? null : null,
  }
  return JSON.stringify(payload)
}

export function serializeAuthenticationCredential(credential: PublicKeyCredential): string {
  const response = credential.response as AuthenticatorAssertionResponse
  const payload = {
    id: credential.id,
    rawId: arrayBufferToBase64Url(credential.rawId),
    type: credential.type,
    response: {
      authenticatorData: arrayBufferToBase64Url(response.authenticatorData),
      clientDataJSON: arrayBufferToBase64Url(response.clientDataJSON),
      signature: arrayBufferToBase64Url(response.signature),
      userHandle: response.userHandle ? arrayBufferToBase64Url(response.userHandle) : null,
    },
    clientExtensionResults: credential.getClientExtensionResults(),
    authenticatorAttachment: 'authenticatorAttachment' in credential ? (credential as any).authenticatorAttachment ?? null : null,
  }
  return JSON.stringify(payload)
}

export async function createPasskeyFromOptions(publicKey: any) {
  const credential = await navigator.credentials.create(decodeRegistrationOptions(publicKey))
  if (!credential) throw new Error('No credential was created.')
  return serializeRegistrationCredential(credential as PublicKeyCredential)
}

export async function getPasskeyAssertionFromOptions(publicKey: any) {
  const credential = await navigator.credentials.get(decodeAuthenticationOptions(publicKey))
  if (!credential) throw new Error('No credential was returned.')
  return serializeAuthenticationCredential(credential as PublicKeyCredential)
}

export function passkeyCapabilityMessage() {
  if (supportsWebAuthn()) return ''
  return 'This browser or embedded webview does not expose WebAuthn/passkeys. Use a recovery code here, or sign in from a supported browser.'
}
