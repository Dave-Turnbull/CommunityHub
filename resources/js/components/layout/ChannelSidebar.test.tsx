import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { forwardRef } from 'react'
import type { ReactNode } from 'react'
import { ChannelSidebar } from '@/components/layout/ChannelSidebar'
import { router } from '@inertiajs/react'
import { useChannels, useVoiceRoster } from '@/stores'
import * as api from '@/services/api'
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
    router: { visit: vi.fn() },
}))

vi.mock('@/services/api', async () => {
    const actual = await vi.importActual<typeof api>('@/services/api')
    return { ...actual, updateChannel: vi.fn(), deleteChannel: vi.fn(), reorderChannels: vi.fn() }
})

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

    describe('channel management menu', () => {
        const three: Channel[] = [
            channel({ id: 'c-a', name: 'alpha', position: 0 }),
            channel({ id: 'c-b', name: 'beta', position: 1 }),
            channel({ id: 'c-c', name: 'gamma', position: 2 }),
        ]

        const renderManaged = (channels: Channel[] = three, activeChannelId = 'c-a') =>
            render(
                <ChannelSidebar
                    room={room} channels={channels} activeChannelId={activeChannelId} {...defaultProps}
                    canManageChannels
                />
            )

        const openMenu = async (u: ReturnType<typeof userEvent.setup>, index: number) => {
            await u.click(screen.getAllByTitle('Channel actions')[index])
        }

        it('renders no row menu without canManageChannels', () => {
            render(<ChannelSidebar room={room} channels={three} activeChannelId="c-a" {...defaultProps} />)

            expect(screen.queryByTitle('Channel actions')).not.toBeInTheDocument()
        })

        it('renders a row menu for every channel, including a voice channel row', () => {
            renderManaged([channel({ id: 'c-a', name: 'alpha' }), channel({ id: 'c-v', name: 'Lounge', type: 'voice' })])

            expect(screen.getAllByTitle('Channel actions')).toHaveLength(2)
        })

        it('renames a channel inline on Enter, calling the API and updating the store', async () => {
            const u = userEvent.setup()
            vi.mocked(api.updateChannel).mockResolvedValue({ ...three[1], name: 'bravo' })
            renderManaged()

            await openMenu(u, 1)
            await u.click(await screen.findByText('Rename'))
            const input = screen.getByLabelText('Channel name')
            expect(input).toHaveValue('beta')
            await u.clear(input)
            await u.type(input, 'bravo{Enter}')

            expect(api.updateChannel).toHaveBeenCalledWith('c-b', { name: 'bravo' })
            await waitFor(() => expect(screen.getByText('bravo')).toBeInTheDocument())
            expect(useChannels.getState().channels['room-1'].find((c) => c.id === 'c-b')?.name).toBe('bravo')
            expect(screen.queryByLabelText('Channel name')).not.toBeInTheDocument()
        })

        it('cancels a rename on Escape without calling the API', async () => {
            const u = userEvent.setup()
            renderManaged()

            await openMenu(u, 1)
            await u.click(await screen.findByText('Rename'))
            await u.type(screen.getByLabelText('Channel name'), 'zzz{Escape}')

            expect(api.updateChannel).not.toHaveBeenCalled()
            expect(screen.getByText('beta')).toBeInTheDocument()
        })

        it('keeps the input open and shows an error when a rename fails', async () => {
            const u = userEvent.setup()
            vi.mocked(api.updateChannel).mockRejectedValue(new Error('boom'))
            renderManaged()

            await openMenu(u, 0)
            await u.click(await screen.findByText('Rename'))
            await u.type(screen.getByLabelText('Channel name'), 'x{Enter}')

            expect(await screen.findByText(/Renaming the channel failed/)).toBeInTheDocument()
            expect(screen.getByLabelText('Channel name')).toBeInTheDocument()
        })

        it('moves a channel down by sending the full reordered id list and updating the store', async () => {
            const u = userEvent.setup()
            vi.mocked(api.reorderChannels).mockResolvedValue()
            renderManaged()

            await openMenu(u, 0)
            await u.click(await screen.findByText('Move down'))

            expect(api.reorderChannels).toHaveBeenCalledWith('room-1', ['c-b', 'c-a', 'c-c'])
            await waitFor(() =>
                expect(useChannels.getState().channels['room-1'].map((c) => c.id)).toEqual(['c-b', 'c-a', 'c-c'])
            )
            expect(useChannels.getState().channels['room-1'].map((c) => c.position)).toEqual([0, 1, 2])
        })

        it('moves a channel up by sending the full reordered id list', async () => {
            const u = userEvent.setup()
            vi.mocked(api.reorderChannels).mockResolvedValue()
            renderManaged()

            await openMenu(u, 2)
            await u.click(await screen.findByText('Move up'))

            expect(api.reorderChannels).toHaveBeenCalledWith('room-1', ['c-a', 'c-c', 'c-b'])
        })

        it('offers no Move up on the first channel of its type and no Move down on the last', async () => {
            const u = userEvent.setup()
            renderManaged()

            await openMenu(u, 0)
            const first = await screen.findByRole('menu')
            expect(within(first).queryByText('Move up')).not.toBeInTheDocument()
            expect(within(first).getByText('Move down')).toBeInTheDocument()
            await u.keyboard('{Escape}')

            await openMenu(u, 2)
            const last = await screen.findByRole('menu')
            expect(within(last).queryByText('Move down')).not.toBeInTheDocument()
            expect(within(last).getByText('Move up')).toBeInTheDocument()
            expect(api.reorderChannels).not.toHaveBeenCalled()
        })

        it('swaps only within a type group, leaving other types in place', async () => {
            const u = userEvent.setup()
            vi.mocked(api.reorderChannels).mockResolvedValue()
            renderManaged([
                channel({ id: 't1', name: 'one', type: 'text' }),
                channel({ id: 'v1', name: 'Lounge', type: 'voice' }),
                channel({ id: 't2', name: 'two', type: 'text' }),
            ], 't1')

            await openMenu(u, 0)
            await u.click(await screen.findByText('Move down'))

            expect(api.reorderChannels).toHaveBeenCalledWith('room-1', ['t2', 'v1', 't1'])
        })

        it('does not delete when the confirmation is declined', async () => {
            const u = userEvent.setup()
            vi.spyOn(window, 'confirm').mockReturnValue(false)
            renderManaged()

            await openMenu(u, 1)
            await u.click(await screen.findByText('Delete'))

            expect(api.deleteChannel).not.toHaveBeenCalled()
            expect(screen.getByText('beta')).toBeInTheDocument()
        })

        it('deletes a non-active channel after confirming, without navigating', async () => {
            const u = userEvent.setup()
            vi.spyOn(window, 'confirm').mockReturnValue(true)
            vi.mocked(api.deleteChannel).mockResolvedValue()
            renderManaged()

            await openMenu(u, 1)
            await u.click(await screen.findByText('Delete'))

            expect(api.deleteChannel).toHaveBeenCalledWith('c-b')
            await waitFor(() => expect(screen.queryByText('beta')).not.toBeInTheDocument())
            expect(router.visit).not.toHaveBeenCalled()
        })

        it('navigates to the room after deleting the channel being viewed', async () => {
            const u = userEvent.setup()
            vi.spyOn(window, 'confirm').mockReturnValue(true)
            vi.mocked(api.deleteChannel).mockResolvedValue()
            renderManaged(three, 'c-a')

            await openMenu(u, 0)
            await u.click(await screen.findByText('Delete'))

            await waitFor(() => expect(router.visit).toHaveBeenCalledWith('/rooms/room-1'))
            expect(screen.queryByText('alpha')).not.toBeInTheDocument()
        })

        it('keeps the channel and shows an error when delete fails', async () => {
            const u = userEvent.setup()
            vi.spyOn(window, 'confirm').mockReturnValue(true)
            vi.mocked(api.deleteChannel).mockRejectedValue(new Error('boom'))
            renderManaged(three, 'c-a')

            await openMenu(u, 0)
            await u.click(await screen.findByText('Delete'))

            expect(await screen.findByText(/Deleting the channel failed/)).toBeInTheDocument()
            expect(screen.getByText('alpha')).toBeInTheDocument()
            expect(router.visit).not.toHaveBeenCalled()
        })
    })
})
