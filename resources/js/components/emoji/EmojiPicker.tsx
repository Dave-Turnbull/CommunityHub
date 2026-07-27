import { Component, lazy, Suspense } from 'react'
import { Popover } from '@/components/ui/Popover'
import type { ReactNode } from 'react'

// Lazy — the emoji data is ~1 MB, no reason to ship it in the main bundle
const Picker = lazy(() => import('emoji-picker-react'))

interface BoundaryProps {
    onError?: () => void
    children: ReactNode
}

interface BoundaryState {
    failed: boolean
}

// A failed dynamic import (flaky network, an ad-blocker, ...) throws during
// render, same as any other render error — Suspense only covers the pending
// state, so this is the standard React-recommended pairing for a lazy chunk
// that might fail to load. Without it, that failure would crash the whole
// channel view instead of degrading to "couldn't load the emoji picker."
class EmojiPickerBoundary extends Component<BoundaryProps, BoundaryState> {
    state: BoundaryState = { failed: false }

    static getDerivedStateFromError() {
        return { failed: true }
    }

    componentDidCatch() {
        this.props.onError?.()
    }

    render() {
        if (this.state.failed) {
            return (
                <div className="w-[350px] h-[400px] bg-third grid place-items-center text-text-muted text-sm p-4 text-center">
                    Couldn't load the emoji picker.
                </div>
            )
        }

        return this.props.children
    }
}

interface Props {
    onSelect: (emoji: string) => void
    /** Called (in addition to the built-in fallback above) if the picker chunk fails to load. */
    onError?: () => void
    children: ReactNode
}

export function EmojiPicker({ onSelect, onError, children }: Props) {
    return (
        <Popover
            trigger={children}
            side="top"
            align="end"
            sideOffset={8}
            className="rounded-lg overflow-hidden shadow-2xl border border-sixth"
        >
            <EmojiPickerBoundary onError={onError}>
                <Suspense fallback={
                    <div className="w-[350px] h-[400px] bg-third grid place-items-center text-text-muted">
                        Loading…
                    </div>
                }>
                    <Picker
                        theme={'dark' as any}
                        width={350}
                        height={400}
                        onEmojiClick={(d: any) => onSelect(d.emoji)}
                    />
                </Suspense>
            </EmojiPickerBoundary>
        </Popover>
    )
}
