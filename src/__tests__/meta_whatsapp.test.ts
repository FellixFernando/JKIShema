import sharp from 'sharp'
import {
  uploadWhatsAppMedia,
  sendWhatsAppTemplate,
  buildWhatsAppTemplatePayload,
  getMetaWhatsAppConfig,
  redactSecrets,
  WhatsAppConfigurationError,
  MetaWhatsAppConfig,
} from '@/services/meta-whatsapp.client'
import {
  sendWhatsAppMessage,
  sendWhatsAppTicketQr,
  prepareTicketQrMediaForWhatsApp,
} from '@/services/whatsapp.service'

describe('Meta WhatsApp Cloud API Client & Services (Phase 3B)', () => {
  const originalEnv = process.env
  const originalFetch = global.fetch

  const validProdConfig: MetaWhatsAppConfig = {
    apiToken: 'EAAG_TEST_TOKEN_SECRET_12345',
    phoneNumberId: '10987654321',
    apiVersion: 'v22.0',
    mockMode: false,
    timeoutMs: 5000,
  }

  beforeEach(() => {
    jest.clearAllMocks()
    process.env = { ...originalEnv }
  })

  afterAll(() => {
    process.env = originalEnv
    global.fetch = originalFetch
  })

  describe('Configuration & Security Validation', () => {
    it('defaults to mock mode in test environment', () => {
      process.env.WHATSAPP_MOCK_MODE = 'true'
      const config = getMetaWhatsAppConfig()
      expect(config.mockMode).toBe(true)
      expect(config.apiVersion).toBe('v22.0')
    })

    it('throws WhatsAppConfigurationError in production mode when credentials are missing', () => {
      delete process.env.WHATSAPP_CLOUD_API_TOKEN
      delete process.env.WHATSAPP_PHONE_NUMBER_ID
      process.env.WHATSAPP_MOCK_MODE = 'false'

      expect(() => getMetaWhatsAppConfig()).toThrow(WhatsAppConfigurationError)
      expect(() => getMetaWhatsAppConfig()).toThrow(/WHATSAPP_CLOUD_API_TOKEN and WHATSAPP_PHONE_NUMBER_ID are required/)
    })

    it('loads valid production configuration when credentials are present', () => {
      process.env.WHATSAPP_CLOUD_API_TOKEN = 'secret-token'
      process.env.WHATSAPP_PHONE_NUMBER_ID = 'phone-id-123'
      process.env.WHATSAPP_API_VERSION = 'v22.0'
      process.env.WHATSAPP_MOCK_MODE = 'false'

      const config = getMetaWhatsAppConfig()
      expect(config.mockMode).toBe(false)
      expect(config.apiToken).toBe('secret-token')
      expect(config.phoneNumberId).toBe('phone-id-123')
      expect(config.apiVersion).toBe('v22.0')
    })

    it('redacts Bearer tokens and explicit secret tokens in strings', () => {
      const sensitive = 'Authorization: Bearer EAAG_MY_TOKEN_ABC in header'
      const redacted = redactSecrets(sensitive, 'EAAG_MY_TOKEN_ABC')
      expect(redacted).not.toContain('EAAG_MY_TOKEN_ABC')
      expect(redacted).toContain('Bearer ***')
    })
  })

  describe('Template Payload Builder', () => {
    it('normalizes recipient phone numbers and builds compliant payload', () => {
      const payload = buildWhatsAppTemplatePayload(
        '0812-3456-7890',
        'jki_christmas_ticket',
        'id',
        [
          {
            type: 'body',
            parameters: [{ type: 'text', text: 'Budi' }],
          },
        ]
      )

      expect(payload.messaging_product).toBe('whatsapp')
      expect(payload.recipient_type).toBe('individual')
      expect(payload.to).toBe('6281234567890')
      expect(payload.template.name).toBe('jki_christmas_ticket')
      expect(payload.template.language.code).toBe('id')
      expect(payload.template.components).toHaveLength(1)
    })

    it('rejects invalid or empty template names', () => {
      expect(() => buildWhatsAppTemplatePayload('08123456789', '', 'id')).toThrow(
        /Template name cannot be empty/
      )
    })

    it('rejects invalid recipient phone numbers', () => {
      expect(() => buildWhatsAppTemplatePayload('not-a-number', 'template_name', 'id')).toThrow(
        /invalid/i
      )
    })
  })

  describe('Media Upload Service (uploadWhatsAppMedia)', () => {
    it('returns mock success in explicit mock mode without calling fetch', async () => {
      const mockFetch = jest.fn()
      global.fetch = mockFetch

      const mockBuffer = Buffer.from('fake-png-buffer')
      const result = await uploadWhatsAppMedia(mockBuffer, 'image/png', 'qr.png', {
        config: { ...validProdConfig, mockMode: true },
      })

      expect(result.outcome).toBe('MEDIA_UPLOAD_SUCCESS')
      expect(result.mediaId).toMatch(/^mock_media_/)
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('uploads media and parses media id on HTTP 200', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        status: 200,
        json: async () => ({ id: 'meta-media-id-998877' }),
      } as any)
      global.fetch = mockFetch

      const mockBuffer = Buffer.from('fake-png-data')
      const result = await uploadWhatsAppMedia(mockBuffer, 'image/png', 'test-qr.png', {
        config: validProdConfig,
      })

      expect(result.outcome).toBe('MEDIA_UPLOAD_SUCCESS')
      expect(result.mediaId).toBe('meta-media-id-998877')
      expect(result.httpStatus).toBe(200)
      expect(mockFetch).toHaveBeenCalledWith(
        'https://graph.facebook.com/v22.0/10987654321/media',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer EAAG_TEST_TOKEN_SECRET_12345',
          }),
        })
      )
    })

    it('classifies HTTP 400 as MEDIA_UPLOAD_REJECTED (permanent failure)', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        status: 400,
        json: async () => ({
          error: {
            message: 'Invalid file format or corrupted PNG',
            code: 100,
          },
        }),
      } as any)
      global.fetch = mockFetch

      const result = await uploadWhatsAppMedia(Buffer.from('corrupt'), 'image/png', 'test.png', {
        config: validProdConfig,
      })

      expect(result.outcome).toBe('MEDIA_UPLOAD_REJECTED')
      expect(result.httpStatus).toBe(400)
      expect(result.error?.message).toContain('Invalid file format')
    })

    it('classifies HTTP 429 as MEDIA_UPLOAD_RATE_LIMITED (transient)', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        status: 429,
        json: async () => ({
          error: {
            message: 'Too many requests on media upload',
            code: 80007,
          },
        }),
      } as any)
      global.fetch = mockFetch

      const result = await uploadWhatsAppMedia(Buffer.from('data'), 'image/png', 'test.png', {
        config: validProdConfig,
      })

      expect(result.outcome).toBe('MEDIA_UPLOAD_RATE_LIMITED')
      expect(result.httpStatus).toBe(429)
    })

    it('classifies HTTP 500 as MEDIA_UPLOAD_TRANSIENT_FAILURE (retry eligible)', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        status: 500,
        json: async () => ({
          error: { message: 'Internal Meta Graph API server error' },
        }),
      } as any)
      global.fetch = mockFetch

      const result = await uploadWhatsAppMedia(Buffer.from('data'), 'image/png', 'test.png', {
        config: validProdConfig,
      })

      expect(result.outcome).toBe('MEDIA_UPLOAD_TRANSIENT_FAILURE')
      expect(result.httpStatus).toBe(500)
    })

    it('classifies network drop as MEDIA_UPLOAD_TRANSIENT_FAILURE (retry eligible)', async () => {
      const mockFetch = jest.fn().mockRejectedValue(new Error('Connection reset by peer'))
      global.fetch = mockFetch

      const result = await uploadWhatsAppMedia(Buffer.from('data'), 'image/png', 'test.png', {
        config: validProdConfig,
      })

      expect(result.outcome).toBe('MEDIA_UPLOAD_TRANSIENT_FAILURE')
      expect(result.error?.message).toContain('Connection reset')
    })
  })

  describe('Template Message Dispatch Service (sendWhatsAppTemplate)', () => {
    const samplePayload = buildWhatsAppTemplatePayload(
      '081234567890',
      'jki_christmas_ticket',
      'id',
      [{ type: 'body', parameters: [{ type: 'text', text: 'Budi' }] }]
    )

    it('returns mock success in explicit mock mode without calling fetch', async () => {
      const mockFetch = jest.fn()
      global.fetch = mockFetch

      const result = await sendWhatsAppTemplate(samplePayload, {
        config: { ...validProdConfig, mockMode: true },
      })

      expect(result.outcome).toBe('MOCK_SUCCESS')
      expect(result.mock).toBe(true)
      expect(result.recipientPhone).toBe('6281234567890')
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('classifies HTTP 200 with valid wamid as DISPATCH_SUCCESS', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        status: 200,
        json: async () => ({
          messaging_product: 'whatsapp',
          contacts: [{ input: '6281234567890', wa_id: '6281234567890' }],
          messages: [{ id: 'wamid.HBgLMjA2MTA1MDY2MjgxNAUCABEYEkFDOTRFNTQ0NzE4NDg0MUIwNwA=' }],
        }),
      } as any)
      global.fetch = mockFetch

      const result = await sendWhatsAppTemplate(samplePayload, { config: validProdConfig })

      expect(result.outcome).toBe('DISPATCH_SUCCESS')
      expect(result.metaMessageId).toBe('wamid.HBgLMjA2MTA1MDY2MjgxNAUCABEYEkFDOTRFNTQ0NzE4NDg0MUIwNwA=')
      expect(result.httpStatus).toBe(200)
      expect(mockFetch).toHaveBeenCalledWith(
        'https://graph.facebook.com/v22.0/10987654321/messages',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer EAAG_TEST_TOKEN_SECRET_12345',
            'Content-Type': 'application/json',
          }),
        })
      )
    })

    it('classifies HTTP 200 without messages[0].id as DISPATCH_UNKNOWN (ambiguous)', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        status: 200,
        json: async () => ({ messaging_product: 'whatsapp', messages: [] }),
      } as any)
      global.fetch = mockFetch

      const result = await sendWhatsAppTemplate(samplePayload, { config: validProdConfig })

      expect(result.outcome).toBe('DISPATCH_UNKNOWN')
      expect(result.error?.message).toContain('missing messages[0].id')
    })

    it('classifies HTTP 400 template error as DISPATCH_REJECTED (permanent)', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        status: 400,
        json: async () => ({
          error: {
            message: 'Template name does not exist in the translated language',
            code: 100,
            error_subcode: 2388001,
          },
        }),
      } as any)
      global.fetch = mockFetch

      const result = await sendWhatsAppTemplate(samplePayload, { config: validProdConfig })

      expect(result.outcome).toBe('DISPATCH_REJECTED')
      expect(result.httpStatus).toBe(400)
      expect(result.error?.code).toBe(100)
      expect(result.error?.subcode).toBe(2388001)
    })

    it('classifies HTTP 429 as DISPATCH_RATE_LIMITED', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        status: 429,
        json: async () => ({
          error: {
            message: 'Message rate limit exceeded',
            code: 130429,
          },
        }),
      } as any)
      global.fetch = mockFetch

      const result = await sendWhatsAppTemplate(samplePayload, { config: validProdConfig })

      expect(result.outcome).toBe('DISPATCH_RATE_LIMITED')
      expect(result.httpStatus).toBe(429)
    })

    it('CRITICAL: classifies HTTP 500 Meta server error as DISPATCH_UNKNOWN (NEVER auto-retried)', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        status: 500,
        json: async () => ({
          error: { message: 'Internal server error in Meta message queue' },
        }),
      } as any)
      global.fetch = mockFetch

      const result = await sendWhatsAppTemplate(samplePayload, { config: validProdConfig })

      expect(result.outcome).toBe('DISPATCH_UNKNOWN')
      expect(result.httpStatus).toBe(500)
      expect(result.metaMessageId).toBeUndefined()
    })

    it('CRITICAL: classifies HTTP 503 Service Unavailable as DISPATCH_UNKNOWN (NEVER auto-retried)', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        status: 503,
        json: async () => ({
          error: { message: 'Meta Graph API temporarily overloaded' },
        }),
      } as any)
      global.fetch = mockFetch

      const result = await sendWhatsAppTemplate(samplePayload, { config: validProdConfig })

      expect(result.outcome).toBe('DISPATCH_UNKNOWN')
      expect(result.httpStatus).toBe(503)
    })

    it('CRITICAL: classifies network drops during transmission as DISPATCH_UNKNOWN (NEVER auto-retried)', async () => {
      const mockFetch = jest.fn().mockRejectedValue(new Error('ECONNRESET: socket hang up'))
      global.fetch = mockFetch

      const result = await sendWhatsAppTemplate(samplePayload, { config: validProdConfig })

      expect(result.outcome).toBe('DISPATCH_UNKNOWN')
      expect(result.error?.message).toContain('socket hang up')
    })

    it('CRITICAL: classifies client-side timeout as DISPATCH_TIMEOUT_AMBIGUOUS (NEVER auto-retried)', async () => {
      const abortErr = new Error('The operation was aborted')
      abortErr.name = 'AbortError'
      const mockFetch = jest.fn().mockRejectedValue(abortErr)
      global.fetch = mockFetch

      const result = await sendWhatsAppTemplate(samplePayload, {
        config: { ...validProdConfig, timeoutMs: 100 },
      })

      expect(result.outcome).toBe('DISPATCH_TIMEOUT_AMBIGUOUS')
      expect(result.error?.message).toContain('Request timed out')
    })

    it('redacts access tokens from outgoing error messages and logs', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        status: 400,
        json: async () => ({
          error: {
            message: `Invalid access token EAAG_TEST_TOKEN_SECRET_12345 in parameter`,
          },
        }),
      } as any)
      global.fetch = mockFetch

      const result = await sendWhatsAppTemplate(samplePayload, { config: validProdConfig })

      expect(result.error?.message).not.toContain('EAAG_TEST_TOKEN_SECRET_12345')
      expect(result.error?.message).toContain('***')
    })
  })

  describe('Backward Compatibility Layer (whatsapp.service.ts)', () => {
    it('sendWhatsAppMessage returns expected backward-compatible result in mock mode', async () => {
      const res = await sendWhatsAppMessage('081234567890', 'Halo dari JKI Shema')
      expect(res.success).toBe(true)
      expect(res.to).toBe('081234567890')
      expect(res.message).toBe('Halo dari JKI Shema')
      expect(res.outcome).toBe('MOCK_SUCCESS')
      expect(res.timestamp).toBeDefined()
    })

    it('prepareTicketQrMediaForWhatsApp generates valid PNG buffer composited with Canva frame', async () => {
      const media = await prepareTicketQrMediaForWhatsApp('my-ticket-token-uuid')
      expect(media.filename).toContain('my-ticket-token-uuid')
      expect(media.mimeType).toBe('image/png')
      expect(Buffer.isBuffer(media.buffer)).toBe(true)
      expect(media.buffer.length).toBeGreaterThan(0)

      const metadata = await sharp(media.buffer).metadata()
      expect(metadata.width).toBe(1024)
      expect(metadata.height).toBe(768)
      expect(metadata.format).toBe('png')
    })

    it('sendWhatsAppTicketQr returns backward-compatible result with framed media metadata in mock mode', async () => {
      const res = await sendWhatsAppTicketQr('081234567890', 'Tiffany', 'my-ticket-token-uuid')
      expect(res.success).toBe(true)
      expect(res.to).toBe('081234567890')
      expect(res.message).toContain('Tiffany')
      expect(res.message).toContain('my-ticket-token-uuid')
      expect(res.media).toBeDefined()
      expect(res.media?.mimeType).toBe('image/png')
      expect(res.media?.sizeBytes).toBeGreaterThan(0)
      expect(res.outcome).toBe('MOCK_SUCCESS')
      expect(res.media?.buffer).toBeDefined()

      const metadata = await sharp(res.media!.buffer!).metadata()
      expect(metadata.width).toBe(1024)
      expect(metadata.height).toBe(768)
      expect(metadata.format).toBe('png')
    })
  })
})

