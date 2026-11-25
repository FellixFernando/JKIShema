import { getMetaWhatsAppConfig } from '@/services/meta-whatsapp.client'

describe('WhatsApp mock-mode default', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  // Next.js types declare NODE_ENV readonly; the cast keeps the test type-checked.
  const setNodeEnv = (value: string) => {
    ;(process.env as Record<string, string | undefined>).NODE_ENV = value
  }

  afterAll(() => {
    process.env = originalEnv
  })

  it('mocks by default when NODE_ENV is not production and the flag is unset', () => {
    delete process.env.WHATSAPP_MOCK_MODE
    delete process.env.APP_ENV
    setNodeEnv('development')

    const config = getMetaWhatsAppConfig()

    expect(config.mockMode).toBe(true)
  })

  it('does not mock by default in production when the flag is unset', () => {
    delete process.env.WHATSAPP_MOCK_MODE
    delete process.env.APP_ENV
    setNodeEnv('production')
    process.env.WHATSAPP_CLOUD_API_TOKEN = 'secret-token'
    process.env.WHATSAPP_PHONE_NUMBER_ID = 'phone-id'

    const config = getMetaWhatsAppConfig()

    expect(config.mockMode).toBe(false)
  })

  it('honours an explicit false in development', () => {
    process.env.WHATSAPP_MOCK_MODE = 'false'
    setNodeEnv('development')
    process.env.WHATSAPP_CLOUD_API_TOKEN = 'secret-token'
    process.env.WHATSAPP_PHONE_NUMBER_ID = 'phone-id'

    expect(getMetaWhatsAppConfig().mockMode).toBe(false)
  })

  it('honours an explicit true in production', () => {
    process.env.WHATSAPP_MOCK_MODE = 'true'
    setNodeEnv('production')
    delete process.env.APP_ENV

    expect(getMetaWhatsAppConfig().mockMode).toBe(true)
  })

  it('still forces mock in E2E when APP_ENV=e2e', () => {
    delete process.env.WHATSAPP_MOCK_MODE
    setNodeEnv('production')
    process.env.APP_ENV = 'e2e'

    expect(getMetaWhatsAppConfig().mockMode).toBe(true)
  })
})
