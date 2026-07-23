import * as RadixPopover from '@radix-ui/react-popover'
import { clsx } from 'clsx'
import type { ReactNode } from 'react'

interface Props {
    trigger: ReactNode
    children: ReactNode
    side?: 'top' | 'right' | 'bottom' | 'left'
    align?: 'start' | 'center' | 'end'
    sideOffset?: number
    className?: string
}

// Deliberately minimal defaults — only stacking + entrance animation are
// baked in here. Visual chrome (rounding, border, shadow) stays caller-
// supplied via className so one consumer's opinion doesn't become "the"
// popover look forever. See EmojiPicker.tsx / UserStatusPopover.tsx for
// two different chrome choices built on top of the same wrapper.
export function Popover({ trigger, children, side = 'top', align = 'end', sideOffset = 8, className }: Props) {
    return (
        <RadixPopover.Root>
            <RadixPopover.Trigger asChild>{trigger}</RadixPopover.Trigger>
            <RadixPopover.Portal>
                <RadixPopover.Content
                    side={side}
                    align={align}
                    sideOffset={sideOffset}
                    className={clsx('z-50 animate-fade-in', className)}
                >
                    {children}
                </RadixPopover.Content>
            </RadixPopover.Portal>
        </RadixPopover.Root>
    )
}
