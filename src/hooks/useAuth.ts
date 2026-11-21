import { useCallback, useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { getApiBaseUrl, getSessionInfo, loginUser, logoutUser, saveSessionUser } from '../lib/dataService'
import type { SessionUser } from '../types'

export function useAuth() {
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [isRestoringSession, setIsRestoringSession] = useState(true)
  const [sessionError, setSessionError] = useState('')
  const sessionVersion = useRef(0)
  useEffect(() => {
    const expire = () => { sessionVersion.current++; setSessionUser(null); setIsLoggedIn(false); saveSessionUser(null) }
    window.addEventListener('jp-session-expired', expire)
    const socket = isLoggedIn ? io(getApiBaseUrl() || undefined, { transports: ['websocket'], withCredentials: true }) : null
    socket?.on('session-revoked', expire)
    return () => { window.removeEventListener('jp-session-expired', expire); socket?.disconnect() }
  }, [isLoggedIn])

  const login = useCallback(async ({ email, password }: { email: string; password: string }) => {
    sessionVersion.current++
    const result = await loginUser({ email, password })
    if (result.nextStep === 'authenticated') {
      setSessionUser(result.user)
      setIsLoggedIn(true)
    }
    return result
  }, [])

  const restoreSession = useCallback(async () => {
    const version = ++sessionVersion.current
    setIsRestoringSession(true)
    setSessionError('')
    try {
      const user = await getSessionInfo()
      if (version !== sessionVersion.current) return null
      setSessionUser(user)
      setIsLoggedIn(Boolean(user))
      return user
    } catch (error) {
      if (version !== sessionVersion.current) return null
      setSessionUser(null)
      setIsLoggedIn(false)
      setSessionError(error instanceof Error ? error.message : 'No se pudo restaurar la sesión.')
      return null
    } finally {
      if (version === sessionVersion.current) setIsRestoringSession(false)
    }
  }, [])

  const completeLogin = useCallback((user: SessionUser) => {
    sessionVersion.current++
    setSessionError('')
    setSessionUser(user)
    setIsLoggedIn(true)
    saveSessionUser(user)
  }, [])

  const logout = useCallback(async () => {
    sessionVersion.current++
    try {
      await logoutUser()
    } finally {
      setSessionUser(null)
      setIsLoggedIn(false)
      saveSessionUser(null)
    }
  }, [])

  return {
    sessionUser,
    isLoggedIn,
    login,
    logout,
    completeLogin,
    restoreSession,
    isRestoringSession,
    sessionError,
    setSessionUser,
    setIsLoggedIn,
  }
}
