import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const forbiddenNames = [
  'VITE_API_URL',
  'VITE_API_HOST',
  'VITE_API_PORT',
  'VITE_API_PROTOCOL',
]

const forbiddenPatterns = [
  /localhost/i,
  /127\.0\.0\.1/,
  /10\.0\.2\.2/,
  /192\.168\./,
  /staging\.calendra\.si/i,
  /:4000/,
]

const allowedWebApiUrls = [
  '/api',
  'https://app.calendra.si/api',
]

const envFiles = [
  '.env',
  '.env.local',
  '.env.production',
  '.env.production.local',
]

function fail(message) {
  console.error(`Production frontend validation failed: ${message}`)
  process.exit(1)
}

function parseEnvLine(line) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) return null

  const withoutExport = trimmed.startsWith('export ') ? trimmed.slice('export '.length).trim() : trimmed
  const equalsIndex = withoutExport.indexOf('=')
  if (equalsIndex === -1) return null

  const key = withoutExport.slice(0, equalsIndex).trim()
  let value = withoutExport.slice(equalsIndex + 1).trim()

  if (!key) return null

  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1)
  }

  return [key, value]
}

function readEnvFiles() {
  const values = new Map()

  for (const fileName of envFiles) {
    const filePath = path.resolve(process.cwd(), fileName)
    if (!fs.existsSync(filePath)) continue

    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/)
    for (const line of lines) {
      const parsed = parseEnvLine(line)
      if (!parsed) continue
      const [key, value] = parsed
      values.set(key, value)
    }
  }

  return values
}

const fileEnv = readEnvFiles()

function getEnvValue(name) {
  if (process.env[name] !== undefined) return process.env[name]
  return fileEnv.get(name)
}

function describeSource(name) {
  return process.env[name] !== undefined ? 'environment' : 'production env file'
}

for (const name of forbiddenNames) {
  const value = getEnvValue(name)?.trim()
  if (value) {
    fail(`${name} must not be set for the production web build. Found in ${describeSource(name)}.`)
  }
}

const webApiUrl = getEnvValue('VITE_WEB_API_URL')?.trim()
if (webApiUrl && !allowedWebApiUrls.includes(webApiUrl)) {
  fail(`VITE_WEB_API_URL is not allowed for production: ${webApiUrl}`)
}

const platform = (getEnvValue('VITE_APP_PLATFORM') || getEnvValue('VITE_PLATFORM'))?.trim().toLowerCase()
if (platform && ['android', 'ios'].includes(platform)) {
  fail(`Production web build must not use mobile platform mode: ${platform}`)
}

const valuesToScan = new Map()
for (const [key, value] of fileEnv.entries()) valuesToScan.set(key, value)
for (const [key, value] of Object.entries(process.env)) valuesToScan.set(key, value)

for (const [key, value] of valuesToScan.entries()) {
  if (!key.startsWith('VITE_') || !value) continue
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(String(value))) {
      fail(`${key} contains a forbidden production value: ${value}`)
    }
  }
}

console.log('Production frontend environment validation passed.')
