export type LocationReading = { status: 'captured'; latitude: number; longitude: number; accuracy: number; capturedAt: string } | { status: 'denied' | 'timeout' | 'unavailable' }

export function readLocation(): Promise<LocationReading> {
  return new Promise(resolve => {
    try {
      if (!navigator.geolocation || !window.isSecureContext) { resolve({ status: 'unavailable' }); return }
      navigator.geolocation.getCurrentPosition(position => resolve({ status: 'captured', latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy, capturedAt: new Date(position.timestamp).toISOString() }), error => resolve({ status: error.code === 1 ? 'denied' : error.code === 3 ? 'timeout' : 'unavailable' }), { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 })
    } catch { resolve({ status: 'unavailable' }) }
  })
}
