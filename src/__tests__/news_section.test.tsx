import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import NewsSection from '@/components/sections/news/NewsSection'
import { mockNewsData } from '@/components/sections/news/news.mock'

// Mock embla-carousel-react
jest.mock('embla-carousel-react', () => {
    return () => [
        (node: HTMLElement | null) => node,
        {
            scrollPrev: jest.fn(),
            scrollNext: jest.fn(),
            canScrollPrev: jest.fn(() => false),
            canScrollNext: jest.fn(() => true),
            on: jest.fn(),
            off: jest.fn(),
        },
    ]
})

// Mock IntersectionObserver
beforeAll(() => {
    class MockIntersectionObserver {
        observe = jest.fn((element: HTMLElement) => {
            // Immediately simulate intersection
        })
        unobserve = jest.fn()
        disconnect = jest.fn()
    }
    Object.defineProperty(window, 'IntersectionObserver', {
        writable: true,
        configurable: true,
        value: MockIntersectionObserver,
    })
})

describe('NewsSection Component', () => {
    beforeEach(() => {
        document.body.style.overflow = ''
    })

    afterEach(() => {
        document.body.style.overflow = ''
        jest.clearAllMocks()
    })

    it('renders heading, subtitle, and all mock news cards', () => {
        render(<NewsSection news={mockNewsData} />)

        expect(screen.getByText('INFORMASI TERBARU')).toBeInTheDocument()
        expect(
            screen.getByText('Bersama melayani dan membimbing jemaat dalam kasih dan iman.')
        ).toBeInTheDocument()

        // Check cards
        expect(screen.getByText('SHEMA FAMILY CAMP 2026')).toBeInTheDocument()
        expect(screen.getByText('KKR JKI SHEMA 2026 : KEBANGKITAN ROHANI')).toBeInTheDocument()
        expect(screen.getByText('SHEMA CHRISTMAS CONCERT 2026')).toBeInTheDocument()

        // Check badges
        expect(screen.getAllByText('ACARA').length).toBeGreaterThan(0)
        expect(screen.getAllByText('BERITA').length).toBeGreaterThan(0)
        expect(screen.getAllByText('PELAYANAN').length).toBeGreaterThan(0)
    })

    it('opens NewsDetailModal when a news card is clicked', () => {
        render(<NewsSection news={mockNewsData} />)

        const firstCard = screen.getByText('SHEMA FAMILY CAMP 2026')
        fireEvent.click(firstCard)

        // Modal should open
        const dialog = screen.getByRole('dialog')
        expect(dialog).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /Tutup detail informasi/i })).toBeInTheDocument()
        expect(document.body.style.overflow).toBe('hidden')
    })

    it('closes NewsDetailModal when close button is clicked', () => {
        render(<NewsSection news={mockNewsData} />)

        const firstCard = screen.getByText('SHEMA FAMILY CAMP 2026')
        fireEvent.click(firstCard)

        const closeBtn = screen.getByRole('button', { name: /Tutup detail informasi/i })
        fireEvent.click(closeBtn)

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(document.body.style.overflow).toBe('')
    })

    it('opens ChurchCalendarModal when AGENDA JKI SHEMA button is clicked', () => {
        render(<NewsSection news={mockNewsData} />)

        const agendaBtn = screen.getByRole('button', { name: /AGENDA JKI SHEMA/i })
        fireEvent.click(agendaBtn)

        // Calendar modal should open
        expect(screen.getByRole('dialog', { name: /Kalender Agenda JKI Shema/i })).toBeInTheDocument()
        expect(screen.getByText('Belum ada agenda yang tersedia.')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /Tutup kalender agenda/i })).toBeInTheDocument()
        expect(document.body.style.overflow).toBe('hidden')
    })

    it('allows navigating months in ChurchCalendarModal', () => {
        render(<NewsSection news={mockNewsData} />)

        const agendaBtn = screen.getByRole('button', { name: /AGENDA JKI SHEMA/i })
        fireEvent.click(agendaBtn)

        const nextMonthBtn = screen.getByRole('button', { name: /Bulan berikutnya/i })
        expect(nextMonthBtn).toBeInTheDocument()
        fireEvent.click(nextMonthBtn)

        // Calendar should still be open with empty state message
        expect(screen.getByText('Belum ada agenda yang tersedia.')).toBeInTheDocument()
    })

    it('closes ChurchCalendarModal on Escape key', () => {
        render(<NewsSection news={mockNewsData} />)

        const agendaBtn = screen.getByRole('button', { name: /AGENDA JKI SHEMA/i })
        fireEvent.click(agendaBtn)

        expect(screen.getByRole('dialog', { name: /Kalender Agenda JKI Shema/i })).toBeInTheDocument()

        fireEvent.keyDown(window, { key: 'Escape' })

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(document.body.style.overflow).toBe('')
    })
})
