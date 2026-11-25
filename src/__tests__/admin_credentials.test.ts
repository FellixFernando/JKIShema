import {
  assertStrongPassword,
  generateAdminPassword,
  parseCreateAdminArgs,
  requireEnv,
} from '@/lib/admin-credentials'

describe('requireEnv', () => {
  it('returns a trimmed value', () => {
    expect(requireEnv('ADMIN_USERNAME', { ADMIN_USERNAME: '  alice  ' })).toBe('alice')
  })

  it('throws a message naming the variable when missing or blank', () => {
    expect(() => requireEnv('ADMIN_USERNAME', {})).toThrow(/ADMIN_USERNAME/)
    expect(() => requireEnv('ADMIN_USERNAME', { ADMIN_USERNAME: '   ' })).toThrow(/ADMIN_USERNAME/)
  })
})

describe('assertStrongPassword', () => {
  it('rejects short or blank passwords', () => {
    expect(() => assertStrongPassword('short')).toThrow(/at least 12/)
    expect(() => assertStrongPassword('            ')).toThrow(/at least 12/)
  })

  it('accepts a password of 12 characters or more', () => {
    expect(assertStrongPassword('a-long-enough-password')).toBe('a-long-enough-password')
  })
})

describe('generateAdminPassword', () => {
  it('generates 16 characters without ambiguous ones', () => {
    const password = generateAdminPassword()

    expect(password).toHaveLength(16)
    expect(password).toMatch(/^[A-HJ-NP-Za-km-z2-9]+$/)
  })

  it('generates a different value each time', () => {
    expect(generateAdminPassword()).not.toBe(generateAdminPassword())
  })
})

describe('parseCreateAdminArgs', () => {
  it('requires a username and defaults to the ADMIN role', () => {
    expect(parseCreateAdminArgs(['--username', 'alice'])).toEqual({
      username: 'alice',
      role: 'ADMIN',
      password: undefined,
      help: false,
    })
    expect(() => parseCreateAdminArgs([])).toThrow(/--username/)
  })

  it('accepts the MASTER role and an explicit password', () => {
    expect(
      parseCreateAdminArgs(['--username', 'bob', '--role', 'MASTER', '--password', 'a-long-enough-password'])
    ).toEqual({
      username: 'bob',
      role: 'MASTER',
      password: 'a-long-enough-password',
      help: false,
    })
  })

  it('rejects an unknown role and unknown arguments', () => {
    expect(() => parseCreateAdminArgs(['--username', 'alice', '--role', 'OWNER'])).toThrow(/role/i)
    expect(() => parseCreateAdminArgs(['--username', 'alice', '--title', 'boss'])).toThrow(/title/)
  })

  it('supports --help', () => {
    expect(parseCreateAdminArgs(['--help']).help).toBe(true)
  })
})
