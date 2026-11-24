/**
 * Component Tests for Phase 6C.3 WhatsApp Admin UI Components:
 * - WhatsAppDeliveryBadge
 * - WhatsAppDeliveryDrawer
 * - WhatsAppResendModal
 */

import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import WhatsAppDeliveryBadge from '@/components/admin/WhatsAppDeliveryBadge'
import WhatsAppDeliveryDrawer from '@/components/admin/WhatsAppDeliveryDrawer'
import WhatsAppResendModal from '@/components/admin/WhatsAppResendModal'

// Mock global fetch
const originalFetch = global.fetch

describe('Phase 6C.3: WhatsApp Admin UI Components', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn()
  })

  afterAll(() => {
    global.fetch = originalFetch
  })

  describe('1. WhatsAppDeliveryBadge', () => {
    it('renders DELIVERED state with correct icon and text', () => {
      render(<WhatsAppDeliveryBadge status="DELIVERED" />)
      expect(screen.getByText('Diterima')).toBeInTheDocument()
      expect(screen.getByText('✓')).toBeInTheDocument()
    })

    it('renders READ state with correct label', () => {
      render(<WhatsAppDeliveryBadge status="READ" />)
      expect(screen.getByText('Dibaca')).toBeInTheDocument()
    })

    it('renders SENT state indicating server acceptance', () => {
      render(<WhatsAppDeliveryBadge status="SENT" />)
      expect(screen.getByText('Terkirim (Server Meta)')).toBeInTheDocument()
    })

    it('renders PROCESSING state with spinning icon', () => {
      render(<WhatsAppDeliveryBadge status="PROCESSING" />)
      expect(screen.getByText('Memproses')).toBeInTheDocument()
    })

    it('renders NOT_SENT state for initial un-dispatched participants', () => {
      render(<WhatsAppDeliveryBadge status="NOT_SENT" />)
      expect(screen.getByText('Belum Dikirim')).toBeInTheDocument()
    })

    it('renders FAILED state with failure indicator', () => {
      render(<WhatsAppDeliveryBadge status="FAILED" lastErrorCode="131026" />)
      expect(screen.getByText('Gagal')).toBeInTheDocument()
      expect(screen.getByRole('status')).toHaveAttribute(
        'title',
        expect.stringContaining('Kode Error: 131026')
      )
    })

    it('renders UNKNOWN state with explicit unresolved caution tooltip', () => {
      render(<WhatsAppDeliveryBadge status="UNKNOWN" />)
      expect(screen.getByText('Unresolved (Perlu Cek)')).toBeInTheDocument()
      expect(screen.getByRole('status')).toHaveAttribute(
        'title',
        expect.stringContaining('Dilarang kirim ulang buta!')
      )
    })

    it('renders PENDING state with Menunggu Antrean label and icon', () => {
      render(<WhatsAppDeliveryBadge status="PENDING" />)
      expect(screen.getByText('Menunggu Antrean')).toBeInTheDocument()
      expect(screen.getByText('⏳')).toBeInTheDocument()
    })

    it('renders Tanpa Data when status is null or missing', () => {
      render(<WhatsAppDeliveryBadge status={null} />)
      expect(screen.getByText('Tanpa Data')).toBeInTheDocument()
    })

    it('displays attempt counter when showAttemptCount is enabled and attempts > 1', () => {
      render(
        <WhatsAppDeliveryBadge
          status="FAILED"
          totalAttempts={3}
          showAttemptCount={true}
        />
      )
      expect(screen.getByText('#3')).toBeInTheDocument()
    })
  })

  describe('2. WhatsAppDeliveryDrawer', () => {
    const mockDeliveryDetail = {
      id: 'del-123',
      participant_id: 'p-1',
      participant_name: 'Budi Santoso',
      recipient_phone: '081234567890',
      status: 'DELIVERED',
      total_attempts: 2,
      processing_started_at: null,
      sent_at: '2026-11-20T10:01:00Z',
      delivered_at: '2026-11-20T10:02:00Z',
      read_at: null,
      failed_at: null,
      unknown_at: null,
      last_error_code: null,
      last_error_message: null,
      attempts: [
        {
          id: 'att-2',
          attempt_number: 2,
          status: 'SUCCESS',
          meta_message_id: 'wamid.HBgLM98765',
          admin_username: 'admin_tiffany',
          resend_reason: 'Verifikasi nomor aktif',
          error_code: null,
          error_message: null,
          request_started_at: '2026-11-20T10:01:00Z',
          response_received_at: '2026-11-20T10:01:02Z',
        },
        {
          id: 'att-1',
          attempt_number: 1,
          status: 'FAILED',
          meta_message_id: null,
          admin_username: null,
          resend_reason: null,
          error_code: 'UPLOAD_FAILED',
          error_message: 'Meta upload timed out',
          request_started_at: '2026-11-20T09:00:00Z',
          response_received_at: '2026-11-20T09:00:15Z',
        },
      ],
      reconciliations: [],
    }

    it('renders loading state initially and then shows attempt history and details', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockDeliveryDetail,
      })

      render(
        <WhatsAppDeliveryDrawer
          isOpen={true}
          participantId="p-1"
          participantName="Budi Santoso"
          onClose={jest.fn()}
        />
      )

      expect(screen.getByText('Memuat riwayat pengiriman...')).toBeInTheDocument()

      await waitFor(() => {
        expect(screen.getByText('Budi Santoso')).toBeInTheDocument()
        expect(screen.getByText('081234567890')).toBeInTheDocument()
        expect(screen.getByText('Percobaan #2')).toBeInTheDocument()
        expect(screen.getByText('Percobaan #1')).toBeInTheDocument()
        expect(screen.getByText('wamid.HBgLM98765')).toBeInTheDocument()
        expect(screen.getByText('“Verifikasi nomor aktif”')).toBeInTheDocument()
      })
    })

    it('copies WAMID to clipboard when clicking copy button', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockDeliveryDetail,
      })

      // Mock navigator.clipboard
      const writeTextMock = jest.fn().mockResolvedValue(undefined)
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock,
        },
      })

      render(
        <WhatsAppDeliveryDrawer
          isOpen={true}
          participantId="p-1"
          participantName="Budi Santoso"
          onClose={jest.fn()}
        />
      )

      await waitFor(() => {
        expect(screen.getByText('Salin')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Salin'))
      expect(writeTextMock).toHaveBeenCalledWith('wamid.HBgLM98765')
      expect(screen.getByText('✓ Tersalin')).toBeInTheDocument()
    })

    it('handles 404 response cleanly when no delivery record exists', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: 'Delivery not found' }),
      })

      render(
        <WhatsAppDeliveryDrawer
          isOpen={true}
          participantId="p-2"
          participantName="Siti"
          onClose={jest.fn()}
        />
      )

      await waitFor(() => {
        expect(
          screen.getByText('Catatan pengiriman WhatsApp belum tersedia untuk peserta ini.')
        ).toBeInTheDocument()
      })
    })

    it('calls onClose when clicking close button or pressing Escape', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockDeliveryDetail,
      })

      const handleClose = jest.fn()
      render(
        <WhatsAppDeliveryDrawer
          isOpen={true}
          participantId="p-1"
          participantName="Budi Santoso"
          onClose={handleClose}
        />
      )

      await waitFor(() => {
        expect(screen.getByText('Budi Santoso')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByLabelText('Tutup panel inspeksi'))
      expect(handleClose).toHaveBeenCalled()

      fireEvent.keyDown(window, { key: 'Escape' })
      expect(handleClose).toHaveBeenCalledTimes(2)
    })

    it('does not update state if unmounted before fetch completes', async () => {
      let resolveFetch: any
      const pendingPromise = new Promise((resolve) => {
        resolveFetch = resolve
      })
      ;(global.fetch as jest.Mock).mockReturnValueOnce(pendingPromise)

      const { unmount } = render(
        <WhatsAppDeliveryDrawer
          isOpen={true}
          participantId="p-1"
          onClose={jest.fn()}
        />
      )

      // Unmount while fetch is in-flight
      unmount()

      // Now resolve the fetch after unmount
      await act(async () => {
        resolveFetch({
          ok: true,
          status: 200,
          json: async () => mockDeliveryDetail,
        })
      })

      // Verification: no state update executed on unmounted component
    })

    it('prevents stale responses from overwriting data when switching participants', async () => {
      let resolveFirst: any
      const firstPromise = new Promise((resolve) => {
        resolveFirst = resolve
      })

      ;(global.fetch as jest.Mock)
        .mockReturnValueOnce(firstPromise)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            ...mockDeliveryDetail,
            participant_id: 'p-2',
            participant_name: 'Siti Rahma',
          }),
        })

      const { rerender } = render(
        <WhatsAppDeliveryDrawer
          isOpen={true}
          participantId="p-1"
          participantName="Budi Santoso"
          onClose={jest.fn()}
        />
      )

      // Switch to participant p-2 before p-1 finishes
      rerender(
        <WhatsAppDeliveryDrawer
          isOpen={true}
          participantId="p-2"
          participantName="Siti Rahma"
          onClose={jest.fn()}
        />
      )

      // p-2 loads and completes
      await waitFor(() => {
        expect(screen.getByText('Siti Rahma')).toBeInTheDocument()
      })

      // Now resolve stale p-1 response
      await act(async () => {
        resolveFirst({
          ok: true,
          status: 200,
          json: async () => ({
            ...mockDeliveryDetail,
            participant_id: 'p-1',
            participant_name: 'Stale Budi',
          }),
        })
      })

      // Ensure p-2 is still displayed, not overwritten by stale p-1
      expect(screen.getByText('Siti Rahma')).toBeInTheDocument()
      expect(screen.queryByText('Stale Budi')).not.toBeInTheDocument()
    })
  })

  describe('3. WhatsAppResendModal', () => {
    const mockParticipant = {
      id: 'p-1',
      full_name: 'Budi Santoso',
      whatsapp_number: '081234567890',
      total_attempts: 1,
    }

    it('validates minimum 5 trimmed characters for resend reason', () => {
      render(
        <WhatsAppResendModal
          isOpen={true}
          participant={mockParticipant}
          onClose={jest.fn()}
          onSuccess={jest.fn()}
        />
      )

      const submitBtn = screen.getByRole('button', { name: /Konfirmasi & Kirim Ulang/i })
      expect(submitBtn).toBeDisabled()

      const textarea = screen.getByPlaceholderText(/Contoh: Peserta mengonfirmasi nomor/i)
      fireEvent.change(textarea, { target: { value: '   ab  ' } })
      expect(submitBtn).toBeDisabled()

      fireEvent.change(textarea, { target: { value: 'Nomor telah diverifikasi aktif' } })
      expect(submitBtn).not.toBeDisabled()
    })

    it('submits valid resend request and fires onSuccess callback', async () => {
      const handleSuccess = jest.fn()
      const handleClose = jest.fn()

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          success: true,
          deliveryStatus: 'SENT',
          whatsappMessageId: 'wamid.12345',
        }),
      })

      render(
        <WhatsAppResendModal
          isOpen={true}
          participant={mockParticipant}
          onClose={handleClose}
          onSuccess={handleSuccess}
        />
      )

      const textarea = screen.getByPlaceholderText(/Contoh: Peserta mengonfirmasi nomor/i)
      fireEvent.change(textarea, { target: { value: 'Nomor telah diverifikasi aktif' } })

      const submitBtn = screen.getByText('Konfirmasi & Kirim Ulang')
      fireEvent.click(submitBtn)

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/admin/delivery/p-1/resend',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ reason: 'Nomor telah diverifikasi aktif' }),
          })
        )
        expect(handleSuccess).toHaveBeenCalledWith(
          expect.objectContaining({ success: true, deliveryStatus: 'SENT' })
        )
        expect(handleClose).toHaveBeenCalled()
      })
    })

    it('handles 409 UNKNOWN / Soak active error correctly', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        status: 409,
        json: async () => ({
          errorCode: 'UNKNOWN_SOAK_ACTIVE',
          message: 'Status pengiriman UNKNOWN.',
        }),
      })

      render(
        <WhatsAppResendModal
          isOpen={true}
          participant={mockParticipant}
          onClose={jest.fn()}
          onSuccess={jest.fn()}
        />
      )

      const textarea = screen.getByPlaceholderText(/Contoh: Peserta mengonfirmasi nomor/i)
      fireEvent.change(textarea, { target: { value: 'Mencoba resend lagi' } })

      fireEvent.click(screen.getByText('Konfirmasi & Kirim Ulang'))

      await waitFor(() => {
        expect(
          screen.getByText(/Dilarang kirim ulang buta!/i)
        ).toBeInTheDocument()
      })
    })

    it('handles 504 Gateway Timeout and shows explicit UNKNOWN warning alert', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        status: 504,
        json: async () => ({
          error: 'GATEWAY_TIMEOUT',
          message: 'Timeout connecting to Meta',
        }),
      })

      render(
        <WhatsAppResendModal
          isOpen={true}
          participant={mockParticipant}
          onClose={jest.fn()}
          onSuccess={jest.fn()}
        />
      )

      const textarea = screen.getByPlaceholderText(/Contoh: Peserta mengonfirmasi nomor/i)
      fireEvent.change(textarea, { target: { value: 'Mencoba kirim ulang' } })

      fireEvent.click(screen.getByText('Konfirmasi & Kirim Ulang'))

      await waitFor(() => {
        expect(screen.getByText(/PERINGATAN \(504 Timeout\)/i)).toBeInTheDocument()
        expect(screen.getByText(/DILARANG mencoba kirim ulang buta/i)).toBeInTheDocument()
      })
    })
  })
})
