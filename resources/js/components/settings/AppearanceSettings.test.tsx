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

        expect(screen.getByText('Backgrounds')).toBeInTheDocument()
        expect(screen.getByText('Typography')).toBeInTheDocument()
        expect(screen.getByText('Corner Rounding')).toBeInTheDocument()
        expect(screen.getByText('Border Width')).toBeInTheDocument()
        expect(screen.getByText('Panel Border')).toBeInTheDocument()

        expect(screen.getByLabelText('Accent — Primary')).toBeInTheDocument()
        expect(screen.getByLabelText('Accent — Secondary')).toBeInTheDocument()
        expect(screen.getByLabelText('Accent — Tertiary')).toBeInTheDocument()
        expect(screen.getByLabelText('Font family')).toBeInTheDocument()
        expect(screen.getByLabelText('Panel border width')).toBeInTheDocument()
        expect(screen.getByLabelText('Panel border width (number)')).toBeInTheDocument()
        expect(screen.getByLabelText('Panel border color')).toBeInTheDocument()
    })

    it('applies the fetched theme to the document root on load', async () => {
        vi.mocked(api.fetchThemePreference).mockResolvedValue({
            preset: 'ocean', overrides: {},
        })

        render(<AppearanceSettings />)
        await screen.findByText('Classic')

        expect(document.documentElement.style.getPropertyValue('--color-accent-primary')).toBe('14 165 233')
    })

    it('clicking a preset applies it immediately and saves it after a debounce', async () => {
        render(<AppearanceSettings />)
        await screen.findByText('Classic')

        vi.useFakeTimers()
        fireEvent.click(screen.getByText('Midnight'))

        expect(document.documentElement.style.getPropertyValue('--color-accent-primary')).toBe('139 92 246')
        expect(api.updateThemePreference).not.toHaveBeenCalled()

        await vi.advanceTimersByTimeAsync(500)

        expect(api.updateThemePreference).toHaveBeenCalledWith({ preset: 'midnight', overrides: {} })
    })

    it('changing a color picker overrides just that variable and debounces the save', async () => {
        render(<AppearanceSettings />)
        await screen.findByText('Classic')

        vi.useFakeTimers()
        fireChange(screen.getByLabelText('Accent — Primary'), '#00ff00')

        expect(document.documentElement.style.getPropertyValue('--color-accent-primary')).toBe('0 255 0')
        // Untouched variables keep the preset's own value.
        expect(document.documentElement.style.getPropertyValue('--radius-md')).toBe('4px')

        await vi.advanceTimersByTimeAsync(500)

        expect(api.updateThemePreference).toHaveBeenCalledTimes(1)
        expect(api.updateThemePreference).toHaveBeenCalledWith({
            preset: 'classic',
            overrides: { '--color-accent-primary': '0 255 0' },
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

    it('applying the pure black preset turns on a hairline panel border', async () => {
        vi.mocked(api.fetchThemePreference).mockResolvedValue({ preset: 'black', overrides: {} })

        render(<AppearanceSettings />)
        await screen.findByText('Classic')

        expect(document.documentElement.style.getPropertyValue('--panel-border-width')).toBe('0.25px')
        expect(document.documentElement.style.getPropertyValue('--panel-border-color')).toBe('30 30 30')
    })

    it('changing the panel border width slider updates its CSS variable in quarter-pixel steps', async () => {
        render(<AppearanceSettings />)
        await screen.findByText('Classic')

        vi.useFakeTimers()
        fireChange(screen.getByLabelText('Panel border width'), '0.75')

        expect(document.documentElement.style.getPropertyValue('--panel-border-width')).toBe('0.75px')

        await vi.advanceTimersByTimeAsync(500)

        expect(api.updateThemePreference).toHaveBeenCalledWith({
            preset: 'classic',
            overrides: { '--panel-border-width': '0.75px' },
        })
    })

    it('changing the paired panel border width number input updates the same CSS variable', async () => {
        render(<AppearanceSettings />)
        await screen.findByText('Classic')

        vi.useFakeTimers()
        fireChange(screen.getByLabelText('Panel border width (number)'), '2')

        expect(document.documentElement.style.getPropertyValue('--panel-border-width')).toBe('2px')

        await vi.advanceTimersByTimeAsync(500)

        expect(api.updateThemePreference).toHaveBeenCalledWith({
            preset: 'classic',
            overrides: { '--panel-border-width': '2px' },
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
