import { useCallback, useState } from 'react'
import { getSessionInfo, getSessionUser, loginUser, saveSessionUser } from '../lib/dataService'
import type { SessionUser } from '../types'

export function useAuth() {
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(() => getSessionUser())
  const [isLoggedIn, setIsLoggedIn] = useState(Boolean(sessionUser))

  const login = useCallback(async ({ email, password, role }: { email: string; password: string; role: SessionUser['role'] }) => {
    const user = await loginUser({ email, password, role })
    setSessionUser(user)
    setIsLoggedIn(true)
    saveSessionUser(user)
    return user
  }, [])

  const restoreSession = useCallback(async () => {
    const user = await getSessionInfo()
    setSessionUser(user)
    setIsLoggedIn(Boolean(user))
    return user
  }, [])

  const logout = useCallback(() => {
    setSessionUser(null)
    setIsLoggedIn(false)
    saveSessionUser(null)
  }, [])

  return {
    sessionUser,
    isLoggedIn,
    login,
    logout,
    restoreSession,
    setSessionUser,
    setIsLoggedIn,
  }
}
