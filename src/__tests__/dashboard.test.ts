import { getDashboardStats, getParticipants } from '@/services/dashboard.service'
import { db } from '@/lib/db'

jest.mock('@/lib/db', () => ({
  db: {
    participant: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    systemConfig: {
      findUnique: jest.fn(),
    },
  },
}))

describe('Admin Dashboard Service', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should compute real-time quota and attendance statistics correctly', async () => {
    (db.systemConfig.findUnique as jest.Mock).mockResolvedValue({ value: '400' });
    
    // Mocking counts for totalRegistered, onlineCount, onSiteCount, checkedInCount, cancelledCount
    (db.participant.count as jest.Mock)
      .mockResolvedValueOnce(250) // total registered
      .mockResolvedValueOnce(230) // online count
      .mockResolvedValueOnce(20)  // on-site count
      .mockResolvedValueOnce(150) // checked-in count
      .mockResolvedValueOnce(5)   // cancelled count

    const stats = await getDashboardStats()

    expect(stats.totalCapacity).toBe(440)
    expect(stats.totalRegistered).toBe(250)
    expect(stats.onlineCount).toBe(230)
    expect(stats.onSiteCount).toBe(20)
    expect(stats.checkedInCount).toBe(150)
    expect(stats.cancelledCount).toBe(5)
    expect(stats.remainingOnlineQuota).toBe(170) // 400 - 230
  })

  it('should query participants with search and status filtering', async () => {
    const mockList = [
      {
        id: '1',
        full_name: 'Budi Santoso',
        whatsapp_number: '08123456789',
        status: 'REGISTERED',
      },
    ];

    (db.participant.findMany as jest.Mock).mockResolvedValue(mockList)

    const result = await getParticipants({ search: 'Budi', status: 'REGISTERED' })

    expect(result).toHaveLength(1)
    expect(db.participant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'REGISTERED',
          OR: expect.arrayContaining([
            { full_name: { contains: 'Budi', mode: 'insensitive' } },
            { whatsapp_number: { contains: 'Budi' } },
          ]),
        }),
      })
    )
  })
})
