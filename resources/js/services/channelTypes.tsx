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
 * `{ channel, currentUser, initialMessages }`; the 'conversation' type's
 * receives `{ conversation, currentUser, initialMessages }`. Each type is
 * only ever backed by one kind of entity, so this never needs to be a
 * discriminated union in practice — typed loosely here rather than forcing
 * generics onto a registry that doesn't need them.
 */
export interface ChannelTypeDescriptor {
    key: string
    label: string
    icon: string
    order: number
    capabilities: string[]
    isTextCapable: boolean
    /** Replaces the channel/conversation's entire main-pane content — omit to show an empty state (see CLAUDE.md: no type gets a default). */
    Content?: ComponentType<any>
    /** Replaces ChannelSidebar's default row — omit for a plain link. Channel-scoped types only. */
    SidebarItem?: ComponentType<{ channel: Channel; active: boolean; currentUser: User }>
}

function TextChannelTypeContent({
    channel, currentUser, initialMessages,
}: {
    channel: Channel
    currentUser: User
    initialMessages: PaginatedMessages | null
}) {
    return (
        <TextChannelContent
            scopeId={channel.id}
            scopeType="channel"
            currentUser={currentUser}
            initialMessages={initialMessages ?? { data: [], has_more: false, next_cursor: null }}
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
        capabilities: ['text.all'],
        isTextCapable: true,
        Content: TextChannelTypeContent,
    },
    text: {
        key: 'text',
        label: 'Text Channels',
        icon: '#',
        order: 1,
        capabilities: ['text.all'],
        isTextCapable: true,
        Content: TextChannelTypeContent,
    },
    voice: {
        key: 'voice',
        label: 'Voice Channels',
        icon: '🔊',
        order: 2,
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
        capabilities: ['text.all', 'voice.all'],
        isTextCapable: true,
        Content: HybridConversationContent,
    },
}

/** The static list a "create channel" type picker sources from — no backend round-trip needed for this milestone. Excludes 'conversation', which is never user-creatable. */
export const KNOWN_CHANNEL_TYPES: ChannelTypeDescriptor[] = Object.values(REGISTRY)
    .filter((d) => d.key !== 'conversation')
    .sort((a, b) => a.order - b.order)

/** A type with no registry entry (unrecognized/future-plugin type) still renders — auto-generated label/icon, same fallback shape as the old channelTypeLabel(). No Content means an explicit empty state, not a default. */
export function channelTypeDescriptor(type: ChannelType): ChannelTypeDescriptor {
    return (
        REGISTRY[type] ?? {
            key: type,
            label: `${type.charAt(0).toUpperCase()}${type.slice(1)} Channels`,
            icon: '#',
            order: 99,
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
