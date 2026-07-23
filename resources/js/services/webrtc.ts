import { fetchIceServers } from '@/services/api'
import { rosterKey, subscribeVoiceRoster } from '@/services/voicePresence'
import { announceJoin, guardAgainstOtherTabsJoining } from '@/services/voiceCallGuard'
import { useVoice, useVoiceRoster } from '@/stores'
import type { VoiceConnectionMode } from '@/types'

interface SignalPayload {
    to: string
    from: string
    description?: RTCSessionDescriptionInit
    candidate?: RTCIceCandidateInit
}

interface PeerEntry {
    pc: RTCPeerConnection
    polite: boolean
    makingOffer: boolean
    ignoreOffer: boolean
}

type VoiceChannelHandle = ReturnType<typeof subscribeVoiceRoster>['channel']

const peers = new Map<string, PeerEntry>()
const remoteStreams = new Map<string, MediaStream>()

let localStream: MediaStream | null = null
let voiceChannel: VoiceChannelHandle | null = null
let leaveRoster: (() => void) | null = null
let unsubscribeRoster: (() => void) | null = null
let currentUserId: string | null = null
let currentKey: string | null = null
let currentIceServers: RTCIceServer[] = []
let currentTransportPolicy: RTCIceTransportPolicy = 'all'
let unsubscribeCallGuard: (() => void) | null = null

export function getRemoteStream(userId: string): MediaStream | undefined {
    return remoteStreams.get(userId)
}

/**
 * Deterministic glare resolution for the Perfect Negotiation pattern (the
 * current WebRTC-standard approach — see MDN/W3C sample code — rather than an
 * ad-hoc join-order heuristic): both peers run identical negotiation code,
 * and whichever side is "polite" backs off when an offer collision happens.
 */
function isPolite(remoteUserId: string): boolean {
    return (currentUserId as string) > remoteUserId
}

function sendSignal(payload: SignalPayload): void {
    voiceChannel?.whisper('signal', payload)
}

function createPeerConnection(remoteUserId: string): PeerEntry {
    const pc = new RTCPeerConnection({
        iceServers: currentIceServers,
        iceTransportPolicy: currentTransportPolicy,
    })

    const entry: PeerEntry = { pc, polite: isPolite(remoteUserId), makingOffer: false, ignoreOffer: false }

    localStream?.getTracks().forEach((track) => pc.addTrack(track, localStream as MediaStream))

    pc.onnegotiationneeded = async () => {
        try {
            entry.makingOffer = true
            await pc.setLocalDescription()
            sendSignal({ to: remoteUserId, from: currentUserId as string, description: pc.localDescription as RTCSessionDescriptionInit })
        } catch (err) {
            console.error('[voice] negotiation failed', err)
        } finally {
            entry.makingOffer = false
        }
    }

    pc.onicecandidate = ({ candidate }) => {
        if (candidate) {
            sendSignal({ to: remoteUserId, from: currentUserId as string, candidate: candidate.toJSON() })
        }
    }

    pc.ontrack = ({ streams }) => {
        if (streams[0]) {
            remoteStreams.set(remoteUserId, streams[0])
        }
    }

    pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
            teardownPeer(remoteUserId)
        }
    }

    peers.set(remoteUserId, entry)

    return entry
}

async function handleSignal(payload: SignalPayload): Promise<void> {
    if (payload.to !== currentUserId) return

    const entry = peers.get(payload.from) ?? createPeerConnection(payload.from)

    if (payload.description) {
        const offerCollision =
            payload.description.type === 'offer' &&
            (entry.makingOffer || entry.pc.signalingState !== 'stable')

        entry.ignoreOffer = !entry.polite && offerCollision
        if (entry.ignoreOffer) return

        await entry.pc.setRemoteDescription(payload.description)

        if (payload.description.type === 'offer') {
            await entry.pc.setLocalDescription()
            sendSignal({
                to: payload.from,
                from: currentUserId as string,
                description: entry.pc.localDescription as RTCSessionDescriptionInit,
            })
        }
    } else if (payload.candidate) {
        try {
            await entry.pc.addIceCandidate(payload.candidate)
        } catch (err) {
            if (!entry.ignoreOffer) throw err
        }
    }
}

function teardownPeer(remoteUserId: string): void {
    peers.get(remoteUserId)?.pc.close()
    peers.delete(remoteUserId)
    remoteStreams.delete(remoteUserId)
}

/**
 * Open/close peer connections to match the current shared roster (see
 * services/voicePresence.ts) rather than reacting to presence/whisper events
 * directly — `call-state` announcements arrive asynchronously and the roster
 * subscription may already have existed (e.g. the sidebar was observing this
 * scope first), so there's no single "initial member list" event to hang
 * peer-connection setup off of. Diffing against the store's current value
 * converges correctly regardless of subscribe order or timing.
 */
function reconcilePeers(key: string): void {
    if (key !== currentKey) return

    const roster = useVoiceRoster.getState().rosters[key] ?? []
    const rosterIds = new Set(roster.filter((p) => p.userId !== currentUserId).map((p) => p.userId))

    rosterIds.forEach((id) => {
        if (!peers.has(id)) createPeerConnection(id)
    })

    Array.from(peers.keys()).forEach((id) => {
        if (!rosterIds.has(id)) teardownPeer(id)
    })
}

function isTurnUrl(urls: string | string[]): boolean {
    const list = Array.isArray(urls) ? urls : [urls]
    return list.some((url) => url.startsWith('turn:'))
}

export interface VoiceSelf {
    id: string
    displayName: string
    avatarUrl: string | null
}

export interface JoinVoiceOptions {
    inputDeviceId?: string | null
    connectionMode: VoiceConnectionMode
}

export async function joinVoice(
    scopeType: 'channel' | 'conversation',
    scopeId: string,
    self: VoiceSelf,
    options: JoinVoiceOptions
): Promise<void> {
    const newKey = rosterKey(scopeType, scopeId)

    // Same-tab case: deterministic, no whisper round-trip needed — this
    // tab's own state already knows if it's in a different call. The
    // cross-tab case (a second open tab) is handled below via
    // voiceCallGuard, which is best-effort (whisper has no delivery
    // guarantee) since it has to reach another tab.
    if (currentKey && currentKey !== newKey) {
        leaveVoice()
    }

    const store = useVoice.getState()
    currentUserId = self.id
    currentKey = newKey
    currentTransportPolicy = options.connectionMode === 'relay' ? 'relay' : 'all'

    store.setConnectionState('connecting')

    const { iceServers } = await fetchIceServers()
    currentIceServers = options.connectionMode === 'direct'
        ? iceServers.filter((server) => !isTurnUrl(server.urls))
        : iceServers

    localStream = await navigator.mediaDevices.getUserMedia({
        audio: options.inputDeviceId ? { deviceId: { exact: options.inputDeviceId } } : true,
    })

    const { channel, leave } = subscribeVoiceRoster(scopeType, scopeId)
    voiceChannel = channel
    leaveRoster = leave

    channel.listenForWhisper('signal', handleSignal)

    const selfParticipant = { userId: self.id, displayName: self.displayName, avatarUrl: self.avatarUrl, muted: false }
    // Recorded on useVoice so voicePresence.ts's shared .joining() handler
    // knows to re-announce us to new subscribers — see services/voicePresence.ts.
    store.setScope(scopeType, scopeId, selfParticipant)

    // Whisper never reaches the sender — add ourselves to the roster locally,
    // then announce to everyone else already subscribed (observers included).
    useVoiceRoster.getState().upsertParticipant(currentKey, selfParticipant)
    channel.whisper('call-state', { ...selfParticipant, inCall: true })

    reconcilePeers(currentKey)
    unsubscribeRoster = useVoiceRoster.subscribe(() => reconcilePeers(currentKey as string))

    announceJoin(self.id, scopeType, scopeId)
    unsubscribeCallGuard = guardAgainstOtherTabsJoining(self.id, leaveVoice)

    store.setConnectionState('connected')
}

export function leaveVoice(): void {
    Array.from(peers.keys()).forEach(teardownPeer)
    localStream?.getTracks().forEach((track) => track.stop())
    localStream = null
    unsubscribeRoster?.()
    unsubscribeRoster = null
    unsubscribeCallGuard?.()
    unsubscribeCallGuard = null

    if (currentUserId && currentKey) {
        useVoiceRoster.getState().removeParticipant(currentKey, currentUserId)
        voiceChannel?.whisper('call-state', { userId: currentUserId, inCall: false })
    }

    leaveRoster?.()
    leaveRoster = null
    voiceChannel = null
    currentUserId = null
    currentKey = null
    useVoice.getState().reset()
}

export function setMuted(muted: boolean): void {
    localStream?.getAudioTracks().forEach((track) => { track.enabled = !muted })
    useVoice.getState().setSelfMuted(muted)

    if (currentUserId && currentKey) {
        // Whisper reaches every other subscriber but never the sender — update
        // our own roster entry directly so our own view (and anyone reading the
        // shared roster, e.g. the sidebar) reflects it immediately too.
        useVoiceRoster.getState().setParticipantMuted(currentKey, currentUserId, muted)
        voiceChannel?.whisper('mute-state', { userId: currentUserId, muted })
    }
}
