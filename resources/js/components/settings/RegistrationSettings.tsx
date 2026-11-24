import { useEffect, useState } from 'react'
import { Toggle } from '@/components/ui/Toggle'
import {
    createServerInvite,
    fetchDefaultRoomOptions,
    fetchInstanceSettings,
    fetchServerInvites,
    revokeServerInvite,
    updateDefaultRoom,
    updateInstanceSettings,
} from '@/services/api'
import type { DefaultRoomOption, InstanceSettings } from '@/services/api'
import type { ServerInvite } from '@/types'

/**
 * The three server signup-path toggles (manual self-registration, email
 * invite, OAuth-provisioned) and the optional default room accounts are
 * auto-joined to — see App\Models\InstanceSetting. Self-fetches
 * via GET /api/settings/instance the same way GlobalRolesSettings/
 * NotificationPreferences self-fetch their own tab content. Only rendered
 * at all when Settings/Index's `can_manage_instance_settings` prop is true
 * — see SettingsController::show/InstanceSettingPolicy.
 */
export function RegistrationSettings() {
    const [settings, setSettings] = useState<InstanceSettings | null>(null)
    const [rooms, setRooms] = useState<DefaultRoomOption[]>([])
    const [selectedRoomId, setSelectedRoomId] = useState('')
    const [enrollExisting, setEnrollExisting] = useState(false)
    const [savingRoom, setSavingRoom] = useState(false)
    const [roomNotice, setRoomNotice] = useState<string | null>(null)
    const [inviteEmail, setInviteEmail] = useState('')
    const [creatingInvite, setCreatingInvite] = useState(false)
    const [inviteUrl, setInviteUrl] = useState<string | null>(null)
    const [invites, setInvites] = useState<ServerInvite[] | null>(null)
    const [revokingId, setRevokingId] = useState<string | null>(null)
    const [inviteError, setInviteError] = useState<string | null>(null)

    useEffect(() => {
        fetchInstanceSettings().then((loaded) => {
            setSettings(loaded)
            setSelectedRoomId(loaded.default_room_id ?? '')
        })
        fetchDefaultRoomOptions().then(setRooms)
        fetchServerInvites().then(setInvites)
    }, [])

    const saveDefaultRoom = async (roomId: string | null, addExisting: boolean) => {
        setSavingRoom(true)
        setRoomNotice(null)
        try {
            const saved = await updateDefaultRoom(roomId, addExisting)
            setSettings((current) => current && { ...current, default_room_id: saved.default_room_id })
            setSelectedRoomId(saved.default_room_id ?? '')
            setEnrollExisting(false)
            setRoomNotice(
                !roomId
                    ? 'Default room cleared.'
                    : addExisting
                        ? 'Default room saved. Existing users are being added.'
                        : 'Default room saved.',
            )
        } catch {
            setRoomNotice('Could not save the default room.')
        } finally {
            setSavingRoom(false)
        }
    }

    const toggle = async (
        field: 'signup_manual_enabled' | 'signup_email_invite_enabled' | 'signup_oauth_enabled',
        value: boolean,
    ) => {
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
            setInvites(await fetchServerInvites())
        } finally {
            setCreatingInvite(false)
        }
    }

    const revokeInvite = async (id: string) => {
        setRevokingId(id)
        setInviteError(null)
        try {
            await revokeServerInvite(id)
            setInvites((current) => current && current.filter((invite) => invite.id !== id))
        } catch {
            setInviteError('Could not revoke that invite.')
        } finally {
            setRevokingId(null)
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
                <p className="text-sm font-medium text-text-primary mb-1">Default room</p>
                <p className="text-xs text-text-muted mb-4">
                    New accounts are added to this room as members automatically.
                </p>
                <div className="flex gap-2">
                    <select
                        value={selectedRoomId}
                        onChange={(e) => {
                            setSelectedRoomId(e.target.value)
                            setRoomNotice(null)
                            if (!e.target.value) setEnrollExisting(false)
                        }}
                        aria-label="Default room"
                        className="flex-1 bg-third border border-sixth rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-primary transition-colors duration-100"
                    >
                        <option value="">None</option>
                        {rooms.map((room) => (
                            <option key={room.id} value={room.id}>{room.name}</option>
                        ))}
                    </select>
                    <button
                        onClick={() => saveDefaultRoom(selectedRoomId || null, enrollExisting)}
                        disabled={savingRoom || (selectedRoomId === (settings.default_room_id ?? '') && !enrollExisting)}
                        className="px-4 py-2 rounded bg-accent-primary hover:bg-accent-secondary text-inverse text-sm font-medium transition-colors duration-100 disabled:opacity-50"
                    >
                        {savingRoom ? 'Saving…' : 'Save'}
                    </button>
                    {settings.default_room_id && (
                        <button
                            onClick={() => saveDefaultRoom(null, false)}
                            disabled={savingRoom}
                            className="px-4 py-2 rounded bg-third hover:bg-fourth text-text-primary text-sm font-medium transition-colors duration-100 disabled:opacity-50"
                        >
                            Clear
                        </button>
                    )}
                </div>
                {selectedRoomId && (
                    <label className="flex items-center gap-2 mt-3 text-xs text-text-secondary">
                        <input
                            type="checkbox"
                            checked={enrollExisting}
                            onChange={(e) => setEnrollExisting(e.target.checked)}
                        />
                        Also add all existing users now
                    </label>
                )}
                {roomNotice && (
                    <p className="text-xs text-text-secondary mt-3">{roomNotice}</p>
                )}
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

            <div className="bg-second rounded-lg p-6">
                <p className="text-sm font-medium text-text-primary mb-4">Outstanding invites</p>
                {invites === null ? (
                    <p className="text-xs text-text-muted">Loading…</p>
                ) : invites.length === 0 ? (
                    <p className="text-xs text-text-muted">No outstanding invites.</p>
                ) : (
                    <ul className="divide-y divide-fifth">
                        {invites.map((invite) => (
                            <li key={invite.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                                <div className="min-w-0">
                                    <p className="text-sm text-text-primary truncate">
                                        {invite.email ?? 'Anyone with the link'}
                                    </p>
                                    <p className="text-xs text-text-muted mt-0.5">
                                        Invited by {invite.invited_by.display_name} · expires{' '}
                                        {new Date(invite.expires_at).toLocaleDateString()}
                                    </p>
                                </div>
                                <button
                                    onClick={() => revokeInvite(invite.id)}
                                    disabled={revokingId === invite.id}
                                    className="px-3 py-1.5 rounded bg-third hover:bg-fourth text-text-primary text-sm font-medium transition-colors duration-100 disabled:opacity-50"
                                >
                                    Revoke
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
                {inviteError && (
                    <p role="alert" className="text-xs text-danger mt-3">{inviteError}</p>
                )}
            </div>
        </div>
    )
}
