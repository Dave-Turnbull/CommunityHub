import type { ComponentType } from 'react'
import { VoiceChannelPanel } from '@/components/voice/VoiceChannelPanel'
import { VoiceChannelSidebarItem } from '@/components/sidebar/VoiceChannelSidebarItem'
import { HybridConversationContent } from '@/components/chat/HybridConversationContent'
import { TextChannelContent } from '@/components/chat/TextChannelContent'
import { ForumChannelContent } from '@/components/chat/ForumChannelContent'
import { CHANNEL_OVERRIDABLE_PERMISSIONS } from '@/types'
import type { Channel, ChannelType, PaginatedMessages, PermissionKey, User } from '@/types'

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
    /** Mirrors ChannelType::category() — 'standard' or 'mod' today. Drives CreateChannelPanel's grouping. */
    category: string
    /** Mirrors ChannelType::description() — short help text shown in CreateChannelPanel. */
    description: string
    capabilities: string[]
    isTextCapable: boolean
    /**
     * Which of the curated channel-overridable permissions
     * (CHANNEL_OVERRIDABLE_PERMISSIONS) genuinely mean something for this
     * type — hand-set per type, same spirit as `isTextCapable`, rather than
     * derived from `capabilities`' group strings (no JS-side FeatureRegistry
     * exists to expand 'text.all' into atomic keys). Drives
     * `overridablePermissionsFor()` below, which is what
     * ChannelPermissionsPanel actually renders — never show a permission
     * toggle for something this channel type can't do (e.g. Vote on a plain
     * text channel, or Comment on a type whose Content component never
     * renders a comment thread at all).
     */
    supports: ChannelCapabilityTag[]
    /** Replaces the channel/conversation's entire main-pane content — omit to show an empty state (see CLAUDE.md: no type gets a default). */
    Content?: ComponentType<any>
    /** Replaces ChannelSidebar's default row — omit for a plain link. Channel-scoped types only. */
    SidebarItem?: ComponentType<{ channel: Channel; active: boolean; currentUser: User }>
}

/**
 * The small, closed vocabulary `supports` is built from — not 1:1 with
 * backend capability keys (e.g. 'comments' isn't a real Feature capability
 * at all, see ForumChannelType's docblock: it's driven by whether a type's
 * Content component actually renders a comment thread, which 'text'/
 * 'announcement' never do regardless of settings.comments_enabled).
 *
 * 'text' and 'ordinary_send' are deliberately separate, not one tag: an
 * announcement channel has messages/reactions ('text') but never posts via
 * SendMessages ('ordinary_send') — TextMessageService::authorizeSend routes
 * it through PostAnnouncements exclusively, so offering a SendMessages
 * override there would be a dead toggle.
 */
type ChannelCapabilityTag = 'text' | 'ordinary_send' | 'vote' | 'comments' | 'announcement'

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
            canPost={channel.can_post ?? true}
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

// Same as TextChannelTypeContent, plus the inline per-message comment
// popout — driven by this channel's own settings (comments_enabled/
// max_comment_depth), not hardcoded, so a future settings UI change takes
// effect without a frontend change. See docs/comments-and-voting.md.
function MessageAndCommentChannelTypeContent({
    channel, currentUser, initialMessages, initialHighlightMessageId,
}: {
    channel: Channel
    currentUser: User
    initialMessages: PaginatedMessages | null
    initialHighlightMessageId?: string | null
}) {
    const settings = channel.settings ?? {}

    return (
        <TextChannelContent
            scopeId={channel.id}
            scopeType="channel"
            currentUser={currentUser}
            initialMessages={initialMessages ?? EMPTY_PAGE}
            initialHighlightMessageId={initialHighlightMessageId}
            canPost={channel.can_post ?? true}
            placeholder={`Message #${channel.name}`}
            commentsEnabled={(settings.comments_enabled as boolean | undefined) ?? true}
            maxCommentDepth={(settings.max_comment_depth as number | null | undefined) ?? 1}
            emptyState={
                <div className="text-center">
                    <p className="text-3xl mb-2">💬</p>
                    <p className="text-text-primary font-semibold">Welcome to #{channel.name}</p>
                    <p className="text-sm text-text-muted">Send a message, then comment on it.</p>
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
        // Sends via PostAnnouncements, not SendMessages — TextMessageService::
        // authorizeSend routes an 'announcement' channel there specifically and
        // never reaches SendMessages, so offering it here would be a dead
        // override. No 'comments'/'vote' — this type's Content component
        // (TextChannelTypeContent) never renders either.
        supports: ['text', 'announcement'],
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
        // No 'comments' — TextChannelTypeContent never passes commentsEnabled
        // to TextChannelContent, unlike MessageAndCommentChannelTypeContent, so
        // comments are never reachable here regardless of channel settings.
        supports: ['text', 'ordinary_send'],
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
        // No messages exist in a voice channel — none of the curated
        // content-permissions apply; only the always-available
        // manage_channel_visibility (see overridablePermissionsFor()) does.
        supports: [],
        Content: VoiceChannelPanel,
        SidebarItem: VoiceChannelSidebarItem,
    },
    forum: {
        key: 'forum',
        label: 'Forums',
        icon: '📋',
        order: 3,
        category: 'forum',
        description: 'Threaded posts with comments and voting.',
        capabilities: ['text.all', 'vote.all'],
        isTextCapable: false, // does not use useChat/useChannelFocus directly — see ForumChannelContent
        // send_messages gates creating a new top-level post; comment gates
        // replying in a post's detail view (CommentThread) — both real,
        // distinct actions for this type.
        supports: ['text', 'ordinary_send', 'vote', 'comments'],
        Content: ForumChannelContent,
    },
    message_and_comment: {
        key: 'message_and_comment',
        label: 'Message & Comment',
        icon: '💬',
        order: 4,
        category: 'standard',
        description: 'A normal chat where every message can also collect comments.',
        capabilities: ['text.all'],
        isTextCapable: true,
        supports: ['text', 'ordinary_send', 'comments'],
        Content: MessageAndCommentChannelTypeContent,
    },
    conversation: {
        key: 'conversation',
        label: 'Conversations',
        icon: '💬',
        order: 5,
        category: 'standard',
        description: 'A direct or group conversation.',
        capabilities: ['text.all', 'voice.all'],
        isTextCapable: true,
        // Never rendered by ChannelPermissionsPanel — a Conversation isn't a
        // Channel, and DMs don't go through room-role permission overrides at
        // all (see Permission::SendDirectMessages instead). Present for type
        // completeness only.
        supports: ['text'],
        Content: HybridConversationContent,
    },
}

/** The static list a "create channel" type picker sources from — no backend round-trip needed for this milestone. Excludes 'conversation', which is never user-creatable. */
export const KNOWN_CHANNEL_TYPES: ChannelTypeDescriptor[] = Object.values(REGISTRY)
    .filter((d) => d.key !== 'conversation')
    .sort((a, b) => a.order - b.order)

/** Display label per category — shared by CreateChannelPanel's grouping and RoleCard's category checklist. An unrecognized future category falls back to the raw string. */
export const CHANNEL_CATEGORY_LABELS: Record<string, string> = {
    standard: 'Standard',
    forum: 'Forums',
    mod: 'Moderation',
}

const CHANNEL_CATEGORY_ORDER = ['standard', 'forum', 'mod']

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
            supports: [],
        }
    )
}

export function isTextCapableChannelType(type: ChannelType): boolean {
    return channelTypeDescriptor(type).isTextCapable
}

// Which `supports` tag (if any) each curated channel-overridable permission
// needs to be offered at all — `null` means always offered, regardless of
// type (manage_channel_visibility applies to every channel, including a
// voice channel with no messages). Adding a new channel-overridable
// permission is one line here (plus the usual PermissionKey/PERMISSION_LABELS/
// PERMISSION_DESCRIPTIONS/CHANNEL_OVERRIDABLE_PERMISSIONS additions every new
// permission needs) — existing channel types never need touching unless the
// new permission needs a genuinely new `supports` tag.
const OVERRIDABLE_PERMISSION_REQUIREMENTS: Partial<Record<PermissionKey, ChannelCapabilityTag | null>> = {
    manage_channel_visibility: null,
    send_messages: 'ordinary_send',
    react: 'text',
    comment: 'comments',
    vote: 'vote',
    post_announcements: 'announcement',
}

/** The subset of CHANNEL_OVERRIDABLE_PERMISSIONS that actually mean something for $type — see ChannelTypeDescriptor.supports. */
export function overridablePermissionsFor(type: ChannelType): PermissionKey[] {
    const supports = channelTypeDescriptor(type).supports
    return CHANNEL_OVERRIDABLE_PERMISSIONS.filter((permission) => {
        const requirement = OVERRIDABLE_PERMISSION_REQUIREMENTS[permission]
        return requirement === null || requirement === undefined || supports.includes(requirement)
    })
}

/** Known types first (in their preferred order), then any others present — see ChannelSidebar. */
export function orderedTypesIn(types: ChannelType[]): ChannelType[] {
    const present = Array.from(new Set(types))
    return present.sort((a, b) => channelTypeDescriptor(a).order - channelTypeDescriptor(b).order)
}
