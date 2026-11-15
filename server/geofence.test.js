import test from 'node:test'
import assert from 'node:assert/strict'
import { assessLocation, validGeofence } from '../shared/geofence.js'

const site = { geofence: { latitude: 4.65, longitude: -74.06, radius: 100 } }
const reading = { status: 'captured', latitude: 4.65, longitude: -74.06, accuracy: 15 }
test('arrival accounts for GPS accuracy and never treats missing configuration as arrival', () => {
  assert.equal(assessLocation(reading, site).status, 'inside')
  assert.equal(assessLocation({ ...reading, latitude: 4.66 }, site).status, 'outside')
  assert.equal(assessLocation({ ...reading, accuracy: 150 }, site).status, 'uncertain')
  assert.equal(assessLocation({ ...reading, latitude: 4.6509, accuracy: 30 }, site).status, 'uncertain')
  assert.equal(assessLocation({ status: 'denied' }, site).status, 'unavailable')
  assert.equal(assessLocation(reading, {}).status, 'unconfigured')
  assert.equal(validGeofence({ ...site.geofence, radius: 5 }), false)
  assert.equal(validGeofence({ ...site.geofence, latitude: 91 }), false)
  assert.equal(assessLocation(reading, site).distance, 0)
})
