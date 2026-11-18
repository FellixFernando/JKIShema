import { uploadWhatsAppMedia, sendWhatsAppTemplate, WhatsAppTemplatePayload } from '@/services/meta-whatsapp.client'

describe('Meta WhatsApp Client: AbortSignal Composition and Timeout Handling (FIX 2)', () => {
  const originalFetch = global.fetch
  const originalEnv = { ...process.env }

  const samplePayload: WhatsAppTemplatePayload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: '6281234567890',
    type: 'template',
    template: { name: 'test_template', language: { code: 'id' } },
  }

  beforeEach(() => {
    process.env.WHATSAPP_MOCK_MODE = 'false'
    process.env.WHATSAPP_CLOUD_API_TOKEN = 'test-mock-token'
    process.env.WHATSAPP_PHONE_NUMBER_ID = '1302620062943874'
  })

  afterEach(() => {
    global.fetch = originalFetch
    process.env = { ...originalEnv }
    jest.restoreAllMocks()
  })

  describe('Internal Timeout vs External AbortSignal', () => {
    it('cleans up timeout timer when request succeeds', async () => {
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout')

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({
          messages: [{ id: 'wamid.HBgLMTIzNDU2Nzg5MA==' }],
        }),
      } as any)

      const result = await sendWhatsAppTemplate(samplePayload, { timeoutMs: 5000 })

      expect(result.outcome).toBe('DISPATCH_SUCCESS')
      expect(result.metaMessageId).toBe('wamid.HBgLMTIzNDU2Nzg5MA==')
      expect(clearTimeoutSpy).toHaveBeenCalled()
    })

    it('cleans up timeout timer when request returns HTTP error', async () => {
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout')

      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        headers: { get: () => 'application/json' },
        json: async () => ({
          error: { message: 'Invalid Parameter', code: 100 },
        }),
      } as any)

      const result = await sendWhatsAppTemplate(samplePayload, { timeoutMs: 5000 })

      expect(result.outcome).toBe('DISPATCH_REJECTED')
      expect(clearTimeoutSpy).toHaveBeenCalled()
    })

    it('triggers internal timeout when no external signal is provided and duration exceeds timeoutMs', async () => {
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout')

      global.fetch = jest.fn().mockImplementation((_url, options) => {
        return new Promise((_, reject) => {
          if (options?.signal) {
            options.signal.addEventListener('abort', () => {
              const err = new Error('The operation was aborted')
              err.name = 'AbortError'
              reject(err)
            })
          }
        })
      })

      const result = await sendWhatsAppTemplate(samplePayload, { timeoutMs: 30 })

      expect(result.outcome).toBe('DISPATCH_TIMEOUT_AMBIGUOUS')
      expect(result.error?.message).toContain('timed out after 30ms')
      expect(clearTimeoutSpy).toHaveBeenCalled()
    })

    it('triggers internal timeout when external signal has a longer timeout (internal timeout is NOT overridden)', async () => {
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout')
      const externalController = new AbortController()

      global.fetch = jest.fn().mockImplementation((_url, options) => {
        return new Promise((_, reject) => {
          if (options?.signal) {
            options.signal.addEventListener('abort', () => {
              const err = new Error('The operation was aborted')
              err.name = 'AbortError'
              reject(err)
            })
          }
        })
      })

      const result = await sendWhatsAppTemplate(samplePayload, {
        signal: externalController.signal,
        timeoutMs: 30,
      })

      // External signal was NOT aborted, so abort was caused by the internal timeout timer
      expect(externalController.signal.aborted).toBe(false)
      expect(result.outcome).toBe('DISPATCH_TIMEOUT_AMBIGUOUS')
      expect(result.error?.message).toContain('timed out after 30ms')
      expect(clearTimeoutSpy).toHaveBeenCalled()
    })

    it('classifies external cancellation as caller abort when external signal aborts before timeout', async () => {
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout')
      const externalController = new AbortController()

      global.fetch = jest.fn().mockImplementation((_url, options) => {
        return new Promise((_, reject) => {
          if (options?.signal?.aborted) {
            const err = new Error('The user aborted a request')
            err.name = 'AbortError'
            return reject(err)
          }
          if (options?.signal) {
            options.signal.addEventListener('abort', () => {
              const err = new Error('The user aborted a request')
              err.name = 'AbortError'
              reject(err)
            })
          }
          setTimeout(() => externalController.abort(), 10)
        })
      })

      const result = await sendWhatsAppTemplate(samplePayload, {
        signal: externalController.signal,
        timeoutMs: 5000,
      })

      expect(externalController.signal.aborted).toBe(true)
      expect(result.outcome).toBe('DISPATCH_TIMEOUT_AMBIGUOUS')
      expect(result.error?.message).toContain('cancelled by caller')
      expect(clearTimeoutSpy).toHaveBeenCalled()
    })

    it('media upload classifies internal timeout as MEDIA_UPLOAD_TRANSIENT_FAILURE and cleans up timer', async () => {
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout')

      global.fetch = jest.fn().mockImplementation((_url, options) => {
        return new Promise((_, reject) => {
          if (options?.signal) {
            options.signal.addEventListener('abort', () => {
              const err = new Error('The operation was aborted')
              err.name = 'AbortError'
              reject(err)
            })
          }
        })
      })

      const dummyBuffer = Buffer.from('fake-png-binary-data')

      const result = await uploadWhatsAppMedia(dummyBuffer, 'image/png', 'qr.png', {
        timeoutMs: 30,
      })

      expect(result.outcome).toBe('MEDIA_UPLOAD_TRANSIENT_FAILURE')
      expect(result.error?.message).toContain('timed out after 30ms')
      expect(clearTimeoutSpy).toHaveBeenCalled()
    })
  })
})
