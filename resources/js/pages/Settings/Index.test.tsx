import { useState } from 'react'
import { forwardRef } from 'react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import SettingsIndex from '@/pages/Settings/Index'
import type { SharedProps, User } from '@/types'

vi.mock('@inertiajs/react', () => ({
    Head: () => null,
    Link: forwardRef<HTMLAnchorElement, { href: string; className?: string; children: ReactNode }>(
        ({ href, className, children }, ref) => <a href={href} className={className} ref={ref}>{children}</a>
    ),
    useForm: (initial: Record<string, unknown>) => {
        const [data, setDataState] = useState(initial)
        return {
            data,
            setData: (key: string, value: unknown) => setDataState((d) => ({ ...d, [key]: value })),
            patch: vi.fn(),
            processing: false,
            isDirty: true,
        }
    },
}))

vi.mock('@/components/settings/NotificationPreferences', () => ({
    NotificationPreferences: () => null,
}))

vi.mock('@/components/settings/AudioSettings', () => ({
    AudioSettings: () => null,
}))

vi.mock('@/components/settings/GlobalRolesSettings', () => ({
    GlobalRolesSettings: () => null,
}))

vi.mock('@/components/settings/RegistrationSettings', () => ({
    RegistrationSettings: () => null,
}))

const user: User = {
    id: 'user-1', username: 'alice', display_name: 'Alice', avatar_url: null, status: 'online',
    bio: 'Hello there', custom_status: 'Should not appear', custom_status_color: '#ff00aa',
}

const props = (
    overrides: { can_manage_global_roles?: boolean; can_manage_instance_settings?: boolean } = {}
): SharedProps & { user: User; can_manage_global_roles: boolean; can_manage_instance_settings: boolean } => ({
    appName: 'CommunityHub',
    maxUploadSizeBytes: 100 * 1024 * 1024,
    auth: { user },
    rooms: [],
    conversations: [],
    recentCustomStatuses: [],
    registrationPaths: { manual: true, emailInvite: true, oauth: true },
    authentikEnabled: false,
    flash: {},
    user,
    can_manage_global_roles: false,
    can_manage_instance_settings: false,
    ...overrides,
})

describe('Settings/Index', () => {
    it('still renders the display name, avatar URL, and bio fields', () => {
        render(<SettingsIndex {...props()} />)

        expect(screen.getByDisplayValue('Alice')).toBeInTheDocument()
        expect(screen.getByDisplayValue('Hello there')).toBeInTheDocument()
        expect(screen.getByText('Avatar URL')).toBeInTheDocument()
    })

    it('does not render a status grid or custom status input — that moved to the UserPanel popover', () => {
        render(<SettingsIndex {...props()} />)

        expect(screen.queryByText('Do Not Disturb')).not.toBeInTheDocument()
        expect(screen.queryByText('Invisible')).not.toBeInTheDocument()
        expect(screen.queryByPlaceholderText('Set custom status')).not.toBeInTheDocument()
        expect(screen.queryByText('Should not appear')).not.toBeInTheDocument()
    })

    it('still has the Save Changes button for the remaining profile fields', () => {
        render(<SettingsIndex {...props()} />)

        expect(screen.getByText('Save Changes')).toBeInTheDocument()
    })

    it('does not show a Roles tab for a user who cannot manage global roles', () => {
        render(<SettingsIndex {...props({ can_manage_global_roles: false })} />)

        expect(screen.queryByRole('tab', { name: 'Roles' })).not.toBeInTheDocument()
    })

    it('shows a Roles tab for a server admin, without changing the default active tab', () => {
        render(<SettingsIndex {...props({ can_manage_global_roles: true })} />)

        expect(screen.getByRole('tab', { name: 'Roles' })).toBeInTheDocument()
        // Profile stays the default tab even when Roles is present — see
        // Settings/Index.tsx's tab ordering.
        expect(screen.getByRole('tab', { name: 'Profile' })).toHaveAttribute('data-state', 'active')
    })

    it('does not show a Server tab for a user who cannot manage instance settings', () => {
        render(<SettingsIndex {...props({ can_manage_instance_settings: false })} />)

        expect(screen.queryByRole('tab', { name: 'Server' })).not.toBeInTheDocument()
    })

    it('shows a Server tab for a server admin', () => {
        render(<SettingsIndex {...props({ can_manage_instance_settings: true })} />)

        expect(screen.getByRole('tab', { name: 'Server' })).toBeInTheDocument()
    })
})
