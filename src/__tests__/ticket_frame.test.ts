import sharp from 'sharp'
import path from 'path'
import {
  generateFramedTicketQrBuffer,
  clearTicketFrameCache,
  DEFAULT_TICKET_FRAME_GEOMETRY,
} from '@/services/ticket-frame.service'
// Import the bundled ZXing QR decoder from html5-qrcode
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ZXingModule = require('html5-qrcode/third_party/zxing-js.umd.js')
const ZXing = ZXingModule.default || ZXingModule

/**
 * Helper to scan and decode a QR code directly from an in-memory image buffer
 * using the bundled ZXing QR engine.
 */
async function decodeQrFromBuffer(imageBuffer: Buffer): Promise<string> {
  const { data, info } = await sharp(imageBuffer)
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const luminanceSource = new ZXing.RGBLuminanceSource(
    new Uint8ClampedArray(data),
    info.width,
    info.height
  )
  const binaryBitmap = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(luminanceSource))
  const reader = new ZXing.QRCodeReader()
  const result = reader.decode(binaryBitmap)
  return result.getText()
}

describe('Ticket Frame Service (Phase 1)', () => {
  const sampleToken = '550e8400-e29b-41d4-a716-446655440000'

  beforeEach(() => {
    clearTicketFrameCache()
  })

  describe('Buffer generation & Image properties', () => {
    it('produces a valid PNG Buffer with correct magic bytes for a valid token', async () => {
      const buffer = await generateFramedTicketQrBuffer(sampleToken)

      expect(Buffer.isBuffer(buffer)).toBe(true)
      expect(buffer.length).toBeGreaterThan(10000)

      // PNG magic bytes: 0x89 0x50 0x4E 0x47 (\x89PNG)
      expect(buffer[0]).toBe(0x89)
      expect(buffer[1]).toBe(0x50) // 'P'
      expect(buffer[2]).toBe(0x4e) // 'N'
      expect(buffer[3]).toBe(0x47) // 'G'
    })

    it('matches the exact Canva frame canvas dimensions (1024 x 768)', async () => {
      const buffer = await generateFramedTicketQrBuffer(sampleToken)
      const metadata = await sharp(buffer).metadata()

      expect(metadata.format).toBe('png')
      expect(metadata.width).toBe(DEFAULT_TICKET_FRAME_GEOMETRY.canvasWidth)
      expect(metadata.height).toBe(DEFAULT_TICKET_FRAME_GEOMETRY.canvasHeight)
      expect(metadata.width).toBe(1024)
      expect(metadata.height).toBe(768)
    })
  })

  describe('Validation & Error Handling', () => {
    it('rejects an empty string token with descriptive error', async () => {
      await expect(generateFramedTicketQrBuffer('')).rejects.toThrow(
        'QR Token must be a non-empty string.'
      )
    })

    it('rejects a whitespace-only token with descriptive error', async () => {
      await expect(generateFramedTicketQrBuffer('   ')).rejects.toThrow(
        'QR Token must be a non-empty string.'
      )
    })

    it('rejects null and undefined tokens', async () => {
      // @ts-expect-error testing invalid input
      await expect(generateFramedTicketQrBuffer(null)).rejects.toThrow(
        'QR Token must be a non-empty string.'
      )
      // @ts-expect-error testing invalid input
      await expect(generateFramedTicketQrBuffer(undefined)).rejects.toThrow(
        'QR Token must be a non-empty string.'
      )
    })

    it('throws a descriptive error when frame asset file does not exist', async () => {
      const nonExistentPath = path.resolve('public/images/ticket/does-not-exist.png')

      await expect(
        generateFramedTicketQrBuffer(sampleToken, {
          framePath: nonExistentPath,
        })
      ).rejects.toThrow(/Christmas ticket frame asset not found at/)
    })
  })

  describe('QR Payload & Scanability Verification', () => {
    it('preserves the exact QR payload and trims padding whitespace', async () => {
      const framedBuffer = await generateFramedTicketQrBuffer(`  ${sampleToken}  `)
      const decodedPayload = await decodeQrFromBuffer(framedBuffer)

      expect(decodedPayload).toBe(sampleToken)
    })

    it('remains 100% scannable from the full 1024x768 composited framed image', async () => {
      const randomUuid = 'c8b6b668-3012-4c22-b52b-7b084e3a479b'
      const framedBuffer = await generateFramedTicketQrBuffer(randomUuid)

      const decodedPayload = await decodeQrFromBuffer(framedBuffer)
      expect(decodedPayload).toBe(randomUuid)
    })
  })

  describe('Caching & Custom Geometry', () => {
    it('uses in-memory cached frame on subsequent calls without throwing', async () => {
      const buffer1 = await generateFramedTicketQrBuffer('token-1')
      const buffer2 = await generateFramedTicketQrBuffer('token-2')

      expect(Buffer.isBuffer(buffer1)).toBe(true)
      expect(Buffer.isBuffer(buffer2)).toBe(true)

      const decoded1 = await decodeQrFromBuffer(buffer1)
      const decoded2 = await decodeQrFromBuffer(buffer2)

      expect(decoded1).toBe('token-1')
      expect(decoded2).toBe('token-2')
    })

    it('supports custom geometry overrides correctly', async () => {
      // Test with custom QR size and placement
      const customToken = 'custom-geom-token'
      const buffer = await generateFramedTicketQrBuffer(customToken, {
        geometry: {
          qrLeft: 500,
          qrTop: 220,
          qrWidth: 440,
          qrHeight: 440,
        },
      })

      const metadata = await sharp(buffer).metadata()
      expect(metadata.width).toBe(1024)
      expect(metadata.height).toBe(768)

      const decoded = await decodeQrFromBuffer(buffer)
      expect(decoded).toBe(customToken)
    })
  })
})
