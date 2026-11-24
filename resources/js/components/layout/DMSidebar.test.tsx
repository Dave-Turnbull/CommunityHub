import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { forwardRef } from 'react'
import type { ReactNode } from 'react'
import { DMSidebar } from '@/components/layout/DMSidebar'
import type { Conversation, User } from '@/types'

vi.mock('@inertiajs/react', () => ({
    Link: forwardRef<HTMLAnchorElement, { href: string; className?: string; children: ReactNode }>(
        ({ href, className, children }, ref) => <a href={href} className={className} ref={ref}>{children}</a>
    ),
    router: { post: vi.fn() },
}))

vi.mock('@/components/layout/UserPanel', () => ({ UserPanel: () => null }))
vi.mock('@/components/messages/NewConversationModal', () => ({ NewConversationModal: () => null }))

const me: User = { id: 'user-1', username: 'alice', display_name: 'Alice', avatar_url: null, status: 'online' }

const group = (id: string, name: string, unread_count: number): Conversation => ({
    id, type: 'group', name, icon_url: null, unread_count, voice_mode: 'auto',
})

const renderSidebar = (conversations: Conversation[], activeConversationId?: string) =>
    render(<DMSidebar conversations={conversations} currentUser={me} recentCustomStatuses={[]} activeConversationId={activeConversationId} />)

describe('DMSidebar unread badges', () => {
    it('shows the unread count for a conversation', () => {
        renderSidebar([group('c1', 'Project', 4)])

        expect(screen.getByLabelText('4 unread')).toHaveTextContent('4')
    })

    it('caps the displayed count at 99+', () => {
        renderSidebar([group('c1', 'Busy', 250), group('c2', 'Almost', 99)])

        expect(screen.getByLabelText('250 unread')).toHaveTextContent('99+')
        expect(screen.getByLabelText('99 unread')).not.toHaveTextContent('99+')
    })

    it('shows no badge for a read conversation or the active one', () => {
        renderSidebar([group('c1', 'Read', 0), group('c2', 'Open', 7)], 'c2')

        expect(screen.queryByLabelText(/unread/)).not.toBeInTheDocument()
    })
})
