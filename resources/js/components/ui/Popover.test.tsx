import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Popover } from '@/components/ui/Popover'

describe('Popover', () => {
    it('does not render its content until the trigger is clicked', () => {
        render(
            <Popover trigger={<button>Open</button>}>
                <p>Popover content</p>
            </Popover>
        )

        expect(screen.queryByText('Popover content')).not.toBeInTheDocument()
    })

    it('reveals its content when the trigger is clicked', async () => {
        render(
            <Popover trigger={<button>Open</button>}>
                <p>Popover content</p>
            </Popover>
        )

        await userEvent.click(screen.getByText('Open'))

        expect(await screen.findByText('Popover content')).toBeInTheDocument()
    })

    it('merges the caller-supplied className with the base classes', async () => {
        render(
            <Popover trigger={<button>Open</button>} className="custom-class">
                <p>Popover content</p>
            </Popover>
        )

        await userEvent.click(screen.getByText('Open'))
        const content = await screen.findByText('Popover content')

        expect(content.parentElement).toHaveClass('custom-class', 'animate-fade-in', 'z-50')
    })
})
