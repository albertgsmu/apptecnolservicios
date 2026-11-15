import express from 'express'
import helmet from 'helmet'
import path from 'node:path'
import { access } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

export function webAllowedOrigins(env = process.env) {
  const configured = env.ALLOWED_ORIGINS ?? (env.NODE_ENV === 'production' ? '' : 'http://localhost:5173,http://localhost:5177')
  const values = [...configured.split(','), env.APP_ORIGIN, env.RENDER_EXTERNAL_URL].filter(value => value?.trim())
  return [...new Set(values.map(value => {
    const candidate = value.trim()
    if (candidate.includes('*')) throw new Error('Los orígenes permitidos deben ser exactos, sin comodines.')
    const url = new URL(candidate)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Configura un origen completo, sin rutas ni credenciales.')
    return url.origin
  }))]
}

export async function registerWebHosting(app, env = process.env) {
  app.use('/api', (_req, res) => res.status(404).json({ message: 'Ruta de API no encontrada.' }))
  if (env.SERVE_FRONTEND !== 'true') return
  const directory = fileURLToPath(new URL('../dist/', import.meta.url))
  const index = path.join(directory, 'index.html')
  try { await access(index) }
  catch { throw new Error('Falta la web compilada. Ejecuta npm run build:web antes de iniciar el servicio.') }
  const websocketOrigins = webAllowedOrigins(env).map(origin => origin.replace(/^http/, 'ws'))
  app.use(helmet.contentSecurityPolicy({ directives: {
    imgSrc: ["'self'", 'data:', 'blob:'], mediaSrc: ["'self'", 'blob:'], connectSrc: ["'self'", ...websocketOrigins],
  } }))
  app.use('/assets', express.static(path.join(directory, 'assets'), { immutable: true, maxAge: '1y', dotfiles: 'deny' }))
  app.use(express.static(directory, { dotfiles: 'deny', maxAge: 0 }))
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/socket.io') || path.extname(req.path) || !req.accepts('html')) return next()
    res.set('Cache-Control', 'no-cache').sendFile(index)
  })
}
