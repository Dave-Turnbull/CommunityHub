import { lazy, Suspense } from 'react'
import * as Popover from '@radix-ui/react-popover'
import type { ReactNode } from 'react'

// Lazy — the emoji data is ~1 MB, no reason to ship it in the main bundle
const Picker = lazy(() => import('emoji-picker-react'))

interface Props {
    onSelect: (emoji: string) => void
    children: ReactNode
}

export function EmojiPicker({ onSelect, children }: Props) {
    return (
        <Popover.Root>
            <Popover.Trigger asChild>{children}</Popover.Trigger>
            <Popover.Portal>
                <Popover.Content
                    side="top"
                    align="end"
                    sideOffset={8}
                    className="z-50 rounded-lg overflow-hidden shadow-2xl border border-surface-400 animate-fade-in"
                >
                    <Suspense fallback={
                        <div className="w-[350px] h-[400px] bg-surface-800 grid place-items-center text-text-muted">
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
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    )
}
