const fs = require('fs')
const path = require('path')

const pluginGradlePath = path.join(
  __dirname,
  '..',
  'node_modules',
  '@capacitor-community',
  'speech-recognition',
  'android',
  'build.gradle'
)

try {
  if (!fs.existsSync(pluginGradlePath)) {
    process.exit(0)
  }
  const original = fs.readFileSync(pluginGradlePath, 'utf8')
  const patched = original.replace(
    "getDefaultProguardFile('proguard-android.txt')",
    "getDefaultProguardFile('proguard-android-optimize.txt')"
  )
  if (patched !== original) {
    fs.writeFileSync(pluginGradlePath, patched, 'utf8')
    console.log('[postinstall] Patched speech-recognition Android proguard file.')
  }
} catch (err) {
  console.warn('[postinstall] Could not patch speech-recognition plugin:', err?.message || err)
}
