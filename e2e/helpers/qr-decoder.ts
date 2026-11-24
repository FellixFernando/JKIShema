import sharp from 'sharp'

// Use the ZXing engine vendored inside html5-qrcode
// eslint-disable-next-line @typescript-eslint/no-require-imports
const zxing = require('html5-qrcode/third_party/zxing-js.umd.js')

async function decodeSingle(buffer: Buffer): Promise<string> {
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const luminances = new Uint8ClampedArray(info.width * info.height)
  for (let i = 0; i < luminances.length; i++) {
    const r = data[i * 4]
    const g = data[i * 4 + 1]
    const b = data[i * 4 + 2]
    luminances[i] = ((r + g + b) / 3) | 0
  }

  const source = new zxing.RGBLuminanceSource(luminances, info.width, info.height)
  const bitmap = new zxing.BinaryBitmap(new zxing.HybridBinarizer(source))
  const reader = new zxing.QRCodeReader()
  const hints = new Map()
  hints.set(zxing.DecodeHintType.TRY_HARDER, true)

  const result = reader.decode(bitmap, hints)
  return result.getText()
}

/**
 * Decodes a QR code string payload from an in-memory image PNG Buffer using
 * the project's existing sharp and html5-qrcode vendored ZXing engine.
 *
 * Operates completely in-memory with zero disk persistence.
 */
export async function decodeQrFromPngBuffer(imageBuffer: Buffer): Promise<string> {
  try {
    return await decodeSingle(imageBuffer)
  } catch {
    // Fallback 1: Crop tightly to the QR bounding box within the white panel
    // (QR geometry: left 478, top 206, size 480x480) to eliminate decorative frame artifacts
    try {
      const tightCropped = await sharp(imageBuffer)
        .extract({ left: 475, top: 203, width: 486, height: 486 })
        .toBuffer()
      return await decodeSingle(tightCropped)
    } catch {
      // Fallback 2: Crop to the wider panel
      const broadCropped = await sharp(imageBuffer)
        .extract({ left: 460, top: 190, width: 515, height: 515 })
        .toBuffer()
      return await decodeSingle(broadCropped)
    }
  }
}
