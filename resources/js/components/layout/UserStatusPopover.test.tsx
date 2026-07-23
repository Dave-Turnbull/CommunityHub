import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { forwardRef } from 'react'
import type { ReactNode } from 'react'
import { UserStatusPopover } from '@/components/layout/UserStatusPopover'
import { usePresence } from '@/stores'
import type { User } from '@/types'

const routerPost = vi.fn()

vi.mock('@inertiajs/react', () => ({
    Link: forwardRef<HTMLAnchorElement, { href: string; className?: string; children: ReactNode }>(
        ({ href, className, children }, ref) => <a href={href} className={className} ref={ref}>{children}</a>
    ),
    router: { post: (...args: unknown[]) => routerPost(...args) },
}))

vi.mock('@/services/api', () => ({
    updateUserStatus: vi.fn((status: string) =>
        Promise.resolve(
            status === 'custom'
                ? { status: 'custom', custom_status: 'Saved', custom_status_color: '#123456', recent: [{ text: 'Saved', color: '#123456' }] }
                : { status, custom_status: null, custom_status_color: null, recent: [] }
        )
    ),
}))

import * as api from '@/services/api'

const user: User = {
    id: 'user-1', username: 'alice', display_name: 'Alice', avatar_url: null, status: 'online',
}

describe('UserStatusPopover', () => {
    beforeEach(() => {
        usePresence.setState({ statuses: {} })
    })

    afterEach(() => {
        vi.clearAllMocks()
    })

    it('opens to show the status options, custom status controls, settings, and logout', async () => {
        render(<UserStatusPopover user={user} recentCustomStatuses={[]} trigger={<button>Open</button>} />)

        await userEvent.click(screen.getByText('Open'))

        expect(await screen.findByText('Online')).toBeInTheDocument()
        expect(screen.getByText('Idle')).toBeInTheDocument()
        expect(screen.getByText('Do Not Disturb')).toBeInTheDocument()
        expect(screen.getByText('Invisible')).toBeInTheDocument()
        expect(screen.getByPlaceholderText('Set custom status')).toBeInTheDocument()
        expect(screen.getByText('⚙ Settings')).toHaveAttribute('href', '/settings')
        expect(screen.getByText('⏻ Log out')).toBeInTheDocument()
    })

    it('calls updateUserStatus with just the plain status when a status option is clicked', async () => {
        render(<UserStatusPopover user={user} recentCustomStatuses={[]} trigger={<button>Open</button>} />)

        await userEvent.click(screen.getByText('Open'))
        await userEvent.click(await screen.findByText('Do Not Disturb'))

        expect(api.updateUserStatus).toHaveBeenCalledWith('dnd', undefined, undefined)
    })

    it('updates the presence store to the plain status and clears custom status immediately after selecting one', async () => {
        render(<UserStatusPopover user={user} recentCustomStatuses={[]} trigger={<button>Open</button>} />)

        await userEvent.click(screen.getByText('Open'))
        await userEvent.click(await screen.findByText('Do Not Disturb'))

        expect(usePresence.getState().statuses['user-1']).toEqual({
            status: 'dnd', customStatus: null, customStatusColor: null,
        })
    })

    it('saves a custom status with the chosen color and clears the input', async () => {
        render(<UserStatusPopover user={user} recentCustomStatuses={[]} trigger={<button>Open</button>} />)

        await userEvent.click(screen.getByText('Open'))
        const input = await screen.findByPlaceholderText('Set custom status')
        await userEvent.type(input, 'Deep in code')
        await userEvent.click(screen.getByTitle('Save custom status'))

        expect(api.updateUserStatus).toHaveBeenCalledWith('custom', 'Deep in code', '#5865F2')
        expect(input).toHaveValue('')
    })

    it('updates the presence store to status "custom" with the message and color after saving', async () => {
        render(<UserStatusPopover user={user} recentCustomStatuses={[]} trigger={<button>Open</button>} />)

        await userEvent.click(screen.getByText('Open'))
        const input = await screen.findByPlaceholderText('Set custom status')
        await userEvent.type(input, 'Deep in code')
        await userEvent.click(screen.getByTitle('Save custom status'))

        expect(usePresence.getState().statuses['user-1']).toEqual({
            status: 'custom', customStatus: 'Saved', customStatusColor: '#123456',
        })
    })

    it('disables the save button when the text is empty', async () => {
        render(<UserStatusPopover user={user} recentCustomStatuses={[]} trigger={<button>Open</button>} />)

        await userEvent.click(screen.getByText('Open'))

        expect(await screen.findByTitle('Save custom status')).toBeDisabled()
    })

    it('shows each recent status chip with its saved color', async () => {
        render(
            <UserStatusPopover
                user={user}
                recentCustomStatuses={[{ text: 'Lunch', color: '#ff00aa' }]}
                trigger={<button>Open</button>}
            />
        )

        await userEvent.click(screen.getByText('Open'))
        const chip = await screen.findByText('Lunch')

        expect(chip.parentElement?.querySelector('span')).toHaveStyle({ backgroundColor: '#ff00aa' })
    })

    it('reapplies a recent custom status when its chip is clicked, the same as saving a new one', async () => {
        render(
            <UserStatusPopover
                user={user}
                recentCustomStatuses={[{ text: 'Lunch', color: '#ff00aa' }]}
                trigger={<button>Open</button>}
            />
        )

        await userEvent.click(screen.getByText('Open'))
        await userEvent.click(await screen.findByText('Lunch'))

        expect(api.updateUserStatus).toHaveBeenCalledWith('custom', 'Lunch', '#ff00aa')
    })

    it('logs out via router.post when the logout button is clicked', async () => {
        render(<UserStatusPopover user={user} recentCustomStatuses={[]} trigger={<button>Open</button>} />)

        await userEvent.click(screen.getByText('Open'))
        await userEvent.click(await screen.findByText('⏻ Log out'))

        expect(routerPost).toHaveBeenCalledWith('/logout')
    })
})
