import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const ROOT = path.resolve('.')
const BUDGET_PATH = path.join(ROOT, 'src/config/performanceBudgets.json')
const PREFETCH_PATH = path.join(ROOT, 'src/queries/navigationPrefetch.ts')
const API_PATH = path.join(ROOT, 'src/api.ts')
const MAIN_PATH = path.join(ROOT, 'src/main.tsx')
const MONITOR_PATH = path.join(ROOT, 'src/lib/performanceMonitor.ts')
const QUERY_CLIENT_PATH = path.join(ROOT, 'src/queries/queryClient.ts')
const DIST_ASSETS = path.join(ROOT, 'dist/assets')

const budgets = JSON.parse(await readFile(BUDGET_PATH, 'utf8'))
const failures = []
const notes = []

function fail(message) {
  failures.push(message)
}

function requirePositiveNumber(value, label) {
  if (!Number.isFinite(Number(value)) || Number(value) <= 0) fail(`${label} must be a positive number.`)
}

if (budgets.version !== 1) fail(`Unsupported performance budget version: ${budgets.version}`)
requirePositiveNumber(budgets.runtime?.minimumSamples, 'runtime.minimumSamples')
requirePositiveNumber(budgets.runtime?.apiP95Ms, 'runtime.apiP95Ms')
requirePositiveNumber(budgets.runtime?.complexApiP95Ms, 'runtime.complexApiP95Ms')
requirePositiveNumber(budgets.runtime?.navigationTargetMs, 'runtime.navigationTargetMs')
requirePositiveNumber(budgets.runtime?.navigationP95MaxMs, 'runtime.navigationP95MaxMs')

if (Number(budgets.runtime?.navigationTargetMs) >= Number(budgets.runtime?.navigationP95MaxMs)) {
  fail('runtime.navigationTargetMs must be lower than runtime.navigationP95MaxMs.')
}

const expectedFamilies = [
  'calendar', 'clients', 'appointments', 'billing', 'analytics', 'inbox',
  'configuration', 'session-types', 'consultants', 'consumables',
]
for (const family of expectedFamilies) {
  const budget = budgets.runtime?.fanOut?.[family]
  if (!budget) {
    fail(`Missing fan-out budget for ${family}.`)
    continue
  }
  requirePositiveNumber(budget.target, `runtime.fanOut.${family}.target`)
  requirePositiveNumber(budget.max, `runtime.fanOut.${family}.max`)
  requirePositiveNumber(budget.prefetchMax, `runtime.fanOut.${family}.prefetchMax`)
  if (Number(budget.target) > Number(budget.max)) fail(`Fan-out target exceeds maximum for ${family}.`)
}

const [prefetchSource, apiSource, mainSource, monitorSource, queryClientSource] = await Promise.all([
  readFile(PREFETCH_PATH, 'utf8'),
  readFile(API_PATH, 'utf8'),
  readFile(MAIN_PATH, 'utf8'),
  readFile(MONITOR_PATH, 'utf8'),
  readFile(QUERY_CLIENT_PATH, 'utf8'),
])

for (const required of ['recordApiRequestStarted', 'recordApiRequestFinished', 'recordApiTiming']) {
  if (!apiSource.includes(required)) fail(`API performance instrumentation is missing ${required}.`)
}
for (const required of ['installPerformanceDebugApi', 'installQueryPerformanceTracking']) {
  if (!mainSource.includes(required)) fail(`Main performance instrumentation is missing ${required}.`)
}
for (const required of ['duplicateRequests', 'getPerformanceGuardrailReport', 'uniqueApiGetCount']) {
  if (!monitorSource.includes(required)) fail(`Performance monitor regression: ${required} is missing.`)
}
if (!queryClientSource.includes('refetchOnWindowFocus: false')) {
  fail('Shared QueryClient must keep refetchOnWindowFocus disabled to avoid global navigation request fan-out.')
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await walk(full))
    else if (entry.isFile() && /\.[cm]?[jt]sx?$/.test(entry.name)) files.push(full)
  }
  return files
}

const sourceFiles = await walk(path.join(ROOT, 'src'))
const queryClientConstructors = []
for (const file of sourceFiles) {
  const source = await readFile(file, 'utf8')
  const matches = source.match(/new\s+QueryClient\s*\(/g) || []
  for (let index = 0; index < matches.length; index += 1) queryClientConstructors.push(path.relative(ROOT, file))
}
if (queryClientConstructors.length !== 1 || queryClientConstructors[0] !== 'src/queries/queryClient.ts') {
  fail(`Expected exactly one shared QueryClient in src/queries/queryClient.ts; found: ${queryClientConstructors.join(', ') || 'none'}.`)
}

const prefetchFunctionByFamily = {
  calendar: 'prefetchCalendar',
  clients: 'prefetchClients',
  appointments: 'prefetchAppointments',
  billing: 'prefetchBilling',
  analytics: 'prefetchAnalytics',
  inbox: 'prefetchInbox',
  configuration: 'prefetchConfiguration',
  'session-types': 'prefetchSessionTypes',
  consultants: 'prefetchConsultants',
  consumables: 'prefetchConsumables',
}

function extractFunctionBody(source, functionName) {
  const marker = `async function ${functionName}`
  const start = source.indexOf(marker)
  if (start < 0) return null
  const brace = source.indexOf('{', start)
  if (brace < 0) return null
  let depth = 0
  for (let index = brace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    else if (source[index] === '}') {
      depth -= 1
      if (depth === 0) return source.slice(brace + 1, index)
    }
  }
  return null
}

console.log('Navigation prefetch fan-out guardrails:')
for (const [family, functionName] of Object.entries(prefetchFunctionByFamily)) {
  const body = extractFunctionBody(prefetchSource, functionName)
  if (body == null) {
    fail(`Could not find ${functionName} in navigationPrefetch.ts.`)
    continue
  }
  const count = (body.match(/prefetchQuery\s*\(/g) || []).length
  const max = Number(budgets.runtime.fanOut[family].prefetchMax)
  console.log(`- ${family}: ${count} declared prefetch queries / ${max} max`)
  if (count > max) fail(`${family} declares ${count} prefetch queries; configured maximum is ${max}.`)
}

let assetNames = []
try {
  assetNames = await readdir(DIST_ASSETS)
} catch {
  fail('dist/assets does not exist. Run the production build before performance guardrails.')
}

console.log('\nCritical chunk guardrails:')
for (const chunk of budgets.bundle?.criticalChunks || []) {
  const matches = assetNames.filter((name) => name.startsWith(chunk.prefix) && name.endsWith(chunk.extension))
  if (matches.length === 0) {
    if (chunk.required) fail(`Required critical chunk ${chunk.prefix}*${chunk.extension} was not produced.`)
    continue
  }
  const limitBytes = Number(chunk.maxKiB) * 1024
  for (const name of matches) {
    const { size } = await stat(path.join(DIST_ASSETS, name))
    notes.push(`${name}: ${(size / 1024).toFixed(1)} KiB / ${chunk.maxKiB} KiB`)
    if (size > limitBytes) fail(`${name} is ${(size / 1024).toFixed(1)} KiB; critical-chunk budget is ${chunk.maxKiB} KiB.`)
  }
}
for (const note of notes) console.log(`- ${note}`)

if (failures.length > 0) {
  console.error('\nPerformance guardrails failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('\nPerformance guardrails passed.')
