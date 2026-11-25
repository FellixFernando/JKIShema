import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import AdminDashboardPage from '@/app/admin/page'

jest.mock('next-auth/react', () => ({
  signOut: jest.fn(),
  useSession: jest.fn(() => ({
    data: { user: { name: 'Master', role: 'MASTER' } },
    status: 'authenticated',
  })),
}))

jest.mock('next/link', () => {
  return ({ children, href }: any) => <a href={href}>{children}</a>
})

const stats = {
  totalCapacity: 450,
  maxOnlineQuota: 450,
  totalRegistered: 448,
  onlineCount: 400,
  onSiteCount: 48,
  checkedInCount: 100,
  cancelledCount: 2,
  waitlistCount: 3,
  isRegistrationOpen: true,
  remainingOnlineQuota: 50,
  whatsappDeliveryStats: {
    not_sent: 0,
    pending: 0,
    processing: 0,
    sent: 0,
    delivered: 0,
    read: 0,
    failed: 0,
    unknown: 0,
    cancelled: 0,
    total: 0,
  },
}

describe('Admin dashboard registration toggle', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = jest.fn((url: any, init?: any) => {
      const target = String(url)
      if (target.includes('/api/admin/settings/registration')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ success: true, is_registration_open: false }),
        })
      }
      if (target.includes('/api/admin/dashboard')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => stats })
      }
      if (target.includes('/api/admin/participants')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => [] })
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) })
    }) as any
  })

  afterAll(() => {
    global.fetch = originalFetch
  })

  it('shows the waitlist count and closes registration for a MASTER', async () => {
    render(<AdminDashboardPage />)

    await waitFor(() => {
      expect(screen.getByText('Daftar Tunggu')).toBeInTheDocument()
      expect(screen.getByText('3')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Tutup Pendaftaran'))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/admin/settings/registration',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ is_registration_open: false }),
        })
      )
      expect(screen.getByText('Pendaftaran ditutup.')).toBeInTheDocument()
    })
  })
})
