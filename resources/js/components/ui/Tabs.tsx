import * as RadixTabs from '@radix-ui/react-tabs'
import { clsx } from 'clsx'
import type { ReactNode } from 'react'

export interface TabItem {
    value: string
    label: string
    content: ReactNode
}

interface Props {
    tabs: TabItem[]
    defaultValue?: string
}

/** Generic tabbed container — pass panels in, get triggers + content switching for free. */
export function Tabs({ tabs, defaultValue }: Props) {
    return (
        <RadixTabs.Root defaultValue={defaultValue ?? tabs[0]?.value}>
            <RadixTabs.List className="flex gap-1 border-b border-surface-raised mb-6">
                {tabs.map((tab) => (
                    <RadixTabs.Trigger
                        key={tab.value}
                        value={tab.value}
                        className={clsx(
                            'px-3 py-2 text-sm font-medium text-text-muted border-b-2 border-transparent',
                            '-mb-px transition-colors duration-100',
                            'hover:text-text-primary',
                            'data-[state=active]:text-text-primary data-[state=active]:border-brand',
                        )}
                    >
                        {tab.label}
                    </RadixTabs.Trigger>
                ))}
            </RadixTabs.List>

            {tabs.map((tab) => (
                <RadixTabs.Content key={tab.value} value={tab.value} className="animate-fade-in">
                    {tab.content}
                </RadixTabs.Content>
            ))}
        </RadixTabs.Root>
    )
}
