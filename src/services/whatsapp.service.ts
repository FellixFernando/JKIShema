export async function sendWhatsAppMessage(to: string, text: string) {
  console.log(`[MOCK WA SERVICE] Sending to ${to}: "${text}"`)
  return {
    success: true,
    to,
    message: text,
    timestamp: new Date().toISOString(),
  }
}
