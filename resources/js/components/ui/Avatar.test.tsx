import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Avatar } from '@/components/ui/Avatar'
import { usePresence } from '@/stores'
import type { User } from '@/types'

const user: User = {
    id: 'user-1',
    username: 'jdoe',
    display_name: 'Jane Doe',
    avatar_url: null,
    status: 'offline',
}

describe('Avatar', () => {
    beforeEach(() => {
        usePresence.setState({ statuses: {} })
    })

    it('renders initials when there is no avatar_url', () => {
        render(<Avatar user={user} />)

        expect(screen.getByText('JD')).toBeInTheDocument()
    })

    it('renders an image when avatar_url is set', () => {
        render(<Avatar user={{ ...user, avatar_url: 'https://example.com/a.png' }} />)

        const img = screen.getByRole('img', { name: 'Jane Doe' })
        expect(img).toHaveAttribute('src', 'https://example.com/a.png')
    })

    it('does not render a status dot unless showStatus is passed', () => {
        const { container } = render(<Avatar user={user} />)

        expect(container.querySelector('.bg-status-offline')).toBeNull()
    })

    it('prefers live presence status over the seeded status for the dot color', () => {
        usePresence.getState().setPresence('user-1', { status: 'online', customStatus: null, customStatusColor: null })

        const { container } = render(<Avatar user={user} showStatus />)

        expect(container.querySelector('.bg-status-online')).not.toBeNull()
        expect(container.querySelector('.bg-status-offline')).toBeNull()
    })

    it('falls back to the seeded status when there is no live presence entry', () => {
        const { container } = render(<Avatar user={{ ...user, status: 'dnd' }} showStatus />)

        expect(container.querySelector('.bg-status-dnd')).not.toBeNull()
    })

    it('shows the custom status color on the dot instead of any plain status class, when status is custom', () => {
        usePresence.getState().setPresence('user-1', {
            status: 'custom', customStatus: 'Deep in code', customStatusColor: '#ff00aa',
        })

        const { container } = render(<Avatar user={user} showStatus />)
        const dot = container.querySelector('.absolute')

        expect(dot).toHaveStyle({ backgroundColor: '#ff00aa' })
        expect(dot).not.toHaveClass('bg-status-online', 'bg-status-idle', 'bg-status-dnd', 'bg-status-offline')
    })
})
