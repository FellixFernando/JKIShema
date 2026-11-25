import { authOptions, resolveNextAuthSecret } from '@/lib/auth'

describe('Auth secret and session hardening', () => {
  it('uses NEXTAUTH_SECRET from the environment', () => {
    expect(process.env.NEXTAUTH_SECRET).toBe('test-secret')
    expect(authOptions.secret).toBe('test-secret')
  })

  it('rejects a missing or blank secret', () => {
    expect(() => resolveNextAuthSecret({})).toThrow(/NEXTAUTH_SECRET/)
    expect(() => resolveNextAuthSecret({ NEXTAUTH_SECRET: '   ' })).toThrow(/NEXTAUTH_SECRET/)
    expect(resolveNextAuthSecret({ NEXTAUTH_SECRET: '  real-secret  ' })).toBe('real-secret')
  })

  it('leaves secure cookie behaviour to NextAuth defaults', () => {
    expect(authOptions.useSecureCookies).toBeUndefined()
    expect(authOptions.cookies).toBeUndefined()
  })

  it('sets a finite session lifetime', () => {
    expect(authOptions.session?.maxAge).toBeGreaterThan(0)
  })
})

describe('Middleware authorization', () => {
  const loadGuard = () => require('@/lib/auth-guard')

  const makeRequest = (pathname: string, cookieValue?: string) => ({
    nextUrl: { pathname },
    cookies: {
      get: () => (cookieValue ? { value: cookieValue } : undefined),
    },
  })

  it('rejects a forged session cookie when there is no valid token', () => {
    const { authorizedCallback } = loadGuard()

    expect(
      authorizedCallback({ req: makeRequest('/admin', 'forged-cookie-value'), token: null })
    ).toBe(false)
  })

  it('accepts a valid token', () => {
    const { authorizedCallback } = loadGuard()

    expect(authorizedCallback({ req: makeRequest('/admin'), token: { sub: 'user-1' } })).toBe(true)
  })

  it('allows the login page without a token', () => {
    const { authorizedCallback } = loadGuard()

    expect(authorizedCallback({ req: makeRequest('/admin/login'), token: null })).toBe(true)
  })
})
