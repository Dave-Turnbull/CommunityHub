import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { forwardRef } from 'react'
import type { ReactNode } from 'react'
import { ChannelSidebar } from '@/components/layout/ChannelSidebar'
import { useVoiceRoster } from '@/stores'
import type { Channel, Room, User } from '@/types'

vi.mock('@inertiajs/react', () => ({
    Link: forwardRef<HTMLAnchorElement, { href: string; className?: string; children: ReactNode }>(
        ({ href, className, children }, ref) => <a href={href} className={className} ref={ref}>{children}</a>
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
    voice_mode: 'auto', ...overrides,
})

describe('ChannelSidebar', () => {
    beforeEach(() => {
        useVoiceRoster.setState({ rosters: {} })
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

        render(<ChannelSidebar room={room} channels={channels} activeChannelId="c-text" currentUser={user} />)

        const labels = screen.getAllByText(/Channels$|Announcements/).map((el) => el.textContent)
        expect(labels).toEqual(['Announcements', 'Text Channels', 'Voice Channels'])
    })

    it('still renders a channel of an unrecognized future type with an auto-generated label', () => {
        const channels: Channel[] = [
            channel({ id: 'c-drawing', name: 'Whiteboard', type: 'drawing' as Channel['type'] }),
        ]

        render(<ChannelSidebar room={room} channels={channels} activeChannelId="c-drawing" currentUser={user} />)

        expect(screen.getByText('Drawing Channels')).toBeInTheDocument()
        expect(screen.getByText('Whiteboard')).toBeInTheDocument()
    })

    it('highlights the active channel link', () => {
        const channels: Channel[] = [channel({ id: 'c-text', name: 'general', type: 'text' })]

        render(<ChannelSidebar room={room} channels={channels} activeChannelId="c-text" currentUser={user} />)

        expect(screen.getByText('general').closest('a')).toHaveClass('bg-surface-400')
    })

    it('shows who is currently in a voice channel below it, muted or not', () => {
        useVoiceRoster.getState().setRoster('channel.c-voice', [
            { userId: 'user-2', displayName: 'Bob', avatarUrl: null, muted: false },
            { userId: 'user-3', displayName: 'Carol', avatarUrl: null, muted: true },
        ])
        const channels: Channel[] = [channel({ id: 'c-voice', name: 'Voice Chat', type: 'voice' })]

        render(<ChannelSidebar room={room} channels={channels} activeChannelId="c-voice" currentUser={user} />)

        expect(screen.getByText('Bob')).toBeInTheDocument()
        expect(screen.getByText('Carol')).toBeInTheDocument()
        expect(screen.getByLabelText('Muted')).toBeInTheDocument()
    })

    it('shows no participant list under an empty voice channel', () => {
        const channels: Channel[] = [channel({ id: 'c-voice', name: 'Voice Chat', type: 'voice' })]

        render(<ChannelSidebar room={room} channels={channels} activeChannelId="c-voice" currentUser={user} />)

        expect(screen.queryByLabelText('Muted')).not.toBeInTheDocument()
    })
})
