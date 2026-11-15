import { useEffect, useState } from 'react'
import {
  createApplicant,
  fetchApplicants,
  updateApplicantStatus,
} from '../lib/dataService'
import type { Applicant, ApplicantStatus } from '../types'

export function useApplicants(isEnabled: boolean) {
  const [applicants, setApplicants] = useState<Applicant[]>([])
  const [isLoadingData, setIsLoadingData] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (!isEnabled) {
      return
    }

    let isMounted = true

    const loadApplicants = async () => {
      try {
        const nextApplicants = await fetchApplicants()
        if (isMounted) {
          setApplicants(nextApplicants)
          setLoadError(null)
        }
      } catch (error) {
        if (isMounted) {
          setLoadError(error instanceof Error ? error.message : 'No se pudieron cargar las solicitudes.')
        }
      } finally {
        if (isMounted) {
          setIsLoadingData(false)
        }
      }
    }

    loadApplicants()
    const refresh = () => { if (isMounted && document.visibilityState === 'visible') void loadApplicants() }
    const interval = window.setInterval(refresh, 30000)
    window.addEventListener('focus', refresh)
    return () => {
      isMounted = false
      window.clearInterval(interval)
      window.removeEventListener('focus', refresh)
    }
  }, [isEnabled])

  const addApplicant = async (payload: Omit<Applicant, 'id' | 'status' | 'createdAt'>) => {
    const createdApplicant = await createApplicant(payload)
    setApplicants((current) => [createdApplicant, ...current])
    return createdApplicant
  }

  const decideApplicant = async (id: string, status: ApplicantStatus) => {
    const updated = await updateApplicantStatus(id, status)
    setApplicants((current) => current.map((entry) => (entry.id === id ? updated : entry)))
    return updated
  }

  return {
    applicants,
    isLoadingData,
    loadError,
    addApplicant,
    decideApplicant,
    setApplicants,
  }
}
