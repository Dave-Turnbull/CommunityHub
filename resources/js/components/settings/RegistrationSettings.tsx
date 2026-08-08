import { useEffect, useState } from 'react'
import { Toggle } from '@/components/ui/Toggle'
import {
    createServerInvite,
    fetchInstanceSettings,
    updateInstanceSettings,
} from '@/services/api'
import type { InstanceSettings } from '@/services/api'

/**
 * The three server signup-path toggles (manual self-registration, email
 * invite, OAuth-provisioned) — see App\Models\InstanceSetting. Self-fetches
 * via GET /api/settings/instance the same way GlobalRolesSettings/
 * NotificationPreferences self-fetch their own tab content. Only rendered
 * at all when Settings/Index's `can_manage_instance_settings` prop is true
 * — see SettingsController::show/InstanceSettingPolicy.
 */
export function RegistrationSettings() {
    const [settings, setSettings] = useState<InstanceSettings | null>(null)
    const [inviteEmail, setInviteEmail] = useState('')
    const [creatingInvite, setCreatingInvite] = useState(false)
    const [inviteUrl, setInviteUrl] = useState<string | null>(null)

    useEffect(() => {
        fetchInstanceSettings().then(setSettings)
    }, [])

    const toggle = async (field: keyof InstanceSettings, value: boolean) => {
        if (!settings) return
        const next = { ...settings, [field]: value }
        setSettings(next)
        await updateInstanceSettings(next)
    }

    const generateInvite = async () => {
        setCreatingInvite(true)
        setInviteUrl(null)
        try {
            const { url } = await createServerInvite(inviteEmail.trim() || undefined)
            setInviteUrl(url)
            setInviteEmail('')
        } finally {
            setCreatingInvite(false)
        }
    }

    if (!settings) {
        return <p className="text-sm text-text-muted">Loading…</p>
    }

    const allClosed =
        !settings.signup_manual_enabled &&
        !settings.signup_email_invite_enabled &&
        !settings.signup_oauth_enabled

    return (
        <div className="space-y-6">
            <p className="text-sm text-text-muted">
                Each way someone can create an account can be turned on or off independently.
                Turning all three off closes registration entirely — existing accounts can still log in.
            </p>

            {allClosed && (
                <p className="text-sm text-danger bg-third rounded-lg px-4 py-3">
                    All signup paths are currently closed. No new accounts can be created.
                </p>
            )}

            <div className="bg-second rounded-lg divide-y divide-fifth">
                <div className="flex items-center justify-between gap-4 px-6 py-4">
                    <div>
                        <p className="text-sm font-medium text-text-primary">Manual signup</p>
                        <p className="text-xs text-text-muted mt-0.5">
                            Anyone can create an account from the Register page.
                        </p>
                    </div>
                    <Toggle
                        checked={settings.signup_manual_enabled}
                        onChange={(v) => toggle('signup_manual_enabled', v)}
                        label="Manual signup"
                    />
                </div>

                <div className="flex items-center justify-between gap-4 px-6 py-4">
                    <div>
                        <p className="text-sm font-medium text-text-primary">Email invite</p>
                        <p className="text-xs text-text-muted mt-0.5">
                            A new account can be created via a server invite link, with or
                            without manual signup being open.
                        </p>
                    </div>
                    <Toggle
                        checked={settings.signup_email_invite_enabled}
                        onChange={(v) => toggle('signup_email_invite_enabled', v)}
                        label="Email invite"
                    />
                </div>

                <div className="flex items-center justify-between gap-4 px-6 py-4">
                    <div>
                        <p className="text-sm font-medium text-text-primary">OAuth (e.g. Authentik)</p>
                        <p className="text-xs text-text-muted mt-0.5">
                            Logging in via an OAuth provider that doesn't match an existing
                            account creates a new one.
                        </p>
                    </div>
                    <Toggle
                        checked={settings.signup_oauth_enabled}
                        onChange={(v) => toggle('signup_oauth_enabled', v)}
                        label="OAuth signup"
                    />
                </div>
            </div>

            <div className="bg-second rounded-lg p-6">
                <p className="text-sm font-medium text-text-primary mb-1">Create a server invite</p>
                <p className="text-xs text-text-muted mb-4">
                    Works even when email invite is the only open signup path. Leave the
                    email blank for an open, shareable link.
                </p>
                <div className="flex gap-2">
                    <input
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="someone@example.com (optional)"
                        className="flex-1 bg-third border border-sixth rounded px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary transition-colors duration-100"
                    />
                    <button
                        onClick={generateInvite}
                        disabled={creatingInvite}
                        className="px-4 py-2 rounded bg-accent-primary hover:bg-accent-secondary text-inverse text-sm font-medium transition-colors duration-100 disabled:opacity-50"
                    >
                        {creatingInvite ? 'Creating…' : 'Generate link'}
                    </button>
                </div>
                {inviteUrl && (
                    <p className="text-xs text-text-secondary mt-3 break-all">
                        {inviteUrl}
                    </p>
                )}
            </div>
        </div>
    )
}
