import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { forwardRef } from 'react'
import type { ReactNode } from 'react'
import { ChannelSidebar } from '@/components/layout/ChannelSidebar'
import { useChannels, useVoiceRoster } from '@/stores'
import type { Channel, MainView, Room, User } from '@/types'

vi.mock('@/services/echo', () => ({
    subscribeRoomChannels: vi.fn(() => vi.fn()),
}))

vi.mock('@inertiajs/react', () => ({
    Link: forwardRef<HTMLAnchorElement, { href: string; className?: string; title?: string; children: ReactNode }>(
        ({ href, className, title, children }, ref) => (
            <a href={href} className={className} title={title} ref={ref}>{children}</a>
        )
    ),
}))

vi.mock('@/services/voicePresence', () => ({
    rosterKey: (scopeType: string, scopeId: string) => `${scopeType}.${scopeId}`,
    subscribeVoiceRoster: vi.fn(() => ({ channel: {}, leave: vi.fn() })),
}))

const room: Room = {
    id: 'room-1', name: 'Cool Room', icon_url: null, owner_id: 'user-1', invite_code: 'abc123',
}

const user: User = {
    id: 'user-1', username: 'alice', display_name: 'Alice', avatar_url: null, status: 'online',
}

const channel = (overrides: Partial<Channel>): Channel => ({
    id: 'chan-1', room_id: 'room-1', name: 'general', type: 'text', topic: null, position: 0,
    voice_mode: 'auto', settings: null, ...overrides,
})

const channelView: MainView = { type: 'channel' }

const defaultProps = {
    currentUser: user,
    recentCustomStatuses: [],
    activeView: channelView,
    onSelectRoles: vi.fn(),
    onSelectCreateChannel: vi.fn(),
    onSelectInvite: vi.fn(),
}

describe('ChannelSidebar', () => {
    beforeEach(() => {
        useVoiceRoster.setState({ rosters: {} })
        useChannels.setState({ channels: {} })
    })

    afterEach(() => {
        vi.clearAllMocks()
    })

    it('groups known types in announcement/text/voice order with their labels', () => {
        const channels: Channel[] = [
            channel({ id: 'c-voice', name: 'Voice Chat', type: 'voice' }),
            channel({ id: 'c-text', name: 'general', type: 'text' }),
            channel({ id: 'c-announce', name: 'news', type: 'announcement' }),
        ]

        render(<ChannelSidebar room={room} channels={channels} activeChannelId="c-text" {...defaultProps} />)

        const labels = screen.getAllByText(/Channels$|Announcements/).map((el) => el.textContent)
        expect(labels).toEqual(['Announcements', 'Text Channels', 'Voice Channels'])
    })

    it('still renders a channel of an unrecognized future type with an auto-generated label', () => {
        const channels: Channel[] = [
            channel({ id: 'c-drawing', name: 'Whiteboard', type: 'drawing' as Channel['type'] }),
        ]

        render(<ChannelSidebar room={room} channels={channels} activeChannelId="c-drawing" {...defaultProps} />)

        expect(screen.getByText('Drawing Channels')).toBeInTheDocument()
        expect(screen.getByText('Whiteboard')).toBeInTheDocument()
    })

    it('highlights the active channel link', () => {
        const channels: Channel[] = [channel({ id: 'c-text', name: 'general', type: 'text' })]

        render(<ChannelSidebar room={room} channels={channels} activeChannelId="c-text" {...defaultProps} />)

        expect(screen.getByText('general').closest('a')).toHaveClass('bg-sixth')
    })

    it('does not highlight the active channel link while another view (e.g. Roles) is showing', () => {
        const channels: Channel[] = [channel({ id: 'c-text', name: 'general', type: 'text' })]

        render(
            <ChannelSidebar
                room={room} channels={channels} activeChannelId="c-text" {...defaultProps}
                activeView={{ type: 'roles' }}
            />
        )

        expect(screen.getByText('general').closest('a')).not.toHaveClass('bg-sixth')
    })

    it('shows who is currently in a voice channel below it, muted or not', () => {
        useVoiceRoster.getState().setRoster('channel.c-voice', [
            { userId: 'user-2', displayName: 'Bob', avatarUrl: null, muted: false },
            { userId: 'user-3', displayName: 'Carol', avatarUrl: null, muted: true },
        ])
        const channels: Channel[] = [channel({ id: 'c-voice', name: 'Voice Chat', type: 'voice' })]

        render(<ChannelSidebar room={room} channels={channels} activeChannelId="c-voice" {...defaultProps} />)

        expect(screen.getByText('Bob')).toBeInTheDocument()
        expect(screen.getByText('Carol')).toBeInTheDocument()
        expect(screen.getByLabelText('Muted')).toBeInTheDocument()
    })

    it('shows no participant list under an empty voice channel', () => {
        const channels: Channel[] = [channel({ id: 'c-voice', name: 'Voice Chat', type: 'voice' })]

        render(<ChannelSidebar room={room} channels={channels} activeChannelId="c-voice" {...defaultProps} />)

        expect(screen.queryByLabelText('Muted')).not.toBeInTheDocument()
    })

    it('hides the add-channel button and roles button by default', () => {
        render(<ChannelSidebar room={room} channels={[]} activeChannelId="" {...defaultProps} />)

        expect(screen.queryByTitle('Add channel')).not.toBeInTheDocument()
        expect(screen.queryByTitle('Manage roles')).not.toBeInTheDocument()
    })

    it('shows the add-channel button when creatableChannelTypes is non-empty', () => {
        render(
            <ChannelSidebar
                room={room} channels={[]} activeChannelId="" {...defaultProps}
                creatableChannelTypes={['text']}
            />
        )

        expect(screen.getByTitle('Add channel')).toBeInTheDocument()
    })

    it('hides the add-channel button when creatableChannelTypes is empty', () => {
        render(
            <ChannelSidebar
                room={room} channels={[]} activeChannelId="" {...defaultProps}
                creatableChannelTypes={[]}
            />
        )

        expect(screen.queryByTitle('Add channel')).not.toBeInTheDocument()
    })

    it('shows a roles button that calls onSelectRoles when canManageRoles is true', async () => {
        const onSelectRoles = vi.fn()
        const u = userEvent.setup()

        render(
            <ChannelSidebar room={room} channels={[]} activeChannelId="" {...defaultProps} canManageRoles onSelectRoles={onSelectRoles} />
        )

        await u.click(screen.getByTitle('Manage roles'))
        expect(onSelectRoles).toHaveBeenCalled()
    })

    it('shows the roles button as active while the roles view is showing', () => {
        render(
            <ChannelSidebar
                room={room} channels={[]} activeChannelId="" {...defaultProps} canManageRoles
                activeView={{ type: 'roles' }}
            />
        )

        expect(screen.getByTitle('Manage roles')).toHaveClass('bg-sixth')
    })

    it('calls onSelectCreateChannel when the add-channel button is clicked', async () => {
        const onSelectCreateChannel = vi.fn()
        const u = userEvent.setup()

        render(
            <ChannelSidebar
                room={room} channels={[]} activeChannelId="" {...defaultProps}
                creatableChannelTypes={['text']} onSelectCreateChannel={onSelectCreateChannel}
            />
        )

        await u.click(screen.getByTitle('Add channel'))
        expect(onSelectCreateChannel).toHaveBeenCalled()
    })

    it('calls onSelectInvite when the invite button is clicked', async () => {
        const onSelectInvite = vi.fn()
        const u = userEvent.setup()

        render(
            <ChannelSidebar room={room} channels={[]} activeChannelId="" {...defaultProps} onSelectInvite={onSelectInvite} />
        )

        await u.click(screen.getByTitle('Invite people'))
        expect(onSelectInvite).toHaveBeenCalled()
    })

    it('reflects a channel added to the shared store by another tab/user (e.g. via ChannelCreated)', () => {
        const channels: Channel[] = [channel({ id: 'c-text', name: 'general', type: 'text' })]

        render(<ChannelSidebar room={room} channels={channels} activeChannelId="c-text" {...defaultProps} />)

        act(() => {
            useChannels.getState().addChannel('room-1', channel({ id: 'c-new', name: 'new-room-channel', type: 'text' }))
        })

        expect(screen.getByText('new-room-channel')).toBeInTheDocument()
    })

    it('reflects a channel removed from the shared store by another tab/user (e.g. via ChannelDeleted)', () => {
        const channels: Channel[] = [channel({ id: 'c-text', name: 'general', type: 'text' })]

        render(<ChannelSidebar room={room} channels={channels} activeChannelId="c-text" {...defaultProps} />)

        act(() => {
            useChannels.getState().removeChannel('room-1', 'c-text')
        })

        expect(screen.queryByText('general')).not.toBeInTheDocument()
    })
})
