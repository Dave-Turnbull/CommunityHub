import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { forwardRef } from 'react'
import type { ReactNode } from 'react'
import { VoiceChannelSidebarItem } from '@/components/sidebar/VoiceChannelSidebarItem'
import { useVoice, useVoiceRoster } from '@/stores'
import * as api from '@/services/api'
import * as webrtc from '@/services/webrtc'
import type { Channel, User } from '@/types'

vi.mock('@inertiajs/react', () => ({
    Link: forwardRef<
        HTMLAnchorElement,
        { href: string; className?: string; title?: string; onDoubleClick?: (e: { preventDefault: () => void }) => void; children: ReactNode }
    >(
        ({ href, className, title, onDoubleClick, children }, ref) => (
            <a
                href={href}
                className={className}
                title={title}
                onClick={(e) => e.preventDefault()}
                onDoubleClick={onDoubleClick}
                ref={ref}
            >
                {children}
            </a>
        )
    ),
}))

vi.mock('@/services/clientId', () => ({
    getClientId: vi.fn(() => 'client-1'),
}))

vi.mock('@/services/api', () => ({
    fetchVoiceDevicePreference: vi.fn(),
}))

vi.mock('@/services/webrtc', () => ({
    joinVoice: vi.fn(),
    leaveVoice: vi.fn(),
    setMuted: vi.fn(),
}))

vi.mock('@/services/voicePresence', () => ({
    rosterKey: (scopeType: string, scopeId: string) => `${scopeType}.${scopeId}`,
    subscribeVoiceRoster: vi.fn(() => ({ channel: {}, leave: vi.fn() })),
}))

const currentUser: User = {
    id: 'user-1', username: 'alice', display_name: 'Alice', avatar_url: null, status: 'online',
}

const channel: Channel = {
    id: 'chan-1', room_id: 'room-1', name: 'Voice Chat', type: 'voice', topic: null, position: 0,
    voice_mode: 'auto', settings: null,
}

describe('VoiceChannelSidebarItem', () => {
    beforeEach(() => {
        useVoice.getState().reset()
        useVoiceRoster.setState({ rosters: {} })
        vi.mocked(api.fetchVoiceDevicePreference).mockResolvedValue({
            client_id: 'client-1', input_device_id: 'mic-1', output_device_id: null, send_threshold: 0,
        })
    })

    afterEach(() => {
        vi.clearAllMocks()
    })

    it('joins the call when the name is double-clicked while not connected', async () => {
        const user = userEvent.setup()
        render(<VoiceChannelSidebarItem channel={channel} active={false} currentUser={currentUser} />)

        await user.dblClick(screen.getByText('Voice Chat'))

        expect(webrtc.joinVoice).toHaveBeenCalledWith(
            'channel', 'chan-1',
            { id: 'user-1', displayName: 'Alice', avatarUrl: null },
            { inputDeviceId: 'mic-1', connectionMode: 'auto', sendThreshold: 0 }
        )
    })

    it('does not leave when the name is double-clicked while already connected — double-click only joins', async () => {
        useVoice.setState({ scopeId: 'chan-1' })
        const user = userEvent.setup()
        render(<VoiceChannelSidebarItem channel={channel} active={false} currentUser={currentUser} />)

        await user.dblClick(screen.getByText('Voice Chat'))

        expect(webrtc.leaveVoice).not.toHaveBeenCalled()
        expect(webrtc.joinVoice).not.toHaveBeenCalled()
    })

    it('still navigates to the channel when its name is clicked once', () => {
        render(<VoiceChannelSidebarItem channel={channel} active={false} currentUser={currentUser} />)

        expect(screen.getByText('Voice Chat').closest('a')).toHaveAttribute('href', '/channels/chan-1')
    })

    it('joins the call when the hover button is clicked while not connected', async () => {
        const user = userEvent.setup()
        render(<VoiceChannelSidebarItem channel={channel} active={false} currentUser={currentUser} />)

        await user.click(screen.getByTitle('Join voice'))

        expect(webrtc.joinVoice).toHaveBeenCalledWith(
            'channel', 'chan-1',
            { id: 'user-1', displayName: 'Alice', avatarUrl: null },
            { inputDeviceId: 'mic-1', connectionMode: 'auto', sendThreshold: 0 }
        )
    })

    it('leaves the call when the hover button is clicked while connected', async () => {
        useVoice.setState({ scopeId: 'chan-1' })
        const user = userEvent.setup()
        render(<VoiceChannelSidebarItem channel={channel} active={false} currentUser={currentUser} />)

        await user.click(screen.getByTitle('Leave voice'))

        expect(webrtc.leaveVoice).toHaveBeenCalled()
    })

    it('shows who is currently in the call below the channel name, muted or not', () => {
        useVoiceRoster.getState().setRoster('channel.chan-1', [
            { userId: 'user-2', displayName: 'Bob', avatarUrl: null, muted: false },
            { userId: 'user-3', displayName: 'Carol', avatarUrl: null, muted: true },
        ])

        render(<VoiceChannelSidebarItem channel={channel} active={false} currentUser={currentUser} />)

        expect(screen.getByText('Bob')).toBeInTheDocument()
        expect(screen.getByText('Carol')).toBeInTheDocument()
        expect(screen.getByLabelText('Muted')).toBeInTheDocument()
    })

    it('lists the current user alongside everyone else when they are in the call', () => {
        useVoice.setState({ scopeId: 'chan-1', selfMuted: true })
        useVoiceRoster.getState().setRoster('channel.chan-1', [
            { userId: 'user-2', displayName: 'Bob', avatarUrl: null, muted: false },
        ])

        render(<VoiceChannelSidebarItem channel={channel} active={false} currentUser={currentUser} />)

        expect(screen.getByText('Alice (you)')).toBeInTheDocument()
        expect(screen.getByText('Bob')).toBeInTheDocument()
        expect(screen.getAllByLabelText('Muted')).toHaveLength(1)
    })

    it('does not list the current user when they are not in the call', () => {
        render(<VoiceChannelSidebarItem channel={channel} active={false} currentUser={currentUser} />)

        expect(screen.queryByText('Alice (you)')).not.toBeInTheDocument()
    })
})
