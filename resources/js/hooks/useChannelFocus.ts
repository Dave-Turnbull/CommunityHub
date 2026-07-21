import { useEffect } from 'react'
import { blurChannel, focusChannel } from '@/services/api'

// Keep comfortably under ChannelFocus::FOCUS_TTL_SECONDS (30s) on the backend
// so a heartbeat is never late enough for the focus cache entry to expire.
const HEARTBEAT_MS = 15_000

/**
 * Tells the backend this channel is open in the browser right now, so
 * channel-message notifications (and, later, @mentions) skip this user —
 * see App\Support\ChannelFocus. Only tracks whether the page is mounted, not
 * document/tab visibility. Pass null for a voice channel — there's no text
 * chat to suppress notifications for (see MessageController's guard).
 */
export function useChannelFocus(channelId: string | null): void {
    useEffect(() => {
        if (!channelId) return
        focusChannel(channelId)
        const heartbeat = setInterval(() => focusChannel(channelId), HEARTBEAT_MS)

        return () => {
            clearInterval(heartbeat)
            blurChannel(channelId)
        }
    }, [channelId])
}
