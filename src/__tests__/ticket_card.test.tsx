import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import TicketCard from '@/components/TicketCard'

describe('TicketCard Component', () => {
  const mockParticipant = {
    id: 'p-1',
    full_name: 'Tiffany Titania',
    whatsapp_number: '081234567890',
    qr_token: '550e8400-e29b-41d4-a716-446655440000',
    is_child: false,
  }

  const originalFetch = global.fetch
  const originalCreateObjectURL = window.URL.createObjectURL
  const originalRevokeObjectURL = window.URL.revokeObjectURL

  beforeEach(() => {
    jest.clearAllMocks()
    window.URL.createObjectURL = jest.fn(() => 'blob:http://localhost/mock-blob-uuid')
    window.URL.revokeObjectURL = jest.fn()
    HTMLAnchorElement.prototype.click = jest.fn()
  })

  afterAll(() => {
    global.fetch = originalFetch
    window.URL.createObjectURL = originalCreateObjectURL
    window.URL.revokeObjectURL = originalRevokeObjectURL
  })

  it('renders participant details and readable ticket code', () => {
    render(<TicketCard participant={mockParticipant} />)

    expect(screen.getByText('Tiffany Titania')).toBeInTheDocument()
    expect(screen.getByText(/081234567890/)).toBeInTheDocument()
    expect(screen.getByTestId('ticket-code-text')).toHaveTextContent(mockParticipant.qr_token)
  })

  it('renders child badge if participant is a child', () => {
    render(
      <TicketCard
        participant={{
          ...mockParticipant,
          full_name: 'Anak Tiffany',
          is_child: true,
        }}
      />
    )

    expect(screen.getByText('Anak')).toBeInTheDocument()
  })

  it('uses the framed image endpoint and download button with correct filename', () => {
    render(<TicketCard participant={mockParticipant} />)

    // Framed image endpoint must be used
    const expectedEndpoint = `/api/ticket/${mockParticipant.qr_token}/image`
    const img = screen.getByTestId('qr-image')
    expect(img).toBeInTheDocument()
    expect(img.getAttribute('src')).toBe(expectedEndpoint)
    // Verifies that plain QR data URL client generation is NOT used
    expect(img.getAttribute('src')).not.toMatch(/^data:image\/png;base64,/)

    // Check download button attributes
    const downloadBtn = screen.getByTestId('download-qr-btn')
    expect(downloadBtn).toBeInTheDocument()
    expect(downloadBtn.getAttribute('download')).toBe(
      `tiket-jki-shema-${mockParticipant.qr_token}.png`
    )
    expect(downloadBtn.getAttribute('href')).toBe(expectedEndpoint)
  })

  it('displays loading state and transitions on image load', () => {
    render(<TicketCard participant={mockParticipant} />)

    // Loading indicator is present initially
    expect(screen.getByTestId('qr-loading')).toBeInTheDocument()

    // Trigger image load event
    const img = screen.getByTestId('qr-image')
    fireEvent.load(img)

    // Loading indicator disappears
    expect(screen.queryByTestId('qr-loading')).not.toBeInTheDocument()
  })

  it('displays error state when image fails to load', () => {
    render(<TicketCard participant={mockParticipant} />)

    const img = screen.getByTestId('qr-image')
    fireEvent.error(img)

    expect(screen.getByTestId('qr-error')).toBeInTheDocument()
    expect(screen.getByText('Gagal memuat tiket.')).toBeInTheDocument()
    expect(screen.queryByTestId('download-qr-btn')).not.toBeInTheDocument()
  })

  it('handles empty qr_token gracefully with error message', () => {
    render(
      <TicketCard
        participant={{
          ...mockParticipant,
          qr_token: '',
        }}
      />
    )

    expect(screen.getByTestId('qr-error')).toBeInTheDocument()
    expect(screen.getByText('Kode tiket tidak ditemukan.')).toBeInTheDocument()
    expect(screen.queryByTestId('download-qr-btn')).not.toBeInTheDocument()
  })

  it('initiates verified PNG blob download when download button is clicked', async () => {
    const mockBlob = new Blob(['mock-framed-png-bytes'], { type: 'image/png' })
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: {
        get: (h: string) => (h.toLowerCase() === 'content-type' ? 'image/png' : null),
      },
      blob: async () => mockBlob,
    })

    render(<TicketCard participant={mockParticipant} />)

    const downloadBtn = screen.getByTestId('download-qr-btn')
    fireEvent.click(downloadBtn)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(`/api/ticket/${mockParticipant.qr_token}/image`)
      expect(window.URL.createObjectURL).toHaveBeenCalledWith(mockBlob)
    })
  })
})
