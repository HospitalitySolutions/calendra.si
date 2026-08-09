import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { evaluatePerformanceSnapshot } from '../src/lib/performanceGuardrails.mjs'

const snapshotArgument = process.argv[2]
if (!snapshotArgument) {
  console.error('Usage: npm run check:runtime-performance -- <performance-snapshot.json>')
  console.error('The JSON must be the value returned by window.calendraPerformance.snapshot().')
  process.exit(2)
}

const snapshotPath = path.resolve(snapshotArgument)
const budgets = JSON.parse(await readFile(path.resolve('src/config/performanceBudgets.json'), 'utf8'))
const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'))
const report = evaluatePerformanceSnapshot(snapshot, budgets)

console.log(`Runtime performance guardrails: ${report.passed ? 'PASS' : 'FAIL'}`)
for (const observation of report.observations) {
  console.log(`- ${observation.type} ${observation.key}: p95 ${observation.p95Ms}ms / ${observation.budgetMs}ms (${observation.samples} samples)`)
}
if (report.warnings.length > 0) {
  console.warn('\nWarnings:')
  for (const warning of report.warnings) console.warn(`- [${warning.code}] ${warning.message}`)
}
if (report.violations.length > 0) {
  console.error('\nViolations:')
  for (const violation of report.violations) console.error(`- [${violation.code}] ${violation.message}`)
  process.exit(1)
}
