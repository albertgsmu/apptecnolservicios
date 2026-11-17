import test from 'node:test'
import assert from 'node:assert/strict'
import { managerMfaRequired } from './auth-policy.js'

test('manager login uses a password unless MFA is explicitly enabled', () => {
  assert.equal(managerMfaRequired({}), false)
  assert.equal(managerMfaRequired({ NODE_ENV: 'production' }), false)
  assert.equal(managerMfaRequired({ NODE_ENV: 'production', MANAGER_MFA_REQUIRED: 'false' }), false)
  assert.equal(managerMfaRequired({ NODE_ENV: 'production', MANAGER_MFA_REQUIRED: 'true' }), true)
  assert.equal(managerMfaRequired({ NODE_ENV: 'development', MANAGER_MFA_REQUIRED: 'false' }), false)
  assert.equal(managerMfaRequired({ NODE_ENV: 'test', MANAGER_MFA_REQUIRED: 'true' }), true)
})
