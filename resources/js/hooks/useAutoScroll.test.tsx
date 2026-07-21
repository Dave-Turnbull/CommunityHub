import { describe, expect, it } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { useAutoScroll } from '@/hooks/useAutoScroll'

function stubMetrics(el: HTMLElement, { scrollHeight, clientHeight, scrollTop }: {
    scrollHeight: number
    clientHeight: number
    scrollTop: number
}) {
    Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, configurable: true })
    Object.defineProperty(el, 'clientHeight', { value: clientHeight, configurable: true })
    Object.defineProperty(el, 'scrollTop', { value: scrollTop, writable: true, configurable: true })
}

function TestContainer({ dep }: { dep: number }) {
    const { ref, onScroll } = useAutoScroll(dep)
    return (
        <div ref={ref} onScroll={onScroll} data-testid="scroller">
            content
        </div>
    )
}

describe('useAutoScroll', () => {
    it('scrolls to the bottom on dep change while pinned (the default)', () => {
        const { getByTestId, rerender } = render(<TestContainer dep={1} />)
        const el = getByTestId('scroller')
        stubMetrics(el, { scrollHeight: 1000, clientHeight: 400, scrollTop: 0 })

        rerender(<TestContainer dep={2} />)

        expect(el.scrollTop).toBe(1000)
    })

    it('does not force-scroll once the user has scrolled away from the bottom', () => {
        const { getByTestId, rerender } = render(<TestContainer dep={1} />)
        const el = getByTestId('scroller')
        // Far from the bottom (>120px) -> unpins.
        stubMetrics(el, { scrollHeight: 1000, clientHeight: 400, scrollTop: 0 })
        fireEvent.scroll(el)

        stubMetrics(el, { scrollHeight: 1200, clientHeight: 400, scrollTop: 0 })
        rerender(<TestContainer dep={2} />)

        expect(el.scrollTop).toBe(0)
    })

    it('stays pinned when within 120px of the bottom', () => {
        const { getByTestId, rerender } = render(<TestContainer dep={1} />)
        const el = getByTestId('scroller')
        stubMetrics(el, { scrollHeight: 1000, clientHeight: 400, scrollTop: 550 })
        fireEvent.scroll(el)

        stubMetrics(el, { scrollHeight: 1200, clientHeight: 400, scrollTop: 550 })
        rerender(<TestContainer dep={2} />)

        expect(el.scrollTop).toBe(1200)
    })
})
