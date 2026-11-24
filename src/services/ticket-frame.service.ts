import path from 'path'
import fs from 'fs'
import sharp from 'sharp'
import { generateTicketQrBuffer, getTicketQrPayload } from '@/services/qrcode.service'

/**
 * Geometric configuration for the Christmas ticket frame Canva asset.
 * Frame canvas: 1024 x 768 pixels.
 * Designated white QR placement panel:
 * - Left: 478px (36px margin from left border of white panel at x=442)
 * - Top: 206px (24px margin from header text at y=182)
 * - Width: 480px (square 1:1)
 * - Height: 480px (square 1:1)
 * - Error correction: 'M' (15%)
 * - Internal QR margin: 2 modules (plus external white space in panel)
 */
export interface TicketFrameGeometry {
  canvasWidth: number
  canvasHeight: number
  qrLeft: number
  qrTop: number
  qrWidth: number
  qrHeight: number
  qrMargin: number
  errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H'
}

export const DEFAULT_TICKET_FRAME_GEOMETRY: TicketFrameGeometry = {
  canvasWidth: 1024,
  canvasHeight: 768,
  qrLeft: 478,
  qrTop: 206,
  qrWidth: 480,
  qrHeight: 480,
  qrMargin: 3,
  errorCorrectionLevel: 'M',
}

export interface FramedTicketOptions {
  framePath?: string
  geometry?: Partial<TicketFrameGeometry>
  bypassCache?: boolean
}

// In-memory cache for the Canva frame buffer to eliminate disk I/O on repeated requests
let cachedFrame: { path: string; buffer: Buffer } | null = null

/**
 * Clears the in-memory frame cache. Useful during tests or when replacing asset.
 */
export function clearTicketFrameCache(): void {
  cachedFrame = null
}

/**
 * Resolves the filesystem path to the Christmas concert ticket frame asset.
 */
export function getDefaultTicketFramePath(): string {
  return path.join(
    process.cwd(),
    'public',
    'images',
    'ticket',
    'christmas-ticket-frame.png'
  )
}

/**
 * Loads the frame PNG asset into memory, utilizing cache if available.
 */
async function loadFrameAsset(framePath: string, bypassCache = false): Promise<Buffer> {
  const resolvedPath = path.resolve(framePath)

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Christmas ticket frame asset not found at: ${resolvedPath}`)
  }

  if (!bypassCache && cachedFrame && cachedFrame.path === resolvedPath) {
    return cachedFrame.buffer
  }

  const buffer = await fs.promises.readFile(resolvedPath)
  cachedFrame = { path: resolvedPath, buffer }
  return buffer
}

/**
 * Generates a complete framed ticket image as an in-memory PNG Buffer.
 *
 * Execution flow:
 * 1. Validates and trims the existing participant QR token.
 * 2. Generates an in-memory QR code PNG buffer using existing qrcode.service.
 * 3. Loads the Canva ticket frame PNG (from disk or memory cache).
 * 4. Uses Sharp to composite the QR code onto the exact white placement area.
 * 5. Returns the resulting 1024 x 768 PNG image as an in-memory Buffer.
 *
 * Zero permanent storage: Does not write to disk or cloud storage.
 *
 * @param qrToken Existing participant QR token UUID string
 * @param options Optional overrides for asset path, geometry, or cache
 * @returns In-memory PNG Buffer containing the composited framed ticket
 */
export async function generateFramedTicketQrBuffer(
  qrToken: string,
  options?: FramedTicketOptions
): Promise<Buffer> {
  // 1. Validate token via canonical QR payload getter
  const payload = getTicketQrPayload(qrToken)

  const geometry: TicketFrameGeometry = {
    ...DEFAULT_TICKET_FRAME_GEOMETRY,
    ...options?.geometry,
  }

  const framePath = options?.framePath ?? getDefaultTicketFramePath()

  // 2. Generate original QR code PNG buffer via existing service
  const qrBuffer = await generateTicketQrBuffer(payload, {
    width: geometry.qrWidth,
    margin: geometry.qrMargin,
    errorCorrectionLevel: geometry.errorCorrectionLevel,
    darkColor: '#000000',
    lightColor: '#ffffff',
  })

  // 3. Load Canva frame asset
  const frameBuffer = await loadFrameAsset(framePath, options?.bypassCache)

  // 4. Composite QR onto the designated white panel of the frame
  const framedBuffer = await sharp(frameBuffer)
    .composite([
      {
        input: qrBuffer,
        left: geometry.qrLeft,
        top: geometry.qrTop,
      },
    ])
    .png({
      compressionLevel: 8,
      adaptiveFiltering: true,
    })
    .toBuffer()

  return framedBuffer
}
