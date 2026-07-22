import type { ComponentType } from 'react'
import { VoiceChannelPanel } from '@/components/voice/VoiceChannelPanel'
import { VoiceChannelSidebarItem } from '@/components/voice/VoiceChannelSidebarItem'
import type { Channel, ChannelType, User } from '@/types'

/**
 * Mirrors App\Support\ChannelTypes\ChannelType on the backend — the single
 * per-type descriptor replacing the old scattered TEXT_CAPABLE_CHANNEL_TYPES/
 * CHANNEL_TYPE_ICONS/CHANNEL_TYPE_ORDER/CHANNEL_TYPE_LABELS exports plus
 * Channels/Show.tsx's CUSTOM_CHANNEL_PANELS map and ChannelSidebar's
 * hardcoded `c.type === 'voice'` ternary. A future runtime-installed
 * channel-type plugin would ship its own descriptor (and Panel/SidebarItem
 * components) to register here — see the backend contract's doc comment.
 */
export interface ChannelTypeDescriptor {
    key: string
    label: string
    icon: string
    order: number
    isTextCapable: boolean
    /** Replaces the channel's entire main-pane content in Channels/Show.tsx — omit for the default text-chat UI. */
    Panel?: ComponentType<{ channel: Channel; currentUser: User }>
    /** Replaces ChannelSidebar's default row — omit for a plain link. */
    SidebarItem?: ComponentType<{ channel: Channel; active: boolean }>
}

const REGISTRY: Record<string, ChannelTypeDescriptor> = {
    announcement: {
        key: 'announcement',
        label: 'Announcements',
        icon: '📢',
        order: 0,
        isTextCapable: true,
    },
    text: {
        key: 'text',
        label: 'Text Channels',
        icon: '#',
        order: 1,
        isTextCapable: true,
    },
    voice: {
        key: 'voice',
        label: 'Voice Channels',
        icon: '🔊',
        order: 2,
        isTextCapable: false,
        Panel: VoiceChannelPanel,
        SidebarItem: VoiceChannelSidebarItem,
    },
}

/** The static list a "create channel" type picker sources from — no backend round-trip needed for this milestone. */
export const KNOWN_CHANNEL_TYPES: ChannelTypeDescriptor[] = Object.values(REGISTRY).sort((a, b) => a.order - b.order)

/** A type with no registry entry (unrecognized/future-plugin type) still renders — auto-generated label/icon, same fallback shape as the old channelTypeLabel(). */
export function channelTypeDescriptor(type: ChannelType): ChannelTypeDescriptor {
    return (
        REGISTRY[type] ?? {
            key: type,
            label: `${type.charAt(0).toUpperCase()}${type.slice(1)} Channels`,
            icon: '#',
            order: 99,
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
