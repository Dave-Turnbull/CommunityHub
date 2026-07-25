import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { AppearanceSettings } from '@/components/settings/AppearanceSettings'
import { useTheme } from '@/stores'
import * as api from '@/services/api'

vi.mock('@/services/api', () => ({
    fetchThemePreference: vi.fn(),
    updateThemePreference: vi.fn(),
}))

describe('AppearanceSettings', () => {
    beforeEach(() => {
        useTheme.setState({ preset: 'classic', overrides: {} })
        document.documentElement.removeAttribute('style')
        vi.mocked(api.fetchThemePreference).mockResolvedValue({ preset: 'classic', overrides: {} })
        vi.mocked(api.updateThemePreference).mockResolvedValue({ preset: 'classic', overrides: {} })
    })

    afterEach(() => {
        vi.clearAllMocks()
        vi.useRealTimers()
    })

    it('renders every preset and every variable group once loaded', async () => {
        render(<AppearanceSettings />)

        expect(await screen.findByText('Classic')).toBeInTheDocument()
        expect(screen.getByText('Midnight')).toBeInTheDocument()
        expect(screen.getByText('Ocean')).toBeInTheDocument()
        expect(screen.getByText('Light')).toBeInTheDocument()

        expect(screen.getByText('Surfaces')).toBeInTheDocument()
        expect(screen.getByText('Typography')).toBeInTheDocument()
        expect(screen.getByText('Corner Rounding')).toBeInTheDocument()
        expect(screen.getByText('Border Width')).toBeInTheDocument()

        expect(screen.getByLabelText('Accent')).toBeInTheDocument()
        expect(screen.getByLabelText('Font family')).toBeInTheDocument()
    })

    it('applies the fetched theme to the document root on load', async () => {
        vi.mocked(api.fetchThemePreference).mockResolvedValue({
            preset: 'ocean', overrides: {},
        })

        render(<AppearanceSettings />)
        await screen.findByText('Classic')

        expect(document.documentElement.style.getPropertyValue('--color-brand')).toBe('14 165 233')
    })

    it('clicking a preset applies it immediately and saves it after a debounce', async () => {
        render(<AppearanceSettings />)
        await screen.findByText('Classic')

        vi.useFakeTimers()
        fireEvent.click(screen.getByText('Midnight'))

        expect(document.documentElement.style.getPropertyValue('--color-brand')).toBe('139 92 246')
        expect(api.updateThemePreference).not.toHaveBeenCalled()

        await vi.advanceTimersByTimeAsync(500)

        expect(api.updateThemePreference).toHaveBeenCalledWith({ preset: 'midnight', overrides: {} })
    })

    it('changing a color picker overrides just that variable and debounces the save', async () => {
        render(<AppearanceSettings />)
        await screen.findByText('Classic')

        vi.useFakeTimers()
        fireChange(screen.getByLabelText('Accent'), '#00ff00')

        expect(document.documentElement.style.getPropertyValue('--color-brand')).toBe('0 255 0')
        // Untouched variables keep the preset's own value.
        expect(document.documentElement.style.getPropertyValue('--radius-md')).toBe('4px')

        await vi.advanceTimersByTimeAsync(500)

        expect(api.updateThemePreference).toHaveBeenCalledTimes(1)
        expect(api.updateThemePreference).toHaveBeenCalledWith({
            preset: 'classic',
            overrides: { '--color-brand': '0 255 0' },
        })
    })

    it('changing a slider control updates its CSS variable with the right unit', async () => {
        render(<AppearanceSettings />)
        await screen.findByText('Classic')

        vi.useFakeTimers()
        fireChange(screen.getByLabelText('Radius — LG'), '20')

        expect(document.documentElement.style.getPropertyValue('--radius-lg')).toBe('20px')

        await vi.advanceTimersByTimeAsync(500)

        expect(api.updateThemePreference).toHaveBeenCalledWith({
            preset: 'classic',
            overrides: { '--radius-lg': '20px' },
        })
    })

    it('debounces rapid successive edits into a single save', async () => {
        render(<AppearanceSettings />)
        await screen.findByText('Classic')

        vi.useFakeTimers()
        const slider = screen.getByLabelText('Radius — LG')
        fireChange(slider, '10')
        await vi.advanceTimersByTimeAsync(100)
        fireChange(slider, '20')
        await vi.advanceTimersByTimeAsync(100)
        fireChange(slider, '30')

        await vi.advanceTimersByTimeAsync(500)

        expect(api.updateThemePreference).toHaveBeenCalledTimes(1)
        expect(api.updateThemePreference).toHaveBeenCalledWith({
            preset: 'classic',
            overrides: { '--radius-lg': '30px' },
        })
    })
})

function fireChange(element: HTMLElement, value: string) {
    fireEvent.change(element, { target: { value } })
}
