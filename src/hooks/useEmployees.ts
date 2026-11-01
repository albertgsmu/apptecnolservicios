import { useEffect, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
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

export function useEmployees() {
  const [employees, setEmployees] = useState<EmployeeRow[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isMounted = true
    let socket: Socket | undefined

    const loadEmployees = async () => {
      try {
        const response = await fetch('/api/employees')
        if (!response.ok) {
          throw new Error('Erro al cargar empleados')
        }

        const nextEmployees = (await response.json()) as EmployeeRow[]
        if (isMounted) {
          setEmployees(nextEmployees)
        }
      } catch {
        if (isMounted) {
          setEmployees([])
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    loadEmployees()

    socket = io({ transports: ['websocket'] })
    socket.on('employees:updated', (nextEmployees: EmployeeRow[]) => {
      if (isMounted) {
        setEmployees(nextEmployees)
      }
    })

    return () => {
      isMounted = false
      socket?.disconnect()
    }
  }, [])

  const updateEmployeeStatus = async (id: string, status: EmployeeStatus) => {
    const response = await fetch(`/api/employees/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })

    if (!response.ok) {
      throw new Error('No se pudo actualizar el estado del empleado')
    }

    const updated = (await response.json()) as EmployeeRow
    setEmployees((current) => current.map((employee) => (employee.id === id ? updated : employee)))
    return updated
  }

  return { employees, isLoading, updateEmployeeStatus }
}
