/**
 * Comprehensive Integration Tests for Phase 6C.4:
 * WhatsApp Admin Dashboard Integration
 */

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import AdminDashboardPage from '@/app/admin/page'

// Mock next-auth/react
jest.mock('next-auth/react', () => ({
  signOut: jest.fn(),
  useSession: jest.fn(() => ({ data: { user: { name: 'Admin', role: 'ADMIN' } }, status: 'authenticated' })),
}))

// Mock next/link
jest.mock('next/link', () => {
  return ({ children, href }: any) => <a href={href}>{children}</a>
})

describe('Phase 6C.4: Admin Dashboard WhatsApp Integration', () => {
  const originalFetch = global.fetch

  const mockDashboardStats = {
    totalCapacity: 440,
    maxOnlineQuota: 400,
    totalRegistered: 10,
    onlineCount: 8,
    onSiteCount: 2,
    checkedInCount: 3,
    cancelledCount: 1,
    remainingOnlineQuota: 392,
    whatsappDeliveryStats: {
      delivered: 5,
      read: 2,
      sent: 1,
      processing: 1,
      failed: 1,
      unknown: 1,
      not_sent: 0,
      cancelled: 0,
      total: 11,
    },
  }

  const mockParticipants = [
    {
      id: 'p-1',
      full_name: 'Budi Santoso',
      whatsapp_number: '081234567890',
      church_status: 'BERGEREJA',
      church_branch: 'Pusat',
      is_child: false,
      status: 'REGISTERED',
      registration_type: 'ONLINE',
      checked_in_at: null,
      created_at: '2026-11-20T10:00:00Z',
      delivery: {
        id: 'del-1',
        status: 'FAILED',
        total_attempts: 1,
        last_error_code: 'UPLOAD_FAILED',
        updated_at: '2026-11-20T10:05:00Z',
      },
    },
    {
      id: 'p-2',
      full_name: 'Siti Rahma',
      whatsapp_number: '081987654321',
      church_status: 'TIDAK_BERGEREJA',
      church_branch: null,
      is_child: false,
      status: 'REGISTERED',
      registration_type: 'ONLINE',
      checked_in_at: null,
      created_at: '2026-11-20T11:00:00Z',
      delivery: {
        id: 'del-2',
        status: 'DELIVERED',
        total_attempts: 1,
        last_error_code: null,
        updated_at: '2026-11-20T11:02:00Z',
      },
    },
    {
      id: 'p-3',
      full_name: 'Agus Wijaya',
      whatsapp_number: '081122334455',
      church_status: 'BERGEREJA',
      church_branch: 'Barat',
      is_child: false,
      status: 'REGISTERED',
      registration_type: 'ONLINE',
      checked_in_at: null,
      created_at: '2026-11-20T12:00:00Z',
      delivery: {
        id: 'del-3',
        status: 'UNKNOWN',
        total_attempts: 1,
        last_error_code: 'TIMEOUT',
        updated_at: '2026-11-20T12:05:00Z',
      },
    },
  ]

  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn((url: string) => {
      if (url.includes('/api/admin/dashboard')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockDashboardStats,
        })
      }
      if (url.includes('/api/admin/participants')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockParticipants,
        })
      }
      if (url.includes('/api/admin/delivery/p-1')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            id: 'del-1',
            participant_id: 'p-1',
            participant_name: 'Budi Santoso',
            recipient_phone: '081234567890',
            status: 'FAILED',
            total_attempts: 1,
            attempts: [
              {
                id: 'att-1',
                attempt_number: 1,
                status: 'FAILED',
                meta_message_id: null,
                error_code: 'UPLOAD_FAILED',
                error_message: 'Upload failed',
                request_started_at: '2026-11-20T10:00:00Z',
              },
            ],
            reconciliations: [],
          }),
        })
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({}),
      })
    }) as any
  })

  afterAll(() => {
    global.fetch = originalFetch
  })

  it('renders Event Registration cards and toggles WhatsApp Delivery Monitoring cards into view', async () => {
    render(<AdminDashboardPage />)

    await waitFor(() => {
      // Event stats are visible by default
      expect(screen.getByText('Statistik Pendaftaran Acara')).toBeInTheDocument()
      expect(screen.getByText('Total Kapasitas')).toBeInTheDocument()
      expect(screen.getByText('Monitoring Pengiriman Tiket WhatsApp (Cloud API)')).toBeInTheDocument()
    })

    // Initially collapsed for cleaner D-Day admission view
    expect(screen.getByText('Tampilkan Statistik WA')).toBeInTheDocument()
    expect(screen.queryByText('Sampai di HP')).not.toBeInTheDocument()

    // Click toggle to bring WhatsApp stats into view
    fireEvent.click(screen.getByText('Tampilkan Statistik WA'))

    await waitFor(() => {
      expect(screen.getByText('Sembunyikan Statistik WA')).toBeInTheDocument()
      expect(screen.getByText('5')).toBeInTheDocument() // Delivered count
      expect(screen.getByText('Sampai di HP')).toBeInTheDocument()
      expect(screen.getByText('Dibuka Peserta')).toBeInTheDocument()
      expect(screen.getByText('In-Flight / Lock')).toBeInTheDocument()
      expect(screen.getByText('Timeout / Soak')).toBeInTheDocument()
    })
  })

  it('renders participant table with "Status Tiket WA" column and badges', async () => {
    render(<AdminDashboardPage />)

    await waitFor(() => {
      expect(screen.getByText('Status Tiket WA')).toBeInTheDocument()
      // Budi Santoso -> FAILED badge
      expect(screen.getAllByText('Gagal').length).toBeGreaterThanOrEqual(1)
      // Siti Rahma -> DELIVERED badge
      expect(screen.getAllByText('Diterima').length).toBeGreaterThanOrEqual(1)
      // Agus Wijaya -> UNKNOWN badge
      expect(screen.getByText('Unresolved (Perlu Cek)')).toBeInTheDocument()
    })
  })

  it('filters participants by WhatsApp status via waStatusFilter dropdown', async () => {
    render(<AdminDashboardPage />)

    await waitFor(() => {
      expect(screen.getByText('Budi Santoso')).toBeInTheDocument()
    })

    const waFilterSelect = screen.getByDisplayValue('Semua Status WA')
    expect(screen.getByRole('option', { name: '⊘ Batal WA (Cancelled)' })).toBeInTheDocument()
    fireEvent.change(waFilterSelect, { target: { value: 'FAILED' } })

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('wa_status=FAILED')
      )
    })

    // Also verify selecting CANCELLED sends wa_status=CANCELLED
    fireEvent.change(waFilterSelect, { target: { value: 'CANCELLED' } })
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('wa_status=CANCELLED')
      )
    })
  })

  it('toggles WhatsApp options into view and opens WhatsApp Delivery Drawer on Inspect', async () => {
    render(<AdminDashboardPage />)

    await waitFor(() => {
      expect(screen.getByText('Budi Santoso')).toBeInTheDocument()
    })

    // Initially hidden for cleaner D-Day admission view
    expect(screen.queryByText('Inspect')).not.toBeInTheDocument()

    // Toggle WhatsApp actions into view
    fireEvent.click(screen.getByText('Tampilkan Opsi WA'))

    await waitFor(() => {
      expect(screen.getByText('Sembunyikan Opsi WA')).toBeInTheDocument()
      expect(screen.getAllByRole('button', { name: 'Inspect' }).length).toBeGreaterThanOrEqual(1)
    })

    const inspectButtons = screen.getAllByRole('button', { name: 'Inspect' })
    fireEvent.click(inspectButtons[0]) // Click first participant's Inspect

    await waitFor(() => {
      expect(screen.getByText('Inspeksi WhatsApp Tiket')).toBeInTheDocument()
      expect(screen.getByText('Riwayat Percobaan Pengiriman (1)')).toBeInTheDocument()
    })

    // Close drawer
    fireEvent.click(screen.getByLabelText('Tutup panel inspeksi'))
    await waitFor(() => {
      expect(screen.queryByText('Inspeksi WhatsApp Tiket')).not.toBeInTheDocument()
    })
  })

  it('shows "Resend" button ONLY for eligible participants when WA options are toggled on', async () => {
    render(<AdminDashboardPage />)

    await waitFor(() => {
      expect(screen.getByText('Budi Santoso')).toBeInTheDocument()
    })

    // Toggle WA options into view
    fireEvent.click(screen.getByText('Tampilkan Opsi WA'))

    await waitFor(() => {
      // Budi Santoso is FAILED -> has Resend button; Siti (DELIVERED) and Agus (UNKNOWN) do not
      const resendButtons = screen.getAllByRole('button', { name: 'Resend' })
      expect(resendButtons).toHaveLength(1)
    })
  })

  it('opens Resend Modal, submits resend, and refreshes dashboard on success', async () => {
    // Mock successful resend POST
    ;(global.fetch as jest.Mock).mockImplementation((url: string, opts?: any) => {
      if (url.includes('/api/admin/delivery/p-1/resend') && opts?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            deliveryStatus: 'SENT',
            whatsappMessageId: 'wamid.HBgLM99999',
          }),
        })
      }
      if (url.includes('/api/admin/dashboard')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockDashboardStats,
        })
      }
      if (url.includes('/api/admin/participants')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockParticipants,
        })
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) })
    })

    render(<AdminDashboardPage />)

    await waitFor(() => {
      expect(screen.getByText('Budi Santoso')).toBeInTheDocument()
    })

    // Toggle WA options into view
    fireEvent.click(screen.getByText('Tampilkan Opsi WA'))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Resend' })).toBeInTheDocument()
    })

    const resendBtn = screen.getByRole('button', { name: 'Resend' })
    fireEvent.click(resendBtn)

    // Modal is open
    expect(screen.getByText('Kirim Ulang Tiket WhatsApp')).toBeInTheDocument()

    // Type reason
    const textarea = screen.getByPlaceholderText(/Contoh: Peserta mengonfirmasi nomor/i)
    fireEvent.change(textarea, { target: { value: 'Nomor telah diverifikasi via telepon' } })

    // Submit resend
    fireEvent.click(screen.getByRole('button', { name: /Konfirmasi & Kirim Ulang/i }))

    await waitFor(() => {
      expect(
        screen.getByText(/Tiket WhatsApp berhasil dikirim ulang/i)
      ).toBeInTheDocument()
    })
  })
})
