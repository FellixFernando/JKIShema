import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import GallerySection from '@/components/sections/gallery/GallerySection'
import SponsorshipPage from '@/app/sponsorship/page'

// Mock next/link
jest.mock('next/link', () => {
    return ({ children, href, className, onClick }: { children: React.ReactNode; href: string; className?: string; onClick?: () => void }) => (
        <a href={href} className={className} onClick={onClick}>
            {children}
        </a>
    )
})

// Mock next/image
jest.mock('next/image', () => {
    return ({ src, alt, fill, priority, className, width, height }: any) => {
        return (
            <img
                src={src}
                alt={alt}
                data-fill={fill ? 'true' : undefined}
                data-priority={priority ? 'true' : undefined}
                className={className}
                width={width}
                height={height}
            />
        )
    }
})

describe('Gallery Section Image Integration', () => {
    it('renders all 5 gallery images with correct paths and alt texts', () => {
        render(<GallerySection />)

        const expectedImages = [
            '/images/gallery/gallery-1.jpeg',
            '/images/gallery/gallery-2.jpeg',
            '/images/gallery/gallery-3.jpeg',
            '/images/gallery/gallery-4.jpeg',
            '/images/gallery/gallery-5.jpeg',
        ]

        expectedImages.forEach((src, idx) => {
            const img = screen.getByAltText(new RegExp(`Dokumentasi.*${idx + 1}`, 'i'))
            expect(img).toBeInTheDocument()
            expect(img).toHaveAttribute('src', src)
            expect(img).toHaveAttribute('data-fill', 'true')
        })
    })

    it('sets priority on the primary featured gallery image', () => {
        render(<GallerySection />)

        const firstImg = screen.getByAltText(/Dokumentasi.*1/i)
        expect(firstImg).toHaveAttribute('data-priority', 'true')
    })

    it('renders the "LIHAT SEMUA" link to /gallery', () => {
        render(<GallerySection />)

        const link = screen.getByRole('link', { name: /LIHAT SEMUA/i })
        expect(link).toBeInTheDocument()
        expect(link).toHaveAttribute('href', '/gallery')
    })
})

describe('Sponsorship Page QRIS Integration', () => {
    it('renders sponsorship tab by default and switches to giving tab with QRIS image', () => {
        render(<SponsorshipPage />)

        // Default tab is sponsorship
        expect(screen.getAllByText('Info Sponsorship').length).toBeGreaterThan(0)
        expect(screen.getByAltText(/Info Sponsorship Christmas Celebration/i)).toBeInTheDocument()

        // Switch to giving tab
        const givingTabBtn = screen.getByRole('button', { name: /Dukung Pelayanan/i })
        fireEvent.click(givingTabBtn)

        // QRIS image must be rendered
        const qrisImg = screen.getByAltText(/QRIS JKI Shema/i)
        expect(qrisImg).toBeInTheDocument()
        expect(qrisImg).toHaveAttribute('src', '/images/ticket/qris-jkishema.png')
        expect(qrisImg).toHaveAttribute('data-priority', 'true')

        // QRIS download link must exist
        const downloadLink = screen.getByRole('link', { name: /Unduh Gambar QRIS/i })
        expect(downloadLink).toBeInTheDocument()
        expect(downloadLink).toHaveAttribute('href', '/images/ticket/qris-jkishema.png')
        expect(downloadLink).toHaveAttribute('download', 'QRIS-JKI-Shema.png')

        // Supported banks/e-wallets text must be visible
        expect(screen.getByText(/Dapat di-scan dengan seluruh aplikasi mobile banking/i)).toBeInTheDocument()
        expect(screen.getByText(/BCA • Mandiri • BRI • BNI/i)).toBeInTheDocument()
    })
})
