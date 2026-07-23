import * as RadixDropdownMenu from '@radix-ui/react-dropdown-menu'
import { clsx } from 'clsx'
import type { ReactNode } from 'react'

interface Props {
    trigger: ReactNode
    children: ReactNode
    align?: 'start' | 'center' | 'end'
    sideOffset?: number
    className?: string
}

interface ItemProps {
    onSelect: () => void
    danger?: boolean
    children: ReactNode
}

function Root({ trigger, children, align = 'end', sideOffset = 4, className }: Props) {
    return (
        <RadixDropdownMenu.Root>
            <RadixDropdownMenu.Trigger asChild>{trigger}</RadixDropdownMenu.Trigger>
            <RadixDropdownMenu.Portal>
                <RadixDropdownMenu.Content
                    align={align}
                    sideOffset={sideOffset}
                    className={clsx('z-50 animate-fade-in', className)}
                >
                    {children}
                </RadixDropdownMenu.Content>
            </RadixDropdownMenu.Portal>
        </RadixDropdownMenu.Root>
    )
}

function Item({ onSelect, danger, children }: ItemProps) {
    return (
        <RadixDropdownMenu.Item
            onSelect={onSelect}
            className={clsx(
                'px-2 py-1.5 rounded cursor-pointer outline-none',
                danger
                    ? 'text-danger hover:bg-danger hover:text-white'
                    : 'text-text-secondary hover:bg-brand hover:text-white',
            )}
        >
            {children}
        </RadixDropdownMenu.Item>
    )
}

// Children-as-JSX composition (not a data-array API) so the menu stays
// flexible for future non-flat content. Item captures the plain-vs-danger
// styling every consumer (MessageRow's Edit/Delete) would otherwise repeat.
export const DropdownMenu = Object.assign(Root, { Item })
