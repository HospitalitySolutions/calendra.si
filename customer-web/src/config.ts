export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
export const MARKETING_BASE_URL = (import.meta.env.VITE_MARKETING_BASE_URL || 'https://calendra.si').replace(/\/$/, '')
export const CUSTOMER_APP_NAME = 'Calendra'
export const CUSTOMER_ACCOUNT_BASE_PATH = (import.meta.env.VITE_CUSTOMER_ACCOUNT_BASE_PATH || '/racun').replace(/\/$/, '') || '/racun'
