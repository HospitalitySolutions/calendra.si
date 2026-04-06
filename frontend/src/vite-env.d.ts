/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  /** Optional override when running in a browser (never uses emulator-only hosts). */
  readonly VITE_WEB_API_URL?: string
}
