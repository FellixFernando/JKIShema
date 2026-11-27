import React from 'react'
import { render, screen } from '@testing-library/react'
import PrivacyPage from '@/app/privacy/page'

describe('Privacy page', () => {
  it('publishes the church contact details already used on the site', () => {
    render(<PrivacyPage />)

    expect(screen.getByRole('heading', { name: /Kebijakan Privasi/i })).toBeInTheDocument()
    // The contact appears twice since the deletion section repeats it.
    expect(screen.getAllByText('jkishema21@gmail.com').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/\+62 81511140377/).length).toBeGreaterThanOrEqual(1)
  })
})
