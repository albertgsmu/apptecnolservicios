import { useEffect, useRef } from 'react'

export function useModalDialog(onClose: () => void, busy: boolean) {
  const container = useRef<HTMLDivElement>(null)
  const busyRef = useRef(busy)
  useEffect(() => { busyRef.current = busy }, [busy])

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    container.current?.querySelector<HTMLElement>('input:not(:disabled), select:not(:disabled), button')?.focus()

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) onClose()
      if (event.key !== 'Tab') return
      const controls = Array.from(container.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)',
      ) ?? [])
      const first = controls[0], last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }

    document.addEventListener('keydown', handleKey)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKey)
      previousFocus?.focus()
    }
  }, [onClose])

  return container
}
