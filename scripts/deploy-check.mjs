import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const envPath = path.join(root, '.env')
const env = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : ''
const parsed = Object.fromEntries(
  env
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((line) => !line.trim().startsWith('#'))
    .map((line) => {
      const idx = line.indexOf('=')
      if (idx === -1) {
        return null
      }

      const key = line.slice(0, idx).trim()
      const value = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '')
      return [key, value]
    })
    .filter(Boolean),
)

const required = {
  server: ['DATABASE_URL', 'JWT_SECRET'],
  frontend: ['VITE_API_URL'],
}

const warnings = []

for (const [section, keys] of Object.entries(required)) {
  for (const key of keys) {
    const value = process.env[key] ?? parsed[key]
    if (!value) {
      warnings.push(`${section}: missing ${key}`)
    }
  }
}

const localApi = process.env.VITE_API_URL ?? parsed.VITE_API_URL ?? 'http://localhost:3003'
console.log('Deployment check')
console.log(`- API target: ${localApi}`)

if (warnings.length) {
  console.log('WARNINGS:')
  for (const warning of warnings) {
    console.log(`  - ${warning}`)
  }
} else {
  console.log('Environment variables present.')
}

const healthUrl = localApi.replace(/\/$/, '') + '/api/health'

try {
  const response = await fetch(healthUrl, { signal: AbortSignal.timeout(5000) })
  if (response.ok) {
    const body = await response.json()
    console.log(`Health check passed: ${JSON.stringify(body)}`)
  } else {
    console.log(`Health check failed with status ${response.status}`)
    process.exitCode = 1
  }
} catch (error) {
  console.log(`Health check unavailable: ${error instanceof Error ? error.message : String(error)}`)
  console.log('Start the app with "npm run dev" before running deployment checks.')
  process.exitCode = 1
}
