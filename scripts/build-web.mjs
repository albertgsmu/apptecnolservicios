import { spawnSync } from 'node:child_process'

// The deployed web calls /api and /socket.io on its own HTTPS origin.
// Explicitly override the local VITE_API_URL so a build never points phones at localhost.
for (const command of [['node_modules/typescript/bin/tsc', '-b'], ['node_modules/vite/bin/vite.js', 'build']]) {
  const result = spawnSync(process.execPath, command, { stdio: 'inherit', env: { ...process.env, VITE_API_URL: '' } })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
