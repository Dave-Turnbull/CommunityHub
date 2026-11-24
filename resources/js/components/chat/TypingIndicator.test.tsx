import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { TypingIndicator } from '@/components/chat/TypingIndicator'
import { TYPING_TTL_MS, useTyping } from '@/stores'

const names: Record<string, string> = { 'user-1': 'Me', 'user-2': 'Ada', 'user-3': 'Grace', 'user-4': 'Linus' }
const resolveName = (id: string) => names[id]

const renderIndicator = () =>
    render(<TypingIndicator scopeId="scope-1" currentUserId="user-1" resolveName={resolveName} />)

const line = (container: HTMLElement) => container.querySelector('[aria-live="polite"]') as HTMLElement

describe('TypingIndicator', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        useTyping.setState({ expiries: {} })
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('keeps its fixed-height container, empty, when nobody is typing', () => {
        const { container } = renderIndicator()

        expect(line(container)).toBeInTheDocument()
        expect(line(container)).toHaveClass('h-5')
        expect(line(container)).toBeEmptyDOMElement()
    })

    it('names one typist', () => {
        const { container } = renderIndicator()
        act(() => useTyping.getState().touch('scope-1', 'user-2'))

        expect(line(container)).toHaveTextContent('Ada is typing…')
    })

    it('names two typists', () => {
        const { container } = renderIndicator()
        act(() => {
            useTyping.getState().touch('scope-1', 'user-2')
            useTyping.getState().touch('scope-1', 'user-3')
        })

        expect(line(container)).toHaveTextContent('Ada and Grace are typing…')
    })

    it('collapses three or more to "Several people"', () => {
        const { container } = renderIndicator()
        act(() => {
            useTyping.getState().touch('scope-1', 'user-2')
            useTyping.getState().touch('scope-1', 'user-3')
            useTyping.getState().touch('scope-1', 'user-4')
        })

        expect(line(container)).toHaveTextContent('Several people are typing…')
    })

    it('ignores the current user and ids it cannot resolve', () => {
        const { container } = renderIndicator()
        act(() => {
            useTyping.getState().touch('scope-1', 'user-1')
            useTyping.getState().touch('scope-1', 'stranger')
        })

        expect(line(container)).toBeEmptyDOMElement()
    })

    it('only shows typists for its own scope', () => {
        const { container } = renderIndicator()
        act(() => useTyping.getState().touch('scope-2', 'user-2'))

        expect(line(container)).toBeEmptyDOMElement()
    })

    it('never renders a name carried by the whisper itself', async () => {
        vi.resetModules()
        const echoMocks = { listen: undefined as undefined | ((ev: unknown) => void) }
        vi.doMock('laravel-echo', () => ({
            default: vi.fn().mockImplementation(function () {
                const chan = {
                    listen: vi.fn(() => chan),
                    listenForWhisper: vi.fn((_e: string, cb: (ev: unknown) => void) => { echoMocks.listen = cb; return chan }),
                }
                return { join: () => chan, private: () => chan, leave: vi.fn() }
            }),
        }))
        vi.doMock('pusher-js', () => ({ default: vi.fn() }))
        const { subscribe } = await import('@/services/echo')
        const { useTyping: freshStore } = await import('@/stores')
        const { TypingIndicator: FreshIndicator } = await import('@/components/chat/TypingIndicator')

        const { container } = render(
            <FreshIndicator scopeId="scope-1" currentUserId="user-1" resolveName={resolveName} />
        )
        subscribe('scope-1', 'channel')
        act(() => echoMocks.listen!({ user_id: 'user-2', display_name: 'Mallory', name: 'Mallory' }))

        expect(freshStore.getState().expiries['scope-1']).toHaveProperty('user-2')
        expect(line(container)).toHaveTextContent('Ada is typing…')
        expect(container).not.toHaveTextContent('Mallory')

        vi.doUnmock('laravel-echo')
        vi.doUnmock('pusher-js')
    })

    it('clears the line once the entry lapses, via its own prune interval', () => {
        const { container } = renderIndicator()
        act(() => useTyping.getState().touch('scope-1', 'user-2'))
        expect(line(container)).toHaveTextContent('Ada is typing…')

        act(() => { vi.advanceTimersByTime(TYPING_TTL_MS + 1000) })

        expect(line(container)).toBeEmptyDOMElement()
    })

    it('stops its prune interval on unmount', () => {
        const { unmount } = renderIndicator()
        const prune = vi.spyOn(useTyping.getState(), 'prune')

        unmount()
        vi.advanceTimersByTime(10_000)

        expect(prune).not.toHaveBeenCalled()
        expect(vi.getTimerCount()).toBe(0)
    })
})
