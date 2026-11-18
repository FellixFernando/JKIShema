import {
  generateDummyTestQrBuffer,
  maskPhoneNumber,
  buildVerifiedTestTemplatePayload,
  runWhatsAppLiveTest,
  VERIFIED_META_TEST_CONFIG,
} from '@/lib/whatsapp-live-test'

describe('WhatsApp Live Test Preparation & Dry-Run (Phase 3 Controlled Live Test)', () => {
  const originalEnv = process.env
  const originalFetch = global.fetch

  beforeEach(() => {
    jest.clearAllMocks()
    process.env = { ...originalEnv }
  })

  afterAll(() => {
    process.env = originalEnv
    global.fetch = originalFetch
  })

  describe('Dummy QR Image Generation', () => {
    it('generates a valid in-memory PNG buffer containing the test payload', async () => {
      const buffer = await generateDummyTestQrBuffer()
      expect(Buffer.isBuffer(buffer)).toBe(true)
      expect(buffer.length).toBeGreaterThan(100)
      // PNG magic number check
      expect(buffer[0]).toBe(0x89)
      expect(buffer[1]).toBe(0x50) // 'P'
      expect(buffer[2]).toBe(0x4e) // 'N'
      expect(buffer[3]).toBe(0x47) // 'G'
    })
  })

  describe('Phone Number Masking Utility', () => {
    it('masks the middle digits of an E.164 phone number', () => {
      const masked = maskPhoneNumber('6281234567890')
      expect(masked).toBe('62812****7890')
    })

    it('handles short or empty phone strings gracefully', () => {
      expect(maskPhoneNumber('')).toBe('****')
      expect(maskPhoneNumber('123')).toBe('****')
    })
  })

  describe('Verified Template Payload Builder', () => {
    it('constructs the exact approved Meta template structure', () => {
      const payload = buildVerifiedTestTemplatePayload('0812-3456-7890', 'meta-media-12345')

      expect(payload.messaging_product).toBe('whatsapp')
      expect(payload.recipient_type).toBe('individual')
      expect(payload.to).toBe('6281234567890')
      expect(payload.type).toBe('template')
      expect(payload.template.name).toBe(VERIFIED_META_TEST_CONFIG.templateName)
      expect(payload.template.language.code).toBe('id')

      const header = payload.template.components?.find((c) => c.type === 'header')
      expect(header).toBeDefined()
      expect(header?.parameters[0]).toEqual({
        type: 'image',
        image: { id: 'meta-media-12345' },
      })

      const body = payload.template.components?.find((c) => c.type === 'body')
      expect(body).toBeDefined()
      expect(body?.parameters[0]).toEqual({
        type: 'text',
        text: 'TEST PARTICIPANT',
      })
    })
  })

  describe('Dry-Run Execution Safety', () => {
    it('fails validation when recipient is missing', async () => {
      delete process.env.WHATSAPP_TEST_RECIPIENT
      const result = await runWhatsAppLiveTest({ isLive: false })

      expect(result.mode).toBe('DRY_RUN')
      expect(result.readyForLive).toBe(false)
      expect(result.errors?.[0]).toContain('Missing test recipient')
    })

    it('succeeds in dry-run with valid tester recipient without making any network calls', async () => {
      const mockFetch = jest.fn()
      global.fetch = mockFetch

      const result = await runWhatsAppLiveTest({
        recipientPhone: '081234567890',
        isLive: false,
      })

      expect(result.mode).toBe('DRY_RUN')
      expect(result.readyForLive).toBe(true)
      expect(result.recipient.normalizedE164).toBe('6281234567890')
      expect(result.recipient.maskedPhone).toBe('62812****7890')
      expect(result.dummyQr.mimeType).toBe('image/png')
      expect(result.dummyQr.sizeBytes).toBeGreaterThan(0)
      expect(result.constructedPayload.template.name).toBe('jkishema_registration_qr_3')

      // ZERO network requests verification
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe('Live Execution Safety Gates', () => {
    it('blocks live execution if confirmSend is false', async () => {
      await expect(
        runWhatsAppLiveTest({
          recipientPhone: '081234567890',
          isLive: true,
          confirmSend: false,
        })
      ).rejects.toThrow(/SAFETY GATE TRIGGERED.*--confirm-send/)
    })

    it('blocks live execution if mock mode is true', async () => {
      await expect(
        runWhatsAppLiveTest({
          recipientPhone: '081234567890',
          isLive: true,
          confirmSend: true,
          configOverrides: { mockMode: true },
        })
      ).rejects.toThrow(/SAFETY GATE TRIGGERED.*WHATSAPP_MOCK_MODE must be false/)
    })

    it('blocks live execution if phone number ID does not match verified Meta Test ID', async () => {
      await expect(
        runWhatsAppLiveTest({
          recipientPhone: '081234567890',
          isLive: true,
          confirmSend: true,
          configOverrides: {
            mockMode: false,
            apiToken: 'test-token',
            phoneNumberId: 'wrong-phone-number-id',
          },
        })
      ).rejects.toThrow(/SAFETY GATE TRIGGERED.*does not match verified Meta Test Phone Number ID/)
    })

    it('executes media upload and template dispatch when all live safety gates pass (mocked fetch)', async () => {
      const mockFetch = jest
        .fn()
        // 1st call: Media Upload
        .mockResolvedValueOnce({
          status: 200,
          json: async () => ({ id: 'meta-uploaded-media-888999' }),
        } as any)
        // 2nd call: Message Dispatch
        .mockResolvedValueOnce({
          status: 200,
          json: async () => ({
            messaging_product: 'whatsapp',
            messages: [{ id: 'wamid.HBgLMjA2MTA1MDY2MjgxNAUCABEYEkFDOTRFNTQ0NzE4NDg0MUIwNwA=' }],
          }),
        } as any)

      global.fetch = mockFetch

      const result = await runWhatsAppLiveTest({
        recipientPhone: '081234567890',
        isLive: true,
        confirmSend: true,
        configOverrides: {
          mockMode: false,
          apiToken: 'valid-test-token',
          phoneNumberId: VERIFIED_META_TEST_CONFIG.phoneNumberId,
        },
      })

      expect(result.mode).toBe('LIVE')
      expect(result.mediaUploadResult?.outcome).toBe('MEDIA_UPLOAD_SUCCESS')
      expect(result.mediaUploadResult?.mediaId).toBe('meta-uploaded-media-888999')
      expect(result.dispatchResult?.outcome).toBe('DISPATCH_SUCCESS')
      expect(result.dispatchResult?.metaMessageId).toContain('wamid')
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
  })
})

