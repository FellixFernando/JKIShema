import { CONFIG_KEYS, parseSetConfigArgs, validateConfigValue } from '@/lib/config-args'

describe('set-config arguments', () => {
  it('prints usage when given nothing or --help', () => {
    expect(parseSetConfigArgs([])).toEqual({ help: true, list: false })
    expect(parseSetConfigArgs(['--help'])).toEqual({ help: true, list: false })
  })

  it('parses --list', () => {
    expect(parseSetConfigArgs(['--list'])).toEqual({ help: false, list: true })
  })

  it('parses a boolean toggle', () => {
    expect(parseSetConfigArgs(['auto_promote_waitlist', 'false'])).toEqual({
      help: false,
      list: false,
      key: 'auto_promote_waitlist',
      value: 'false',
    })
  })

  it('parses a positive capacity', () => {
    expect(parseSetConfigArgs(['total_venue_capacity', '450'])).toEqual({
      help: false,
      list: false,
      key: 'total_venue_capacity',
      value: '450',
    })
  })

  it('rejects a non-boolean value', () => {
    expect(() => parseSetConfigArgs(['is_registration_open', 'yes'])).toThrow(
      'is_registration_open must be true or false'
    )
  })

  it('rejects a non-positive or fractional capacity', () => {
    expect(() => validateConfigValue('total_venue_capacity', '0')).toThrow('positive integer')
    expect(() => validateConfigValue('total_venue_capacity', '450.5')).toThrow('positive integer')
    expect(() => validateConfigValue('total_venue_capacity', 'abc')).toThrow('positive integer')
  })

  it('rejects unknown keys instead of writing junk rows', () => {
    expect(() => parseSetConfigArgs(['capacity', '450'])).toThrow('Unknown key: capacity')
  })

  it('rejects extra arguments', () => {
    expect(() => parseSetConfigArgs(['auto_promote_waitlist', 'false', 'extra'])).toThrow(
      'Expected --list or <key> <value>'
    )
  })

  // Guards against drift with REGISTRATION_CONFIG_KEYS in config.service.ts
  it('covers exactly the keys the service reads', () => {
    expect([...CONFIG_KEYS]).toEqual([
      'total_venue_capacity',
      'max_online_quota',
      'is_registration_open',
      'auto_promote_waitlist',
    ])
  })
})
