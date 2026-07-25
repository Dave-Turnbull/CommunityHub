import { addReaction, deleteMessage, editMessage, removeReaction } from '@/services/api'
import { useMessages } from '@/stores'
import * as cache from '@/services/messageCache'
import type { Message, ReactionSummary } from '@/types'

/**
 * Message mutations a reader triggers, applied to the client first and
 * reconciled against the server's answer — the round trip plus the broadcast
 * hop is long enough that waiting for it reads as lag on every one of these.
 *
 * Each one follows the same three beats: apply the expected result, await the
 * server, then either replace the guess with the authoritative payload or put
 * the previous state back. The cache is patched alongside the store so a
 * message edited while it sits outside the current window doesn't come back
 * stale on the next page load (see services/messageCache.ts).
 */

/** The summary this client expects once the server has processed the toggle. */
export function predictReactions(
    reactions: ReactionSummary[],
    emoji: string,
    adding: boolean
): ReactionSummary[] {
    const existing = reactions.find((r) => r.emoji === emoji)

    if (!existing) {
        return adding ? [...reactions, { emoji, count: 1, reacted: true }] : reactions
    }

    const count = existing.count + (adding ? 1 : -1)

    if (count <= 0) return reactions.filter((r) => r.emoji !== emoji)

    return reactions.map((r) =>
        r.emoji === emoji ? { ...r, count, reacted: adding } : r
    )
}

export async function toggleReaction(
    scopeId: string,
    message: Message,
    emoji: string
): Promise<void> {
    const previous = message.reactions ?? []
    const adding = !previous.find((r) => r.emoji === emoji)?.reacted

    const { setReactions } = useMessages.getState()

    setReactions(scopeId, message.id, predictReactions(previous, emoji, adding))

    try {
        const confirmed = adding
            ? await addReaction(message.id, emoji)
            : await removeReaction(message.id, emoji)

        setReactions(scopeId, message.id, confirmed)
        await cache.patchReactions(scopeId, message.id, confirmed)
    } catch (error) {
        setReactions(scopeId, message.id, previous)
        throw error
    }
}

export async function saveEdit(
    scopeId: string,
    message: Message,
    content: string
): Promise<void> {
    const { update } = useMessages.getState()

    update(scopeId, { ...message, content, is_edited: true })

    try {
        const confirmed = await editMessage(message.id, content)

        update(scopeId, confirmed)
        await cache.patchMessage(scopeId, confirmed)
    } catch (error) {
        update(scopeId, message)
        throw error
    }
}

export async function removeMessage(scopeId: string, message: Message): Promise<void> {
    const { remove, insert } = useMessages.getState()

    remove(scopeId, message.id)

    try {
        await deleteMessage(message.id)
        await cache.dropMessage(scopeId, message.id)
    } catch (error) {
        // Back where it was, not appended at the end — hence insert().
        insert(scopeId, message)
        throw error
    }
}
