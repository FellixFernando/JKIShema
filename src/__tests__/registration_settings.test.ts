import { getRegistrationSettings } from '@/services/config.service'

const makeClient = (rows: Array<{ key: string; value: string }>) =>
  ({
    systemConfig: {
      findMany: jest.fn().mockResolvedValue(rows),
    },
  }) as any

describe('getRegistrationSettings', () => {
  it('uses the 450 defaults when no config rows exist', async () => {
    await expect(getRegistrationSettings(makeClient([]))).resolves.toEqual({
      totalCapacity: 450,
      maxOnlineQuota: 450,
      isRegistrationOpen: true,
      autoPromoteWaitlist: true,
    })
  })

  it('reads configured values', async () => {
    const settings = await getRegistrationSettings(
      makeClient([
        { key: 'total_venue_capacity', value: '500' },
        { key: 'max_online_quota', value: '300' },
        { key: 'is_registration_open', value: 'false' },
        { key: 'auto_promote_waitlist', value: 'false' },
      ])
    )

    expect(settings).toEqual({
      totalCapacity: 500,
      maxOnlineQuota: 300,
      isRegistrationOpen: false,
      autoPromoteWaitlist: false,
    })
  })

  it('falls back on invalid capacity and boolean values', async () => {
    const settings = await getRegistrationSettings(
      makeClient([
        { key: 'total_venue_capacity', value: 'not-a-number' },
        { key: 'max_online_quota', value: '0' },
        { key: 'is_registration_open', value: 'yes' },
        { key: 'auto_promote_waitlist', value: 'no' },
      ])
    )

    expect(settings).toEqual({
      totalCapacity: 450,
      maxOnlineQuota: 450,
      isRegistrationOpen: true,
      autoPromoteWaitlist: true,
    })
  })
})
