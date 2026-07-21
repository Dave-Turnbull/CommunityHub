import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NotificationPreferences } from '@/components/settings/NotificationPreferences'
import * as api from '@/services/api'
import type { NotificationPreference } from '@/types'

vi.mock('@/services/api', () => ({
    fetchNotificationPreferences: vi.fn(),
    updateNotificationPreference: vi.fn(),
}))

const defaults: NotificationPreference[] = [
    { category: 'room_invite', email: true, in_app: true },
    { category: 'room_message', email: false, in_app: false },
    { category: 'direct_message', email: false, in_app: true },
]

describe('NotificationPreferences', () => {
    afterEach(() => {
        vi.clearAllMocks()
    })

    it('renders every category with its effective toggle state', async () => {
        vi.mocked(api.fetchNotificationPreferences).mockResolvedValue(defaults)

        render(<NotificationPreferences />)

        expect(await screen.findByText('Room Invites')).toBeInTheDocument()
        expect(screen.getByText('Room Messages')).toBeInTheDocument()
        expect(screen.getByText('Messages')).toBeInTheDocument()

        expect(screen.getByRole('switch', { name: 'Email notifications for Room Invites' }))
            .toHaveAttribute('aria-checked', 'true')
        expect(screen.getByRole('switch', { name: 'In-app notifications for Room Messages' }))
            .toHaveAttribute('aria-checked', 'false')
        expect(screen.getByRole('switch', { name: 'In-app notifications for Messages' }))
            .toHaveAttribute('aria-checked', 'true')
    })

    it('flips a toggle and persists it via the API', async () => {
        vi.mocked(api.fetchNotificationPreferences).mockResolvedValue(defaults)
        vi.mocked(api.updateNotificationPreference).mockResolvedValue({
            category: 'direct_message', email: true, in_app: true,
        })
        const user = userEvent.setup()

        render(<NotificationPreferences />)
        await screen.findByText('Messages')

        await user.click(screen.getByRole('switch', { name: 'Email notifications for Messages' }))

        expect(api.updateNotificationPreference).toHaveBeenCalledWith({
            category: 'direct_message', email: true, in_app: true,
        })
        expect(screen.getByRole('switch', { name: 'Email notifications for Messages' }))
            .toHaveAttribute('aria-checked', 'true')
    })

    it('disables the Messages in-app toggle so it cannot be turned off', async () => {
        vi.mocked(api.fetchNotificationPreferences).mockResolvedValue(defaults)

        render(<NotificationPreferences />)

        expect(await screen.findByRole('switch', { name: 'In-app notifications for Messages' }))
            .toBeDisabled()
    })

    it('does not call the API when clicking the locked Messages in-app toggle', async () => {
        vi.mocked(api.fetchNotificationPreferences).mockResolvedValue(defaults)
        const user = userEvent.setup()

        render(<NotificationPreferences />)
        const toggle = await screen.findByRole('switch', { name: 'In-app notifications for Messages' })
        await user.click(toggle)

        expect(api.updateNotificationPreference).not.toHaveBeenCalled()
    })

    it('leaves the other categories in-app toggles enabled', async () => {
        vi.mocked(api.fetchNotificationPreferences).mockResolvedValue(defaults)

        render(<NotificationPreferences />)

        expect(await screen.findByRole('switch', { name: 'In-app notifications for Room Invites' }))
            .not.toBeDisabled()
        expect(screen.getByRole('switch', { name: 'In-app notifications for Room Messages' }))
            .not.toBeDisabled()
    })
})
