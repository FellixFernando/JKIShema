import { getSystemConfig, setSystemConfig } from '@/services/config.service'
import { db } from '@/lib/db'

jest.mock('@/lib/db', () => ({
  db: {
    systemConfig: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  },
}))

describe('System Config Service', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should return default value if key is not found in database', async () => {
    (db.systemConfig.findUnique as jest.Mock).mockResolvedValue(null)

    const isOpen = await getSystemConfig('is_registration_open', 'true')
    expect(isOpen).toBe('true')
    expect(db.systemConfig.findUnique).toHaveBeenCalledWith({
      where: { key: 'is_registration_open' },
    })
  })

  it('should return stored value from database if present', async () => {
    (db.systemConfig.findUnique as jest.Mock).mockResolvedValue({
      key: 'is_registration_open',
      value: 'false',
    })

    const isOpen = await getSystemConfig('is_registration_open', 'true')
    expect(isOpen).toBe('false')
  })

  it('should update or insert system config value', async () => {
    (db.systemConfig.upsert as jest.Mock).mockResolvedValue({
      key: 'is_registration_open',
      value: 'false',
    })

    const result = await setSystemConfig('is_registration_open', 'false')
    expect(result.value).toBe('false')
    expect(db.systemConfig.upsert).toHaveBeenCalledWith({
      where: { key: 'is_registration_open' },
      update: { value: 'false' },
      create: { key: 'is_registration_open', value: 'false' },
    })
  })
})
