export function validGeofence(value) {
  return value && Number.isFinite(value.latitude) && Math.abs(value.latitude) <= 90 &&
    Number.isFinite(value.longitude) && Math.abs(value.longitude) <= 180 &&
    Number.isInteger(value.radius) && value.radius >= 25 && value.radius <= 2000
}

export function assessLocation(location, site) {
  const zone = site?.geofence
  if (!validGeofence(zone)) return { status: 'unconfigured', distance: null, radius: null }
  if (location?.status !== 'captured') return { status: 'unavailable', distance: null, radius: zone.radius }
  const radians = degrees => degrees * Math.PI / 180
  const deltaLat = radians(location.latitude - zone.latitude)
  const deltaLon = radians(location.longitude - zone.longitude)
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(radians(zone.latitude)) * Math.cos(radians(location.latitude)) * Math.sin(deltaLon / 2) ** 2
  const distance = 6371000 * 2 * Math.atan2(Math.sqrt(Math.min(1, a)), Math.sqrt(Math.max(0, 1 - a)))
  const status = distance + location.accuracy <= zone.radius ? 'inside' : distance - location.accuracy > zone.radius ? 'outside' : 'uncertain'
  return { status, distance: Math.round(distance), radius: zone.radius, latitude: zone.latitude, longitude: zone.longitude }
}
