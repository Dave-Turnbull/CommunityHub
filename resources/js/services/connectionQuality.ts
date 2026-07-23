export type ConnectionQuality = 'good' | 'fair' | 'poor' | 'unknown'

export interface ConnectionQualityHandle {
    stop(): void
}

const POLL_INTERVAL_MS = 3000

// Heuristic bands, not a formal spec — round-trip time and audio packet-loss
// rate are the two cheapest signals available from RTCPeerConnection's own
// getStats(), and both degrade audio in a way a user would actually notice
// past these rough thresholds.
const RTT_FAIR_SECONDS = 0.15
const RTT_POOR_SECONDS = 0.3
const LOSS_FAIR_RATE = 0.03
const LOSS_POOR_RATE = 0.08

interface ParsedStats {
    roundTripTime: number | null
    packetsLost: number | null
    packetsReceived: number | null
}

function parseStats(report: RTCStatsReport): ParsedStats {
    let roundTripTime: number | null = null
    let packetsLost: number | null = null
    let packetsReceived: number | null = null

    report.forEach((stat: Record<string, unknown>) => {
        if (stat.type === 'candidate-pair' && (stat.state === 'succeeded' || stat.nominated)) {
            if (typeof stat.currentRoundTripTime === 'number') roundTripTime = stat.currentRoundTripTime
        }
        if (stat.type === 'inbound-rtp' && (stat.kind === 'audio' || stat.mediaType === 'audio')) {
            if (typeof stat.packetsLost === 'number') packetsLost = stat.packetsLost
            if (typeof stat.packetsReceived === 'number') packetsReceived = stat.packetsReceived
        }
    })

    return { roundTripTime, packetsLost, packetsReceived }
}

function classify(roundTripTime: number | null, lossRate: number | null): ConnectionQuality {
    if (roundTripTime === null && lossRate === null) return 'unknown'

    const rtt = roundTripTime ?? 0
    const loss = lossRate ?? 0

    if (rtt > RTT_POOR_SECONDS || loss > LOSS_POOR_RATE) return 'poor'
    if (rtt > RTT_FAIR_SECONDS || loss > LOSS_FAIR_RATE) return 'fair'
    return 'good'
}

/**
 * Polls one peer connection's getStats() on an interval and classifies it
 * into a coarse quality tier — entirely local, no signaling involved (every
 * figure here already lives on the RTCPeerConnection object itself). Packet
 * loss is reported as a cumulative counter, so a rate needs a delta against
 * the previous sample; round-trip time from the selected candidate-pair is
 * already an instantaneous figure and needs no diffing.
 */
export function startConnectionQualityMonitor(
    pc: RTCPeerConnection,
    onQualityChange: (quality: ConnectionQuality) => void
): ConnectionQualityHandle {
    let prevPacketsLost: number | null = null
    let prevPacketsReceived: number | null = null

    const poll = () => {
        pc.getStats().then((report) => {
            const { roundTripTime, packetsLost, packetsReceived } = parseStats(report)

            let lossRate: number | null = null
            if (packetsLost !== null && packetsReceived !== null) {
                if (prevPacketsLost !== null && prevPacketsReceived !== null) {
                    const lostDelta = packetsLost - prevPacketsLost
                    const receivedDelta = packetsReceived - prevPacketsReceived
                    const totalDelta = lostDelta + receivedDelta
                    lossRate = totalDelta > 0 ? lostDelta / totalDelta : 0
                }
                prevPacketsLost = packetsLost
                prevPacketsReceived = packetsReceived
            }

            onQualityChange(classify(roundTripTime, lossRate))
        }).catch(() => {
            // getStats() can reject transiently while a connection is
            // closing — not worth surfacing as a quality reading.
        })
    }

    poll()
    const interval = setInterval(poll, POLL_INTERVAL_MS)

    return { stop: () => clearInterval(interval) }
}
