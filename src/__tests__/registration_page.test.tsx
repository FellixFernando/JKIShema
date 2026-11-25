import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import RegisterPage from '@/app/register/page'

// Mock global fetch
const mockFetch = jest.fn()
global.fetch = mockFetch

describe('RegisterPage End-to-End Registration Flow & Scenarios', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/status') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ remaining: 10, is_open: true }),
        })
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ success: true, data: [] }),
      })
    })
  })

  it('renders registration form, submits participant data with branch selected, and renders visual QR code with download button', async () => {
    const mockReturnedParticipant = {
      id: 'participant-uuid-1',
      full_name: 'Tiffany Titania',
      whatsapp_number: '081234567890',
      church_status: 'BERGEREJA',
      church_branch: 'JKI Shema Sunter, Jakarta',
      is_child: false,
      is_wa_opt_in: true,
      qr_token: '11112222-3333-4444-5555-666677778888',
      status: 'REGISTERED',
      registration_type: 'ONLINE',
    }

    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/status') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ remaining: 10, is_open: true }),
        })
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          success: true,
          data: [mockReturnedParticipant],
        }),
      })
    })

    render(<RegisterPage />)

    // Form inputs
    const nameInput = screen.getByPlaceholderText('Masukkan nama lengkap')
    const waInput = screen.getByPlaceholderText('Contoh: 081234567890')
    const optInCheckbox = screen.getByLabelText(/Menyetujui pengiriman pesan konfirmasi/i)
    const submitBtn = screen.getByRole('button', { name: /Kirim Pendaftaran/i })

    // Fill form
    fireEvent.change(nameInput, { target: { value: 'Tiffany Titania' } })
    fireEvent.change(waInput, { target: { value: '081234567890' } })
    expect(optInCheckbox).toBeChecked()

    // Select church branch
    const branchSelect = screen.getByDisplayValue('Pilih gereja / cabang')
    fireEvent.change(branchSelect, { target: { value: 'JKI Shema Sunter, Jakarta' } })

    // Submit form
    fireEvent.click(submitBtn)

    // Verify loading or API call
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/register',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([
          {
            full_name: 'Tiffany Titania',
            whatsapp_number: '081234567890',
            church_status: 'BERGEREJA',
            church_branch: 'JKI Shema Sunter, Jakarta',
            is_child: false,
            is_wa_opt_in: true,
          },
        ]),
      })
    )

    // Wait for success screen
    await waitFor(() => {
      expect(screen.getByText('Pendaftaran Berhasil!')).toBeInTheDocument()
    })

    // Verify ticket details
    expect(screen.getByText('Tiffany Titania')).toBeInTheDocument()
    expect(screen.getByTestId('ticket-code-text')).toHaveTextContent(
      '11112222-3333-4444-5555-666677778888'
    )

    // Verify visual framed ticket image is generated and points to ticket image endpoint
    await waitFor(
      () => {
        const qrImage = screen.getByTestId('qr-image')
        expect(qrImage).toBeInTheDocument()
        expect(qrImage.getAttribute('src')).toBe(
          '/api/ticket/11112222-3333-4444-5555-666677778888/image'
        )
      },
      { timeout: 4000 }
    )

    // Verify Download QR Code button uses framed ticket endpoint
    const downloadBtn = screen.getByTestId('download-qr-btn')
    expect(downloadBtn).toBeInTheDocument()
    expect(downloadBtn.getAttribute('download')).toBe(
      'tiket-jki-shema-11112222-3333-4444-5555-666677778888.png'
    )
    expect(downloadBtn.getAttribute('href')).toBe(
      '/api/ticket/11112222-3333-4444-5555-666677778888/image'
    )
  })

  it('Scenario A – Telah Berjemaat: displays dropdown and submits selected JKI Shema Sunter branch', async () => {
    render(<RegisterPage />)

    fireEvent.change(screen.getByPlaceholderText('Masukkan nama lengkap'), {
      target: { value: 'John Doe' },
    })
    fireEvent.change(screen.getByPlaceholderText('Contoh: 081234567890'), {
      target: { value: '081111222333' },
    })

    // Status is 'BERGEREJA' by default (Telah Berjemaat)
    const statusSelect = screen.getByDisplayValue('Telah Berjemaat')
    expect(statusSelect).toBeInTheDocument()

    // Branch dropdown appears
    const branchSelect = screen.getByDisplayValue('Pilih gereja / cabang')
    fireEvent.change(branchSelect, { target: { value: 'JKI Shema Sunter, Jakarta' } })

    fireEvent.click(screen.getByRole('button', { name: /Kirim Pendaftaran/i }))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/register',
        expect.objectContaining({
          body: JSON.stringify([
            {
              full_name: 'John Doe',
              whatsapp_number: '081111222333',
              church_status: 'BERGEREJA',
              church_branch: 'JKI Shema Sunter, Jakarta',
              is_child: false,
              is_wa_opt_in: true,
            },
          ]),
        })
      )
    })
  })

  it('Scenario B – Gereja Lain: selects Gereja Lain, verifies no additional text input, and submits Gereja Lain', async () => {
    render(<RegisterPage />)

    fireEvent.change(screen.getByPlaceholderText('Masukkan nama lengkap'), {
      target: { value: 'Jane Doe' },
    })
    fireEvent.change(screen.getByPlaceholderText('Contoh: 081234567890'), {
      target: { value: '082222333444' },
    })

    const branchSelect = screen.getByDisplayValue('Pilih gereja / cabang')
    fireEvent.change(branchSelect, { target: { value: 'Gereja Lain' } })

    // Verify NO additional text input appears
    expect(screen.queryByPlaceholderText(/nama gereja/i)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Kirim Pendaftaran/i }))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/register',
        expect.objectContaining({
          body: JSON.stringify([
            {
              full_name: 'Jane Doe',
              whatsapp_number: '082222333444',
              church_status: 'BERGEREJA',
              church_branch: 'Gereja Lain',
              is_child: false,
              is_wa_opt_in: true,
            },
          ]),
        })
      )
    })
  })

  it('Scenario C – Belum Berjemaat: hides dropdown and submits TIDAK_BERGEREJA with undefined church_branch', async () => {
    render(<RegisterPage />)

    fireEvent.change(screen.getByPlaceholderText('Masukkan nama lengkap'), {
      target: { value: 'Visitor User' },
    })
    fireEvent.change(screen.getByPlaceholderText('Contoh: 081234567890'), {
      target: { value: '083333444555' },
    })

    // Switch to Belum Berjemaat
    const statusSelect = screen.getByDisplayValue('Telah Berjemaat')
    fireEvent.change(statusSelect, { target: { value: 'TIDAK_BERGEREJA' } })

    // Verify dropdown is hidden
    expect(screen.queryByDisplayValue('Pilih gereja / cabang')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Kirim Pendaftaran/i }))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/register',
        expect.objectContaining({
          body: JSON.stringify([
            {
              full_name: 'Visitor User',
              whatsapp_number: '083333444555',
              church_status: 'TIDAK_BERGEREJA',
              is_child: false,
              is_wa_opt_in: true,
            },
          ]),
        })
      )
    })
  })

  it('Scenario D – Switching Status: clears branch selection when switched to Belum Berjemaat', async () => {
    render(<RegisterPage />)

    fireEvent.change(screen.getByPlaceholderText('Masukkan nama lengkap'), {
      target: { value: 'Switch User' },
    })
    fireEvent.change(screen.getByPlaceholderText('Contoh: 081234567890'), {
      target: { value: '084444555666' },
    })

    // 1. Select branch first
    const branchSelect = screen.getByDisplayValue('Pilih gereja / cabang')
    fireEvent.change(branchSelect, { target: { value: 'JKI Shema Pontianak' } })

    // 2. Change status to Belum Berjemaat
    const statusSelect = screen.getByDisplayValue('Telah Berjemaat')
    fireEvent.change(statusSelect, { target: { value: 'TIDAK_BERGEREJA' } })

    // 3. Dropdown disappears
    expect(screen.queryByDisplayValue('JKI Shema Pontianak')).not.toBeInTheDocument()

    // 4. Submit
    fireEvent.click(screen.getByRole('button', { name: /Kirim Pendaftaran/i }))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/register',
        expect.objectContaining({
          body: JSON.stringify([
            {
              full_name: 'Switch User',
              whatsapp_number: '084444555666',
              church_status: 'TIDAK_BERGEREJA',
              is_child: false,
              is_wa_opt_in: true,
            },
          ]),
        })
      )
    })
  })

  it('Scenario E – Additional Participants: handles multiple participants with independent branch selection', async () => {
    render(<RegisterPage />)

    // Registrant 1
    fireEvent.change(screen.getByPlaceholderText('Masukkan nama lengkap'), {
      target: { value: 'Parent User' },
    })
    fireEvent.change(screen.getByPlaceholderText('Contoh: 081234567890'), {
      target: { value: '085555666777' },
    })
    const branchSelects = screen.getAllByRole('combobox')
    // branchSelects[0] is status, branchSelects[1] is branch
    fireEvent.change(branchSelects[1], { target: { value: 'JKI Shema Gn. Sindur' } })

    // Add 2nd participant
    fireEvent.click(screen.getByRole('button', { name: /Tambah Peserta Lain/i }))

    const nameInputs = screen.getAllByPlaceholderText('Masukkan nama lengkap')
    fireEvent.change(nameInputs[1], { target: { value: 'Relative User' } })

    const allSelects = screen.getAllByRole('combobox')
    // allSelects: [0: P1 status, 1: P1 branch, 2: P2 status, 3: P2 branch]
    fireEvent.change(allSelects[2], { target: { value: 'TIDAK_BERGEREJA' } })

    const waInputs = screen.getAllByPlaceholderText('Contoh: 081234567890')
    fireEvent.change(waInputs[1], { target: { value: '086666777888' } })

    fireEvent.click(screen.getByRole('button', { name: /Kirim Pendaftaran/i }))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/register',
        expect.objectContaining({
          body: JSON.stringify([
            {
              full_name: 'Parent User',
              whatsapp_number: '085555666777',
              church_status: 'BERGEREJA',
              church_branch: 'JKI Shema Gn. Sindur',
              is_child: false,
              is_wa_opt_in: true,
            },
            {
              full_name: 'Relative User',
              whatsapp_number: '086666777888',
              church_status: 'TIDAK_BERGEREJA',
              is_child: false,
              is_wa_opt_in: true,
            },
          ]),
        })
      )
    })
  })
})
