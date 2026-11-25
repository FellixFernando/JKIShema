import React from 'react'
import { render, screen } from '@testing-library/react'
import PrivacyPage from '@/app/privacy/page'

describe('Privacy page', () => {
  it('publishes the church contact details already used on the site', () => {
    render(<PrivacyPage />)

    expect(screen.getByRole('heading', { name: /Kebijakan Privasi/i })).toBeInTheDocument()
    expect(screen.getByText('jkishema21@gmail.com')).toBeInTheDocument()
    expect(screen.getByText(/\+62 81511140377/)).toBeInTheDocument()
  })
})
