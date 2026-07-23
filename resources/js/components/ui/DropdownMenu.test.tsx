import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DropdownMenu } from '@/components/ui/DropdownMenu'

describe('DropdownMenu', () => {
    it('reveals its items only after the trigger is clicked', async () => {
        render(
            <DropdownMenu trigger={<button>Open</button>}>
                <DropdownMenu.Item onSelect={vi.fn()}>Item One</DropdownMenu.Item>
            </DropdownMenu>
        )

        expect(screen.queryByText('Item One')).not.toBeInTheDocument()

        await userEvent.click(screen.getByText('Open'))
        const menu = await screen.findByRole('menu')

        expect(within(menu).getByText('Item One')).toBeInTheDocument()
    })

    it('calls onSelect when an item is clicked', async () => {
        const onSelect = vi.fn()
        render(
            <DropdownMenu trigger={<button>Open</button>}>
                <DropdownMenu.Item onSelect={onSelect}>Item One</DropdownMenu.Item>
            </DropdownMenu>
        )

        await userEvent.click(screen.getByText('Open'))
        await userEvent.click(await screen.findByText('Item One'))

        expect(onSelect).toHaveBeenCalled()
    })

    it('applies danger styling only when the danger prop is passed', async () => {
        render(
            <DropdownMenu trigger={<button>Open</button>}>
                <DropdownMenu.Item onSelect={vi.fn()}>Plain</DropdownMenu.Item>
                <DropdownMenu.Item onSelect={vi.fn()} danger>Danger</DropdownMenu.Item>
            </DropdownMenu>
        )

        await userEvent.click(screen.getByText('Open'))

        expect(await screen.findByText('Plain')).toHaveClass('text-text-secondary')
        expect(screen.getByText('Danger')).toHaveClass('text-danger')
    })
})
