import type { Message, PaginatedMessages, ReactionSummary } from '@/types'

/**
 * A per-scope cache of message history, so scrolling up and back down doesn't
 * re-fetch pages this tab has already seen (the message window in
 * stores/index.ts deliberately drops messages from the DOM, which without a
 * cache would mean a network round trip every time the reader changes
 * direction).
 *
 * The unit of storage is a single **contiguous run** per scope, not a set of
 * pages: contiguity is the only property correctness depends on, and a run
 * that can't prove it is contiguous with what the caller is asking for must
 * refuse to answer rather than hand back a gap. Every fetched page either
 * extends the run at one of its ends or replaces it.
 *
 * Storage sits behind an async driver so the native shell can swap in a
 * SQLite-backed one (a `cached_messages` table keyed by `(scope_id, id)` plus
 * the run's two boundary flags) without any caller changing — which is also
 * why the interface is async for the in-memory driver, where it needn't be.
 */
export interface CachedRun {
    /** Ascending by created_at, contiguous, no gaps. */
    messages: Message[]
    /** The run's oldest message is the oldest message in the scope. */
    reachedOldest: boolean
    /** The run's newest message is the scope's live tail. */
    reachedNewest: boolean
    updatedAt: number
}

export interface MessageCacheDriver {
    read(scopeId: string): Promise<CachedRun | null>
    write(scopeId: string, run: CachedRun): Promise<void>
    clear(scopeId?: string): Promise<void>
}

export function createMemoryDriver(): MessageCacheDriver {
    const runs = new Map<string, CachedRun>()

    return {
        async read(scopeId) {
            return runs.get(scopeId) ?? null
        },
        async write(scopeId, run) {
            runs.set(scopeId, run)
        },
        async clear(scopeId) {
            scopeId ? runs.delete(scopeId) : runs.clear()
        },
    }
}

let driver: MessageCacheDriver = createMemoryDriver()

/** Swap the storage backend — the native SQLite driver's entry point. */
export function setMessageCacheDriver(next: MessageCacheDriver): void {
    driver = next
}

const asRun = (page: PaginatedMessages): CachedRun => ({
    messages: page.data,
    reachedOldest: !page.has_older,
    reachedNewest: !page.has_newer,
    updatedAt: Date.now(),
})

/** Start a fresh run from a page whose position in history is known absolutely. */
export async function seedRun(scopeId: string, page: PaginatedMessages): Promise<void> {
    await driver.write(scopeId, asRun(page))
}

/**
 * Fold a fetched page into the run. The page shares its boundary message with
 * the run (it was fetched from a cursor that came out of the run), so the
 * merge is contiguous by construction; if the run has since been dropped or
 * the page doesn't touch it, the page becomes the new run instead of being
 * spliced into a hole.
 */
export async function extendRun(
    scopeId: string,
    page: PaginatedMessages,
    direction: 'older' | 'newer'
): Promise<void> {
    const run = await driver.read(scopeId)

    if (!run || !run.messages.length || !page.data.length) {
        await seedRun(scopeId, page)
        return
    }

    const merged = direction === 'older'
        ? [...page.data, ...run.messages]
        : [...run.messages, ...page.data]

    const seen = new Set<string>()

    await driver.write(scopeId, {
        messages: merged.filter((m) => !seen.has(m.id) && seen.add(m.id)),
        reachedOldest: direction === 'older' ? !page.has_older : run.reachedOldest,
        reachedNewest: direction === 'newer' ? !page.has_newer : run.reachedNewest,
        updatedAt: Date.now(),
    })
}

/**
 * A page of `limit` messages older than `beforeId`, or null when the run
 * can't serve a whole one. Refusing a partial page keeps the caller's
 * decision binary — cache or network, never both stitched together.
 */
export async function readOlder(
    scopeId: string,
    beforeId: string,
    limit: number
): Promise<PaginatedMessages | null> {
    const run = await driver.read(scopeId)
    if (!run) return null

    const at = run.messages.findIndex((m) => m.id === beforeId)
    if (at < 0) return null

    const available = run.messages.slice(0, at)
    if (available.length < limit && !run.reachedOldest) return null

    const data = available.slice(Math.max(0, available.length - limit))
    if (!data.length) return null

    const hasOlder = data.length < available.length || !run.reachedOldest

    return {
        data,
        has_older: hasOlder,
        older_cursor: hasOlder ? data[0].id : null,
        has_newer: true,
        newer_cursor: data[data.length - 1].id,
    }
}

/** Mirror of readOlder, walking forward from `afterId` toward the tail. */
export async function readNewer(
    scopeId: string,
    afterId: string,
    limit: number
): Promise<PaginatedMessages | null> {
    const run = await driver.read(scopeId)
    if (!run) return null

    const at = run.messages.findIndex((m) => m.id === afterId)
    if (at < 0) return null

    const available = run.messages.slice(at + 1)
    if (available.length < limit && !run.reachedNewest) return null

    const data = available.slice(0, limit)
    if (!data.length) return null

    const hasNewer = data.length < available.length || !run.reachedNewest

    return {
        data,
        has_older: true,
        older_cursor: data[0].id,
        has_newer: hasNewer,
        newer_cursor: hasNewer ? data[data.length - 1].id : null,
    }
}

/**
 * Take a live message onto the end of the run — but only while the run
 * actually reaches the tail. A run that has already fallen behind the present
 * would otherwise gain a message with unfetched history in front of it, i.e.
 * cache a gap and serve it later as though it were contiguous.
 */
export async function appendLive(scopeId: string, message: Message): Promise<void> {
    const run = await driver.read(scopeId)
    if (!run || !run.reachedNewest) return
    if (run.messages.some((m) => m.id === message.id)) return

    await driver.write(scopeId, {
        ...run,
        messages: [...run.messages, message],
        updatedAt: Date.now(),
    })
}

/**
 * Keep a cached copy in step with an edit/reaction change. Only ever patches a
 * message the run already holds — a message it doesn't hold is either outside
 * the run or on the far side of a gap, and inventing a position for it is
 * exactly what appendLive refuses to do.
 */
export async function patchMessage(scopeId: string, message: Message): Promise<void> {
    const run = await driver.read(scopeId)
    if (!run || !run.messages.some((m) => m.id === message.id)) return

    await driver.write(scopeId, {
        ...run,
        messages: run.messages.map((m) => (m.id === message.id ? message : m)),
        updatedAt: Date.now(),
    })
}

/** patchMessage for the one field that changes without a full message payload. */
export async function patchReactions(
    scopeId: string,
    messageId: string,
    reactions: ReactionSummary[]
): Promise<void> {
    const run = await driver.read(scopeId)
    if (!run || !run.messages.some((m) => m.id === messageId)) return

    await driver.write(scopeId, {
        ...run,
        messages: run.messages.map((m) => (m.id === messageId ? { ...m, reactions } : m)),
        updatedAt: Date.now(),
    })
}

export async function dropMessage(scopeId: string, messageId: string): Promise<void> {
    const run = await driver.read(scopeId)
    if (!run || !run.messages.some((m) => m.id === messageId)) return

    await driver.write(scopeId, {
        ...run,
        messages: run.messages.filter((m) => m.id !== messageId),
        updatedAt: Date.now(),
    })
}

export async function invalidate(scopeId?: string): Promise<void> {
    await driver.clear(scopeId)
}
