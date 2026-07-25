import { beforeEach, describe, expect, it, vi } from 'vitest'
import { predictReactions, removeMessage, saveEdit, toggleReaction } from '@/services/messageActions'
import { useMessages } from '@/stores'
import * as api from '@/services/api'
import { createMemoryDriver, readOlder, seedRun, setMessageCacheDriver } from '@/services/messageCache'
import type { Message, PaginatedMessages } from '@/types'

vi.mock('@/services/api', () => ({
    addReaction: vi.fn(),
    removeReaction: vi.fn(),
    editMessage: vi.fn(),
    deleteMessage: vi.fn(),
}))

const message = (id: string, overrides: Partial<Message> = {}): Message => ({
    id,
    channel_id: 'chan-1',
    conversation_id: null,
    author_id: 'user-1',
    content: `content-${id}`,
    type: 'text',
    is_edited: false,
    is_pinned: false,
    reply_to_id: null,
    created_at: `2026-01-01T00:00:0${id}Z`,
    ...overrides,
})

const page = (messages: Message[]): PaginatedMessages => ({
    data: messages,
    has_older: false,
    older_cursor: null,
    has_newer: false,
    newer_cursor: null,
})

const stored = (id: string) =>
    useMessages.getState().messages['chan-1'].find((m) => m.id === id)

describe('predictReactions', () => {
    it('adds a pill that was not there', () => {
        expect(predictReactions([], '👍', true)).toEqual([{ emoji: '👍', count: 1, reacted: true }])
    })

    it('counts an existing pill up and marks the viewer as having reacted', () => {
        expect(predictReactions([{ emoji: '👍', count: 2, reacted: false }], '👍', true))
            .toEqual([{ emoji: '👍', count: 3, reacted: true }])
    })

    it('counts down and drops the pill when the last reaction goes', () => {
        expect(predictReactions([{ emoji: '👍', count: 1, reacted: true }], '👍', false)).toEqual([])
    })

    it('leaves other emoji alone', () => {
        const reactions = [
            { emoji: '👍', count: 1, reacted: true },
            { emoji: '🎉', count: 2, reacted: false },
        ]

        expect(predictReactions(reactions, '👍', false)).toEqual([
            { emoji: '🎉', count: 2, reacted: false },
        ])
    })
})

describe('messageActions', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        useMessages.setState({ messages: {}, windows: {}, typing: {} })
        setMessageCacheDriver(createMemoryDriver())
    })

    describe('toggleReaction', () => {
        it('applies the prediction, then replaces it with the server summary', async () => {
            const target = message('1', { reactions: [] })
            useMessages.getState().setWindow('chan-1', page([target]))
            vi.mocked(api.addReaction).mockResolvedValue([{ emoji: '👍', count: 4, reacted: true }])

            await toggleReaction('chan-1', target, '👍')

            expect(api.addReaction).toHaveBeenCalledWith('1', '👍')
            expect(stored('1')?.reactions).toEqual([{ emoji: '👍', count: 4, reacted: true }])
        })

        it('removes when the viewer has already reacted', async () => {
            const target = message('1', { reactions: [{ emoji: '👍', count: 1, reacted: true }] })
            useMessages.getState().setWindow('chan-1', page([target]))
            vi.mocked(api.removeReaction).mockResolvedValue([])

            await toggleReaction('chan-1', target, '👍')

            expect(api.removeReaction).toHaveBeenCalledWith('1', '👍')
            expect(api.addReaction).not.toHaveBeenCalled()
            expect(stored('1')?.reactions).toEqual([])
        })

        it('restores the previous summary and rethrows when the request fails', async () => {
            const previous = [{ emoji: '👍', count: 2, reacted: false }]
            const target = message('1', { reactions: previous })
            useMessages.getState().setWindow('chan-1', page([target]))
            vi.mocked(api.addReaction).mockRejectedValue(new Error('boom'))

            await expect(toggleReaction('chan-1', target, '👍')).rejects.toThrow('boom')
            expect(stored('1')?.reactions).toEqual(previous)
        })

        it('writes the confirmed summary through to the cache', async () => {
            const target = message('1', { reactions: [] })
            useMessages.getState().setWindow('chan-1', page([target]))
            await seedRun('chan-1', page([target, message('2'), message('3')]))
            vi.mocked(api.addReaction).mockResolvedValue([{ emoji: '👍', count: 1, reacted: true }])

            await toggleReaction('chan-1', target, '👍')

            const cached = (await readOlder('chan-1', '3', 5))!.data
            expect(cached.find((m) => m.id === '1')?.reactions)
                .toEqual([{ emoji: '👍', count: 1, reacted: true }])
        })
    })

    describe('saveEdit', () => {
        it('shows the new content before the server answers, then takes the server copy', async () => {
            const target = message('1')
            useMessages.getState().setWindow('chan-1', page([target]))

            let resolve: (m: Message) => void = () => {}
            vi.mocked(api.editMessage).mockReturnValue(new Promise((r) => { resolve = r }))

            const saving = saveEdit('chan-1', target, 'updated')

            expect(stored('1')?.content).toBe('updated')
            expect(stored('1')?.is_edited).toBe(true)

            resolve({ ...target, content: 'updated', is_edited: true, type: 'text' })
            await saving

            expect(api.editMessage).toHaveBeenCalledWith('1', 'updated')
            expect(stored('1')?.content).toBe('updated')
        })

        it('puts the old content back and rethrows when the save fails', async () => {
            const target = message('1', { content: 'original' })
            useMessages.getState().setWindow('chan-1', page([target]))
            vi.mocked(api.editMessage).mockRejectedValue(new Error('nope'))

            await expect(saveEdit('chan-1', target, 'updated')).rejects.toThrow('nope')

            expect(stored('1')?.content).toBe('original')
            expect(stored('1')?.is_edited).toBe(false)
        })

        it('keeps the cached copy in step so a page reload does not show stale content', async () => {
            const target = message('1')
            useMessages.getState().setWindow('chan-1', page([target]))
            await seedRun('chan-1', page([target, message('2'), message('3')]))
            vi.mocked(api.editMessage).mockResolvedValue({ ...target, content: 'updated', is_edited: true })

            await saveEdit('chan-1', target, 'updated')

            const cached = (await readOlder('chan-1', '3', 5))!.data
            expect(cached.find((m) => m.id === '1')?.content).toBe('updated')
        })
    })

    describe('removeMessage', () => {
        it('removes the message immediately and drops it from the cache', async () => {
            const target = message('2')
            useMessages.getState().setWindow('chan-1', page([message('1'), target, message('3')]))
            await seedRun('chan-1', page([message('1'), target, message('3')]))
            vi.mocked(api.deleteMessage).mockResolvedValue(undefined)

            await removeMessage('chan-1', target)

            expect(useMessages.getState().messages['chan-1'].map((m) => m.id)).toEqual(['1', '3'])
            expect((await readOlder('chan-1', '3', 5))?.data.map((m) => m.id)).toEqual(['1'])
        })

        it('puts a rejected delete back in its original position', async () => {
            const target = message('2')
            useMessages.getState().setWindow('chan-1', page([message('1'), target, message('3')]))
            vi.mocked(api.deleteMessage).mockRejectedValue(new Error('nope'))

            await expect(removeMessage('chan-1', target)).rejects.toThrow('nope')

            expect(useMessages.getState().messages['chan-1'].map((m) => m.id)).toEqual(['1', '2', '3'])
        })
    })
})
