import { useEffect, useState } from 'react'
import {
  createApplicant,
  fetchApplicants,
  saveApplicants,
  updateApplicantStatus,
} from '../lib/dataService'
import type { Applicant, ApplicantStatus } from '../types'

export function useApplicants() {
  const [applicants, setApplicants] = useState<Applicant[]>([])
  const [isLoadingData, setIsLoadingData] = useState(true)

  useEffect(() => {
    let isMounted = true

    const loadApplicants = async () => {
      try {
        const nextApplicants = await fetchApplicants()
        if (isMounted) {
          setApplicants(nextApplicants)
        }
      } finally {
        if (isMounted) {
          setIsLoadingData(false)
        }
      }
    }

    loadApplicants()
    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (applicants.length > 0 || !isLoadingData) {
      saveApplicants(applicants)
    }
  }, [applicants, isLoadingData])

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
    addApplicant,
    decideApplicant,
    setApplicants,
  }
}
