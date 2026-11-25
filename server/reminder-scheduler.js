import { createRemoteJWKSet, jwtVerify } from 'jose'

const githubKeys = createRemoteJWKSet(new URL('https://token.actions.githubusercontent.com/.well-known/jwks'), { timeoutDuration: 5000 })
export async function authorizeScheduler(token, keySet = githubKeys) {
  const { payload } = await jwtVerify(token, keySet, { issuer: 'https://token.actions.githubusercontent.com', audience: 'jp-report-reminders', algorithms: ['RS256'], maxTokenAge: '10m', requiredClaims: ['exp', 'iat', 'repository_id', 'repository', 'ref', 'workflow_ref', 'event_name'] })
  if (payload.repository_id !== '1442280260' || payload.repository !== 'albertgsmu/apptecnolservicios' || payload.ref !== 'refs/heads/main' || payload.workflow_ref !== 'albertgsmu/apptecnolservicios/.github/workflows/report-reminders.yml@refs/heads/main' || !['schedule', 'workflow_dispatch'].includes(payload.event_name)) throw new Error('Untrusted scheduler')
  return payload
}

export function registerReminderScheduler(app, { asyncRoute, service }) {
  app.post('/api/reminders/tick', asyncRoute(async (req, res) => {
    const token = req.get('authorization')?.match(/^Bearer (.{1,12000})$/)?.[1]
    try { if (!token) throw new Error('Missing token'); await authorizeScheduler(token) }
    catch { return res.status(401).json({ message: 'Programador no autorizado.' }) }
    await service.tick()
    res.json({ ok: true })
  }))
}
