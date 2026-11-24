import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import OnSiteRegistrationModal from '@/components/admin/OnSiteRegistrationModal'

describe('Admin On-Site Registration — UI Component Suite', () => {
  const originalFetch = global.fetch
  const mockFetch = jest.fn()
  const mockOnClose = jest.fn()
  const mockOnSuccess = jest.fn()

  beforeAll(() => {
    global.fetch = mockFetch
  })

  afterAll(() => {
    global.fetch = originalFetch
  })

  beforeEach(() => {
    jest.clearAllMocks()
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: [{ id: 'p1', full_name: 'Budi Santoso', registration_type: 'ON_SITE' }],
      }),
    })
  })

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <OnSiteRegistrationModal isOpen={false} onClose={mockOnClose} onSuccess={mockOnSuccess} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders modal with title, primary registrant fields, and opt-in unchecked by default when isOpen is true', () => {
    render(
      <OnSiteRegistrationModal isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
    )

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Registrasi Peserta On-Site')).toBeInTheDocument()
    expect(screen.getByText('👤 Pendaftar Utama')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Contoh: Budi Santoso')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Contoh: 081234567890')).toBeInTheDocument()
    expect(screen.getByText(/Peserta setuju menerima tiket QR/i)).toBeInTheDocument()

    // Explicit check: WhatsApp opt-in checkbox is unchecked by default
    const optInCheckbox = screen.getByLabelText('Persetujuan WhatsApp Peserta #1')
    expect(optInCheckbox).not.toBeChecked()

    expect(screen.getByText('Langsung Check-In di Tempat')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Daftarkan On-Site/i })).toBeInTheDocument()
  })

  it('allows adding and removing additional group participants', () => {
    render(
      <OnSiteRegistrationModal isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
    )

    const addBtn = screen.getByRole('button', { name: /Tambah Anggota Keluarga/i })
    fireEvent.click(addBtn)

    expect(screen.getByText('👥 Peserta Tambahan #2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Daftarkan On-Site \(2 Peserta\)/i })).toBeInTheDocument()

    // Child checkbox appears on additional participant
    expect(screen.getByText(/Peserta ini adalah Anak/i)).toBeInTheDocument()

    // Remove participant #2
    const removeBtn = screen.getByRole('button', { name: /Hapus/i })
    fireEvent.click(removeBtn)

    expect(screen.queryByText('👥 Peserta Tambahan #2')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Daftarkan On-Site \(1 Peserta\)/i })).toBeInTheDocument()
  })

  it('inherits primary WA number when child checkbox is checked for additional participant', () => {
    render(
      <OnSiteRegistrationModal isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
    )

    // Fill primary WA
    const primaryWaInput = screen.getByPlaceholderText('Contoh: 081234567890')
    fireEvent.change(primaryWaInput, { target: { value: '081299998888' } })

    // Add child
    const addBtn = screen.getByRole('button', { name: /Tambah Anggota Keluarga/i })
    fireEvent.click(addBtn)

    const childCheckbox = screen.getByLabelText(/Peserta ini adalah Anak/i)
    fireEvent.click(childCheckbox)

    // The additional participant WA input becomes disabled and inherits primary WA
    const inputs = screen.getAllByDisplayValue('081299998888')
    expect(inputs.length).toBe(2)
  })

  it('validates required fields before submitting', async () => {
    render(
      <OnSiteRegistrationModal isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
    )

    const submitBtn = screen.getByRole('button', { name: /Daftarkan On-Site/i })
    fireEvent.click(submitBtn)

    // Error alert shown because name is empty
    expect(await screen.findByText('Nama lengkap untuk Peserta #1 wajib diisi.')).toBeInTheDocument()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('prevents submission when WhatsApp opt-in is unchecked', async () => {
    render(
      <OnSiteRegistrationModal isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
    )

    fireEvent.change(screen.getByPlaceholderText('Contoh: Budi Santoso'), {
      target: { value: 'Budi Santoso' },
    })
    fireEvent.change(screen.getByPlaceholderText('Contoh: 081234567890'), {
      target: { value: '081234567890' },
    })
    const branchSelect = screen.getByLabelText('Gereja Cabang Peserta #1')
    fireEvent.change(branchSelect, { target: { value: 'JKI Shema Sunter, Jakarta' } })

    // Submit while WhatsApp opt-in is unchecked
    const submitBtn = screen.getByRole('button', { name: /Daftarkan On-Site/i })
    fireEvent.click(submitBtn)

    expect(await screen.findByText('Persetujuan WhatsApp wajib dicentang untuk Peserta #1.')).toBeInTheDocument()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('submits successfully when WhatsApp opt-in is explicitly checked', async () => {
    render(
      <OnSiteRegistrationModal isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
    )

    fireEvent.change(screen.getByPlaceholderText('Contoh: Budi Santoso'), {
      target: { value: 'Budi Santoso' },
    })
    fireEvent.change(screen.getByPlaceholderText('Contoh: 081234567890'), {
      target: { value: '081234567890' },
    })

    // Select church branch
    const branchSelect = screen.getByLabelText('Gereja Cabang Peserta #1')
    fireEvent.change(branchSelect, { target: { value: 'JKI Shema Sunter, Jakarta' } })

    // Explicitly check WhatsApp opt-in
    const optInCheckbox = screen.getByLabelText('Persetujuan WhatsApp Peserta #1')
    fireEvent.click(optInCheckbox)

    // Toggle immediate check-in
    const checkinCheckbox = screen.getByLabelText(/Langsung Check-In di Tempat/i)
    fireEvent.click(checkinCheckbox)

    const submitBtn = screen.getByRole('button', { name: /Daftarkan On-Site/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/admin/participants',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            participants: [
              {
                full_name: 'Budi Santoso',
                whatsapp_number: '081234567890',
                church_status: 'BERGEREJA',
                church_branch: 'JKI Shema Sunter, Jakarta',
                is_child: false,
                is_wa_opt_in: true,
              },
            ],
            immediate_checkin: true,
          }),
        })
      )
      expect(mockOnSuccess).toHaveBeenCalled()
      expect(mockOnClose).toHaveBeenCalled()
    })
  })

  it('validates that all group participants must have WhatsApp opt-in checked', async () => {
    render(
      <OnSiteRegistrationModal isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
    )

    // Primary registrant
    fireEvent.change(screen.getByPlaceholderText('Contoh: Budi Santoso'), {
      target: { value: 'Budi Santoso' },
    })
    fireEvent.change(screen.getByPlaceholderText('Contoh: 081234567890'), {
      target: { value: '081234567890' },
    })
    fireEvent.change(screen.getByLabelText('Gereja Cabang Peserta #1'), {
      target: { value: 'JKI Shema Sunter, Jakarta' },
    })
    fireEvent.click(screen.getByLabelText('Persetujuan WhatsApp Peserta #1'))

    // Add additional participant (child)
    fireEvent.click(screen.getByRole('button', { name: /Tambah Anggota Keluarga/i }))
    const nameInputs = screen.getAllByPlaceholderText('Contoh: Budi Santoso')
    fireEvent.change(nameInputs[1], { target: { value: 'Anak Budi' } })
    fireEvent.click(screen.getByLabelText(/Peserta ini adalah Anak/i))
    fireEvent.change(screen.getByLabelText('Gereja Cabang Peserta #2'), {
      target: { value: 'JKI Shema Sunter, Jakarta' },
    })

    // Notice: Participant #2's WhatsApp opt-in is still unchecked!
    const submitBtn = screen.getByRole('button', { name: /Daftarkan On-Site \(2 Peserta\)/i })
    fireEvent.click(submitBtn)

    expect(await screen.findByText('Persetujuan WhatsApp wajib dicentang untuk Peserta #2.')).toBeInTheDocument()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('displays server error message when registration fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Kapasitas total acara (440 peserta) telah penuh.' }),
    })

    render(
      <OnSiteRegistrationModal isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
    )

    fireEvent.change(screen.getByPlaceholderText('Contoh: Budi Santoso'), {
      target: { value: 'Budi Santoso' },
    })
    fireEvent.change(screen.getByPlaceholderText('Contoh: 081234567890'), {
      target: { value: '081234567890' },
    })

    const branchSelect = screen.getByLabelText('Gereja Cabang Peserta #1')
    fireEvent.change(branchSelect, { target: { value: 'JKI Shema Sunter, Jakarta' } })

    // Explicitly check WhatsApp opt-in so client-side validation passes
    fireEvent.click(screen.getByLabelText('Persetujuan WhatsApp Peserta #1'))

    const submitBtn = screen.getByRole('button', { name: /Daftarkan On-Site/i })
    fireEvent.click(submitBtn)

    expect(await screen.findByText('Kapasitas total acara (440 peserta) telah penuh.')).toBeInTheDocument()
    expect(mockOnSuccess).not.toHaveBeenCalled()
  })

  it('closes on Escape key press', () => {
    render(
      <OnSiteRegistrationModal isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
    )

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(mockOnClose).toHaveBeenCalled()
  })
})
