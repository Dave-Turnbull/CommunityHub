import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Toggle } from '@/components/ui/Toggle'

describe('Toggle', () => {
    it('reflects the checked state via aria-checked', () => {
        render(<Toggle checked onChange={vi.fn()} label="Test toggle" />)

        expect(screen.getByRole('switch', { name: 'Test toggle' })).toHaveAttribute('aria-checked', 'true')
    })

    it('calls onChange with the flipped value when clicked', async () => {
        const onChange = vi.fn()
        const user = userEvent.setup()
        render(<Toggle checked={false} onChange={onChange} label="Test toggle" />)

        await user.click(screen.getByRole('switch', { name: 'Test toggle' }))

        expect(onChange).toHaveBeenCalledWith(true)
    })

    it('does not respond to clicks when disabled', async () => {
        const onChange = vi.fn()
        const user = userEvent.setup()
        render(<Toggle checked={false} onChange={onChange} label="Test toggle" disabled />)

        await user.click(screen.getByRole('switch', { name: 'Test toggle' }))

        expect(onChange).not.toHaveBeenCalled()
    })
})
