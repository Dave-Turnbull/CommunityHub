<?php

namespace App\Support\ChannelTypes;

/**
 * A capability *consumer* — requests capabilities defined by one or more
 * App\Support\Capabilities\Feature implementations (built-in or, eventually,
 * a plugin-registered one). This is the extension seam — a future
 * channel-type plugin registers an implementation of this via
 * ChannelTypeRegistry::register() from its own service provider, the same
 * way TextChannelType/VoiceChannelType/AnnouncementChannelType do from
 * ChannelTypeServiceProvider — nothing else in the app needs to change to
 * support it.
 */
interface ChannelType
{
    /** The value stored in channels.type. */
    public function key(): string;

    /** Sidebar group label, e.g. "Voice Channels". */
    public function label(): string;

    public function icon(): string;

    /** Sort weight among known types in ChannelSidebar's grouping. */
    public function order(): int;

    /**
     * The capability/group keys this type requests, e.g. ['text.all'] or
     * ['text.read', 'text.send_text']. No default — an empty array is valid
     * and means this type can do nothing server-side. Resolved through
     * FeatureRegistry::resolveGrants() — see Channel::hasCapability().
     *
     * @return string[]
     */
    public function capabilities(): array;

    /** Seed value for Channel.settings when a channel of this type is created with none supplied. */
    public function defaultSettings(): array;
}
