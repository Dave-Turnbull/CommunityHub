import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Tabs } from '@/components/ui/Tabs'

const tabs = [
    { value: 'a', label: 'Tab A', content: <p>Content A</p> },
    { value: 'b', label: 'Tab B', content: <p>Content B</p> },
]

describe('Tabs', () => {
    it('shows the first tab content by default', () => {
        render(<Tabs tabs={tabs} />)

        expect(screen.getByText('Content A')).toBeInTheDocument()
        expect(screen.queryByText('Content B')).not.toBeInTheDocument()
    })

    it('shows the given defaultValue tab content', () => {
        render(<Tabs tabs={tabs} defaultValue="b" />)

        expect(screen.getByText('Content B')).toBeInTheDocument()
        expect(screen.queryByText('Content A')).not.toBeInTheDocument()
    })

    it('switches content when a trigger is clicked', async () => {
        const user = userEvent.setup()
        render(<Tabs tabs={tabs} />)

        await user.click(screen.getByRole('tab', { name: 'Tab B' }))

        expect(screen.getByText('Content B')).toBeInTheDocument()
        expect(screen.queryByText('Content A')).not.toBeInTheDocument()
    })
})
