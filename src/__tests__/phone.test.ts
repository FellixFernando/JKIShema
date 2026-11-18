import { normalizeWhatsAppNumber } from '@/lib/phone'

describe('Indonesian WhatsApp Phone Number Normalizer (normalizeWhatsAppNumber)', () => {
  // Test 1: Indonesian local number beginning with 08
  it('1. should normalize Indonesian local numbers beginning with 08', () => {
    expect(normalizeWhatsAppNumber('081234567890')).toBe('6281234567890')
    expect(normalizeWhatsAppNumber('085712345678')).toBe('6285712345678')
    expect(normalizeWhatsAppNumber('08987654321')).toBe('628987654321')
  })

  // Test 2: Indonesian international number beginning with +62
  it('2. should normalize Indonesian international numbers beginning with +62', () => {
    expect(normalizeWhatsAppNumber('+6281234567890')).toBe('6281234567890')
    expect(normalizeWhatsAppNumber('+6285712345678')).toBe('6285712345678')
  })

  // Test 3: Indonesian number beginning with 62
  it('3. should normalize Indonesian numbers beginning with 62', () => {
    expect(normalizeWhatsAppNumber('6281234567890')).toBe('6281234567890')
    expect(normalizeWhatsAppNumber('628987654321')).toBe('628987654321')
  })

  // Test 4: Numbers containing spaces and hyphens
  it('4. should strip spaces and hyphens and normalize correctly', () => {
    expect(normalizeWhatsAppNumber('62 812-3456-7890')).toBe('6281234567890')
    expect(normalizeWhatsAppNumber('0812 3456 7890')).toBe('6281234567890')
    expect(normalizeWhatsAppNumber('0812-3456-7890')).toBe('6281234567890')
    expect(normalizeWhatsAppNumber('+62 812-3456-7890')).toBe('6281234567890')
    expect(normalizeWhatsAppNumber('  0812 3456 7890  ')).toBe('6281234567890')
  })

  // Test 5: Numbers containing parentheses
  it('5. should strip parentheses and normalize correctly', () => {
    expect(normalizeWhatsAppNumber('(0812) 3456 7890')).toBe('6281234567890')
    expect(normalizeWhatsAppNumber('+62 (812) 3456-7890')).toBe('6281234567890')
    expect(normalizeWhatsAppNumber('(62812) 34567890')).toBe('6281234567890')
  })

  // Test 6: Empty input
  it('6. should reject empty, null, or whitespace-only input', () => {
    expect(() => normalizeWhatsAppNumber('')).toThrow('Phone number cannot be empty.')
    expect(() => normalizeWhatsAppNumber('   ')).toThrow('Phone number cannot be empty.')
    expect(() => normalizeWhatsAppNumber(null as any)).toThrow('Phone number cannot be empty.')
    expect(() => normalizeWhatsAppNumber(undefined as any)).toThrow('Phone number cannot be empty.')
  })

  // Test 7: Alphabetic input
  it('7. should reject input containing alphabetic characters', () => {
    expect(() => normalizeWhatsAppNumber('0812abcd7890')).toThrow(
      'Phone number contains invalid alphabetic characters.'
    )
    expect(() => normalizeWhatsAppNumber('whatsappNumber')).toThrow(
      'Phone number contains invalid alphabetic characters.'
    )
    expect(() => normalizeWhatsAppNumber('0812-CALL-ME')).toThrow(
      'Phone number contains invalid alphabetic characters.'
    )
  })

  // Test 8: Invalid country prefix
  it('8. should reject numbers with invalid or non-Indonesian prefixes', () => {
    // US number
    expect(() => normalizeWhatsAppNumber('+12025550123')).toThrow('Invalid country prefix')
    // UK number
    expect(() => normalizeWhatsAppNumber('+447911123456')).toThrow('Invalid country prefix')
    // Singapore number without +
    expect(() => normalizeWhatsAppNumber('6591234567')).toThrow('Invalid country prefix')
    // Indonesian landline prefix (021)
    expect(() => normalizeWhatsAppNumber('02129999999')).toThrow('Indonesian mobile numbers must begin with 08')
  })

  // Test 9: Incomplete number
  it('9. should reject incomplete phone numbers', () => {
    expect(() => normalizeWhatsAppNumber('0812')).toThrow('Incomplete phone number')
    expect(() => normalizeWhatsAppNumber('+628')).toThrow('Incomplete phone number')
    expect(() => normalizeWhatsAppNumber('08123')).toThrow('Incomplete phone number')
    expect(() => normalizeWhatsAppNumber('62812')).toThrow('Incomplete phone number')
  })

  // Test 10: Number exceeding E.164 maximum length
  it('10. should reject numbers exceeding E.164 maximum length (15 digits)', () => {
    // 16 digits normalized: 6281234567890123
    expect(() => normalizeWhatsAppNumber('08123456789012345')).toThrow(
      'Phone number exceeds maximum E.164 length of 15 digits'
    )
    // 18 digits normalized: 628123456789012345
    expect(() => normalizeWhatsAppNumber('+628123456789012345')).toThrow(
      'Phone number exceeds maximum E.164 length of 15 digits'
    )
  })

  // Test 11: Malformed input
  it('11. should reject malformed inputs with symbols or misplaced plus', () => {
    expect(() => normalizeWhatsAppNumber('+-()')).toThrow('no digits found')
    expect(() => normalizeWhatsAppNumber('++6281234567890')).toThrow('multiple "+" characters')
    expect(() => normalizeWhatsAppNumber('62812+34567890')).toThrow('"+" is only allowed at the beginning')
    expect(() => normalizeWhatsAppNumber('0812@3456#7890')).toThrow('contains invalid special characters')
    expect(() => normalizeWhatsAppNumber('0812!$%^&*')).toThrow('contains invalid special characters')
  })
})
