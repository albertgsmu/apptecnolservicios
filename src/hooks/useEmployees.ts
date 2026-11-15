import { useEffect, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import { apiRequest, getApiBaseUrl } from '../lib/dataService'
import type { EmployeeStatus } from '../types'

export type EmployeeRow = {
  id: string
  name: string
  area: string
  title: string
  status: EmployeeStatus
  shift: string
  score: number
  lastEntry: string
}

export function useEmployees(isEnabled: boolean) {
  const [employees, setEmployees] = useState<EmployeeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let isMounted = true
    let socket: Socket | undefined

    if (!isEnabled) {
      return () => {
        isMounted = false
      }
    }

    const loadEmployees = async () => {
      if (!isMounted) return
      setLoading(true)
      try {
        const nextEmployees = await apiRequest<EmployeeRow[]>('/employees')
        if (isMounted) {
          setEmployees(nextEmployees)
          setError('')
        }
      } catch (error) {
        if (isMounted) {
          setError(error instanceof Error ? error.message : 'No se pudo consultar el personal.')
        }
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    queueMicrotask(() => { if (isMounted) void loadEmployees() })

    socket = io(getApiBaseUrl() || undefined, {
      transports: ['websocket'],
      withCredentials: true,
    })
    socket.on('employees:updated', (nextEmployees: EmployeeRow[]) => {
      if (isMounted) {
        setEmployees(nextEmployees)
        setError('')
        setLoading(false)
      }
    })

    return () => {
      isMounted = false
      socket?.disconnect()
    }
  }, [isEnabled, revision])

  const updateEmployeeStatus = async (id: string, status: EmployeeStatus) => {
    const updated = await apiRequest<EmployeeRow>(`/employees/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    })
    setEmployees((current) => current.map((employee) => (employee.id === id ? updated : employee)))
    return updated
  }

  return { employees: isEnabled ? employees : [], loading: isEnabled && loading, error: isEnabled ? error : '', reload: () => setRevision(current => current + 1), updateEmployeeStatus }
}
