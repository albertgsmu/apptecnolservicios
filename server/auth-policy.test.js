import test from 'node:test'
import assert from 'node:assert/strict'
import { managerMfaRequired } from './auth-policy.js'

test('MFA is required by default and always in production', () => {
  assert.equal(managerMfaRequired({}), true)
  assert.equal(managerMfaRequired({ NODE_ENV: 'production', MANAGER_MFA_REQUIRED: 'false' }), true)
  assert.equal(managerMfaRequired({ NODE_ENV: 'development', MANAGER_MFA_REQUIRED: 'false' }), false)
  assert.equal(managerMfaRequired({ NODE_ENV: 'test', MANAGER_MFA_REQUIRED: 'true' }), true)
})
