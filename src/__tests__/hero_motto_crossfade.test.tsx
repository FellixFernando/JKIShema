import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import HeroMottoCrossfade from '@/components/sections/hero/HeroMottoCrossfade'

// Mock next/link
jest.mock('next/link', () => {
    return ({ children, href }: { children: React.ReactNode; href: string }) => (
        <a href={href}>{children}</a>
    )
})

describe('HeroMottoCrossfade Component', () => {
    beforeEach(() => {
        jest.useFakeTimers()
        window.scrollY = 0
        window.scrollTo = jest.fn()
    })

    afterEach(() => {
        jest.runOnlyPendingTimers()
        jest.useRealTimers()
        jest.clearAllMocks()
    })

    it('renders MottoSection by default with downward arrow', () => {
        render(<HeroMottoCrossfade isRegistrationOpen={true} />)

        // Motto section should be visible
        expect(screen.getByText(/Sebagai Murid Kristus/i)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /Lanjut ke bagian berikutnya/i })).toBeInTheDocument()
    })

    it('triggers forward crossfade on downward scroll from MottoSection and prevents default', () => {
        render(<HeroMottoCrossfade isRegistrationOpen={true} />)

        const wheelEvent = new WheelEvent('wheel', { deltaY: 50, cancelable: true })
        const preventDefaultSpy = jest.spyOn(wheelEvent, 'preventDefault')

        act(() => {
            window.dispatchEvent(wheelEvent)
        })

        expect(preventDefaultSpy).toHaveBeenCalled()

        // Fast-forward transition duration (1000ms)
        act(() => {
            jest.advanceTimersByTime(1000)
        })

        // HeroSection should now be fully active
        expect(screen.getByRole('img', { name: /Welcome to JKI Shema$/i })).toBeInTheDocument()
    })

    it('triggers forward crossfade when clicking the downward arrow button', () => {
        render(<HeroMottoCrossfade isRegistrationOpen={true} />)

        const arrowButton = screen.getByRole('button', { name: /Lanjut ke bagian berikutnya/i })

        act(() => {
            fireEvent.click(arrowButton)
        })

        act(() => {
            jest.advanceTimersByTime(1000)
        })

        expect(screen.getByRole('img', { name: /Welcome to JKI Shema$/i })).toBeInTheDocument()
    })

    it('does NOT call preventDefault on downward scroll from HeroSection, enabling smooth scroll to AboutSection', () => {
        render(<HeroMottoCrossfade isRegistrationOpen={true} />)

        // 1. Transition to HeroSection
        act(() => {
            window.dispatchEvent(new WheelEvent('wheel', { deltaY: 50, cancelable: true }))
        })
        act(() => {
            jest.advanceTimersByTime(1000)
            // advance past momentum cooldown (350ms)
            jest.advanceTimersByTime(400)
        })

        // 2. User scrolls down from HeroSection
        const downWheelEvent = new WheelEvent('wheel', { deltaY: 50, cancelable: true })
        const preventDefaultSpy = jest.spyOn(downWheelEvent, 'preventDefault')

        act(() => {
            window.dispatchEvent(downWheelEvent)
        })

        // Downward scroll from HeroSection must NOT be blocked
        expect(preventDefaultSpy).not.toHaveBeenCalled()
    })

    it('triggers reverse crossfade on deliberate upward scroll when stationary at HeroSection', () => {
        render(<HeroMottoCrossfade isRegistrationOpen={true} />)

        // 1. Transition to HeroSection
        act(() => {
            window.dispatchEvent(new WheelEvent('wheel', { deltaY: 50, cancelable: true }))
        })
        act(() => {
            jest.advanceTimersByTime(1000)
            // advance past momentum cooldown (350ms)
            jest.advanceTimersByTime(400)
        })

        // 2. Deliberate upward scroll while at top (window.scrollY === 0)
        const upWheelEvent = new WheelEvent('wheel', { deltaY: -50, cancelable: true })
        const preventDefaultSpy = jest.spyOn(upWheelEvent, 'preventDefault')

        act(() => {
            window.dispatchEvent(upWheelEvent)
        })

        // Upward scroll at top should be intercepted to trigger reverse crossfade
        expect(preventDefaultSpy).toHaveBeenCalled()

        // Fast-forward reverse transition (1000ms)
        act(() => {
            jest.advanceTimersByTime(1000)
        })

        // Motto arrow should be back and enabled
        const arrowButton = screen.getByRole('button', { name: /Lanjut ke bagian berikutnya/i })
        expect(arrowButton).not.toBeDisabled()
    })

    it('does not trigger reverse crossfade when scrolling up from lower sections (scrollY > 5)', () => {
        render(<HeroMottoCrossfade isRegistrationOpen={true} />)

        // 1. Transition to HeroSection
        act(() => {
            window.dispatchEvent(new WheelEvent('wheel', { deltaY: 50, cancelable: true }))
        })
        act(() => {
            jest.advanceTimersByTime(1400)
        })

        // 2. Simulate scrolling down into AboutSection
        window.scrollY = 200
        act(() => {
            window.dispatchEvent(new Event('scroll'))
        })

        // 3. User scrolls up while inside AboutSection
        const upWheelEvent = new WheelEvent('wheel', { deltaY: -50, cancelable: true })
        const preventDefaultSpy = jest.spyOn(upWheelEvent, 'preventDefault')

        act(() => {
            window.dispatchEvent(upWheelEvent)
        })

        // Must NOT intercept upward scroll while inside lower sections
        expect(preventDefaultSpy).not.toHaveBeenCalled()
    })
})
