import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import RegisterPage from '@/app/register/page'

const mockFetch = jest.fn()
global.fetch = mockFetch

beforeEach(() => {
  jest.clearAllMocks()
  mockFetch.mockImplementation((url: string) => {
    if (url === '/api/status') {
      return Promise.resolve({
        ok: true,
        json: async () => ({ remaining: 0, is_open: true }),
      })
    }
    return Promise.resolve({
      ok: true,
      json: async () => ({ success: true, status: 'WAITLISTED', data: [] }),
    })
  })
})

describe('RegisterPage waitlist states', () => {
  it('shows the waitlist banner when no seats remain', async () => {
    render(<RegisterPage />)

    await waitFor(() => {
      expect(screen.getByText(/daftar tunggu/i)).toBeInTheDocument()
    })
  })

  it('shows the waitlist thank-you screen and no ticket', async () => {
    render(<RegisterPage />)

    fireEvent.change(screen.getByPlaceholderText('Masukkan nama lengkap'), {
      target: { value: 'Waitlist User' },
    })
    fireEvent.change(screen.getByPlaceholderText('Contoh: 081234567890'), {
      target: { value: '081234567890' },
    })
    fireEvent.change(screen.getByDisplayValue('Pilih gereja / cabang'), {
      target: { value: 'JKI Shema Sunter, Jakarta' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Kirim Pendaftaran/i }))

    await waitFor(() => {
      expect(screen.getByText(/Terima kasih telah mendaftar/i)).toBeInTheDocument()
    })

    expect(screen.queryByText('Pendaftaran Berhasil!')).not.toBeInTheDocument()
    expect(screen.queryByTestId('download-qr-btn')).not.toBeInTheDocument()
  })
})
