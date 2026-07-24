import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useVoice, useVoiceRoster, useSpeaking, useRemoteStreamVersion, useConnectionQuality, useMicSensitivity } from '@/stores'
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

// voiceActivation.ts's own dB-threshold math is covered by
// voiceActivation.test.ts — mocked here so these tests can drive its
// onGateChange callback directly and assert on how webrtc.ts reacts,
// without needing to fake AudioContext/requestAnimationFrame too.
const voiceActivationStop = vi.fn()
const voiceActivationCalls: { getThreshold: () => unknown; onGateChange: (open: boolean) => void; getTimeoutMs?: () => number | null }[] = []

vi.mock('@/services/voiceActivation', () => ({
    startVoiceActivation: vi.fn((
        _stream: unknown,
        getThreshold: () => unknown,
        onGateChange: (open: boolean) => void,
        getTimeoutMs?: () => number | null
    ) => {
        voiceActivationCalls.push({ getThreshold, onGateChange, getTimeoutMs })
        return { stop: voiceActivationStop }
    }),
    // A trimmed-down stand-in for the real (thoroughly unit-tested elsewhere,
    // see voiceActivation.test.ts) computeThresholds — just enough for these
    // tests to assert on the resulting open/close pair.
    computeThresholds: ({ threshold, closeGap, autoGainControl }: { threshold: number; closeGap: number; autoGainControl: boolean }) => {
        if (autoGainControl) return { open: 0, close: 0 }
        const open = threshold / 100
        return { open, close: Math.max(0, open - closeGap / 100) }
    },
}))

// connectionQuality.ts's own getStats parsing/classification is covered by
// connectionQuality.test.ts — mocked here so these tests can drive its
// onQualityChange callback directly, without needing a real getStats/fake
// timers setup on top of everything else this file already fakes.
const connectionQualityStop = vi.fn()
const connectionQualityCalls: { onQualityChange: (quality: string) => void }[] = []

vi.mock('@/services/connectionQuality', () => ({
    startConnectionQualityMonitor: vi.fn((_pc: unknown, onQualityChange: (quality: string) => void) => {
        connectionQualityCalls.push({ onQualityChange })
        return { stop: connectionQualityStop }
    }),
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
        useSpeaking.setState({ speaking: {} })
        useRemoteStreamVersion.setState({ version: 0 })
        useConnectionQuality.setState({ quality: {} })
        useMicSensitivity.setState({ threshold: 0, closeGap: 0, timeoutMs: null, autoGainControl: false })
        voiceActivationCalls.length = 0
        connectionQualityCalls.length = 0
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

    // Perfect Negotiation glare: both sides can send an offer at once. The
    // "impolite" side (currentUserId > remoteUserId — see isPolite) must drop
    // the incoming offer rather than fight its own in-flight negotiation.
    it('an impolite peer ignores a colliding incoming offer while it already has one in flight', async () => {
        mockGetUserMedia()
        // 'me' < 'zzz-peer', so isPolite('zzz-peer') is false — we are impolite.
        useVoiceRoster.getState().setRoster('channel.chan-1', [participant({ userId: 'zzz-peer' })])
        const { joinVoice } = await import('@/services/webrtc')
        await joinVoice('channel', 'chan-1', selfInfo, { connectionMode: 'auto' })
        expect(instances).toHaveLength(1)

        // Simulate this side already negotiating its own offer (glare).
        instances[0].signalingState = 'have-local-offer'
        whisper.mockClear()

        await whisperListeners['signal']({
            to: 'me', from: 'zzz-peer', description: { type: 'offer', sdp: 'remote-offer' },
        })

        // Neither setRemoteDescription (which would populate localDescription
        // in this fake) nor an answering whisper should have happened.
        expect(instances[0].localDescription).toBeNull()
        expect(whisper).not.toHaveBeenCalledWith('signal', expect.objectContaining({ to: 'zzz-peer' }))
    })

    // The mirror image: the "polite" side (currentUserId < remoteUserId) backs
    // off its own offer and accepts the incoming one instead of ignoring it.
    it('a polite peer accepts a colliding incoming offer and answers it', async () => {
        mockGetUserMedia()
        // 'me' > 'aaa-peer', so isPolite('aaa-peer') is true — we are polite.
        useVoiceRoster.getState().setRoster('channel.chan-1', [participant({ userId: 'aaa-peer' })])
        const { joinVoice } = await import('@/services/webrtc')
        await joinVoice('channel', 'chan-1', selfInfo, { connectionMode: 'auto' })
        expect(instances).toHaveLength(1)

        instances[0].signalingState = 'have-local-offer'
        whisper.mockClear()

        await whisperListeners['signal']({
            to: 'me', from: 'aaa-peer', description: { type: 'offer', sdp: 'remote-offer' },
        })

        expect(instances[0].localDescription).toEqual({ type: 'offer', sdp: 'fake' })
        expect(whisper).toHaveBeenCalledWith('signal', {
            to: 'aaa-peer', from: 'me', description: { type: 'offer', sdp: 'fake' },
        })
    })

    it('requests explicit echoCancellation/noiseSuppression constraints, with autoGainControl deliberately off, when not overridden', async () => {
        mockGetUserMedia()
        const { joinVoice } = await import('@/services/webrtc')

        await joinVoice('channel', 'chan-1', selfInfo, { connectionMode: 'auto' })

        expect(vi.mocked(navigator.mediaDevices.getUserMedia)).toHaveBeenCalledWith({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
        })
    })

    it('honors explicit per-user overrides for echoCancellation/noiseSuppression/autoGainControl', async () => {
        mockGetUserMedia()
        const { joinVoice } = await import('@/services/webrtc')

        await joinVoice('channel', 'chan-1', selfInfo, {
            connectionMode: 'auto',
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: true,
        })

        expect(vi.mocked(navigator.mediaDevices.getUserMedia)).toHaveBeenCalledWith({
            audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true },
        })
    })

    it('merges the explicit audio constraints with a requested input device id', async () => {
        mockGetUserMedia()
        const { joinVoice } = await import('@/services/webrtc')

        await joinVoice('channel', 'chan-1', selfInfo, { connectionMode: 'auto', inputDeviceId: 'mic-42' })

        expect(vi.mocked(navigator.mediaDevices.getUserMedia)).toHaveBeenCalledWith({
            audio: {
                deviceId: { exact: 'mic-42' },
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: false,
            },
        })
    })

    describe('voice activation (send threshold)', () => {
        it('passes a getter reading the live useMicSensitivity store as a 0..1 fraction', async () => {
            mockGetUserMedia()
            useMicSensitivity.setState({ threshold: 40 })
            const { joinVoice } = await import('@/services/webrtc')

            await joinVoice('channel', 'chan-1', selfInfo, { connectionMode: 'auto' })

            expect(voiceActivationCalls[0].getThreshold()).toEqual({ open: 0.4, close: 0.4 })
        })

        it('the getter re-reads useMicSensitivity live, so a later change takes effect without rejoining', async () => {
            mockGetUserMedia()
            useMicSensitivity.setState({ threshold: 40 })
            const { joinVoice } = await import('@/services/webrtc')
            await joinVoice('channel', 'chan-1', selfInfo, { connectionMode: 'auto' })

            useMicSensitivity.setState({ threshold: 70 })

            expect(voiceActivationCalls[0].getThreshold()).toEqual({ open: 0.7, close: 0.7 })
        })

        it('passes a getter reading the live close_threshold_timeout_ms from useMicSensitivity', async () => {
            mockGetUserMedia()
            useMicSensitivity.setState({ timeoutMs: 1500 })
            const { joinVoice } = await import('@/services/webrtc')

            await joinVoice('channel', 'chan-1', selfInfo, { connectionMode: 'auto' })

            expect(voiceActivationCalls[0].getTimeoutMs?.()).toBe(1500)
        })

        it('the timeout getter re-reads useMicSensitivity live too', async () => {
            mockGetUserMedia()
            useMicSensitivity.setState({ timeoutMs: 1500 })
            const { joinVoice } = await import('@/services/webrtc')
            await joinVoice('channel', 'chan-1', selfInfo, { connectionMode: 'auto' })

            useMicSensitivity.setState({ timeoutMs: null })

            expect(voiceActivationCalls[0].getTimeoutMs?.()).toBeNull()
        })

        it('includes the live close_threshold_gap as the close threshold', async () => {
            mockGetUserMedia()
            useMicSensitivity.setState({ threshold: 50, closeGap: 20 })
            const { joinVoice } = await import('@/services/webrtc')

            await joinVoice('channel', 'chan-1', selfInfo, { connectionMode: 'auto' })

            expect(voiceActivationCalls[0].getThreshold()).toEqual({ open: 0.5, close: 0.3 })
        })

        it('collapses to always-on when autoGainControl is live-enabled, regardless of threshold', async () => {
            mockGetUserMedia()
            useMicSensitivity.setState({ threshold: 50, closeGap: 20, autoGainControl: true })
            const { joinVoice } = await import('@/services/webrtc')

            await joinVoice('channel', 'chan-1', selfInfo, { connectionMode: 'auto' })

            expect(voiceActivationCalls[0].getThreshold()).toEqual({ open: 0, close: 0 })
        })

        it('defaults the threshold to 0 (always-on) when useMicSensitivity has not been set', async () => {
            mockGetUserMedia()
            const { joinVoice } = await import('@/services/webrtc')

            await joinVoice('channel', 'chan-1', selfInfo, { connectionMode: 'auto' })

            expect(voiceActivationCalls[0].getThreshold()).toEqual({ open: 0, close: 0 })
        })

        it('disables the local audio track when the gate closes', async () => {
            const track = mockGetUserMedia()
            const { joinVoice } = await import('@/services/webrtc')
            await joinVoice('channel', 'chan-1', selfInfo, { connectionMode: 'auto' })

            voiceActivationCalls[0].onGateChange(false)

            expect(track.enabled).toBe(false)
        })

        it('re-enables the local audio track when the gate reopens, if not manually muted', async () => {
            const track = mockGetUserMedia()
            const { joinVoice } = await import('@/services/webrtc')
            await joinVoice('channel', 'chan-1', selfInfo, { connectionMode: 'auto' })
            voiceActivationCalls[0].onGateChange(false)

            voiceActivationCalls[0].onGateChange(true)

            expect(track.enabled).toBe(true)
        })

        it('a manual mute stays in effect even while the gate is open', async () => {
            const track = mockGetUserMedia()
            const { joinVoice, setMuted } = await import('@/services/webrtc')
            await joinVoice('channel', 'chan-1', selfInfo, { connectionMode: 'auto' })

            setMuted(true)
            voiceActivationCalls[0].onGateChange(true)

            expect(track.enabled).toBe(false)
        })

        it('unmuting respects the current (closed) gate state instead of forcing the track on', async () => {
            const track = mockGetUserMedia()
            const { joinVoice, setMuted } = await import('@/services/webrtc')
            await joinVoice('channel', 'chan-1', selfInfo, { connectionMode: 'auto' })

            setMuted(true)
            voiceActivationCalls[0].onGateChange(false)
            setMuted(false)

            expect(track.enabled).toBe(false)
        })

        it('unmuting re-enables the track immediately when the gate is open', async () => {
            const track = mockGetUserMedia()
            const { joinVoice, setMuted } = await import('@/services/webrtc')
            await joinVoice('channel', 'chan-1', selfInfo, { connectionMode: 'auto' })

            setMuted(true)
            voiceActivationCalls[0].onGateChange(true)
            setMuted(false)

            expect(track.enabled).toBe(true)
        })

        it('stops voice activation on leave', async () => {
            mockGetUserMedia()
            const { joinVoice, leaveVoice } = await import('@/services/webrtc')
            await joinVoice('channel', 'chan-1', selfInfo, { connectionMode: 'auto' })

            leaveVoice()

            expect(voiceActivationStop).toHaveBeenCalled()
        })
    })

    describe('per-remote-participant speaking detection', () => {
        it('starts speaking detection for a remote track using the fixed speaking threshold', async () => {
            mockGetUserMedia()
            useVoiceRoster.getState().setRoster('channel.chan-1', [participant({ userId: 'peer-1' })])
            const { joinVoice } = await import('@/services/webrtc')
            await joinVoice('channel', 'chan-1', selfInfo, { connectionMode: 'auto' })
            voiceActivationCalls.length = 0 // drop the local-gate call made during join

            instances[0].ontrack?.({ streams: [{} as MediaStream] })

            expect(voiceActivationCalls).toHaveLength(1)
            expect(voiceActivationCalls[0].getThreshold()).toEqual({ open: 0.15, close: 0.15 })
        })

        it('marks a remote participant as speaking when their gate opens', async () => {
            mockGetUserMedia()
            useVoiceRoster.getState().setRoster('channel.chan-1', [participant({ userId: 'peer-1' })])
            const { joinVoice } = await import('@/services/webrtc')
            await joinVoice('channel', 'chan-1', selfInfo, { connectionMode: 'auto' })
            voiceActivationCalls.length = 0
            instances[0].ontrack?.({ streams: [{} as MediaStream] })

            voiceActivationCalls[0].onGateChange(true)

            expect(useSpeaking.getState().speaking['peer-1']).toBe(true)
        })

        it('marks a remote participant as not speaking when their gate closes', async () => {
            mockGetUserMedia()
            useVoiceRoster.getState().setRoster('channel.chan-1', [participant({ userId: 'peer-1' })])
            const { joinVoice } = await import('@/services/webrtc')
            await joinVoice('channel', 'chan-1', selfInfo, { connectionMode: 'auto' })
            voiceActivationCalls.length = 0
            instances[0].ontrack?.({ streams: [{} as MediaStream] })
            voiceActivationCalls[0].onGateChange(true)

            voiceActivationCalls[0].onGateChange(false)

            expect(useSpeaking.getState().speaking['peer-1']).toBe(false)
        })

        it('stops speaking detection and clears the speaking flag once the peer is torn down', async () => {
            mockGetUserMedia()
            useVoiceRoster.getState().setRoster('channel.chan-1', [participant({ userId: 'peer-1' })])
            const { joinVoice } = await import('@/services/webrtc')
            await joinVoice('channel', 'chan-1', selfInfo, { connectionMode: 'auto' })
            instances[0].ontrack?.({ streams: [{} as MediaStream] })
            voiceActivationCalls[voiceActivationCalls.length - 1].onGateChange(true)
            expect(useSpeaking.getState().speaking['peer-1']).toBe(true)

            useVoiceRoster.getState().removeParticipant('channel.chan-1', 'peer-1')

            expect(useSpeaking.getState().speaking['peer-1']).toBe(false)
        })

        it('getRemoteStream returns the stream captured on ontrack, and nothing before it arrives or after teardown', async () => {
            mockGetUserMedia()
            useVoiceRoster.getState().setRoster('channel.chan-1', [participant({ userId: 'peer-1' })])
            const { joinVoice, getRemoteStream } = await import('@/services/webrtc')
            await joinVoice('channel', 'chan-1', selfInfo, { connectionMode: 'auto' })
            expect(getRemoteStream('peer-1')).toBeUndefined()

            const fakeStream = {} as MediaStream
            instances[0].ontrack?.({ streams: [fakeStream] })
            expect(getRemoteStream('peer-1')).toBe(fakeStream)

            useVoiceRoster.getState().removeParticipant('channel.chan-1', 'peer-1')
            expect(getRemoteStream('peer-1')).toBeUndefined()
        })

        it('bumps useRemoteStreamVersion when a remote track arrives, so audio-playback components know to re-attach it', async () => {
            mockGetUserMedia()
            useVoiceRoster.getState().setRoster('channel.chan-1', [participant({ userId: 'peer-1' })])
            const { joinVoice } = await import('@/services/webrtc')
            await joinVoice('channel', 'chan-1', selfInfo, { connectionMode: 'auto' })
            const before = useRemoteStreamVersion.getState().version

            instances[0].ontrack?.({ streams: [{} as MediaStream] })

            expect(useRemoteStreamVersion.getState().version).toBe(before + 1)
        })

        it('bumps useRemoteStreamVersion when a peer is torn down', async () => {
            mockGetUserMedia()
            useVoiceRoster.getState().setRoster('channel.chan-1', [participant({ userId: 'peer-1' })])
            const { joinVoice } = await import('@/services/webrtc')
            await joinVoice('channel', 'chan-1', selfInfo, { connectionMode: 'auto' })
            const before = useRemoteStreamVersion.getState().version

            useVoiceRoster.getState().removeParticipant('channel.chan-1', 'peer-1')

            expect(useRemoteStreamVersion.getState().version).toBe(before + 1)
        })
    })

    describe('per-remote-participant connection quality', () => {
        it('starts connection-quality monitoring for a new peer connection', async () => {
            mockGetUserMedia()
            useVoiceRoster.getState().setRoster('channel.chan-1', [participant({ userId: 'peer-1' })])
            const { joinVoice } = await import('@/services/webrtc')

            await joinVoice('channel', 'chan-1', selfInfo, { connectionMode: 'auto' })

            expect(connectionQualityCalls).toHaveLength(1)
        })

        it('updates useConnectionQuality when the monitor reports a tier', async () => {
            mockGetUserMedia()
            useVoiceRoster.getState().setRoster('channel.chan-1', [participant({ userId: 'peer-1' })])
            const { joinVoice } = await import('@/services/webrtc')
            await joinVoice('channel', 'chan-1', selfInfo, { connectionMode: 'auto' })

            connectionQualityCalls[0].onQualityChange('poor')

            expect(useConnectionQuality.getState().quality['peer-1']).toBe('poor')
        })

        it('stops connection-quality monitoring and resets to unknown once the peer is torn down', async () => {
            mockGetUserMedia()
            useVoiceRoster.getState().setRoster('channel.chan-1', [participant({ userId: 'peer-1' })])
            const { joinVoice } = await import('@/services/webrtc')
            await joinVoice('channel', 'chan-1', selfInfo, { connectionMode: 'auto' })
            connectionQualityCalls[0].onQualityChange('good')
            expect(useConnectionQuality.getState().quality['peer-1']).toBe('good')

            useVoiceRoster.getState().removeParticipant('channel.chan-1', 'peer-1')

            expect(connectionQualityStop).toHaveBeenCalled()
            expect(useConnectionQuality.getState().quality['peer-1']).toBe('unknown')
        })
    })
})
