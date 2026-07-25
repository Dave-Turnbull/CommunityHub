import { beforeEach, describe, expect, it } from 'vitest'
import {
    appendLive,
    createMemoryDriver,
    dropMessage,
    extendRun,
    invalidate,
    patchMessage,
    patchReactions,
    readNewer,
    readOlder,
    seedRun,
    setMessageCacheDriver,
} from '@/services/messageCache'
import type { Message, PaginatedMessages } from '@/types'

const message = (id: number): Message => ({
    id: String(id),
    channel_id: 'chan-1',
    conversation_id: null,
    author_id: 'user-1',
    content: `content-${id}`,
    type: 'text',
    is_edited: false,
    is_pinned: false,
    reply_to_id: null,
    created_at: `2026-01-01T00:00:${String(id).padStart(2, '0')}Z`,
})

const run = (from: number, count: number) =>
    Array.from({ length: count }, (_, i) => message(from + i))

const page = (
    messages: Message[],
    overrides: Partial<PaginatedMessages> = {}
): PaginatedMessages => ({
    data: messages,
    has_older: false,
    older_cursor: null,
    has_newer: false,
    newer_cursor: null,
    ...overrides,
})

describe('messageCache', () => {
    beforeEach(() => {
        setMessageCacheDriver(createMemoryDriver())
    })

    it('serves a whole page of older messages out of the run', async () => {
        await seedRun('chan-1', page(run(0, 30), { has_older: true, older_cursor: '0' }))

        const older = await readOlder('chan-1', '10', 10)

        expect(older?.data.map((m) => m.id)).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'])
        expect(older?.has_older).toBe(true)
        expect(older?.has_newer).toBe(true)
    })

    it('reports no older history when the run reaches the start of the scope', async () => {
        await seedRun('chan-1', page(run(0, 30)))

        const older = await readOlder('chan-1', '5', 10)

        expect(older?.data.map((m) => m.id)).toEqual(['0', '1', '2', '3', '4'])
        expect(older?.has_older).toBe(false)
        expect(older?.older_cursor).toBeNull()
    })

    it('refuses a partial page rather than stitching cache and network together', async () => {
        await seedRun('chan-1', page(run(0, 30), { has_older: true, older_cursor: '0' }))

        expect(await readOlder('chan-1', '5', 10)).toBeNull()
    })

    it('refuses to answer for a cursor it does not hold', async () => {
        await seedRun('chan-1', page(run(0, 30)))

        expect(await readOlder('chan-1', 'unknown', 5)).toBeNull()
        expect(await readNewer('chan-1', 'unknown', 5)).toBeNull()
    })

    it('serves newer messages forward and marks the tail when it reaches it', async () => {
        await seedRun('chan-1', page(run(0, 30)))

        const newer = await readNewer('chan-1', '25', 10)

        expect(newer?.data.map((m) => m.id)).toEqual(['26', '27', '28', '29'])
        expect(newer?.has_newer).toBe(false)
        expect(newer?.has_older).toBe(true)
    })

    it('extendRun grows the run at the older end and keeps its tail flag', async () => {
        await seedRun('chan-1', page(run(10, 10), { has_older: true, older_cursor: '10' }))
        await extendRun('chan-1', page(run(0, 10)), 'older')

        const older = await readOlder('chan-1', '10', 10)

        expect(older?.data.map((m) => m.id)).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'])
        expect(older?.has_older).toBe(false)
    })

    it('extendRun grows the run at the newer end', async () => {
        await seedRun('chan-1', page(run(0, 10), { has_newer: true, newer_cursor: '9' }))
        await extendRun('chan-1', page(run(10, 10)), 'newer')

        const newer = await readNewer('chan-1', '9', 10)

        expect(newer?.data.map((m) => m.id)).toEqual(run(10, 10).map((m) => m.id))
        expect(newer?.has_newer).toBe(false)
    })

    it('appendLive takes a new message onto a run that reaches the tail', async () => {
        await seedRun('chan-1', page(run(0, 10)))
        await appendLive('chan-1', message(10))

        expect((await readNewer('chan-1', '9', 5))?.data.map((m) => m.id)).toEqual(['10'])
    })

    it('appendLive refuses a run that has already fallen behind the tail', async () => {
        await seedRun('chan-1', page(run(0, 10), { has_newer: true, newer_cursor: '9' }))
        await appendLive('chan-1', message(50))

        // Caching message 50 here would put it directly after 9 with the
        // messages between them missing — a gap served as contiguous history.
        expect(await readNewer('chan-1', '9', 5)).toBeNull()
    })

    it('patchMessage keeps an edit visible when the message pages back in', async () => {
        await seedRun('chan-1', page(run(0, 30)))
        await patchMessage('chan-1', { ...message(3), content: 'edited', is_edited: true })

        const older = await readOlder('chan-1', '10', 10)

        expect(older?.data.find((m) => m.id === '3')?.content).toBe('edited')
    })

    it('patchMessage ignores a message the run does not hold', async () => {
        await seedRun('chan-1', page(run(0, 5)))
        await patchMessage('chan-1', { ...message(90), content: 'nope' })

        expect((await readOlder('chan-1', '4', 10))?.data).toHaveLength(4)
    })

    it('patchReactions updates only the targeted message', async () => {
        await seedRun('chan-1', page(run(0, 5)))
        await patchReactions('chan-1', '2', [{ emoji: '👍', count: 1, reacted: true }])

        const cached = (await readOlder('chan-1', '4', 10))!.data

        expect(cached.find((m) => m.id === '2')?.reactions).toEqual([
            { emoji: '👍', count: 1, reacted: true },
        ])
        expect(cached.find((m) => m.id === '1')?.reactions).toBeUndefined()
    })

    it('dropMessage removes a deleted message from the run', async () => {
        await seedRun('chan-1', page(run(0, 5)))
        await dropMessage('chan-1', '2')

        expect((await readOlder('chan-1', '4', 10))?.data.map((m) => m.id)).toEqual(['0', '1', '3'])
    })

    it('invalidate drops a scope', async () => {
        await seedRun('chan-1', page(run(0, 5)))
        await invalidate('chan-1')

        expect(await readOlder('chan-1', '4', 10)).toBeNull()
    })

    it('runs are per scope', async () => {
        await seedRun('chan-1', page(run(0, 5)))
        await seedRun('conv-1', page(run(100, 5)))

        expect((await readOlder('chan-1', '4', 10))?.data.map((m) => m.id)).toEqual(['0', '1', '2', '3'])
        expect((await readOlder('conv-1', '104', 10))?.data.map((m) => m.id))
            .toEqual(['100', '101', '102', '103'])
    })
})
