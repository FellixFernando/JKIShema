import { checkRateLimit, resetRateLimitForTests } from '@/lib/rate-limit'

beforeEach(() => {
  resetRateLimitForTests()
})

describe('checkRateLimit', () => {
  const options = { limit: 2, windowMs: 1000 }

  it('allows up to the limit and then blocks', () => {
    expect(checkRateLimit('k', options, 0).allowed).toBe(true)
    expect(checkRateLimit('k', options, 10).allowed).toBe(true)

    const blocked = checkRateLimit('k', options, 20)
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterMs).toBe(980)
  })

  it('resets after the window', () => {
    checkRateLimit('k', options, 0)
    checkRateLimit('k', options, 0)
    expect(checkRateLimit('k', options, 999).allowed).toBe(false)
    expect(checkRateLimit('k', options, 1000).allowed).toBe(true)
  })

  it('keeps separate keys independent', () => {
    checkRateLimit('a', options, 0)
    checkRateLimit('a', options, 0)

    expect(checkRateLimit('a', options, 0).allowed).toBe(false)
    expect(checkRateLimit('b', options, 0).allowed).toBe(true)
  })
})
