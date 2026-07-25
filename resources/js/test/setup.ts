import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// jsdom ships no IntersectionObserver, and MessageList constructs one per
// paging direction as soon as there is history to load (see
// docs/messages-and-pagination.md) — without this, rendering a message list at
// all throws. It observes nothing: a test that wants to prove paging happens
// should call the load handler, not fake an intersection.
if (!('IntersectionObserver' in globalThis)) {
    class IntersectionObserverStub implements IntersectionObserver {
        readonly root = null
        readonly rootMargin = ''
        readonly thresholds: readonly number[] = []

        observe = vi.fn()
        unobserve = vi.fn()
        disconnect = vi.fn()
        takeRecords = vi.fn(() => [])
    }

    vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)
}
