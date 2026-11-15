import {
  createHash,
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

const getMfaEncryptionKey = () => {
  const key = process.env.MFA_ENCRYPTION_KEY
    ? Buffer.from(process.env.MFA_ENCRYPTION_KEY, 'base64')
    : null
  if (!key || key.length !== 32) {
    throw new Error('MFA_ENCRYPTION_KEY debe ser una clave aleatoria de 32 bytes codificada en base64.')
  }
  return key
}

export const generateTotpSecret = () => {
  const bytes = randomBytes(20)
  let bits = ''
  for (const byte of bytes) {
    bits += byte.toString(2).padStart(8, '0')
  }

  let encoded = ''
  for (let index = 0; index < bits.length; index += 5) {
    encoded += BASE32_ALPHABET[parseInt(bits.slice(index, index + 5).padEnd(5, '0'), 2)]
  }

  return encoded
}

const decodeBase32 = (value) => {
  const normalized = value.replace(/=+$/, '').toUpperCase()
  let bits = ''
  for (const character of normalized) {
    const digit = BASE32_ALPHABET.indexOf(character)
    if (digit < 0) {
      throw new Error('Secreto TOTP inválido.')
    }
    bits += digit.toString(2).padStart(5, '0')
  }

  const bytes = []
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(parseInt(bits.slice(index, index + 8), 2))
  }
  return Buffer.from(bytes)
}

export const encryptMfaSecret = (secret) => {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', getMfaEncryptionKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64')
}

export const decryptMfaSecret = (value) => {
  const payload = Buffer.from(value, 'base64')
  if (payload.length < 29) {
    throw new Error('El secreto MFA cifrado está dañado.')
  }
  const decipher = createDecipheriv('aes-256-gcm', getMfaEncryptionKey(), payload.subarray(0, 12))
  decipher.setAuthTag(payload.subarray(12, 28))
  return Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]).toString('utf8')
}

export const createTotpToken = (secret, counter) => {
  const counterBuffer = Buffer.alloc(8)
  counterBuffer.writeBigUInt64BE(BigInt(counter))
  const digest = createHmac('sha1', decodeBase32(secret)).update(counterBuffer).digest()
  const offset = digest[digest.length - 1] & 0x0f
  const number = digest.readUInt32BE(offset) & 0x7fffffff
  return String(number % 1_000_000).padStart(6, '0')
}

export const verifyTotpToken = (secret, token, lastAcceptedCounter = -1, now = Date.now()) => {
  if (typeof token !== 'string' || !/^\d{6}$/.test(token)) {
    return null
  }

  const currentCounter = Math.floor(now / 30_000)
  for (const counter of [currentCounter - 1, currentCounter, currentCounter + 1]) {
    if (counter <= lastAcceptedCounter || counter < 0) {
      continue
    }
    const expected = Buffer.from(createTotpToken(secret, counter))
    const supplied = Buffer.from(token)
    if (timingSafeEqual(expected, supplied)) {
      return counter
    }
  }
  return null
}

export const createRecoveryCode = () => randomBytes(10).toString('hex').toUpperCase()

export const hashRecoveryCode = (code) => createHash('sha256')
  .update(code.replace(/[\s-]/g, '').toUpperCase())
  .digest('hex')

export const createOpaqueToken = () => randomBytes(32).toString('base64url')

export const hashOpaqueToken = (token) => createHash('sha256')
  .update(token)
  .digest('hex')

export const createCsrfToken = () => randomBytes(32).toString('base64url')

export const createOtpAuthUri = (email, secret) => {
  const issuer = 'JP Mantenimiento Integral'
  const label = `${issuer}:${email}`
  return `otpauth://totp/${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`
}
