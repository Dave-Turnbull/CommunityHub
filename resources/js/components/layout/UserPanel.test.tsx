import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { forwardRef } from 'react'
import type { ReactNode } from 'react'
import { UserPanel } from '@/components/layout/UserPanel'
import { usePresence } from '@/stores'
import type { User } from '@/types'

vi.mock('@inertiajs/react', () => ({
    Link: forwardRef<HTMLAnchorElement, { href: string; className?: string; children: ReactNode }>(
        ({ href, className, children }, ref) => <a href={href} className={className} ref={ref}>{children}</a>
    ),
    router: { post: vi.fn() },
}))

vi.mock('@/services/api', () => ({
    updateUserStatus: vi.fn(() => Promise.resolve({
        status: 'dnd', custom_status: null, custom_status_color: null, recent: [],
    })),
}))

const user: User = {
    id: 'user-1', username: 'alice', display_name: 'Alice', avatar_url: null, status: 'online',
}

describe('UserPanel', () => {
    beforeEach(() => {
        usePresence.setState({ statuses: {} })
    })

    it('renders the avatar and display name as a single clickable trigger', () => {
        render(<UserPanel user={user} recentCustomStatuses={[]} />)

        expect(screen.getByRole('button', { name: /Alice/ })).toBeInTheDocument()
    })

    it('shows the username handle when there is no custom status', () => {
        render(<UserPanel user={user} recentCustomStatuses={[]} />)

        expect(screen.getByText('@alice')).toBeInTheDocument()
    })

    it('opens the status popover when clicked, revealing status options and settings/logout', async () => {
        render(<UserPanel user={user} recentCustomStatuses={[]} />)

        await userEvent.click(screen.getByRole('button', { name: /Alice/ }))

        expect(await screen.findByText('Online')).toBeInTheDocument()
        expect(screen.getByText('⚙ Settings')).toBeInTheDocument()
        expect(screen.getByText('⏻ Log out')).toBeInTheDocument()
    })

    it('shows the live custom status from presence over the stale seeded prop, when status is custom', () => {
        usePresence.getState().setPresence('user-1', {
            status: 'custom', customStatus: 'Live status', customStatusColor: '#ff00aa',
        })

        render(<UserPanel user={{ ...user, status: 'custom', custom_status: 'Stale' }} recentCustomStatuses={[]} />)

        expect(screen.getByText('Live status')).toBeInTheDocument()
        expect(screen.queryByText('Stale')).not.toBeInTheDocument()
    })

    it('does not show a custom status message when the live status is a plain one, even if custom_status is stale-populated', () => {
        usePresence.getState().setPresence('user-1', { status: 'online', customStatus: null, customStatusColor: null })

        render(<UserPanel user={{ ...user, custom_status: 'Leftover' }} recentCustomStatuses={[]} />)

        expect(screen.queryByText('Leftover')).not.toBeInTheDocument()
        expect(screen.getByText('@alice')).toBeInTheDocument()
    })
})
