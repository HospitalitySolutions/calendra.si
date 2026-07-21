import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const DIST_DIR = path.resolve('dist')
const ASSET_LIMITS = new Map([
  ['.js', 900 * 1024],
  ['.css', 1125 * 1024],
])

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await walk(absolutePath))
    else if (entry.isFile()) files.push(absolutePath)
  }
  return files
}

function formatKiB(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`
}

let files
try {
  files = await walk(DIST_DIR)
} catch (error) {
  console.error(`Bundle budget check failed: ${DIST_DIR} does not exist. Build the frontend first.`)
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}

const violations = []
const checked = []
for (const file of files) {
  const extension = path.extname(file)
  const limit = ASSET_LIMITS.get(extension)
  if (!limit) continue
  const { size } = await stat(file)
  const relativePath = path.relative(DIST_DIR, file)
  checked.push({ relativePath, size, limit })
  if (size > limit) violations.push({ relativePath, size, limit })
}

checked.sort((left, right) => right.size - left.size)
console.log('Largest JavaScript/CSS assets:')
for (const asset of checked.slice(0, 10)) {
  console.log(`- ${asset.relativePath}: ${formatKiB(asset.size)} / ${formatKiB(asset.limit)}`)
}

if (violations.length > 0) {
  console.error('\nBundle budget exceeded:')
  for (const asset of violations) {
    console.error(`- ${asset.relativePath}: ${formatKiB(asset.size)} > ${formatKiB(asset.limit)}`)
  }
  process.exit(1)
}

console.log('\nBundle budgets passed.')
