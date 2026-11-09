/**
 * Indonesian WhatsApp Phone Number Normalizer
 *
 * Implements strict E.164 phone number normalization and validation for
 * Meta WhatsApp Cloud API compliance.
 *
 * Requirements:
 * - Meta WhatsApp Cloud API requires recipient phone numbers to be in E.164 format
 *   without leading '+' or formatting characters (e.g., "6281234567890").
 * - Validates that numbers are plausible Indonesian mobile numbers starting with '628'.
 * - Maximum E.164 length is 15 digits.
 * - Rejects empty, alphabetic, malformed, incomplete, or foreign inputs with clear errors.
 */

/**
 * Normalizes an Indonesian phone number into canonical E.164 format for WhatsApp Cloud API.
 *
 * @param phone Raw phone number input string
 * @returns Canonical normalized phone number string (e.g. "6281234567890")
 * @throws Error if input is empty, non-string, alphabetic, malformed, incomplete, or invalid prefix
 */
export function normalizeWhatsAppNumber(phone: string): string {
  if (!phone || typeof phone !== 'string' || phone.trim() === '') {
    throw new Error('Phone number cannot be empty.')
  }

  const trimmed = phone.trim()

  // 1. Check for alphabetic characters
  if (/[a-zA-Z]/.test(trimmed)) {
    throw new Error('Phone number contains invalid alphabetic characters.')
  }

  // 2. Validate '+' positioning and count
  if (trimmed.includes('+') && !trimmed.startsWith('+')) {
    throw new Error('Malformed phone number: "+" is only allowed at the beginning.')
  }
  if ((trimmed.match(/\+/g) || []).length > 1) {
    throw new Error('Malformed phone number: multiple "+" characters detected.')
  }

  // 3. Reject disallowed special characters (only digits, whitespace, -, (), ., and leading + are permitted)
  if (/[^0-9\s\-().+]/.test(trimmed)) {
    throw new Error('Malformed phone number: contains invalid special characters.')
  }

  // 4. Strip formatting characters (whitespace, hyphens, parentheses, dots)
  let stripped = trimmed.replace(/[\s\-().]/g, '')

  // 5. Handle leading '+'
  let hasPlus = false
  if (stripped.startsWith('+')) {
    hasPlus = true
    stripped = stripped.slice(1)
  }

  // 6. Ensure at least one digit exists after stripping
  if (!stripped || stripped.length === 0) {
    throw new Error('Malformed phone number: no digits found.')
  }

  // 7. Verify all remaining characters are digits
  if (!/^\d+$/.test(stripped)) {
    throw new Error('Malformed phone number: contains non-digit characters.')
  }

  let normalized = stripped

  // 8. Validate and normalize prefixes
  if (hasPlus) {
    if (!normalized.startsWith('62')) {
      throw new Error(`Invalid country prefix: "+${normalized.slice(0, 3)}". Only Indonesian phone numbers (+62) are supported.`)
    }
    if (!normalized.startsWith('628') && normalized.length >= 3) {
      throw new Error('Invalid phone number prefix: Indonesian mobile numbers must begin with +628.')
    }
  } else {
    if (normalized.startsWith('0')) {
      if (!normalized.startsWith('08')) {
        throw new Error('Invalid phone number prefix: Indonesian mobile numbers must begin with 08.')
      }
      normalized = '62' + normalized.slice(1)
    } else if (normalized.startsWith('62')) {
      if (!normalized.startsWith('628') && normalized.length >= 3) {
        throw new Error('Invalid phone number prefix: Indonesian mobile numbers must begin with 628.')
      }
    } else {
      throw new Error(`Invalid country prefix: "${normalized.slice(0, 3)}". Only Indonesian phone numbers (08... or 628...) are supported.`)
    }
  }

  // 9. Ensure resulting number starts with '628'
  if (!normalized.startsWith('628')) {
    throw new Error('Invalid phone number prefix: Indonesian mobile numbers must begin with 628.')
  }

  // 10. Check for incomplete number (Indonesian mobile numbers have at least 10 digits in 628... format)
  if (normalized.length < 10) {
    throw new Error(`Incomplete phone number: "${phone}" has only ${normalized.length} digits. Minimum required is 10 digits.`)
  }

  // 11. Check E.164 maximum length (15 digits)
  if (normalized.length > 15) {
    throw new Error(`Phone number exceeds maximum E.164 length of 15 digits: ${normalized.length} digits.`)
  }

  return normalized
}
