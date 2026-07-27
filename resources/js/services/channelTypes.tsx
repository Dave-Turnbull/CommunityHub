import type { ComponentType } from 'react'
import { VoiceChannelPanel } from '@/components/voice/VoiceChannelPanel'
import { VoiceChannelSidebarItem } from '@/components/sidebar/VoiceChannelSidebarItem'
import { HybridConversationContent } from '@/components/chat/HybridConversationContent'
import { TextChannelContent } from '@/components/chat/TextChannelContent'
import type { Channel, ChannelType, PaginatedMessages, User } from '@/types'

/**
 * Mirrors App\Support\ChannelTypes\ChannelType on the backend — the single
 * per-type descriptor covering both Channel-scoped types (text/voice/
 * announcement) and the one Conversation type ('conversation', see
 * HybridConversationType). A future runtime-installed channel-type plugin
 * would ship its own descriptor (and a Content component) to register here.
 *
 * `capabilities` mirrors the backend registration's requested capability/
 * group keys — informational on the frontend today (no JS-side
 * FeatureRegistry/group-expansion exists yet, see CLAUDE.md's "Capabilities"
 * convention on why that's deliberately deferred). `isTextCapable` is
 * still hand-set per type rather than derived from `capabilities`, and is
 * what actually drives useChannelFocus/useChat gating.
 *
 * `Content`'s prop shape depends on which kind of entity this type is ever
 * used for — a Channel-scoped type's Content receives
 * `{ channel, currentUser, initialMessages, initialHighlightMessageId }`;
 * the 'conversation' type's receives the same with `conversation` instead of
 * `channel`. `initialHighlightMessageId` is the "go to message" direct-link
 * target (see CLAUDE.md) — only text-capable Content components need to
 * forward it to TextChannelContent. Each type is only ever backed by one
 * kind of entity, so this never needs to be a discriminated union in
 * practice — typed loosely here rather than forcing generics onto a
 * registry that doesn't need them.
 */
export interface ChannelTypeDescriptor {
    key: string
    label: string
    icon: string
    order: number
    /** Mirrors ChannelType::category() — 'standard' or 'mod' today. Drives CreateChannelModal's grouping. */
    category: string
    /** Mirrors ChannelType::description() — short help text shown in CreateChannelModal. */
    description: string
    capabilities: string[]
    isTextCapable: boolean
    /** Replaces the channel/conversation's entire main-pane content — omit to show an empty state (see CLAUDE.md: no type gets a default). */
    Content?: ComponentType<any>
    /** Replaces ChannelSidebar's default row — omit for a plain link. Channel-scoped types only. */
    SidebarItem?: ComponentType<{ channel: Channel; active: boolean; currentUser: User }>
}

const EMPTY_PAGE: PaginatedMessages = {
    data: [],
    has_older: false,
    older_cursor: null,
    has_newer: false,
    newer_cursor: null,
}

function TextChannelTypeContent({
    channel, currentUser, initialMessages, initialHighlightMessageId,
}: {
    channel: Channel
    currentUser: User
    initialMessages: PaginatedMessages | null
    initialHighlightMessageId?: string | null
}) {
    return (
        <TextChannelContent
            scopeId={channel.id}
            scopeType="channel"
            currentUser={currentUser}
            initialMessages={initialMessages ?? EMPTY_PAGE}
            initialHighlightMessageId={initialHighlightMessageId}
            placeholder={`Message #${channel.name}`}
            emptyState={
                <div className="text-center">
                    <p className="text-3xl mb-2">👋</p>
                    <p className="text-text-primary font-semibold">Welcome to #{channel.name}</p>
                    <p className="text-sm text-text-muted">This is the start of the channel.</p>
                </div>
            }
        />
    )
}

const REGISTRY: Record<string, ChannelTypeDescriptor> = {
    announcement: {
        key: 'announcement',
        label: 'Announcements',
        icon: '📢',
        order: 0,
        category: 'mod',
        description: 'Post updates that only moderators can send.',
        capabilities: ['text.all'],
        isTextCapable: true,
        Content: TextChannelTypeContent,
    },
    text: {
        key: 'text',
        label: 'Text Channels',
        icon: '#',
        order: 1,
        category: 'standard',
        description: 'Send messages, images, and files.',
        capabilities: ['text.all'],
        isTextCapable: true,
        Content: TextChannelTypeContent,
    },
    voice: {
        key: 'voice',
        label: 'Voice Channels',
        icon: '🔊',
        order: 2,
        category: 'standard',
        description: 'Talk with voice in real time.',
        capabilities: ['voice.all'],
        isTextCapable: false,
        Content: VoiceChannelPanel,
        SidebarItem: VoiceChannelSidebarItem,
    },
    conversation: {
        key: 'conversation',
        label: 'Conversations',
        icon: '💬',
        order: 3,
        category: 'standard',
        description: 'A direct or group conversation.',
        capabilities: ['text.all', 'voice.all'],
        isTextCapable: true,
        Content: HybridConversationContent,
    },
}

/** The static list a "create channel" type picker sources from — no backend round-trip needed for this milestone. Excludes 'conversation', which is never user-creatable. */
export const KNOWN_CHANNEL_TYPES: ChannelTypeDescriptor[] = Object.values(REGISTRY)
    .filter((d) => d.key !== 'conversation')
    .sort((a, b) => a.order - b.order)

/** Display label per category — shared by CreateChannelModal's grouping and RoleCard's category checklist. An unrecognized future category falls back to the raw string. */
export const CHANNEL_CATEGORY_LABELS: Record<string, string> = {
    standard: 'Standard',
    mod: 'Moderation',
}

const CHANNEL_CATEGORY_ORDER = ['standard', 'mod']

/** Every distinct category among the user-creatable known types, in CHANNEL_CATEGORY_ORDER then alphabetically — mirrors ChannelTypeRegistry::knownCategories() on the backend. */
export const KNOWN_CHANNEL_CATEGORIES: string[] = Array.from(
    new Set(KNOWN_CHANNEL_TYPES.map((d) => d.category))
).sort((a, b) => {
    const ai = CHANNEL_CATEGORY_ORDER.indexOf(a)
    const bi = CHANNEL_CATEGORY_ORDER.indexOf(b)
    if (ai === -1 && bi === -1) return a.localeCompare(b)
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
})

/** A type with no registry entry (unrecognized/future-plugin type) still renders — auto-generated label/icon, same fallback shape as the old channelTypeLabel(). No Content means an explicit empty state, not a default. */
export function channelTypeDescriptor(type: ChannelType): ChannelTypeDescriptor {
    return (
        REGISTRY[type] ?? {
            key: type,
            label: `${type.charAt(0).toUpperCase()}${type.slice(1)} Channels`,
            icon: '#',
            order: 99,
            category: 'standard',
            description: '',
            capabilities: [],
            isTextCapable: false,
        }
    )
}

export function isTextCapableChannelType(type: ChannelType): boolean {
    return channelTypeDescriptor(type).isTextCapable
}

/** Known types first (in their preferred order), then any others present — see ChannelSidebar. */
export function orderedTypesIn(types: ChannelType[]): ChannelType[] {
    const present = Array.from(new Set(types))
    return present.sort((a, b) => channelTypeDescriptor(a).order - channelTypeDescriptor(b).order)
}
