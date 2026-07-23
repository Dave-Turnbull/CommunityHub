import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startConnectionQualityMonitor } from '@/services/connectionQuality'

function statsReport(entries: Record<string, unknown>[]): RTCStatsReport {
    const map = new Map<string, Record<string, unknown>>()
    entries.forEach((entry, i) => map.set(`id-${i}`, entry))
    return map as unknown as RTCStatsReport
}

function fakePc(reports: RTCStatsReport[]): RTCPeerConnection {
    let call = 0
    return {
        getStats: vi.fn(() => Promise.resolve(reports[Math.min(call++, reports.length - 1)])),
    } as unknown as RTCPeerConnection
}

describe('connectionQuality', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('reports unknown when no relevant stats are present at all', async () => {
        const pc = fakePc([statsReport([])])
        const onQualityChange = vi.fn()

        startConnectionQualityMonitor(pc, onQualityChange)
        await vi.advanceTimersByTimeAsync(0)

        expect(onQualityChange).toHaveBeenCalledWith('unknown')
    })

    it('reports good for low round-trip time', async () => {
        const pc = fakePc([statsReport([
            { type: 'candidate-pair', state: 'succeeded', currentRoundTripTime: 0.05 },
        ])])
        const onQualityChange = vi.fn()

        startConnectionQualityMonitor(pc, onQualityChange)
        await vi.advanceTimersByTimeAsync(0)

        expect(onQualityChange).toHaveBeenCalledWith('good')
    })

    it('reports fair for moderate round-trip time', async () => {
        const pc = fakePc([statsReport([
            { type: 'candidate-pair', state: 'succeeded', currentRoundTripTime: 0.2 },
        ])])
        const onQualityChange = vi.fn()

        startConnectionQualityMonitor(pc, onQualityChange)
        await vi.advanceTimersByTimeAsync(0)

        expect(onQualityChange).toHaveBeenCalledWith('fair')
    })

    it('reports poor for high round-trip time', async () => {
        const pc = fakePc([statsReport([
            { type: 'candidate-pair', state: 'succeeded', currentRoundTripTime: 0.5 },
        ])])
        const onQualityChange = vi.fn()

        startConnectionQualityMonitor(pc, onQualityChange)
        await vi.advanceTimersByTimeAsync(0)

        expect(onQualityChange).toHaveBeenCalledWith('poor')
    })

    it('ignores a candidate-pair that was not selected', async () => {
        const pc = fakePc([statsReport([
            { type: 'candidate-pair', state: 'failed', currentRoundTripTime: 0.9 },
        ])])
        const onQualityChange = vi.fn()

        startConnectionQualityMonitor(pc, onQualityChange)
        await vi.advanceTimersByTimeAsync(0)

        expect(onQualityChange).toHaveBeenCalledWith('unknown')
    })

    it('computes packet loss as a rate between two samples, not the cumulative total', async () => {
        const pc = fakePc([
            statsReport([{ type: 'inbound-rtp', kind: 'audio', packetsLost: 0, packetsReceived: 100 }]),
            statsReport([{ type: 'inbound-rtp', kind: 'audio', packetsLost: 20, packetsReceived: 180 }]),
        ])
        const onQualityChange = vi.fn()

        startConnectionQualityMonitor(pc, onQualityChange)
        await vi.advanceTimersByTimeAsync(0)
        onQualityChange.mockClear()
        await vi.advanceTimersByTimeAsync(3000)

        // 20 lost of (20 + 80) total this interval = 20% loss rate.
        expect(onQualityChange).toHaveBeenCalledWith('poor')
    })

    it('reports good when the loss rate between samples is negligible', async () => {
        const pc = fakePc([
            statsReport([{ type: 'inbound-rtp', kind: 'audio', packetsLost: 0, packetsReceived: 100 }]),
            statsReport([{ type: 'inbound-rtp', kind: 'audio', packetsLost: 0, packetsReceived: 200 }]),
        ])
        const onQualityChange = vi.fn()

        startConnectionQualityMonitor(pc, onQualityChange)
        await vi.advanceTimersByTimeAsync(0)
        onQualityChange.mockClear()
        await vi.advanceTimersByTimeAsync(3000)

        expect(onQualityChange).toHaveBeenCalledWith('good')
    })

    it('polls on a repeating interval', async () => {
        const pc = fakePc([statsReport([{ type: 'candidate-pair', state: 'succeeded', currentRoundTripTime: 0.05 }])])
        const onQualityChange = vi.fn()

        startConnectionQualityMonitor(pc, onQualityChange)
        await vi.advanceTimersByTimeAsync(9000)

        expect(pc.getStats).toHaveBeenCalledTimes(4) // immediate + 3 intervals
    })

    it('stop() clears the polling interval', async () => {
        const pc = fakePc([statsReport([])])
        const onQualityChange = vi.fn()
        const handle = startConnectionQualityMonitor(pc, onQualityChange)
        await vi.advanceTimersByTimeAsync(0)
        vi.mocked(pc.getStats).mockClear()

        handle.stop()
        await vi.advanceTimersByTimeAsync(10000)

        expect(pc.getStats).not.toHaveBeenCalled()
    })

    it('does not call onQualityChange when getStats rejects', async () => {
        const pc = { getStats: vi.fn().mockRejectedValue(new Error('connection closed')) } as unknown as RTCPeerConnection
        const onQualityChange = vi.fn()

        startConnectionQualityMonitor(pc, onQualityChange)
        await vi.advanceTimersByTimeAsync(0)

        expect(onQualityChange).not.toHaveBeenCalled()
    })
})
