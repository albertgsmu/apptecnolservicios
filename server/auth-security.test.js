import { before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'

let security

before(async () => {
  process.env.MFA_ENCRYPTION_KEY = randomBytes(32).toString('base64')
  security = await import('./auth-security.js')
})

test('TOTP follows RFC 6238 SHA-1 vectors and rejects replayed counters', () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'
  assert.equal(security.createTotpToken(secret, 1), '287082')
  assert.equal(security.verifyTotpToken(secret, '287082', -1, 59_000), 1)
  assert.equal(security.verifyTotpToken(secret, '287082', 1, 59_000), null)
  assert.equal(security.verifyTotpToken(secret, '12345', -1, 59_000), null)
})

test('MFA secrets are encrypted and authenticated', () => {
  const encrypted = security.encryptMfaSecret('totp-secret')
  assert.notEqual(encrypted, 'totp-secret')
  assert.equal(security.decryptMfaSecret(encrypted), 'totp-secret')

  const corrupted = Buffer.from(encrypted, 'base64')
  corrupted[corrupted.length - 1] ^= 0xff
  assert.throws(() => security.decryptMfaSecret(corrupted.toString('base64')))
})

test('session tokens and recovery codes are high-entropy and hashed', () => {
  const token = security.createOpaqueToken()
  const recoveryCode = security.createRecoveryCode()
  assert.equal(token.length, 43)
  assert.equal(recoveryCode.length, 20)
  assert.notEqual(security.hashOpaqueToken(token), token)
  assert.equal(security.hashRecoveryCode(recoveryCode), security.hashRecoveryCode(recoveryCode))
})
