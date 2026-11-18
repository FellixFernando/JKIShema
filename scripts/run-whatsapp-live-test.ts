import { loadEnvConfig } from '@next/env'
import { runWhatsAppLiveTest } from '../src/lib/whatsapp-live-test'
import { redactSecrets } from '../src/services/meta-whatsapp.client'

// Load environment variables from .env
loadEnvConfig(process.cwd())

function parseArgs(args: string[]) {
  let recipientPhone = ''
  let isLive = false
  let confirmSend = false

  for (const arg of args) {
    if (arg.startsWith('--to=')) {
      recipientPhone = arg.slice(5)
    } else if (arg === '--live') {
      isLive = true
    } else if (arg === '--confirm-send') {
      confirmSend = true
    }
  }

  return { recipientPhone, isLive, confirmSend }
}

async function main() {
  const { recipientPhone, isLive, confirmSend } = parseArgs(process.argv.slice(2))

  console.log('======================================================================')
  console.log(' JKI SHEMA SUNTER — WHATSAPP CLOUD API CONTROLLED TEST RUNNER')
  console.log('======================================================================')

  const result = await runWhatsAppLiveTest({
    recipientPhone,
    isLive,
    confirmSend,
  })

  console.log(`\n[MODE]: ${result.mode}`)
  console.log(`[STATUS]: ${result.readyForLive ? 'READY FOR LIVE DISPATCH' : 'VALIDATION BLOCKED'}`)

  console.log('\n--- 1. DUMMY QR IMAGE ---')
  console.log(`- Payload:  "${result.dummyQr.payloadText}"`)
  console.log(`- Filename: ${result.dummyQr.filename}`)
  console.log(`- MIME:     ${result.dummyQr.mimeType}`)
  console.log(`- Size:     ${result.dummyQr.sizeBytes} bytes`)

  console.log('\n--- 2. RECIPIENT ---')
  console.log(`- Raw Input:      ${result.recipient.rawInput || '(None supplied)'}`)
  console.log(`- Normalized WA:  ${result.recipient.normalizedE164 || '(None)'}`)
  console.log(`- Masked Display: ${result.recipient.maskedPhone}`)

  console.log('\n--- 3. VERIFIED META TEMPLATE CONFIG ---')
  console.log(`- WABA ID:         ${result.templateConfig.wabaId}`)
  console.log(`- Phone Number ID: ${result.templateConfig.phoneNumberId}`)
  console.log(`- Template Name:   ${result.templateConfig.templateName}`)
  console.log(`- Template ID:     ${result.templateConfig.templateId}`)
  console.log(`- Language:        ${result.templateConfig.language}`)
  console.log(`- Header Type:     ${result.templateConfig.headerType}`)
  console.log(`- Body Param {{1}}: ${result.templateConfig.bodyParamText}`)

  console.log('\n--- 4. CONSTRUCTED OUTGOING PAYLOAD ---')
  console.log(JSON.stringify(result.constructedPayload, null, 2))

  if (result.errors && result.errors.length > 0) {
    console.log('\n--- VALIDATION ERRORS / WARNINGS ---')
    result.errors.forEach((err) => console.log(`[!] ${err}`))
  }

  if (result.mode === 'DRY_RUN') {
    console.log('\n======================================================================')
    console.log(' DRY-RUN COMPLETED SUCCESSFULLY — ZERO NETWORK REQUESTS MADE')
    console.log(' No Meta media upload was performed.')
    console.log(' No WhatsApp message was sent.')
    console.log(' No database records were modified.')
    console.log('======================================================================\n')
  } else {
    console.log('\n--- 5. LIVE EXECUTION RESULTS ---')
    console.log(`- Media Upload Outcome: ${result.mediaUploadResult?.outcome}`)
    console.log(`- Uploaded Media ID:    ${result.mediaUploadResult?.mediaId || 'None'}`)
    console.log(`- Message Outcome:      ${result.dispatchResult?.outcome}`)
    console.log(`- Meta Message ID:      ${result.dispatchResult?.metaMessageId || 'None'}`)

    const activeToken = process.env.WHATSAPP_CLOUD_API_TOKEN

    if (result.mediaUploadResult?.error || result.mediaUploadResult?.httpStatus) {
      console.log('\n--- META MEDIA UPLOAD ERROR DETAILS ---')
      console.log(`- HTTP Status:    ${result.mediaUploadResult?.httpStatus ?? 'N/A'}`)
      console.log(`- Meta Code:      ${result.mediaUploadResult?.error?.code ?? 'N/A'}`)
      console.log(`- Meta Subcode:   ${result.mediaUploadResult?.error?.subcode ?? 'N/A'}`)
      console.log(`- Meta Type:      ${result.mediaUploadResult?.error?.type || 'N/A'}`)
      console.log(`- Error Message:  ${result.mediaUploadResult?.error?.message ? redactSecrets(result.mediaUploadResult.error.message, activeToken) : 'N/A'}`)
      if (result.mediaUploadResult?.error?.errorDataDetails) {
        console.log(`- Details:        ${redactSecrets(result.mediaUploadResult.error.errorDataDetails, activeToken)}`)
      }
      if (result.mediaUploadResult?.error?.fbtraceId) {
        console.log(`- FB Trace ID:    ${result.mediaUploadResult.error.fbtraceId}`)
      }
    }

    if (result.dispatchResult?.error || result.dispatchResult?.httpStatus) {
      const isDuplicateError = Boolean(
        result.mediaUploadResult &&
        result.dispatchResult &&
        ((result.mediaUploadResult.error && result.dispatchResult.error && result.mediaUploadResult.error === result.dispatchResult.error) ||
          (result.mediaUploadResult.error?.fbtraceId &&
            result.mediaUploadResult.error.fbtraceId === result.dispatchResult.error?.fbtraceId))
      )

      if (isDuplicateError) {
        console.log('\n--- META DISPATCH ERROR DETAILS ---')
        console.log('- (Error details identical to Media Upload error above)')
      } else {
        console.log('\n--- META DISPATCH ERROR DETAILS ---')
        console.log(`- HTTP Status:    ${result.dispatchResult?.httpStatus ?? 'N/A'}`)
        console.log(`- Meta Code:      ${result.dispatchResult?.error?.code ?? 'N/A'}`)
        console.log(`- Meta Subcode:   ${result.dispatchResult?.error?.subcode ?? 'N/A'}`)
        console.log(`- Meta Type:      ${result.dispatchResult?.error?.type || 'N/A'}`)
        console.log(`- Error Message:  ${result.dispatchResult?.error?.message ? redactSecrets(result.dispatchResult.error.message, activeToken) : 'N/A'}`)
        if (result.dispatchResult?.error?.errorDataDetails) {
          console.log(`- Details:        ${redactSecrets(result.dispatchResult.error.errorDataDetails, activeToken)}`)
        }
        if (result.dispatchResult?.error?.fbtraceId) {
          console.log(`- FB Trace ID:    ${result.dispatchResult.error.fbtraceId}`)
        }
      }
    }
  }
}

main().catch((err) => {
  console.error('\n[FATAL ERROR]:', err?.message || err)
  process.exit(1)
})

