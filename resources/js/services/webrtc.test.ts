import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useVoice, useVoiceRoster } from '@/stores'
import * as api from '@/services/api'
import * as voicePresence from '@/services/voicePresence'
import * as voiceCallGuard from '@/services/voiceCallGuard'
import type { VoiceParticipant } from '@/types'

vi.mock('@/services/api', () => ({
    fetchIceServers: vi.fn(),
}))

const whisperListeners: Record<string, (payload: unknown) => void> = {}
const whisper = vi.fn()
const leave = vi.fn()

const presenceChannel = {
    listenForWhisper: vi.fn((event: string, cb: (payload: unknown) => void) => {
        whisperListeners[event] = cb
        return presenceChannel
    }),
    whisper,
}

vi.mock('@/services/voicePresence', () => ({
    rosterKey: (scopeType: string, scopeId: string) => `${scopeType}.${scopeId}`,
    subscribeVoiceRoster: vi.fn(() => ({ channel: presenceChannel, leave })),
}))

const unsubscribeCallGuard = vi.fn()

vi.mock('@/services/voiceCallGuard', () => ({
    announceJoin: vi.fn(),
    guardAgainstOtherTabsJoining: vi.fn(() => unsubscribeCallGuard),
}))

// A minimal fake RTCPeerConnection — must be a real `function` (not an arrow
// function) since it's invoked with `new`, per this repo's Vitest 4 trap
// (see CLAUDE.md trap #15, which hit the same issue mocking laravel-echo).
const instances: FakePeerConnection[] = []

class FakePeerConnection {
    iceServers: unknown
    iceTransportPolicy: unknown
    tracks: unknown[] = []
    signalingState = 'stable'
    connectionState = 'new'
    localDescription: RTCSessionDescriptionInit | null = null
    onnegotiationneeded: (() => void) | null = null
    onicecandidate: ((e: { candidate: RTCIceCandidate | null }) => void) | null = null
    ontrack: ((e: { streams: MediaStream[] }) => void) | null = null
    onconnectionstatechange: (() => void) | null = null

    constructor(config: { iceServers: unknown; iceTransportPolicy: unknown }) {
        this.iceServers = config.iceServers
        this.iceTransportPolicy = config.iceTransportPolicy
        instances.push(this)
    }

    addTrack(track: unknown) { this.tracks.push(track) }
    close() { this.connectionState = 'closed' }
    async setLocalDescription() { this.localDescription = { type: 'offer', sdp: 'fake' } }
    async setRemoteDescription(desc: RTCSessionDescriptionInit) { this.localDescription = desc }
    async addIceCandidate() {}
}

function mockGetUserMedia() {
    const track = { stop: vi.fn(), enabled: true }
    const stream = {
        getTracks: () => [track],
        getAudioTracks: () => [track],
    }
    vi.stubGlobal('navigator', {
        mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    })
    return track
}

const participant = (overrides: Partial<VoiceParticipant> = {}): VoiceParticipant => ({
    userId: 'peer-1', displayName: 'Peer One', avatarUrl: null, muted: false, ...overrides,
})

const selfInfo = { id: 'me', displayName: 'Me', avatarUrl: null }

describe('webrtc service', () => {
    beforeEach(() => {
        vi.stubGlobal('RTCPeerConnection', FakePeerConnection)
        instances.length = 0
        for (const key of Object.keys(whisperListeners)) delete whisperListeners[key]
        useVoice.getState().reset()
        useVoiceRoster.setState({ rosters: {} })
        vi.mocked(api.fetchIceServers).mockResolvedValue({
            iceServers: [{ urls: 'stun:turn.test:3478' }, { urls: 'turn:turn.test:3478', username: 'u', credential: 'c' }],
        })
    })

    afterEach(async () => {
        // webrtc.ts is dynamically imported, so the module (and its
        // module-level peers Map / useVoiceRoster.subscribe registration) is
        // shared across every test in this file — leaveVoice() here prevents
        // a leftover roster subscription from one test reacting to the next
        // test's setRoster()/joinVoice() calls with stale ICE config.
        const { leaveVoice } = await import('@/services/webrtc')
        leaveVoice()
        vi.clearAllMocks()
        vi.unstubAllGlobals()
    })

    it('subscribes to the shared roster and creates a peer connection for each existing (non-self) member', async () => {
        mockGetUserMedia()
        useVoiceRoster.getState().setRoster('channel.chan-1', [participant({ userId: 'me' }), participant({ userId: 'peer-1' })])
        const { joinVoice } = await import('@/services/webrtc')

        await joinVoice('channel', 'chan-1', selfInfo, { connectionMode: 'auto' })

        expect(voicePresence.subscribeVoiceRoster).toHaveBeenCalledWith('channel', 'chan-1')
        expect(instances).toHaveLength(1)
        expect(useVoice.getState().connectionState).toBe('connected')
    })

    it('does not create a peer connection for the roster entry representing yourself', async () => {
        mockGetUserMedia()
        useVoiceRoster.getState().setRoster('channel.chan-1', [participant({ userId: 'me' })])
        const { joinVoice } = await import('@/services/webrtc')

        await joinVoice('channel', 'chan-1', selfInfo, { connectionMode: 'auto' })

        expect(instances).toHaveLength(0)
    })

    it('creates a peer connection when a new member appears in the roster after joining', async () => {
        mockGetUserMedia()
        const { joinVoice } = await import('@/services/webrtc')
        await joinVoice('channel', 'chan-1', selfInfo, { connectionMode: 'auto' })

        useVoiceRoster.getState().upsertParticipant('channel.chan-1', participant({ userId: 'peer-2' }))

        expect(instances).toHaveLength(1)
    })

    it('tears down the peer connection when a member disappears from the roster', async () => {
        mockGetUserMedia()
        useVoiceRoster.getState().setRoster('channel.chan-1', [participant({ userId: 'peer-1' })])
        const { joinVoice } = await import('@/services/webrtc')
        await joinVoice('channel', 'chan-1', selfInfo, { connectionMode: 'auto' })
        expect(instances).toHaveLength(1)

        useVoiceRoster.getState().removeParticipant('channel.chan-1', 'peer-1')

        expect(instances[0].connectionState).toBe('closed')
    })

    it('does not react to roster changes for a different scope', async () => {
        mockGetUserMedia()
        const { joinVoice } = await import('@/services/webrtc')
        await joinVoice('channel', 'chan-1', selfInfo, { connectionMode: 'auto' })

        useVoiceRoster.getState().upsertParticipant('channel.other-chan', participant({ userId: 'peer-9' }))

        expect(instances).toHaveLength(0)
    })

    it('direct mode strips TURN servers from the ICE config', async () => {
        mockGetUserMedia()
        useVoiceRoster.getState().setRoster('channel.chan-1', [participant({ userId: 'peer-1' })])
        const { joinVoice } = await import('@/services/webrtc')

        await joinVoice('channel', 'chan-1', selfInfo, { connectionMode: 'direct' })

        expect(instances[0].iceServers).toEqual([{ urls: 'stun:turn.test:3478' }])
        expect(instances[0].iceTransportPolicy).toBe('all')
    })

    it('relay mode forces the relay-only ice transport policy', async () => {
        mockGetUserMedia()
        useVoiceRoster.getState().setRoster('channel.chan-1', [participant({ userId: 'peer-1' })])
        const { joinVoice } = await import('@/services/webrtc')

        await joinVoice('channel', 'chan-1', selfInfo, { connectionMode: 'relay' })

        expect(instances[0].iceTransportPolicy).toBe('relay')
    })

    it('announces itself as actually in the call via call-state, not just by subscribing', async () => {
        mockGetUserMedia()
        const { joinVoice } = await import('@/services/webrtc')

        await joinVoice('channel', 'chan-1', selfInfo, { connectionMode: 'auto' })

        expect(whisper).toHaveBeenCalledWith('call-state', {
            userId: 'me', displayName: 'Me', avatarUrl: null, muted: false, inCall: true,
        })
    })

    it('adds itself to the shared roster on join, since whisper never reaches the sender', async () => {
        mockGetUserMedia()
        const { joinVoice } = await import('@/services/webrtc')

        await joinVoice('channel', 'chan-1', selfInfo, { connectionMode: 'auto' })

        expect(useVoiceRoster.getState().rosters['channel.chan-1']).toContainEqual(
            { userId: 'me', displayName: 'Me', avatarUrl: null, muted: false }
        )
    })

    it('records its own participant info on useVoice so voicePresence.ts can re-announce it to late subscribers', async () => {
        mockGetUserMedia()
        const { joinVoice } = await import('@/services/webrtc')

        await joinVoice('channel', 'chan-1', selfInfo, { connectionMode: 'auto' })

        expect(useVoice.getState().selfParticipant).toEqual(
            { userId: 'me', displayName: 'Me', avatarUrl: null, muted: false }
        )
    })

    it('leaveVoice whispers call-state inCall:false and removes itself from the shared roster', async () => {
        mockGetUserMedia()
        const { joinVoice, leaveVoice } = await import('@/services/webrtc')
        await joinVoice('channel', 'chan-1', selfInfo, { connectionMode: 'auto' })

        leaveVoice()

        expect(whisper).toHaveBeenCalledWith('call-state', { userId: 'me', inCall: false })
        expect(useVoiceRoster.getState().rosters['channel.chan-1']?.find((p) => p.userId === 'me')).toBeUndefined()
    })

    it('leaveVoice closes every peer, stops local tracks, leaves the roster subscription, and resets the store', async () => {
        const track = mockGetUserMedia()
        useVoiceRoster.getState().setRoster('channel.chan-1', [participant({ userId: 'peer-1' })])
        const { joinVoice, leaveVoice } = await import('@/services/webrtc')
        await joinVoice('channel', 'chan-1', selfInfo, { connectionMode: 'auto' })

        leaveVoice()

        expect(instances[0].connectionState).toBe('closed')
        expect(track.stop).toHaveBeenCalled()
        expect(leave).toHaveBeenCalled()
        expect(useVoice.getState().scopeId).toBeNull()
    })

    it('leaveVoice stops reconciling peers against further roster changes', async () => {
        mockGetUserMedia()
        const { joinVoice, leaveVoice } = await import('@/services/webrtc')
        await joinVoice('channel', 'chan-1', selfInfo, { connectionMode: 'auto' })
        leaveVoice()

        useVoiceRoster.getState().upsertParticipant('channel.chan-1', participant({ userId: 'peer-1' }))

        expect(instances).toHaveLength(0)
    })

    it('setMuted disables the local track, updates its own roster entry, and whispers mute-state', async () => {
        mockGetUserMedia()
        useVoiceRoster.getState().setRoster('channel.chan-1', [participant({ userId: 'me' })])
        const { joinVoice, setMuted } = await import('@/services/webrtc')
        await joinVoice('channel', 'chan-1', selfInfo, { connectionMode: 'auto' })

        setMuted(true)

        expect(useVoice.getState().selfMuted).toBe(true)
        expect(useVoiceRoster.getState().rosters['channel.chan-1'].find((p) => p.userId === 'me')?.muted).toBe(true)
        expect(whisper).toHaveBeenCalledWith('mute-state', { userId: 'me', muted: true })
    })

    it('announces itself to other tabs of the same user via voiceCallGuard on join', async () => {
        mockGetUserMedia()
        const { joinVoice } = await import('@/services/webrtc')

        await joinVoice('channel', 'chan-1', selfInfo, { connectionMode: 'auto' })

        expect(voiceCallGuard.announceJoin).toHaveBeenCalledWith('me', 'channel', 'chan-1')
        expect(voiceCallGuard.guardAgainstOtherTabsJoining).toHaveBeenCalledWith('me', expect.any(Function))
    })

    it('unsubscribes the cross-tab call guard on leave', async () => {
        mockGetUserMedia()
        const { joinVoice, leaveVoice } = await import('@/services/webrtc')
        await joinVoice('channel', 'chan-1', selfInfo, { connectionMode: 'auto' })

        leaveVoice()

        expect(unsubscribeCallGuard).toHaveBeenCalled()
    })

    it('joining a different scope while already in a call leaves the old one first (same-tab guard)', async () => {
        mockGetUserMedia()
        useVoiceRoster.getState().setRoster('channel.chan-1', [participant({ userId: 'peer-1' })])
        const { joinVoice } = await import('@/services/webrtc')
        await joinVoice('channel', 'chan-1', selfInfo, { connectionMode: 'auto' })
        expect(instances).toHaveLength(1)

        await joinVoice('channel', 'chan-2', selfInfo, { connectionMode: 'auto' })

        expect(instances[0].connectionState).toBe('closed')
        expect(useVoice.getState().scopeId).toBe('chan-2')
    })

    it('an incoming signal addressed to someone else is ignored', async () => {
        mockGetUserMedia()
        const { joinVoice } = await import('@/services/webrtc')
        await joinVoice('channel', 'chan-1', selfInfo, { connectionMode: 'auto' })

        await whisperListeners['signal']({ to: 'someone-else', from: 'peer-9', description: { type: 'offer', sdp: 'x' } })

        expect(instances).toHaveLength(0)
    })
})
