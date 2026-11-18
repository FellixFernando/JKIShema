import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import ChristmasPopup from '@/components/ui/ChristmasPopup'

// Mock next/link
jest.mock('next/link', () => {
    return ({ children, href, onClick }: { children: React.ReactNode; href: string; onClick?: () => void }) => (
        <a href={href} onClick={onClick}>
            {children}
        </a>
    )
})

describe('ChristmasPopup Component', () => {
    beforeEach(() => {
        jest.useFakeTimers()
        document.body.style.overflow = ''
    })

    afterEach(() => {
        act(() => {
            jest.runOnlyPendingTimers()
        })
        jest.useRealTimers()
        document.body.style.overflow = ''
        jest.clearAllMocks()
    })

    it('does not display immediately on mount (waits for 500-800ms timer)', () => {
        render(<ChristmasPopup isRegistrationOpen={true} />)

        // Before timer fires, popup is not in DOM
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('displays after 600ms with Christmas poster and registration button when registration is open', () => {
        render(<ChristmasPopup isRegistrationOpen={true} />)

        act(() => {
            jest.advanceTimersByTime(600)
        })

        // Dialog should now be open
        expect(screen.getByRole('dialog')).toBeInTheDocument()
        expect(screen.getByAltText(/Christmas Celebration JKI Shema/i)).toBeInTheDocument()
        expect(screen.getByText(/Daftar Sekarang!/i)).toBeInTheDocument()
        expect(screen.getByRole('link', { name: /info sponsorship/i })).toHaveAttribute('href', '/sponsorship')
        expect(document.body.style.overflow).toBe('hidden')
    })

    it('displays closed registration notice when registration is closed', () => {
        render(<ChristmasPopup isRegistrationOpen={false} />)

        act(() => {
            jest.advanceTimersByTime(600)
        })

        expect(screen.getByRole('dialog')).toBeInTheDocument()
        expect(screen.getByText(/Pendaftaran Saat Ini Telah Ditutup/i)).toBeInTheDocument()
    })

    it('closes the popup and restores body overflow when close button is clicked', () => {
        render(<ChristmasPopup isRegistrationOpen={true} />)

        act(() => {
            jest.advanceTimersByTime(600)
        })

        const closeBtn = screen.getByRole('button', { name: /Tutup popup pendaftaran/i })
        expect(closeBtn).toBeInTheDocument()

        act(() => {
            fireEvent.click(closeBtn)
            jest.advanceTimersByTime(350)
        })

        expect(document.body.style.overflow).toBe('')
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('closes the popup when pressing the Escape key', () => {
        render(<ChristmasPopup isRegistrationOpen={true} />)

        act(() => {
            jest.advanceTimersByTime(600)
        })

        expect(screen.getByRole('dialog')).toBeInTheDocument()

        act(() => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
            jest.advanceTimersByTime(350)
        })

        expect(document.body.style.overflow).toBe('')
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('closes the popup when clicking the dark overlay backdrop', () => {
        const { container } = render(<ChristmasPopup isRegistrationOpen={true} />)

        act(() => {
            jest.advanceTimersByTime(600)
        })

        const backdrop = container.querySelector('.bg-black\\/60')
        expect(backdrop).toBeInTheDocument()

        act(() => {
            fireEvent.click(backdrop!)
            jest.advanceTimersByTime(350)
        })

        expect(document.body.style.overflow).toBe('')
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('does NOT close the popup when clicking inside the dialog card', () => {
        render(<ChristmasPopup isRegistrationOpen={true} />)

        act(() => {
            jest.advanceTimersByTime(600)
        })

        const dialog = screen.getByRole('dialog')

        act(() => {
            fireEvent.click(dialog)
            jest.advanceTimersByTime(350)
        })

        // Should still be in document
        expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
})
