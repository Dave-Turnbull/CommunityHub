import * as RadixTooltip from '@radix-ui/react-tooltip'
import type { ReactNode } from 'react'

interface Props {
    content: ReactNode
    side?: 'top' | 'right' | 'bottom' | 'left'
    children: ReactNode
}

export function Tooltip({ content, side = 'top', children }: Props) {
    return (
        <RadixTooltip.Provider delayDuration={300}>
            <RadixTooltip.Root>
                <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
                <RadixTooltip.Portal>
                    <RadixTooltip.Content
                        side={side}
                        sideOffset={8}
                        className="z-50 px-2 py-1 rounded text-xs font-medium bg-surface-app
                                   text-text-primary shadow-lg border border-surface-subtle animate-fade-in"
                    >
                        {content}
                        <RadixTooltip.Arrow className="fill-surface-app" />
                    </RadixTooltip.Content>
                </RadixTooltip.Portal>
            </RadixTooltip.Root>
        </RadixTooltip.Provider>
    )
}
