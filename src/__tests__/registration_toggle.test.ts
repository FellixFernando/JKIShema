jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))
jest.mock('@/lib/auth', () => ({
  authOptions: {},
}))
jest.mock('@/services/config.service', () => ({
  setSystemConfig: jest.fn(),
  getRegistrationSettings: jest.fn(),
}))

import { PATCH } from '@/app/api/admin/settings/registration/route'
import { getServerSession } from 'next-auth'
import { setSystemConfig } from '@/services/config.service'

const request = (body: unknown) =>
  new Request('http://localhost/api/admin/settings/registration', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('PATCH /api/admin/settings/registration', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(setSystemConfig as jest.Mock).mockResolvedValue({})
  })

  it('rejects unauthenticated requests', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(null)

    const response = await PATCH(request({ is_registration_open: false }))

    expect(response.status).toBe(401)
  })

  it('rejects an ADMIN session', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue({
      user: { name: 'admin', role: 'ADMIN' },
    })

    const response = await PATCH(request({ is_registration_open: false }))

    expect(response.status).toBe(403)
    expect(setSystemConfig).not.toHaveBeenCalled()
  })

  it('rejects a non-boolean body', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue({
      user: { name: 'master', role: 'MASTER' },
    })

    const response = await PATCH(request({ is_registration_open: 'false' }))

    expect(response.status).toBe(400)
    expect(setSystemConfig).not.toHaveBeenCalled()
  })

  it('closes registration for a MASTER session', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue({
      user: { name: 'master', role: 'MASTER' },
    })

    const response = await PATCH(request({ is_registration_open: false }))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(setSystemConfig).toHaveBeenCalledWith('is_registration_open', 'false')
    expect(json).toEqual({ success: true, is_registration_open: false })
  })
})
